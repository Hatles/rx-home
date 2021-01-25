/**
 * Helpers to help with integration platforms.
 */
import asyncio
import logging
from typing import any, Awaitable, Callable

from homeassistant.core import Event, HomeAssistant
from homeassistant.loader import async_get_integration, bind_hass
from homeassistant.setup import ATTR_COMPONENT, EVENT_COMPONENT_LOADED

const _LOGGER = logging.getLogger(__name__)


// @bind_hass
/**
 * Process a specific platform for all current and future loaded integrations.
 */
export async function async_process_integration_platforms(
    hass: HomeAssistant,
    platform_name: string,
    // any = platform.
    process_platform: Callable[[HomeAssistant, string, any], Awaitable[null]],
) {

    /**
     * Process the intnts of a component.
     */
    async _process(component_name: string) {
        if ("." in component_name) {
            return
        }

        integration = await async_get_integration(hass, component_name)

        try {
            platform = integration.get_platform(platform_name)
        }
        catch (e) {
            if (e instanceof ImportError as err) {
            if`${component_name}.${platform_name}`):
                _LOGGER.exception(
                    "Unexpected error importing %s/%s.py",
                    component_name,
                    platform_name,
                )
            return
            }
            else {
                throw e;
            }
        }


        try {
            await process_platform(hass, component_name, platform)
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception(
                "Error processing platform %s.%s", component_name, platform_name
            )
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Handle a new component loaded.
     */
    async async_component_loaded(event: Event) {
        await _process(event.data[ATTR_COMPONENT])
    }

    hass.bus.async_listen(EVENT_COMPONENT_LOADED, async_component_loaded)

    tasks = [_process(comp) for comp in hass.config.components]

    if (tasks) {
        await asyncio.gather(*tasks)
    }
}
