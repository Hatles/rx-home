/**
 * Helpers for listening to events.
 */
import asyncio
import copy
from dataclasses import dataclass
from datetime import datetime, timedelta
import functools as ft
import logging
import time
from typing import (
    any,
    Awaitable,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Set,
    Tuple,
    Union,
)

import attr

from homeassistant.const import (
    ATTR_ENTITY_ID,
    ATTR_NOW,
    EVENT_CORE_CONFIG_UPDATE,
    EVENT_STATE_CHANGED,
    EVENT_TIME_CHANGED,
    MATCH_ALL,
    SUN_EVENT_SUNRISE,
    SUN_EVENT_SUNSET,
)
from homeassistant.core import (
    CALLBACK_TYPE,
    Event,
    HassJob,
    HomeAssistant,
    State,
    callback,
    split_entity_id,
)
from homeassistant.exceptions import TemplateError
from homeassistant.helpers.entity_registry import EVENT_ENTITY_REGISTRY_UPDATED
from homeassistant.helpers.ratelimit import KeyedRateLimit
from homeassistant.helpers.sun import get_astral_event_next
from homeassistant.helpers.template import RenderInfo, Template, result_as_boolean
from homeassistant.helpers.typing import TemplateVarsType
from homeassistant.loader import bind_hass
from homeassistant.util import dt as dt_util
from homeassistant.util.async_ import run_callback_threadsafe

export const TRACK_STATE_CHANGE_CALLBACKS = "track_state_change_callbacks"
export const TRACK_STATE_CHANGE_LISTENER = "track_state_change_listener"

export const TRACK_STATE_ADDED_DOMAIN_CALLBACKS = "track_state_added_domain_callbacks"
export const TRACK_STATE_ADDED_DOMAIN_LISTENER = "track_state_added_domain_listener"

export const TRACK_STATE_REMOVED_DOMAIN_CALLBACKS = "track_state_removed_domain_callbacks"
export const TRACK_STATE_REMOVED_DOMAIN_LISTENER = "track_state_removed_domain_listener"

export const TRACK_ENTITY_REGISTRY_UPDATED_CALLBACKS = "track_entity_registry_updated_callbacks"
export const TRACK_ENTITY_REGISTRY_UPDATED_LISTENER = "track_entity_registry_updated_listener"

export const _ALL_LISTENER = "all"
export const _DOMAINS_LISTENER = "domains"
export const _ENTITIES_LISTENER = "entities"

const _LOGGER = logging.getLogger(__name__)


// @dataclass
/**
 * Class for keeping track of states being tracked.

    all_states: All states on the system are being tracked
    entities: Entities to track
    domains: Domains to track

 */
export class TrackStates {

    all_states: boolean
    entities: Set
    domains: Set
}

// @dataclass
/**
 * Class for keeping track of a template with variables.

    The template is template to calculate.
    The variables are variables to pass to the template.
    The rate_limit is a rate limit on how often the template is re-rendered.

 */
export class TrackTemplate {

    template: Template
    variables: TemplateVarsType
    rate_limit: Optional<timedelta> = null
}

// @dataclass
/**
 * Class for result of template tracking.

    template
        The template that has changed.
    last_result
        The output from the template on the last successful run, or null
        if no previous successful run.
    result
        Result from the template run. This will be a string or an
        TemplateError if the template resulted in an error.

 */
export class TrackTemplateResult {

    template: Template
    last_result: any
    result: any
}

/**
 * Convert an async event helper to a threaded one.
 */
export function threaded_listener_factory(async_factory: Callable<..., any>): CALLBACK_TYPE {

    // @ft.wraps(async_factory)
    /**
     * Call async event helper safely.
     */
    factory(...args: any[], **kwargs: any): CALLBACK_TYPE {
        hass = args[0]

        if (!hass instanceof HomeAssistant) {
            throw new TypeError("First parameter needs to be a hass instance")
        }

        async_remove = run_callback_threadsafe(
            hass.loop, ft.partial(async_factory, *args, **kwargs)
        ).result()

        /**
         * Threadsafe removal.
         */
        remove() {
            run_callback_threadsafe(hass.loop, async_remove).result()
        }

        return remove
    }

    return factory
}

// @callback
// @bind_hass
/**
 * Track specific state changes.

    entity_ids, from_state and to_state can be string or list.
    Use list to match multiple.

    Returns a function that can be called to remove the listener.

    If entity_ids are not MATCH_ALL along with from_state and to_state
    being null, async_track_state_change_event should be used instead
    as it is slightly faster.

    Must be run within the event loop.

 */
