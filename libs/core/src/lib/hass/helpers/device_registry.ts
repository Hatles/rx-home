/**
 * Provide a way to connect entities belonging to one device.
 */
from collections import OrderedDict
import logging
from typing import TYPE_CHECKING, any, Dict, List, Optional, Set, Tuple, Union

import attr

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import Event, callback
import homeassistant.util.uuid as uuid_util

from .debounce import Debouncer
from .singleton import singleton
from .typing import UNDEFINED, HomeAssistantType, UndefinedType

// mypy: disallow_any_generics

if (TYPE_CHECKING) {
    from . import entity_registry
}

const _LOGGER = logging.getLogger(__name__)

export const DATA_REGISTRY = "device_registry"
export const EVENT_DEVICE_REGISTRY_UPDATED = "device_registry_updated"
export const STORAGE_KEY = "device_registry"
export const STORAGE_VERSION = 1
export const SAVE_DELAY = 10
export const CLEANUP_DELAY = 10

export const CONNECTION_NETWORK_MAC = "mac"
export const CONNECTION_UPNP = "upnp"
export const CONNECTION_ZIGBEE = "zigbee"

export const IDX_CONNECTIONS = "connections"
export const IDX_IDENTIFIERS = "identifiers"
export const REGISTERED_DEVICE = "registered"
export const DELETED_DEVICE = "deleted"

export const DISABLED_INTEGRATION = "integration"
export const DISABLED_USER = "user"


// @attr.s(slots=true, frozen=true)
/**
 * Device Registry Entry.
 */
export class DeviceEntry {

    config_entries: Set<string> = attr.ib(converter=set, factory=set)
    connections: Set[Tuple[str, string]] = attr.ib(converter=set, factory=set)
    identifiers: Set[Tuple[str, string]] = attr.ib(converter=set, factory=set)
    manufacturer: Optional<string> = attr.ib(default=null)
    model: Optional<string> = attr.ib(default=null)
    name: Optional<string> = attr.ib(default=null)
    sw_version: Optional<string> = attr.ib(default=null)
    via_device_id: Optional<string> = attr.ib(default=null)
    area_id: Optional<string> = attr.ib(default=null)
    name_by_user: Optional<string> = attr.ib(default=null)
    entry_type: Optional<string> = attr.ib(default=null)
    id: string = attr.ib(factory=uuid_util.random_uuid_hex)
    // This value is not stored, just used to keep track of events to fire.
    is_new: boolean = attr.ib(default=false)
    disabled_by: Optional<string> = attr.ib(
        default=null,
        validator=attr.validators.in_(
            (
                DISABLED_INTEGRATION,
                DISABLED_USER,
                null,
            )
        ),
    )

    // @property
    /**
     * Return if entry is disabled.
     */
    disabled(): boolean {
        return this.disabled_by
    }
}

// @attr.s(slots=true, frozen=true)
/**
 * Deleted Device Registry Entry.
 */
export class DeletedDeviceEntry {

    config_entries: Set<string> = attr.ib()
    connections: Set[Tuple[str, string]] = attr.ib()
    identifiers: Set[Tuple[str, string]] = attr.ib()
    id: string = attr.ib()

    /**
     * Create DeviceEntry from DeletedDeviceEntry.
     */
    to_device_entry(

        config_entry_id: string,
        connections: Set[Tuple[str, string]],
        identifiers: Set[Tuple[str, string]],
    ): DeviceEntry {
        return DeviceEntry(
            // type ignores: likely https://github.com/python/mypy/issues/8625
            config_entries={config_entry_id},  // type: ignore[arg-type]
            connections=this.connections & connections,  // type: ignore[arg-type]
            identifiers=this.identifiers & identifiers,  // type: ignore[arg-type]
            id=this.id,
            is_new=true,
        )
    }
}

/**
 * Format the mac address string for entry int dev reg.
 */
