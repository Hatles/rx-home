/**
 * Helper to deal with YAML + storage.
 */
from abc import ABC, abstractmethod
import asyncio
from dataclasses import dataclass
import logging
from typing import any, Awaitable, Callable, Dict, Iterable, List, Optional, cast

import voluptuous as vol
from voluptuous.humanize import humanize_error

from homeassistant.components import websocket_api
from homeassistant.const import CONF_ID
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.entity_component import EntityComponent
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import HomeAssistantType
from homeassistant.util import slugify

export const STORAGE_VERSION = 1
export const SAVE_DELAY = 10

export const CHANGE_ADDED = "added"
export const CHANGE_UPDATED = "updated"
export const CHANGE_REMOVED = "removed"


// @dataclass
/**
 * Class to represent a change set.

    change_type: One of CHANGE_*
    item_id: The id of the item
    item: The item

 */
export class CollectionChangeSet {

    change_type: string
    item_id: string
    item: any
}

export const ChangeListener = Callable[
    [
        // Change type
        string,
        // Item ID
        string,
        // New or removed config
        dict,
    ],
    Awaitable[null],
]


/**
 * Base class for collection related errors.
 */
export class CollectionError extends HomeAssistantError {
}

/**
 * Raised when an item is not found.
 */
export class ItemNotFound extends CollectionError {

    /**
     * Initialize item not found error.
     */
    constructor(item_id: string) {
        super().constructor`Item ${item_id} not found.`)
        this.item_id = item_id
    }
}

/**
 * Keep track of IDs across different collections.
 */
export class IDManager {

    /**
     * Initiate the ID manager.
     */
    constructor() {
        this.collections: Dict<any>] = [[]
    }

    /**
     * Add a collection to check for ID usage.
     */
    add_collection(collection: Dict<any>) {
        this.collections.append(collection)
    }

    /**
     * Test if the ID exists.
     */
    has_id(item_id: string): boolean {
        return any(item_id in collection for collection in this.collections)
    }

    /**
     * Generate an ID.
     */
    generate_id(suggestion: string): string {
        base = slugify(suggestion)
        proposal = base
        attempt = 1

        while (this.has_id(proposal) {
            attempt += 1
            proposal =`${base}_${attempt}`
        }

        return proposal
    }
}

/**
 * Base collection type that can be observed.
 */
export class ObservableCollection extends ABC {

    /**
     * Initialize the base collection.
     */
    constructor(logger: logging.Logger, id_manager: Optional<IDManager> = null) {
        this.logger = logger
        this.id_manager = id_manager or IDManager()
        this.data: Dict<dict> = {}
        this.listeners: ChangeListener] = [[]

        this.id_manager.add_collection(this.data)
    }

    // @callback
    /**
     * Return list of items in collection.
     */
    async_items(): dict[] {
        return list(this.data.values())
    }

    // @callback
    /**
     * Add a listener.

        Will be called with (change_type, item_id, updated_config).

     */
    async_add_listener(listener: ChangeListener) {
        this.listeners.append(listener)
    }

    /**
     * Notify listeners of a change.
     */
    async notify_changes(change_sets: Iterable<CollectionChangeSet>) {
        await asyncio.gather(
            *[
                listener(change_set.change_type, change_set.item_id, change_set.item)
                for listener in this.listeners
                for change_set in change_sets
            ]
        )
    }
}

/**
 * Offer a collection based on static data.
 */
export class YamlCollection extends ObservableCollection {

    /**
     * Load the YAML collection. Overrides existing data.
     */
    async async_load(data: dict[]) {

        old_ids = set(this.data)

        change_sets = []

        for(const item of data) {
            item_id = item[CONF_ID]

            if (item_id in old_ids) {
                old_ids.remove(item_id)
                event = CHANGE_UPDATED
            }
            else if *(this.id_manager.has_id(item_id) {
                this.logger.warning("Duplicate ID '%s' detected, skipping", item_id)
                continue
            }
            else {
                event = CHANGE_ADDED
            }

            this.data[item_id] = item
            change_sets.append(CollectionChangeSet(event, item_id, item))
        }

        for(const item_id of old_ids) {
            change_sets.append(
                CollectionChangeSet(CHANGE_REMOVED, item_id, this.data.pop(item_id))
            )
        }

        if (change_sets) {
            await this.notify_changes(change_sets)
        }
    }
}

/**
 * Offer a CRUD intrface on top of JSON storage.
 */
export class StorageCollection extends ObservableCollection {

    /**
     * Initialize the storage collection.
     */
    constructor(

        store: Store,
        logger: logging.Logger,
        id_manager: Optional<IDManager> = null,
    ) {
        super().constructor(logger, id_manager)
        this.store = store
    }

