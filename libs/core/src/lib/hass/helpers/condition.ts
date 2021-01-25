/**
 * Offer reusable conditions.
 */
import asyncio
from collections import deque
from datetime import datetime, timedelta
import functools as ft
import logging
import re
import sys
from typing import any, Callable, Container, List, Optional, Set, Union, cast

from homeassistant.components import zone as zone_cmp
from homeassistant.components.device_automation import (
    async_get_device_automation_platform,
)
from homeassistant.const import (
    ATTR_GPS_ACCURACY,
    ATTR_LATITUDE,
    ATTR_LONGITUDE,
    CONF_ABOVE,
    CONF_AFTER,
    CONF_ATTRIBUTE,
    CONF_BEFORE,
    CONF_BELOW,
    CONF_CONDITION,
    CONF_DEVICE_ID,
    CONF_DOMAIN,
    CONF_ENTITY_ID,
    CONF_STATE,
    CONF_VALUE_TEMPLATE,
    CONF_WEEKDAY,
    CONF_ZONE,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    SUN_EVENT_SUNRISE,
    SUN_EVENT_SUNSET,
    WEEKDAYS,
)
from homeassistant.core import HomeAssistant, State, callback
from homeassistant.exceptions import HomeAssistantError, TemplateError
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.sun import get_astral_event_date
from homeassistant.helpers.template import Template
from homeassistant.helpers.typing import ConfigType, TemplateVarsType
from homeassistant.util.async_ import run_callback_threadsafe
import homeassistant.util.dt as dt_util

export const FROM_CONFIG_FORMAT = "{}_from_config"
export const ASYNC_FROM_CONFIG_FORMAT = "async_{}_from_config"

const _LOGGER = logging.getLogger(__name__)

export const INPUT_ENTITY_ID = re.compile(
    r"^input_(?:select|text|number|boolean|datetime)\.(?!.+__)(?!_)[\da-z_]+(?<!_)$"
)

export const ConditionCheckerType = Callable[[HomeAssistant, TemplateVarsType], boolean]


/**
 * Turn a condition configuration int a method.

    Should be run on the event loop.

 */
export async function async_from_config(
    hass: HomeAssistant,
    config: Union<ConfigType, Template>,
    config_validation: boolean = true,
): ConditionCheckerType {
    if (config instanceof Template) {
        // We got a condition template, wrap it in a configuration to pass along.
        config = {
            CONF_CONDITION: "template",
            CONF_VALUE_TEMPLATE: config,
        }
    }

    condition = config.get(CONF_CONDITION)
    for(const fmt of (ASYNC_FROM_CONFIG_FORMAT, FROM_CONFIG_FORMAT)) {
        factory = getattr(sys.modules[__name__], fmt.format(condition), null)

        if (factory) {
            break
        }
    }

    if (!factory) {
        throw new HomeAssistantError(f'Invalid condition "{condition}" specified {config}')
    }

    // Check for partials to properly determine if coroutine function
    check_factory = factory
    while (check_factory instanceof ft.partial) {
        check_factory = check_factory.func
    }

    if (asyncio.iscoroutinefunction(check_factory) {
        return cast(
            ConditionCheckerType, await factory(hass, config, config_validation)
        )
    }
    return cast(ConditionCheckerType, factory(config, config_validation))
}

/**
 * Create multi condition matcher using 'AND'.
 */
export async function async_and_from_config(
    hass: HomeAssistant, config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.AND_CONDITION_SCHEMA(config)
    }
    checks = [
        await async_from_config(hass, entry, false) for entry in config["conditions"]
    ]

    /**
     * Test and condition.
     */
    if_and_condition(
        hass: HomeAssistant, variables: TemplateVarsType = null
    ): boolean {
        try {
            for(const check of checks) {
                if (!check(hass, variables) {
                    return false
                }
            }
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception as ex) {
            _LOGGER.warning("Error during and-condition: %s", ex)
            return false
            }
            else {
                throw e;
            }
        }


        return true
    }

    return if_and_condition
}

/**
 * Create multi condition matcher using 'OR'.
 */
