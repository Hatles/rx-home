/**
 *
Core components of Home Assistant.

Home Assistant is a Home Automation framework for observing the state
of entities and react to changes.

 */

import {RuntimeError, ValueError} from "../exceptions";
import {
    EVENT_CORE_CONFIG_UPDATE,
    EVENT_HOMEASSISTANT_CLOSE,
    EVENT_HOMEASSISTANT_FINAL_WRITE,
    EVENT_HOMEASSISTANT_START,
    EVENT_HOMEASSISTANT_STARTED,
    EVENT_HOMEASSISTANT_STOP,
    EVENT_TIME_CHANGED,
    EVENT_TIMER_OUT_OF_SYNC
} from "../const";
import {boolean} from "../helpers/config_validation";
import {Iterable} from "../requirements";
import {not} from "rxjs/internal-compatibility";
import {now} from "../util/dt";
import {Awaitable, Callable, Coroutine, Dict, Optional} from "../types";
import {from} from "rxjs";
import {any} from "codelyzer/util/function";
import {__name__, logging} from "../util/ts/logging";
import {getattr, setattr} from "../util/ts/attr";
import {ConfigEntries} from "../config_entries";
import {Component} from "@angular/core";
import {monotonic} from "../util/ts/date";
import {Components, Helpers} from "../loader";
import {TimeoutManager} from "../util/timeout";
import {HassJob, HassJobType} from "./job";
import {CoreState} from "./core-state";
import {ServiceRegistry} from "./service-registry";
import {StateMachine} from "./state-machine";
import {EventBus} from "./event-bus";
import {_LOGGER, BLOCK_LOG_TIMEOUT, CALLABLE_T, TIMEOUT_EVENT_START} from "./constants";
import {fire_coroutine_threadsafe} from "../util/async_";
import {Context} from "./context";
import {Config} from "./config";
import {async_register_signal_handling} from "../helpers/signal";
import {asyncWithTimeout} from "../util/ts/async";

// block_async_io.enable()

/**
 * Split a state entity_id int domain, object_id.
 */
export function split_entity_id(entity_id: string): string[] {
    return entity_id.split(".", 1)
}

export const VALID_ENTITY_ID = /^(?!.+__)(?!_)[\da-z_]+(?<!_)\.(?!_)[\da-z_]+(?<!_)$/


/**
 * Test if an entity ID is a valid format.

    Format: <domain>.<entity> where both are slugs.

 */
export function valid_entity_id(entity_id: string): boolean {
    return VALID_ENTITY_ID.match(entity_id)
}

/**
 * Test if a state is valid.
 */
export function valid_state(state: string): boolean {
    return state.length < 256
}

/**
 * Annotation to mark method as safe to call from within the event loop.
 */
export function callback(func: CALLABLE_T): CALLABLE_T {
    setattr(func, "_hass_callback", true)
    return func
}

/**
 * Check if function is safe to be called in the event loop.
 */
export function is_callback(func: Callable<..., any>): boolean {
    return getattr(func, "_hass_callback", false)
}


/**
 * Determine the job type from the callable.
 */
