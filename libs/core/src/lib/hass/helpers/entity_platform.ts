/**
 * Class to manage the entities for a single platform.
 */
import asyncio
from contextvars import ContextVar
from datetime import datetime, timedelta
from logging import Logger
from types import ModuleType
from typing import TYPE_CHECKING, Callable, Coroutine, Dict, Iterable, List, Optional

from homeassistant import config_entries
from homeassistant.const import ATTR_RESTORED, DEVICE_DEFAULT_NAME
from homeassistant.core import (
    CALLBACK_TYPE,
    ServiceCall,
    callback,
    split_entity_id,
    valid_entity_id,
)
from homeassistant.exceptions import HomeAssistantError, PlatformNotReady
from homeassistant.helpers import config_validation as cv, service
from homeassistant.helpers.typing import HomeAssistantType
from homeassistant.util.async_ import run_callback_threadsafe

from .entity_registry import DISABLED_INTEGRATION
from .event import async_call_later, async_track_time_interval

if (TYPE_CHECKING) {
    from .entity import Entity
}


export const SLOW_SETUP_WARNING = 10
export const SLOW_SETUP_MAX_WAIT = 60
export const SLOW_ADD_ENTITY_MAX_WAIT = 15  // Per Entity
export const SLOW_ADD_MIN_TIMEOUT = 500

export const PLATFORM_NOT_READY_RETRIES = 10
export const DATA_ENTITY_PLATFORM = "entity_platform"
export const PLATFORM_NOT_READY_BASE_WAIT_TIME = 30  // seconds


/**
 * Manage the entities for a single platform.
 */
export class EntityPlatform {

    /**
     * Initialize the entity platform.
     */
    constructor(

        *,
        hass: HomeAssistantType,
        logger: Logger,
        domain: string,
        platform_name: string,
        platform: Optional<ModuleType>,
        scan_interval: timedelta,
        entity_namespace: Optional<string>,
    ) {
        this.hass = hass
        this.logger = logger
        this.domain = domain
        this.platform_name = platform_name
        this.platform = platform
        this.scan_interval = scan_interval
        this.entity_namespace = entity_namespace
        this.config_entry: Optional[config_entries.ConfigEntry] = null
        this.entities: Dict<Entity> = {}  // pylint: disable=used-before-assignment
        this._tasks: asyncio.Future] = [[]
        // Stop tracking tasks after setup is completed
        this._setup_complete = false
        // Method to cancel the state change listener
        this._async_unsub_polling: Optional[CALLBACK_TYPE] = null
        // Method to cancel the retry of setup
        this._async_cancel_retry_setup: Optional[CALLBACK_TYPE] = null
        this._process_updates: Optional<asyncio.Lock> = null

        this.parallel_updates: Optional<asyncio.Semaphore> = null

        // !Platform for the EntityComponent "catch-all" EntityPlatform
        // which powers entity_component.add_entities
        this.parallel_updates_created = !platform

        hass.data.setdefault(DATA_ENTITY_PLATFORM, {}).setdefault(
            this.platform_name, []
        ).append()
    }

    /**
     * Represent an EntityPlatform.
     */
    __repr__(): string {
        return`<EntityPlatform domain=${this.domain} platform_name=${this.platform_name} config_entry=${this.config_entry}>`
    }

    // @callback
    /**
     * Get or create a semaphore for parallel updates.

        Semaphore will be created on demand because we base it off if update method is async or not.

        If parallel updates is set to 0, we skip the semaphore.
        If parallel updates is set to a number, we initialize the semaphore to that number.
        The default value for parallel requests is decided based on the first entity that is added to Home Assistant.
        It's 0 if the entity defines the async_update method, else it's 1.

     */
    _get_parallel_updates_semaphore(
        entity_has_async_update: boolean
    ): Optional<asyncio.Semaphore> {
        if (this.parallel_updates_created) {
            return this.parallel_updates
        }

        this.parallel_updates_created = true

        parallel_updates = getattr(this.platform, "PARALLEL_UPDATES", null)

        if (!parallel_updates and !entity_has_async_update) {
            parallel_updates = 1
        }

        if (parallel_updates === 0) {
            parallel_updates = null
        }

        if (parallel_updates is !null) {
            this.parallel_updates = asyncio.Semaphore(parallel_updates)
        }

        return this.parallel_updates
    }