export function format_mac(mac: string): string {
    to_test = mac

    if (to_test.length === 17 and to_test.count(") {
        return to_test.lower()
    }

    if (to_test.length === 17 and to_test.count("-") === 5) {
        to_test = to_test.replace("-", "")
    }
    else if *(to_test.length === 14 and to_test.count(".") === 2) {
        to_test = to_test.replace(".", "")
    }

    if (to_test.length === 12) {
        // no : included
        return ":".join(to_test.lower()[i : i + 2] for i in range(0, 12, 2))
    }

    // Not sure how formatted, return original
    return mac
}

/**
 * Class to hold a registry of devices.
 */
export class DeviceRegistry {

    devices: Dict<DeviceEntry>
    deleted_devices: Dict<DeletedDeviceEntry>
    _devices_index: Dict[str, Dict[str, Dict[Tuple[str, string], string]]]

    /**
     * Initialize the device registry.
     */
    constructor(hass: HomeAssistantType) {
        this.hass = hass
        this._store = hass.helpers.storage.Store(STORAGE_VERSION, STORAGE_KEY)
        this._clear_index()
    }

    // @callback
    /**
     * Get device.
     */
    async_get(device_id: string): Optional<DeviceEntry> {
        return this.devices.get(device_id)
    }

    // @callback
    /**
     * Check if device is registered.
     */
    async_get_device(

        identifiers: Set[Tuple[str, string]],
        connections: Optional[Set[Tuple[str, string]]] = null,
    ): Optional<DeviceEntry> {
        device_id = this._async_get_device_id_from_index(
            REGISTERED_DEVICE, identifiers, connections
        )
        if (!device_id) {
            return null
        }
        return this.devices[device_id]
    }

    /**
     * Check if device is deleted.
     */
    _async_get_deleted_device(

        identifiers: Set[Tuple[str, string]],
        connections: Optional[Set[Tuple[str, string]]],
    ): Optional<DeletedDeviceEntry> {
        device_id = this._async_get_device_id_from_index(
            DELETED_DEVICE, identifiers, connections
        )
        if (!device_id) {
            return null
        }
        return this.deleted_devices[device_id]
    }

    /**
     * Check if device has previously been registered.
     */
    _async_get_device_id_from_index(

        index: string,
        identifiers: Set[Tuple[str, string]],
        connections: Optional[Set[Tuple[str, string]]],
    ): Optional<string> {
        devices_index = this._devices_index[index]
        for(const identifier of identifiers) {
            if (identifier in devices_index[IDX_IDENTIFIERS]) {
                return devices_index[IDX_IDENTIFIERS][identifier]
            }
        }
        if (!connections) {
            return null
        }
        for(const connection of _normalize_connections(connections)) {
            if (connection in devices_index[IDX_CONNECTIONS]) {
                return devices_index[IDX_CONNECTIONS][connection]
            }
        }
        return null
    }

    /**
     * Add a device and index it.
     */
    _add_device(device: Union<DeviceEntry, DeletedDeviceEntry>) {
        if (device instanceof DeletedDeviceEntry) {
            devices_index = this._devices_index[DELETED_DEVICE]
            this.deleted_devices[device.id] = device
        }
        else {
            devices_index = this._devices_index[REGISTERED_DEVICE]
            this.devices[device.id] = device
        }

        _add_device_to_index(devices_index, device)
    }

    /**
     * Remove a device and remove it from the index.
     */
    _remove_device(device: Union<DeviceEntry, DeletedDeviceEntry>) {
        if (device instanceof DeletedDeviceEntry) {
            devices_index = this._devices_index[DELETED_DEVICE]
            this.deleted_devices.pop(device.id)
        }
        else {
            devices_index = this._devices_index[REGISTERED_DEVICE]
            this.devices.pop(device.id)
        }

        _remove_device_from_index(devices_index, device)
    }

    /**
     * Update a device and the index.
     */
    _update_device(old_device: DeviceEntry, new_device: DeviceEntry) {
        this.devices[new_device.id] = new_device

        devices_index = this._devices_index[REGISTERED_DEVICE]
        _remove_device_from_index(devices_index, old_device)
        _add_device_to_index(devices_index, new_device)
    }

    /**
     * Clear the index.
     */
    _clear_index() {
        this._devices_index = {
            REGISTERED_DEVICE: {IDX_IDENTIFIERS: {}, IDX_CONNECTIONS: {}},
            DELETED_DEVICE: {IDX_IDENTIFIERS: {}, IDX_CONNECTIONS: {}},
        }
    }

    /**
     * Create the index after loading devices.
     */
    _rebuild_index() {
        this._clear_index()
        for(const device of this.devices.values()) {
            _add_device_to_index(this._devices_index[REGISTERED_DEVICE], device)
        }
        for(const deleted_device of this.deleted_devices.values()) {
            _add_device_to_index(this._devices_index[DELETED_DEVICE], deleted_device)
        }
    }

    // @callback
    /**
     * Get device. Create if it doesn't exist.
     */
    async_get_or_create(

        *,
        config_entry_id: string,
        connections: Optional[Set[Tuple[str, string]]] = null,
        identifiers: Optional[Set[Tuple[str, string]]] = null,
        manufacturer: Union<string, null, UndefinedType> = UNDEFINED,
        model: Union<string, null, UndefinedType> = UNDEFINED,
        name: Union<string, null, UndefinedType> = UNDEFINED,
        default_manufacturer: Union<string, null, UndefinedType> = UNDEFINED,
        default_model: Union<string, null, UndefinedType> = UNDEFINED,
        default_name: Union<string, null, UndefinedType> = UNDEFINED,
        sw_version: Union<string, null, UndefinedType> = UNDEFINED,
        entry_type: Union<string, null, UndefinedType> = UNDEFINED,
        via_device: Optional[Tuple[str, string]] = null,
        // To disable a device if it gets created
        disabled_by: Union<string, null, UndefinedType> = UNDEFINED,
    ): Optional<DeviceEntry> {
        if (!identifiers and !connections) {
            return null
        }

        if (!identifiers) {
            identifiers = set()
        }

        if (!connections) {
            connections = set()
        }
        else {
            connections = _normalize_connections(connections)
        }

        device = this.async_get_device(identifiers, connections)

        if (!device) {
            deleted_device = this._async_get_deleted_device(identifiers, connections)
            if (!deleted_device) {
                device = DeviceEntry(is_new=true)
            }
            else {
                this._remove_device(deleted_device)
                device = deleted_device.to_device_entry(
                    config_entry_id, connections, identifiers
                )
            }
            this._add_device(device)
        }

        if (default_manufacturer is !UNDEFINED and !device.manufacturer) {
            manufacturer = default_manufacturer
        }

        if (default_model is !UNDEFINED and !device.model) {
            model = default_model
        }

        if (default_name is !UNDEFINED and !device.name) {
            name = default_name
        }

        if (via_device is !null) {
            via = this.async_get_device({via_device})
            via_device_id: Union<string, UndefinedType> = via.id if via else UNDEFINED
        }
        else {
            via_device_id = UNDEFINED
        }

        return this._async_update_device(
            device.id,
            add_config_entry_id=config_entry_id,
            via_device_id=via_device_id,
            merge_connections=connections or UNDEFINED,
            merge_identifiers=identifiers or UNDEFINED,
            manufacturer=manufacturer,
            model=model,
            name=name,
            sw_version=sw_version,
            entry_type=entry_type,
            disabled_by=disabled_by,
        )
    }

    // @callback
    /**
     * Update properties of a device.
     */
    async_update_device(

        device_id: string,
        *,
        area_id: Union<string, null, UndefinedType> = UNDEFINED,
        manufacturer: Union<string, null, UndefinedType> = UNDEFINED,
        model: Union<string, null, UndefinedType> = UNDEFINED,
        name: Union<string, null, UndefinedType> = UNDEFINED,
        name_by_user: Union<string, null, UndefinedType> = UNDEFINED,
        new_identifiers: Union[Set[Tuple[str, string]], UndefinedType] = UNDEFINED,
        sw_version: Union<string, null, UndefinedType> = UNDEFINED,
        via_device_id: Union<string, null, UndefinedType> = UNDEFINED,
        remove_config_entry_id: Union<string, UndefinedType> = UNDEFINED,
        disabled_by: Union<string, null, UndefinedType> = UNDEFINED,
    ): Optional<DeviceEntry> {
        return this._async_update_device(
            device_id,
            area_id=area_id,
            manufacturer=manufacturer,
            model=model,
            name=name,
            name_by_user=name_by_user,
            new_identifiers=new_identifiers,
            sw_version=sw_version,
            via_device_id=via_device_id,
            remove_config_entry_id=remove_config_entry_id,
            disabled_by=disabled_by,
        )
    }

    // @callback
    /**
     * Update device attributes.
     */
    _async_update_device(

        device_id: string,
        *,
        add_config_entry_id: Union<string, UndefinedType> = UNDEFINED,
        remove_config_entry_id: Union<string, UndefinedType> = UNDEFINED,
        merge_connections: Union[Set[Tuple[str, string]], UndefinedType] = UNDEFINED,
        merge_identifiers: Union[Set[Tuple[str, string]], UndefinedType] = UNDEFINED,
        new_identifiers: Union[Set[Tuple[str, string]], UndefinedType] = UNDEFINED,
        manufacturer: Union<string, null, UndefinedType> = UNDEFINED,
        model: Union<string, null, UndefinedType> = UNDEFINED,
        name: Union<string, null, UndefinedType> = UNDEFINED,
        sw_version: Union<string, null, UndefinedType> = UNDEFINED,
        entry_type: Union<string, null, UndefinedType> = UNDEFINED,
        via_device_id: Union<string, null, UndefinedType> = UNDEFINED,
        area_id: Union<string, null, UndefinedType> = UNDEFINED,
        name_by_user: Union<string, null, UndefinedType> = UNDEFINED,
        disabled_by: Union<string, null, UndefinedType> = UNDEFINED,
    ): Optional<DeviceEntry> {
        old = this.devices[device_id]

        changes: Dict<any> = {}

        config_entries = old.config_entries

        if (
            add_config_entry_id is !UNDEFINED
            and add_config_entry_id !in old.config_entries
        ) {
            config_entries = old.config_entries | {add_config_entry_id}
        }

        if (
            remove_config_entry_id is !UNDEFINED
            and remove_config_entry_id in config_entries
        ) {
            if config_entries === {remove_config_entry_id}:
                this.async_remove_device(device_id)
                return null

            config_entries = config_entries - {remove_config_entry_id}
        }

        if (config_entries !== old.config_entries) {
            changes["config_entries"] = config_entries
        }

        for attr_name, setvalue in (
            ("connections", merge_connections),
            ("identifiers", merge_identifiers),
        ):
            old_value = getattr(old, attr_name)
            // If not undefined, check if `value` contains new items.
            if (setvalue is !UNDEFINED and !setvalue.issubset(old_value) {
                changes[attr_name] = old_value | setvalue
            }

        if (new_identifiers is !UNDEFINED) {
            changes["identifiers"] = new_identifiers
        }

        for attr_name, value in (
            ("manufacturer", manufacturer),
            ("model", model),
            ("name", name),
            ("sw_version", sw_version),
            ("entry_type", entry_type),
            ("via_device_id", via_device_id),
            ("disabled_by", disabled_by),
        ):
            if (value is !UNDEFINED and value !== getattr(old, attr_name) {
                changes[attr_name] = value
            }

        if (area_id is !UNDEFINED and area_id !== old.area_id) {
            changes["area_id"] = area_id
        }

        if (name_by_user is !UNDEFINED and name_by_user !== old.name_by_user) {
            changes["name_by_user"] = name_by_user
        }

        if (old.is_new) {
            changes["is_new"] = false
        }

        if (!changes) {
            return old
        }

        new = attr.evolve(old, **changes)
        this._update_device(old, new)
        this.async_schedule_save()

        this.hass.bus.async_fire(
            EVENT_DEVICE_REGISTRY_UPDATED,
            {
                "action": "create" if "is_new" in changes else "update",
                "device_id": new.id,
            },
        )

        return new
    }

    // @callback
    /**
     * Remove a device from the device registry.
     */
    async_remove_device(device_id: string) {
        device = this.devices[device_id]
        this._remove_device(device)
        this._add_device(
            DeletedDeviceEntry(
                config_entries=device.config_entries,
                connections=device.connections,
                identifiers=device.identifiers,
                id=device.id,
            )
        )
        this.hass.bus.async_fire(
            EVENT_DEVICE_REGISTRY_UPDATED, {"action": "remove", "device_id": device_id}
        )
        this.async_schedule_save()
    }

    /**
     * Load the device registry.
     */
    async async_load() {
        async_setup_cleanup(this.hass, self)

        data = await this._store.async_load()

        devices = OrderedDict()
        deleted_devices = OrderedDict()

        if (data is !null) {
            for(const device of data["devices"]) {
                devices[device["id"]] = DeviceEntry(
                    config_entries=set(device["config_entries"]),
                    // type ignores (if tuple arg was cast): likely https://github.com/python/mypy/issues/8625
                    connections={tuple(conn) for conn in device["connections"]},  // type: ignore<misc>
                    identifiers={tuple(iden) for iden in device["identifiers"]},  // type: ignore<misc>
                    manufacturer=device["manufacturer"],
                    model=device["model"],
                    name=device["name"],
                    sw_version=device["sw_version"],
                    // Introduced in 0.110
                    entry_type=device.get("entry_type"),
                    id=device["id"],
                    // Introduced in 0.79
                    // renamed in 0.95
                    via_device_id=(
                        device.get("via_device_id") or device.get("hub_device_id")
                    ),
                    // Introduced in 0.87
                    area_id=device.get("area_id"),
                    name_by_user=device.get("name_by_user"),
                    // Introduced in 0.119
                    disabled_by=device.get("disabled_by"),
                )
            }
            // Introduced in 0.111
            for(const device of data.get("deleted_devices", [])) {
                deleted_devices[device["id"]] = DeletedDeviceEntry(
                    config_entries=set(device["config_entries"]),
                    // type ignores (if tuple arg was cast): likely https://github.com/python/mypy/issues/8625
                    connections={tuple(conn) for conn in device["connections"]},  // type: ignore<misc>
                    identifiers={tuple(iden) for iden in device["identifiers"]},  // type: ignore<misc>
                    id=device["id"],
                )
            }
        }

        this.devices = devices
        this.deleted_devices = deleted_devices
        this._rebuild_index()
    }

    // @callback
    /**
     * Schedule saving the device registry.
     */
    async_schedule_save() {
        this._store.async_delay_save(this._data_to_save, SAVE_DELAY)
    }

    // @callback
    /**
     * Return data of device registry to store in a file.
     */
    _data_to_save(): Dict[str, Dict[str, any]][] {
        data = {}

        data["devices"] = [
            {
                "config_entries": list(entry.config_entries),
                "connections": list(entry.connections),
                "identifiers": list(entry.identifiers),
                "manufacturer": entry.manufacturer,
                "model": entry.model,
                "name": entry.name,
                "sw_version": entry.sw_version,
                "entry_type": entry.entry_type,
                "id": entry.id,
                "via_device_id": entry.via_device_id,
                "area_id": entry.area_id,
                "name_by_user": entry.name_by_user,
                "disabled_by": entry.disabled_by,
            }
            for entry in this.devices.values()
        ]
        data["deleted_devices"] = [
            {
                "config_entries": list(entry.config_entries),
                "connections": list(entry.connections),
                "identifiers": list(entry.identifiers),
                "id": entry.id,
            }
            for entry in this.deleted_devices.values()
        ]

        return data
    }

    // @callback
    /**
     * Clear config entry from registry entries.
     */
    async_clear_config_entry(config_entry_id: string) {
        for(const device of list(this.devices.values())) {
            this._async_update_device(device.id, remove_config_entry_id=config_entry_id)
        }
        for(const deleted_device of list(this.deleted_devices.values())) {
            config_entries = deleted_device.config_entries
            if (config_entry_id !in config_entries) {
                continue
            }
            if config_entries === {config_entry_id}:
                // Permanently remove the device from the device registry.
                this._remove_device(deleted_device)
            else {
                config_entries = config_entries - {config_entry_id}
                // No need to reindex here since we currently
                // do not have a lookup by config entry
                this.deleted_devices[deleted_device.id] = attr.evolve(
                    deleted_device, config_entries=config_entries
                )
            }
            this.async_schedule_save()
        }
    }

    // @callback
    /**
     * Clear area id from registry entries.
     */
    async_clear_area_id(area_id: string) {
        for(const dev_id, device of this.devices.items()) {
            if (area_id === device.area_id) {
                this._async_update_device(dev_id, area_id=null)
            }
        }
    }
}

// @singleton(DATA_REGISTRY)
/**
 * Create entity registry.
 */
export async function async_get_registry(hass: HomeAssistantType): DeviceRegistry {
    reg = DeviceRegistry(hass)
    await reg.async_load()
    return reg
}

// @callback
/**
 * Return entries that match an area.
 */
export function async_entries_for_area(registry: DeviceRegistry, area_id: string): DeviceEntry[] {
    return [device for device in registry.devices.values() if device.area_id === area_id]
}

// @callback
/**
 * Return entries that match a config entry.
 */
export function async_entries_for_config_entry(
    registry: DeviceRegistry, config_entry_id: string
): DeviceEntry[] {
    return [
        device
        for device in registry.devices.values()
        if (config_entry_id in device.config_entries
    ]
}

// @callback
/**
 * Clean up device registry.
 */
export function async_cleanup(
    hass) {
        }
    dev_reg: DeviceRegistry,
    ent_reg: "entity_registry.EntityRegistry",
) {
    // Find all devices that are referenced by a config_entry.
    config_entry_ids = {entry.entry_id for entry in hass.config_entries.async_entries()}
    references_config_entries = {
        device.id
        for device in dev_reg.devices.values()
        for config_entry_id in device.config_entries
        if config_entry_id in config_entry_ids
    }

    // Find all devices that are referenced in the entity registry.
    references_entities = {entry.device_id for entry in ent_reg.entities.values()}

    orphan = set(dev_reg.devices) - references_entities - references_config_entries

    for(const dev_id of orphan) {
        dev_reg.async_remove_device(dev_id)
    }

    // Find all referenced config entries that no longer exist
    // This shouldn't happen but have not been able to track down the bug :(
    for(const device of list(dev_reg.devices.values())) {
        for(const config_entry_id of device.config_entries) {
            if (config_entry_id !in config_entry_ids) {
                dev_reg.async_update_device(
                    device.id, remove_config_entry_id=config_entry_id
                )
            }
        }
    }
}

// @callback
/**
 * Clean up device registry when entities removed.
 */
export function async_setup_cleanup(hass: HomeAssistantType, dev_reg: DeviceRegistry) {
    from . import entity_registry  // pylint: disable=import-outside-toplevel

    /**
     * Cleanup.
     */
    async cleanup() {
        ent_reg = await entity_registry.async_get_registry(hass)
        async_cleanup(hass, dev_reg, ent_reg)
    }

    debounced_cleanup = Debouncer(
        hass, _LOGGER, cooldown=CLEANUP_DELAY, immediate=false, function=cleanup
    )

    /**
     * Handle entity updated or removed.
     */
    async entity_registry_changed(event: Event) {
        if (
            event.data["action"] === "update"
            and "device_id" !in event.data["changes"]
        ) or event.data["action"] === "create") {
            return
        }

        await debounced_cleanup.async_call()
    }

    if (hass.is_running) {
        hass.bus.async_listen(
            entity_registry.EVENT_ENTITY_REGISTRY_UPDATED, entity_registry_changed
        )
        return
    }

    /**
     * Clean up on startup.
     */
    async startup_clean(event: Event) {
        hass.bus.async_listen(
            entity_registry.EVENT_ENTITY_REGISTRY_UPDATED, entity_registry_changed
        )
        await debounced_cleanup.async_call()
    }

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, startup_clean)
}

/**
 * Normalize connections to ensure we can match mac addresses.
 */
export function _normalize_connections(connections: Set[Tuple[str, string]]): Set[Tuple[str, string]] {
    return {
        (key, format_mac(value)) if key === CONNECTION_NETWORK_MAC else (key, value)
        for key, value in connections
    }
}

/**
 * Add a device to the index.
 */
export function _add_device_to_index(
    devices_index: Dict[str, Dict[Tuple[str, string], string]],
    device: Union<DeviceEntry, DeletedDeviceEntry>,
) {
    for(const identifier of device.identifiers) {
        devices_index[IDX_IDENTIFIERS][identifier] = device.id
    }
    for(const connection of device.connections) {
        devices_index[IDX_CONNECTIONS][connection] = device.id
    }
}

/**
 * Remove a device from the index.
 */
export function _remove_device_from_index(
    devices_index: Dict[str, Dict[Tuple[str, string], string]],
    device: Union<DeviceEntry, DeletedDeviceEntry>,
) {
    for(const identifier of device.identifiers) {
        if (identifier in devices_index[IDX_IDENTIFIERS]) {
            del devices_index[IDX_IDENTIFIERS][identifier]
        }
    }
    for(const connection of device.connections) {
        if (connection in devices_index[IDX_CONNECTIONS]) {
            del devices_index[IDX_CONNECTIONS][connection]
        }
    }
}
