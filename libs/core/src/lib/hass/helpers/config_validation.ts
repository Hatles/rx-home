/**
 * Helpers for config validation using voluptuous.
 */
from datetime import (
    date as date_sys,
    datetime as datetime_sys,
    time as time_sys,
    timedelta,
)
from enum import Enum
import inspect
import logging
from int import Number
import os
import re
from socket import _GLOBAL_DEFAULT_TIMEOUT  // type: ignore // private, typing import (
    any,
    Callable,
    Dict,
    Hashable,
    List,
    Optional,
    Pattern,
    Type,
    TypeVar,
    Union,
    cast,
)
from urllib.parse import urlparse
from uuid import UUID

import voluptuous as vol
import voluptuous_serialize

from homeassistant.const import (
    ATTR_AREA_ID,
    ATTR_DEVICE_ID,
    ATTR_ENTITY_ID,
    CONF_ABOVE,
    CONF_ALIAS,
    CONF_ATTRIBUTE,
    CONF_BELOW,
    CONF_CHOOSE,
    CONF_CONDITION,
    CONF_CONDITIONS,
    CONF_CONTINUE_ON_TIMEOUT,
    CONF_COUNT,
    CONF_DEFAULT,
    CONF_DELAY,
    CONF_DEVICE_ID,
    CONF_DOMAIN,
    CONF_ENTITY_ID,
    CONF_ENTITY_NAMESPACE,
    CONF_EVENT,
    CONF_EVENT_DATA,
    CONF_EVENT_DATA_TEMPLATE,
    CONF_FOR,
    CONF_PLATFORM,
    CONF_REPEAT,
    CONF_SCAN_INTERVAL,
    CONF_SCENE,
    CONF_SEQUENCE,
    CONF_SERVICE,
    CONF_SERVICE_TEMPLATE,
    CONF_STATE,
    CONF_TARGET,
    CONF_TIMEOUT,
    CONF_UNIT_SYSTEM_IMPERIAL,
    CONF_UNIT_SYSTEM_METRIC,
    CONF_UNTIL,
    CONF_VALUE_TEMPLATE,
    CONF_VARIABLES,
    CONF_WAIT_FOR_TRIGGER,
    CONF_WAIT_TEMPLATE,
    CONF_WHILE,
    ENTITY_MATCH_ALL,
    ENTITY_MATCH_NONE,
    SUN_EVENT_SUNRISE,
    SUN_EVENT_SUNSET,
    TEMP_CELSIUS,
    TEMP_FAHRENHEIT,
    WEEKDAYS,
)
from homeassistant.core import split_entity_id, valid_entity_id
from homeassistant.exceptions import TemplateError
from homeassistant.helpers import (
    script_variables as script_variables_helper,
    template as template_helper,
)
from homeassistant.helpers.logging import KeywordStyleAdapter
from homeassistant.util import sanitize_path, slugify as util_slugify
import homeassistant.util.dt as dt_util

// pylint: disable=invalid-name

export const TIME_PERIOD_ERROR = "offset {} should be format 'HH:MM', 'HH:MM:SS' or 'HH:MM:SS.F'"

// Home Assistant types
export const byte = Joi.All(Joi.Coerce(int), Joi.Range(min=0, max=255))
export const small_float = Joi.All(Joi.Coerce(float), Joi.Range(min=0, max=1))
export const positive_int = Joi.All(Joi.Coerce(int), Joi.Range(min=0))
export const positive_float = Joi.All(Joi.Coerce(float), Joi.Range(min=0))
export const latitude = Joi.All(
    Joi.Coerce(float), Joi.Range(min=-90, max=90), msg="invalid latitude"
)
export const longitude = Joi.All(
    Joi.Coerce(float), Joi.Range(min=-180, max=180), msg="invalid longitude"
)
export const gps = Joi.ExactSequence([latitude, longitude])
export const sun_event = Joi.All(Joi.Lower, Joi.Any(SUN_EVENT_SUNSET, SUN_EVENT_SUNRISE))
export const port = Joi.All(Joi.Coerce(int), Joi.Range(min=1, max=65535))

// typing typevar
export const T = TypeVar("T")


/**
 * Validate it's a safe path.
 */
export function path(value: any): string {
    if (!value instanceof string) {
        throw new Joi.Invalid("Expected a string")
    }

    if (sanitize_path(value) !== value) {
        throw new Joi.Invalid("Invalid path")
    }

    return value
}

// Adapted from:
// https://github.com/alecthomas/voluptuous/issues/115//issuecomment-144464666
/**
 * Validate that at least one key exists.
 */
export function has_at_least_one_key(*keys: string): Callable {

    /**
     * Test keys exist in dict.
     */
    validate(obj: Dict): Dict {
        if (!obj instanceof dict) {
            throw new Joi.Invalid("expected dictionary")
        }

        for(const k of obj) {
            if (k in keys) {
                return obj
            }
        }
        throw new Joi.Invalid("must contain at least one of {}.".format(", ".join(keys)))
    }

    return validate
}

/**
 * Validate that zero keys exist or one key exists.
 */
