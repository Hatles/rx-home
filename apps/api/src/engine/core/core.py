"""
Core components of Home Assistant.

Home Assistant is a Home Automation framework for observing the state
of entities and react to changes.
"""
import asyncio
import datetime
import enum
import functools
from ipaddress import ip_address
import logging
import os
import pathlib
import re
import threading
from time import monotonic
from types import MappingProxyType
from typing import (
    TYPE_CHECKING,
    Any,
    Awaitable,
    Callable,
    Collection,
    Coroutine,
    Dict,
    Iterable,
    List,
    Mapping,
    Optional,
    Set,
    TypeVar,
    Union,
    cast,
)

import attr
import voluptuous as vol
import yarl

from homeassistant import block_async_io, loader, util
from homeassistant.const import (
    ATTR_DOMAIN,
    ATTR_FRIENDLY_NAME,
    ATTR_NOW,
    ATTR_SECONDS,
    ATTR_SERVICE,
    ATTR_SERVICE_DATA,
    CONF_UNIT_SYSTEM_IMPERIAL,
    EVENT_CALL_SERVICE,
    EVENT_CORE_CONFIG_UPDATE,
    EVENT_HOMEASSISTANT_CLOSE,
    EVENT_HOMEASSISTANT_FINAL_WRITE,
    EVENT_HOMEASSISTANT_START,
    EVENT_HOMEASSISTANT_STARTED,
    EVENT_HOMEASSISTANT_STOP,
    EVENT_SERVICE_REGISTERED,
    EVENT_SERVICE_REMOVED,
    EVENT_STATE_CHANGED,
    EVENT_TIME_CHANGED,
    EVENT_TIMER_OUT_OF_SYNC,
    LENGTH_METERS,
    MATCH_ALL,
    __version__,
)
from homeassistant.exceptions import (
    HomeAssistantError,
    InvalidEntityFormatError,
    InvalidStateError,
    ServiceNotFound,
    Unauthorized,
)
from homeassistant.util import location, network
from homeassistant.util.async_ import fire_coroutine_threadsafe, run_callback_threadsafe
import homeassistant.util.dt as dt_util
from homeassistant.util.timeout import TimeoutManager
from homeassistant.util.unit_system import IMPERIAL_SYSTEM, METRIC_SYSTEM, UnitSystem
import homeassistant.util.uuid as uuid_util

# Typing imports that create a circular dependency
if TYPE_CHECKING:
    from homeassistant.auth import AuthManager
    from homeassistant.components.http import HomeAssistantHTTP
    from homeassistant.config_entries import ConfigEntries



def _async_create_timer(hass: HomeAssistant) -> None:
    """Create a timer that will start on HOMEASSISTANT_START."""
    handle = None
    timer_context = Context()

    def schedule_tick(now: Date) -> None:
        """Schedule a timer tick when the next second rolls around."""
        nonlocal handle

        slp_seconds = 1 - (now.microsecond / 10 ** 6)
        target = monotonic() + slp_seconds
        handle = hass.loop.call_later(slp_seconds, fire_time_event, target)

    @callback
    def fire_time_event(target: float) -> None:
        """Fire next time event."""
        now = dt_util.utcnow()

        hass.bus.async_fire(
            EVENT_TIME_CHANGED, {ATTR_NOW: now}, time_fired=now, context=timer_context
        )

        # If we are more than a second late, a tick was missed
        late = monotonic() - target
        if late > 1:
            hass.bus.async_fire(
                EVENT_TIMER_OUT_OF_SYNC,
                {ATTR_SECONDS: late},
                time_fired=now,
                context=timer_context,
            )

        schedule_tick(now)

    @callback
    def stop_timer(_: Event) -> None:
        """Stop the timer."""
        if handle is not None:
            handle.cancel()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, stop_timer)

    _LOGGER.info("Timer:starting")
    schedule_tick(dt_util.utcnow())