    async def async_setup(platform_config, discovery_info=null):  // type: ignore[no-untyped-def]
        """Set up the platform from a config file."""
        platform = this.platform
        hass = this.hass

        if (!hasattr(platform, "async_setup_platform") and !hasattr(
            platform, "setup_platform"
        ) {
            this.logger.error(
                "The %s platform for the %s integration does not support platform setup. Please remove it from your config.",
                this.platform_name,
                this.domain,
            )
            return
        }

        // @callback
        /**
         * Get task to set up platform.
         */
        async_create_setup_task(): Coroutine {
            if (getattr(platform, "async_setup_platform", null) {
                return platform.async_setup_platform(  // type: ignore
                    hass,
                    platform_config,
                    this._async_schedule_add_entities,
                    discovery_info,
                )
            }

            // This should not be replaced with hass.async_add_job because
            // we don't want to track this task in case it blocks startup.
            return hass.loop.run_in_executor(  // type: ignore[return-value]
                null,
                platform.setup_platform,  // type: ignore
                hass,
                platform_config,
                this._schedule_add_entities,
                discovery_info,
            )
        }

        await this._async_setup_platform(async_create_setup_task)

    /**
     * Set up the platform from a config entry.
     */
    async async_setup_entry(config_entry: config_entries.ConfigEntry): boolean {
        // Store it so that we can save config entry ID in entity registry
        this.config_entry = config_entry
        platform = this.platform

        // @callback
        def async_create_setup_task():  // type: ignore[no-untyped-def]
            """Get task to set up platform."""
            return platform.async_setup_entry(  // type: ignore
                this.hass, config_entry, this._async_schedule_add_entities
            )

        return await this._async_setup_platform(async_create_setup_task)
    }

    /**
     * Set up a platform via config file or config entry.

        async_create_setup_task creates a coroutine that sets up platform.

     */
    async _async_setup_platform(
        async_create_setup_task: Callable[[], Coroutine], tries: number = 0
    ): boolean {
        current_platform.set()
        logger = this.logger
        hass = this.hass
        full_name =`${this.domain}.${this.platform_name}`

        logger.info("Setting up %s", full_name)
        warn_task = hass.loop.call_later(
            SLOW_SETUP_WARNING,
            logger.warning,
            "Setup of %s platform %s is taking over %s seconds.",
            this.domain,
            this.platform_name,
            SLOW_SETUP_WARNING,
        )

        try {
            task = async_create_setup_task()

            async with hass.timeout.async_timeout(SLOW_SETUP_MAX_WAIT, this.domain):
                await asyncio.shield(task)

            // Block till all entities are done
            while (this._tasks) {
                pending = [task for task in this._tasks if not task.done()]
                this._tasks.clear()

                if (pending) {
                    await asyncio.gather(*pending)
                }
            }

            hass.config.components.add(full_name)
            this._setup_complete = true
            return true
        }
        catch (e) {
            if (e instanceof PlatformNotReady) {
            tries += 1
            wait_time = min(tries, 6) * PLATFORM_NOT_READY_BASE_WAIT_TIME
            logger.warning(
                "Platform %s not ready yet. Retrying in %d seconds.",
                this.platform_name,
                wait_time,
            )

            async def setup_again(now):  // type: ignore[no-untyped-def]
                """Run setup again."""
                this._async_cancel_retry_setup = null
                await this._async_setup_platform(async_create_setup_task, tries)

            this._async_cancel_retry_setup = async_call_later(
                hass, wait_time, setup_again
            )
            return false
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            logger.error(
                "Setup of platform %s is taking longer than %s seconds."
                " Startup will proceed without waiting any longer.",
                this.platform_name,
                SLOW_SETUP_MAX_WAIT,
            )
            return false
            }
            else {
                throw e;
            }
        }

        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            logger.exception(
                "Error while setting up %s platform for %s",
                this.platform_name,
                this.domain,
            )
            return false
            }
            else {
                throw e;
            }
        }

        finally {
            warn_task.cancel()
        }
    }