export function has_at_most_one_key(*keys: string): Callable[[Dict], Dict] {

    /**
     * Test zero keys exist or one key exists in dict.
     */
    validate(obj: Dict): Dict {
        if (!obj instanceof dict) {
            throw new Joi.Invalid("expected dictionary")
        }

        if (set(keys.length & set(obj)) > 1) {
            throw new Joi.Invalid("must contain at most one of {}.".format(", ".join(keys)))
        }
        return obj
    }

    return validate
}

/**
 * Validate and coerce a boolean value.
 */
export function boolean(value: any): boolean {
    if (value instanceof boolean) {
        return value
    }
    if (value instanceof string) {
        value = value.lower().strip()
        if (value in ("1", "true", "yes", "on", "enable") {
            return true
        }
        if (value in ("0", "false", "no", "off", "disable") {
            return false
        }
    }
    else if *(value instanceof Number {
        // type ignore: https://github.com/python/mypy/issues/3186
        return value !== 0  // type: ignore
    }
    throw new Joi.Invalid`invalid boolean value ${value}`)
}

export const _WS = re.compile("\\s*")


/**
 * Validate result contains only whitespace.
 */
export function whitespace(value: any): string {
    if (value instanceof string and _WS.fullmatch(value) {
        return value
    }

    throw new Joi.Invalid`contains non-whitespace: ${value}`)
}

/**
 * Validate that value is a real device.
 */
export function isdevice(value: any): string {
    try {
        os.stat(value)
        return string(value)
    }
    catch (e) {
        if (e instanceof OSError as err) {
        throw new Joi.Invalid`No device at ${value} found`) from err
        }
        else {
            throw e;
        }
    }

}

/**
 * Validate that the value is a string that matches a regex.
 */
export function matches_regex(regex: string): Callable[[Any], string] {
    compiled = re.compile(regex)

    /**
     * Validate that value matches the given regex.
     */
    validator(value: any): string {
        if (!value instanceof string) {
            throw new Joi.Invalid`not a string value: ${value}`)
        }

        if (!compiled.match(value) {
            throw new Joi.Invalid(
               `value ${value} does not match regular expression ${compiled.pattern}`
            )
        }

        return value
    }

    return validator
}

/**
 * Validate that a string is a valid regular expression.
 */
export function is_regex(value: any): Pattern<Any> {
    try {
        r = re.compile(value)
        return r
    }
    catch (e) {
        if (e instanceof TypeError as err) {
        throw new Joi.Invalid(
           `value ${value} is of the wrong type for a regular expression`
        ) from err
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof re.error as err) {
        throw new Joi.Invalid`value ${value} is not a valid regular expression`) from err
        }
        else {
            throw e;
        }
    }

}

/**
 * Validate that the value is an existing file.
 */
