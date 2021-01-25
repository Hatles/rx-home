/**
 * Represent the current state of Home Assistant.
 */
import {RuntimeError} from "./hass/exceptions";
import {asyncWithTimeout, sleep, TimeoutError} from "./hass/util/ts/async";
import {EventBus} from "./event-bus";
import {Callable} from "./utils/types";
import {RxHomeJob} from "./job";
import PQueue from "p-queue";
import {ValueError} from "./exceptions";
import {ILogger, Logger} from "./logger";
import {ServiceManager} from "./services/service";
import {PluginManager} from "./plugins/plugin-manager";
import {ComponentsPluginDefinition} from "./components/components.plugin";
import {RxHomeConfig} from "./config";

export enum CoreState {
    not_running = "NOT_RUNNING",
    starting = "STARTING",
    running = "RUNNING",
    stopping = "STOPPING",
    final_write = "FINAL_WRITE",
    stopped = "STOPPED",
}

class StopEvent {
    private resolve: (value?: (PromiseLike<number> | number)) => void;

    constructor() {
    }

    wait(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            this.resolve = resolve;
        })
    }

    stop(exitCode: number) {
        this.resolve(exitCode);
    }
}


// How long to wait to log tasks that are blocking
export const BLOCK_LOG_TIMEOUT = 60
// How long to wait until things that run on startup have to finish.
export const TIMEOUT_EVENT_START = 15

// EVENTS
export const EVENT_RX_HOME_CLOSE = "rx_home_close"
export const EVENT_RX_HOME_START = "rx_home_start"
export const EVENT_RX_HOME_STARTED = "rx_home_started"
export const EVENT_RX_HOME_STOP = "rx_home_stop"
export const EVENT_RX_HOME_FINAL_WRITE = "rx_home_final_write"

export const EVENT_CORE_CONFIG_UPDATE = "core_config_updated"

export class RxHomeCore {

    state: CoreState;
    bus: EventBus;
    services: ServiceManager;
    plugins: PluginManager;
    config: RxHomeConfig;

    private _pending_tasks: PQueue;
    private _track_task: boolean;
    private _stopped: StopEvent;

    _logger: ILogger;

    constructor(config?: RxHomeConfig) {
        this._logger = new Logger();

        this._pending_tasks = new PQueue({autoStart: false});
        this._track_task = true

        this.bus = new EventBus(this)
        this.services = new ServiceManager(this);
        this.plugins = new PluginManager(this);
        this.config = config;

        this.state = CoreState.not_running
        this._stopped = null;
    }
    /**
     * Return if Home Assistant is running.
     */
    isRunning(): boolean {
        return CoreState.starting === this.state || CoreState.running === this.state
    }

    // @property
    /**
     * Return if Home Assistant is stopping.
     */
    isStopping(): boolean {
        return CoreState.stopping === this.state
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

        const exitCode = await this._stopped.wait()
        return exitCode
    }

    /**
     * Finalize startup from inside the event loop.

     This method is a coroutine.

     */
    async start() {
        this._logger.info("Starting Home Assistant")

        this.state = CoreState.starting
        this.bus.fire(EVENT_CORE_CONFIG_UPDATE)
        this.bus.fire(EVENT_RX_HOME_START)

        try {
            this._pending_tasks.start();
            // Only block for EVENT_RX_HOME_START listener
            this.stopTrackTasks()
            // await asyncWithTimeout(this.block_till_done, this.timeout.timeout(TIMEOUT_EVENT_START))
            await asyncWithTimeout(this.block_till_done, TIMEOUT_EVENT_START)
        }
        catch (e) {
            if (e instanceof TimeoutError) {
                // this._logger.warning("Something is blocking Home Assistant from wrapping up the start up phase. We're going to continue anyway. Please report the following info at http://bit.ly/2ogP58T : %s", this.config.components.join(', '))
                this._logger.warning("Something is blocking Home Assistant from wrapping up the start up phase. We're going to continue anyway.")
            }
            else {
                throw e;
            }
        }


        // Allow automations to set up the start triggers before changing state
        await sleep(0)

        // load default plugins (components, ...)
        this.loadDefaultPlugins()

        // load config
        this.loadConfig()

        // load and init plugins
        await this.plugins.loadPlugins();
        await this.plugins.initPlugins();

        if (this.state !== CoreState.starting) {
            this._logger.warning(
                "Home Assistant startup has been interrupted. Its state may be inconsistent"
            )
            return
        }

        this.state = CoreState.running
        this.bus.fire(EVENT_CORE_CONFIG_UPDATE)
        this.bus.fire(EVENT_RX_HOME_STARTED)
        // _create_timer(this)
    }

