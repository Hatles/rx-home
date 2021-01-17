/**
 * An abstract class for entities.
 */
from abc import ABC
import asyncio
from datetime import datetime, timedelta
import functools as ft
import logging
from timeit import default_timer as timer
from typing import any, Awaitable, Dict, Iterable, List, Optional

from homeassistant.config import DATA_CUSTOMIZE
from homeassistant.const import (
    ATTR_ASSUMED_STATE,
    ATTR_DEVICE_CLASS,
    ATTR_ENTITY_PICTURE,
    ATTR_FRIENDLY_NAME,
    ATTR_ICON,
    ATTR_SUPPORTED_FEATURES,
    ATTR_UNIT_OF_MEASUREMENT,
    DEVICE_DEFAULT_NAME,
    STATE_OFF,
    STATE_ON,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    TEMP_CELSIUS,
    TEMP_FAHRENHEIT,
)
from homeassistant.core import CALLBACK_TYPE, Context, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, NoEntitySpecifiedError
from homeassistant.helpers.entity_platform import EntityPlatform
from homeassistant.helpers.entity_registry import RegistryEntry
from homeassistant.helpers.event import Event, async_track_entity_registry_updated_event
from homeassistant.helpers.typing import StateType
from homeassistant.loader import bind_hass
from homeassistant.util import dt as dt_util, ensure_unique_string, slugify

const _LOGGER = logging.getLogger(__name__)
export const SLOW_UPDATE_WARNING = 10
export const DATA_ENTITY_SOURCE = "entity_info"
export const SOURCE_CONFIG_ENTRY = "config_entry"
export const SOURCE_PLATFORM_CONFIG = "platform_config"


// @callback
// @bind_hass
/**
 * Get the entity sources.
 */
export function entity_sources(hass: HomeAssistant): Dict[str, Dict[str, string]] {
    return hass.data.get(DATA_ENTITY_SOURCE, {})
}

/**
 * Generate a unique entity ID based on given entity IDs or used IDs.
 */
export function generate_entity_id(
    entity_id_format: string,
    name: Optional<string>,
    current_ids: Optional<string>[] = null,
    hass: Optional<HomeAssistant> = null,
): string {
    return async_generate_entity_id(entity_id_format, name, current_ids, hass)
}

// @callback
/**
 * Generate a unique entity ID based on given entity IDs or used IDs.
 */