export function isfile(value: any): string {
    if (!value) {
        throw new Joi.Invalid("null is not file")
    }
    file_in = os.path.expanduser(str(value))

    if (!os.path.isfile(file_in) {
        throw new Joi.Invalid("not a file")
    }
    if (!os.access(file_in, os.R_OK) {
        throw new Joi.Invalid("file not readable")
    }
    return file_in
}

/**
 * Validate that the value is an existing dir.
 */
export function isdir(value: any): string {
    if (!value) {
        throw new Joi.Invalid("not a directory")
    }
    dir_in = os.path.expanduser(str(value))

    if (!os.path.isdir(dir_in) {
        throw new Joi.Invalid("not a directory")
    }
    if (!os.access(dir_in, os.R_OK) {
        throw new Joi.Invalid("directory not readable")
    }
    return dir_in
}

/**
 * Wrap value in list if it is not one.
 */
export function ensure_list(value: Union<T, T>, null]): T[[] {
    if (!value) {
        return []
    }
    return value if value instanceof list else [value]
}

/**
 * Validate Entity ID.
 */
export function entity_id(value: any): string {
    strvalue = string(value).lower()
    if (valid_entity_id(str_value) {
        return strvalue
    }

    throw new Joi.Invalid`Entity ID ${value} is an invalid entity id`)
}

/**
 * Validate Entity IDs.
 */
export function entity_ids(value: Union<string, List>): string[] {
    if (!value) {
        throw new Joi.Invalid("Entity IDs can not be null")
    }
    if (value instanceof string) {
        value = [ent_id.strip() for ent_id in value.split(",")]
    }

    return [entity_id(ent_id) for ent_id in value]
}

export const comp_entity_ids = Joi.Any(
    Joi.All(Joi.Lower, Joi.Any(ENTITY_MATCH_ALL, ENTITY_MATCH_NONE)), entity_ids
)


/**
 * Validate that entity belong to domain.
 */
export function entity_domain(domain: Union<string, string>]): Callable[[Any], string[] {
    ent_domain = entities_domain(domain)

    /**
     * Test if entity domain is domain.
     */
    validate(value: string): string {
        validated = ent_domain(value)
        if (validated.length !== 1) {
            throw new Joi.Invalid`Expected exactly 1 entity, got ${validated.length}`)
        }
        return validated[0]
    }

    return validate
}

/**
 * Validate that entities belong to domain.
 */
export function entities_domain(
    domain: Union<string, string>[]
): Callable[[Union[str, List]], string][] {
    if (domain instanceof string) {

        def check_invalid(val: string) -> boolean:
            return val !== domain
    }

    else {

        def check_invalid(val: string) -> boolean:
            return val    }

    /**
     * Test if entity domain is domain.
     */
    validate(values: Union<string, List>): string[] {
        values = entity_ids(values)
        for(const ent_id of values) {
            if (check_invalid(split_entity_id(ent_id)[0]) {
                throw new Joi.Invalid(
                   `Entity ID '${ent_id}' does not belong to domain '${domain}'`
                )
            }
        }
        return values
    }

    return validate
}

/**
 * Create validator for specified enum.
 */
export function enum(enumClass: Type<Enum>): Joi.All {
    return Joi.All(Joi.In(enumClass.__members__), enumClass.__getitem__)
}

/**
 * Validate icon.
 */
export function icon(value: any): string {
    strvalue = string(value)

    if (") {
        return strvalue
    }

    throw new Joi.Invalid('Icons should be specified in the form "prefix:name"')
}

export const time_period_dict = Joi.All(
    dict,
    Joi.Schema(
        {
            "days": Joi.Coerce(float),
            "hours": Joi.Coerce(float),
            "minutes": Joi.Coerce(float),
            "seconds": Joi.Coerce(float),
            "milliseconds": Joi.Coerce(float),
        }
    ),
    has_at_least_one_key("days", "hours", "minutes", "seconds", "milliseconds"),
    lambda value: timedelta(**value),
)


/**
 * Validate and transform a time.
 */
export function time(value: any): time_sys {
    if (value instanceof time_sys) {
        return value
    }

    try {
        time_val = parse_time(value)
    }
    catch (e) {
        if (e instanceof TypeError as err) {
        throw new Joi.Invalid("Not a parseable type") from err
        }
        else {
            throw e;
        }
    }


    if (!time_val) {
        throw new Joi.Invalid`Invalid time specified: ${value}`)
    }

    return time_val
}

/**
 * Validate and transform a date.
 */
export function date(value: any): date_sys {
    if (value instanceof date_sys) {
        return value
    }

    try {
        date_val = parse_date(value)
    }
    catch (e) {
        if (e instanceof TypeError as err) {
        throw new Joi.Invalid("Not a parseable type") from err
        }
        else {
            throw e;
        }
    }


    if (!date_val) {
        throw new Joi.Invalid("Could not parse date")
    }

    return date_val
}

/**
 * Validate and transform time offset.
 */
export function time_period_str(value: string): timedelta {
    if (value instanceof number) {
        throw new Joi.Invalid("Make sure you wrap time values in quotes")
    }
    if (!value instanceof string) {
        throw new Joi.Invalid(TIME_PERIOD_ERROR.format(value))
    }

    negative_offset = false
    if (value.startswith("-") {
        negative_offset = true
        value = value[1:]
    }
    else if *(value.startswith("+") {
        value = value[1:]
    }

    parsed = value.split(":")
    if (parsed.length !in (2, 3) {
        throw new Joi.Invalid(TIME_PERIOD_ERROR.format(value))
    }
    try {
        hour = number(parsed[0])
        minute = number(parsed[1])
        try {
            second = number(parsed[2])
        }
        catch (e) {
            if (e instanceof IndexError) {
            second = 0
            }
            else {
                throw e;
            }
        }

    }
    catch (e) {
        if (e instanceof ValueError as err) {
        throw new Joi.Invalid(TIME_PERIOD_ERROR.format(value)) from err
        }
        else {
            throw e;
        }
    }


    offset = timedelta(hours=hour, minutes=minute, seconds=second)

    if (negative_offset) {
        offset *= -1
    }

    return offset
}

/**
 * Validate and transform seconds to a time offset.
 */
export function time_period_seconds(value: Union<number, string>): timedelta {
    try {
        return timedelta(seconds=float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError) as err) {
        throw new Joi.Invalid`Expected seconds, got ${value}`) from err
        }
        else {
            throw e;
        }
    }

}

export const time_period = Joi.Any(time_period_str, time_period_seconds, timedelta, time_period_dict)


/**
 * Validate that matches all values.
 */
export function match_all(value: T): T {
    return value
}

/**
 * Validate timedelta is positive.
 */
export function positive_timedelta(value: timedelta): timedelta {
    if (value < timedelta(0) {
        throw new Joi.Invalid("Time period should be positive")
    }
    return value
}

export const positive_time_period_dict = Joi.All(time_period_dict, positive_timedelta)
export const positive_time_period = Joi.All(time_period, positive_timedelta)


/**
 * Remove falsy values from a list.
 */
export function remove_falsy(value: T]): T[[] {
    return [v for v in value if v]
}

/**
 * Validate service.
 */
export function service(value: any): string {
    // Services use same format as entities so we can use same helper.
    strvalue = string(value).lower()
    if (valid_entity_id(str_value) {
        return strvalue
    }

    throw new Joi.Invalid`Service ${value} does not match format <domain>.<name>`)
}

/**
 * Validate value is a valid slug.
 */
export function slug(value: any): string {
    if (!value) {
        throw new Joi.Invalid("Slug should not be null")
    }
    strvalue = string(value)
    slg = util_slugify(str_value)
    if (str_value === slg) {
        return strvalue
    }
    throw new Joi.Invalid`invalid slug ${value} (try ${slg})`)
}

/**
 * Ensure dicts have slugs as keys.

    Replacement of Joi.Schema({cv.slug: value_schema}) to prevent misleading
    "Extra keys" errors from voluptuous.

 */
export function schema_with_slug_keys(
    value_schema: Union<T, Callable>, *, slug_validator: Callable[[Any], string] = slug
): Callable {
    schema = Joi.Schema({str: value_schema})

    /**
     * Validate all keys are slugs and then the value_schema.
     */
    verify(value: Dict): Dict {
        if (!value instanceof dict) {
            throw new Joi.Invalid("expected dictionary")
        }

        for(const key of value.keys()) {
            slug_validator(key)
        }

        return cast(Dict, schema(value))
    }

    return verify
}

/**
 * Coerce a value to a slug.
 */
export function slugify(value: any): string {
    if (!value) {
        throw new Joi.Invalid("Slug should not be null")
    }
    slg = util_slugify(str(value))
    if (slg) {
        return slg
    }
    throw new Joi.Invalid`Unable to slugify ${value}`)
}

/**
 * Coerce value to string, except for null.
 */
export function string(value: any): string {
    if (!value) {
        throw new Joi.Invalid("string !value")
    }

    if (value instanceof template_helper.ResultWrapper) {
        value = value.render_result
    }

    elif value instanceof (list, dict):
        throw new Joi.Invalid("value should be a string")

    return string(value)
}

/**
 * Validate that the value is a string without HTML.
 */
export function strwith_no_html(value: any): string {
    value = string(value)
    regex = re.compile(r"<[a-z][\s\S]*>")
    if (regex.search(value) {
        throw new Joi.Invalid("the string should not contain HTML")
    }
    return string(value)
}

/**
 * Validate and transform temperature unit.
 */
export function temperature_unit(value: any): string {
    value = string(value).upper()
    if (value === "C") {
        return TEMP_CELSIUS
    }
    if (value === "F") {
        return TEMP_FAHRENHEIT
    }
    throw new Joi.Invalid("invalid temperature unit (expected C or F)")
}

export const unit_system = Joi.All(
    Joi.Lower, Joi.Any(CONF_UNIT_SYSTEM_METRIC, CONF_UNIT_SYSTEM_IMPERIAL)
)


/**
 * Validate a jinja2 template.
 */
export function template(value: Optional<Any>): template_helper.Template {

    if (!value) {
        throw new Joi.Invalid("template !value")
    }
    if value instanceof (list, dict, template_helper.Template):
        throw new Joi.Invalid("template value should be a string")

    template_value = template_helper.Template(str(value))  // type: ignore

    try {
        template_value.ensure_valid()
        return template_value
    }
    catch (e) {
        if (e instanceof TemplateError as ex) {
        throw new Joi.Invalid`invalid template (${ex})`) from ex
        }
        else {
            throw e;
        }
    }

}

/**
 * Validate a dynamic (non static) jinja2 template.
 */
export function dynamic_template(value: Optional<Any>): template_helper.Template {

    if (!value) {
        throw new Joi.Invalid("template !value")
    }
    if value instanceof (list, dict, template_helper.Template):
        throw new Joi.Invalid("template value should be a string")
    if not template_helper.is_template_string(str(value)):
        throw new Joi.Invalid("template value does not contain a dynmamic template")

    template_value = template_helper.Template(str(value))  // type: ignore
    try {
        template_value.ensure_valid()
        return template_value
    }
    catch (e) {
        if (e instanceof TemplateError as ex) {
        throw new Joi.Invalid`invalid template (${ex})`) from ex
        }
        else {
            throw e;
        }
    }

}

/**
 * Validate a complex jinja2 template.
 */
export function template_complex(value: any): any {
    if (value instanceof list) {
        return_list = value.copy()
        for(const idx, element of enumerate(return_list)) {
            return_list[idx] = template_complex(element)
        }
        return return_list
    }
    if (value instanceof dict) {
        return {
            template_complex(key): template_complex(element)
            for key, element in value.items()
        }
    }
    if (value instanceof string and template_helper.is_template_string(value) {
        return template(value)
    }

    return value
}

export const positive_time_period_template = Joi.Any(
    positive_time_period, template, template_complex
)


/**
 * Validate datetime.
 */
export function datetime(value: any): datetime_sys {
    if (value instanceof datetime_sys) {
        return value
    }

    try {
        date_val = parse_datetime(value)
    }
    catch (e) {
        if (e instanceof TypeError) {
        date_val = null
        }
        else {
            throw e;
        }
    }


    if (!date_val) {
        throw new Joi.Invalid`Invalid datetime specified: ${value}`)
    }

    return date_val
}

/**
 * Validate timezone.
 */
export function time_zone(value: string): string {
    if (get_time_zone(value) is !null) {
        return value
    }
    throw new Joi.Invalid(
        "Invalid time zone passed in. Valid options can be found here: "
        "http://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
    )
}

export const weekdays = Joi.All(ensure_list, [Joi.In(WEEKDAYS)])


/**
 * Validate timeout number > 0.0.

    null coerced to socket._GLOBAL_DEFAULT_TIMEOUT bare object.

 */
export function socket_timeout(value: Optional<Any>): object {
    if (!value) {
        return _GLOBAL_DEFAULT_TIMEOUT
    }
    try {
        intvalue = number(value)
        if (float_value > 0.0) {
            return intvalue
        }
        throw new Joi.Invalid("Invalid socket timeout value. number > 0.0 required.")
    }
    catch (e) {
        if (e instanceof Exception as err) {
        throw new Joi.Invalid`Invalid socket timeout: ${err}`)
        }
        else {
            throw e;
        }
    }

}

// pylint: disable=no-value-for-parameter
/**
 * Validate an URL.
 */
export function url(value: any): string {
    url_in = string(value)

    if (urlparse(url_in).scheme in ["http", "https"]) {
        return cast(str, Joi.Schema(Joi.Url())(url_in))
    }

    throw new Joi.Invalid("invalid url")
}

def x10_address(value: string) -> string:
    """Validate an x10 address."""
    regex = re.compile(r"([A-Pa-p]{1})(?:[2-9]|1[0-6]?)$")
    if (!regex.match(value) {
        throw new Joi.Invalid("Invalid X10 Address")
    }
    return string(value).lower()


def uuid4_hex(value: any) -> string:
    """Validate a v4 UUID in hex format."""
    try {
        result = UUID(value, version=4)
    }
    catch (e) {
        if (e instanceof (ValueError, AttributeError, TypeError) as error) {
        throw new Joi.Invalid("Invalid Version4 UUID", error_message=str(error))
        }
        else {
            throw e;
        }
    }


    if (result.hex !== value.lower() {
        // UUID() will create a uuid4 if input is invalid
        throw new Joi.Invalid("Invalid Version4 UUID")
    }

    return result.hex


/**
 * Ensure that input is a list or make one from comma-separated string.
 */
export function ensure_list_csv(value: any): List {
    if (value instanceof string) {
        return [member.strip() for member in value.split(",")]
    }
    return ensure_list(value)
}

/**
 * Multi select validator returning list of selected values.
 */
export class multi_select {

    /**
     * Initialize multi select.
     */
    constructor(options: dict) {
        this.options = options
    }

    /**
     * Validate input.
     */
    __call__(selected: list): list {
        if (!selected instanceof list) {
            throw new Joi.Invalid("Not a list")
        }

        for(const value of selected) {
            if (value !in this.options) {
                throw new Joi.Invalid`${value} is not a valid option`)
            }
        }

        return selected
    }
}

/**
 *
    Log key as deprecated and provide a replacement (if exists).

    Expected behavior:
        - Outputs the appropriate deprecation warning if key is detected
        - Processes schema moving the value from key to replacement_key
        - Processes schema changing nothing if only replacement_key provided
        - No warning if only replacement_key provided
        - No warning if neither key nor replacement_key are provided
            - Adds replacement_key with default value in this case

 */
export function deprecated(
    key: string,
    replacement_key: Optional<string> = null,
    default: Optional<Any> = null,
): Callable[[Dict], Dict] {
    module = inspect.getmodule(inspect.stack()[1][0])
    if (module is !null) {
        module_name = module.__name__
    }
    else {
        // If Python is unable to access the sources files, the call stack frame
        // will be missing information, so let's guard.
        // https://github.com/home-assistant/core/issues/24982
        module_name = __name__
    }

    if (replacement_key) {
        warning = (
            "The '{key}' option is deprecated,"
            " please replace it with '{replacement_key}'"
        )
    }
    else {
        warning = (
            "The '{key}' option is deprecated,"
            " please remove it from your configuration"
        )
    }

    /**
     * Check if key is in config and log warning.
     */
    validator(config: Dict): Dict {
        if (key in config) {
            KeywordStyleAdapter(logging.getLogger(module_name)).warning(
                warning,
                key=key,
                replacement_key=replacement_key,
            )

            value = config[key]
            if (replacement_key) {
                config.pop(key)
            }
        }
        else {
            value = default
        }

        keys = [key]
        if (replacement_key) {
            keys.append(replacement_key)
            if (value is !null and (
                replacement_key !in config or default === config.get(replacement_key)
            ) {
                config[replacement_key] = value
            }
        }

        return has_at_most_one_key(*keys)(config)
    }

    return validator
}

/**
 * Create a validator that validates based on a value for specific key.

    This gives better error messages.

 */
export function key_value_schemas(
    key: string, value_schemas: Dict<Joi.Schema>
): Callable[[Any], Dict[str, any]] {

    def key_value_validator(value: any) -> Dict[str, any]:
        if (!value instanceof dict) {
            throw new Joi.Invalid("Expected a dictionary")
        }

        key_value = value.get(key)

        if (key_value !in value_schemas) {
            throw new Joi.Invalid(
               `Unexpected value for ${key}: '${key_value}'. Expected ${', '.join(value_schemas)}`
            )
        }

        return cast(Dict[str, any], value_schemas[key_value](value))

    return key_value_validator
}

// Validator helpers


/**
 * Validate that all dependencies exist for key.
 */
export function key_dependency(
    key: Hashable, dependency: Hashable
): Callable[[Dict[Hashable, any]], Dict[Hashable, any]] {

    /**
     * Test dependencies.
     */
    validator(value: Dict<Hashable, any>): Dict<Hashable, any> {
        if (!value instanceof dict) {
            throw new Joi.Invalid("key dependencies require a dict")
        }
        if (key in value and dependency !in value) {
            throw new Joi.Invalid(
                f'dependency violation - key "{key}" requires '
                f'key "{dependency}" to exist'
            )
        }

        return value
    }

    return validator
}

/**
 * Serialize additional types for voluptuous_serialize.
 */
export function custom_serializer(schema: any): any {
    if (schema is positive_time_period_dict) {
        return {"type": "positive_time_period_dict"}
    }

    if (schema is string) {
        return {"type": "string"}
    }

    if (schema is boolean) {
        return {"type": "boolean"}
    }

    if (schema instanceof multi_select) {
        return {"type": "multi_select", "options": schema.options}
    }

    return voluptuous_serialize.UNSUPPORTED
}

// Schemas
export const PLATFORM_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_PLATFORM): string,
        Joi.Optional(CONF_ENTITY_NAMESPACE): string,
        Joi.Optional(CONF_SCAN_INTERVAL): time_period,
    }
)

