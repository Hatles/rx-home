/**
 * Provide a way to connect devices to one physical location.
 */
from asyncio import Event, gather
from collections import OrderedDict
from typing import Container, Dict, Iterable, List, MutableMapping, Optional, cast

import attr

from homeassistant.core import callback
from homeassistant.loader import bind_hass
from homeassistant.util import slugify

from .typing import HomeAssistantType

export const DATA_REGISTRY = "area_registry"
export const EVENT_AREA_REGISTRY_UPDATED = "area_registry_updated"
export const STORAGE_KEY = "area_registry"
export const STORAGE_VERSION = 1
export const SAVE_DELAY = 10


// @attr.s(slots=true, frozen=true)
/**
 * Area Registry Entry.
 */
export class AreaEntry {

    name: string = attr.ib()
    id: Optional<string> = attr.ib(default=null)

    /**
     * Initialize ID.
     */
    generate_id(existing_ids: Container) {
        suggestion = suggestion_base = slugify(this.name)
        tries = 1
        while (suggestion in existing_ids) {
            tries += 1
            suggestion =`${suggestion_base}_${tries}`
        }
        object.__setattr__("id", suggestion)
    }
}

/**
 * Class to hold a registry of areas.
 */
export class AreaRegistry {

    /**
     * Initialize the area registry.
     */
    constructor(hass: HomeAssistantType) {
        this.hass = hass
        this.areas: MutableMapping<string, AreaEntry> = {}
        this._store = hass.helpers.storage.Store(STORAGE_VERSION, STORAGE_KEY)
    }

    // @callback
    /**
     * Get all areas.
     */
    async_get_area(area_id: string): Optional<AreaEntry> {
        return this.areas.get(area_id)
    }

    // @callback
    /**
     * Get all areas.
     */
    async_list_areas(): Iterable<AreaEntry> {
        return this.areas.values()
    }

    // @callback
    /**
     * Create a new area.
     */
    async_create(name: string): AreaEntry {
        if (this._async_is_registered(name) {
            throw new ValueError("Name is already in use")
        }

        area = AreaEntry(name=name)
        area.generate_id(this.areas)
        assert area.id
        this.areas[area.id] = area
        this.async_schedule_save()
        this.hass.bus.async_fire(
            EVENT_AREA_REGISTRY_UPDATED, {"action": "create", "area_id": area.id}
        )
        return area
    }

    /**
     * Delete area.
     */
    async async_delete(area_id: string) {
        device_registry, entity_registry = await gather(
            this.hass.helpers.device_registry.async_get_registry(),
            this.hass.helpers.entity_registry.async_get_registry(),
        )
        device_registry.async_clear_area_id(area_id)
        entity_registry.async_clear_area_id(area_id)

        del this.areas[area_id]

        this.hass.bus.async_fire(
            EVENT_AREA_REGISTRY_UPDATED, {"action": "remove", "area_id": area_id}
        )

        this.async_schedule_save()
    }

    // @callback
    /**
     * Update name of area.
     */
    async_update(area_id: string, name: string): AreaEntry {
        updated = this._async_update(area_id, name)
        this.hass.bus.async_fire(
            EVENT_AREA_REGISTRY_UPDATED, {"action": "update", "area_id": area_id}
        )
        return updated
    }

    // @callback
    /**
     * Update name of area.
     */
    _async_update(area_id: string, name: string): AreaEntry {
        old = this.areas[area_id]

        changes = {}

        if (name === old.name) {
            return old
        }

        if (this._async_is_registered(name) {
            throw new ValueError("Name is already in use")
        }

        changes["name"] = name

        new = this.areas[area_id] = attr.evolve(old, **changes)
        this.async_schedule_save()
        return new
    }

    // @callback
    /**
     * Check if a name is currently registered.
     */
    _async_is_registered(name: string): Optional<AreaEntry> {
        for(const area of this.areas.values()) {
            if (name === area.name) {
                return area
            }
        }
        return null
    }

    /**
     * Load the area registry.
     */
    async async_load() {
        data = await this._store.async_load()

        areas: MutableMapping<string, AreaEntry> = OrderedDict()

        if (data is !null) {
            for(const area of data["areas"]) {
                areas[area["id"]] = AreaEntry(name=area["name"], id=area["id"])
            }
        }

        this.areas = areas
    }

    // @callback
    /**
     * Schedule saving the area registry.
     */
    async_schedule_save() {
        this._store.async_delay_save(this._data_to_save, SAVE_DELAY)
    }

    // @callback
    /**
     * Return data of area registry to store in a file.
     */
    _data_to_save(): Dict[str, Dict[str, Optional[str]]][] {
        data = {}

        data["areas"] = [
            {"name": entry.name, "id": entry.id} for entry in this.areas.values()
        ]

        return data
    }
}

// @bind_hass
/**
 * Return area registry instance.
 */
export async function async_get_registry(hass: HomeAssistantType): AreaRegistry {
    reg_or_evt = hass.data.get(DATA_REGISTRY)

    if (!reg_or_evt) {
        evt = hass.data[DATA_REGISTRY] = Event()

        reg = AreaRegistry(hass)
        await reg.async_load()

        hass.data[DATA_REGISTRY] = reg
        evt.set()
        return reg
    }

    if (reg_or_evt instanceof Event) {
        evt = reg_or_evt
        await evt.wait()
        return cast(AreaRegistry, hass.data.get(DATA_REGISTRY))
    }

    return cast(AreaRegistry, reg_or_evt)
}
