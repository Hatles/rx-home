/**
 * Logging utilities.
 */
import asyncio
from functools import partial, wraps
import inspect
import logging
import logging.handlers
import queue
import traceback
from typing import any, Callable, Coroutine

from homeassistant.const import EVENT_HOMEASSISTANT_CLOSE
from homeassistant.core import HomeAssistant, callback


/**
 * Filter API password calls.
 */
export class HideSensitiveDataFilter extends logging.Filter {

    /**
     * Initialize sensitive data filter.
     */
    constructor(text: string) {
        super().constructor()
        this.text = text
    }

    /**
     * Hide sensitive data in messages.
     */
    filter(record: logging.LogRecord): boolean {
        record.msg = record.msg.replace(this.text, "*******")

        return true
    }
}

/**
 * Process the log in another thread.
 */
export class HomeAssistantQueueHandler extends logging.handlers.QueueHandler {

    /**
     * Emit a log record.
     */
    emit(record: logging.LogRecord) {
        try {
            this.enqueue(record)
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            this.handleError(record)
            }
            else {
                throw e;
            }
        }

    }

    /**
     *
        Conditionally emit the specified logging record.

        Depending on which filters have been added to the handler, push the new
        records onto the backing Queue.

        The default python logger Handler acquires a lock
        in the parent class which we do not need as
        SimpleQueue is already thread safe.

        See https://bugs.python.org/issue24645

     */
    handle(record: logging.LogRecord): any {
        return_value = this.filter(record)
        if (return_value) {
            this.emit(record)
        }
        return return_value
    }
}

// @callback
/**
 *
    Migrate the existing log handlers to use the queue.

    This allows us to avoid blocking I/O and formatting messages
    in the event loop as log messages are written in another thread.

 */
export function async_activate_log_queue_handler(hass: HomeAssistant) {
    simple_queue = queue.SimpleQueue()  // type: ignore
    queue_handler = HomeAssistantQueueHandler(simple_queue)
    logging.root.addHandler(queue_handler)

    migrated_handlers = []
    for(const handler of logging.root.handlers[:]) {
        if (handler is queue_handler) {
            continue
        }
        logging.root.removeHandler(handler)
        migrated_handlers.append(handler)
    }

    listener = logging.handlers.QueueListener(simple_queue, *migrated_handlers)

    listener.start()

    // @callback
    /**
     * Cleanup handler.
     */
    _async_stop_queue_handler(_: any) {
        logging.root.removeHandler(queue_handler)
        listener.stop()
    }

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_CLOSE, _async_stop_queue_handler)
}

/**
 * Log an exception with additional context.
 */
export function log_exception(format_err: Callable<..., any>, ...args: any[]) {
    module = inspect.getmodule(inspect.stack()[1][0])
    if (module is !null) {
        module_name = module.__name__
    }
    else {
        // If Python is unable to access the sources files, the call stack frame
        // will be missing information, so let's guard.
        // https://github.com/home-assistant/core/issues/24982
        module_name = __name__
    }

    // Do not print the wrapper in the traceback
    frames = inspect.trace(.length) - 1
    exc_msg = traceback.format_exc(-frames)
    friendly_msg = format_err(*args)
    logging.getLogger(module_name).error("%s\n%s", friendly_msg, exc_msg)
}

/**
 * Decorate a callback to catch and log exceptions.
 */
export function catch_log_exception(
    func: Callable<..., any>, format_err: Callable<..., any>, ...args: any[]
): Callable[[], null] {

    // Check for partials to properly determine if coroutine function
    check_func = func
    while (check_func instanceof partial) {
        check_func = check_func.func
    }

    wrapper_func = null
    if (asyncio.iscoroutinefunction(check_func) {

        // @wraps(func)
        /**
         * Catch and log exception.
         */
        async async_wrapper(...args: any[]) {
            try {
                await func(*args)
            }
            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception) {
                log_exception(format_err, *args)
                }
                else {
                    throw e;
                }
            }

        }

        wrapper_func = async_wrapper
    }
    else {

        // @wraps(func)
        /**
         * Catch and log exception.
         */
        wrapper(...args: any[]) {
            try {
                func(*args)
            }
            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception) {
                log_exception(format_err, *args)
                }
                else {
                    throw e;
                }
            }

        }

        wrapper_func = wrapper
    }
    return wrapper_func
}

/**
 * Decorate a coroutine to catch and log exceptions.
 */
export function catch_log_coro_exception(
    target: Coroutine<Any, any, any>, format_err: Callable<..., any>, ...args: any[]
): Coroutine<Any, any, any> {

    /**
     * Catch and log exception.
     */
    async coro_wrapper(...args: any[]): any {
        try {
            return await target
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            log_exception(format_err, *args)
            return null
            }
            else {
                throw e;
            }
        }

    }

    return coro_wrapper()
}

/**
 * Wrap a coroutine to catch and log exceptions.

    The exception will be logged together with a stacktrace of where the
    coroutine was wrapped.

    target: target coroutine.

 */
export function async_create_catching_coro(target: Coroutine): Coroutine {
    trace = traceback.extract_stack()
    wrapped_target = catch_log_coro_exception(
        target,
        lambda *args: "Exception in {} called from\n {}".format(
            target.__name__,
            "".join(traceback.format_list(trace[:-1])),
        ),
    )

    return wrapped_target
}