    /**
     * Add a job from within the event loop.

     This method must be run in the event loop.

     target: target to call.
     args: parameters for method to call.

     */
    addJob(
        target: Callable<any, any>, ...args: any[]
    ): Promise<any> {
        if (!target) {
            throw new ValueError("Don't call add_job with null")
        }

        return this.addRxHomeJob(new RxHomeJob(target), ...args)
    }

    // @callback
    /**
     * Add a HassJob from within the event loop.

     This method must be run in the event loop.
     hassjob: HassJob to call.
     args: parameters for method to call.

     */
    addRxHomeJob(
        job: RxHomeJob, ...args: any[]
    ): Promise<any> {
        let task = () => job.target(...args);

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
    createTask<T>(target: Promise<T>): Promise<T> {
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
    trackTasks() {
        this._track_task = true
    }

    // @callback
    /**
     * Stop track tasks so you can't wait for all tasks to be done.
     */
    stopTrackTasks() {
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
                    this._logger.debug("Waiting for tasks")
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
                this._logger.info("stop called twice: ignored")
                return
            }
            if (this.state === CoreState.starting) {
                // This may not work
                this._logger.warning("stop called before startup is complete")
            }
        }

        // stage 1
        this.state = CoreState.stopping
        this.trackTasks()
        this.bus.fire(EVENT_RX_HOME_STOP)
        try {
            // await asyncWithTimeout(this.timeout.timeout(120), this.block_till_done())
            await asyncWithTimeout(() => this.block_till_done(), 120)
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
                this._logger.warning(
                    "Timed out waiting for shutdown stage 1 to complete, the shutdown will continue"
                )
            }
            else {
                throw e;
            }
        }


        // stage 2
        this.state = CoreState.final_write
        this.bus.fire(EVENT_RX_HOME_FINAL_WRITE)
        try {
            // await asyncWithTimeout(this.timeout.timeout(60), this.block_till_done())
            await asyncWithTimeout(() => this.block_till_done(), 60)
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
                this._logger.warning(
                    "Timed out waiting for shutdown stage 2 to complete, the shutdown will continue"
                )
            }
            else {
                throw e;
            }
        }


        // stage 3
        this.state = CoreState.not_running
        this.bus.fire(EVENT_RX_HOME_CLOSE)
        try {
            await asyncWithTimeout(() => this.block_till_done(), 30)
            // async with this.timeout.timeout(30):
            //     await this.block_till_done()
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
                this._logger.warning(
                    "Timed out waiting for shutdown stage 3 to complete, the shutdown will continue"
                )
            }
            else {
                throw e;
            }
        }


        this._pending_tasks.pause();
        this._pending_tasks.clear();

        this.state = CoreState.stopped

        if (this._stopped) {
            this._stopped.stop(exit_code);
        }
    }

    private loadDefaultPlugins() {
        // init default plugins
        this.plugins.registerPlugin(ComponentsPluginDefinition);
    }

    private loadConfig() {
        if (!this.config) {
            this._logger.warning(
                "Configuration is empty"
            )
            return;
        }

        // load plugins
        if (this.config && this.config.plugins && this.config.plugins.length) {
            this.config.plugins.forEach(p => this.plugins.registerPlugin(p.plugin, p.params))
        }
    }
}