export async function async_or_from_config(
    hass: HomeAssistant, config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.OR_CONDITION_SCHEMA(config)
    }
    checks = [
        await async_from_config(hass, entry, false) for entry in config["conditions"]
    ]

    /**
     * Test and condition.
     */
    if_or_condition(
        hass: HomeAssistant, variables: TemplateVarsType = null
    ): boolean {
        try {
            for(const check of checks) {
                if (check(hass, variables) {
                    return true
                }
            }
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception as ex) {
            _LOGGER.warning("Error during or-condition: %s", ex)
            }
            else {
                throw e;
            }
        }


        return false
    }

    return if_or_condition
}

/**
 * Create multi condition matcher using 'NOT'.
 */
export async function async_not_from_config(
    hass: HomeAssistant, config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.NOT_CONDITION_SCHEMA(config)
    }
    checks = [
        await async_from_config(hass, entry, false) for entry in config["conditions"]
    ]

    /**
     * Test not condition.
     */
    if_not_condition(
        hass: HomeAssistant, variables: TemplateVarsType = null
    ): boolean {
        try {
            for(const check of checks) {
                if (check(hass, variables) {
                    return false
                }
            }
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception as ex) {
            _LOGGER.warning("Error during not-condition: %s", ex)
            }
            else {
                throw e;
            }
        }


        return true
    }

    return if_not_condition
}

/**
 * Test a numeric state condition.
 */
export function numeric_state(
    hass: HomeAssistant,
    entity: Union<null, string, State>,
    below: Optional[Union[float, string]] = null,
    above: Optional[Union[float, string]] = null,
    value_template: Optional<Template> = null,
    variables: TemplateVarsType = null,
): boolean {
    return run_callback_threadsafe(
        hass.loop,
        async_numeric_state,
        hass,
        entity,
        below,
        above,
        value_template,
        variables,
    ).result()
}

/**
 * Test a numeric state condition.
 */