export function async_track_state_change(
    hass: HomeAssistant,
    entity_ids: Union[str, Iterable[str]],
    action: Callable[[str, State, State], null],
    from_state: Union[null, string, Iterable[str]] = null,
    to_state: Union[null, string, Iterable[str]] = null,
): CALLBACK_TYPE {
    if (from_state is !null) {
        match_from_state = process_state_match(from_state)
    }
    if (to_state is !null) {
        match_to_state = process_state_match(to_state)
    }

    // Ensure it is a lowercase list with entity ids we want to match on
    if (entity_ids === MATCH_ALL) {
        pass
    }
    else if *(entity_ids instanceof string {
        entity_ids = (entity_ids.lower(),)
    }
    else {
        entity_ids = tuple(entity_id.lower() for entity_id in entity_ids)
    }

    job = HassJob(action)

    // @callback
    /**
     * Handle specific state changes.
     */
    state_change_listener(event: Event) {
        if (from_state is !null) {
            old_state = event.data.get("old_state")
            if (old_state is !null) {
                old_state = old_state.state
            }

            if (!match_from_state(old_state) {
                return
            }
        }
        if (to_state is !null) {
            new_state = event.data.get("new_state")
            if (new_state is !null) {
                new_state = new_state.state
            }

            if (!match_to_state(new_state) {
                return
            }
        }

        hass.async_run_hass_job(
            job,
            event.data.get("entity_id"),
            event.data.get("old_state"),
            event.data.get("new_state"),
        )
    }

    if (entity_ids !== MATCH_ALL) {
        // If we have a list of entity ids we use
        // async_track_state_change_event to route
        // by entity_id to avoid iterating though state change
        // events and creating a jobs where the most
        // common outcome is to return right away because
        // the entity_id does not match since usually
        // only one or two listeners want that specific
        // entity_id.
        return async_track_state_change_event(hass, entity_ids, state_change_listener)
    }

    return hass.bus.async_listen(EVENT_STATE_CHANGED, state_change_listener)
}

export const track_state_change = threaded_listener_factory(async_track_state_change)


// @bind_hass
/**
 * Track specific state change events indexed by entity_id.

    Unlike async_track_state_change, async_track_state_change_event
    passes the full event to the callback.

    In order to avoid having to iterate a long list
    of EVENT_STATE_CHANGED and fire and create a job
    for each one, we keep a dict of entity ids that
    care about the state change events so we can
    do a fast dict lookup to route events.

 */
export function async_track_state_change_event(
    hass: HomeAssistant,
    entity_ids: Union[str, Iterable[str]],
    action: Callable[[Event], any],
): Callable[[], null] {
    entity_ids = _async_string_to_lower_list(entity_ids)
    if (!entity_ids) {
        return _remove_empty_listener
    }

    entity_callbacks = hass.data.setdefault(TRACK_STATE_CHANGE_CALLBACKS, {})

    if (TRACK_STATE_CHANGE_LISTENER !in hass.data) {

        // @callback
        /**
         * Dispatch state changes by entity_id.
         */
        _async_state_change_dispatcher(event: Event) {
            entity_id = event.data.get("entity_id")

            if (entity_id !in entity_callbacks) {
                return
            }

            for(const job of entity_callbacks[entity_id][:]) {
                try {
                    hass.async_run_hass_job(job, event)
                }
                catch (e) {  // pylint: disable=broad-except
                    if (e instanceof Exception) {
                    _LOGGER.exception(
                        "Error while processing state changed for %s", entity_id
                    )
                    }
                    else {
                        throw e;
                    }
                }

            }
        }

        hass.data[TRACK_STATE_CHANGE_LISTENER] = hass.bus.async_listen(
            EVENT_STATE_CHANGED, _async_state_change_dispatcher
        )
    }

    job = HassJob(action)

    for(const entity_id of entity_ids) {
        entity_callbacks.setdefault(entity_id, []).append(job)
    }

    // @callback
    /**
     * Remove state change listener.
     */
    remove_listener() {
        _async_remove_indexed_listeners(
            hass,
            TRACK_STATE_CHANGE_CALLBACKS,
            TRACK_STATE_CHANGE_LISTENER,
            entity_ids,
            job,
        )
    }

    return remove_listener
}

// @callback
/**
 * Remove a listener that does nothing.
 */
export function _remove_empty_listener() {
}

// @callback
/**
 * Remove a listener.
 */
export function _async_remove_indexed_listeners(
    hass: HomeAssistant,
    data_key: string,
    listener_key: string,
    storage_keys: Iterable<string>,
    job: HassJob,
) {

    callbacks = hass.data[data_key]

    for(const storage_key of storage_keys) {
        callbacks[storage_key].remove(job)
        if (callbacks[storage_key].length === 0) {
            del callbacks[storage_key]
        }
    }

    if (!callbacks) {
        hass.data[listener_key]()
        del hass.data[listener_key]
    }
}

// @bind_hass
/**
 * Track specific entity registry updated events indexed by entity_id.

    Similar to async_track_state_change_event.

 */
export function async_track_entity_registry_updated_event(
    hass: HomeAssistant,
    entity_ids: Union[str, Iterable[str]],
    action: Callable[[Event], any],
): Callable[[], null] {
    entity_ids = _async_string_to_lower_list(entity_ids)
    if (!entity_ids) {
        return _remove_empty_listener
    }

    entity_callbacks = hass.data.setdefault(TRACK_ENTITY_REGISTRY_UPDATED_CALLBACKS, {})

    if (TRACK_ENTITY_REGISTRY_UPDATED_LISTENER !in hass.data) {

        // @callback
        /**
         * Dispatch entity registry updates by entity_id.
         */
        _async_entity_registry_updated_dispatcher(event: Event) {
            entity_id = event.data.get("old_entity_id", event.data["entity_id"])

            if (entity_id !in entity_callbacks) {
                return
            }

            for(const job of entity_callbacks[entity_id][:]) {
                try {
                    hass.async_run_hass_job(job, event)
                }
                catch (e) {  // pylint: disable=broad-except
                    if (e instanceof Exception) {
                    _LOGGER.exception(
                        "Error while processing entity registry update for %s",
                        entity_id,
                    )
                    }
                    else {
                        throw e;
                    }
                }

            }
        }

        hass.data[TRACK_ENTITY_REGISTRY_UPDATED_LISTENER] = hass.bus.async_listen(
            EVENT_ENTITY_REGISTRY_UPDATED, _async_entity_registry_updated_dispatcher
        )
    }

    job = HassJob(action)

    for(const entity_id of entity_ids) {
        entity_callbacks.setdefault(entity_id, []).append(job)
    }

    // @callback
    /**
     * Remove state change listener.
     */
    remove_listener() {
        _async_remove_indexed_listeners(
            hass,
            TRACK_ENTITY_REGISTRY_UPDATED_CALLBACKS,
            TRACK_ENTITY_REGISTRY_UPDATED_LISTENER,
            entity_ids,
            job,
        )
    }

    return remove_listener
}

// @callback
def _async_dispatch_domain_event(
    hass: HomeAssistant, event: Event, callbacks: Dict<List>
) -> null:
    domain = split_entity_id(event.data["entity_id"])[0]

    if (domain !in callbacks and MATCH_ALL !in callbacks) {
        return
    }

    listeners = callbacks.get(domain, []) + callbacks.get(MATCH_ALL, [])

    for(const job of listeners) {
        try {
            hass.async_run_hass_job(job, event)
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception(
                "Error while processing event %s for domain %s", event, domain
            )
            }
            else {
                throw e;
            }
        }

    }


// @bind_hass
/**
 * Track state change events when an entity is added to domains.
 */
export function async_track_state_added_domain(
    hass: HomeAssistant,
    domains: Union[str, Iterable[str]],
    action: Callable[[Event], any],
): Callable[[], null] {
    domains = _async_string_to_lower_list(domains)
    if (!domains) {
        return _remove_empty_listener
    }

    domain_callbacks = hass.data.setdefault(TRACK_STATE_ADDED_DOMAIN_CALLBACKS, {})

    if (TRACK_STATE_ADDED_DOMAIN_LISTENER !in hass.data) {

        // @callback
        /**
         * Dispatch state changes by entity_id.
         */
        _async_state_change_dispatcher(event: Event) {
            if (event.data.get("old_state") is !null) {
                return
            }

            _async_dispatch_domain_event(hass, event, domain_callbacks)
        }

        hass.data[TRACK_STATE_ADDED_DOMAIN_LISTENER] = hass.bus.async_listen(
            EVENT_STATE_CHANGED, _async_state_change_dispatcher
        )
    }

    job = HassJob(action)

    for(const domain of domains) {
        domain_callbacks.setdefault(domain, []).append(job)
    }

    // @callback
    /**
     * Remove state change listener.
     */
    remove_listener() {
        _async_remove_indexed_listeners(
            hass,
            TRACK_STATE_ADDED_DOMAIN_CALLBACKS,
            TRACK_STATE_ADDED_DOMAIN_LISTENER,
            domains,
            job,
        )
    }

    return remove_listener
}

// @bind_hass
/**
 * Track state change events when an entity is removed from domains.
 */
export function async_track_state_removed_domain(
    hass: HomeAssistant,
    domains: Union[str, Iterable[str]],
    action: Callable[[Event], any],
): Callable[[], null] {
    domains = _async_string_to_lower_list(domains)
    if (!domains) {
        return _remove_empty_listener
    }

    domain_callbacks = hass.data.setdefault(TRACK_STATE_REMOVED_DOMAIN_CALLBACKS, {})

    if (TRACK_STATE_REMOVED_DOMAIN_LISTENER !in hass.data) {

        // @callback
        /**
         * Dispatch state changes by entity_id.
         */
        _async_state_change_dispatcher(event: Event) {
            if (event.data.get("new_state") is !null) {
                return
            }

            _async_dispatch_domain_event(hass, event, domain_callbacks)
        }

        hass.data[TRACK_STATE_REMOVED_DOMAIN_LISTENER] = hass.bus.async_listen(
            EVENT_STATE_CHANGED, _async_state_change_dispatcher
        )
    }

    job = HassJob(action)

    for(const domain of domains) {
        domain_callbacks.setdefault(domain, []).append(job)
    }

    // @callback
    /**
     * Remove state change listener.
     */
    remove_listener() {
        _async_remove_indexed_listeners(
            hass,
            TRACK_STATE_REMOVED_DOMAIN_CALLBACKS,
            TRACK_STATE_REMOVED_DOMAIN_LISTENER,
            domains,
            job,
        )
    }

    return remove_listener
}

// @callback
def _async_string_to_lower_list(instr: Union[str, Iterable[str]]) -> string[]:
    if (instr instanceof string) {
        return [instr.lower()]
    }

    return [mstr.lower() for mstr in instr]


/**
 * Handle removal / refresh of tracker.
 */
export class _TrackStateChangeFiltered {

    /**
     * Handle removal / refresh of tracker init.
     */
    constructor(

        hass: HomeAssistant,
        track_states: TrackStates,
        action: Callable[[Event], any],
    ) {
        this.hass = hass
        this._action = action
        this._listeners: Dict<Callable> = {}
        this._last_track_states: TrackStates = track_states
    }

    // @callback
    /**
     * Create listeners to track states.
     */
    async_setup() {
        track_states = this._last_track_states

        if (
            !track_states.all_states
            and !track_states.domains
            and !track_states.entities
        ) {
            return
        }

        if (track_states.all_states) {
            this._setup_all_listener()
            return
        }

        this._setup_domains_listener(track_states.domains)
        this._setup_entities_listener(track_states.domains, track_states.entities)
    }

    // @property
    /**
     * State changes that will cause a re-render.
     */
    listeners(): Dict {
        track_states = this._last_track_states
        return {
            _ALL_LISTENER: track_states.all_states,
            _ENTITIES_LISTENER: track_states.entities,
            _DOMAINS_LISTENER: track_states.domains,
        }
    }

    // @callback
    /**
     * Update the listeners based on the new TrackStates.
     */
    async_update_listeners(new_track_states: TrackStates) {
        last_track_states = this._last_track_states
        this._last_track_states = new_track_states

        had_all_listener = last_track_states.all_states

        if (new_track_states.all_states) {
            if (had_all_listener) {
                return
            }
            this._cancel_listener(_DOMAINS_LISTENER)
            this._cancel_listener(_ENTITIES_LISTENER)
            this._setup_all_listener()
            return
        }

        if (had_all_listener) {
            this._cancel_listener(_ALL_LISTENER)
        }

        domains_changed = new_track_states.domains !== last_track_states.domains

        if (had_all_listener or domains_changed) {
            domains_changed = true
            this._cancel_listener(_DOMAINS_LISTENER)
            this._setup_domains_listener(new_track_states.domains)
        }

        if (
            had_all_listener
            or domains_changed
            or new_track_states.entities !== last_track_states.entities
        ) {
            this._cancel_listener(_ENTITIES_LISTENER)
            this._setup_entities_listener(
                new_track_states.domains, new_track_states.entities
            )
        }
    }

    // @callback
    /**
     * Cancel the listeners.
     */
    async_remove() {
        for(const key of list(this._listeners)) {
            this._listeners.pop(key)()
        }
    }

    // @callback
    def _cancel_listener(listener_name: string) -> null:
        if (listener_name !in this._listeners) {
            return
        }

        this._listeners.pop(listener_name)()

    // @callback
    def _setup_entities_listener(domains: Set, entities: Set) -> null:
        if (domains) {
            entities = entities.copy()
            entities.update(this.hass.states.async_entity_ids(domains))
        }

        // Entities has changed to none
        if (!entities) {
            return
        }

        this._listeners[_ENTITIES_LISTENER] = async_track_state_change_event(
            this.hass, entities, this._action
        )

    // @callback
    def _setup_domains_listener(domains: Set) -> null:
        if (!domains) {
            return
        }

        this._listeners[_DOMAINS_LISTENER] = async_track_state_added_domain(
            this.hass, domains, this._action
        )

    // @callback
    def _setup_all_listener() -> null:
        this._listeners[_ALL_LISTENER] = this.hass.bus.async_listen(
            EVENT_STATE_CHANGED, this._action
        )
}

// @callback
// @bind_hass
/**
 * Track state changes with a TrackStates filter that can be updated.

    Parameters
    ----------
    hass
        Home assistant object.
    track_states
        A TrackStates data class.
    action
        Callable to call with results.

    Returns
    -------
    Object used to update the listeners (async_update_listeners) with a new TrackStates or
    cancel the tracking (async_remove).


 */
export function async_track_state_change_filtered(
    hass: HomeAssistant,
    track_states: TrackStates,
    action: Callable[[Event], any],
): _TrackStateChangeFiltered {
    tracker = _TrackStateChangeFiltered(hass, track_states, action)
    tracker.async_setup()
    return tracker
}

// @callback
// @bind_hass
/**
 * Add a listener that fires when a a template evaluates to 'true'.

    Listen for the result of the template becoming true, or a true-like
    string result, such as 'On', 'Open', or 'Yes'. If the template results
    in an error state when the value changes, this will be logged and not
    passed through.

    If the initial check of the template is invalid and results in an
    exception, the listener will still be registered but will only
    fire if the template result becomes true without an exception.

    Action arguments
    ----------------
    entity_id
        ID of the entity that triggered the state change.
    old_state
        The old state of the entity that changed.
    new_state
        New state of the entity that changed.

    Parameters
    ----------
    hass
        Home assistant object.
    template
        The template to calculate.
    action
        Callable to call with results. See above for arguments.
    variables
        Variables to pass to the template.

    Returns
    -------
    Callable to unregister the listener.


 */
export function async_track_template(
    hass: HomeAssistant,
    template: Template,
    action: Callable[[str, Optional[State], Optional[State]], null],
    variables: Optional<TemplateVarsType> = null,
): Callable[[], null] {

    job = HassJob(action)

    // @callback
    /**
     * Check if condition is correct and run action.
     */
    _template_changed_listener(
        event: Event, updates: TrackTemplateResult[]
    ) {
        track_result = updates.pop()

        template = track_result.template
        last_result = track_result.last_result
        result = track_result.result

        if (result instanceof TemplateError) {
            _LOGGER.error(
                "Error while processing template: %s",
                template.template,
                exc_info=result,
            )
            return
        }

        if (
            !last_result instanceof TemplateError
            and result_as_boolean(last_result)
            or !result_as_boolean(result)
        ) {
            return
        }

        hass.async_run_hass_job(
            job,
            event and event.data.get("entity_id"),
            event and event.data.get("old_state"),
            event and event.data.get("new_state"),
        )
    }

    info = async_track_template_result(
        hass, [TrackTemplate(template, variables)], _template_changed_listener
    )

    return info.async_remove
}

export const track_template = threaded_listener_factory(async_track_template)


/**
 * Handle removal / refresh of tracker.
 */
export class _TrackTemplateResultInfo {

    /**
     * Handle removal / refresh of tracker init.
     */
    constructor(

        hass: HomeAssistant,
        track_templates: Iterable<TrackTemplate>,
        action: Callable,
    ) {
        this.hass = hass
        this._job = HassJob(action)

        for(const track_template_ of track_templates) {
            track_template_.template.hass = hass
        }
        this._track_templates = track_templates

        this._last_result: Dict[Template, Union[str, TemplateError]] = {}

        this._rate_limit = KeyedRateLimit(hass)
        this._info: Dict<Template, RenderInfo> = {}
        this._track_state_changes: Optional[_TrackStateChangeFiltered] = null
        this._time_listeners: Dict<Template, Callable> = {}
    }

    /**
     * Activation of template tracking.
     */
    async_setup(raise_on_template_error: boolean) {
        for(const track_template_ of this._track_templates) {
            template = track_template_.template
            variables = track_template_.variables
            this._info[template] = info = template.async_render_to_info(variables)

            if (info.exception) {
                if (raise_on_template_error) {
                    throw new info.exception
                }
                _LOGGER.error(
                    "Error while processing template: %s",
                    track_template_.template,
                    exc_info=info.exception,
                )
            }
        }

        this._track_state_changes = async_track_state_change_filtered(
            this.hass, _render_infos_to_track_states(this._info.values()), this._refresh
        )
        this._update_time_listeners()
        _LOGGER.debug(
            "Template group %s listens for %s",
            this._track_templates,
            this.listeners,
        )
    }

    // @property
    /**
     * State changes that will cause a re-render.
     */
    listeners(): Dict {
        assert this._track_state_changes
        return {
            **this._track_state_changes.listeners,
            "time": boolean(this._time_listeners),
        }
    }

    // @callback
    def _setup_time_listener(template: Template, has_time: boolean) -> null:
        if (!has_time) {
            if (template in this._time_listeners) {
                // now() or utcnow() has left the scope of the template
                this._time_listeners.pop(template)()
            }
            return
        }

        if (template in this._time_listeners) {
            return
        }

        track_templates = [
            track_template_
            for track_template_ in this._track_templates
            if (track_template_.template === template
        ]

        // @callback
        def _refresh_from_time(now) {
            }
            this._refresh(null, track_templates=track_templates)

        this._time_listeners[template] = async_track_utc_time_change(
            this.hass, _refresh_from_time, second=0
        )

    // @callback
    def _update_time_listeners() -> null:
        for(const template, info of this._info.items()) {
            this._setup_time_listener(template, info.has_time)
        }

    // @callback
    /**
     * Cancel the listener.
     */
    async_remove() {
        assert this._track_state_changes
        this._track_state_changes.async_remove()
        this._rate_limit.async_remove()
        for(const template of list(this._time_listeners)) {
            this._time_listeners.pop(template)()
        }
    }

    // @callback
    /**
     * Force recalculate the template.
     */
    async_refresh() {
        this._refresh(null)
    }

    /**
     * Re-render the template if conditions match.

        Returns false if the template was not be re-rendered

        Returns true if the template re-rendered and did not
        change.

        Returns TrackTemplateResult if the template re-render
        generates a new result.

     */
    _render_template_if_ready(

        track_template_: TrackTemplate,
        now: datetime,
        event: Optional<Event>,
    ): Union<bool, TrackTemplateResult> {
        template = track_template_.template

        if (event) {
            info = this._info[template]

            if (!_event_triggers_rerender(event, info) {
                return false
            }

            had_timer = this._rate_limit.async_has_timer(template)

            if (this._rate_limit.async_schedule_action(
                template,
                _rate_limit_for_event(event, info, track_template_),
                now,
                this._refresh,
                event,
                (track_template_,),
                true,
            ) {
                return not had_timer
            }

            _LOGGER.debug(
                "Template update %s triggered by event: %s",
                template.template,
                event,
            )
        }

        this._rate_limit.async_triggered(template, now)
        this._info[template] = info = template.async_render_to_info(
            track_template_.variables
        )

        try {
            result: Union<string, TemplateError> = info.result()
        }
        catch (e) {
            if (e instanceof TemplateError as ex) {
            result = ex
            }
            else {
                throw e;
            }
        }


        last_result = this._last_result.get(template)

        // Check to see if the result has changed
        if (result === last_result) {
            return true
        }

        if (result instanceof TemplateError and last_result instanceof TemplateError) {
            return true
        }

        return TrackTemplateResult(template, last_result, result)
    }

    // @callback
    /**
     * Refresh the template.

        The event is the state_changed event that caused the refresh
        to be considered.

        track_templates is an optional list of TrackTemplate objects
        to refresh.  If not provided, all tracked templates will be
        considered.

        replayed is true if the event is being replayed because the
        rate limit was hit.

     */
    _refresh(

        event: Optional<Event>,
        track_templates: Optional[Iterable[TrackTemplate]] = null,
        replayed: Optional<bool> = false,
    ) {
        updates = []
        info_changed = false
        now = event.time_fired if not replayed and event else utcnow()

        for(const track_template_ of track_templates or this._track_templates) {
            update = this._render_template_if_ready(track_template_, now, event)
            if (!update) {
                continue
            }

            template = track_template_.template
            this._setup_time_listener(template, this._info[template].has_time)

            info_changed = true

            if (update instanceof TrackTemplateResult) {
                updates.append(update)
            }
        }

        if (info_changed) {
            assert this._track_state_changes
            this._track_state_changes.async_update_listeners(
                _render_infos_to_track_states(
                    [
                        _suppress_domain_all_in_render_info(this._info[template])
                        if (this._rate_limit.async_has_timer(template)
                        else this._info[template]
                        for template in this._info
                    ]
                )
            )
            _LOGGER.debug(
                "Template group %s listens for %s",
                this._track_templates,
                this.listeners,
            )
        }

        if !updates) {
                        }
            return

        for(const track_result of updates) {
            this._last_result[track_result.template] = track_result.result
        }

        this.hass.async_run_hass_job(this._job, event, updates)
    }
}

export const TrackTemplateResultListener = Callable[
    [
        Event,
        TrackTemplateResult[],
    ],
    null,
]
/**
 * Type for the listener for template results.

    Action arguments
    ----------------
    event
        Event that caused the template to change output. null if not
        triggered by an event.
    updates
        A list of TrackTemplateResult

 */


// @callback
// @bind_hass
/**
 * Add a listener that fires when the result of a template changes.

    The action will fire with the initial result from the template, and
    then whenever the output from the template changes. The template will
    be reevaluated if any states referenced in the last run of the
    template change, or if manually triggered. If the result of the
    evaluation is different from the previous run, the listener is passed
    the result.

    If the template results in an TemplateError, this will be returned to
    the listener the first time this happens but not for subsequent errors.
    Once the template returns to a non-error condition the result is sent
    to the action as usual.

    Parameters
    ----------
    hass
        Home assistant object.
    track_templates
        An iterable of TrackTemplate.
    action
        Callable to call with results.
    raise_on_template_error
        When set to true, if there is an exception
        processing the template during setup, the system
        will throw new the exception instead of setting up
        tracking.

    Returns
    -------
    Info object used to unregister the listener, and refresh the template.


 */
export function async_track_template_result(
    hass: HomeAssistant,
    track_templates: Iterable<TrackTemplate>,
    action: TrackTemplateResultListener,
    raise_on_template_error: boolean = false,
): _TrackTemplateResultInfo {
    tracker = _TrackTemplateResultInfo(hass, track_templates, action)
    tracker.async_setup(raise_on_template_error)
    return tracker
}

// @callback
// @bind_hass
/**
 * Track the state of entities for a period and run an action.

    If !async_check_func it use the state of orig_value.
    Without entity_ids we track all state changes.

 */
export function async_track_same_state(
    hass: HomeAssistant,
    period: timedelta,
    action: Callable<..., null>,
    async_check_same_func: Callable[[str, Optional[State], Optional[State]], boolean],
    entity_ids: Union[str, Iterable[str]] = MATCH_ALL,
): CALLBACK_TYPE {
    async_remove_state_for_cancel: Optional[CALLBACK_TYPE] = null
    async_remove_state_for_listener: Optional[CALLBACK_TYPE] = null

    job = HassJob(action)

    // @callback
    /**
     * Clear all unsub listener.
     */
    clear_listener() {
        nonlocal async_remove_state_for_cancel, async_remove_state_for_listener

        if (async_remove_state_for_listener is !null) {
            async_remove_state_for_listener()
            async_remove_state_for_listener = null
        }
        if (async_remove_state_for_cancel is !null) {
            async_remove_state_for_cancel()
            async_remove_state_for_cancel = null
        }
    }

    // @callback
    /**
     * Fire on state changes after a delay and calls action.
     */
    state_for_listener(now: any) {
        nonlocal async_remove_state_for_listener
        async_remove_state_for_listener = null
        clear_listener()
        hass.async_run_hass_job(job)
    }

    // @callback
    /**
     * Fire on changes and cancel for listener if changed.
     */
    state_for_cancel_listener(event: Event) {
        entity: string = event.data["entity_id"]
        from_state: Optional<State> = event.data.get("old_state")
        to_state: Optional<State> = event.data.get("new_state")

        if (!async_check_same_func(entity, from_state, to_state) {
            clear_listener()
        }
    }

    async_remove_state_for_listener = async_track_point_in_utc_time(
        hass, state_for_listener, utcnow() + period
    )

    if (entity_ids === MATCH_ALL) {
        async_remove_state_for_cancel = hass.bus.async_listen(
            EVENT_STATE_CHANGED, state_for_cancel_listener
        )
    }
    else {
        async_remove_state_for_cancel = async_track_state_change_event(
            hass,
            [entity_ids] if entity_ids instanceof string else entity_ids,
            state_for_cancel_listener,
        )
    }

    return clear_listener
}

export const track_same_state = threaded_listener_factory(async_track_same_state)


// @callback
// @bind_hass
/**
 * Add a listener that fires once after a specific point in time.
 */
export function async_track_point_in_time(
    hass: HomeAssistant,
    action: Union[HassJob, Callable[..., null]],
    point_in_time: datetime,
): CALLBACK_TYPE {

    job = action if action instanceof HassJob else HassJob(action)

    // @callback
    /**
     * Convert passed in UTC now to local now.
     */
    utc_converter(utc_now: datetime) {
        hass.async_run_hass_job(job, as_local(utc_now))
    }

    return async_track_point_in_utc_time(hass, utc_converter, point_in_time)
}

export const track_point_in_time = threaded_listener_factory(async_track_point_in_time)


// @callback
// @bind_hass
/**
 * Add a listener that fires once after a specific point in UTC time.
 */
export function async_track_point_in_utc_time(
    hass: HomeAssistant,
    action: Union[HassJob, Callable[..., null]],
    point_in_time: datetime,
): CALLBACK_TYPE {
    // Ensure point_in_time is UTC
    utc_point_in_time = as_utc(point_in_time)

    // Since this is called once, we accept a HassJob so we can avoid
    // having to figure out how to call the action every time its called.
    job = action if action instanceof HassJob else HassJob(action)

    cancel_callback: Optional<asyncio.TimerHandle> = null

    // @callback
    /**
     * Call the action.
     */
    run_action() {
        nonlocal cancel_callback

        now = time_tracker_utcnow()

        // Depending on the available clock support (including timer hardware
        // and the OS kernel) it can happen that we fire a little bit too early
        // as measured by utcnow(). That is bad when callbacks have assumptions
        // about the current time. Thus, we rearm the timer for the remaining
        // time.
        delta = (utc_point_in_time - now).total_seconds()
        if (delta > 0) {
            _LOGGER.debug("Called %f seconds too early, rearming", delta)

            cancel_callback = hass.loop.call_later(delta, run_action)
            return
        }

        hass.async_run_hass_job(job, utc_point_in_time)
    }

    delta = utc_point_in_time.timestamp() - time.time()
    cancel_callback = hass.loop.call_later(delta, run_action)

    // @callback
    /**
     * Cancel the call_later.
     */
    unsub_point_in_time_listener() {
        assert cancel_callback
        cancel_callback.cancel()
    }

    return unsub_point_in_time_listener
}

export const track_point_in_utc_time = threaded_listener_factory(async_track_point_in_utc_time)


// @callback
// @bind_hass
/**
 * Add a listener that is called in <delay>.
 */
export function async_call_later(
    hass: HomeAssistant, delay: number, action: Union[HassJob, Callable[..., null]]
): CALLBACK_TYPE {
    return async_track_point_in_utc_time(
        hass, action, utcnow() + timedelta(seconds=delay)
    )
}

export const call_later = threaded_listener_factory(async_call_later)


// @callback
// @bind_hass
/**
 * Add a listener that fires repetitively at every timedelta intrval.
 */
export function async_track_time_interval(
    hass: HomeAssistant,
    action: Callable[..., Union[null, Awaitable]],
    intrval: timedelta,
): CALLBACK_TYPE {
    remove = null
    intrval_listener_job = null

    job = HassJob(action)

    /**
     * Return the next intrval.
     */
    next_interval(): datetime {
        return utcnow() + intrval
    }

    // @callback
    /**
     * Handle elapsed intrvals.
     */
    intrval_listener(now: datetime) {
        nonlocal remove
        nonlocal intrval_listener_job

        remove = async_track_point_in_utc_time(
            hass, intrval_listener_job, next_interval()  // type: ignore
        )
        hass.async_run_hass_job(job, now)
    }

    intrval_listener_job = HassJob(interval_listener)
    remove = async_track_point_in_utc_time(hass, intrval_listener_job, next_interval())

    /**
     * Remove intrval listener.
     */
    remove_listener() {
        remove()  // type: ignore
    }

    return remove_listener
}

export const track_time_interval = threaded_listener_factory(async_track_time_interval)


// @attr.s
/**
 * Helper class to help listen to sun events.
 */
export class SunListener {

    hass: HomeAssistant = attr.ib()
    job: HassJob = attr.ib()
    event: string = attr.ib()
    offset: Optional<timedelta> = attr.ib()
    _unsub_sun: Optional[CALLBACK_TYPE] = attr.ib(default=null)
    _unsub_config: Optional[CALLBACK_TYPE] = attr.ib(default=null)

    // @callback
    /**
     * Attach a sun listener.
     */
    async_attach() {
        assert !this._unsub_config

        this._unsub_config = this.hass.bus.async_listen(
            EVENT_CORE_CONFIG_UPDATE, this._handle_config_event
        )

        this._listen_next_sun_event()
    }

    // @callback
    /**
     * Detach the sun listener.
     */
    async_detach() {
        assert this._unsub_sun
        assert this._unsub_config

        this._unsub_sun()
        this._unsub_sun = null
        this._unsub_config()
        this._unsub_config = null
    }

    // @callback
    /**
     * Set up the sun event listener.
     */
    _listen_next_sun_event() {
        assert !this._unsub_sun

        this._unsub_sun = async_track_point_in_utc_time(
            this.hass,
            this._handle_sun_event,
            get_astral_event_next(this.hass, this.event, offset=this.offset),
        )
    }

    // @callback
    /**
     * Handle solar event.
     */
    _handle_sun_event(_now: any) {
        this._unsub_sun = null
        this._listen_next_sun_event()
        this.hass.async_run_hass_job(this.job)
    }

    // @callback
    /**
     * Handle core config update.
     */
    _handle_config_event(_event: any) {
        assert this._unsub_sun
        this._unsub_sun()
        this._unsub_sun = null
        this._listen_next_sun_event()
    }
}

// @callback
// @bind_hass
/**
 * Add a listener that will fire a specified offset from sunrise daily.
 */
export function async_track_sunrise(
    hass: HomeAssistant, action: Callable<..., null>, offset: Optional<timedelta> = null
): CALLBACK_TYPE {
    listener = SunListener(hass, HassJob(action), SUN_EVENT_SUNRISE, offset)
    listener.async_attach()
    return listener.async_detach
}

export const track_sunrise = threaded_listener_factory(async_track_sunrise)


// @callback
// @bind_hass
/**
 * Add a listener that will fire a specified offset from sunset daily.
 */
export function async_track_sunset(
    hass: HomeAssistant, action: Callable<..., null>, offset: Optional<timedelta> = null
): CALLBACK_TYPE {
    listener = SunListener(hass, HassJob(action), SUN_EVENT_SUNSET, offset)
    listener.async_attach()
    return listener.async_detach
}

export const track_sunset = threaded_listener_factory(async_track_sunset)

// For targeted patching in tests
export const time_tracker_utcnow = utcnow


// @callback
// @bind_hass
/**
 * Add a listener that will fire if time matches a pattern.
 */
export function async_track_utc_time_change(
    hass: HomeAssistant,
    action: Callable<..., null>,
    hour: Optional<Any> = null,
    minute: Optional<Any> = null,
    second: Optional<Any> = null,
    local: boolean = false,
): CALLBACK_TYPE {

    job = HassJob(action)
    // We do not have to wrap the function with time pattern matching logic
    // if no pattern given
    if all(!val for val in (hour, minute, second)):

        // @callback
        /**
         * Fire every time event that comes in.
         */
        time_change_listener(event: Event) {
            hass.async_run_hass_job(job, event.data[ATTR_NOW])
        }

        return hass.bus.async_listen(EVENT_TIME_CHANGED, time_change_listener)

    matching_seconds = parse_time_expression(second, 0, 59)
    matching_minutes = parse_time_expression(minute, 0, 59)
    matching_hours = parse_time_expression(hour, 0, 23)

    /**
     * Calculate and set the next time the trigger should fire.
     */
    calculate_next(now: datetime): datetime {
        localized_now = as_local(now) if local else now
        return find_next_time_expression_time(
            localized_now, matching_seconds, matching_minutes, matching_hours
        )
    }

    time_listener: Optional[CALLBACK_TYPE] = null

    // @callback
    /**
     * Listen for matching time_changed events.
     */
    pattern_time_change_listener(_: datetime) {
        nonlocal time_listener

        now = time_tracker_utcnow()
        hass.async_run_hass_job(job, as_local(now) if local else now)

        time_listener = async_track_point_in_utc_time(
            hass,
            pattern_time_change_listener,
            calculate_next(now + timedelta(seconds=1)),
        )
    }

    time_listener = async_track_point_in_utc_time(
        hass, pattern_time_change_listener, calculate_next(utcnow())
    )

    // @callback
    /**
     * Cancel the time listener.
     */
    unsub_pattern_time_change_listener() {
        assert time_listener
        time_listener()
    }

    return unsub_pattern_time_change_listener
}

export const track_utc_time_change = threaded_listener_factory(async_track_utc_time_change)


// @callback
// @bind_hass
/**
 * Add a listener that will fire if UTC time matches a pattern.
 */
export function async_track_time_change(
    hass: HomeAssistant,
    action: Callable<..., null>,
    hour: Optional<Any> = null,
    minute: Optional<Any> = null,
    second: Optional<Any> = null,
): CALLBACK_TYPE {
    return async_track_utc_time_change(hass, action, hour, minute, second, local=true)
}

export const track_time_change = threaded_listener_factory(async_track_time_change)


/**
 * Convert parameter to function that matches input against parameter.
 */
export function process_state_match(
    parameter: Union[null, string, Iterable[str]]
): Callable[[str], boolean] {
    if (!parameter or parameter === MATCH_ALL) {
        return lambda _: true
    }

    if (parameter instanceof string or !hasattr(parameter, "__iter__") {
        return lambda state: state === parameter
    }

    parameter_set = set(parameter)
    return lambda state: state in parameter_set
}

// @callback
/**
 * Combine from multiple RenderInfo.
 */
export function _entities_domains_from_render_infos(
    render_infos: Iterable<RenderInfo>,
): Tuple<Set, Set> {
    entities = set()
    domains = set()

    for(const render_info of render_infos) {
        if (render_info.entities) {
            entities.update(render_info.entities)
        }
        if (render_info.domains) {
            domains.update(render_info.domains)
        }
        if (render_info.domains_lifecycle) {
            domains.update(render_info.domains_lifecycle)
        }
    }
    return entities, domains
}

// @callback
/**
 * Determine if an all listener is needed from RenderInfo.
 */
export function _render_infos_needs_all_listener(render_infos: Iterable<RenderInfo>): boolean {
    for(const render_info of render_infos) {
        // Tracking all states
        if (render_info.all_states or render_info.all_states_lifecycle) {
            return true
        }

        // Previous call had an exception
        // so we do not know which states
        // to track
        if (render_info.exception) {
            return true
        }
    }

    return false
}

// @callback
/**
 * Create a TrackStates dataclass from the latest RenderInfo.
 */
export function _render_infos_to_track_states(render_infos: Iterable<RenderInfo>): TrackStates {
    if (_render_infos_needs_all_listener(render_infos) {
        return TrackStates(true, set(), set())
    }

    return TrackStates(false, *_entities_domains_from_render_infos(render_infos))
}

// @callback
/**
 * Determine if a template should be re-rendered from an event.
 */
export function _event_triggers_rerender(event: Event, info: RenderInfo): boolean {
    entity_id = event.data.get(ATTR_ENTITY_ID)

    if (info.filter(entity_id) {
        return true
    }

    if (
        event.data.get("new_state") is !null
        and event.data.get("old_state") is !null
    ) {
        return false
    }

    return boolean(info.filter_lifecycle(entity_id))
}

// @callback
/**
 * Determine the rate limit for an event.
 */
export function _rate_limit_for_event(
    event: Event, info: RenderInfo, track_template_: TrackTemplate
): Optional<timedelta> {
    entity_id = event.data.get(ATTR_ENTITY_ID)

    // Specifically referenced entities are excluded
    // from the rate limit
    if (entity_id in info.entities) {
        return null
    }

    if (track_template_.rate_limit is !null) {
        return track_template_.rate_limit
    }

    rate_limit: Optional<timedelta> = info.rate_limit
    return rate_limit
}

/**
 * Remove the domains and all_states from render info during a ratelimit.
 */
export function _suppress_domain_all_in_render_info(render_info: RenderInfo): RenderInfo {
    rate_limited_render_info = copy.copy(render_info)
    rate_limited_render_info.all_states = false
    rate_limited_render_info.all_states_lifecycle = false
    rate_limited_render_info.domains = set()
    rate_limited_render_info.domains_lifecycle = set()
    return rate_limited_render_info
}