export const PLATFORM_SCHEMA_BASE = PLATFORM_SCHEMA.extend({}, extra=Joi.ALLOW_EXTRA)

export const ENTITY_SERVICE_FIELDS = {
    Joi.Optional(ATTR_ENTITY_ID): comp_entity_ids,
    Joi.Optional(ATTR_DEVICE_ID): Joi.Any(
        ENTITY_MATCH_NONE, Joi.All(ensure_list, [str])
    ),
    Joi.Optional(ATTR_AREA_ID): Joi.Any(ENTITY_MATCH_NONE, Joi.All(ensure_list, [str])),
}


/**
 * Create an entity service schema.
 */
export function make_entity_service_schema(
    schema: dict, *, extra: number = Joi.PREVENT_EXTRA
): Joi.All {
    return Joi.All(
        Joi.Schema(
            {
                **schema,
                **ENTITY_SERVICE_FIELDS,
            },
            extra=extra,
        ),
        has_at_least_one_key(*ENTITY_SERVICE_FIELDS),
    )
}

export const SCRIPT_VARIABLES_SCHEMA = Joi.All(
    Joi.Schema({str: template_complex}),
    // pylint: disable=unnecessary-lambda
    lambda val: script_variables_helper.ScriptVariables(val),
)


/**
 * Validate a script action.
 */
