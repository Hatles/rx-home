/**
 * Helpers that help with state related things.
 */
import asyncio
from collections import defaultdict
import datetime as dt
import logging
from types import ModuleType, TracebackType
from typing import any, Dict, Iterable, List, Optional, Type, Union

from homeassistant.components.sun import STATE_ABOVE_HORIZON, STATE_BELOW_HORIZON
from homeassistant.const import (
    STATE_CLOSED,
    STATE_HOME,
    STATE_LOCKED,
    STATE_NOT_HOME,
    STATE_OFF,
    STATE_ON,
    STATE_OPEN,
    STATE_UNKNOWN,
    STATE_UNLOCKED,
)
from homeassistant.core import Context, State
from homeassistant.loader import IntegrationNotFound, async_get_integration, bind_hass
import homeassistant.util.dt as dt_util

from .typing import HomeAssistantType

const _LOGGER = logging.getLogger(__name__)


/**
 *
    Record the time when the with-block is entered.

    Add all states that have changed since the start time to the return list
    when with-block is exited.

    Must be run within the event loop.

 */
export class AsyncTrackStates {

    /**
     * Initialize a TrackStates block.
     */
    constructor(hass: HomeAssistantType) {
        this.hass = hass
        this.states: State] = [[]
    }

    // pylint: disable=attribute-defined-outside-init
    /**
     * Record time from which to track changes.
     */
    __enter__(): State[] {
        this.now = utcnow()
        return this.states
    }

    /**
     * Add changes states to changes list.
     */
    __exit__(

        exc_type: Optional[Type[BaseException]],
        exc_value: Optional<BaseException>,
        traceback: Optional<TracebackType>,
    ) {
        this.states.extend(get_changed_since(this.hass.states.async_all(), this.now))
    }
}

/**
 * Return list of states that have been changed since utc_point_in_time.
 */
export function get_changed_since(
    states: Iterable<State>, utc_point_in_time: dt.datetime
): State[] {
    return [state for state in states if state.last_updated >= utc_point_in_time]
}

// @bind_hass
/**
 * Reproduce a list of states on multiple domains.
 */
export async function async_reproduce_state(
    hass: HomeAssistantType,
    states: Union[State, Iterable[State]],
    *,
    context: Optional<Context> = null,
    reproduce_options: Optional[Dict[str, any]] = null,
) {
    if (states instanceof State) {
        states = [states]
    }

    to_call: Dict<State>[] = defaultdict(list)

    for(const state of states) {
        to_call[state.domain].append(state)
    }

    async def worker(domain: string, states_by_domain: State[]) -> null:
        try {
            integration = await async_get_integration(hass, domain)
        }
        catch (e) {
            if (e instanceof IntegrationNotFound) {
            _LOGGER.warning(
                "Trying to reproduce state for unknown integration: %s", domain
            )
            return
            }
            else {
                throw e;
            }
        }


        try {
            platform: Optional<ModuleType> = integration.get_platform("reproduce_state")
        }
        catch (e) {
            if (e instanceof ImportError) {
            _LOGGER.warning("Integration %s does not support reproduce state", domain)
            return
            }
            else {
                throw e;
            }
        }


        await platform.async_reproduce_states(  // type: ignore
            hass, states_by_domain, context=context, reproduce_options=reproduce_options
        )

    if (to_call) {
        // run all domains in parallel
        await asyncio.gather(
            *(worker(domain, data) for domain, data in to_call.items())
        )
    }
}

/**
 *
    Try to coerce our state to a number.

    Raises ValueError if this is not possible.

 */
export function state_as_number(state: State): number {
    if (state.state in (
        STATE_ON,
        STATE_LOCKED,
        STATE_ABOVE_HORIZON,
        STATE_OPEN,
        STATE_HOME,
    ) {
        return 1
    }
    if (state.state in (
        STATE_OFF,
        STATE_UNLOCKED,
        STATE_UNKNOWN,
        STATE_BELOW_HORIZON,
        STATE_CLOSED,
        STATE_NOT_HOME,
    ) {
        return 0
    }

    return number(state.state)
}
