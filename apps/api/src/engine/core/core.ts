/**
 * Root object of the Home Assistant home automation.
 */
import {CoreState} from "./core-state";
import {Awaitable, Callable, Coroutine, Optional} from "./types";
import {EventBus} from "./event-bus";
import {ServiceRegistry} from "./service-registry";
import {StateMachine} from "./state-machine";
import {Config} from "./config";
import {_LOGGER, BLOCK_LOG_TIMEOUT, TIMEOUT_EVENT_START} from "./constants";
import {asyncWithTimeout, fire_coroutine_threadsafe, sleep, TimeoutError} from "../utils/async";
import {HassJob, HassJobType} from "./job";
import {ValueError} from "../exceptions";
import {
    EVENT_CORE_CONFIG_UPDATE, EVENT_HOMEASSISTANT_CLOSE, EVENT_HOMEASSISTANT_FINAL_WRITE,
    EVENT_HOMEASSISTANT_START,
    EVENT_HOMEASSISTANT_STARTED,
    EVENT_HOMEASSISTANT_STOP, EVENT_TIME_CHANGED, EVENT_TIMER_OUT_OF_SYNC
} from "../constants";
import {Context} from "./context";
import {Clock} from "../utils/clock";
import {monotonic} from "../utils/date";

block_async_io.enable()

export class HomeAssistant {
    auth: AuthManager;
    http: HomeAssistantHTTP;
    config_entries: ConfigEntries;

    loop: Loop; // = asyncio.get_running_loop();
    private _pending_tasks: asyncio.tasks.Task[] = [];
    private _track_task: boolean;
    bus: EventBus;
    services: ServiceRegistry;
    states: StateMachine;
    config: Config;
    components: Component[];
    helpers: Helpers[];
    // This is a dictionary that any component can store any data on.
    data: any = {};
    state: CoreState;
    exit_code: number;
    // If not null, use to signal end-of-loop
    private _stopped?: asyncio.Event;
    // Timeout handler for Core/Helper namespace
    timeout: TimeoutManager;

    /**
     * Initialize new Home Assistant object.
     */
    constructor() {
        this.loop = asyncio.get_running_loop();
        this._pending_tasks = [];
        this._track_task = true
        this.bus = new EventBus(this)
        this.services = new ServiceRegistry(this);
        this.states = new StateMachine(this.bus, this.loop);
        this.config = new Config(this);
        this.components = loader.Components(this);
        this.helpers = loader.Helpers(this);
        // This is a dictionary that any component can store any data on.
        this.data = {}
        this.state = CoreState.not_running
        this.exit_code = 0
        // If not null, use to signal end-of-loop
        this._stopped = null;
        // Timeout handler for Core/Helper namespace
        this.timeout = new TimeoutManager();
    }

    //property
    /**
     * Return if Home Assistant is running.
     * @param self
     */
    is_running(): boolean {
        return this.state === CoreState.starting || this.state === CoreState.running;
    }

    //property
    /**
     * Return if Home Assistant is stopping.
     */
    is_stopping(): boolean {
        return this.state === CoreState.stopping || this.state === CoreState.final_write;
    }

    /**
     * Start Home Assistant.

     Note: This function is only used for testing.
     For regular use, use "await hass.run()".

     */
    start(): number {
        // Register the async start
        fire_coroutine_threadsafe(this.async_start(), this.loop)

        // Run forever
        // Block until stopped
        _LOGGER.info("Starting Home Assistant core loop")
        this.loop.run_forever()
        return this.exit_code
    }

    /**
     * Home Assistant main entry point.

     Start Home Assistant and block until stopped.

     This method is a coroutine.

     * @param attach_signals
     */
    async async_run(attach_signals: boolean = true): Promise<number> {
        if (this.state != CoreState.not_running) {
            throw new RuntimeError("Home Assistant is already running")
        }

        // _async_stop will set this instead of stopping the loop
        this._stopped = asyncio.Event()

        await this.async_start()
        if (attach_signals) {// pylint: disable=import-outside-toplevel
            const async_register_signal_handling = await import('homeassistant.helpers.signal'); // todo
            async_register_signal_handling()
        }

        await this._stopped.wait()
        return this.exit_code
    }