export function _get_callable_job_type(target: Callable): HassJobType {
    // Check for partials to properly determine if coroutine function
    let check_target = target
    while (check_target instanceof functools.partial) {
        check_target = check_target.func
    }

    if (asyncio.iscoroutinefunction(check_target) {
        return HassJobType.Coroutinefunction
    }
    if (is_callback(check_target) {
        return HassJobType.Callback
    }
    return HassJobType.Executor
}


/**
 * Root object of the Home Assistant home automation.
 */
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
    components: Components;
    helpers: Helpers;
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
        this.components = new Components(this);
        this.helpers = new Helpers(this);
        // This is a dictionary that any component can store any data on.
        this.data = {}
        this.state = CoreState.not_running
        this.exit_code = 0
        // If not null, use to signal end-of-loop
        this._stopped = null;
        // Timeout handler for Core/Helper namespace
        this.timeout = new TimeoutManager();
    }

    // @property
    /**
     * Return if Home Assistant is running.
     */
    is_running(): boolean {
        return CoreState.starting === this.state || CoreState.running === this.state
    }

    // @property
    /**
     * Return if Home Assistant is stopping.
     */
    is_stopping(): boolean {
        return CoreState.stopping === this.state || CoreState.final_write === this.state
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

     */
    async async_run(attach_signals: boolean = true): Promise<number> {
        if (this.state !== CoreState.not_running) {
            throw new RuntimeError("Home Assistant is already running")
        }

        // _async_stop will set this instead of stopping the loop
        this._stopped = asyncio.Event()

        await this.async_start()
        if (attach_signals) {
            async_register_signal_handling(this)
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
            async with this.timeout.async_timeout(TIMEOUT_EVENT_START):
                await this.async_block_till_done()
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            _LOGGER.warning(
                "Something is blocking Home Assistant from wrapping up the "
                "start up phase. We're going to continue anyway. Please "
                "report the following info at http://bit.ly/2ogP58T : %s",
                ", ".join(this.config.components),
            )
            }
            else {
                throw e;
            }
        }


        // Allow automations to set up the start triggers before changing state
        await asyncio.sleep(0)

        if (this.state !== CoreState.starting) {
            _LOGGER.warning(
                "Home Assistant startup has been intrrupted. "
                "Its state may be inconsistent"
            )
            return
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

     */
    add_job(target: Callable<any, any>, ...args: any[]) {
        if (!target) {
            throw new ValueError("Don't call add_job with null")
        }
        this.loop.call_soon_threadsafe(this.async_add_job, target, *args)
    }

    // @callback
    /**
     * Add a job from within the event loop.

        This method must be run in the event loop.

        target: target to call.
        args: parameters for method to call.

     */
    async_add_job(
        target: Callable<any, any>, ...args: any[]
    ): Optional<asyncio.Future> {
        if (!target) {
            throw new ValueError("Don't call async_add_job with null")
        }

        if (asyncio.iscoroutine(target)) {
            return this.async_create_task(cast(Coroutine, target))
        }

        return this.async_add_hass_job(new HassJob(target), ...args)
    }

    // @callback
    /**
     * Add a HassJob from within the event loop.

        This method must be run in the event loop.
        hassjob: HassJob to call.
        args: parameters for method to call.

     */
    async_add_hass_job(
        hassjob: HassJob, ...args: any[]
    ): Optional<asyncio.Future> {
        let task;
        if (hassjob.job_type === HassJobType.Coroutinefunction) {
            task = this.loop.create_task(hassjob.target(...args))
        }
        else if (hassjob.job_type === HassJobType.Callback) {
            this.loop.call_soon(hassjob.target, ...args)
            return null
        }
        else {
            task = this.loop.run_in_executor(  // type: ignore
                null, hassjob.target, ...args
            )
        }

        // If a task is scheduled
        if (this._track_task) {
            this._pending_tasks.push(task)
        }

        return task
    }

    // @callback
    /**
     * Create a task from within the eventloop.

        This method must be run in the event loop.

        target: target to call.

     */
    async_create_task(target: Coroutine): asyncio.tasks.Task {
        const task: asyncio.tasks.Task = this.loop.create_task(target)

        if (this._track_task) {
            this._pending_tasks.push(task)
        }

        return task
    }

    // @callback
    /**
     * Add an executor job from within the event loop.
     */
    async_add_executor_job<T>(
        target: Callable<any, T>, ...args: any[]
    ): Awaitable<T> {
        const task = this.loop.run_in_executor(null, target, ...args)

        // If a task is scheduled
        if (this._track_task) {
            this._pending_tasks.push(task)
        }

        return task
    }

    // @callback
    /**
     * Track tasks so you can wait for all tasks to be done.
     */
    async_track_tasks() {
        this._track_task = true
    }

    // @callback
    /**
     * Stop track tasks so you can't wait for all tasks to be done.
     */
    async_stop_track_tasks() {
        this._track_task = false
    }

    // @callback
    /**
     * Run a HassJob from within the event loop.

        This method must be run in the event loop.

        hassjob: HassJob
        args: parameters for method to call.

     */
    async_run_hass_job(
        hassjob: HassJob, ...args: any[]
    ): Optional<asyncio.Future> {
        if (hassjob.job_type === HassJobType.Callback) {
            hassjob.target(...args)
            return null
        }

        return this.async_add_hass_job(hassjob, ...args)
    }

    // @callback
    /**
     * Run a job from within the event loop.

        This method must be run in the event loop.

        target: target to call.
        args: parameters for method to call.

     */
    async_run_job(
        target: Callable<any, (null | Awaitable)>, ...args: any[]
    ): Optional<asyncio.Future> {
        if (asyncio.iscoroutine(target)) {
            return this.async_create_task(cast(Coroutine, target))
        }

        return this.async_run_hass_job(new HassJob(target), ...args)
    }

    /**
     * Block until all pending work is done.
     */
    block_till_done() {
        asyncio.run_coroutine_threadsafe(
            this.async_block_till_done(), this.loop
        ).result()
    }

    /**
     * Block until all pending work is done.
     */
    async async_block_till_done() {
        // To flush out any call_soon_threadsafe
        await asyncio.sleep(0)
        let start_time: Optional<number> = null

        while (this._pending_tasks) {
            const pending: Awaitable[] = this._pending_tasks.filter(task => !task.done())
            this._pending_tasks.splice(0, this._pending_tasks.length); // clear
            if (pending) {
                await this._await_and_log_pending(pending)

                if (!start_time) {
                    // Avoid calling monotonic() until we know
                    // we may need to start logging blocked tasks.
                    start_time = 0
                }
                else if (start_time === 0) {
                    // If we have waited twice then we set the start
                    // time
                    start_time = monotonic()
                }
                else if (monotonic() - start_time > BLOCK_LOG_TIMEOUT) {
                    // We have waited at least three loops and new tasks
                    // continue to block. At this point we start
                    // logging all waiting tasks.
                    for(const task of pending) {
                        _LOGGER.debug("Waiting for task: %s", task)
                    }
                }
            }
            else {
                await asyncio.sleep(0)
            }
        }
    }

    /**
     * Await and log tasks that take a long time.
     */
    async _await_and_log_pending(pending: Awaitable<any>) {
        let wait_time = 0
        while (pending) {
            const {_, pending} = await asyncio.wait(pending, timeout=BLOCK_LOG_TIMEOUT)
            if (!pending) {
                return
            }
            wait_time += BLOCK_LOG_TIMEOUT
            for(const task of pending) {
                _LOGGER.debug("Waited %s seconds for task: %s", wait_time, task)
            }
        }
    }

    /**
     * Stop Home Assistant and shuts down all threads.
     */
    stop() {
        if (this.state === CoreState.not_running) {
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
            if (this.state === CoreState.not_running) {
                return
            }
            if (this.state in [CoreState.stopping, CoreState.final_write]) {
                _LOGGER.info("async_stop called twice: ignored")
                return
            }
            if (this.state === CoreState.starting) {
                // This may not work
                _LOGGER.warning("async_stop called before startup is complete")
            }
        }

        // stage 1
        this.state = CoreState.stopping
        this.async_track_tasks()
        this.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
        try {
            await asyncWithTimeout(this.timeout.async_timeout(120), this.async_block_till_done())
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            _LOGGER.warning(
                "Timed out waiting for shutdown stage 1 to complete, the shutdown will continue"
            )
            }
            else {
                throw e;
            }
        }


        // stage 2
        this.state = CoreState.final_write
        this.bus.async_fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
        try {
            async with this.timeout.async_timeout(60):
                await this.async_block_till_done()
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            _LOGGER.warning(
                "Timed out waiting for shutdown stage 2 to complete, the shutdown will continue"
            )
            }
            else {
                throw e;
            }
        }


        // stage 3
        this.state = CoreState.not_running
        this.bus.async_fire(EVENT_HOMEASSISTANT_CLOSE)
        try {
            async with this.timeout.async_timeout(30):
                await this.async_block_till_done()
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            _LOGGER.warning(
                "Timed out waiting for shutdown stage 3 to complete, the shutdown will continue"
            )
            }
            else {
                throw e;
            }
        }


        this.exit_code = exit_code
        this.state = CoreState.stopped

        if (this._stopped is !null) {
            this._stopped.set()
        }
    }
}