    /**
     * Schedule adding entities for a single platform, synchronously.
     */
    _schedule_add_entities(
        new_entities: Iterable["Entity"], update_before_add: boolean = false
    ) {
        run_callback_threadsafe(
            this.hass.loop,
            this._async_schedule_add_entities,
            list(new_entities),
            update_before_add,
        ).result()
    }

    // @callback
    /**
     * Schedule adding entities for a single platform async.
     */
    _async_schedule_add_entities(
        new_entities: Iterable["Entity"], update_before_add: boolean = false
    ) {
        task = this.hass.async_create_task(
            this.async_add_entities(new_entities, update_before_add=update_before_add),
        )

        if (!this._setup_complete) {
            this._tasks.append(task)
        }
    }

    /**
     * Add entities for a single platform.
     */
    add_entities(
        new_entities: Iterable["Entity"], update_before_add: boolean = false
    ) {
        // That avoid deadlocks
        if (update_before_add) {
            this.logger.warning(
                "Call 'add_entities' with update_before_add=true "
                "only inside tests or you can run int a deadlock!"
            )
        }

        asyncio.run_coroutine_threadsafe(
            this.async_add_entities(list(new_entities), update_before_add),
            this.hass.loop,
        ).result()
    }

    /**
     * Add entities for a single platform async.

        This method must be run in the event loop.

     */
    async async_add_entities(
        new_entities: Iterable["Entity"], update_before_add: boolean = false
    ) {
        // handle empty list from component/platform
        if (!new_entities) {
            return
        }

        hass = this.hass

        device_registry = await hass.helpers.device_registry.async_get_registry()
        entity_registry = await hass.helpers.entity_registry.async_get_registry()
        tasks = [
            this._async_add_entity(  // type: ignore
                entity, update_before_add, entity_registry, device_registry
            )
            for entity in new_entities
        ]

        // No entities for processing
        if (!tasks) {
            return
        }

        timeout = max(SLOW_ADD_ENTITY_MAX_WAIT * tasks.length, SLOW_ADD_MIN_TIMEOUT)
        try {
            async with this.hass.timeout.async_timeout(timeout, this.domain):
                await asyncio.gather(*tasks)
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            this.logger.warning(
                "Timed out adding entities for domain %s with platform %s after %ds",
                this.domain,
                this.platform_name,
                timeout,
            )
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof Exception) {
            this.logger.exception(
                "Error adding entities for domain %s with platform %s",
                this.domain,
                this.platform_name,
            )
            raise
            }
            else {
                throw e;
            }
        }


        if (this._async_unsub_polling is !null or !any(
            entity.should_poll for entity in this.entities.values()
        ) {
            return
        }

        this._async_unsub_polling = async_track_time_interval(
            this.hass,
            this._update_entity_states,
            this.scan_interval,
        )
    }

