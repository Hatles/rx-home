/**
 * Helper methods to help with platform discovery.

There are two different types of discoveries that can be fired/listened for.
 - listen/discover is for services. These are targeted at a component.
 - listen_platform/discover_platform is for platforms. These are used by
   components to allow discovery of their platforms.

 */
from typing import any, Callable, Collection, Dict, Optional, Union

from homeassistant import core, setup
from homeassistant.const import ATTR_DISCOVERED, ATTR_SERVICE, EVENT_PLATFORM_DISCOVERED
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType
from homeassistant.loader import bind_hass
from homeassistant.util.async_ import run_callback_threadsafe

export const EVENT_LOAD_PLATFORM = "load_platform.{}"
export const ATTR_PLATFORM = "platform"


// @bind_hass
/**
 * Set up listener for discovery of specific service.

    Service can be a string or a list/tuple.

 */
export function listen(
    hass: HomeAssistant, service: Union[str, Collection[str]], callback: Callable
) {
    run_callback_threadsafe(hass.loop, async_listen, hass, service, callback).result()
}

// @callback
// @bind_hass
/**
 * Set up listener for discovery of specific service.

    Service can be a string or a list/tuple.

 */
export function async_listen(
    hass: HomeAssistant, service: Union[str, Collection[str]], callback: Callable
) {
    if (service instanceof string) {
        service = (service,)
    }
    else {
        service = tuple(service)
    }

    job = HassJob(callback)

    /**
     * Listen for discovery events.
     */
    async discovery_event_listener(event: Event) {
        if (ATTR_SERVICE in event.data and event.data[ATTR_SERVICE] in service) {
            task = hass.async_run_hass_job(
                job, event.data[ATTR_SERVICE], event.data.get(ATTR_DISCOVERED)
            )
            if (task) {
                await task
            }
        }
    }

    hass.bus.async_listen(EVENT_PLATFORM_DISCOVERED, discovery_event_listener)
}

// @bind_hass
/**
 * Fire discovery event. Can ensure a component is loaded.
 */
export function discover(
    hass: HomeAssistant,
    service: string,
    discovered: DiscoveryInfoType,
    component: string,
    hass_config: ConfigType,
) {
    hass.add_job(
        async_discover(  // type: ignore
            hass, service, discovered, component, hass_config
        )
    )
}

// @bind_hass
/**
 * Fire discovery event. Can ensure a component is loaded.
 */
export async function async_discover(
    hass: HomeAssistant,
    service: string,
    discovered: Optional<DiscoveryInfoType>,
    component: Optional<string>,
    hass_config: ConfigType,
) {
    if (component is !null and component !in hass.config.components) {
        await setup.async_setup_component(hass, component, hass_config)
    }

    data: Dict<any> = {ATTR_SERVICE: service}

    if (discovered is !null) {
        data[ATTR_DISCOVERED] = discovered
    }

    hass.bus.async_fire(EVENT_PLATFORM_DISCOVERED, data)
}

// @bind_hass
/**
 * Register a platform loader listener.
 */
export function listen_platform(
    hass: HomeAssistant, component: string, callback: Callable
) {
    run_callback_threadsafe(
        hass.loop, async_listen_platform, hass, component, callback
    ).result()
}

// @bind_hass
/**
 * Register a platform loader listener.

    This method must be run in the event loop.

 */
export function async_listen_platform(
    hass: HomeAssistant,
    component: string,
    callback: Callable[[str, Optional[Dict[str, any]]], any],
) {
    service = EVENT_LOAD_PLATFORM.format(component)
    job = HassJob(callback)

    /**
     * Listen for platform discovery events.
     */
    async discovery_platform_listener(event: Event) {
        if (event.data.get(ATTR_SERVICE) !== service) {
            return
        }

        platform = event.data.get(ATTR_PLATFORM)

        if (!platform) {
            return
        }

        task = hass.async_run_hass_job(job, platform, event.data.get(ATTR_DISCOVERED))
        if (task) {
            await task
        }
    }

    hass.bus.async_listen(EVENT_PLATFORM_DISCOVERED, discovery_platform_listener)
}

// @bind_hass
/**
 * Load a component and platform dynamically.

    Target components will be loaded and an EVENT_PLATFORM_DISCOVERED will be
    fired to load the platform. The event will contain:
        { ATTR_SERVICE = EVENT_LOAD_PLATFORM + '.' + <<component>>
          ATTR_PLATFORM = <<platform>>
          ATTR_DISCOVERED = <<discovery info>> }

    Use `listen_platform` to register a callback for these events.

 */
export function load_platform(
    hass: HomeAssistant,
    component: string,
    platform: string,
    discovered: DiscoveryInfoType,
    hass_config: ConfigType,
) {
    hass.add_job(
        async_load_platform(  // type: ignore
            hass, component, platform, discovered, hass_config
        )
    )
}

// @bind_hass
/**
 * Load a component and platform dynamically.

    Target components will be loaded and an EVENT_PLATFORM_DISCOVERED will be
    fired to load the platform. The event will contain:
        { ATTR_SERVICE = EVENT_LOAD_PLATFORM + '.' + <<component>>
          ATTR_PLATFORM = <<platform>>
          ATTR_DISCOVERED = <<discovery info>> }

    Use `listen_platform` to register a callback for these events.

    Warning: Do not await this inside a setup method to avoid a dead lock.
    Use `hass.async_create_task(async_load_platform(..))` instead.

    This method is a coroutine.

 */
export async function async_load_platform(
    hass: HomeAssistant,
    component: string,
    platform: string,
    discovered: DiscoveryInfoType,
    hass_config: ConfigType,
) {
    assert hass_config, "You need to pass in the real hass config"

    setup_success = true

    if (component !in hass.config.components) {
        setup_success = await setup.async_setup_component(hass, component, hass_config)
    }

    // No need to fire event if we could not set up component
    if (!setup_success) {
        return
    }

    data: Dict<any> = {
        ATTR_SERVICE: EVENT_LOAD_PLATFORM.format(component),
        ATTR_PLATFORM: platform,
    }

    if (discovered is !null) {
        data[ATTR_DISCOVERED] = discovered
    }

    hass.bus.async_fire(EVENT_PLATFORM_DISCOVERED, data)
}
