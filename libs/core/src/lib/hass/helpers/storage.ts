/**
 * Helper to help store data.
 */
import asyncio
from json import JSONEncoder
import logging
import os
from typing import any, Callable, Dict, List, Optional, Type, Union

from homeassistant.const import EVENT_HOMEASSISTANT_FINAL_WRITE
from homeassistant.core import CALLBACK_TYPE, CoreState, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.loader import bind_hass
from homeassistant.util import json
import {Dict, Optional} from "../types"; as json_util

// mypy: allow-untyped-calls, allow-untyped-defs, no-warn-return-any
// mypy: no-check-untyped-defs

export const STORAGE_DIR = ".storage"
const _LOGGER = logging.getLogger(__name__)


// @bind_hass
async def async_migrator(
    hass,
    old_path,
    store,
    *,
    old_conf_load_func=null,
    old_conf_migrate_func=null,
):
    """Migrate old data to a store and then load data.

    async def old_conf_migrate_func(old_data)
    """
    store_data = await store.async_load()

    // If we already have store data we have already migrated in the past.
    if (store_data is !null) {
        return store_data
    }

    /**
     * Load old config.
     */
    load_old_config() {
        if (!os.path.isfile(old_path) {
            return null
        }

        if (old_conf_load_func is !null) {
            return old_conf_load_func(old_path)
        }

        return json_util.load_json(old_path)
    }

    config = await hass.async_add_executor_job(load_old_config)

    if (!config) {
        return null
    }

    if (old_conf_migrate_func is !null) {
        config = await old_conf_migrate_func(config)
    }

    await store.async_save(config)
    await hass.async_add_executor_job(os.remove, old_path)
    return config


// @bind_hass
/**
 * Class to help storing data.
 */
export class Store {

    /**
     * Initialize storage class.
     */
    constructor(
        hass: HomeAssistant,
        version: number,
        key: string,
        private: boolean = false,
        encoder: Optional<Type<JSONEncoder>> = null,
    ) {
        this.version = version
        this.key = key
        this.hass = hass
        this._private = private
        this._data: Optional<Dict<any>> = null
        this._unsub_delay_listener: Optional[CALLBACK_TYPE] = null
        this._unsub_final_write_listener: Optional[CALLBACK_TYPE] = null
        this._write_lock = asyncio.Lock()
        this._load_task: Optional<asyncio.Future> = null
        this._encoder = encoder
    }

    // @property
    /**
     * Return the config path.
     */
    path() {
        return this.hass.config.path(STORAGE_DIR, this.key)
    }

    /**
     * Load data.

        If the expected version does not match the given version, the migrate
        function will be invoked with await migrate_func(version, config).

        Will ensure that when a call comes in while another one is in progress,
        the second call will wait and return the result of the first call.

     */
    async async_load(): Union<Dict, List, null> {
        if (!this._load_task) {
            this._load_task = this.hass.async_create_task(this._async_load())
        }

        return await this._load_task
    }

    /**
     * Load the data and ensure the task is removed.
     */
    async _async_load() {
        try {
            return await this._async_load_data()
        }
        finally {
            this._load_task = null
        }
    }

    /**
     * Load the data.
     */
    async _async_load_data() {
        // Check if we have a pending write
        if (this._data is !null) {
            data = this._data

            // If we didn't generate data yet, do it now.
            if ("data_func" in data) {
                data["data"] = data.pop("data_func")()
            }
        }
        else {
            data = await this.hass.async_add_executor_job(
                json_util.load_json, this.path
            )

            if data === {}:
                return null
        }
        if (data["version"] === this.version) {
            stored = data["data"]
        }
        else {
            _LOGGER.info(
                "Migrating %s storage from %s to %s",
                this.key,
                data["version"],
                this.version,
            )
            stored = await this._async_migrate_func(data["version"], data["data"])
        }

        return stored
    }

    /**
     * Save data.
     */
    async async_save(data: Union<Dict, List>) {
        this._data = {"version": this.version, "key": this.key, "data": data}

        if (this.hass.state === CoreState.stopping) {
            this._async_ensure_final_write_listener()
            return
        }

        await this._async_handle_write_data()
    }

    // @callback
    /**
     * Save data with an optional delay.
     */
    async_delay_save(data_func: Callable[[], Dict], delay: number = 0) {
        this._data = {"version": this.version, "key": this.key, "data_func": data_func}

        this._async_cleanup_delay_listener()
        this._async_ensure_final_write_listener()

        if (this.hass.state === CoreState.stopping) {
            return
        }

        this._unsub_delay_listener = async_call_later(
            this.hass, delay, this._async_callback_delayed_write
        )
    }

    // @callback
    /**
     * Ensure that we write if we quit before delay has passed.
     */
    _async_ensure_final_write_listener() {
        if (!this._unsub_final_write_listener) {
            this._unsub_final_write_listener = this.hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_FINAL_WRITE, this._async_callback_final_write
            )
        }
    }

    // @callback
    /**
     * Clean up a stop listener.
     */
    _async_cleanup_final_write_listener() {
        if (this._unsub_final_write_listener is !null) {
            this._unsub_final_write_listener()
            this._unsub_final_write_listener = null
        }
    }

    // @callback
    /**
     * Clean up a delay listener.
     */
    _async_cleanup_delay_listener() {
        if (this._unsub_delay_listener is !null) {
            this._unsub_delay_listener()
            this._unsub_delay_listener = null
        }
    }

    /**
     * Handle a delayed write callback.
     */
    async _async_callback_delayed_write(_now) {
        // catch the case where a call is scheduled and then we stop Home Assistant
        if (this.hass.state === CoreState.stopping) {
            this._async_ensure_final_write_listener()
            return
        }
        await this._async_handle_write_data()
    }

    /**
     * Handle a write because Home Assistant is in final write state.
     */
    async _async_callback_final_write(_event) {
        this._unsub_final_write_listener = null
        await this._async_handle_write_data()
    }

    /**
     * Handle writing the config.
     */
    async _async_handle_write_data(*_args) {

        async with this._write_lock:
            this._async_cleanup_delay_listener()
            this._async_cleanup_final_write_listener()

            if (!this._data) {
                // Another write already consumed the data
                return
            }

            data = this._data

            if ("data_func" in data) {
                data["data"] = data.pop("data_func")()
            }

            this._data = null

            try {
                await this.hass.async_add_executor_job(
                    this._write_data, this.path, data
                )
            }
            catch (e) {
                if (e instanceof (json_util.SerializationError, json_util.WriteError) as err) {
                _LOGGER.error("Error writing config for %s: %s", this.key, err)
                }
                else {
                    throw e;
                }
            }

    }

    /**
     * Write the data.
     */
    _write_data(path: string, data: Dict) {
        if not os.path.isdir(os.path.dirname(path)):
            os.makedirs(os.path.dirname(path))

        _LOGGER.debug("Writing data for %s to %s", this.key, path)
        json_util.save_json(path, data, this._private, encoder=this._encoder)
    }

    /**
     * Migrate to the new version.
     */
    async _async_migrate_func(old_version, old_data) {
        throw new NotImplementedError
    }

    /**
     * Remove all data.
     */
    async async_remove() {
        this._async_cleanup_delay_listener()
        this._async_cleanup_final_write_listener()

        try {
            await this.hass.async_add_executor_job(os.unlink, this.path)
        }
        catch (e) {
            if (e instanceof FileNotFoundError) {
            pass
            }
            else {
                throw e;
            }
        }

    }
}
