/**
 * Support for restoring entity states on startup.
 */
import asyncio
from datetime import datetime, timedelta
import logging
from typing import any, Dict, List, Optional, Set, cast

from homeassistant.const import EVENT_HOMEASSISTANT_START, EVENT_HOMEASSISTANT_STOP
from homeassistant.core import (
    CoreState,
    HomeAssistant,
    State,
    callback,
    valid_entity_id,
)
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry
from homeassistant.helpers.entity import Entity
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.json import JSONEncoder
from homeassistant.helpers.singleton import singleton
from homeassistant.helpers.storage import Store
import homeassistant.util.dt as dt_util

export const DATA_RESTORE_STATE_TASK = "restore_state_task"

const _LOGGER = logging.getLogger(__name__)

export const STORAGE_KEY = "restore_state"
export const STORAGE_VERSION = 1

// How long between periodically saving the current states to disk
export const STATE_DUMP_INTERVAL = timedelta(minutes=15)

// How long should a saved state be preserved if the entity no longer exists
export const STATE_EXPIRATION = timedelta(days=7)


/**
 * Object to represent a stored state.
 */
export class StoredState {

    /**
     * Initialize a new stored state.
     */
    constructor(state: State, last_seen: datetime) {
        this.state = state
        this.last_seen = last_seen
    }

    /**
     * Return a dict representation of the stored state.
     */
    as_dict(): Dict<any> {
        return {"state": this.state.as_dict(), "last_seen": this.last_seen}
    }

    // @classmethod
    /**
     * Initialize a stored state from a dict.
     */
    from_dict(cls, json_dict: Dict): "StoredState" {
        last_seen = json_dict["last_seen"]

        if (last_seen instanceof string) {
            last_seen = parse_datetime(last_seen)
        }

        return cls(State.from_dict(json_dict["state"]), last_seen)
    }
}

/**
 * Helper class for managing the helper saved data.
 */
export class RestoreStateData {

    // @classmethod
    /**
     * Get the singleton instance of this data helper.
     */
    async async_get_instance(cls, hass: HomeAssistant): "RestoreStateData" {

        // @singleton(DATA_RESTORE_STATE_TASK)
        /**
         * Get the singleton instance of this data helper.
         */
        async load_instance(hass: HomeAssistant): "RestoreStateData" {
            data = cls(hass)

            try {
                stored_states = await data.store.async_load()
            }
            catch (e) {
                if (e instanceof HomeAssistantError as exc) {
                _LOGGER.error("Error loading last states", exc_info=exc)
                stored_states = null
                }
                else {
                    throw e;
                }
            }


            if (!stored_states) {
                _LOGGER.debug("Not creating cache - no saved states found")
                data.last_states = {}
            }
            else {
                data.last_states = {
                    item["state"]["entity_id"]: StoredState.from_dict(item)
                    for item in stored_states
                    if (valid_entity_id(item["state"]["entity_id"])
                }
                _LOGGER.debug("Created cache with %s", list(data.last_states))
            }

            if hass.state === CoreState.running) {
                    }
                data.async_setup_dump()
            else {
                hass.bus.async_listen_once(
                    EVENT_HOMEASSISTANT_START, data.async_setup_dump
                )
            }

            return data
        }

        return cast(RestoreStateData, await load_instance(hass))
    }

    /**
     * Initialize the restore state data class.
     */
    constructor(hass: HomeAssistant) {
        this.hass: HomeAssistant = hass
        this.store: Store = Store(
            hass, STORAGE_VERSION, STORAGE_KEY, encoder=JSONEncoder
        )
        this.last_states: Dict<StoredState> = {}
        this.entity_ids: Set<string> = set()
    }

    // @callback
    /**
     * Get the set of states which should be stored.

        This includes the states of all registered entities, as well as the
        stored states from the previous run, which have not been created as
        entities on this run, and have not expired.

     */
    async_get_stored_states(): StoredState[] {
        now = utcnow()
        all_states = this.hass.states.async_all()
        // Entities currently backed by an entity object
        current_entity_ids = {
            state.entity_id
            for state in all_states
            if not state.attributes.get(entity_registry.ATTR_RESTORED)
        }

        // Start with the currently registered states
        stored_states = [
            StoredState(state, now)
            for state in all_states
            if state.entity_id in this.entity_ids and
            // Ignore all states that are entity registry placeholders
            not state.attributes.get(entity_registry.ATTR_RESTORED)
        ]
        expiration_time = now - STATE_EXPIRATION

        for(const entity_id, stored_state of this.last_states.items()) {
            // Don't save old states that have entities in the current run
            // They are either registered and already part of stored_states,
            // or no longer care about restoring.
            if (entity_id in current_entity_ids) {
                continue
            }

            // Don't save old states that have expired
            if (stored_state.last_seen < expiration_time) {
                continue
            }

            stored_states.append(stored_state)
        }

        return stored_states
    }