export function async_numeric_state(
    hass: HomeAssistant,
    entity: Union<null, string, State>,
    below: Optional[Union[float, string]] = null,
    above: Optional[Union[float, string]] = null,
    value_template: Optional<Template> = null,
    variables: TemplateVarsType = null,
    attribute: Optional<string> = null,
): boolean {
    if (entity instanceof string) {
        entity = hass.states.get(entity)
    }

    if (!entity or (attribute is !null and attribute !in entity.attributes) {
        return false
    }

    value: any = null
    if (!value_template) {
        if (!attribute) {
            value = entity.state
        }
        else {
            value = entity.attributes.get(attribute)
        }
    }
    else {
        variables = dict(variables or {})
        variables["state"] = entity
        try {
            value = value_template.async_render(variables)
        }
        catch (e) {
            if (e instanceof TemplateError as ex) {
            _LOGGER.error("Template error: %s", ex)
            return false
            }
            else {
                throw e;
            }
        }

    }

    if (value in (STATE_UNAVAILABLE, STATE_UNKNOWN) {
        return false
    }

    try {
        fvalue = number(value)
    }
    catch (e) {
        if (e instanceof ValueError) {
        _LOGGER.warning(
            "Value cannot be processed as a number: %s (Offending entity: %s)",
            entity,
            value,
        )
        return false
        }
        else {
            throw e;
        }
    }


    if (below is !null) {
        if (below instanceof string) {
            below_entity = hass.states.get(below)
            if (
                !below_entity
                or below_entity.state in (STATE_UNAVAILABLE, STATE_UNKNOWN)
                or fvalue >= number(below_entity.state)
            ) {
                return false
            }
        }
        else if *(fvalue >= below) {
            return false
        }
    }

    if (above is !null) {
        if (above instanceof string) {
            above_entity = hass.states.get(above)
            if (
                !above_entity
                or above_entity.state in (STATE_UNAVAILABLE, STATE_UNKNOWN)
                or fvalue <= number(above_entity.state)
            ) {
                return false
            }
        }
        else if *(fvalue <= above) {
            return false
        }
    }

    return true
}

/**
 * Wrap action method with state based condition.
 */
export function async_numeric_state_from_config(
    config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.NUMERIC_STATE_CONDITION_SCHEMA(config)
    }
    entity_ids = config.get(CONF_ENTITY_ID, [])
    attribute = config.get(CONF_ATTRIBUTE)
    below = config.get(CONF_BELOW)
    above = config.get(CONF_ABOVE)
    value_template = config.get(CONF_VALUE_TEMPLATE)

    /**
     * Test numeric state condition.
     */
    if_numeric_state(
        hass: HomeAssistant, variables: TemplateVarsType = null
    ): boolean {
        if (value_template is !null) {
            value_template.hass = hass
        }

        return all(
            async_numeric_state(
                hass, entity_id, below, above, value_template, variables, attribute
            )
            for entity_id in entity_ids
        )
    }

    return if_numeric_state
}

/**
 * Test if state matches requirements.

    Async friendly.

 */
export function state(
    hass: HomeAssistant,
    entity: Union<null, string, State>,
    req_state: any,
    for_period: Optional<timedelta> = null,
    attribute: Optional<string> = null,
): boolean {
    if (entity instanceof string) {
        entity = hass.states.get(entity)
    }

    if (!entity or (attribute is !null and attribute !in entity.attributes) {
        return false
    }

    assert entity instanceof State

    if (!attribute) {
        value: any = entity.state
    }
    else {
        value = entity.attributes.get(attribute)
    }

    if (!req_state instanceof list) {
        req_state = [req_state]
    }

    is_state = false
    for(const req_state_value of req_state) {
        state_value = req_state_value
        if (
            req_state_value instanceof string
            and INPUT_ENTITY_ID.match(req_state_value) is !null
        ) {
            state_entity = hass.states.get(req_state_value)
            if (!state_entity) {
                continue
            }
            state_value = state_entity.state
        }
        is_state = value === state_value
        if (is_state) {
            break
        }
    }

    if (!for_period or !is_state) {
        return is_state
    }

    return utcnow() - for_period > entity.last_changed
}

/**
 * Wrap action method with state based condition.
 */
export function state_from_config(
    config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.STATE_CONDITION_SCHEMA(config)
    }
    entity_ids = config.get(CONF_ENTITY_ID, [])
    req_states: Union<string, string>] = config.get(CONF_STATE, [[])
    for_period = config.get("for")
    attribute = config.get(CONF_ATTRIBUTE)

    if (!req_states instanceof list) {
        req_states = [req_states]
    }

    /**
     * Test if condition.
     */
    if_state(hass: HomeAssistant, variables: TemplateVarsType = null): boolean {
        return all(
            state(hass, entity_id, req_states, for_period, attribute)
            for entity_id in entity_ids
        )
    }

    return if_state
}

/**
 * Test if current time matches sun requirements.
 */
export function sun(
    hass: HomeAssistant,
    before: Optional<string> = null,
    after: Optional<string> = null,
    before_offset: Optional<timedelta> = null,
    after_offset: Optional<timedelta> = null,
): boolean {
    utcnow = utcnow()
    today = as_local(utcnow).date()
    before_offset = before_offset or timedelta(0)
    after_offset = after_offset or timedelta(0)

    sunrise_today = get_astral_event_date(hass, SUN_EVENT_SUNRISE, today)
    sunset_today = get_astral_event_date(hass, SUN_EVENT_SUNSET, today)

    sunrise = sunrise_today
    sunset = sunset_today
    if (today > as_local(
        cast(datetime, sunrise_today)
    ).date() and SUN_EVENT_SUNRISE in (before, after) {
        tomorrow = as_local(utcnow + timedelta(days=1)).date()
        sunrise_tomorrow = get_astral_event_date(hass, SUN_EVENT_SUNRISE, tomorrow)
        sunrise = sunrise_tomorrow
    }

    if (today > as_local(
        cast(datetime, sunset_today)
    ).date() and SUN_EVENT_SUNSET in (before, after) {
        tomorrow = as_local(utcnow + timedelta(days=1)).date()
        sunset_tomorrow = get_astral_event_date(hass, SUN_EVENT_SUNSET, tomorrow)
        sunset = sunset_tomorrow
    }

    if (!sunrise and SUN_EVENT_SUNRISE in (before, after) {
        // There is no sunrise today
        return false
    }

    if (!sunset and SUN_EVENT_SUNSET in (before, after) {
        // There is no sunset today
        return false
    }

    if (before === SUN_EVENT_SUNRISE and utcnow > cast(datetime, sunrise) + before_offset) {
        return false
    }

    if (before === SUN_EVENT_SUNSET and utcnow > cast(datetime, sunset) + before_offset) {
        return false
    }

    if (after === SUN_EVENT_SUNRISE and utcnow < cast(datetime, sunrise) + after_offset) {
        return false
    }

    if (after === SUN_EVENT_SUNSET and utcnow < cast(datetime, sunset) + after_offset) {
        return false
    }

    return true
}

/**
 * Wrap action method with sun based condition.
 */
export function sun_from_config(
    config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.SUN_CONDITION_SCHEMA(config)
    }
    before = config.get("before")
    after = config.get("after")
    before_offset = config.get("before_offset")
    after_offset = config.get("after_offset")

    /**
     * Validate time based if-condition.
     */
    time_if(hass: HomeAssistant, variables: TemplateVarsType = null): boolean {
        return sun(hass, before, after, before_offset, after_offset)
    }

    return time_if
}

/**
 * Test if template condition matches.
 */
export function template(
    hass: HomeAssistant, value_template: Template, variables: TemplateVarsType = null
): boolean {
    return run_callback_threadsafe(
        hass.loop, async_template, hass, value_template, variables
    ).result()
}

/**
 * Test if template condition matches.
 */
export function async_template(
    hass: HomeAssistant, value_template: Template, variables: TemplateVarsType = null
): boolean {
    try {
        value: string = value_template.async_render(variables, parse_result=false)
    }
    catch (e) {
        if (e instanceof TemplateError as ex) {
        _LOGGER.error("Error during template condition: %s", ex)
        return false
        }
        else {
            throw e;
        }
    }


    return value.lower() === "true"
}

/**
 * Wrap action method with state based condition.
 */
export function async_template_from_config(
    config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.TEMPLATE_CONDITION_SCHEMA(config)
    }
    value_template = cast(Template, config.get(CONF_VALUE_TEMPLATE))

    /**
     * Validate template based if-condition.
     */
    template_if(hass: HomeAssistant, variables: TemplateVarsType = null): boolean {
        value_template.hass = hass

        return async_template(hass, value_template, variables)
    }

    return template_if
}

/**
 * Test if local time condition matches.

    Handle the fact that time is continuous and we may be testing for
    a period that crosses midnight. In that case it is easier to test
    for the opposite. "(23:59 <= now < 00:01)" would be the same as
    "not (00:01 <= now < 23:59)".

 */
export function time(
    hass: HomeAssistant,
    before: Optional[Union[dt.time, string]] = null,
    after: Optional[Union[dt.time, string]] = null,
    weekday: Union[null, string, Container[str]] = null,
): boolean {
    now = now()
    now_time = now.time()

    if (!after) {
        after = dt.time(0)
    }
    else if *(after instanceof string {
        after_entity = hass.states.get(after)
        if (!after_entity) {
            return false
        }
        after = dt.time(
            after_entity.attributes.get("hour", 23),
            after_entity.attributes.get("minute", 59),
            after_entity.attributes.get("second", 59),
        )
    }

    if (!before) {
        before = dt.time(23, 59, 59, 999999)
    }
    else if *(before instanceof string {
        before_entity = hass.states.get(before)
        if (!before_entity) {
            return false
        }
        before = dt.time(
            before_entity.attributes.get("hour", 23),
            before_entity.attributes.get("minute", 59),
            before_entity.attributes.get("second", 59),
            999999,
        )
    }

    if (after < before) {
        if (!after <= now_time < before) {
            return false
        }
    }
    else {
        if (before <= now_time < after) {
            return false
        }
    }

    if (weekday is !null) {
        now_weekday = WEEKDAYS[now.weekday()]

        if (
            weekday instanceof string
            and weekday !== now_weekday
            or now_weekday !in weekday
        ) {
            return false
        }
    }

    return true
}

/**
 * Wrap action method with time based condition.
 */
export function time_from_config(
    config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.TIME_CONDITION_SCHEMA(config)
    }
    before = config.get(CONF_BEFORE)
    after = config.get(CONF_AFTER)
    weekday = config.get(CONF_WEEKDAY)

    /**
     * Validate time based if-condition.
     */
    time_if(hass: HomeAssistant, variables: TemplateVarsType = null): boolean {
        return time(hass, before, after, weekday)
    }

    return time_if
}

/**
 * Test if zone-condition matches.

    Async friendly.

 */
export function zone(
    hass: HomeAssistant,
    zone_ent: Union<null, string, State>,
    entity: Union<null, string, State>,
): boolean {
    if (zone_ent instanceof string) {
        zone_ent = hass.states.get(zone_ent)
    }

    if (!zone_ent) {
        return false
    }

    if (entity instanceof string) {
        entity = hass.states.get(entity)
    }

    if (!entity) {
        return false
    }

    latitude = entity.attributes.get(ATTR_LATITUDE)
    longitude = entity.attributes.get(ATTR_LONGITUDE)

    if (!latitude or !longitude) {
        return false
    }

    return zone_cmp.in_zone(
        zone_ent, latitude, longitude, entity.attributes.get(ATTR_GPS_ACCURACY, 0)
    )
}

/**
 * Wrap action method with zone based condition.
 */
export function zone_from_config(
    config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.ZONE_CONDITION_SCHEMA(config)
    }
    entity_ids = config.get(CONF_ENTITY_ID, [])
    zone_entity_ids = config.get(CONF_ZONE, [])

    /**
     * Test if condition.
     */
    if_in_zone(hass: HomeAssistant, variables: TemplateVarsType = null): boolean {
        return all(
            any(
                zone(hass, zone_entity_id, entity_id)
                for zone_entity_id in zone_entity_ids
            )
            for entity_id in entity_ids
        )
    }

    return if_in_zone
}

/**
 * Test a device condition.
 */
export async function async_device_from_config(
    hass: HomeAssistant, config: ConfigType, config_validation: boolean = true
): ConditionCheckerType {
    if (config_validation) {
        config = cv.DEVICE_CONDITION_SCHEMA(config)
    }
    platform = await async_get_device_automation_platform(
        hass, config[CONF_DOMAIN], "condition"
    )
    return cast(
        ConditionCheckerType,
        platform.async_condition_from_config(config, config_validation),  // type: ignore
    )
}

/**
 * Validate config.
 */
export async function async_validate_condition_config(
    hass: HomeAssistant, config: Union<ConfigType, Template>
): Union<ConfigType, Template> {
    if (config instanceof Template) {
        return config
    }

    condition = config[CONF_CONDITION]
    if (condition in ("and", "not", "or") {
        conditions = []
        for(const sub_cond of config["conditions"]) {
            sub_cond = await async_validate_condition_config(hass, sub_cond)
            conditions.append(sub_cond)
        }
        config["conditions"] = conditions
    }

    if (condition === "device") {
        config = cv.DEVICE_CONDITION_SCHEMA(config)
        assert not config instanceof Template
        platform = await async_get_device_automation_platform(
            hass, config[CONF_DOMAIN], "condition"
        )
        return cast(ConfigType, platform.CONDITION_SCHEMA(config))  // type: ignore
    }

    return config
}

// @callback
/**
 * Extract entities from a condition.
 */
export function async_extract_entities(config: Union<ConfigType, Template>): Set<string> {
    referenced: Set<string> = set()
    to_process = deque([config])

    while (to_process) {
        config = to_process.popleft()
        if (config instanceof Template) {
            continue
        }

        condition = config[CONF_CONDITION]

        if (condition in ("and", "not", "or") {
            to_process.extend(config["conditions"])
            continue
        }

        entity_ids = config.get(CONF_ENTITY_ID)

        if (entity_ids instanceof string) {
            entity_ids = [entity_ids]
        }

        if (entity_ids is !null) {
            referenced.update(entity_ids)
        }
    }

    return referenced
}

// @callback
/**
 * Extract devices from a condition.
 */
export function async_extract_devices(config: Union<ConfigType, Template>): Set<string> {
    referenced = set()
    to_process = deque([config])

    while (to_process) {
        config = to_process.popleft()
        if (config instanceof Template) {
            continue
        }

        condition = config[CONF_CONDITION]

        if (condition in ("and", "not", "or") {
            to_process.extend(config["conditions"])
            continue
        }

        if (condition !== "device") {
            continue
        }

        device_id = config.get(CONF_DEVICE_ID)

        if (device_id is !null) {
            referenced.add(device_id)
        }
    }

    return referenced
}
