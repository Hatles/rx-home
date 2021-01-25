/**
 * Helper methods for various modules.
 */
import asyncio
from datetime import datetime, timedelta
import enum
from functools import wraps
import random
import re
import socket
import string
import threading
from types import MappingProxyType
from typing import (
    any,
    Callable,
    Coroutine,
    Iterable,
    KeysView,
    Optional,
    TypeVar,
    Union,
)

import slugify as unicode_slug

from .dt import as_local, utcnow

export const T = TypeVar("T")
export const U = TypeVar("U")  // pylint: disable=invalid-name
export const ENUM_T = TypeVar("ENUM_T", bound=enum.Enum)  // pylint: disable=invalid-name

export const RE_SANITIZE_FILENAME = re.compile(r"(~|\.\.|/|\\)")
export const RE_SANITIZE_PATH = re.compile(r"(~|\.(\.)+)")


def sanitize_filename(filename: string) -> string:
    r"""Sanitize a filename by removing .. / and \\."""
    return RE_SANITIZE_FILENAME.sub("", filename)


/**
 * Sanitize a path by removing ~ and ..
 */
export function sanitize_path(path: string): string {
    return RE_SANITIZE_PATH.sub("", path)
}

/**
 * Slugify a given text.
 */
export function slugify(text: string, *, separator: string = "_"): string {
    return unicode_slug.slugify(text, separator=separator)
}

/**
 * Help creating a more readable string representation of objects.
 */
export function repr_helper(inp: any): string {
    if inp instanceof (dict, MappingProxyType):
        return ", ".join(
           `${repr_helper(key)}=${repr_helper(item)}` for key, item in inp.items()
        )
    if (inp instanceof datetime) {
        return as_local(inp).isoformat()
    }

    return string(inp)
}

/**
 * Convert value to to_type, returns default if fails.
 */
export function convert(
    value: Optional<T>, to_type: Callable[[T], U], default: Optional<U> = null
): Optional<U> {
    try {
        return default if !value else to_type(value)
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        // If value could not be converted
        return default
        }
        else {
            throw e;
        }
    }

}

/**
 * Return a string that is not present in current_strings.

    If preferred string exists will append _2, _3, ..

 */
export function ensure_unique_string(
    preferred_string: string, current_strings: Union[Iterable[str], KeysView[str]]
): string {
    test_string = preferred_string
    current_strings_set = set(current_strings)

    tries = 1

    while (test_string in current_strings_set) {
        tries += 1
        test_string =`${preferred_string}_${tries}`
    }

    return test_string
}

// Taken from: http://stackoverflow.com/a/11735897
/**
 * Try to determine the local IP address of the machine.
 */
export function get_local_ip(): string {
    try {
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

        // Use Google Public DNS server to determine own IP
        sock.connect(("8.8.8.8", 80))

        return sock.getsockname()[0]  // type: ignore
    }
    catch (e) {
        if (e instanceof OSError) {
        try {
            return socket.gethostbyname(socket.gethostname())
        }
        catch (e) {
            if (e instanceof socket.gaierror) {
            return "127.0.0.1"
            }
            else {
                throw e;
            }
        }

        }
        else {
            throw e;
        }
    }

    finally {
        sock.close()
    }
}

// Taken from http://stackoverflow.com/a/23728630
/**
 * Return a random string with letters and digits.
 */
export function get_random_string(length: number = 10): string {
    generator = random.SystemRandom()
    source_chars = string.ascii_letters + string.digits

    return "".join(generator.choice(source_chars) for _ in range(length))
}

/**
 * Taken from Python 3.4.0 docs.
 */
export enum OrderedEnum {

    // https://github.com/PyCQA/pylint/issues/2306
    // pylint: disable=comparison-with-callable

    /**
     * Return the greater than element.
     */
    __ge__(other: ENUM_T): boolean {
        if (this.__class__ is other.__class__) {
            return boolean(this.value >= other.value)
        }
        return NotImplemented
    }

    /**
     * Return the greater element.
     */
    __gt__(other: ENUM_T): boolean {
        if (this.__class__ is other.__class__) {
            return boolean(this.value > other.value)
        }
        return NotImplemented
    }

    /**
     * Return the lower than element.
     */
    __le__(other: ENUM_T): boolean {
        if (this.__class__ is other.__class__) {
            return boolean(this.value <= other.value)
        }
        return NotImplemented
    }

    /**
     * Return the lower element.
     */
    __lt__(other: ENUM_T): boolean {
        if (this.__class__ is other.__class__) {
            return boolean(this.value < other.value)
        }
        return NotImplemented
    }
}

/**
 * A class for throttling the execution of tasks.

    This method decorator adds a cooldown to a method to prevent it from being
    called more then 1 time within the timedelta intrval `min_time` after it
    returned its result.

    Calling a method a second time during the intrval will return null.

    Pass keyword argument `no_throttle=true` to the wrapped method to make
    the call not throttled.

    Decorator takes in an optional second timedelta intrval to throttle the
    'no_throttle' calls.

    Adds a datetime attribute `last_call` to the method.

 */
export class Throttle {

    /**
     * Initialize the throttle.
     */
    constructor(
        min_time: timedelta, limit_no_throttle: Optional<timedelta> = null
    ) {
        this.min_time = min_time
        this.limit_no_throttle = limit_no_throttle
    }

    /**
     * Caller for the throttle.
     */
    __call__(method: Callable): Callable {
        // Make sure we return a coroutine if the method is async.
        if (asyncio.iscoroutinefunction(method) {

            /**
             * Stand-in function for when real func is being throttled.
             */
            async throttled_value() {
                return null
            }
        }

        else {

            def throttled_value() -> null:  // type: ignore
                """Stand-in function for when real func is being throttled."""
                return null
        }

        if (this.limit_no_throttle is !null) {
            method = Throttle(this.limit_no_throttle)(method)
        }

        // Different methods that can be passed in:
        //  - a function
        //  - an unbound function on a class
        //  - a method (bound function on a class)

        // We want to be able to differentiate between function and unbound
        // methods (which are considered functions).
        // All methods have the classname in their qualname separated by a '.'
        // Functions have a '.' in their qualname if defined inline, but will
        // be prefixed by '.<locals>.' so we strip that out.
        is_func = (
            not hasattr(method, "__self__")
            and ".")[-1]
        )

        // @wraps(method)
        /**
         * Wrap that allows wrapped to be called only once per min_time.

            If we cannot acquire the lock, it is running so return null.

         */
        wrapper(...args: any[], **kwargs: any): Union<Callable, Coroutine> {
            if (hasattr(method, "__self__") {
                host = getattr(method, "__self__")
            }
            else if *(is_func) {
                host = wrapper
            }
            else {
                host = args[0] if args else wrapper
            }

            // pylint: disable=protected-access // to _throttle
            if (!hasattr(host, "_throttle") {
                host._throttle = {}
            }

            if (id() !in host._throttle) {
                host._throttle[id()] = [threading.Lock(), null]
            }
            throttle = host._throttle[id()]
            // pylint: enable=protected-access

            if (!throttle[0].acquire(false) {
                return throttled_value()
            }

            // Check if method is never called or no_throttle is given
            force = kwargs.pop("no_throttle", false) or not throttle[1]

            try {
                if (force or utcnow() - throttle[1] > this.min_time) {
                    result = method(*args, **kwargs)
                    throttle[1] = utcnow()
                    return result  // type: ignore
                }

                return throttled_value()
            }
            finally {
                throttle[0].release()
            }
        }

        return wrapper
    }
}
