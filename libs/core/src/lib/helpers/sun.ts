/**
 * Helpers for sun events.
 */
import datetime
from typing import TYPE_CHECKING, Optional, Union

from homeassistant.const import SUN_EVENT_SUNRISE, SUN_EVENT_SUNSET
from homeassistant.core import callback
from homeassistant.loader import bind_hass
from homeassistant.util import dt as dt_util

from .typing import HomeAssistantType

if (TYPE_CHECKING) {
    import astral  // pylint: disable=unused-import
}

export const DATA_LOCATION_CACHE = "astral_location_cache"


// @callback
// @bind_hass
/**
 * Get an astral location for the current Home Assistant configuration.
 */
export function get_astral_location(hass: HomeAssistantType): "astral.Location" {

    from astral import Location  // pylint: disable=import-outside-toplevel

    latitude = hass.config.latitude
    longitude = hass.config.longitude
    timezone = string(hass.config.time_zone)
    elevation = hass.config.elevation
    info = ("", "", latitude, longitude, timezone, elevation)

    // Cache astral locations so they aren't recreated with the same args
    if (DATA_LOCATION_CACHE !in hass.data) {
        hass.data[DATA_LOCATION_CACHE] = {}
    }

    if (info !in hass.data[DATA_LOCATION_CACHE]) {
        hass.data[DATA_LOCATION_CACHE][info] = Location(info)
    }

    return hass.data[DATA_LOCATION_CACHE][info]
}

// @callback
// @bind_hass
/**
 * Calculate the next specified solar event.
 */
export function get_astral_event_next(
    hass: HomeAssistantType,
    event: string,
    utc_point_in_time: Optional<Date> = null,
    offset: Optional<datetime.timedelta> = null,
): Date {
    location = get_astral_location(hass)
    return get_location_astral_event_next(location, event, utc_point_in_time, offset)
}

// @callback
/**
 * Calculate the next specified solar event.
 */
export function get_location_astral_event_next(
    location: "astral.Location",
    event: string,
    utc_point_in_time: Optional<Date> = null,
    offset: Optional<datetime.timedelta> = null,
): Date {
    from astral import AstralError  // pylint: disable=import-outside-toplevel

    if (!offset) {
        offset = datetime.timedelta()
    }

    if (!utc_point_in_time) {
        utc_point_in_time = utcnow()
    }

    mod = -1
    while (true) {
        try {
            next_dt: Date = (
                getattr(location, event)(
                    as_local(utc_point_in_time).date()
                    + datetime.timedelta(days=mod),
                    local=false,
                )
                + offset
            )
            if (next_dt > utc_point_in_time) {
                return next_dt
            }
        }
        catch (e) {
            if (e instanceof AstralError) {
            pass
            }
            else {
                throw e;
            }
        }

        mod += 1
    }
}

// @callback
// @bind_hass
/**
 * Calculate the astral event time for the specified date.
 */
export function get_astral_event_date(
    hass: HomeAssistantType,
    event: string,
    date: Union<datetime.date, Date, null> = null,
): Optional<Date> {
    from astral import AstralError  // pylint: disable=import-outside-toplevel

    location = get_astral_location(hass)

    if (!date) {
        date = now().date()
    }

    if (date instanceof Date) {
        date = as_local(date).date()
    }

    try {
        return getattr(location, event)(date, local=false)  // type: ignore
    }
    catch (e) {
        if (e instanceof AstralError) {
        // Event never occurs for specified date.
        return null
        }
        else {
            throw e;
        }
    }

}

// @callback
// @bind_hass
/**
 * Calculate if the sun is currently up.
 */
export function is_up(
    hass: HomeAssistantType, utc_point_in_time: Optional<Date> = null
): boolean {
    if (!utc_point_in_time) {
        utc_point_in_time = utcnow()
    }

    next_sunrise = get_astral_event_next(hass, SUN_EVENT_SUNRISE, utc_point_in_time)
    next_sunset = get_astral_event_next(hass, SUN_EVENT_SUNSET, utc_point_in_time)

    return next_sunrise > next_sunset
}
