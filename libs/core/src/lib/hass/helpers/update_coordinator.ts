/**
 * Helpers to help coordinate updates.
 */
import asyncio
from datetime import datetime, timedelta
import logging
from time import monotonic
from typing import Awaitable, Callable, Generic, List, Optional, TypeVar
import urllib.error

import aiohttp
import requests

from homeassistant.core import CALLBACK_TYPE, HassJob, HomeAssistant, callback
from homeassistant.helpers import entity, event
from homeassistant.util.dt import utcnow

from .debounce import Debouncer

export const REQUEST_REFRESH_DEFAULT_COOLDOWN = 10
export const REQUEST_REFRESH_DEFAULT_IMMEDIATE = true

export const T = TypeVar("T")


/**
 * Raised when an update has failed.
 */
export class UpdateFailed extends Exception {
}

/**
 * Class to manage fetching data from single endpoint.
 */
export class DataUpdateCoordinator extends Generic[T] {

    /**
     * Initialize global data updater.
     */
    constructor(

        hass: HomeAssistant,
        logger: logging.Logger,
        *,
        name: string,
        update_interval: Optional<timedelta> = null,
        update_method: Optional[Callable[[], Awaitable[T]]] = null,
        request_refresh_debouncer: Optional<Debouncer> = null,
    ) {
        this.hass = hass
        this.logger = logger
        this.name = name
        this.update_method = update_method
        this.update_interval = update_interval

        this.data: Optional<T> = null

        this._listeners: CALLBACK_TYPE] = [[]
        this._job = HassJob(this._handle_refresh_interval)
        this._unsub_refresh: Optional[CALLBACK_TYPE] = null
        this._request_refresh_task: Optional<asyncio.TimerHandle> = null
        this.last_update_success = true

        if (!request_refresh_debouncer) {
            request_refresh_debouncer = Debouncer(
                hass,
                logger,
                cooldown=REQUEST_REFRESH_DEFAULT_COOLDOWN,
                immediate=REQUEST_REFRESH_DEFAULT_IMMEDIATE,
                function=this.async_refresh,
            )
        }
        else {
            request_refresh_debouncer.function = this.async_refresh
        }

        this._debounced_refresh = request_refresh_debouncer
    }

    // @callback
    /**
     * Listen for data updates.
     */
    async_add_listener(update_callback: CALLBACK_TYPE): Callable[[], null] {
        schedule_refresh = not this._listeners

        this._listeners.append(update_callback)

        // This is the first listener, set up intrval.
        if (schedule_refresh) {
            this._schedule_refresh()
        }

        // @callback
        /**
         * Remove update listener.
         */
        remove_listener() {
            this.async_remove_listener(update_callback)
        }

        return remove_listener
    }

    // @callback
    /**
     * Remove data update.
     */
    async_remove_listener(update_callback: CALLBACK_TYPE) {
        this._listeners.remove(update_callback)

        if (!this._listeners and this._unsub_refresh) {
            this._unsub_refresh()
            this._unsub_refresh = null
        }
    }

    // @callback
    /**
     * Schedule a refresh.
     */
    _schedule_refresh() {
        if (!this.update_interval) {
            return
        }

        if (this._unsub_refresh) {
            this._unsub_refresh()
            this._unsub_refresh = null
        }

        // We _floor_ utcnow to create a schedule on a rounded second,
        // minimizing the time between the point and the real activation.
        // That way we obtain a constant update frequency,
        // as long as the update process takes less than a second
        this._unsub_refresh = event.async_track_point_in_utc_time(
            this.hass,
            this._job,
            utcnow().replace(microsecond=0) + this.update_interval,
        )
    }

    /**
     * Handle a refresh intrval occurrence.
     */
    async _handle_refresh_interval(_now: datetime) {
        this._unsub_refresh = null
        await this.async_refresh()
    }

    /**
     * Request a refresh.

        Refresh will wait a bit to see if it can batch them.

     */
    async async_request_refresh() {
        await this._debounced_refresh.async_call()
    }

    /**
     * Fetch the latest data from the source.
     */
    async _async_update_data(): Optional<T> {
        if (!this.update_method) {
            throw new NotImplementedError("Update method not implemented")
        }
        return await this.update_method()
    }