    /**
     * Finalize startup from inside the event loop.

     This method is a coroutine.

     */
    async async_start() {

        _LOGGER.info("Starting Home Assistant")
        setattr(this.loop, "_thread_ident", threading.get_ident())

        this.state = CoreState.starting
        this.bus.async_fire(EVENT_CORE_CONFIG_UPDATE)
        this.bus.async_fire(EVENT_HOMEASSISTANT_START)

        try {
            // Only block for EVENT_HOMEASSISTANT_START listener
            this.async_stop_track_tasks()
            await asyncWithTimeout(() => this.async_block_till_done(), TIMEOUT_EVENT_START)
        } catch (e) {
            if(e instanceof TimeoutError) {
                _LOGGER.warning(
                    "Something is blocking Home Assistant from wrapping up the " +
                    "start up phase. We're going to continue anyway. Please " +
                    "report the following info at http://bit.ly/2ogP58T : %s",
                        ", ".join(this.config.components.),
                )
            }
            else {
                throw e;
            }
        }

        // Allow automations to set up the start triggers before changing state
        await sleep(0)

        if (this.state != CoreState.starting) {
            _LOGGER.warning(
                "Home Assistant startup has been interrupted. Its state may be inconsistent"
            );

            return;
        }

        this.state = CoreState.running
        this.bus.async_fire(EVENT_CORE_CONFIG_UPDATE)
        this.bus.async_fire(EVENT_HOMEASSISTANT_STARTED)

        _async_create_timer(this)
    }

    /**
     * Add job to the executor pool.

     target: target to call.
     args: parameters for method to call.

     * @param target
     * @param args
     */
    add_job(target: Callable, ...args: any[]): void {

        if (!target) {
            throw new ValueError("Don't call add_job with null")
        }
        this.loop.call_soon_threadsafe(this.async_add_job, target, args)
    }

    //callback
    /**
     * Add a job from within the event loop.

     This method must be run in the event loop.

     target: target to call.
     args: parameters for method to call.

     * @param target
     * @param args
     */
    async_add_job(target: Callable, ...args: any[]): Optional<asyncio.Future> {

        if (!target) {
            throw new ValueError("Don't call async_add_job with null")
        }

        if (asyncio.iscoroutine(target)) {
            return this.async_create_task(target as Coroutine)
        }

        return this.async_add_hass_job(new HassJob(target), args)
    }

    //callback
    /**
     * Add a HassJob from within the event loop.

     This method must be run in the event loop.
     hassjob: HassJob to call.
     args: parameters for method to call.

     * @param hassjob
     * @param args
     */
    async_add_hass_job(hassjob: HassJob, ...args: any[]): Optional<asyncio.Future> {
        let task;

        if (hassjob.job_type == HassJobType.Coroutinefunction) {
            task = this.loop.create_task(hassjob.target(args))
        }
        else if (hassjob.job_type == HassJobType.Callback) {
            this.loop.call_soon(hassjob.target, args)
            return null;
        }
        else
        {
            task = this.loop.run_in_executor(null, hassjob.target, args)
        }

        // If a task is scheduled
        if (this._track_task) {
            this._pending_tasks.push(task)
        }

        return task
    }

    //callback
    /**
     * Create a task from within the eventloop.

     This method must be run in the event loop.

     target: target to call.

     * @param target
     */
    async_create_task(target: Coroutine): asyncio.tasks.Task {
        const task: asyncio.tasks.Task = this.loop.create_task(target)

        if (this._track_task) {
            this._pending_tasks.push(task)
        }

        return task
    }

    //callback
    /**
     * Add an executor job from within the event loop.
     */
    async_add_executor_job<T>(target: Callable<T>, ...args: any[]): Awaitable<T> {
        const task = this.loop.run_in_executor(null, target, args)

        // If a task is scheduled
        if (this._track_task) {
            this._pending_tasks.push(task)
        }

        return task
    }

    //callback
    /**
     *  Track tasks so you can wait for all tasks to be done.
     */
    async_track_tasks(): void {
        this._track_task = true
    }

    //callback
    /**
     * Stop track tasks so you can't wait for all tasks to be done.
     */
    async_stop_track_tasks(): void {
        this._track_task = false
    }

    //callback
    /**
     * Run a HassJob from within the event loop.

     This method must be run in the event loop.

     hassjob: HassJob
     args: parameters for method to call.

     */
    async_run_hass_job(hassjob: HassJob, ...args: any[]): Optional<asyncio.Future> {

        if (hassjob.job_type === HassJobType.Callback) {
            hassjob.target(args)
            return null
        }

        return this.async_add_hass_job(hassjob, args)
    }

    //callback
    /**
     * Run a job from within the event loop.

     This method must be run in the event loop.

     target: target to call.
     args: parameters for method to call.

     */
    async_run_job(target: Callable<null | Awaitable>, ...args: any[]): Optional<asyncio.Future> {
        if (asyncio.iscoroutine(target)) {
            return this.async_create_task(target as Coroutine)
        }

        return this.async_run_hass_job(new HassJob(target), args)
    }

    /**
     * Block until all pending work is done.
     */
    block_till_done(): void {
        asyncio.run_coroutine_threadsafe(
            this.async_block_till_done(), this.loop
        ).result()
    }

