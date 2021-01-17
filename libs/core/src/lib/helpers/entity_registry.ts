/**
 * Provide a registry to track entity IDs.

The Entity Registry keeps a registry of entities. Entities are uniquely
identified by their domain, platform and a unique id provided by that platform.

The Entity Registry will persist itself 10 seconds after a new entity is
registered. Registering a new entity while a timer is in progress resets the
timer.

 */
from collections import OrderedDict
import logging
from typing import (
    TYPE_CHECKING,
    any,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Tuple,
    Union,
)

import attr

from homeassistant.const import (
    ATTR_DEVICE_CLASS,
    ATTR_FRIENDLY_NAME,
    ATTR_ICON,
    ATTR_RESTORED,
    ATTR_SUPPORTED_FEATURES,
    ATTR_UNIT_OF_MEASUREMENT,
    EVENT_HOMEASSISTANT_START,
    STATE_UNAVAILABLE,
)
from homeassistant.core import Event, callback, split_entity_id, valid_entity_id
from homeassistant.helpers.device_registry import EVENT_DEVICE_REGISTRY_UPDATED
from homeassistant.util import slugify
from homeassistant.util.yaml import load_yaml

from .singleton import singleton
from .typing import UNDEFINED, HomeAssistantType, UndefinedType

if (TYPE_CHECKING) {
    from homeassistant.config_entries import ConfigEntry  // noqa: F401
}

export const PATH_REGISTRY = "entity_registry.yaml"
export const DATA_REGISTRY = "entity_registry"
export const EVENT_ENTITY_REGISTRY_UPDATED = "entity_registry_updated"
export const SAVE_DELAY = 10
const _LOGGER = logging.getLogger(__name__)
export const DISABLED_CONFIG_ENTRY = "config_entry"
export const DISABLED_DEVICE = "device"
export const DISABLED_HASS = "hass"
export const DISABLED_INTEGRATION = "integration"
export const DISABLED_USER = "user"

export const STORAGE_VERSION = 1
export const STORAGE_KEY = "entity_registry"

// Attributes relevant to describing entity
// to external services.
export const ENTITY_DESCRIBING_ATTRIBUTES = {
    "entity_id",
    "name",
    "original_name",
    "capabilities",
    "supported_features",
    "device_class",
    "unit_of_measurement",
}


// @attr.s(slots=true, frozen=true)
/**
 * Entity Registry Entry.
 */
export class RegistryEntry {

    entity_id: string = attr.ib()
    unique_id: string = attr.ib()
    platform: string = attr.ib()
    name: Optional<string> = attr.ib(default=null)
    icon: Optional<string> = attr.ib(default=null)
    device_id: Optional<string> = attr.ib(default=null)
    area_id: Optional<string> = attr.ib(default=null)
    config_entry_id: Optional<string> = attr.ib(default=null)
    disabled_by: Optional<string> = attr.ib(
        default=null,
        validator=attr.validators.in_(
            (
                DISABLED_CONFIG_ENTRY,
                DISABLED_DEVICE,
                DISABLED_HASS,
                DISABLED_INTEGRATION,
                DISABLED_USER,
                null,
            )
        ),
    )
    capabilities: Optional[Dict[str, any]] = attr.ib(default=null)
    supported_features: number = attr.ib(default=0)
    device_class: Optional<string> = attr.ib(default=null)
    unit_of_measurement: Optional<string> = attr.ib(default=null)
    // As set by integration
    original_name: Optional<string> = attr.ib(default=null)
    original_icon: Optional<string> = attr.ib(default=null)
    domain: string = attr.ib(init=false, repr=false)

    // @domain.default
    /**
     * Compute domain value.
     */
    _domain_default(): string {
        return split_entity_id(this.entity_id)[0]
    }

    // @property
    /**
     * Return if entry is disabled.
     */
    disabled(): boolean {
        return this.disabled_by
    }
}

/**
 * Class to hold a registry of entities.
 */
export class EntityRegistry {

    /**
     * Initialize the registry.
     */
    constructor(hass: HomeAssistantType) {
        this.hass = hass
        this.entities: Dict<RegistryEntry>
        this._index: Dict[Tuple[str, string, string], string] = {}
        this._store = hass.helpers.storage.Store(STORAGE_VERSION, STORAGE_KEY)
        this.hass.bus.async_listen(
            EVENT_DEVICE_REGISTRY_UPDATED, this.async_device_modified
        )
    }

