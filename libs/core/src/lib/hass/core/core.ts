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
import {Callable, Coroutine, Optional} from "../types";
import {setattr} from "../util/ts/attr";
import {ConfigEntries} from "../config_entries";
import {monotonicMs} from "../util/ts/date";
import {Components, Helpers} from "../loader";
import {TimeoutManager} from "../util/timeout";
import {HassJob} from "./job";
import {CoreState} from "./core-state";
import {ServiceRegistry} from "./service-registry";
import {StateMachine} from "./state-machine";
import {EventBus} from "./event-bus";
import {_LOGGER, BLOCK_LOG_TIMEOUT, CALLABLE_T, TIMEOUT_EVENT_START} from "./constants";
import {Context} from "./context";
import {Config} from "./config";
import {asyncWithTimeout, sleep, TimeoutError} from "../util/ts/async";
import {Clock} from "../util/ts/clock";
import PQueue from "p-queue";
import Timeout = NodeJS.Timeout;

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
    return VALID_ENTITY_ID.test(entity_id)
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

class StopEvent {
    private resolve: (value?: (PromiseLike<void> | void)) => void;

    constructor() {
    }

    wait(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.resolve = resolve;
        })
    }

    stop() {
        this.resolve();
    }
}

/**
 * Root object of the Home Assistant home automation.
 */
export class HomeAssistant {
    // auth: AuthManager;
    // http: HomeAssistantHTTP;
    config_entries: ConfigEntries;

    private _pending_tasks: PQueue;
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
    private _stopped?: StopEvent;
    // Timeout handler for Core/Helper namespace
    timeout: TimeoutManager;

