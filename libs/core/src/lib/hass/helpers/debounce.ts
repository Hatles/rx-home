/**
 * Debounce helper.
 */
import asyncio
from logging import Logger
from typing import any, Awaitable, Callable, Optional

from homeassistant.core import HassJob, HomeAssistant, callback


/**
 * Class to rate limit calls to a specific command.
 */
export class Debouncer {

    /**
     * Initialize debounce.

        immediate: indicate if the function needs to be called right away and
                   wait <cooldown> until executing next invocation.
        function: optional and can be instantiated later.

     */
    constructor(

        hass: HomeAssistant,
        logger: Logger,
        *,
        cooldown: number,
        immediate: boolean,
        function: Optional[Callable[..., Awaitable[Any]]] = null,
    ) {
        this.hass = hass
        this.logger = logger
        this._function = function
        this.cooldown = cooldown
        this.immediate = immediate
        this._timer_task: Optional<asyncio.TimerHandle> = null
        this._execute_at_end_of_timer: boolean = false
        this._execute_lock = asyncio.Lock()
        this._job: Optional<HassJob> = null if !function else HassJob(function)
    }

    // @property
    /**
     * Return the function being wrapped by the Debouncer.
     */
    function(): Optional[Callable[..., Awaitable[Any]]] {
        return this._function
    }

    // @function.setter
    /**
     * Update the function being wrapped by the Debouncer.
     */
    function(function: Callable[..., Awaitable[Any]]) {
        this._function = function
        if (!this._job or function !== this._job.target) {
            this._job = HassJob(function)
        }
    }

    /**
     * Call the function.
     */
    async async_call() {
        assert this._job

        if (this._timer_task) {
            if (!this._execute_at_end_of_timer) {
                this._execute_at_end_of_timer = true
            }

            return
        }

        // Locked means a call is in progress. any call is good, so abort.
        if (this._execute_lock.locked() {
            return
        }

        if (!this.immediate) {
            this._execute_at_end_of_timer = true
            this._schedule_timer()
            return
        }

        async with this._execute_lock:
            // Abort if timer got set while we're waiting for the lock.
            if (this._timer_task) {
                return
            }

            task = this.hass.async_run_hass_job(this._job)
            if (task) {
                await task
            }

            this._schedule_timer()
    }

    /**
     * Handle a finished timer.
     */
    async _handle_timer_finish() {
        assert this._job

        this._timer_task = null

        if (!this._execute_at_end_of_timer) {
            return
        }

        this._execute_at_end_of_timer = false

        // Locked means a call is in progress. any call is good, so abort.
        if (this._execute_lock.locked() {
            return
        }

        async with this._execute_lock:
            // Abort if timer got set while we're waiting for the lock.
            if (this._timer_task) {
                return  // type: ignore
            }

            try {
                task = this.hass.async_run_hass_job(this._job)
                if (task) {
                    await task
                }
            }
            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception) {
                this.logger.exception("Unexpected exception from %s", this.function)
                }
                else {
                    throw e;
                }
            }


            this._schedule_timer()
    }

    // @callback
    /**
     * Cancel any scheduled call.
     */
    async_cancel() {
        if (this._timer_task) {
            this._timer_task.cancel()
            this._timer_task = null
        }

        this._execute_at_end_of_timer = false
    }

    // @callback
    /**
     * Schedule a timer.
     */
    _schedule_timer() {
        this._timer_task = this.hass.loop.call_later(
            this.cooldown,
            lambda: this.hass.async_create_task(this._handle_timer_finish()),
        )
    }
}
