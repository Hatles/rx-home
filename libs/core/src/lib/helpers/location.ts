/**
 * Location helpers for Home Assistant.
 */

import logging
from typing import Optional, Sequence

import voluptuous as vol

from homeassistant.const import ATTR_LATITUDE, ATTR_LONGITUDE
from homeassistant.core import State
from homeassistant.helpers.typing import HomeAssistantType
from homeassistant.util import location as loc_util

const _LOGGER = logging.getLogger(__name__)


/**
 * Test if state contains a valid location.

    Async friendly.

 */
export function has_location(state: State): boolean {
    // type ignore: https://github.com/python/mypy/issues/7207
    return (
        state instanceof State  // type: ignore
        and isinstance(state.attributes.get(ATTR_LATITUDE), number)
        and isinstance(state.attributes.get(ATTR_LONGITUDE), number)
    )
}

/**
 * Return closest state to point.

    Async friendly.

 */
export function closest(
    latitude: number, longitude: number, states: Sequence<State>
): Optional<State> {
    with_location = [state for state in states if has_location(state)]

    if (!with_location) {
        return null
    }

    return min(
        with_location,
        key=lambda state: loc_util.distance(
            state.attributes.get(ATTR_LATITUDE),
            state.attributes.get(ATTR_LONGITUDE),
            latitude,
            longitude,
        )
        or 0,
    )
}

/**
 * Find the gps coordinates of the entity in the form of '90.000,180.000'.
 */
export function find_coordinates(
    hass: HomeAssistantType, entity_id: string, recursion_history: Optional<list> = null
): Optional<string> {
    entity_state = hass.states.get(entity_id)

    if (!entity_state) {
        _LOGGER.error("Unable to find entity %s", entity_id)
        return null
    }

    // Check if the entity has location attributes
    if (has_location(entity_state) {
        return _get_location_from_attributes(entity_state)
    }

    // Check if device is in a zone
    zone_entity = hass.states.get`zone.${entity_state.state}`)
    if (has_location(zone_entity) {
        _LOGGER.debug(
            "%s is in %s, getting zone location", entity_id, zone_entity.entity_id  // type: ignore
        )
        return _get_location_from_attributes(zone_entity)  // type: ignore
    }

    // Resolve nested entity
    if (!recursion_history) {
        recursion_history = []
    }
    recursion_history.append(entity_id)
    if (entity_state.state in recursion_history) {
        _LOGGER.error(
            "Circular reference detected while trying to find coordinates of an entity. The state of %s has already been checked",
            entity_state.state,
        )
        return null
    }
    _LOGGER.debug("Getting nested entity for state: %s", entity_state.state)
    nested_entity = hass.states.get(entity_state.state)
    if (nested_entity is !null) {
        _LOGGER.debug("Resolving nested entity_id: %s", entity_state.state)
        return find_coordinates(hass, entity_state.state, recursion_history)
    }

    // Check if state is valid coordinate set
    try {
        // Import here, not at top-level to avoid circular import
        import homeassistant.helpers.config_validation as cv  // pylint: disable=import-outside-toplevel

        cv.gps(entity_state.state.split(","))
    }
    catch (e) {
        if (e instanceof vol.Invalid) {
        _LOGGER.error(
            "Entity %s does not contain a location and does not point at an entity that does: %s",
            entity_id,
            entity_state.state,
        )
        return null
        }
        else {
            throw e;
        }
    }

    else {
        return entity_state.state
    }
}

/**
 * Get the lat/long string from an entities attributes.
 */
export function _get_location_from_attributes(entity_state: State): string {
    attr = entity_state.attributes
    return "{},{}".format(attr.get(ATTR_LATITUDE), attr.get(ATTR_LONGITUDE))
}
