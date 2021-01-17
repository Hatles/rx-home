/**
 * Signal handling related helpers.
 */
import logging
import signal
import sys
from types import FrameType

from homeassistant.const import RESTART_EXIT_CODE
from homeassistant.core import HomeAssistant, callback
from homeassistant.loader import bind_hass

const _LOGGER = logging.getLogger(__name__)


// @callback
// @bind_hass
/**
 * Register system signal handler for
 */
export function async_register_signal_handling(hass: HomeAssistant) {
    if (sys.platform !== "win32") {

        // @callback
        /**
         * Wrap signal handling.

            * queue call to shutdown task
            * re-instate default handler

         */
        async_signal_handle(exit_code: number) {
            hass.loop.remove_signal_handler(signal.SIGTERM)
            hass.loop.remove_signal_handler(signal.SIGINT)
            hass.async_create_task(hass.async_stop(exit_code))
        }

        try {
            hass.loop.add_signal_handler(signal.SIGTERM, async_signal_handle, 0)
        }
        catch (e) {
            if (e instanceof ValueError) {
            _LOGGER.warning("Could not bind to SIGTERM")
            }
            else {
                throw e;
            }
        }


        try {
            hass.loop.add_signal_handler(signal.SIGINT, async_signal_handle, 0)
        }
        catch (e) {
            if (e instanceof ValueError) {
            _LOGGER.warning("Could not bind to SIGINT")
            }
            else {
                throw e;
            }
        }


        try {
            hass.loop.add_signal_handler(
                signal.SIGHUP, async_signal_handle, RESTART_EXIT_CODE
            )
        }
        catch (e) {
            if (e instanceof ValueError) {
            _LOGGER.warning("Could not bind to SIGHUP")
            }
            else {
                throw e;
            }
        }

    }

    else {
        old_sigterm = null
        old_sigint = null

        // @callback
        /**
         * Wrap signal handling.

            * queue call to shutdown task
            * re-instate default handler

         */
        async_signal_handle(exit_code: number, frame: FrameType) {
            signal.signal(signal.SIGTERM, old_sigterm)
            signal.signal(signal.SIGINT, old_sigint)
            hass.async_create_task(hass.async_stop(exit_code))
        }

        try {
            old_sigterm = signal.signal(signal.SIGTERM, async_signal_handle)
        }
        catch (e) {
            if (e instanceof ValueError) {
            _LOGGER.warning("Could not bind to SIGTERM")
            }
            else {
                throw e;
            }
        }


        try {
            old_sigint = signal.signal(signal.SIGINT, async_signal_handle)
        }
        catch (e) {
            if (e instanceof ValueError) {
            _LOGGER.warning("Could not bind to SIGINT")
            }
            else {
                throw e;
            }
        }

    }
}