export function script_action(value: any): dict {
    if (!value instanceof dict) {
        throw new Joi.Invalid("expected dictionary")
    }

    return ACTION_TYPE_SCHEMAS[determine_script_action(value)](value)
}

export const SCRIPT_SCHEMA = Joi.All(ensure_list, [script_action])

export const EVENT_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_ALIAS): string,
        Joi.Required(CONF_EVENT): string,
        Joi.Optional(CONF_EVENT_DATA): Joi.All(dict, template_complex),
        Joi.Optional(CONF_EVENT_DATA_TEMPLATE): Joi.All(dict, template_complex),
    }
)

export const SERVICE_SCHEMA = Joi.All(
    Joi.Schema(
        {
            Joi.Optional(CONF_ALIAS): string,
            Joi.Exclusive(CONF_SERVICE, "service name"): Joi.Any(
                service, dynamic_template
            ),
            Joi.Exclusive(CONF_SERVICE_TEMPLATE, "service name"): Joi.Any(
                service, dynamic_template
            ),
            Joi.Optional("data"): Joi.All(dict, template_complex),
            Joi.Optional("data_template"): Joi.All(dict, template_complex),
            Joi.Optional(CONF_ENTITY_ID): comp_entity_ids,
            Joi.Optional(CONF_TARGET): ENTITY_SERVICE_FIELDS,
        }
    ),
    has_at_least_one_key(CONF_SERVICE, CONF_SERVICE_TEMPLATE),
)

