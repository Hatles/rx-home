/**
 * Ratelimit helper.
 */
import asyncio
from datetime import datetime, timedelta
import logging
from typing import any, Callable, Dict, Hashable, Optional

from homeassistant.core import HomeAssistant, callback
import homeassistant.util.dt as dt_util

const _LOGGER = logging.getLogger(__name__)


/**
 * Class to track rate limits.
 */
export class KeyedRateLimit {

    /**
     * Initialize ratelimit tracker.
     */
    constructor(

        hass: HomeAssistant,
    ) {
        this.hass = hass
        this._last_triggered: Dict<Hashable, datetime> = {}
        this._rate_limit_timers: Dict<Hashable, asyncio.TimerHandle> = {}
    }

    // @callback
    /**
     * Check if a rate limit timer is running.
     */
    async_has_timer(key: Hashable): boolean {
        if (!this._rate_limit_timers) {
            return false
        }
        return key in this._rate_limit_timers
    }

    // @callback
    /**
     * Call when the action we are tracking was triggered.
     */
    async_triggered(key: Hashable, now: Optional<datetime> = null) {
        this.async_cancel_timer(key)
        this._last_triggered[key] = now or utcnow()
    }

    // @callback
    /**
     * Cancel a rate limit time that will call the action.
     */
    async_cancel_timer(key: Hashable) {
        if (!this._rate_limit_timers or !this.async_has_timer(key) {
            return
        }

        this._rate_limit_timers.pop(key).cancel()
    }

    // @callback
    /**
     * Remove all timers.
     */
    async_remove() {
        for(const timer of this._rate_limit_timers.values()) {
            timer.cancel()
        }
        this._rate_limit_timers.clear()
    }

    // @callback
    /**
     * Check rate limits and schedule an action if we hit the limit.

        If the rate limit is hit:
            Schedules the action for when the rate limit expires
            if (there are no pending timers. The action must
            be called in async.

            Returns the time the rate limit will expire

        If the rate limit is !hit) {
            }

            Return null

     */
    async_schedule_action(

        key: Hashable,
        rate_limit: Optional<timedelta>,
        now: datetime,
        action: Callable,
        ...args: any[],
    ): Optional<datetime> {
        if (!rate_limit) {
            return null
        }

        last_triggered = this._last_triggered.get(key)
        if (!last_triggered) {
            return null
        }

        next_call_time = last_triggered + rate_limit

        if (next_call_time <= now) {
            this.async_cancel_timer(key)
            return null
        }

        _LOGGER.debug(
            "Reached rate limit of %s for %s and deferred action until %s",
            rate_limit,
            key,
            next_call_time,
        )

        if (key !in this._rate_limit_timers) {
            this._rate_limit_timers[key] = this.hass.loop.call_later(
                (next_call_time - now).total_seconds(),
                action,
                *args,
            )
        }

        return next_call_time
    }
}