    /**
     * Refresh data.
     */
    async async_refresh() {
        if (this._unsub_refresh) {
            this._unsub_refresh()
            this._unsub_refresh = null
        }

        this._debounced_refresh.async_cancel()
        start = monotonic()

        try {
            this.data = await this._async_update_data()
        }

        catch (e) {
            if (e instanceof (asyncio.TimeoutError, requests.exceptions.Timeout)) {
            if (this.last_update_success) {
                this.logger.error("Timeout fetching %s data", this.name)
                this.last_update_success = false
            }
            }
            else {
                throw e;
            }
        }


        catch (e) {
            if (e instanceof (aiohttp.ClientError, requests.exceptions.RequestException) as err) {
            if (this.last_update_success) {
                this.logger.error("Error requesting %s data: %s", this.name, err)
                this.last_update_success = false
            }
            }
            else {
                throw e;
            }
        }


        catch (e) {
            if (e instanceof urllib.error.URLError as err) {
            if (this.last_update_success) {
                if (err.reason === "timed out") {
                    this.logger.error("Timeout fetching %s data", this.name)
                }
                else {
                    this.logger.error("Error requesting %s data: %s", this.name, err)
                }
                this.last_update_success = false
            }
            }
            else {
                throw e;
            }
        }


        catch (e) {
            if (e instanceof UpdateFailed as err) {
            if (this.last_update_success) {
                this.logger.error("Error fetching %s data: %s", this.name, err)
                this.last_update_success = false
            }
            }
            else {
                throw e;
            }
        }


        catch (e) {
            if (e instanceof NotImplementedError as err) {
            throw new err
            }
            else {
                throw e;
            }
        }


        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception as err) {
            this.last_update_success = false
            this.logger.exception(
                "Unexpected error fetching %s data: %s", this.name, err
            )
            }
            else {
                throw e;
            }
        }


        else {
            if (!this.last_update_success) {
                this.last_update_success = true
                this.logger.info("Fetching %s data recovered", this.name)
            }
        }

        finally {
            this.logger.debug(
                "Finished fetching %s data in %.3f seconds",
                this.name,
                monotonic() - start,
            )
            if (this._listeners) {
                this._schedule_refresh()
            }
        }

        for(const update_callback of this._listeners) {
            update_callback()
        }
    }

    // @callback
    /**
     * Manually update data, notify listeners and reset refresh intrval.
     */
    async_set_updated_data(data: T) {
        if (this._unsub_refresh) {
            this._unsub_refresh()
            this._unsub_refresh = null
        }

        this._debounced_refresh.async_cancel()

        this.data = data
        this.last_update_success = true
        this.logger.debug(
            "Manually updated %s data",
            this.name,
        )

        if (this._listeners) {
            this._schedule_refresh()
        }

        for(const update_callback of this._listeners) {
            update_callback()
        }
    }
}

/**
 * A class for entities using DataUpdateCoordinator.
 */
export class CoordinatorEntity extends entity.Entity {

    /**
     * Create the entity with a DataUpdateCoordinator.
     */
    constructor(coordinator: DataUpdateCoordinator) {
        this.coordinator = coordinator
    }

    // @property
    /**
     * No need to poll. Coordinator notifies entity of updates.
     */
    should_poll(): boolean {
        return false
    }

    // @property
    /**
     * Return if entity is available.
     */
    available(): boolean {
        return this.coordinator.last_update_success
    }

    /**
     * When entity is added to hass.
     */
    async async_added_to_hass() {
        await super().async_added_to_hass()
        this.async_on_remove(
            this.coordinator.async_add_listener(this._handle_coordinator_update)
        )
    }

    // @callback
    /**
     * Handle updated data from the coordinator.
     */
    _handle_coordinator_update() {
        this.async_write_ha_state()
    }

    /**
     * Update the entity.

        Only used by the generic entity update service.

     */
    async async_update() {

        // Ignore manual update requests if the entity is disabled
        if (!this.enabled) {
            return
        }

        await this.coordinator.async_request_refresh()
    }
}