    // @property
    /**
     * Home Assistant object.
     */
    hass(): HomeAssistant {
        return this.store.hass
    }

    /**
     * Load the data.
     */
    async _async_load_data(): Optional<dict> {
        return cast(Optional[dict], await this.store.async_load())
    }

    /**
     * Load the storage Manager.
     */
    async async_load() {
        raw_storage = await this._async_load_data()

        if (!raw_storage) {
            raw_storage = {"items": []}
        }

        for(const item of raw_storage["items"]) {
            this.data[item[CONF_ID]] = item
        }

        await this.notify_changes(
            [
                CollectionChangeSet(CHANGE_ADDED, item[CONF_ID], item)
                for item in raw_storage["items"]
            ]
        )
    }

    // @abstractmethod
    /**
     * Validate the config is valid.
     */
    async _process_create_data(data: dict): dict {
    }

    // @callback
    // @abstractmethod
    /**
     * Suggest an ID based on the config.
     */
    _get_suggested_id(info: dict): string {
    }

    // @abstractmethod
    /**
     * Return a new updated data object.
     */
    async _update_data(data: dict, update_data: dict): dict {
    }

    /**
     * Create a new item.
     */
    async async_create_item(data: dict): dict {
        item = await this._process_create_data(data)
        item[CONF_ID] = this.id_manager.generate_id(this._get_suggested_id(item))
        this.data[item[CONF_ID]] = item
        this._async_schedule_save()
        await this.notify_changes(
            [CollectionChangeSet(CHANGE_ADDED, item[CONF_ID], item)]
        )
        return item
    }

    /**
     * Update item.
     */
    async async_update_item(item_id: string, updates: dict): dict {
        if (item_id !in this.data) {
            throw new ItemNotFound(item_id)
        }

        if (CONF_ID in updates) {
            throw new ValueError("Cannot update ID")
        }

        current = this.data[item_id]

        updated = await this._update_data(current, updates)

        this.data[item_id] = updated
        this._async_schedule_save()

        await this.notify_changes(
            [CollectionChangeSet(CHANGE_UPDATED, item_id, updated)]
        )

        return this.data[item_id]
    }

    /**
     * Delete item.
     */
    async async_delete_item(item_id: string) {
        if (item_id !in this.data) {
            throw new ItemNotFound(item_id)
        }

        item = this.data.pop(item_id)
        this._async_schedule_save()

        await this.notify_changes([CollectionChangeSet(CHANGE_REMOVED, item_id, item)])
    }

    // @callback
    /**
     * Schedule saving the area registry.
     */
    _async_schedule_save() {
        this.store.async_delay_save(this._data_to_save, SAVE_DELAY)
    }

    // @callback
    /**
     * Return data of area registry to store in a file.
     */
    _data_to_save(): dict {
        return {"items": list(this.data.values())}
    }
}

/**
 * A collection without IDs.
 */
export class IDLessCollection extends ObservableCollection {

    counter = 0

    /**
     * Load the collection. Overrides existing data.
     */
    async async_load(data: dict[]) {
        await this.notify_changes(
            [
                CollectionChangeSet(CHANGE_REMOVED, item_id, item)
                for item_id, item in list(this.data.items())
            ]
        )

        this.data.clear()

        for(const item of data) {
            this.counter += 1
            item_id =`fakeid-${this.counter}`

            this.data[item_id] = item
        }

        await this.notify_changes(
            [
                CollectionChangeSet(CHANGE_ADDED, item_id, item)
                for item_id, item in this.data.items()
            ]
        )
    }
}

// @callback
/**
 * Map a collection to an entity component.
 */
export function attach_entity_component_collection(
    entity_component: EntityComponent,
    collection: ObservableCollection,
    create_entity: Callable[[dict], Entity],
) {
    entities = {}

    /**
     * Handle a collection change.
     */
    async _collection_changed(change_type: string, item_id: string, config: dict) {
        if (change_type === CHANGE_ADDED) {
            entity = create_entity(config)
            await entity_component.async_add_entities([entity])
            entities[item_id] = entity
            return
        }

        if (change_type === CHANGE_REMOVED) {
            entity = entities.pop(item_id)
            await entity.async_remove()
            return
        }

        // CHANGE_UPDATED
        await entities[item_id].async_update_config(config)  // type: ignore
    }

    collection.async_add_listener(_collection_changed)
}

// @callback
/**
 * Attach a listener to clean up entity registry on collection changes.
 */
export function attach_entity_registry_cleaner(
    hass: HomeAssistantType,
    domain: string,
    platform: string,
    collection: ObservableCollection,
) {

    /**
     * Handle a collection change: clean up entity registry on removals.
     */
    async _collection_changed(change_type: string, item_id: string, config: Dict) {
        if (change_type !== CHANGE_REMOVED) {
            return
        }

        ent_reg = await entity_registry.async_get_registry(hass)
        ent_to_remove = ent_reg.async_get_entity_id(domain, platform, item_id)
        if (ent_to_remove is !null) {
            ent_reg.async_remove(ent_to_remove)
        }
    }

    collection.async_add_listener(_collection_changed)
}

/**
 * Class to expose storage collection management over websocket.
 */
export class StorageCollectionWebsocket {