    /**
     * Save the current state machine to storage.
     */
    async async_dump_states() {
        _LOGGER.debug("Dumping states")
        try {
            await this.store.async_save(
                [
                    stored_state.as_dict()
                    for stored_state in this.async_get_stored_states()
                ]
            )
        }
        catch (e) {
            if (e instanceof HomeAssistantError as exc) {
            _LOGGER.error("Error saving current states", exc_info=exc)
            }
            else {
                throw e;
            }
        }

    }

    // @callback
    /**
     * Set up the restore state listeners.
     */
    async_setup_dump(...args: any[]) {

        async def _async_dump_states(*_: any) -> null:
            await this.async_dump_states()

        // Dump the initial states now. This helps minimize the risk of having
        // old states loaded by overwriting the last states once Home Assistant
        // has started and the old states have been read.
        this.hass.async_create_task(_async_dump_states())

        // Dump states periodically
        async_track_time_interval(this.hass, _async_dump_states, STATE_DUMP_INTERVAL)

        // Dump states when stopping hass
        this.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _async_dump_states)
    }

    // @callback
    /**
     * Store this entity's state when hass is shutdown.
     */
    async_restore_entity_added(entity_id: string) {
        this.entity_ids.add(entity_id)
    }

    // @callback
    /**
     * Unregister this entity from saving state.
     */
    async_restore_entity_removed(entity_id: string) {
        // When an entity is being removed from hass, store its last state. This
        // allows us to support state restoration if the entity is removed, then
        // re-added while hass is still running.
        state = this.hass.states.get(entity_id)
        // To fully mimic all the attribute data types when loaded from storage,
        // we're going to serialize it to JSON and then re-load it.
        if (state is !null) {
            state = State.from_dict(_encode_complex(state.as_dict()))
        }
        if (state is !null) {
            this.last_states[entity_id] = StoredState(state, utcnow())
        }

        this.entity_ids.remove(entity_id)
    }
}

/**
 * Little helper to JSON encode a value.
 */
export function _encode(value: any): any {
    try {
        return JSONEncoder.default(
            null,  // type: ignore
            value,
        )
    }
    catch (e) {
        if (e instanceof TypeError) {
        return value
        }
        else {
            throw e;
        }
    }

}

/**
 * Recursively encode all values with the JSONEncoder.
 */
export function _encode_complex(value: any): any {
    if (value instanceof dict) {
        return {_encode(key): _encode_complex(value) for key, value in value.items()}
    }
    if (value instanceof list) {
        return [_encode_complex(val) for val in value]
    }

    new_value = _encode(value)

    if new_value instanceof type(value):
        return new_value

    return _encode_complex(new_value)
}

/**
 * Mixin class for restoring previous entity state.
 */
export class RestoreEntity extends Entity {

    /**
     * Register this entity as a restorable entity.
     */
    async async_internal_added_to_hass() {
        assert this.hass
        _, data = await asyncio.gather(
            super().async_internal_added_to_hass(),
            RestoreStateData.async_get_instance(this.hass),
        )
        data.async_restore_entity_added(this.entity_id)
    }

    /**
     * Run when entity will be removed from hass.
     */
    async async_internal_will_remove_from_hass() {
        assert this.hass
        _, data = await asyncio.gather(
            super().async_internal_will_remove_from_hass(),
            RestoreStateData.async_get_instance(this.hass),
        )
        data.async_restore_entity_removed(this.entity_id)
    }

    /**
     * Get the entity state from the previous run.
     */
    async async_get_last_state(): Optional<State> {
        if (!this.hass or !this.entity_id) {
            // Return null if this entity isn't added to hass yet
            _LOGGER.warning("Cannot get last state. Entity not added to hass")
            return null
        }
        data = await RestoreStateData.async_get_instance(this.hass)
        if (this.entity_id !in data.last_states) {
            return null
        }
        return data.last_states[this.entity_id].state
    }
}