export const NUMERIC_STATE_THRESHOLD_SCHEMA = Joi.Any(
    Joi.Coerce(float), Joi.All(str, entity_domain("input_number"))
)

export const NUMERIC_STATE_CONDITION_SCHEMA = Joi.All(
    Joi.Schema(
        {
            Joi.Required(CONF_CONDITION): "numeric_state",
            Joi.Required(CONF_ENTITY_ID): entity_ids,
            Joi.Optional(CONF_ATTRIBUTE): string,
            CONF_BELOW: NUMERIC_STATE_THRESHOLD_SCHEMA,
            CONF_ABOVE: NUMERIC_STATE_THRESHOLD_SCHEMA,
            Joi.Optional(CONF_VALUE_TEMPLATE): template,
        }
    ),
    has_at_least_one_key(CONF_BELOW, CONF_ABOVE),
)

export const STATE_CONDITION_BASE_SCHEMA = {
    Joi.Required(CONF_CONDITION): "state",
    Joi.Required(CONF_ENTITY_ID): entity_ids,
    Joi.Optional(CONF_ATTRIBUTE): string,
    Joi.Optional(CONF_FOR): positive_time_period,
    // To support use_trigger_value in automation
    // Deprecated 2016/04/25
    Joi.Optional("from"): string,
}

export const STATE_CONDITION_STATE_SCHEMA = Joi.Schema(
    {
        **STATE_CONDITION_BASE_SCHEMA,
        Joi.Required(CONF_STATE): Joi.Any(str, [str]),
    }
)

export const STATE_CONDITION_ATTRIBUTE_SCHEMA = Joi.Schema(
    {
        **STATE_CONDITION_BASE_SCHEMA,
        Joi.Required(CONF_STATE): match_all,
    }
)