/**
 * Create a timer that will start on HOMEASSISTANT_START.
 */
export function _async_create_timer(hass: HomeAssistant) {
    let handle = null
    const timer_context = new Context()

    /**
     * Schedule a timer tick when the next second rolls around.
     */
    const schedule_tick = (now: Date) => {
        const slp_seconds = 1 - (now.microsecond / 10 ** 6)
        const target = monotonic() + slp_seconds
        handle = hass.loop.call_later(slp_seconds, fire_time_event, target)
    }

    // @callback
    /**
     * Fire next time event.
     */
    const fire_time_event = (target: number) => {
        const now = utcnow()

        hass.bus.async_fire(
            EVENT_TIME_CHANGED, {ATTR_NOW: now}, time_fired=now, context=timer_context
        )

        // If we are more than a second late, a tick was missed
        late = monotonic() - target
        if (late > 1) {
            hass.bus.async_fire(
                EVENT_TIMER_OUT_OF_SYNC,
                {ATTR_SECONDS: late},
                time_fired=now,
                context=timer_context,
            )
        }

        schedule_tick(now)
    }

    // @callback
    /**
     * Stop the timer.
     */
    stop_timer(event: Event) {
        if (handle) {
            handle.cancel()
        }
    }

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, stop_timer)

    _LOGGER.info("Timer:starting")
    schedule_tick(utcnow())
}
