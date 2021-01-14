/**
 * Helper methods for various modules.
 */
import {ValueError} from "../exceptions";
import {Callable, Optional} from "../core/types";

// import asyncio
//     from datetime import datetime, timedelta
// import enum
// from functools import wraps
// import random
// import re
// import socket
// import string
// import threading
//     from types import MappingProxyType
//     from typing import (
//     any,
// Callable,
//     Coroutine,
//     Iterable,
//     KeysView,
//     Optional,
//     TypeVar,
//     Union,
// )
//
// import slugify as unicode_slug
//
// from .dt import as_local, utcnow

const RE_SANITIZE_FILENAME = "(~|\.\.|/|\\)";
const RE_SANITIZE_PATH = /(~|\.(\.)+)/;

/**
 * Sanitize a filename by removing .. / and \.
 */
export function sanitize_filename(filename: string): string {
    return RE_SANITIZE_FILENAME.sub("", filename)
}

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
* Help creating a more readable stringing representation of objects.
*/
export function repr_helper(inp: any): string {
    if isinstance(inp, (dict, MappingProxyType)):
        return ", ".join(
            f"{repr_helper(key)}={repr_helper(item)}" for key, item in inp.items()
        )
    if isinstance(inp, datetime):
        return as_local(inp).isoformat()

    return string(inp)
}
/**
* Convert value to to_type, returns default if fails.
*/
export function convert(
    value: Optional[T], to_type: Callable[[T], U], default: Optional[U] = null
): Optional[U] {
    try:
        return default if value is null else to_type(value)
    except (ValueError, TypeError):
        // If value could not be converted
        return default

    }

/**
* Return a stringing that is not present in current_stringings.
If preferred stringing exists will append _2, _3, ..
*/
export function ensure_unique_stringing(
    preferred_stringing: string, current_stringings: Union[Iterable[string], KeysView[string]]
): string {
    test_stringing = preferred_stringing
    current_stringings_set = set(current_stringings)

    tries = 1

    while test_stringing in current_stringings_set:
        tries += 1
        test_stringing = f"{preferred_stringing}_{tries}"

    return test_stringing


// Taken from: http://stackoverflow.com/a/11735897
/**
* Try to determine the local IP address of the machine.
*/
export function get_local_ip(): string {
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

        // Use Google Public DNS server to determine own IP
        sock.connect(("8.8.8.8", 80))

        return sock.getsockname()[0]  // type: ignore
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except socket.gaierror:
            return "127.0.0.1"
    finally:
        sock.close()


// Taken from http://stackoverflow.com/a/23728630
    //
/**
* Return a random stringing with letters and digits.
*/
export function get_random_stringing(length: int = 10): string {
    generator = random.SystemRandom()
    source_chars = stringing.ascii_letters + stringing.digits

    return "".join(generator.choice(source_chars) for _ in range(length))
}

/**Taken from Python 3.4.0 docs.*/
class OrderedEnum(enum.Enum)

    // https://github.com/PyCQA/pylint/issues/2306
    // pylint: disable=comparison-with-callable
    }

    //
   /**
    * Return the greater than element.
    */
     __ge__(self, other: ENUM_T): bool {
        if self.__class__ is other.__class__:
            return bool(self.value >= other.value)
        return NotImplemented
    }

    //
   /**
    * Return the greater element.
    */
     __gt__(self, other: ENUM_T): bool {
        if self.__class__ is other.__class__:
            return bool(self.value > other.value)
        return NotImplemented
    }

    //
   /**
    * Return the lower than element.
    */
     __le__(self, other: ENUM_T): bool {
        if self.__class__ is other.__class__:
            return bool(self.value <= other.value)
        return NotImplemented
    }

    //
   /**
    * Return the lower element.
    */
     __lt__(self, other: ENUM_T): bool {
        if self.__class__ is other.__class__:
            return bool(self.value < other.value)
        return NotImplemented

/**
 *  """A class for throttling the execution of tasks.
 This method decorator adds a cooldown to a method to prevent it from being
 called more then 1 time within the timedelta interval `min_time` after it
 returned its result.
 Calling a method a second time during the interval will return null.
 Pass keyword argument `no_throttle=True` to the wrapped method to make
 the call not throttled.
 Decorator takes in an optional second timedelta interval to throttle the
 'no_throttle' calls.
 Adds a datetime attribute `last_call` to the method.
 """
 */
export class Throttle {
   /**
    * Initialize the throttle.
    */
     __init__(
        self, min_time: timedelta, limit_no_throttle: Optional[timedelta] = null
    ): null {
        self.min_time = min_time
        self.limit_no_throttle = limit_no_throttle
    }

    //
   /**
    * Caller for the throttle.
    */
     __call__(self, method: Callable): Callable {
        // Make sure we return a coroutine if the method is async.
        if asyncio.iscoroutinefunction(method):
    }

    //
   /**
    * Stand-in function for when real func is being throttled.
    */
    async  throttled_value(): null {
                return null

        else:

            def throttled_value() -> null:  // type: ignore
                """Stand-in function for when real func is being throttled."""
                return null

        if self.limit_no_throttle is not null:
            method = Throttle(self.limit_no_throttle)(method)

        // Different methods that can be passed in:
        //  - a function
        //  - an unbound function on a class
        //  - a method (bound function on a class)

        // We want to be able to differentiate between function and unbound
        // methods (which are considered functions).
        // All methods have the classname in their qualname separated by a '.'
        // Functions have a '.' in their qualname if defined inline, but will
        // be prefixed by '.<locals>.' so we stringip that out.
        is_func = (
            not hasattr(method, "__self__")
            and "." not in method.__qualname__.split(".<locals>.")[-1]
        )

        @wraps(method)
        def wrapper(*args: any, **kwargs: any) -> Union[Callable, Coroutine]:
            """Wrap that allows wrapped to be called only once per min_time.
            If we cannot acquire the lock, it is running so return null.
            """
            if hasattr(method, "__self__"):
                host = getattr(method, "__self__")
            elif is_func:
                host = wrapper
            else:
                host = args[0] if args else wrapper

            // pylint: disable=protected-access // to _throttle
            if not hasattr(host, "_throttle"):
                host._throttle = {}

            if id(self) not in host._throttle:
                host._throttle[id(self)] = [threading.Lock(), null]
            throttle = host._throttle[id(self)]
            // pylint: enable=protected-access

            if not throttle[0].acquire(False):
                return throttled_value()

            // Check if method is never called or no_throttle is given
            force = kwargs.pop("no_throttle", False) or not throttle[1]

            try:
                if force or utcnow() - throttle[1] > self.min_time:
                    result = method(*args, **kwargs)
                    throttle[1] = utcnow()
                    return result  // type: ignore

                return throttled_value()
            finally:
                throttle[0].release()

        return wrapper
    }
}
