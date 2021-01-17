/**
 * Run Home Assistant.
 */
import {type} from "os";
import {warn_use} from "./helpers/frame";
import {Dict, Optional} from "./types";
import {async_setup_hass} from "./bootstrap";
import {__package__, logging} from "./util/ts/logging";

//
// Python 3.8 has significantly less workers by default
// than Python 3.7.  In order to be consistent between
// supported versions, we need to set max_workers.
//
// In most cases the workers are not I/O bound, as they
// are sleeping/blocking waiting for data from integrations
// updating so this number should be higher than the default
// use case.
//
export const MAX_EXECUTOR_WORKERS = 64


// @dataclasses.dataclass
/**
 * Class to hold the information for running Home Assistant.
 */
export class RuntimeConfig {

    config_dir: string
    skip_pip: boolean = false
    safe_mode: boolean = false

    verbose: boolean = false

    log_rotate_days: Optional<number> = null
    log_file: Optional<string> = null
    log_no_color: boolean = false

    debug: boolean = false
    open_ui: boolean = false
}

/**
 * Event loop policy for Home Assistant.
 */
export class HassEventLoopPolicy extends asyncio.DefaultEventLoopPolicy {
    private debug: boolean;

    /**
     * Init the event loop policy.
     */
    constructor(debug: boolean) {
        super()
        this.debug = debug
    }

    // @property
    /**
     * Return name of the loop.
     */
    loop_name(): string {
        return this._loop_factory.__name__  // type: ignore
    }

    /**
     * Get the event loop.
     */
    new_event_loop(): asyncio.AbstractEventLoop {
        const loop: asyncio.AbstractEventLoop = super().new_event_loop()
        loop.set_exception_handler(_async_loop_exception_handler)
        if (this.debug) {
            loop.set_debug(true)
        }

        const executor = new ThreadPoolExecutor(
            thread_name_prefix="SyncWorker", max_workers=MAX_EXECUTOR_WORKERS
        )
        loop.set_default_executor(executor)
        loop.set_default_executor = warn_use(  // type: ignore
            loop.set_default_executor, "sets default executor on the event loop"
        )

        // Shut down executor when we shut down loop
        const orig_close = loop.close

        const close = () => {
            executor.shutdown(wait=true)
            orig_close()
        }

        loop.close = close  // type: ignore

        return loop
    }
}

// @callback
/**
 * Handle all exception inside the core loop.
 */
export function _async_loop_exception_handler(_: any, context: Dict) {
    const kwargs = {}
    const exception = context.get("exception")
    if (exception) {
        kwargs["exc_info"] = (type(exception), exception, exception.__traceback__)
    }

    logging.getLogger(__package__).error(
        "Error doing job: %s", context["message"], **kwargs  // type: ignore
    )
}

/**
 * Set up Home Assistant and run.
 */
export async function setup_and_run_hass(runtime_config: RuntimeConfig): Promise<number> {
    const hass = await async_setup_hass(runtime_config)

    if (!hass) {
        return 1
    }

    return await hass.async_run()
}

/**
 * Run Home Assistant.
 */
export function run(runtime_config: RuntimeConfig): number {
    asyncio.set_event_loop_policy(new HassEventLoopPolicy(runtime_config.debug))
    return asyncio.run(setup_and_run_hass(runtime_config))
}