    /**
     * Add an entity to the platform.
     */
    async _async_add_entity(  // type: ignore[no-untyped-def]
        entity, update_before_add, entity_registry, device_registry
    ) {
        if (!entity) {
            throw new ValueError("Entity cannot be null")
        }

        entity.add_to_platform_start(
            this.hass,

            this._get_parallel_updates_semaphore(hasattr(entity, "async_update")),
        )

        // Update properties before we generate the entity_id
        if (update_before_add) {
            try {
                await entity.async_device_update(warning=false)
            }
            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception) {
                this.logger.exception("%s: Error on device update!", this.platform_name)
                entity.add_to_platform_abort()
                return
                }
                else {
                    throw e;
                }
            }

        }

        requested_entity_id = null
        suggested_object_id: Optional<string> = null

        // Get entity_id from unique ID registration
        if (entity.unique_id is !null) {
            if (entity.entity_id is !null) {
                requested_entity_id = entity.entity_id
                suggested_object_id = split_entity_id(entity.entity_id)[1]
            }
            else {
                suggested_object_id = entity.name
            }

            if (this.entity_namespace is !null) {
                suggested_object_id =`${this.entity_namespace} ${suggested_object_id}`
            }

            if (this.config_entry is !null) {
                config_entry_id: Optional<string> = this.config_entry.entry_id
            }
            else {
                config_entry_id = null
            }

            device_info = entity.device_info
            device_id = null

            if (config_entry_id is !null and device_info is !null) {
                processed_dev_info = {"config_entry_id": config_entry_id}
                for key in (
                    "connections",
                    "identifiers",
                    "manufacturer",
                    "model",
                    "name",
                    "default_manufacturer",
                    "default_model",
                    "default_name",
                    "sw_version",
                    "entry_type",
                    "via_device",
                ):
                    if (key in device_info) {
                        processed_dev_info[key] = device_info[key]
                    }

                device = device_registry.async_get_or_create(**processed_dev_info)
                if (device) {
                    device_id = device.id
                }
            }

            disabled_by: Optional<string> = null
            if (!entity.entity_registry_enabled_default) {
                disabled_by = DISABLED_INTEGRATION
            }

            entry = entity_registry.async_get_or_create(
                this.domain,
                this.platform_name,
                entity.unique_id,
                suggested_object_id=suggested_object_id,
                config_entry=this.config_entry,
                device_id=device_id,
                known_object_ids=this.entities.keys(),
                disabled_by=disabled_by,
                capabilities=entity.capability_attributes,
                supported_features=entity.supported_features,
                device_class=entity.device_class,
                unit_of_measurement=entity.unit_of_measurement,
                original_name=entity.name,
                original_icon=entity.icon,
            )

            entity.registry_entry = entry
            entity.entity_id = entry.entity_id

            if (entry.disabled) {
                this.logger.info(
                    "Not adding entity %s because it's disabled",
                    entry.name
                    or entity.name
                    or f'"{this.platform_name} {entity.unique_id}"',
                )
                entity.add_to_platform_abort()
                return
            }
        }

        // We won't generate an entity ID if the platform has already set one
        // We will however make sure that platform cannot pick a registered ID
        else if *(entity.entity_id and entity_registry.async_is_registered(
            entity.entity_id
        ) {
            // If entity already registered, convert entity id to suggestion
            suggested_object_id = split_entity_id(entity.entity_id)[1]
            entity.entity_id = null
        }

        // Generate entity ID
        if (!entity.entity_id) {
            suggested_object_id = (
                suggested_object_id or entity.name or DEVICE_DEFAULT_NAME
            )

            if (this.entity_namespace is !null) {
                suggested_object_id =`${this.entity_namespace} ${suggested_object_id}`
            }
            entity.entity_id = entity_registry.async_generate_entity_id(
                this.domain, suggested_object_id, this.entities.keys()
            )
        }

        // Make sure it is valid in case an entity set the value themselves
        if (!valid_entity_id(entity.entity_id) {
            entity.add_to_platform_abort()
            throw new HomeAssistantError`Invalid entity ID: ${entity.entity_id}`)
        }

        already_exists = entity.entity_id in this.entities
        restored = false

        if (!already_exists and !this.hass.states.async_available(
            entity.entity_id
        ) {
            existing = this.hass.states.get(entity.entity_id)
            if (existing is !null and ATTR_RESTORED in existing.attributes) {
                restored = true
            }
            else {
                already_exists = true
            }
        }

        if (already_exists) {
            if (entity.unique_id is !null) {
                msg =`Platform ${this.platform_name} does not generate unique IDs. `
                if (requested_entity_id) {
                    msg +=`ID ${entity.unique_id} is already used by ${entity.entity_id} - ignoring ${requested_entity_id}`
                }
                else {
                    msg +=`ID ${entity.unique_id} already exists - ignoring ${entity.entity_id}`
                }
            }
            else {
                msg =`Entity id already exists - ignoring: ${entity.entity_id}`
            }
            this.logger.error(msg)
            entity.add_to_platform_abort()
            return
        }

        entity_id = entity.entity_id
        this.entities[entity_id] = entity

        if (!restored) {
            // Reserve the state in the state machine
            // because as soon as we return control to the event
            // loop below, another entity could be added
            // with the same id before `entity.add_to_platform_finish()`
            // has a chance to finish.
            this.hass.states.async_reserve(entity.entity_id)
        }

        entity.async_on_remove(lambda: this.entities.pop(entity_id))

        await entity.add_to_platform_finish()
    }

    /**
     * Remove all entities and reset data.

        This method must be run in the event loop.

     */
    async async_reset() {
        if (this._async_cancel_retry_setup is !null) {
            this._async_cancel_retry_setup()
            this._async_cancel_retry_setup = null
        }

        if (!this.entities) {
            return
        }

        tasks = [this.async_remove_entity(entity_id) for entity_id in this.entities]

        await asyncio.gather(*tasks)

        if (this._async_unsub_polling is !null) {
            this._async_unsub_polling()
            this._async_unsub_polling = null
        }
        this._setup_complete = false
    }

    /**
     * Destroy an entity platform.

        Call before discarding the object.

     */
    async async_destroy() {
        await this.async_reset()
        this.hass.data[DATA_ENTITY_PLATFORM][this.platform_name].remove()
    }

    /**
     * Remove entity id from platform.
     */
    async async_remove_entity(entity_id: string) {
        await this.entities[entity_id].async_remove()

        // Clean up polling job if no longer needed
        if (this._async_unsub_polling is !null and !any(
            entity.should_poll for entity in this.entities.values()
        ) {
            this._async_unsub_polling()
            this._async_unsub_polling = null
        }
    }

    /**
     * Extract all known and available entities from a service call.

        Will return an empty list if entities specified but unknown.

        This method must be run in the event loop.

     */
    async async_extract_from_service(
        service_call: ServiceCall, expand_group: boolean = true
    ): "Entity"[] {
        return await service.async_extract_entities(
            this.hass, this.entities.values(), service_call, expand_group
        )
    }

    // @callback
    def async_register_entity_service(name, schema, func, required_features=null):  // type: ignore[no-untyped-def]
        """Register an entity service.

        Services will automatically be shared by all platforms of the same domain.
        """
        if (this.hass.services.has_service(this.platform_name, name) {
            return
        }

        if (schema instanceof dict) {
            schema = cv.make_entity_service_schema(schema)
        }

        /**
         * Handle the service.
         */
        async handle_service(call: ServiceCall) {
            await service.entity_service_call(
                this.hass,
                [
                    plf
                    for plf in this.hass.data[DATA_ENTITY_PLATFORM][this.platform_name]
                    if (plf.domain === this.domain
                ],
                func,
                call,
                required_features,
            )
        }

        this.hass.services.async_register(
            this.platform_name, name, handle_service, schema
        )

    /**
     * Update the states of all the polling entities.

        To protect from flooding the executor, we will update async entities
        in parallel and other entities sequential.

        This method must be run in the event loop.

     */
    async _update_entity_states(now) {
                    }
        if (!this._process_updates) {
            this._process_updates = asyncio.Lock()
        }
        if (this._process_updates.locked() {
            this.logger.warning(
                "Updating %s %s took longer than the scheduled update intrval %s",
                this.platform_name,
                this.domain,
                this.scan_interval,
            )
            return
        }

        async with this._process_updates:
            tasks = []
            for(const entity of this.entities.values()) {
                if (!entity.should_poll) {
                    continue
                }
                tasks.append(entity.async_update_ha_state(true))
            }

            if (tasks) {
                await asyncio.gather(*tasks)
            }
    }
}

export const current_platform: ContextVar[Optional[EntityPlatform]]  = ContextVar(
    "current_platform", default=null
)


// @callback
/**
 * Find existing platforms.
 */
export function async_get_platforms(
    hass: HomeAssistantType, integration_name: string
): EntityPlatform[] {
    if (
        DATA_ENTITY_PLATFORM !in hass.data
        or integration_name !in hass.data[DATA_ENTITY_PLATFORM]
    ) {
        return []
    }

    platforms: EntityPlatform] = hass.data[DATA_ENTITY_PLATFORM][integration_name[]

    return platforms
}
