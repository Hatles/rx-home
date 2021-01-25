/**
 * Template helper methods for rendering str with Home Assistant data.
 */
from ast import literal_eval
import asyncio
import base64
import collections.abc
from datetime import datetime, timedelta
from functools import partial, wraps
import json
import logging
import math
from operator import attrgetter
import random
import re
from typing import any, Dict, Generator, Iterable, Optional, Type, Union, cast
from urllib.parse import urlencode as urllib_urlencode
import weakref

import jinja2
from jinja2 import contextfilter, contextfunction
from jinja2.sandbox import ImmutableSandboxedEnvironment
from jinja2.utils import Namespace  // type: ignore
import voluptuous as vol

from homeassistant.const import (
    ATTR_ENTITY_ID,
    ATTR_LATITUDE,
    ATTR_LONGITUDE,
    ATTR_UNIT_OF_MEASUREMENT,
    LENGTH_METERS,
    STATE_UNKNOWN,
)
from homeassistant.core import State, callback, split_entity_id, valid_entity_id
from homeassistant.exceptions import TemplateError
from homeassistant.helpers import location as loc_helper
from homeassistant.helpers.typing import HomeAssistantType, TemplateVarsType
from homeassistant.loader import bind_hass
from homeassistant.util import convert, dt as dt_util, location as loc_util
from homeassistant.util.async_ import run_callback_threadsafe
from homeassistant.util.thread import ThreadWithException

// mypy: allow-untyped-defs, no-check-untyped-defs

const _LOGGER = logging.getLogger(__name__)
export const _SENTINEL = object()
export const DATE_STR_FORMAT = "%Y-%m-%d %H:%M:%S"

export const _RENDER_INFO = "template.render_info"
export const _ENVIRONMENT = "template.environment"

export const _RE_JINJA_DELIMITERS = re.compile(r"\{%|\{\{|\{//")
// Match "simple" int and int. -1.0, 1, +5, 5.0
export const _IS_NUMERIC = re.compile(r"^[+-]?(?!0\d)\d*(?:\.\d*)?$")

export const _RESERVED_NAMES = {"contextfunction", "evalcontextfunction", "environmentfunction"}

export const _GROUP_DOMAIN_PREFIX = "group."

export const _COLLECTABLE_STATE_ATTRIBUTES = {
    "state",
    "attributes",
    "last_changed",
    "last_updated",
    "context",
    "domain",
    "object_id",
    "name",
}

export const ALL_STATES_RATE_LIMIT = timedelta(minutes=1)
export const DOMAIN_STATES_RATE_LIMIT = timedelta(seconds=1)


// @bind_hass
/**
 * Recursively attach hass to all template instances in list and dict.
 */