    /**
     * Initialize new Home Assistant object.
     */
    constructor() {
        this._pending_tasks = new PQueue({autoStart: false});
        this._track_task = true
        this.bus = new EventBus(this)
        this.services = new ServiceRegistry(this);
        this.states = new StateMachine(this.bus);
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
     * Home Assistant main entry point.

        Start Home Assistant and block until stopped.

        This method is a coroutine.

     */
    async run(): Promise<number> {
        if (this.state !== CoreState.not_running) {
            throw new RuntimeError("Home Assistant is already running")
        }

        // _stop will set this instead of stopping the loop
        this._stopped = new StopEvent()

        await this.start()

        await this._stopped.wait()
        return this.exit_code
    }

    /**
     * Finalize startup from inside the event loop.

        This method is a coroutine.

     */
    async start() {
        _LOGGER.info("Starting Home Assistant")

        this.state = CoreState.starting
        this.bus.fire(EVENT_CORE_CONFIG_UPDATE)
        this.bus.fire(EVENT_HOMEASSISTANT_START)

        try {
            this._pending_tasks.start();
            // Only block for EVENT_HOMEASSISTANT_START listener
            this.stop_track_tasks()
            // await asyncWithTimeout(this.block_till_done, this.timeout.timeout(TIMEOUT_EVENT_START))
            await asyncWithTimeout(this.block_till_done, TIMEOUT_EVENT_START)
        }
        catch (e) {
            if (e instanceof TimeoutError) {
                _LOGGER.warning("Something is blocking Home Assistant from wrapping up the start up phase. We're going to continue anyway. Please report the following info at http://bit.ly/2ogP58T : %s", this.config.components.join(', '))
            }
            else {
                throw e;
            }
        }


        // Allow automations to set up the start triggers before changing state
        await sleep(0)

        if (this.state !== CoreState.starting) {
            _LOGGER.warning(
                "Home Assistant startup has been intrrupted. Its state may be inconsistent"
            )
            return
        }

        this.state = CoreState.running
        this.bus.fire(EVENT_CORE_CONFIG_UPDATE)
        this.bus.fire(EVENT_HOMEASSISTANT_STARTED)
        _create_timer(this)
    }

    // @callback
    /**
     * Add a job from within the event loop.

        This method must be run in the event loop.

        target: target to call.
        args: parameters for method to call.

     */
    add_job(
        target: Callable<any, any>, ...args: any[]
    ): Optional<Promise<any>> {
        if (!target) {
            throw new ValueError("Don't call add_job with null")
        }

        return this.add_hass_job(new HassJob(target), ...args)
    }

    // @callback
    /**
     * Add a HassJob from within the event loop.

        This method must be run in the event loop.
        hassjob: HassJob to call.
        args: parameters for method to call.

     */
    add_hass_job(
        hassjob: HassJob, ...args: any[]
    ): Optional<Promise<any>> {
        let task = () => hassjob.target(...args);

        // If a task is scheduled
        if (this._track_task) {
            return this._pending_tasks.add(task)
        }
        else {
            return Promise.resolve().then(task)
        }
    }

    // @callback
    /**
     * Create a task from within the eventloop.

        This method must be run in the event loop.

        target: target to call.

     */
    create_task(target: Coroutine): Promise<any> {
        // const task: asyncio.tasks.Task = this.loop.create_task(target)
        const task = () => target;

        if (this._track_task) {
            return this._pending_tasks.add(task)
        }

        return Promise.resolve().then(task)
    }

    // @callback
    /**
     * Track tasks so you can wait for all tasks to be done.
     */
    track_tasks() {
        this._track_task = true
    }

    // @callback
    /**
     * Stop track tasks so you can't wait for all tasks to be done.
     */
    stop_track_tasks() {
        this._track_task = false
    }

    /**
     * Block until all pending work is done.
     */
    async block_till_done() {
        // To flush out any call_soon_threadsafe
        await sleep(0)

        while (this._pending_tasks && this._pending_tasks.pending) {
            try {
                await asyncWithTimeout(() => this._pending_tasks.onIdle(), BLOCK_LOG_TIMEOUT)
            }
            catch (e) {
                if (e instanceof TimeoutError) {
                    _LOGGER.debug("Waiting for tasks")
                }
            }
        }
    }

    /**
     * Stop Home Assistant and shuts down all threads.

        The "force" flag commands stop to proceed regardless of
        Home Assistan't current state. You should not set this flag
        unless you're testing.

        This method is a coroutine.

     */
    async stop(exit_code: number = 0, force: boolean = false) {
        if (!force) {
            // Some tests require stop to run,
            // regardless of the state of the loop.
            if (this.state === CoreState.not_running) {
                return
            }
            if (this.state in [CoreState.stopping, CoreState.final_write]) {
                _LOGGER.info("stop called twice: ignored")
                return
            }
            if (this.state === CoreState.starting) {
                // This may not work
                _LOGGER.warning("stop called before startup is complete")
            }
        }

        // stage 1
        this.state = CoreState.stopping
        this.track_tasks()
        this.bus.fire(EVENT_HOMEASSISTANT_STOP)
        try {
            // await asyncWithTimeout(this.timeout.timeout(120), this.block_till_done())
            await asyncWithTimeout(() => this.block_till_done(), 120)
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
        this.bus.fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
        try {
            // await asyncWithTimeout(this.timeout.timeout(60), this.block_till_done())
            await asyncWithTimeout(() => this.block_till_done(), 60)
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
        this.bus.fire(EVENT_HOMEASSISTANT_CLOSE)
        try {
            await asyncWithTimeout(() => this.block_till_done(), 30)
            // async with this.timeout.timeout(30):
            //     await this.block_till_done()
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


        this._pending_tasks.pause();
        this._pending_tasks.clear();

        this.exit_code = exit_code
        this.state = CoreState.stopped

        if (this._stopped) {
            this._stopped.stop();
        }
    }
}

/**
 * Create a timer that will start on HOMEASSISTANT_START.
 * @param hass
 * @private
 */
function _create_timer(hass: HomeAssistant) {
    let handle: Timeout = null
    const timer_context = new Context();

    /**
     * Schedule a timer tick when the next second rolls around."""
     * @param now
     */
    const schedule_tick = (now: Date) => {
        // nonlocal handle
        const sleep = 1000;
        const target = monotonicMs() + sleep
        handle = setTimeout(() => fire_time_event(target), sleep)
    }

    //callback
    /**
     * """Fire next time event."""
     */
    const fire_time_event = (target: number) => {
        const now = Clock.now()

        hass.bus.fire(
            EVENT_TIME_CHANGED, {ATTR_NOW: now}, null, timer_context, now
        )

        // If we are more than a second late, a tick was missed
        const late = monotonicMs() - target
        if (late > 1000) {
            hass.bus.fire(
                EVENT_TIMER_OUT_OF_SYNC,
                {ATTR_SECONDS: late / 1000, ATTR_MS: late},
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
    const stop_timer = () => {
        if (handle)
        {
            clearTimeout(handle);
        }
    }

    hass.bus.listen_once(EVENT_HOMEASSISTANT_STOP, stop_timer)

    _LOGGER.info("Timer:starting")
    schedule_tick(Clock.now())
}