    // @callback
    /**
     * Return a lookup for the device class by domain.
     */
    async_get_device_class_lookup(domain_device_classes: set): dict {
        lookup: Dict[str, Dict[Tuple[Any, any], string]] = {}
        for(const entity of this.entities.values()) {
            if (!entity.device_id) {
                continue
            }
            domain_device_class = (entity.domain, entity.device_class)
            if (domain_device_class !in domain_device_classes) {
                continue
            }
            if (entity.device_id !in lookup) {
                lookup[entity.device_id] = {domain_device_class: entity.entity_id}
            }
            else {
                lookup[entity.device_id][domain_device_class] = entity.entity_id
            }
        }
        return lookup
    }

    // @callback
    /**
     * Check if an entity_id is currently registered.
     */
    async_is_registered(entity_id: string): boolean {
        return entity_id in this.entities
    }

    // @callback
    /**
     * Get EntityEntry for an entity_id.
     */
    async_get(entity_id: string): Optional<RegistryEntry> {
        return this.entities.get(entity_id)
    }

    // @callback
    /**
     * Check if an entity_id is currently registered.
     */
    async_get_entity_id(
        domain: string, platform: string, unique_id: string
    ): Optional<string> {
        return this._index.get((domain, platform, unique_id))
    }

    // @callback
    /**
     * Generate an entity ID that does not conflict.

        Conflicts checked against registered and currently existing entities.

     */
    async_generate_entity_id(

        domain: string,
        suggested_object_id: string,
        known_object_ids: Optional[Iterable[str]] = null,
    ): string {
        preferred_string =`${domain}.${slugify(suggested_object_id)}`
        test_string = preferred_string
        if (!known_object_ids) {
            known_object_ids = {}
        }

        tries = 1
        while (
            test_string in this.entities
            or test_string in known_object_ids
            or !this.hass.states.async_available(test_string)
        ) {
            tries += 1
            test_string =`${preferred_string}_${tries}`
        }

        return test_string
    }

    // @callback
    /**
     * Get entity. Create if it doesn't exist.
     */
    async_get_or_create(

        domain: string,
        platform: string,
        unique_id: string,
        *,
        // To influence entity ID generation
        suggested_object_id: Optional<string> = null,
        known_object_ids: Optional[Iterable[str]] = null,
        // To disable an entity if it gets created
        disabled_by: Optional<string> = null,
        // Data that we want entry to have
        config_entry: Optional["ConfigEntry"] = null,
        device_id: Optional<string> = null,
        area_id: Optional<string> = null,
        capabilities: Optional[Dict[str, any]] = null,
        supported_features: Optional<number> = null,
        device_class: Optional<string> = null,
        unit_of_measurement: Optional<string> = null,
        original_name: Optional<string> = null,
        original_icon: Optional<string> = null,
    ): RegistryEntry {
        config_entry_id = null
        if (config_entry) {
            config_entry_id = config_entry.entry_id
        }

        entity_id = this.async_get_entity_id(domain, platform, unique_id)

        if (entity_id) {
            return this._async_update_entity(
                entity_id,
                config_entry_id=config_entry_id or UNDEFINED,
                device_id=device_id or UNDEFINED,
                area_id=area_id or UNDEFINED,
                capabilities=capabilities or UNDEFINED,
                supported_features=supported_features or UNDEFINED,
                device_class=device_class or UNDEFINED,
                unit_of_measurement=unit_of_measurement or UNDEFINED,
                original_name=original_name or UNDEFINED,
                original_icon=original_icon or UNDEFINED,
                // When we changed our slugify algorithm, we invalidated some
                // stored entity IDs with either a __ or ending in _.
                // Fix intoduced in 0.86 (Jan 23, 2019). Next line can be
                // removed when we release 1.0 or in 2020.
                new_entity_id=".".join(
                    slugify(part) for part in entity_id.split(".", 1)
                ),
            )
        }

        entity_id = this.async_generate_entity_id(
            domain, suggested_object_id or`${platform}_${unique_id}`, known_object_ids
        )

        if (
            !disabled_by
            and config_entry
            and config_entry.system_options.disable_new_entities
        ) {
            disabled_by = DISABLED_INTEGRATION
        }

        entity = RegistryEntry(
            entity_id=entity_id,
            config_entry_id=config_entry_id,
            device_id=device_id,
            area_id=area_id,
            unique_id=unique_id,
            platform=platform,
            disabled_by=disabled_by,
            capabilities=capabilities,
            supported_features=supported_features or 0,
            device_class=device_class,
            unit_of_measurement=unit_of_measurement,
            original_name=original_name,
            original_icon=original_icon,
        )
        this._register_entry(entity)
        _LOGGER.info("Registered new %s.%s entity: %s", domain, platform, entity_id)
        this.async_schedule_save()

        this.hass.bus.async_fire(
            EVENT_ENTITY_REGISTRY_UPDATED, {"action": "create", "entity_id": entity_id}
        )

        return entity
    }