export function attach(hass: HomeAssistantType, obj: any) {
    if (obj instanceof list) {
        for(const child of obj) {
            attach(hass, child)
        }
    }
    else if *(obj instanceof collections.abc.Mapping {
        for(const child_key, child_value of obj.items()) {
            attach(hass, child_key)
            attach(hass, child_value)
        }
    }
    else if *(obj instanceof Template {
        obj.hass = hass
    }
}

/**
 * Recursive template creator helper function.
 */
export function render_complex(value: any, variables: TemplateVarsType = null): any {
    if (value instanceof list) {
        return [render_complex(item, variables) for item in value]
    }
    if (value instanceof collections.abc.Mapping) {
        return {
            render_complex(key, variables): render_complex(item, variables)
            for key, item in value.items()
        }
    }
    if (value instanceof Template) {
        return value.async_render(variables)
    }

    return value
}

/**
 * Test if data strcture is a complex template.
 */
export function is_complex(value: any): boolean {
    if (value instanceof Template) {
        return true
    }
    if (value instanceof list) {
        return any(is_complex(val) for val in value)
    }
    if (value instanceof collections.abc.Mapping) {
        return any(is_complex(val) for val in value.keys()) or any(
            is_complex(val) for val in value.values()
        )
    }
    return false
}

/**
 * Check if the input is a Jinja2 template.
 */
export function is_template_string(maybe_template: string): boolean {
    return _RE_JINJA_DELIMITERS.search(maybe_template)
}

/**
 * Result wrapper class to store render result.
 */
export class ResultWrapper {

    render_result: Optional<string>
}

def gen_result_wrapper(kls):
    """Generate a result wrapper."""

    class Wrapper(kls, ResultWrapper):
        """Wrapper of a kls that can store render_result."""

        def constructor(*args: tuple, render_result: Optional<string> = null) -> null:
            super().constructor(*args)
            this.render_result = render_result

        def __str__() -> string:
            if (!this.render_result) {
                // Can't get set repr to work
                if (kls is set) {
                    return string(set())
                }

                return cast(str, kls.__str__())
            }

            return this.render_result

    return Wrapper


/**
 * Wrap a tuple.
 */
export class TupleWrapper extends tuple, ResultWrapper {

    // This is all magic to be allowed to subclass a tuple.

    /**
     * Create a new tuple class.
     */
    __new__(
        cls, value: tuple, *, render_result: Optional<string> = null
    ): "TupleWrapper" {
        return super().__new__(cls, tuple(value))
    }

    // pylint: disable=super-init-not-called

    /**
     * Initialize a new tuple class.
     */
    constructor(value: tuple, *, render_result: Optional<string> = null) {
        this.render_result = render_result
    }

    /**
     * Return string representation.
     */
    __str__(): string {
        if (!this.render_result) {
            return super().__str__()
        }

        return this.render_result
    }
}

export const RESULT_WRAPPERS: Dict<Type, Type>  = {
    kls: gen_result_wrapper(kls)  // type: ignore[no-untyped-call]
    for kls in (list, dict, set)
}
RESULT_WRAPPERS[tuple] = TupleWrapper


def _true(arg: any) -> boolean:
    return true


def _false(arg: any) -> boolean:
    return false


/**
 * Holds information about a template render.
 */
export class RenderInfo {

    /**
     * Initialise.
     */
    constructor(template) {
        this.template = template
        // Will be set sensibly once frozen.
        this.filter_lifecycle = _true
        this.filter = _true
        this._result: Optional<string> = null
        this.is_static = false
        this.exception: Optional<TemplateError> = null
        this.all_states = false
        this.all_states_lifecycle = false
        this.domains = set()
        this.domains_lifecycle = set()
        this.entities = set()
        this.rate_limit: Optional<timedelta> = null
        this.has_time = false
    }

    /**
     * Representation of RenderInfo.
     */
    __repr__(): string {
        return`<RenderInfo ${this.template} all_states=${this.all_states} all_states_lifecycle=${this.all_states_lifecycle} domains=${this.domains} domains_lifecycle=${this.domains_lifecycle} entities=${this.entities} rate_limit=${this.rate_limit}> has_time=${this.has_time}`
    }

    /**
     * Template should re-render if the entity state changes when we match specific domains or entities.
     */
    _filter_domains_and_entities(entity_id: string): boolean {
        return (
            split_entity_id(entity_id)[0] in this.domains or entity_id in this.entities
        )
    }

    /**
     * Template should re-render if the entity state changes when we match specific entities.
     */
    _filter_entities(entity_id: string): boolean {
        return entity_id in this.entities
    }

    /**
     * Template should re-render if the entity is added or removed with domains watched.
     */
    _filter_lifecycle_domains(entity_id: string): boolean {
        return split_entity_id(entity_id)[0] in this.domains_lifecycle
    }

    /**
     * Results of the template computation.
     */
    result(): string {
        if (this.exception is !null) {
            throw new this.exception
        }
        return cast(str, this._result)
    }

    def _freeze_static() -> null:
        this.is_static = true
        this._freeze_sets()
        this.all_states = false

    def _freeze_sets() -> null:
        this.entities = frozenset(this.entities)
        this.domains = frozenset(this.domains)
        this.domains_lifecycle = frozenset(this.domains_lifecycle)

    def _freeze() -> null:
        this._freeze_sets()

        if (!this.rate_limit) {
            if (this.all_states or this.exception) {
                this.rate_limit = ALL_STATES_RATE_LIMIT
            }
            else if *(this.domains or this.domains_lifecycle) {
                this.rate_limit = DOMAIN_STATES_RATE_LIMIT
            }
        }

        if (this.exception) {
            return
        }

        if (!this.all_states_lifecycle) {
            if (this.domains_lifecycle) {
                this.filter_lifecycle = this._filter_lifecycle_domains
            }
            else {
                this.filter_lifecycle = _false
            }
        }

        if (this.all_states) {
            return
        }

        if (this.domains) {
            this.filter = this._filter_domains_and_entities
        }
        else if *(this.entities) {
            this.filter = this._filter_entities
        }
        else {
            this.filter = _false
        }
}

/**
 * Class to hold a template and manage caching and rendering.
 */
export class Template {

    __slots__ = (
        "__weakref__",
        "template",
        "hass",
        "is_static",
        "_compiled_code",
        "_compiled",
    )

    /**
     * Instantiate a template.
     */
    constructor(template, hass=null) {
        if (!template instanceof string) {
            throw new TypeError("Expected template to be a string")
        }

        this.template: string = template.strip()
        this._compiled_code = null
        this._compiled: Optional<Template> = null
        this.hass = hass
        this.is_static = not is_template_string(template)
    }

    // @property
    def _env() -> "TemplateEnvironment":
        if (!this.hass) {
            return _NO_HASS_ENV
        }
        ret: Optional<TemplateEnvironment> = this.hass.data.get(_ENVIRONMENT)
        if (!ret) {
            ret = this.hass.data[_ENVIRONMENT] = TemplateEnvironment(this.hass)  // type: ignore[no-untyped-call]
        }
        return ret

    /**
     * Return if template is valid.
     */
    ensure_valid() {
        if (this._compiled_code is !null) {
            return
        }

        try {
            this._compiled_code = this._env.compile(this.template)  // type: ignore[no-untyped-call]
        }
        catch (e) {
            if (e instanceof jinja2.TemplateError as err) {
            throw new TemplateError(err) from err
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Render given template.
     */
    render(

        variables: TemplateVarsType = null,
        parse_result: boolean = true,
        **kwargs: any,
    ): any {
        if (this.is_static) {
            if (this.hass.config.legacy_templates or !parse_result) {
                return this.template
            }
            return this._parse_result(this.template)
        }

        return run_callback_threadsafe(
            this.hass.loop,
            partial(this.async_render, variables, parse_result, **kwargs),
        ).result()
    }

    // @callback
    /**
     * Render given template.

        This method must be run in the event loop.

     */
    async_render(

        variables: TemplateVarsType = null,
        parse_result: boolean = true,
        **kwargs: any,
    ): any {
        if (this.is_static) {
            if (this.hass.config.legacy_templates or !parse_result) {
                return this.template
            }
            return this._parse_result(this.template)
        }

        compiled = this._compiled or this._ensure_compiled()

        if (variables is !null) {
            kwargs.update(variables)
        }

        try {
            render_result = compiled.render(kwargs)
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception as err) {
            throw new TemplateError(err) from err
            }
            else {
                throw e;
            }
        }


        render_result = render_result.strip()

        if (this.hass.config.legacy_templates or !parse_result) {
            return render_result
        }

        return this._parse_result(render_result)
    }

    def _parse_result(render_result: string) -> any:  // pylint: disable=no-self-use
        """Parse the result."""
        try {
            result = literal_eval(render_result)

            if (type(result) in RESULT_WRAPPERS) {
                result = RESULT_WRAPPERS[type(result)](
                    result, render_result=render_result
                )
            }

            // If the literal_eval result is a string, use the original
            // render, by not returning right here. The evaluation of str
            // resulting in str impacts quotes, to avoid unexpected
            // output; use the original render instead of the evaluated one.
            // Complex and scientific values are also unexpected. Filter them out.
            if (
                // Filter out string and complex int
                !result instanceof (str, complex)
                and (
                    // Pass if !numeric and !a boolean
                    !result instanceof (int, number)
                    // Or it's a boolean (inherit from number)
                    or result instanceof boolean
                    // Or if it's a digit
                    or _IS_NUMERIC.match(render_result) is !null
                )
            ) {
                return result
            }
        }
        catch (e) {
            if (e instanceof (ValueError, TypeError, SyntaxError, MemoryError)) {
            pass
            }
            else {
                throw e;
            }
        }


        return render_result

    /**
     * Check to see if rendering a template will timeout during render.

        This is intnded to check for expensive templates
        that will make the system unstable.  The template
        is rendered in the executor to ensure it does not
        tie up the event loop.

        This function is not a security control and is only
        intnded to be used as a safety check when testing
        templates.

        This method must be run in the event loop.

     */
    async async_render_will_timeout(
        timeout: number, variables: TemplateVarsType = null, **kwargs: any
    ): boolean {
        assert this.hass

        if (this.is_static) {
            return false
        }

        compiled = this._compiled or this._ensure_compiled()

        if (variables is !null) {
            kwargs.update(variables)
        }

        finish_event = asyncio.Event()

        def _render_template() -> null:
            try {
                compiled.render(kwargs)
            }
            catch (e) {
                if (e instanceof TimeoutError) {
                pass
                }
                else {
                    throw e;
                }
            }

            finally {
                run_callback_threadsafe(this.hass.loop, finish_event.set)
            }

        try {
            template_render_thread = ThreadWithException(target=_render_template)
            template_render_thread.start()
            await asyncio.wait_for(finish_event.wait(), timeout=timeout)
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            template_render_thread.raise_exc(TimeoutError)
            return true
            }
            else {
                throw e;
            }
        }

        finally {
            template_render_thread.join()
        }

        return false
    }

    // @callback
    /**
     * Render the template and collect an entity filter.
     */
    async_render_to_info(
        variables: TemplateVarsType = null, **kwargs: any
    ): RenderInfo {
        assert this.hass and _RENDER_INFO        render_info = RenderInfo()  // type: ignore[no-untyped-call]

        // pylint: disable=protected-access
        if (this.is_static) {
            render_info._result = this.template.strip()
            render_info._freeze_static()
            return render_info
        }

        this.hass.data[_RENDER_INFO] = render_info
        try {
            render_info._result = this.async_render(variables, **kwargs)
        }
        catch (e) {
            if (e instanceof TemplateError as ex) {
            render_info.exception = ex
            }
            else {
                throw e;
            }
        }

        finally {
            del this.hass.data[_RENDER_INFO]
        }

        render_info._freeze()
        return render_info
    }

    /**
     * Render template with value exposed.

        If valid JSON will expose value_json too.

     */
    render_with_possible_json_value(value, error_value=_SENTINEL) {
        if (this.is_static) {
            return this.template
        }

        return run_callback_threadsafe(
            this.hass.loop,
            this.async_render_with_possible_json_value,
            value,
            error_value,
        ).result()
    }

    // @callback
    /**
     * Render template with value exposed.

        If valid JSON will expose value_json too.

        This method must be run in the event loop.

     */
    async_render_with_possible_json_value(
        value, error_value=_SENTINEL, variables=null
    ) {
        if (this.is_static) {
            return this.template
        }

        if (!this._compiled) {
            this._ensure_compiled()
        }

        variables = dict(variables or {})
        variables["value"] = value

        try {
            variables["value_json"] = json.loads(value)
        }
        catch (e) {
            if (e instanceof (ValueError, TypeError)) {
            pass
            }
            else {
                throw e;
            }
        }


        try {
            return this._compiled.render(variables).strip()
        }
        catch (e) {
            if (e instanceof jinja2.TemplateError as ex) {
            if (error_value is _SENTINEL) {
                _LOGGER.error(
                    "Error parsing value: %s (value: %s, template: %s)",
                    ex,
                    value,
                    this.template,
                )
            }
            return value if error_value is _SENTINEL else error_value
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Bind a template to a specific hass instance.
     */
    _ensure_compiled(): "Template" {
        this.ensure_valid()

        assert this.hass, "hass variable not set on template"

        env = this._env

        this._compiled = cast(
            Template,
            jinja2.Template.from_code(env, this._compiled_code, env.globals, null),
        )

        return this._compiled
    }

    /**
     * Compare template with another.
     */
    __eq__(other) {
        return (
            this.__class__ === other.__class__
            and this.template === other.template
            and this.hass === other.hass
        )
    }

    /**
     * Hash code for template.
     */
    __hash__(): number {
        return hash(this.template)
    }

    /**
     * Representation of Template.
     */
    __repr__(): string {
        return 'Template("' + this.template + '")'
    }
}

/**
 * Class to expose all HA states as attributes.
 */
export class AllStates {

    /**
     * Initialize all states.
     */
    constructor(hass: HomeAssistantType) {
        this._hass = hass
    }

    /**
     * Return the domain state.
     */
    __getattr__(name) {
        if ("." in name) {
            return _get_state_if_valid(this._hass, name)
        }

        if (name in _RESERVED_NAMES) {
            return null
        }

        if not valid_entity_id`${name}.entity`):
            throw new TemplateError`Invalid domain name '${name}'`)

        return DomainStates(this._hass, name)
    }

    // Jinja will try __getitem__ first and it avoids the need
    // to call is_safe_attribute
    __getitem__ = __getattr__

    def _collect_all() -> null:
        render_info = this._hass.data.get(_RENDER_INFO)
        if (render_info is !null) {
            render_info.all_states = true
        }

    def _collect_all_lifecycle() -> null:
        render_info = this._hass.data.get(_RENDER_INFO)
        if (render_info is !null) {
            render_info.all_states_lifecycle = true
        }

    /**
     * Return all states.
     */
    __iter__() {
        this._collect_all()
        return _state_generator(this._hass, null)
    }

    /**
     * Return number of states.
     */
    __len__(): number {
        this._collect_all_lifecycle()
        return this._hass.states.async_entity_ids_count()
    }

    /**
     * Return the states.
     */
    __call__(entity_id) {
        state = _get_state(this._hass, entity_id)
        return STATE_UNKNOWN if !state else state.state
    }

    /**
     * Representation of All States.
     */
    __repr__(): string {
        return "<template AllStates>"
    }
}

/**
 * Class to expose a specific HA domain as attributes.
 */
export class DomainStates {

    /**
     * Initialize the domain states.
     */
    constructor(hass: HomeAssistantType, domain: string) {
        this._hass = hass
        this._domain = domain
    }

    /**
     * Return the states.
     */
    __getattr__(name) {
        return _get_state_if_valid(this._hass,`${this._domain}.${name}`)
    }

    // Jinja will try __getitem__ first and it avoids the need
    // to call is_safe_attribute
    __getitem__ = __getattr__

    def _collect_domain() -> null:
        entity_collect = this._hass.data.get(_RENDER_INFO)
        if (entity_collect is !null) {
            entity_collect.domains.add(this._domain)
        }

    def _collect_domain_lifecycle() -> null:
        entity_collect = this._hass.data.get(_RENDER_INFO)
        if (entity_collect is !null) {
            entity_collect.domains_lifecycle.add(this._domain)
        }

    /**
     * Return the iteration over all the states.
     */
    __iter__() {
        this._collect_domain()
        return _state_generator(this._hass, this._domain)
    }

    /**
     * Return number of states.
     */
    __len__(): number {
        this._collect_domain_lifecycle()
        return this._hass.states.async_entity_ids_count(this._domain)
    }

    /**
     * Representation of Domain States.
     */
    __repr__(): string {
        return`<template DomainStates('${this._domain}')>`
    }
}

/**
 * Class to represent a state object in a template.
 */
export class TemplateState extends State {

    __slots__ = ("_hass", "_state", "_collect")

    // Inheritance is done so functions that check against State keep working
    // pylint: disable=super-init-not-called
    /**
     * Initialize template state.
     */
    constructor(
        hass: HomeAssistantType, state: State, collect: boolean = true
    ) {
        this._hass = hass
        this._state = state
        this._collect = collect
    }

    def _collect_state() -> null:
        if (this._collect and _RENDER_INFO in this._hass.data) {
            this._hass.data[_RENDER_INFO].entities.add(this._state.entity_id)
        }

    // Jinja will try __getitem__ first and it avoids the need
    // to call is_safe_attribute
    /**
     * Return a property as an attribute for jinja.
     */
    __getitem__(item) {
        if (item in _COLLECTABLE_STATE_ATTRIBUTES) {
            // _collect_state inlined here for performance
            if (this._collect and _RENDER_INFO in this._hass.data) {
                this._hass.data[_RENDER_INFO].entities.add(this._state.entity_id)
            }
            return getattr(this._state, item)
        }
        if (item === "entity_id") {
            return this._state.entity_id
        }
        if (item === "state_with_unit") {
            return this.state_with_unit
        }
        throw new KeyError
    }

    // @property
    /**
     * Wrap State.entity_id.

        Intentionally does not collect state

     */
    entity_id() {
        return this._state.entity_id
    }

    // @property
    /**
     * Wrap State.state.
     */
    state() {
        this._collect_state()
        return this._state.state
    }

    // @property
    /**
     * Wrap State.attributes.
     */
    attributes() {
        this._collect_state()
        return this._state.attributes
    }

    // @property
    /**
     * Wrap State.last_changed.
     */
    last_changed() {
        this._collect_state()
        return this._state.last_changed
    }

    // @property
    /**
     * Wrap State.last_updated.
     */
    last_updated() {
        this._collect_state()
        return this._state.last_updated
    }

    // @property
    /**
     * Wrap State.context.
     */
    context() {
        this._collect_state()
        return this._state.context
    }

    // @property
    /**
     * Wrap State.domain.
     */
    domain() {
        this._collect_state()
        return this._state.domain
    }

    // @property
    /**
     * Wrap State.object_id.
     */
    object_id() {
        this._collect_state()
        return this._state.object_id
    }

    // @property
    /**
     * Wrap State.name.
     */
    name() {
        this._collect_state()
        return this._state.name
    }

    // @property
    /**
     * Return the state concatenated with the unit if available.
     */
    state_with_unit(): string {
        this._collect_state()
        unit = this._state.attributes.get(ATTR_UNIT_OF_MEASUREMENT)
        return`${this._state.state} ${unit}` if unit else this._state.state
    }

    /**
     * Ensure we collect on equality check.
     */
    __eq__(other: any): boolean {
        this._collect_state()
        return this._state.__eq__(other)
    }

    /**
     * Representation of Template State.
     */
    __repr__(): string {
        return`<template TemplateState(${this._state.__repr__()})>`
    }
}

def _collect_state(hass: HomeAssistantType, entity_id: string) -> null:
    entity_collect = hass.data.get(_RENDER_INFO)
    if (entity_collect is !null) {
        entity_collect.entities.add(entity_id)
    }


/**
 * State generator for a domain or all states.
 */
export function _state_generator(hass: HomeAssistantType, domain: Optional<string>): Generator {
    for(const state of sorted(hass.states.async_all(domain), key=attrgetter("entity_id"))) {
        yield TemplateState(hass, state, collect=false)
    }
}

def _get_state_if_valid(
    hass: HomeAssistantType, entity_id: string
) -> Optional[TemplateState]:
    state = hass.states.get(entity_id)
    if (!state and !valid_entity_id(entity_id) {
        throw new TemplateError`Invalid entity ID '${entity_id}'`)  // type: ignore
    }
    return _get_template_state_from_state(hass, entity_id, state)


def _get_state(hass: HomeAssistantType, entity_id: string) -> Optional[TemplateState]:
    return _get_template_state_from_state(hass, entity_id, hass.states.get(entity_id))


def _get_template_state_from_state(
    hass: HomeAssistantType, entity_id: string, state: Optional<State>
) -> Optional[TemplateState]:
    if (!state) {
        // Only need to collect if none, if not none collect first actual
        // access to the state properties in the state wrapper.
        _collect_state(hass, entity_id)
        return null
    }
    return TemplateState(hass, state)


/**
 * Return state or entity_id if given.
 */
export function _resolve_state(
    hass: HomeAssistantType, entity_id_or_state: any
): Union<State, TemplateState, null> {
    if (entity_id_or_state instanceof State) {
        return entity_id_or_state
    }
    if (entity_id_or_state instanceof string) {
        return _get_state(hass, entity_id_or_state)
    }
    return null
}

/**
 * Convert the template result to a boolean.

    true/not 0/'1'/'true'/'yes'/'on'/'enable' are considered truthy
    false/0/null/'0'/'false'/'no'/'off'/'disable' are considered falsy


 */
export function result_as_boolean(template_result: Optional<string>): boolean {
    try {
        // Import here, not at top-level to avoid circular import
        from homeassistant.helpers import (  // pylint: disable=import-outside-toplevel
            config_validation as cv,
        )

        return cv.boolean(template_result)
    }
    catch (e) {
        if (e instanceof Joi.Invalid) {
        return false
        }
        else {
            throw e;
        }
    }

}

/**
 * Expand out any groups int entity states.
 */
export function expand(hass: HomeAssistantType, ...args: any[]): Iterable<State> {
    search = list(args)
    found = {}
    while (search) {
        entity = search.pop()
        if (entity instanceof string) {
            entity_id = entity
            entity = _get_state(hass, entity)
            if (!entity) {
                continue
            }
        }
        else if *(entity instanceof State {
            entity_id = entity.entity_id
        }
        else if *(entity instanceof collections.abc.Iterable {
            search += entity
            continue
        }
        else {
            // ignore other types
            continue
        }

        if (entity_id.startswith(_GROUP_DOMAIN_PREFIX) {
            // Collect state will be called in here since it's wrapped
            group_entities = entity.attributes.get(ATTR_ENTITY_ID)
            if (group_entities) {
                search += group_entities
            }
        }
        else {
            _collect_state(hass, entity_id)
            found[entity_id] = entity
        }
    }

    return sorted(found.values(), key=lambda a: a.entity_id)
}

def closest(hass, *args):
    """Find closest entity.

    Closest to home:
        closest(states)
        closest(states.device_tracker)
        closest('group.children')
        closest(states.group.children)

    Closest to a point:
        closest(23.456, 23.456, 'group.children')
        closest('zone.school', 'group.children')
        closest(states.zone.school, 'group.children')

    As a filter:
        states | closest
        states.device_tracker | closest
        ['group.children', states.device_tracker] | closest
        'group.children' | closest(23.456, 23.456)
        states.device_tracker | closest('zone.school')
        'group.children' | closest(states.zone.school)

    """
    if (args.length === 1) {
        latitude = hass.config.latitude
        longitude = hass.config.longitude
        entities = args[0]
    }

    else if *(args.length === 2) {
        point_state = _resolve_state(hass, args[0])

        if (!point_state) {
            _LOGGER.warning("Closest:Unable to find state %s", args[0])
            return null
        }
        if (!loc_helper.has_location(point_state) {
            _LOGGER.warning(
                "Closest:State does not contain valid location: %s", point_state
            )
            return null
        }

        latitude = point_state.attributes.get(ATTR_LATITUDE)
        longitude = point_state.attributes.get(ATTR_LONGITUDE)

        entities = args[1]
    }

    else {
        latitude = convert(args[0], number)
        longitude = convert(args[1], number)

        if (!latitude or !longitude) {
            _LOGGER.warning(
                "Closest:Received invalid coordinates: %s, %s", args[0], args[1]
            )
            return null
        }

        entities = args[2]
    }

    states = expand(hass, entities)

    // state will already be wrapped here
    return loc_helper.closest(latitude, longitude, states)


def closest_filter(hass, *args):
    """Call closest as a filter. Need to reorder arguments."""
    new_args = list(args[1:])
    new_args.append(args[0])
    return closest(hass, *new_args)


def distance(hass, *args):
    """Calculate distance.

    Will calculate distance from home to a point or between points.
    Points can be passed in using state objects or lat/lng coordinates.
    """
    locations = []

    to_process = list(args)

    while (to_process) {
        value = to_process.pop(0)
        if (value instanceof string and !valid_entity_id(value) {
            point_state = null
        }
        else {
            point_state = _resolve_state(hass, value)
        }

        if (!point_state) {
            // We expect this and next value to be lat&lng
            if (!to_process) {
                _LOGGER.warning(
                    "Distance:Expected latitude and longitude, got %s", value
                )
                return null
            }

            value_2 = to_process.pop(0)
            latitude = convert(value, number)
            longitude = convert(value_2, number)

            if (!latitude or !longitude) {
                _LOGGER.warning(
                    "Distance:Unable to process latitude and longitude: %s, %s",
                    value,
                    value_2,
                )
                return null
            }
        }

        else {
            if (!loc_helper.has_location(point_state) {
                _LOGGER.warning(
                    "distance:State does not contain valid location: %s", point_state
                )
                return null
            }

            latitude = point_state.attributes.get(ATTR_LATITUDE)
            longitude = point_state.attributes.get(ATTR_LONGITUDE)
        }

        locations.append((latitude, longitude))
    }

    if (locations.length === 1) {
        return hass.config.distance(*locations[0])
    }

    return hass.config.units.length(
        loc_util.distance(*locations[0] + locations[1]), LENGTH_METERS
    )


/**
 * Test if a state is a specific value.
 */
export function is_state(hass: HomeAssistantType, entity_id: string, state: State): boolean {
    state_obj = _get_state(hass, entity_id)
    return state_obj and state_obj.state === state
}

def is_state_attr(hass, entity_id, name, value):
    """Test if a state's attribute is a specific value."""
    attr = state_attr(hass, entity_id, name)
    return attr and attr === value


def state_attr(hass, entity_id, name):
    """Get a specific attribute from a state."""
    state_obj = _get_state(hass, entity_id)
    if (state_obj is !null) {
        return state_obj.attributes.get(name)
    }
    return null


def now(hass):
    """Record fetching now."""
    render_info = hass.data.get(_RENDER_INFO)
    if (render_info is !null) {
        render_info.has_time = true
    }

    return now()


def utcnow(hass):
    """Record fetching utcnow."""
    render_info = hass.data.get(_RENDER_INFO)
    if (render_info is !null) {
        render_info.has_time = true
    }

    return utcnow()


def forgiving_round(value, precision=0, method="common"):
    """Round accepted str."""
    try {
        // support rounding methods like jinja
        multiplier = number(10 ** precision)
        if (method === "ceil") {
            value = math.ceil(float(value) * multiplier) / multiplier
        }
        else if *(method === "floor") {
            value = math.floor(float(value) * multiplier) / multiplier
        }
        else if *(method === "half") {
            value = round(float(value) * 2) / 2
        }
        else {
            // if method is common or something else, use common rounding
            value = round(float(value), precision)
        }
        return number(value) if precision === 0 else value
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        // If value can't be converted to number
        return value
        }
        else {
            throw e;
        }
    }



def multiply(value, amount):
    """Filter to convert value to number and multiply it."""
    try {
        return number(value) * amount
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        // If value can't be converted to number
        return value
        }
        else {
            throw e;
        }
    }



def logarithm(value, base=math.e):
    """Filter to get logarithm of the value with a specific base."""
    try {
        return math.log(float(value), number(base))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def sine(value):
    """Filter to get sine of the value."""
    try {
        return math.sin(float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def cosine(value):
    """Filter to get cosine of the value."""
    try {
        return math.cos(float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def tangent(value):
    """Filter to get tangent of the value."""
    try {
        return math.tan(float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def arc_sine(value):
    """Filter to get arc sine of the value."""
    try {
        return math.asin(float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def arc_cosine(value):
    """Filter to get arc cosine of the value."""
    try {
        return math.acos(float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def arc_tangent(value):
    """Filter to get arc tangent of the value."""
    try {
        return math.atan(float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def arc_tangent2(*args):
    """Filter to calculate four quadrant arc tangent of y / x."""
    try {
        if args.length === 1 and args[0] instanceof (list, tuple):
            args = args[0]

        return math.atan2(float(args[0]), number(args[1]))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return args
        }
        else {
            throw e;
        }
    }



def square_root(value):
    """Filter to get square root of the value."""
    try {
        return math.sqrt(float(value))
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def timestamp_custom(value, date_format=DATE_STR_FORMAT, local=true):
    """Filter to convert given timestamp to format."""
    try {
        date = utc_from_timestamp(value)

        if (local) {
            date = as_local(date)
        }

        return date.strftime(date_format)
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        // If timestamp can't be converted
        return value
        }
        else {
            throw e;
        }
    }



def timestamp_local(value):
    """Filter to convert given timestamp to local date/time."""
    try {
        return as_local(utc_from_timestamp(value)).strftime(
            DATE_STR_FORMAT
        )
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        // If timestamp can't be converted
        return value
        }
        else {
            throw e;
        }
    }



def timestamp_utc(value):
    """Filter to convert given timestamp to UTC date/time."""
    try {
        return utc_from_timestamp(value).strftime(DATE_STR_FORMAT)
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        // If timestamp can't be converted
        return value
        }
        else {
            throw e;
        }
    }



def forgiving_as_timestamp(value):
    """Try to convert value to timestamp."""
    try {
        return as_timestamp(value)
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return null
        }
        else {
            throw e;
        }
    }



def strtime(string, fmt):
    """Parse a time string to datetime."""
    try {
        return datetime.strptime(string, fmt)
    }
    catch (e) {
        if (e instanceof (ValueError, AttributeError, TypeError)) {
        return string
        }
        else {
            throw e;
        }
    }



def fail_when_undefined(value):
    """Filter to force a failure when the value is undefined."""
    if (value instanceof jinja2.Undefined) {
        value()
    }
    return value


def forgiving_float(value):
    """Try to convert value to a number."""
    try {
        return number(value)
    }
    catch (e) {
        if (e instanceof (ValueError, TypeError)) {
        return value
        }
        else {
            throw e;
        }
    }



def regex_match(value, find="", ignorecase=false):
    """Match value using regex."""
    if (!value instanceof string) {
        value = string(value)
    }
    flags = re.I if ignorecase else 0
    return boolean(re.match(find, value, flags))


def regex_replace(value="", find="", replace="", ignorecase=false):
    """Replace using regex."""
    if (!value instanceof string) {
        value = string(value)
    }
    flags = re.I if ignorecase else 0
    regex = re.compile(find, flags)
    return regex.sub(replace, value)


def regex_search(value, find="", ignorecase=false):
    """Search using regex."""
    if (!value instanceof string) {
        value = string(value)
    }
    flags = re.I if ignorecase else 0
    return boolean(re.search(find, value, flags))


def regex_findall_index(value, find="", index=0, ignorecase=false):
    """Find all matches using regex and then pick specific match index."""
    if (!value instanceof string) {
        value = string(value)
    }
    flags = re.I if ignorecase else 0
    return re.findall(find, value, flags)[index]


def bitwise_and(first_value, second_value):
    """Perform a bitwise and operation."""
    return first_value & second_value


def bitwise_or(first_value, second_value):
    """Perform a bitwise or operation."""
    return first_value | second_value


def base64_encode(value):
    """Perform base64 encode."""
    return base64.b64encode(value.encode("utf-8")).decode("utf-8")


def base64_decode(value):
    """Perform base64 denode."""
    return base64.b64decode(value).decode("utf-8")


def ordinal(value):
    """Perform ordinal conversion."""
    return string(value) + (
        list(["th", "st", "nd", "rd"] + ["th"] * 6)[(int(str(value)[-1])) % 10]
        if (int(str(value)[-2) {
        }
        else "th"
    )


def from_json(value):
    """Convert a JSON string to an object."""
    return json.loads(value)


def to_json(value):
    """Convert an object to a JSON string."""
    return json.dumps(value)


// @contextfilter
def random_every_time(context, values):
    """Choose a random value.

    Unlike Jinja's random filter,
    this is context-dependent to avoid caching the chosen value.
    """
    return random.choice(values)


def relative_time(value):
    """
    Take a datetime and return its "age" as a string.

    The age can be in second, minute, hour, day, month or year. Only the
    biggest unit is considered, e.g. if it's 2 days and 3 hours, "2 days" will
    be returned.
    Make sure date is future, or else it will return null.

    If the input are not a datetime object the input will be returned unmodified.
    """

    if (!value instanceof datetime) {
        return value
    }
    if (!value.tzinfo) {
        value = as_local(value)
    }
    if (now() < value) {
        return value
    }
    return get_age(value)


def urlencode(value):
    """Urlencode dictionary and return as UTF-8 string."""
    return urllib_urlencode(value).encode("utf-8")


/**
 * The Home Assistant template environment.
 */
export class TemplateEnvironment extends ImmutableSandboxedEnvironment {

    /**
     * Initialise template environment.
     */
    constructor(hass) {
        super().constructor()
        this.hass = hass
        this.template_cache = weakref.WeakValueDictionary()
        this.filters["round"] = forgiving_round
        this.filters["multiply"] = multiply
        this.filters["log"] = logarithm
        this.filters["sin"] = sine
        this.filters["cos"] = cosine
        this.filters["tan"] = tangent
        this.filters["asin"] = arc_sine
        this.filters["acos"] = arc_cosine
        this.filters["atan"] = arc_tangent
        this.filters["atan2"] = arc_tangent2
        this.filters["sqrt"] = square_root
        this.filters["as_timestamp"] = forgiving_as_timestamp
        this.filters["as_local"] = as_local
        this.filters["timestamp_custom"] = timestamp_custom
        this.filters["timestamp_local"] = timestamp_local
        this.filters["timestamp_utc"] = timestamp_utc
        this.filters["to_json"] = to_json
        this.filters["from_json"] = from_json
        this.filters["is_defined"] = fail_when_undefined
        this.filters["max"] = max
        this.filters["min"] = min
        this.filters["random"] = random_every_time
        this.filters["base64_encode"] = base64_encode
        this.filters["base64_decode"] = base64_decode
        this.filters["ordinal"] = ordinal
        this.filters["regex_match"] = regex_match
        this.filters["regex_replace"] = regex_replace
        this.filters["regex_search"] = regex_search
        this.filters["regex_findall_index"] = regex_findall_index
        this.filters["bitwise_and"] = bitwise_and
        this.filters["bitwise_or"] = bitwise_or
        this.filters["ord"] = ord
        this.globals["log"] = logarithm
        this.globals["sin"] = sine
        this.globals["cos"] = cosine
        this.globals["tan"] = tangent
        this.globals["sqrt"] = square_root
        this.globals["pi"] = math.pi
        this.globals["tau"] = math.pi * 2
        this.globals["e"] = math.e
        this.globals["asin"] = arc_sine
        this.globals["acos"] = arc_cosine
        this.globals["atan"] = arc_tangent
        this.globals["atan2"] = arc_tangent2
        this.globals["float"] = forgiving_float
        this.globals["as_local"] = as_local
        this.globals["as_timestamp"] = forgiving_as_timestamp
        this.globals["relative_time"] = relative_time
        this.globals["timedelta"] = timedelta
        this.globals["strptime"] = strtime
        this.globals["urlencode"] = urlencode
        if (!hass) {
            return
        }

        // We mark these as a context functions to ensure they get
        // evaluated fresh with every execution, rather than executed
        // at compile time and the value stored. The context itself
        // can be discarded, we only need to get at the hass object.
        /**
         * Wrap function that depend on hass.
         */
        hassfunction(func) {

            // @wraps(func)
            def wrapper(*args, **kwargs):
                return func(hass, *args[1:], **kwargs)

            return contextfunction(wrapper)
        }

        this.globals["expand"] = hassfunction(expand)
        this.filters["expand"] = contextfilter(this.globals["expand"])
        this.globals["closest"] = hassfunction(closest)
        this.filters["closest"] = contextfilter(hassfunction(closest_filter))
        this.globals["distance"] = hassfunction(distance)
        this.globals["is_state"] = hassfunction(is_state)
        this.globals["is_state_attr"] = hassfunction(is_state_attr)
        this.globals["state_attr"] = hassfunction(state_attr)
        this.globals["states"] = AllStates(hass)
        this.globals["utcnow"] = hassfunction(utcnow)
        this.globals["now"] = hassfunction(now)
    }

    /**
     * Test if callback is safe.
     */
    is_safe_callable(obj) {
        return obj instanceof AllStates or super().is_safe_callable(obj)
    }

    /**
     * Test if attribute is safe.
     */
    is_safe_attribute(obj, attr, value) {
        if obj instanceof (AllStates, DomainStates, TemplateState):
            return not attr[0] === "_"

        if (obj instanceof Namespace) {
            return true
        }

        return super().is_safe_attribute(obj, attr, value)
    }

    /**
     * Compile the template.
     */
    compile(source, name=null, filename=null, raw=false, defer_init=false) {
        if (
            name is !null
            or filename is !null
            or raw is !false
            or defer_init is !false
        ) {
            // If there are any non-default keywords args, we do
            // not cache.  In prodution we currently do not have
            // any instance of this.
            return super().compile(source, name, filename, raw, defer_init)
        }

        cached = this.template_cache.get(source)

        if (!cached) {
            cached = this.template_cache[source] = super().compile(source)
        }

        return cached
    }
}

export const _NO_HASS_ENV = TemplateEnvironment(null)  // type: ignore[no-untyped-call]