export function async_generate_entity_id(
    entity_id_format: string,
    name: Optional<string>,
    current_ids: Optional[Iterable[str]] = null,
    hass: Optional<HomeAssistant> = null,
): string {

    name = (name or DEVICE_DEFAULT_NAME).lower()
    preferred_string = entity_id_format.format(slugify(name))

    if (current_ids is !null) {
        return ensure_unique_string(preferred_string, current_ids)
    }

    if (!hass) {
        throw new ValueError("Missing required parameter current_ids or hass")
    }

    test_string = preferred_string
    tries = 1
    while (!hass.states.async_available(test_string) {
        tries += 1
        test_string =`${preferred_string}_${tries}`
    }

    return test_string
}

/**
 * An abstract class for Home Assistant entities.
 */
export class Entity extends ABC {

    // SAFE TO OVERWRITE
    // The properties and methods here are safe to overwrite when inheriting
    // this class. These may be used to customize the behavior of the entity.
    entity_id = null  // type: string

    // Owning hass instance. Will be set by EntityPlatform
    hass: Optional<HomeAssistant> = null

    // Owning platform instance. Will be set by EntityPlatform
    platform: Optional<EntityPlatform> = null

    // If we reported if this entity was slow
    _slow_reported = false

    // If we reported this entity is updated while disabled
    _disabled_reported = false

    // Protect for multiple updates
    _update_staged = false

    // Process updates in parallel
    parallel_updates: Optional<asyncio.Semaphore> = null

    // Entry in the entity registry
    registry_entry: Optional<RegistryEntry> = null

    // Hold list for functions to call on remove.
    _on_remove: Optional[CALLBACK_TYPE][] = null

    // Context
    _context: Optional<Context> = null
    _context_set: Optional<datetime> = null

    // If entity is added to an entity platform
    _added = false

    // @property
    /**
     * Return true if entity has to be polled for state.

        false if entity pushes its state to HA.

     */
    should_poll(): boolean {
        return true
    }

    // @property
    /**
     * Return a unique ID.
     */
    unique_id(): Optional<string> {
        return null
    }

    // @property
    /**
     * Return the name of the entity.
     */
    name(): Optional<string> {
        return null
    }

    // @property
    /**
     * Return the state of the entity.
     */
    state(): StateType {
        return STATE_UNKNOWN
    }

    // @property
    /**
     * Return the capability attributes.

        Attributes that explain the capabilities of an entity.

        Implemented by component base class. Convention for attribute names
        is lowercase snake_case.

     */
    capability_attributes(): Optional[Dict[str, any]] {
        return null
    }

    // @property
    /**
     * Return the state attributes.

        Implemented by component base class. Convention for attribute names
        is lowercase snake_case.

     */
    state_attributes(): Optional[Dict[str, any]] {
        return null
    }

    // @property
    /**
     * Return device specific state attributes.

        Implemented by platform classes. Convention for attribute names
        is lowercase snake_case.

     */
    device_state_attributes(): Optional[Dict[str, any]] {
        return null
    }

    // @property
    /**
     * Return device specific attributes.

        Implemented by platform classes.

     */
    device_info(): Optional[Dict[str, any]] {
        return null
    }

    // @property
    /**
     * Return the class of this device, from component DEVICE_CLASSES.
     */
    device_class(): Optional<string> {
        return null
    }

    // @property
    /**
     * Return the unit of measurement of this entity, if any.
     */
    unit_of_measurement(): Optional<string> {
        return null
    }

    // @property
    /**
     * Return the icon to use in the frontend, if any.
     */
    icon(): Optional<string> {
        return null
    }

    // @property
    /**
     * Return the entity picture to use in the frontend, if any.
     */
    entity_picture(): Optional<string> {
        return null
    }

    // @property
    /**
     * Return true if entity is available.
     */
    available(): boolean {
        return true
    }

    // @property
    /**
     * Return true if unable to access real state of the entity.
     */
    assumed_state(): boolean {
        return false
    }

    // @property
    /**
     * Return true if state updates should be forced.

        If true, a state change will be triggered anytime the state property is
        updated, not just when the value changes.

     */
    force_update(): boolean {
        return false
    }

    // @property
    /**
     * Flag supported features.
     */
    supported_features(): Optional<number> {
        return null
    }

    // @property
    /**
     * Time that a context is considered recent.
     */
    context_recent_time(): timedelta {
        return timedelta(seconds=5)
    }

    // @property
    /**
     * Return if the entity should be enabled when first added to the entity registry.
     */
    entity_registry_enabled_default(): boolean {
        return true
    }

    // DO NOT OVERWRITE
    // These properties and methods are either managed by Home Assistant or they
    // are used to perform a very specific function. Overwriting these may
    // produce undesirable effects in the entity's operation.

    // @property
    /**
     * Return if the entity is enabled in the entity registry.

        If an entity is not part of the registry, it cannot be disabled
        and will therefore always be enabled.

     */
    enabled(): boolean {
        return !this.registry_entry or not this.registry_entry.disabled
    }

    // @callback
    /**
     * Set the context the entity currently operates under.
     */
    async_set_context(context: Context) {
        this._context = context
        this._context_set = utcnow()
    }

    /**
     * Update Home Assistant with current state of entity.

        If force_refresh === true will update entity before setting state.

        This method must be run in the event loop.

     */
    async async_update_ha_state(force_refresh: boolean = false) {
        if (!this.hass) {
            throw new RuntimeError`Attribute !hass for ${self}`)
        }

        if (!this.entity_id) {
            throw new NoEntitySpecifiedError(
               `No entity id specified for entity ${this.name}`
            )
        }

        // update entity data
        if (force_refresh) {
            try {
                await this.async_device_update()
            }
            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception) {
                _LOGGER.exception("Update for %s fails", this.entity_id)
                return
                }
                else {
                    throw e;
                }
            }

        }

        this._async_write_ha_state()
    }

    // @callback
    /**
     * Write the state to the state machine.
     */
    async_write_ha_state() {
        if (!this.hass) {
            throw new RuntimeError`Attribute !hass for ${self}`)
        }

        if (!this.entity_id) {
            throw new NoEntitySpecifiedError(
               `No entity id specified for entity ${this.name}`
            )
        }

        this._async_write_ha_state()
    }

    // @callback
    /**
     * Write the state to the state machine.
     */
    _async_write_ha_state() {
        if (this.registry_entry and this.registry_entry.disabled_by) {
            if (!this._disabled_reported) {
                this._disabled_reported = true
                assert this.platform
                _LOGGER.warning(
                    "Entity %s is incorrectly being triggered for updates while it is disabled. This is a bug in the %s integration",
                    this.entity_id,
                    this.platform.platform_name,
                )
            }
            return
        }

        start = timer()

        attr = this.capability_attributes
        attr = dict(attr) if attr else {}

        if (!this.available) {
            state = STATE_UNAVAILABLE
        }
        else {
            sstate = this.state
            state = STATE_UNKNOWN if !sstate else string(sstate)
            attr.update(this.state_attributes or {})
            attr.update(this.device_state_attributes or {})
        }

        unit_of_measurement = this.unit_of_measurement
        if (unit_of_measurement is !null) {
            attr[ATTR_UNIT_OF_MEASUREMENT] = unit_of_measurement
        }

        entry = this.registry_entry
        // pylint: disable=consider-using-ternary
        name = (entry and entry.name) or this.name
        if (name is !null) {
            attr[ATTR_FRIENDLY_NAME] = name
        }

        icon = (entry and entry.icon) or this.icon
        if (icon is !null) {
            attr[ATTR_ICON] = icon
        }

        entity_picture = this.entity_picture
        if (entity_picture is !null) {
            attr[ATTR_ENTITY_PICTURE] = entity_picture
        }

        assumed_state = this.assumed_state
        if (assumed_state) {
            attr[ATTR_ASSUMED_STATE] = assumed_state
        }

        supported_features = this.supported_features
        if (supported_features is !null) {
            attr[ATTR_SUPPORTED_FEATURES] = supported_features
        }

        device_class = this.device_class
        if (device_class is !null) {
            attr[ATTR_DEVICE_CLASS] = string(device_class)
        }

        end = timer()

        if (end - start > 0.4 and !this._slow_reported) {
            this._slow_reported = true
            extra = ""
            if ("custom_components" in type().__module__) {
                extra = "Please report it to the custom component author."
            }
            else {
                extra = (
                    "Please create a bug report at "
                    "https://github.com/home-assistant/core/issues?q=is%3Aopen+is%3Aissue"
                )
                if (this.platform) {
                    extra += (
                       `+label%3A%22integration%3A+${this.platform.platform_name}%22`
                    )
                }
            }

            _LOGGER.warning(
                "Updating state for %s (%s) took %.3f seconds. %s",
                this.entity_id,
                type(),
                end - start,
                extra,
            )
        }

        // Overwrite properties that have been set in the config file.
        assert this.hass
        if (DATA_CUSTOMIZE in this.hass.data) {
            attr.update(this.hass.data[DATA_CUSTOMIZE].get(this.entity_id))
        }

        // Convert temperature if we detect one
        try {
            unit_of_measure = attr.get(ATTR_UNIT_OF_MEASUREMENT)
            units = this.hass.config.units
            if (
                unit_of_measure in (TEMP_CELSIUS, TEMP_FAHRENHEIT)
                and unit_of_measure !== units.temperature_unit
            ) {
                prec = state.length - state.index(".") - 1 if "." in state else 0
                temp = units.temperature(float(state), unit_of_measure)
                state = string(round(temp) if prec === 0 else round(temp, prec))
                attr[ATTR_UNIT_OF_MEASUREMENT] = units.temperature_unit
            }
        }
        catch (e) {
            if (e instanceof ValueError) {
            // Could not convert state to number
            pass
            }
            else {
                throw e;
            }
        }


        if (
            this._context_set is !null
            and utcnow() - this._context_set > this.context_recent_time
        ) {
            this._context = null
            this._context_set = null
        }

        this.hass.states.async_set(
            this.entity_id, state, attr, this.force_update, this._context
        )
    }

    /**
     * Schedule an update ha state change task.

        Scheduling the update avoids executor deadlocks.

        Entity state and attributes are read when the update ha state change
        task is executed.
        If state is changed more than once before the ha state change task has
        been executed, the intrmediate state transitions will be missed.

     */
    schedule_update_ha_state(force_refresh: boolean = false) {
        assert this.hass
        this.hass.add_job(this.async_update_ha_state(force_refresh))  // type: ignore
    }

    // @callback
    /**
     * Schedule an update ha state change task.

        This method must be run in the event loop.
        Scheduling the update avoids executor deadlocks.

        Entity state and attributes are read when the update ha state change
        task is executed.
        If state is changed more than once before the ha state change task has
        been executed, the intrmediate state transitions will be missed.

     */
    async_schedule_update_ha_state(force_refresh: boolean = false) {
        if (force_refresh) {
            assert this.hass
            this.hass.async_create_task(this.async_update_ha_state(force_refresh))
        }
        else {
            this.async_write_ha_state()
        }
    }

    /**
     * Process 'update' or 'async_update' from entity.

        This method is a coroutine.

     */
    async async_device_update(warning: boolean = true) {
        if (this._update_staged) {
            return
        }
        this._update_staged = true

        // Process update sequential
        if (this.parallel_updates) {
            await this.parallel_updates.acquire()
        }

        try {
            // pylint: disable=no-member
            if (hasattr("async_update") {
                task = this.hass.async_create_task(this.async_update())  // type: ignore
            }
            else if *(hasattr("update") {
                task = this.hass.async_add_executor_job(this.update)  // type: ignore
            }
            else {
                return
            }

            if (!warning) {
                await task
                return
            }

            finished, _ = await asyncio.wait([task], timeout=SLOW_UPDATE_WARNING)

            for(const done of finished) {
                exc = done.exception()
                if (exc) {
                    throw new exc
                }
                return
            }

            _LOGGER.warning(
                "Update of %s is taking over %s seconds",
                this.entity_id,
                SLOW_UPDATE_WARNING,
            )
            await task
        }
        finally {
            this._update_staged = false
            if (this.parallel_updates) {
                this.parallel_updates.release()
            }
        }
    }

    // @callback
    /**
     * Add a function to call when entity removed.
     */
    async_on_remove(func: CALLBACK_TYPE) {
        if (!this._on_remove) {
            this._on_remove = []
        }
        this._on_remove.append(func)
    }

    /**
     * Run when entity has been removed from entity registry.

        To be extended by integrations.

     */
    async async_removed_from_registry() {
    }

    // @callback
    /**
     * Start adding an entity to a platform.
     */
    add_to_platform_start(

        hass: HomeAssistant,
        platform: EntityPlatform,
        parallel_updates: Optional<asyncio.Semaphore>,
    ) {
        if (this._added) {
            throw new HomeAssistantError(
               `Entity ${this.entity_id} cannot be added a second time to an entity platform`
            )
        }

        this.hass = hass
        this.platform = platform
        this.parallel_updates = parallel_updates
        this._added = true
    }

    // @callback
    /**
     * Abort adding an entity to a platform.
     */
    add_to_platform_abort() {
        this.hass = null
        this.platform = null
        this.parallel_updates = null
        this._added = false
    }

    /**
     * Finish adding an entity to a platform.
     */
    async add_to_platform_finish() {
        await this.async_internal_added_to_hass()
        await this.async_added_to_hass()
        this.async_write_ha_state()
    }

    /**
     * Remove entity from Home Assistant.
     */
    async async_remove() {
        assert this.hass

        if (this.platform and !this._added) {
            throw new HomeAssistantError(
               `Entity ${this.entity_id} async_remove called twice`
            )
        }

        this._added = false

        if (this._on_remove is !null) {
            while (this._on_remove) {
                this._on_remove.pop()()
            }
        }

        await this.async_internal_will_remove_from_hass()
        await this.async_will_remove_from_hass()

        this.hass.states.async_remove(this.entity_id, context=this._context)
    }

    /**
     * Run when entity about to be added to hass.

        To be extended by integrations.

     */
    async async_added_to_hass() {
    }

    /**
     * Run when entity will be removed from hass.

        To be extended by integrations.

     */
    async async_will_remove_from_hass() {
    }

    /**
     * Run when entity about to be added to hass.

        Not to be extended by integrations.

     */
    async async_internal_added_to_hass() {
        assert this.hass

        if (this.platform) {
            info = {"domain": this.platform.platform_name}

            if (this.platform.config_entry) {
                info["source"] = SOURCE_CONFIG_ENTRY
                info["config_entry"] = this.platform.config_entry.entry_id
            }
            else {
                info["source"] = SOURCE_PLATFORM_CONFIG
            }

            this.hass.data.setdefault(DATA_ENTITY_SOURCE, {})[this.entity_id] = info
        }

        if (this.registry_entry is !null) {
            // This is an assert as it should never happen, but helps in tests
            assert (
                not this.registry_entry.disabled_by
            ),`Entity ${this.entity_id} is being added while it's disabled`

            this.async_on_remove(
                async_track_entity_registry_updated_event(
                    this.hass, this.entity_id, this._async_registry_updated
                )
            )
        }
    }

    /**
     * Run when entity will be removed from hass.

        Not to be extended by integrations.

     */
    async async_internal_will_remove_from_hass() {
        if (this.platform) {
            assert this.hass
            this.hass.data[DATA_ENTITY_SOURCE].pop(this.entity_id)
        }
    }

    /**
     * Handle entity registry update.
     */
    async _async_registry_updated(event: Event) {
        data = event.data
        if (data["action"] === "remove") {
            await this.async_removed_from_registry()
            await this.async_remove()
        }

        if (data["action"] !== "update") {
            return
        }

        assert this.hass
        ent_reg = await this.hass.helpers.entity_registry.async_get_registry()
        old = this.registry_entry
        this.registry_entry = ent_reg.async_get(data["entity_id"])
        assert this.registry_entry

        if (this.registry_entry.disabled_by is !null) {
            await this.async_remove()
            return
        }

        assert old
        if (this.registry_entry.entity_id === old.entity_id) {
            this.async_write_ha_state()
            return
        }

        await this.async_remove()

        assert this.platform
        this.entity_id = this.registry_entry.entity_id
        await this.platform.async_add_entities([self])
    }

    /**
     * Return the comparison.
     */
    __eq__(other: any): boolean {
        if (!other instanceof this.__class__) {
            return false
        }

        // Can only decide equality if both have a unique id
        if (!this.unique_id or !other.unique_id) {
            return false
        }

        // Ensure they belong to the same platform
        if (this.platform is !null or other.platform is !null) {
            if (!this.platform or !other.platform) {
                return false
            }

            if (this.platform.platform !== other.platform.platform) {
                return false
            }
        }

        return this.unique_id === other.unique_id
    }

    /**
     * Return the representation.
     */
    __repr__(): string {
        return`<Entity ${this.name}: ${this.state}>`
    }

    /**
     * Process request batched.
     */
    async async_request_call(coro: Awaitable) {
        if (this.parallel_updates) {
            await this.parallel_updates.acquire()
        }

        try {
            await coro
        }
        finally {
            if (this.parallel_updates) {
                this.parallel_updates.release()
            }
        }
    }
}

/**
 * An abstract class for entities that can be turned on and off.
 */
export class ToggleEntity extends Entity {

    // @property
    /**
     * Return the state.
     */
    state(): string {
        return STATE_ON if this.is_on else STATE_OFF
    }

    // @property
    /**
     * Return true if entity is on.
     */
    is_on(): boolean {
        throw new NotImplementedError()
    }

    /**
     * Turn the entity on.
     */
    turn_on(**kwargs: any) {
        throw new NotImplementedError()
    }

    /**
     * Turn the entity on.
     */
    async async_turn_on(**kwargs: any) {
        assert this.hass
        await this.hass.async_add_executor_job(ft.partial(this.turn_on, **kwargs))
    }

    /**
     * Turn the entity off.
     */
    turn_off(**kwargs: any) {
        throw new NotImplementedError()
    }

    /**
     * Turn the entity off.
     */
    async async_turn_off(**kwargs: any) {
        assert this.hass
        await this.hass.async_add_executor_job(ft.partial(this.turn_off, **kwargs))
    }

    /**
     * Toggle the entity.
     */
    toggle(**kwargs: any) {
        if (this.is_on) {
            this.turn_off(**kwargs)
        }
        else {
            this.turn_on(**kwargs)
        }
    }

    /**
     * Toggle the entity.
     */
    async async_toggle(**kwargs: any) {
        if (this.is_on) {
            await this.async_turn_off(**kwargs)
        }
        else {
            await this.async_turn_on(**kwargs)
        }
    }
}