    /**
     * Initialize a websocket CRUD.
     */
    constructor(

        storage_collection: StorageCollection,
        api_prefix: string,
        model_name: string,
        create_schema: dict,
        update_schema: dict,
    ) {
        this.storage_collection = storage_collection
        this.api_prefix = api_prefix
        this.model_name = model_name
        this.create_schema = create_schema
        this.update_schema = update_schema

        assert this.api_prefix[-1] !== "/", "API prefix should not end in /"
    }

    // @property
    /**
     * Return item ID key.
     */
    item_id_key(): string {
        return`${this.model_name}_id`
    }

    // @callback
    /**
     * Set up the websocket commands.
     */
    async_setup(

        hass: HomeAssistant,
        *,
        create_list: boolean = true,
        create_create: boolean = true,
    ) {
        if (create_list) {
            websocket_api.async_register_command(
                hass,
               `${this.api_prefix}/list`,
                this.ws_list_item,
                websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
                    {Joi.Required("type"):`${this.api_prefix}/list`}
                ),
            )
        }

        if (create_create) {
            websocket_api.async_register_command(
                hass,
               `${this.api_prefix}/create`,
                websocket_api.require_admin(
                    websocket_api.async_response(this.ws_create_item)
                ),
                websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
                    {
                        **this.create_schema,
                        Joi.Required("type"):`${this.api_prefix}/create`,
                    }
                ),
            )
        }

        websocket_api.async_register_command(
            hass,
           `${this.api_prefix}/update`,
            websocket_api.require_admin(
                websocket_api.async_response(this.ws_update_item)
            ),
            websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
                {
                    **this.update_schema,
                    Joi.Required("type"):`${this.api_prefix}/update`,
                    Joi.Required(this.item_id_key): string,
                }
            ),
        )

        websocket_api.async_register_command(
            hass,
           `${this.api_prefix}/delete`,
            websocket_api.require_admin(
                websocket_api.async_response(this.ws_delete_item)
            ),
            websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
                {
                    Joi.Required("type"):`${this.api_prefix}/delete`,
                    Joi.Required(this.item_id_key): string,
                }
            ),
        )
    }

    /**
     * List items.
     */
    ws_list_item(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) {
        connection.send_result(msg["id"], this.storage_collection.async_items())
    }

    /**
     * Create a item.
     */
    async ws_create_item(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) {
        try {
            data = dict(msg)
            data.pop("id")
            data.pop("type")
            item = await this.storage_collection.async_create_item(data)
            connection.send_result(msg["id"], item)
        }
        catch (e) {
            if (e instanceof Joi.Invalid as err) {
            connection.send_error(
                msg["id"],
                websocket_api.const.ERR_INVALID_FORMAT,
                humanize_error(data, err),
            )
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof ValueError as err) {
            connection.send_error(
                msg["id"], websocket_api.const.ERR_INVALID_FORMAT, string(err)
            )
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Update a item.
     */
    async ws_update_item(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) {
        data = dict(msg)
        msg_id = data.pop("id")
        item_id = data.pop(this.item_id_key)
        data.pop("type")

        try {
            item = await this.storage_collection.async_update_item(item_id, data)
            connection.send_result(msg_id, item)
        }
        catch (e) {
            if (e instanceof ItemNotFound) {
            connection.send_error(
                msg["id"],
                websocket_api.const.ERR_NOT_FOUND,
               `Unable to find ${this.item_id_key} ${item_id}`,
            )
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof Joi.Invalid as err) {
            connection.send_error(
                msg["id"],
                websocket_api.const.ERR_INVALID_FORMAT,
                humanize_error(data, err),
            )
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof ValueError as err) {
            connection.send_error(
                msg_id, websocket_api.const.ERR_INVALID_FORMAT, string(err)
            )
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Delete a item.
     */
    async ws_delete_item(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
    ) {
        try {
            await this.storage_collection.async_delete_item(msg[this.item_id_key])
        }
        catch (e) {
            if (e instanceof ItemNotFound) {
            connection.send_error(
                msg["id"],
                websocket_api.const.ERR_NOT_FOUND,
               `Unable to find ${this.item_id_key} ${msg[this.item_id_key]}`,
            )
            }
            else {
                throw e;
            }
        }


        connection.send_result(msg["id"])
    }
}