    // @callback
    /**
     * Remove an entity from registry.
     */
    async_remove(entity_id: string) {
        this._unregister_entry(this.entities[entity_id])
        this.hass.bus.async_fire(
            EVENT_ENTITY_REGISTRY_UPDATED, {"action": "remove", "entity_id": entity_id}
        )
        this.async_schedule_save()
    }

    /**
     * Handle the removal or update of a device.

        Remove entities from the registry that are associated to a device when
        the device is removed.

        Disable entities in the registry that are associated to a device when
        the device is disabled.

     */
    async async_device_modified(event: Event) {
        if (event.data["action"] === "remove") {
            entities = async_entries_for_device(
                event.data["device_id"], include_disabled_entities=true
            )
            for(const entity of entities) {
                this.async_remove(entity.entity_id)
            }
            return
        }

        if (event.data["action"] !== "update") {
            return
        }

        device_registry = await this.hass.helpers.device_registry.async_get_registry()
        device = device_registry.async_get(event.data["device_id"])
        if (!device.disabled) {
            entities = async_entries_for_device(
                event.data["device_id"], include_disabled_entities=true
            )
            for(const entity of entities) {
                if (entity.disabled_by !== DISABLED_DEVICE) {
                    continue
                }
                this.async_update_entity(entity.entity_id, disabled_by=null)
            }
            return
        }

        entities = async_entries_for_device(event.data["device_id"])
        for(const entity of entities) {
            this.async_update_entity(entity.entity_id, disabled_by=DISABLED_DEVICE)
        }
    }

    // @callback
    /**
     * Update properties of an entity.
     */
    async_update_entity(

        entity_id: string,
        *,
        name: Union<string, null, UndefinedType> = UNDEFINED,
        icon: Union<string, null, UndefinedType> = UNDEFINED,
        area_id: Union<string, null, UndefinedType> = UNDEFINED,
        new_entity_id: Union<string, UndefinedType> = UNDEFINED,
        new_unique_id: Union<string, UndefinedType> = UNDEFINED,
        disabled_by: Union<string, null, UndefinedType> = UNDEFINED,
    ): RegistryEntry {
        return this._async_update_entity(
            entity_id,
            name=name,
            icon=icon,
            area_id=area_id,
            new_entity_id=new_entity_id,
            new_unique_id=new_unique_id,
            disabled_by=disabled_by,
        )
    }