def STATE_CONDITION_SCHEMA(value: any) -> dict:  // pylint: disable=invalid-name
    """Validate a state condition."""
    if (!value instanceof dict) {
        throw new Joi.Invalid("Expected a dictionary")
    }

    if (CONF_ATTRIBUTE in value) {
        validated: dict = STATE_CONDITION_ATTRIBUTE_SCHEMA(value)
    }
    else {
        validated = STATE_CONDITION_STATE_SCHEMA(value)
    }

    return key_dependency("for", "state")(validated)


export const SUN_CONDITION_SCHEMA = Joi.All(
    Joi.Schema(
        {
            Joi.Required(CONF_CONDITION): "sun",
            Joi.Optional("before"): sun_event,
            Joi.Optional("before_offset"): time_period,
            Joi.Optional("after"): Joi.All(
                Joi.Lower, Joi.Any(SUN_EVENT_SUNSET, SUN_EVENT_SUNRISE)
            ),
            Joi.Optional("after_offset"): time_period,
        }
    ),
    has_at_least_one_key("before", "after"),
)

export const TEMPLATE_CONDITION_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_CONDITION): "template",
        Joi.Required(CONF_VALUE_TEMPLATE): template,
    }
)

export const TIME_CONDITION_SCHEMA = Joi.All(
    Joi.Schema(
        {
            Joi.Required(CONF_CONDITION): "time",
            "before": Joi.Any(time, Joi.All(str, entity_domain("input_datetime"))),
            "after": Joi.Any(time, Joi.All(str, entity_domain("input_datetime"))),
            "weekday": weekdays,
        }
    ),
    has_at_least_one_key("before", "after", "weekday"),
)

export const ZONE_CONDITION_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_CONDITION): "zone",
        Joi.Required(CONF_ENTITY_ID): entity_ids,
        "zone": entity_ids,
        // To support use_trigger_value in automation
        // Deprecated 2016/04/25
        Joi.Optional("event"): Joi.Any("enter", "leave"),
    }
)

export const AND_CONDITION_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_CONDITION): "and",
        Joi.Required(CONF_CONDITIONS): Joi.All(
            ensure_list,
            // pylint: disable=unnecessary-lambda
            [lambda value: CONDITION_SCHEMA(value)],
        ),
    }
)

export const OR_CONDITION_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_CONDITION): "or",
        Joi.Required(CONF_CONDITIONS): Joi.All(
            ensure_list,
            // pylint: disable=unnecessary-lambda
            [lambda value: CONDITION_SCHEMA(value)],
        ),
    }
)

export const NOT_CONDITION_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_CONDITION): "not",
        Joi.Required(CONF_CONDITIONS): Joi.All(
            ensure_list,
            // pylint: disable=unnecessary-lambda
            [lambda value: CONDITION_SCHEMA(value)],
        ),
    }
)

export const DEVICE_CONDITION_BASE_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_CONDITION): "device",
        Joi.Required(CONF_DEVICE_ID): string,
        Joi.Required(CONF_DOMAIN): string,
    }
)

export const DEVICE_CONDITION_SCHEMA = DEVICE_CONDITION_BASE_SCHEMA.extend({}, extra=Joi.ALLOW_EXTRA)

export const CONDITION_SCHEMA: Joi.Schema  = Joi.Schema(
    Joi.Any(
        key_value_schemas(
            CONF_CONDITION,
            {
                "numeric_state": NUMERIC_STATE_CONDITION_SCHEMA,
                "state": STATE_CONDITION_SCHEMA,
                "sun": SUN_CONDITION_SCHEMA,
                "template": TEMPLATE_CONDITION_SCHEMA,
                "time": TIME_CONDITION_SCHEMA,
                "zone": ZONE_CONDITION_SCHEMA,
                "and": AND_CONDITION_SCHEMA,
                "or": OR_CONDITION_SCHEMA,
                "not": NOT_CONDITION_SCHEMA,
                "device": DEVICE_CONDITION_SCHEMA,
            },
        ),
        dynamic_template,
    )
)

export const TRIGGER_SCHEMA = Joi.All(
    ensure_list, [Joi.Schema({Joi.Required(CONF_PLATFORM): string}, extra=Joi.ALLOW_EXTRA)]
)

export const _SCRIPT_DELAY_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_ALIAS): string,
        Joi.Required(CONF_DELAY): positive_time_period_template,
    }
)

export const _SCRIPT_WAIT_TEMPLATE_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_ALIAS): string,
        Joi.Required(CONF_WAIT_TEMPLATE): template,
        Joi.Optional(CONF_TIMEOUT): positive_time_period_template,
        Joi.Optional(CONF_CONTINUE_ON_TIMEOUT): boolean,
    }
)

export const DEVICE_ACTION_BASE_SCHEMA = Joi.Schema(
    {Joi.Required(CONF_DEVICE_ID): string, Joi.Required(CONF_DOMAIN): string}
)

export const DEVICE_ACTION_SCHEMA = DEVICE_ACTION_BASE_SCHEMA.extend({}, extra=Joi.ALLOW_EXTRA)

export const _SCRIPT_SCENE_SCHEMA = Joi.Schema({Joi.Required(CONF_SCENE): entity_domain("scene")})

