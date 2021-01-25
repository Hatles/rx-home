/**
 * Asyncio utilities.
 */
import {Awaitable, Callable, Coroutine, Future} from "../types";
import {__name__, logging} from "./ts/logging";
import {RuntimeError, ValueError} from "../exceptions";
import {any} from "codelyzer/util/function";
import {boolean} from "../helpers/config_validation";
import {callback} from "@rx-home/core";


const _LOGGER = logging.getLogger(__name__)

/**
 * Submit a coroutine object to a given event loop.

    This method does not provide a way to retrieve the result and
    is intnded for fire-and-forget use. This reduces the
    work involved to fire the function on the loop.

 */
export function fire_coroutine_threadsafe(coro: Coroutine, loop: AbstractEventLoop) {
    ident = loop.__dict__.get("_thread_ident")
    if (ident is !null and ident === threading.get_ident() {
        throw new RuntimeError("Cannot be called from within the event loop")
    }

    if (!coroutines.iscoroutine(coro) {
        throw new TypeError("A coroutine object is required: %s" % coro)
    }

    /**
     * Handle the firing of a coroutine.
     */
    callback() {
        ensure_future(coro, loop=loop)
    }

    loop.call_soon_threadsafe(callback)
}

/**
 * Submit a callback object to a given event loop.

    Return a concurrent.futures.Future to access the result.

 */
export function run_callback_threadsafe<T>(
    loop: AbstractEventLoop, callback: Callable<any, T>, ...args: any[]
): Future<T> {
    const ident = loop.__dict__.get("_thread_ident")
    if (ident && ident === threading.get_ident()) {
        throw new RuntimeError("Cannot be called from within the event loop")
    }

    const future: Future = new Future()

    /**
     * Run callback and store result.
     */
    const run_callback = () => {
        try {
            future.set_result(callback(...args))
        }
        catch (e) {  // pylint: disable=broad-except
            if (future.set_running_or_notify_cancel()) {
                future.set_exception(e)
            }
            else {
                _LOGGER.warning("Exception on lost future: ", exc_info=true)
            }
        }

    }

    loop.call_soon_threadsafe(run_callback)
    return future
}

/**
 * Warn if called inside the event loop.
 */
export function check_loop() {
    let in_loop: boolean;
    try {
        get_running_loop()
        in_loop = true
    }
    catch (e) {
        if (e instanceof RuntimeError) {
        in_loop = false
        }
        else {
            throw e;
        }
    }


    if (!in_loop) {
        return
    }

    let found_frame = null
    let index = null
    let path = null

    for (const frame of reversed(extract_stack())) {
        for (path of ("custom_components/", "homeassistant/components/")) {
            try {
                index = frame.filename.index(path)
                found_frame = frame
                break
            }
            catch (e) {
                if (e instanceof ValueError) {
                    continue
                }
                else {
                    throw e;
                }
            }

        }

        if (found_frame) {
            break
        }
    }

    // Did not source from integration? Hard error.
    if (!found_frame) {
        throw new RuntimeError(
            "Detected I/O inside the event loop. This is causing stability issues. Please report issue"
        )
    }

    const start = index + path.length
    const end = found_frame.filename.index("/", start)

    const integration = found_frame.filename[start:end]

    let extra: string;
    if (path === "custom_components/") {
        extra = " to the custom component author"
    }
    else {
        extra = ""
    }

    _LOGGER.warning(
        "Detected I/O inside the event loop. This is causing stability issues. Please report issue%s for %s doing I/O at %s, line %s: %s",
        extra,
        integration,
        found_frame.filename[index:],
        found_frame.lineno,
        found_frame.line.strip(),
    )
}

/**
 * Protect function from running in event loop.
 */
export function protect_loop(func: Callable): Callable {

    // @functools.wraps(func)
    const protected_loop_func = (*args, **kwargs) {
        check_loop()
        return func(*args, **kwargs)
    }

    return protected_loop_func
}

/**
 * Wrap asyncio.gather to limit the number of concurrent tasks.

    From: https://stackoverflow.com/a/61478547/9127614

 */
export async function gather_with_concurrency(
    limit: number, *tasks: any, return_exceptions: boolean = false
): any {
    semaphore = Semaphore(limit)

    async def sem_task(task: Awaitable<Any>) -> any:
        async with semaphore:
            return await task

    return await gather(
        *(sem_task(task) for task in tasks), return_exceptions=return_exceptions
    )
}
