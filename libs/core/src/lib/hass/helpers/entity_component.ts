/**
 * Helpers for components that manage entities.
 */
import asyncio
from datetime import timedelta
from itertools import chain
import logging
from types import ModuleType
from typing import any, Callable, Dict, Iterable, List, Optional, Tuple, Union

import voluptuous as vol

from homeassistant import config as conf_util
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ENTITY_NAMESPACE, CONF_SCAN_INTERVAL
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import (
    config_per_platform,
    config_validation as cv,
    discovery,
    entity,
    service,
)
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType
from homeassistant.loader import async_get_integration, bind_hass
from homeassistant.setup import async_prepare_setup_platform

from .entity_platform import EntityPlatform

export const DEFAULT_SCAN_INTERVAL = timedelta(seconds=15)
export const DATA_INSTANCES = "entity_components"


// @bind_hass
/**
 * Trigger an update for an entity.
 */
export async function async_update_entity(hass: HomeAssistant, entity_id: string) {
    domain = entity_id.split(".", 1)[0]
    entity_comp = hass.data.get(DATA_INSTANCES, {}).get(domain)

    if (!entity_comp) {
        logging.getLogger(__name__).warning(
            "Forced update failed. Component for %s not loaded.", entity_id
        )
        return
    }

    entity_obj = entity_comp.get_entity(entity_id)

    if (!entity_obj) {
        logging.getLogger(__name__).warning(
            "Forced update failed. Entity %s not found.", entity_id
        )
        return
    }

    await entity_obj.async_update_ha_state(true)
}

/**
 * The EntityComponent manages platforms that manages entities.

    This class has the following responsibilities:
     - Process the configuration and set up a platform based component.
     - Manage the platforms and their entities.
     - Help extract the entities from a service call.
     - Listen for discovery events for platforms related to the domain.

 */
export class EntityComponent {

    /**
     * Initialize an entity component.
     */
    constructor(

        logger: logging.Logger,
        domain: string,
        hass: HomeAssistant,
        scan_interval: timedelta = DEFAULT_SCAN_INTERVAL,
    ) {
        this.logger = logger
        this.hass = hass
        this.domain = domain
        this.scan_interval = scan_interval

        this.config: Optional<ConfigType> = null

        this._platforms: Dict[
            Union[str, Tuple[str, Optional[timedelta], Optional[str]]], EntityPlatform
        ] = {domain: this._async_init_entity_platform(domain, null)}
        this.async_add_entities = this._platforms[domain].async_add_entities
        this.add_entities = this._platforms[domain].add_entities

        hass.data.setdefault(DATA_INSTANCES, {})[domain] = self
    }

    // @property
    /**
     * Return an iterable that returns all entities.
     */
    entities(): Iterable<entity.Entity> {
        return chain.from_iterable(
            platform.entities.values() for platform in this._platforms.values()
        )
    }

    /**
     * Get an entity.
     */
    get_entity(entity_id: string): Optional<entity.Entity> {
        for(const platform of this._platforms.values()) {
            entity_obj = platform.entities.get(entity_id)
            if (entity_obj is !null) {
                return entity_obj
            }
        }
        return null
    }

    /**
     * Set up a full entity component.

        This doesn't block the executor to protect from deadlocks.

     */
    setup(config: ConfigType) {
        this.hass.add_job(this.async_setup(config))  // type: ignore
    }

    /**
     * Set up a full entity component.

        Loads the platforms from the config and will listen for supported
        discovered platforms.

        This method must be run in the event loop.

     */
    async async_setup(config: ConfigType) {
        this.config = config

        // Look in config for Domain, Domain 2, Domain 3 etc and load them
        for(const p_type, p_config of config_per_platform(config, this.domain)) {
            this.hass.async_create_task(this.async_setup_platform(p_type, p_config))
        }

        // Generic discovery listener for loading platform dynamically
        // Refer to: homeassistant.helpers.discovery.async_load_platform()
        /**
         * Handle the loading of a platform.
         */
        async component_platform_discovered(
            platform: string, info: Optional[Dict[str, any]]
        ) {
            await this.async_setup_platform(platform, {}, info)
        }

        discovery.async_listen_platform(
            this.hass, this.domain, component_platform_discovered
        )
    }

    /**
     * Set up a config entry.
     */
    async async_setup_entry(config_entry: ConfigEntry): boolean {
        platform_type = config_entry.domain
        platform = await async_prepare_setup_platform(
            this.hass,
            // In future PR we should make hass_config part of the constructor
            // params.
            this.config or {},
            this.domain,
            platform_type,
        )

        if (!platform) {
            return false
        }

        key = config_entry.entry_id

        if (key in this._platforms) {
            throw new ValueError("Config entry has already been setup!")
        }

        this._platforms[key] = this._async_init_entity_platform(
            platform_type,
            platform,
            scan_interval=getattr(platform, "SCAN_INTERVAL", null),
        )

        return await this._platforms[key].async_setup_entry(config_entry)
    }