export const _SCRIPT_REPEAT_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_ALIAS): string,
        Joi.Required(CONF_REPEAT): Joi.All(
            {
                Joi.Exclusive(CONF_COUNT, "repeat"): Joi.Any(Joi.Coerce(int), template),
                Joi.Exclusive(CONF_WHILE, "repeat"): Joi.All(
                    ensure_list, [CONDITION_SCHEMA]
                ),
                Joi.Exclusive(CONF_UNTIL, "repeat"): Joi.All(
                    ensure_list, [CONDITION_SCHEMA]
                ),
                Joi.Required(CONF_SEQUENCE): SCRIPT_SCHEMA,
            },
            has_at_least_one_key(CONF_COUNT, CONF_WHILE, CONF_UNTIL),
        ),
    }
)

export const _SCRIPT_CHOOSE_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_ALIAS): string,
        Joi.Required(CONF_CHOOSE): Joi.All(
            ensure_list,
            [
                {
                    Joi.Required(CONF_CONDITIONS): Joi.All(
                        ensure_list, [CONDITION_SCHEMA]
                    ),
                    Joi.Required(CONF_SEQUENCE): SCRIPT_SCHEMA,
                }
            ],
        ),
        Joi.Optional(CONF_DEFAULT): SCRIPT_SCHEMA,
    }
)

export const _SCRIPT_WAIT_FOR_TRIGGER_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_ALIAS): string,
        Joi.Required(CONF_WAIT_FOR_TRIGGER): TRIGGER_SCHEMA,
        Joi.Optional(CONF_TIMEOUT): positive_time_period_template,
        Joi.Optional(CONF_CONTINUE_ON_TIMEOUT): boolean,
    }
)

export const _SCRIPT_SET_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_ALIAS): string,
        Joi.Required(CONF_VARIABLES): SCRIPT_VARIABLES_SCHEMA,
    }
)

export const SCRIPT_ACTION_DELAY = "delay"
export const SCRIPT_ACTION_WAIT_TEMPLATE = "wait_template"
export const SCRIPT_ACTION_CHECK_CONDITION = "condition"
export const SCRIPT_ACTION_FIRE_EVENT = "event"
export const SCRIPT_ACTION_CALL_SERVICE = "call_service"
export const SCRIPT_ACTION_DEVICE_AUTOMATION = "device"
export const SCRIPT_ACTION_ACTIVATE_SCENE = "scene"
export const SCRIPT_ACTION_REPEAT = "repeat"
export const SCRIPT_ACTION_CHOOSE = "choose"
export const SCRIPT_ACTION_WAIT_FOR_TRIGGER = "wait_for_trigger"
export const SCRIPT_ACTION_VARIABLES = "variables"


/**
 * Determine action type.
 */
export function determine_script_action(action: dict): string {
    if (CONF_DELAY in action) {
        return SCRIPT_ACTION_DELAY
    }

    if (CONF_WAIT_TEMPLATE in action) {
        return SCRIPT_ACTION_WAIT_TEMPLATE
    }

    if (CONF_CONDITION in action) {
        return SCRIPT_ACTION_CHECK_CONDITION
    }

    if (CONF_EVENT in action) {
        return SCRIPT_ACTION_FIRE_EVENT
    }

    if (CONF_DEVICE_ID in action) {
        return SCRIPT_ACTION_DEVICE_AUTOMATION
    }

    if (CONF_SCENE in action) {
        return SCRIPT_ACTION_ACTIVATE_SCENE
    }

    if (CONF_REPEAT in action) {
        return SCRIPT_ACTION_REPEAT
    }

    if (CONF_CHOOSE in action) {
        return SCRIPT_ACTION_CHOOSE
    }

    if (CONF_WAIT_FOR_TRIGGER in action) {
        return SCRIPT_ACTION_WAIT_FOR_TRIGGER
    }

    if (CONF_VARIABLES in action) {
        return SCRIPT_ACTION_VARIABLES
    }

    return SCRIPT_ACTION_CALL_SERVICE
}

export const ACTION_TYPE_SCHEMAS: Dict[str, Callable[[Any], dict]]  = {
    SCRIPT_ACTION_CALL_SERVICE: SERVICE_SCHEMA,
    SCRIPT_ACTION_DELAY: _SCRIPT_DELAY_SCHEMA,
    SCRIPT_ACTION_WAIT_TEMPLATE: _SCRIPT_WAIT_TEMPLATE_SCHEMA,
    SCRIPT_ACTION_FIRE_EVENT: EVENT_SCHEMA,
    SCRIPT_ACTION_CHECK_CONDITION: CONDITION_SCHEMA,
    SCRIPT_ACTION_DEVICE_AUTOMATION: DEVICE_ACTION_SCHEMA,
    SCRIPT_ACTION_ACTIVATE_SCENE: _SCRIPT_SCENE_SCHEMA,
    SCRIPT_ACTION_REPEAT: _SCRIPT_REPEAT_SCHEMA,
    SCRIPT_ACTION_CHOOSE: _SCRIPT_CHOOSE_SCHEMA,
    SCRIPT_ACTION_WAIT_FOR_TRIGGER: _SCRIPT_WAIT_FOR_TRIGGER_SCHEMA,
    SCRIPT_ACTION_VARIABLES: _SCRIPT_SET_SCHEMA,
}
