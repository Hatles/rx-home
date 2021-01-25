/**
 * Helpers for Home Assistant dispatcher & internal component/platform.
 */
import logging
from typing import any, Callable

from homeassistant.core import HassJob, callback
from homeassistant.loader import bind_hass
from homeassistant.util.async_ import run_callback_threadsafe
from homeassistant.util.logging import catch_log_exception

from .typing import HomeAssistantType

const _LOGGER = logging.getLogger(__name__)
export const DATA_DISPATCHER = "dispatcher"


// @bind_hass
/**
 * Connect a callable function to a signal.
 */
export function dispatcher_connect(
    hass: HomeAssistantType, signal: string, target: Callable<..., null>
): Callable[[], null] {
    async_unsub = run_callback_threadsafe(
        hass.loop, async_dispatcher_connect, hass, signal, target
    ).result()

    /**
     * Remove signal listener.
     */
    remove_dispatcher() {
        run_callback_threadsafe(hass.loop, async_unsub).result()
    }

    return remove_dispatcher
}

// @callback
// @bind_hass
/**
 * Connect a callable function to a signal.

    This method must be run in the event loop.

 */
export function async_dispatcher_connect(
    hass: HomeAssistantType, signal: string, target: Callable<..., any>
): Callable[[], null] {
    if (DATA_DISPATCHER !in hass.data) {
        hass.data[DATA_DISPATCHER] = {}
    }

    job = HassJob(
        catch_log_exception(
            target,
            lambda *args: "Exception in {} when dispatching '{}': {}".format(
                // Functions wrapped in partial do not have a __name__
                getattr(target, "__name__", null) or string(target),
                signal,
                args,
            ),
        )
    )

    hass.data[DATA_DISPATCHER].setdefault(signal, []).append(job)

    // @callback
    /**
     * Remove signal listener.
     */
    async_remove_dispatcher() {
        try {
            hass.data[DATA_DISPATCHER][signal].remove(job)
        }
        catch (e) {
            if (e instanceof (KeyError, ValueError)) {
            // KeyError is key target listener did not exist
            // ValueError if listener did not exist within signal
            _LOGGER.warning("Unable to remove unknown dispatcher %s", target)
            }
            else {
                throw e;
            }
        }

    }

    return async_remove_dispatcher
}

// @bind_hass
/**
 * Send signal and data.
 */
export function dispatcher_send(hass: HomeAssistantType, signal: string, ...args: any[]) {
    hass.loop.call_soon_threadsafe(async_dispatcher_send, hass, signal, *args)
}

// @callback
// @bind_hass
/**
 * Send signal and data.

    This method must be run in the event loop.

 */
export function async_dispatcher_send(hass: HomeAssistantType, signal: string, ...args: any[]) {
    target_list = hass.data.get(DATA_DISPATCHER, {}).get(signal, [])

    for(const job of target_list) {
        hass.async_add_hass_job(job, *args)
    }
}
