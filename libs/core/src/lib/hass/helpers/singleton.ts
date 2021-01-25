/**
 * Helper to help coordinating calls.
 */
import asyncio
import functools
from typing import Callable, Optional, TypeVar, cast

from homeassistant.core import HomeAssistant
from homeassistant.loader import bind_hass

export const T = TypeVar("T")

export const FUNC = Callable[[HomeAssistant], T]


/**
 * Decorate a function that should be called once per instance.

    Result will be cached and simultaneous calls will be handled.
    
 */
export function singleton(data_key: string): Callable[[FUNC], FUNC] {

    /**
     * Wrap a function with caching logic.
     */
    wrapper(func: FUNC): FUNC {
        if (!asyncio.iscoroutinefunction(func) {

            // @bind_hass
            // @functools.wraps(func)
            def wrapped(hass: HomeAssistant) -> T:
                obj: Optional<T> = hass.data.get(data_key)
                if (!obj) {
                    obj = hass.data[data_key] = func(hass)
                }
                return obj

            return wrapped
        }

        // @bind_hass
        // @functools.wraps(func)
        async def async_wrapped(hass: HomeAssistant) -> T:
            obj_or_evt = hass.data.get(data_key)

            if (!obj_or_evt) {
                evt = hass.data[data_key] = asyncio.Event()

                result = await func(hass)

                hass.data[data_key] = result
                evt.set()
                return cast(T, result)
            }

            if (obj_or_evt instanceof asyncio.Event) {
                evt = obj_or_evt
                await evt.wait()
                return cast(T, hass.data.get(data_key))
            }

            return cast(T, obj_or_evt)

        return async_wrapped
    }

    return wrapper
}