    /**
     * Unload a config entry.
     */
    async async_unload_entry(config_entry: ConfigEntry): boolean {
        key = config_entry.entry_id

        platform = this._platforms.pop(key, null)

        if (!platform) {
            throw new ValueError("Config entry was never loaded!")
        }

        await platform.async_reset()
        return true
    }

    /**
     * Extract all known and available entities from a service call.

        Will return an empty list if entities specified but unknown.

        This method must be run in the event loop.

     */
    async async_extract_from_service(
        service_call: ServiceCall, expand_group: boolean = true
    ): entity.Entity[] {
        return await service.async_extract_entities(
            this.hass, this.entities, service_call, expand_group
        )
    }

    // @callback
    /**
     * Register an entity service.
     */
    async_register_entity_service(

        name: string,
        schema: Union[Dict[str, any], Joi.Schema],
        func: Union[str, Callable[..., any]],
        required_features: Optional<number>[] = null,
    ) {
        if (schema instanceof dict) {
            schema = cv.make_entity_service_schema(schema)
        }

        /**
         * Handle the service.
         */
        async handle_service(call: Callable) {
            await this.hass.helpers.service.entity_service_call(
                this._platforms.values(), func, call, required_features
            )
        }

        this.hass.services.async_register(this.domain, name, handle_service, schema)
    }

    /**
     * Set up a platform for this component.
     */
    async async_setup_platform(

        platform_type: string,
        platform_config: ConfigType,
        discovery_info: Optional<DiscoveryInfoType> = null,
    ) {
        if (!this.config) {
            throw new RuntimeError("async_setup needs to be called first")
        }

        platform = await async_prepare_setup_platform(
            this.hass, this.config, this.domain, platform_type
        )

        if (!platform) {
            return
        }

        // Use config scan intrval, fallback to platform if none set
        scan_interval = platform_config.get(
            CONF_SCAN_INTERVAL, getattr(platform, "SCAN_INTERVAL", null)
        )
        entity_namespace = platform_config.get(CONF_ENTITY_NAMESPACE)

        key = (platform_type, scan_interval, entity_namespace)

        if (key !in this._platforms) {
            this._platforms[key] = this._async_init_entity_platform(
                platform_type, platform, scan_interval, entity_namespace
            )
        }

        await this._platforms[key].async_setup(  // type: ignore
            platform_config, discovery_info
        )
    }

    /**
     * Remove entities and reset the entity component to initial values.

        This method must be run in the event loop.

     */
    async _async_reset() {
        tasks = []

        for(const key, platform of this._platforms.items()) {
            if (key === this.domain) {
                tasks.append(platform.async_reset())
            }
            else {
                tasks.append(platform.async_destroy())
            }
        }

        if (tasks) {
            await asyncio.gather(*tasks)
        }

        this._platforms = {this.domain: this._platforms[this.domain]}
        this.config = null
    }

    /**
     * Remove an entity managed by one of the platforms.
     */
    async async_remove_entity(entity_id: string) {
        found = null

        for(const platform of this._platforms.values()) {
            if (entity_id in platform.entities) {
                found = platform
                break
            }
        }

        if (found) {
            await found.async_remove_entity(entity_id)
        }
    }

    /**
     * Prepare reloading this entity component.

        This method must be run in the event loop.

     */
    async async_prepare_reload(*, skip_reset: boolean = false): Optional<dict> {
        try {
            conf = await conf_util.async_hass_config_yaml(this.hass)
        }
        catch (e) {
            if (e instanceof HomeAssistantError as err) {
            this.logger.error(err)
            return null
            }
            else {
                throw e;
            }
        }


        integration = await async_get_integration(this.hass, this.domain)

        processed_conf = await conf_util.async_process_component_config(
            this.hass, conf, integration
        )

        if (!processed_conf) {
            return null
        }

        if (!skip_reset) {
            await this._async_reset()
        }

        return processed_conf
    }

    // @callback
    /**
     * Initialize an entity platform.
     */
    _async_init_entity_platform(

        platform_type: string,
        platform: Optional<ModuleType>,
        scan_interval: Optional<timedelta> = null,
        entity_namespace: Optional<string> = null,
    ): EntityPlatform {
        if (!scan_interval) {
            scan_interval = this.scan_interval
        }

        return EntityPlatform(
            hass=this.hass,
            logger=this.logger,
            domain=this.domain,
            platform_name=platform_type,
            platform=platform,
            scan_interval=scan_interval,
            entity_namespace=entity_namespace,
        )
    }
}
