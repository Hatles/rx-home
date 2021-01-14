/**
 * Asyncio utilities.
 */
import {Awaitable, Callable, Coroutine} from "../core/types";
import RuntimeError = WebAssembly.RuntimeError;
import {AggregateError} from "./aggregateError";

// from asyncio import Semaphore, coroutines, ensure_future, gather, get_running_loop
// from asyncio.events import AbstractEventLoop
// import concurrent.futures
// import functools
// import logging
// import threading
// from traceback import extract_stack
// from typing import Any, Awaitable, Callable, Coroutine, TypeVar

const _LOGGER = {
    debug: (a, b?, c?, d?) => {},
    info: (a, b?, c?, d?) => {},
    warning: (a, b?, c?, d?) => {},
    exception: (a, b?, c?, d?) => {},
};
// const _LOGGER = logging.getLogger(__name__);

export class TimeoutError extends Error {
}

export const timeout = (timeoutMs: number) => new Promise((resolve, reject) => {
    let id = setTimeout(() => {
        clearTimeout(id);
        reject('Timed out in '+ timeoutMs + 'ms.')
    }, timeoutMs)
});

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const asyncWithTimeout = <T>(promise: () => Promise<T>, timeoutMs: number, failureMessage?: string) => {
    let timeoutHandle: number;
    const timeoutPromise = new Promise<never>((resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new TimeoutError(failureMessage)), timeoutMs);
    });

    return Promise.race([
        promise(),
        timeoutPromise,
    ]).then((result) => {
        clearTimeout(timeoutHandle);
        return result;
    });
}

export const awaitWithTimeout = (promises: Awaitable<any>[], timeoutMs: number, options: {concurrency?: number, stopOnError?: boolean} = {}) => {
    const {concurrency, stopOnError = false} = options;
    return new Promise<Awaitable<any>[]>((resolve, reject) => {
        if (!((Number.isSafeInteger(concurrency) || concurrency === Infinity) && concurrency >= 1)) {
            throw new TypeError(`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`);
        }

        const result = [];
        const errors = [];
        let pending = [...promises];
        const iterator = promises[Symbol.iterator]();
        let isRejected = false;
        let isIterableDone = false;
        let resolvingCount = 0;
        let currentIndex = 0;

        const next = () => {
            if (isRejected) {
                return;
            }

            const nextItem = iterator.next();
            const index = currentIndex;
            currentIndex++;

            if (nextItem.done) {
                isIterableDone = true;

                if (resolvingCount === 0) {
                    if (!stopOnError && errors.length !== 0) {
                        reject(new AggregateError(errors));
                    } else {
                        resolve(pending);
                    }
                }

                return;
            }

            resolvingCount++;

            (async () => {
                const element = await nextItem.value;
                try {
                    result[index] = await element;
                    resolvingCount--;
                    pending = pending.filter(task => task !== element);
                    next();
                } catch (error) {
                    pending = pending.filter(task => task !== element);
                    if (stopOnError) {
                        isRejected = true;
                        reject(error);
                    } else {
                        errors.push(error);
                        resolvingCount--;
                        next();
                    }
                }
            })();
        };

        for (let i = 0; i < concurrency; i++) {
            next();

            if (isIterableDone) {
                break;
            }
        }
    });
}

/**
* Submit a coroutine object to a given event loop.
This method does not provide a way to retrieve the result and
is intended for fire-and-forget use. This reduces the
work involved to fire the function on the loop.
*/
export function fire_coroutine_threadsafe(coro: Coroutine, loop: AbstractEventLoop): void {
    const ident = loop.__dict__.get("_thread_ident")
    if (ident && ident == threading.get_ident()) {
        throw new RuntimeError("Cannot be called from within the event loop")
    }

    if (!coroutines.iscoroutine(coro)) {
        throw new TypeError("A coroutine object is required: %s" % coro)
    }


    /**
    * Handle the firing of a coroutine.
    */
    const callback = () => {
        ensure_future(coro, loop = loop)
    }

    loop.call_soon_threadsafe(callback)
}
/**
 * Submit a callback object to a given event loop.
 Return a concurrent.futures.Future to access the result.
 * @param loop
 * @param callback
 * @param args
 */
export function run_callback_threadsafe<T>(loop: AbstractEventLoop, callback: Callable<T>, ...args: any[]): "concurrent.futures.Future[T]" {
    const ident = loop.__dict__.get("_thread_ident")
    if (ident && ident == threading.get_ident())
    {
        throw RuntimeError("Cannot be called from within the event loop")
    }

    const future: concurrent.futures.Future = concurrent.futures.Future()
    /**
    * Run callback and store result.
    */
    const run_callback = () => {
        try {
            future.set_result(callback(args))
        }
        catch (e) {
            if (future.set_running_or_notify_cancel()) {
                future.set_exception(e)
            }
            else {
                _LOGGER.warning("Exception on lost future: ", exc_info = true)
            }
        }
    }

    loop.call_soon_threadsafe(run_callback)
    return future;
}

/**
* Warn if called inside the event loop.
*/
export function check_loop(): void {
    try {
        get_running_loop()
        in_loop = true
    }
    catch (e) {
        if (e instanceof RuntimeError) {
            in_loop = true
        }
        else {
            throw e;
        }
    }

    if (!in_loop):
        return

    let found_frame = null

    for frame in reversed(extract_stack()):
        for path in ("custom_components/", "homeassistant/components/"):
            try:
                index = frame.filename.index(path)
                found_frame = frame
                break
            except ValueError:
                continue

        if found_frame is not null:
            break

    // Did not source from integration? Hard error.
    if found_frame is null:
        throw new RuntimeError(
            "Detected I/O inside the event loop. This is causing stability issues. Please report issue"
        )

    start = index + len(path)
    end = found_frame.filename.index("/", start)

    integration = found_frame.filename[start:end]

    if path == "custom_components/":
        extra = " to the custom component author"
    else:
        extra = ""

    _LOGGER.warning(
        "Detected I/O inside the event loop. This is causing stability issues. Please report issue%s for %s doing I/O at %s, line %s: %s",
        extra,
        integration,
        found_frame.filename[index:],
        found_frame.lineno,
        found_frame.line.strip()
    )
}

/**
* Protect function from running in event loop.
*/
export function protect_loop(func: Callable): Callable {

    @functools.wraps(func)
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
export function async  gather_with_concurrency(limit: int, *tasks: Any, return_exceptions: bool = False): any {
    semaphore = Semaphore(limit)

    const sem_task = (task: Awaitable<any>) => {
        async
        with semaphore:
        return await task
    };

    return await gather(*(sem_task(task) for task in tasks), return_exceptions=return_exceptions);
}