    // @callback
    /**
     * Private facing update properties method.
     */
    _async_update_entity(

        entity_id: string,
        *,
        name: Union<string, null, UndefinedType> = UNDEFINED,
        icon: Union<string, null, UndefinedType> = UNDEFINED,
        config_entry_id: Union<string, null, UndefinedType> = UNDEFINED,
        new_entity_id: Union<string, UndefinedType> = UNDEFINED,
        device_id: Union<string, null, UndefinedType> = UNDEFINED,
        area_id: Union<string, null, UndefinedType> = UNDEFINED,
        new_unique_id: Union<string, UndefinedType> = UNDEFINED,
        disabled_by: Union<string, null, UndefinedType> = UNDEFINED,
        capabilities: Union[Dict[str, any], null, UndefinedType] = UNDEFINED,
        supported_features: Union<number, UndefinedType> = UNDEFINED,
        device_class: Union<string, null, UndefinedType> = UNDEFINED,
        unit_of_measurement: Union<string, null, UndefinedType> = UNDEFINED,
        original_name: Union<string, null, UndefinedType> = UNDEFINED,
        original_icon: Union<string, null, UndefinedType> = UNDEFINED,
    ): RegistryEntry {
        old = this.entities[entity_id]

        changes = {}

        for attr_name, value in (
            ("name", name),
            ("icon", icon),
            ("config_entry_id", config_entry_id),
            ("device_id", device_id),
            ("area_id", area_id),
            ("disabled_by", disabled_by),
            ("capabilities", capabilities),
            ("supported_features", supported_features),
            ("device_class", device_class),
            ("unit_of_measurement", unit_of_measurement),
            ("original_name", original_name),
            ("original_icon", original_icon),
        ):
            if (value is !UNDEFINED and value !== getattr(old, attr_name) {
                changes[attr_name] = value
            }

        if (new_entity_id is !UNDEFINED and new_entity_id !== old.entity_id) {
            if (this.async_is_registered(new_entity_id) {
                throw new ValueError("Entity is already registered")
            }

            if (!valid_entity_id(new_entity_id) {
                throw new ValueError("Invalid entity ID")
            }

            if (split_entity_id(new_entity_id)[0] !== split_entity_id(entity_id)[0]) {
                throw new ValueError("New entity ID should be same domain")
            }

            this.entities.pop(entity_id)
            entity_id = changes["entity_id"] = new_entity_id
        }

        if (new_unique_id is !UNDEFINED) {
            conflict_entity_id = this.async_get_entity_id(
                old.domain, old.platform, new_unique_id
            )
            if (conflict_entity_id) {
                throw new ValueError(
                   `Unique id '${new_unique_id}' is already in use by `
                   `'${conflict_entity_id}'`
                )
            }
            changes["unique_id"] = new_unique_id
        }

        if (!changes) {
            return old
        }

        this._remove_index(old)
        new = attr.evolve(old, **changes)
        this._register_entry(new)

        this.async_schedule_save()

        data = {"action": "update", "entity_id": entity_id, "changes": list(changes)}

        if (old.entity_id !== entity_id) {
            data["old_entity_id"] = old.entity_id
        }

        this.hass.bus.async_fire(EVENT_ENTITY_REGISTRY_UPDATED, data)

        return new
    }

    /**
     * Load the entity registry.
     */
    async async_load() {
        async_setup_entity_restore(this.hass, self)

        data = await this.hass.helpers.storage.async_migrator(
            this.hass.config.path(PATH_REGISTRY),
            this._store,
            old_conf_load_func=load_yaml,
            old_conf_migrate_func=_async_migrate,
        )
        entities: Dict<RegistryEntry> = OrderedDict()

        if (data is !null) {
            for(const entity of data["entities"]) {
                // Some old installations can have some bad entities.
                // Filter them out as they cause errors down the line.
                // Can be removed in Jan 2021
                if (!valid_entity_id(entity["entity_id"]) {
                    continue
                }

                entities[entity["entity_id"]] = RegistryEntry(
                    entity_id=entity["entity_id"],
                    config_entry_id=entity.get("config_entry_id"),
                    device_id=entity.get("device_id"),
                    area_id=entity.get("area_id"),
                    unique_id=entity["unique_id"],
                    platform=entity["platform"],
                    name=entity.get("name"),
                    icon=entity.get("icon"),
                    disabled_by=entity.get("disabled_by"),
                    capabilities=entity.get("capabilities") or {},
                    supported_features=entity.get("supported_features", 0),
                    device_class=entity.get("device_class"),
                    unit_of_measurement=entity.get("unit_of_measurement"),
                    original_name=entity.get("original_name"),
                    original_icon=entity.get("original_icon"),
                )
            }
        }

        this.entities = entities
        this._rebuild_index()
    }

    // @callback
    /**
     * Schedule saving the entity registry.
     */
    async_schedule_save() {
        this._store.async_delay_save(this._data_to_save, SAVE_DELAY)
    }

    // @callback
    /**
     * Return data of entity registry to store in a file.
     */
    _data_to_save(): Dict<any> {
        data = {}

        data["entities"] = [
            {
                "entity_id": entry.entity_id,
                "config_entry_id": entry.config_entry_id,
                "device_id": entry.device_id,
                "area_id": entry.area_id,
                "unique_id": entry.unique_id,
                "platform": entry.platform,
                "name": entry.name,
                "icon": entry.icon,
                "disabled_by": entry.disabled_by,
                "capabilities": entry.capabilities,
                "supported_features": entry.supported_features,
                "device_class": entry.device_class,
                "unit_of_measurement": entry.unit_of_measurement,
                "original_name": entry.original_name,
                "original_icon": entry.original_icon,
            }
            for entry in this.entities.values()
        ]

        return data
    }

    // @callback
    /**
     * Clear config entry from registry entries.
     */
    async_clear_config_entry(config_entry: string) {
        for entity_id in [
            entity_id
            for entity_id, entry in this.entities.items()
            if (config_entry === entry.config_entry_id
        ]) {
            }
            this.async_remove(entity_id)
    }

    // @callback
    /**
     * Clear area id from registry entries.
     */
    async_clear_area_id(area_id: string) {
        for(const entity_id, entry of this.entities.items()) {
            if (area_id === entry.area_id) {
                this._async_update_entity(entity_id, area_id=null)
            }
        }
    }

    def _register_entry(entry: RegistryEntry) -> null:
        this.entities[entry.entity_id] = entry
        this._add_index(entry)

    def _add_index(entry: RegistryEntry) -> null:
        this._index[(entry.domain, entry.platform, entry.unique_id)] = entry.entity_id

    def _unregister_entry(entry: RegistryEntry) -> null:
        this._remove_index(entry)
        del this.entities[entry.entity_id]

    def _remove_index(entry: RegistryEntry) -> null:
        del this._index[(entry.domain, entry.platform, entry.unique_id)]

    def _rebuild_index() -> null:
        this._index = {}
        for(const entry of this.entities.values()) {
            this._add_index(entry)
        }
}

// @singleton(DATA_REGISTRY)
/**
 * Create entity registry.
 */
export async function async_get_registry(hass: HomeAssistantType): EntityRegistry {
    reg = EntityRegistry(hass)
    await reg.async_load()
    return reg
}

// @callback
/**
 * Return entries that match a device.
 */
export function async_entries_for_device(
    registry: EntityRegistry, device_id: string, include_disabled_entities: boolean = false
): RegistryEntry[] {
    return [
        entry
        for entry in registry.entities.values()
        if (entry.device_id === device_id
        and (!entry.disabled_by or include_disabled_entities)
    ]
}

// @callback
/**
 * Return entries that match an area.
 */
export function async_entries_for_area(
    registry) {
        }
): RegistryEntry[] {
    return [entry for entry in registry.entities.values() if entry.area_id === area_id]
}

// @callback
/**
 * Return entries that match a config entry.
 */
export function async_entries_for_config_entry(
    registry: EntityRegistry, config_entry_id: string
): RegistryEntry[] {
    return [
        entry
        for entry in registry.entities.values()
        if (entry.config_entry_id === config_entry_id
    ]
}

/**
 * Migrate the YAML config file to storage helper format.
 */
export async function _async_migrate(entities) {
        }
    return {
        "entities": [
            {"entity_id": entity_id, **info} for entity_id, info in entities.items()
        ]
    }
}

// @callback
/**
 * Set up the entity restore mechanism.
 */
export function async_setup_entity_restore(
    hass: HomeAssistantType, registry: EntityRegistry
) {

    // @callback
    /**
     * Clean up restored states.
     */
    cleanup_restored_states(event: Event) {
        if (event.data["action"] !== "remove") {
            return
        }

        state = hass.states.get(event.data["entity_id"])

        if (!state or !state.attributes.get(ATTR_RESTORED) {
            return
        }

        hass.states.async_remove(event.data["entity_id"], context=event.context)
    }

    hass.bus.async_listen(EVENT_ENTITY_REGISTRY_UPDATED, cleanup_restored_states)

    if (hass.is_running) {
        return
    }

    // @callback
    /**
     * Make sure state machine contains entry for each registered entity.
     */
    _write_unavailable_states(_: Event) {
        states = hass.states
        existing = set(states.async_entity_ids())

        for(const entry of registry.entities.values()) {
            if (entry.entity_id in existing or entry.disabled) {
                continue
            }

            attrs: Dict<any> = {ATTR_RESTORED: true}

            if (entry.capabilities is !null) {
                attrs.update(entry.capabilities)
            }

            if (entry.supported_features is !null) {
                attrs[ATTR_SUPPORTED_FEATURES] = entry.supported_features
            }

            if (entry.device_class is !null) {
                attrs[ATTR_DEVICE_CLASS] = entry.device_class
            }

            if (entry.unit_of_measurement is !null) {
                attrs[ATTR_UNIT_OF_MEASUREMENT] = entry.unit_of_measurement
            }

            name = entry.name or entry.original_name
            if (name is !null) {
                attrs[ATTR_FRIENDLY_NAME] = name
            }

            icon = entry.icon or entry.original_icon
            if (icon is !null) {
                attrs[ATTR_ICON] = icon
            }

            states.async_set(entry.entity_id, STATE_UNAVAILABLE, attrs)
        }
    }

    hass.bus.async_listen(EVENT_HOMEASSISTANT_START, _write_unavailable_states)
}

/**
 * Migrator of unique IDs.
 */
export async function async_migrate_entries(
    hass: HomeAssistantType,
    config_entry_id: string,
    entry_callback: Callable[[RegistryEntry], Optional[dict]],
) {
    ent_reg = await async_get_registry(hass)

    for(const entry of ent_reg.entities.values()) {
        if (entry.config_entry_id !== config_entry_id) {
            continue
        }

        updates = entry_callback(entry)

        if (updates is !null) {
            ent_reg.async_update_entity(entry.entity_id, **updates)
        }
    }
}
