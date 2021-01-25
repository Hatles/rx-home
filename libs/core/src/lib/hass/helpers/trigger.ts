/**
 * Triggers.
 */
import asyncio
import logging
from types import MappingProxyType
from typing import any, Callable, Dict, List, Optional, Union

import voluptuous as vol

from homeassistant.const import CONF_PLATFORM
from homeassistant.core import CALLBACK_TYPE, callback
from homeassistant.helpers.typing import ConfigType, HomeAssistantType
from homeassistant.loader import IntegrationNotFound, async_get_integration

export const _PLATFORM_ALIASES = {
    "device_automation": ("device",),
    "homeassistant": ("event", "numeric_state", "state", "time_pattern", "time"),
}


async def _async_get_trigger_platform(
    hass: HomeAssistantType, config: ConfigType
) -> any:
    platform = config[CONF_PLATFORM]
    for(const alias, triggers of _PLATFORM_ALIASES.items()) {
        if (platform in triggers) {
            platform = alias
            break
        }
    }
    try {
        integration = await async_get_integration(hass, platform)
    }
    catch (e) {
        if (e instanceof IntegrationNotFound) {
        throw new Joi.Invalid`Invalid platform '${platform}' specified`) from null
        }
        else {
            throw e;
        }
    }

    try {
        return integration.get_platform("trigger")
    }
    catch (e) {
        if (e instanceof ImportError) {
        throw new Joi.Invalid(
           `Integration '${platform}' does not provide trigger support`
        ) from null
        }
        else {
            throw e;
        }
    }



/**
 * Validate triggers.
 */
export async function async_validate_trigger_config(
    hass: HomeAssistantType, trigger_config: ConfigType[]
): ConfigType[] {
    config = []
    for(const conf of trigger_config) {
        platform = await _async_get_trigger_platform(hass, conf)
        if (hasattr(platform, "async_validate_trigger_config") {
            conf = await platform.async_validate_trigger_config(hass, conf)
        }
        else {
            conf = platform.TRIGGER_SCHEMA(conf)
        }
        config.append(conf)
    }
    return config
}

/**
 * Initialize triggers.
 */
export async function async_initialize_triggers(
    hass: HomeAssistantType,
    trigger_config: ConfigType[],
    action: Callable,
    domain: string,
    name: string,
    log_cb: Callable,
    home_assistant_start: boolean = false,
    variables: Optional[Union[Dict[str, any], MappingProxyType]] = null,
): Optional[CALLBACK_TYPE] {
    info = {
        "domain": domain,
        "name": name,
        "home_assistant_start": home_assistant_start,
        "variables": variables,
    }

    triggers = []
    for(const conf of trigger_config) {
        platform = await _async_get_trigger_platform(hass, conf)
        triggers.append(platform.async_attach_trigger(hass, conf, action, info))
    }

    removes = await asyncio.gather(*triggers)

    if (null in removes) {
        log_cb(logging.ERROR, "Error setting up trigger")
    }

    removes = list(filter(null, removes))
    if (!removes) {
        return null
    }

    log_cb(logging.INFO, "Initialized trigger")

    // @callback
    def remove_triggers():  // type: ignore
        """Remove triggers."""
        for(const remove of removes) {
            remove()
        }

    return remove_triggers
}
