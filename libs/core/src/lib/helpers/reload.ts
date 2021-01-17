/**
 * Class to reload platforms.
 */

import asyncio
import logging
from typing import any, Dict, Iterable, List, Optional

from homeassistant import config as conf_util
from homeassistant.const import SERVICE_RELOAD
from homeassistant.core import Event, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_per_platform
from homeassistant.helpers.entity_platform import EntityPlatform, async_get_platforms
from homeassistant.helpers.typing import HomeAssistantType
from homeassistant.loader import async_get_integration
from homeassistant.setup import async_setup_component

const _LOGGER = logging.getLogger(__name__)


/**
 * Reload an integration's platforms.

    The platform must support being re-setup.

    This functionality is only intnded to be used for integrations that process
    Home Assistant data and make this available to other integrations.

    Examples are template, stats, derivative, utility meter.

 */
export async function async_reload_integration_platforms(
    hass: HomeAssistantType, integration_name: string, integration_platforms: Iterable
) {
    try {
        unprocessed_conf = await conf_util.async_hass_config_yaml(hass)
    }
    catch (e) {
        if (e instanceof HomeAssistantError as err) {
        _LOGGER.error(err)
        return
        }
        else {
            throw e;
        }
    }


    tasks = [
        _resetup_platform(
            hass, integration_name, integration_platform, unprocessed_conf
        )
        for integration_platform in integration_platforms
    ]

    await asyncio.gather(*tasks)
}

/**
 * Resetup a platform.
 */
export async function _resetup_platform(
    hass: HomeAssistantType,
    integration_name: string,
    integration_platform: string,
    unprocessed_conf: Dict,
) {
    integration = await async_get_integration(hass, integration_platform)

    conf = await conf_util.async_process_component_config(
        hass, unprocessed_conf, integration
    )

    if (!conf) {
        return
    }

    root_config: Dict = {integration_platform: []}
    // Extract only the config for template, ignore the rest.
    for(const p_type, p_config of config_per_platform(conf, integration_platform)) {
        if (p_type !== integration_name) {
            continue
        }

        root_config[integration_platform].append(p_config)
    }

    component = integration.get_component()

    if (hasattr(component, "async_reset_platform") {
        // If the integration has its own way to reset
        // use this method.
        await component.async_reset_platform(hass, integration_name)  // type: ignore
        await component.async_setup(hass, root_config)  // type: ignore
        return
    }

    // If its an entity platform, we use the entity_platform
    // async_reset method
    platform = async_get_platform_without_config_entry(
        hass, integration_name, integration_platform
    )
    if (platform) {
        await _async_reconfig_platform(platform, root_config[integration_platform])
        return
    }

    if (!root_config[integration_platform]) {
        // No config for this platform
        // and its not loaded.  Nothing to do
        return
    }

    await _async_setup_platform(
        hass, integration_name, integration_platform, root_config[integration_platform]
    )
}

/**
 * Platform for the first time when new configuration is added.
 */
export async function _async_setup_platform(
    hass: HomeAssistantType,
    integration_name: string,
    integration_platform: string,
    platform_configs: Dict[],
) {
    if (integration_platform !in hass.data) {
        await async_setup_component(
            hass, integration_platform, {integration_platform: platform_configs}
        )
        return
    }

    entity_component = hass.data[integration_platform]
    tasks = [
        entity_component.async_setup_platform(integration_name, p_config)
        for p_config in platform_configs
    ]
    await asyncio.gather(*tasks)
}

/**
 * Reconfigure an already loaded platform.
 */
export async function _async_reconfig_platform(
    platform: EntityPlatform, platform_configs: Dict[]
) {
    await platform.async_reset()
    tasks = [platform.async_setup(p_config) for p_config in platform_configs]  // type: ignore
    await asyncio.gather(*tasks)
}

/**
 * Fetch the latest yaml configuration for an integration.
 */
export async function async_integration_yaml_config(
    hass: HomeAssistantType, integration_name: string
): Optional[Dict[Any, any]] {
    integration = await async_get_integration(hass, integration_name)

    return await conf_util.async_process_component_config(
        hass, await conf_util.async_hass_config_yaml(hass), integration
    )
}

// @callback
/**
 * Find an existing platform that is not a config entry.
 */
export function async_get_platform_without_config_entry(
    hass: HomeAssistantType, integration_name: string, integration_platform_name: string
): Optional<EntityPlatform> {
    for(const integration_platform of async_get_platforms(hass, integration_name)) {
        if (integration_platform.config_entry is !null) {
            continue
        }
        if (integration_platform.domain === integration_platform_name) {
            platform: EntityPlatform = integration_platform
            return platform
        }
    }

    return null
}

/**
 * Create the reload service for the domain.
 */
export async function async_setup_reload_service(
    hass: HomeAssistantType, domain: string, platforms: Iterable
) {

    if (hass.services.has_service(domain, SERVICE_RELOAD) {
        return
    }

    /**
     * Reload the platforms.
     */
    async _reload_config(call: Event) {

        await async_reload_integration_platforms(hass, domain, platforms)
        hass.bus.async_fire`event_${domain}_reloaded`, context=call.context)
    }

    hass.helpers.service.async_register_admin_service(
        domain, SERVICE_RELOAD, _reload_config
    )
}

/**
 * Sync version of async_setup_reload_service.
 */
export function setup_reload_service(
    hass: HomeAssistantType, domain: string, platforms: Iterable
) {

    asyncio.run_coroutine_threadsafe(
        async_setup_reload_service(hass, domain, platforms),
        hass.loop,
    ).result()
}