    /**
     * Block until all pending work is done.
     */
    async async_block_till_done() {
        // To flush out any call_soon_threadsafe
        await sleep(0)
        let start_time: Optional<number> = null

        while (this._pending_tasks.length)
            const pending = this._pending_tasks.filter(task => task.done());
            this._pending_tasks = [];
            if (pending.length) {
                await this._await_and_log_pending(pending)

                if (!start_time) {
                    // Avoid calling monotonic() until we know
                    // we may need to start logging blocked tasks.
                    start_time = 0
                }
                else if (start_time == 0) {
                    // If we have waited twice then we set the start time
                    start_time = monotonic()
                }
                else if (monotonic() - start_time > BLOCK_LOG_TIMEOUT) {
                    // We have waited at least three loops and new tasks
                    // continue to block. At this point we start
                    // logging all waiting tasks.
                    pending.forEach(task => _LOGGER.debug("Waiting for task: %s", task));
                }
            }
            else {
                await sleep(0)
            }
    }

    /**
     * Await and log tasks that take a long time.
     * @param pending
     * @private
     */
    async _await_and_log_pending(pending: Iterable<Awaitable<any>>) {
        let wait_time = 0
        while (pending) {
            pending = await asyncio.wait(pending, timeout=BLOCK_LOG_TIMEOUT)
            if (!pending) {
                return;
            }
            wait_time += BLOCK_LOG_TIMEOUT;
            for (let task of pending) {
                _LOGGER.debug("Waited %s seconds for task: %s", wait_time, task)
            }
        }
    }

    /**
     * Stop Home Assistant and shuts down all threads.
     */
    stop(): void {
        if (this.state == CoreState.not_running)  // just ignore
        {
            return
        }
        fire_coroutine_threadsafe(this.async_stop(), this.loop)
    }

    /**
     * Stop Home Assistant and shuts down all threads.

     The "force" flag commands async_stop to proceed regardless of
     Home Assistan't current state. You should not set this flag
     unless you're testing.

     This method is a coroutine.
     */
    async async_stop(exit_code: number = 0, force: boolean = false) {

        if (!force) {
            // Some tests require async_stop to run,
            // regardless of the state of the loop.
            if (this.state == CoreState.not_running)  // just ignore
            {
                return
            }
            if (this.state in [CoreState.stopping, CoreState.final_write]) {
                _LOGGER.info("async_stop called twice: ignored")
                return
            }
            if (this.state == CoreState.starting) {
                // This may not work
                _LOGGER.warning("async_stop called before startup is complete")
            }
        }

        // stage 1
        this.state = CoreState.stopping
        this.async_track_tasks()
        this.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
        try {
            await asyncWithTimeout(() => this.async_block_till_done(), 120);
        }
        catch (e) {
            if (e instanceof TimeoutError) {
                _LOGGER.warning("Timed out waiting for shutdown stage 1 to complete, the shutdown will continue")
            }
            else {
                throw e;
            }
        }

        // stage 2
        this.state = CoreState.final_write
        this.bus.async_fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
        try {
            await asyncWithTimeout(() => this.async_block_till_done(), 60);
        }
        catch (e) {
            if (e instanceof TimeoutError) {
                _LOGGER.warning("Timed out waiting for shutdown stage 2 to complete, the shutdown will continue")
            }
            else {
                throw e;
            }
        }


        // stage 3
        this.state = CoreState.not_running
        this.bus.async_fire(EVENT_HOMEASSISTANT_CLOSE)
        try {
            await asyncWithTimeout(() => this.async_block_till_done(), 30);
        }
        catch (e) {
            if (e instanceof TimeoutError) {
                _LOGGER.warning("Timed out waiting for shutdown stage 3 to complete, the shutdown will continue")
            }
            else {
                throw e;
            }
        }


        this.exit_code = exit_code
        this.state = CoreState.stopped

        if (this._stopped) {
            this._stopped.set()
        }
    }
}

/**
 * Create a timer that will start on HOMEASSISTANT_START.
 * @param hass
 * @private
 */
function _async_create_timer(hass: HomeAssistant) {
    let handle = null
    const timer_context = new Context();

    /**
     * Schedule a timer tick when the next second rolls around."""
     * @param now
     */
    const schedule_tick = (now: Date) => {
        // nonlocal handle
        const slp_seconds = 1 - (now.getMilliseconds() / 10 ** 3)
        const target = monotonic() + slp_seconds
        handle = hass.loop.call_later(slp_seconds, fire_time_event, target)
    }

    //callback
    /**
     * """Fire next time event."""
     */
    const fire_time_event = (target: number) => {
        const now = Clock.now()

        hass.bus.async_fire(
            EVENT_TIME_CHANGED, {ATTR_NOW: now}, null, timer_context, now
        )

        // If we are more than a second late, a tick was missed
        const late = monotonic() - target
        if (late > 1) {
            hass.bus.async_fire(
                EVENT_TIMER_OUT_OF_SYNC,
                {ATTR_SECONDS: late},
                null,
                timer_context,
                now
            )
        }

        schedule_tick(now)
    }

    //callback
    /**
     * """Stop the timer."""
     */
    const stop_timer = (event: Event) => {
        if (handle)
        {
            handle.cancel()
        }
    }

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, stop_timer)

    _LOGGER.info("Timer:starting")
    schedule_tick(Clock.now())
}
