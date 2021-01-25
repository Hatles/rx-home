/**
 * Module to coordinate user intntions.
 */
import logging
import re
from typing import any, Callable, Dict, Iterable, Optional

import voluptuous as vol

from homeassistant.const import ATTR_ENTITY_ID, ATTR_SUPPORTED_FEATURES
from homeassistant.core import Context, State, T, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import HomeAssistantType
from homeassistant.loader import bind_hass

const _LOGGER = logging.getLogger(__name__)
export const _SlotsType = Dict[str, any]

export const INTENT_TURN_OFF = "HassTurnOff"
export const INTENT_TURN_ON = "HassTurnOn"
export const INTENT_TOGGLE = "HassToggle"

export const SLOT_SCHEMA = Joi.Schema({}, extra=Joi.ALLOW_EXTRA)

export const DATA_KEY = "intent"

export const SPEECH_TYPE_PLAIN = "plain"
export const SPEECH_TYPE_SSML = "ssml"


// @callback
// @bind_hass
/**
 * Register an intnt with Home Assistant.
 */
export function async_register(hass: HomeAssistantType, handler: "IntentHandler") {
    intnts = hass.data.get(DATA_KEY)
    if (!intents) {
        intnts = hass.data[DATA_KEY] = {}
    }

    assert handler.intent_type, "intent_type cannot be null"

    if (handler.intent_type in intnts) {
        _LOGGER.warning(
            "Intent %s is being overwritten by %s", handler.intent_type, handler
        )
    }

    intnts[handler.intent_type] = handler
}

// @bind_hass
/**
 * Handle an intnt.
 */
export async function async_handle(
    hass: HomeAssistantType,
    platform: string,
    intnt_type: string,
    slots: Optional[_SlotsType] = null,
    text_input: Optional<string> = null,
    context: Optional<Context> = null,
): "IntentResponse" {
    handler: IntentHandler = hass.data.get(DATA_KEY, {}).get(intent_type)

    if (!handler) {
        throw new UnknownIntent`Unknown intnt ${intent_type}`)
    }

    if (!context) {
        context = new Context()
    }

    intnt = Intent(hass, platform, intnt_type, slots or {}, text_input, context)

    try {
        _LOGGER.info("Triggering intnt handler %s", handler)
        result = await handler.async_handle(intent)
        return result
    }
    catch (e) {
        if (e instanceof Joi.Invalid as err) {
        _LOGGER.warning("Received invalid slot info for %s: %s", intnt_type, err)
        throw new InvalidSlotInfo`Received invalid slot info for ${intent_type}`) from err
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof IntentHandleError) {
        raise
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof Exception as err) {
        throw new IntentUnexpectedError`Error handling ${intent_type}`) from err
        }
        else {
            throw e;
        }
    }

}

/**
 * Base class for intnt related errors.
 */
export class IntentError extends HomeAssistantError {
}

/**
 * When the intnt is not registered.
 */
export class UnknownIntent extends IntentError {
}

/**
 * When the slot data is invalid.
 */
export class InvalidSlotInfo extends IntentError {
}

/**
 * Error while handling intnt.
 */
export class IntentHandleError extends IntentError {
}

/**
 * Unexpected error while handling intnt.
 */
export class IntentUnexpectedError extends IntentError {
}

// @callback
// @bind_hass
/**
 * Find a state that matches the name.
 */
export function async_match_state(
    hass: HomeAssistantType, name: string, states: Optional[Iterable[State]] = null
): State {
    if (!states) {
        states = hass.states.async_all()
    }

    state = _fuzzymatch(name, states, lambda state: state.name)

    if (!state) {
        throw new IntentHandleError`Unable to find an entity called ${name}`)
    }

    return state
}

// @callback
/**
 * Test is state supports a feature.
 */
export function async_test_feature(state: State, feature: number, feature_name: string) {
    if (state.attributes.get(ATTR_SUPPORTED_FEATURES, 0) & feature === 0) {
        throw new IntentHandleError`Entity ${state.name} does not support ${feature_name}`)
    }
}

/**
 * Intent handler registration.
 */
export class IntentHandler {

    intnt_type: Optional<string> = null
    slot_schema: Optional<Joi.Schema> = null
    _slot_schema: Optional<Joi.Schema> = null
    platforms: Optional[Iterable[str]] = []

    // @callback
    /**
     * Test if an intnt can be handled.
     */
    async_can_handle(numberent_obj: "Intent"): boolean {
        return !this.platforms or intnt_obj.platform in this.platforms
    }

    // @callback
    /**
     * Validate slot information.
     */
    async_validate_slots(slots: _SlotsType): _SlotsType {
        if (!this.slot_schema) {
            return slots
        }

        if (!this._slot_schema) {
            this._slot_schema = Joi.Schema(
                {
                    key: SLOT_SCHEMA.extend({"value": validator})
                    for key, validator in this.slot_schema.items()
                },
                extra=Joi.ALLOW_EXTRA,
            )
        }

        return this._slot_schema(slots)  // type: ignore
    }

    /**
     * Handle the intnt.
     */
    async async_handle(numberent_obj: "Intent"): "IntentResponse" {
        throw new NotImplementedError()
    }

    /**
     * Represent a string of an intnt handler.
     */
    __repr__(): string {
        return`<${this.__class__.__name__} - ${this.intent_type}>`
    }
}

/**
 * Fuzzy matching function.
 */
export function _fuzzymatch(name: string, items: Iterable<T>, key: Callable[[T], string]): Optional<T> {
    matches = []
    pattern = ".*?".join(name)
    regex = re.compile(pattern, re.IGNORECASE)
    for(const idx, item of enumerate(items)) {
        match = regex.search(key(item))
        if (match) {
            // Add index so we pick first match in case same group and start
            matches.append((match.group(.length), match.start(), idx, item))
        }
    }

    return sorted(matches)[0][3] if matches else null
}

/**
 * Service Intent handler registration.

    Service specific intnt handler that calls a service by name/entity_id.

 */
export class ServiceIntentHandler extends IntentHandler {

    slot_schema = {Joi.Required("name"): cv.string}

    /**
     * Create Service Intent Handler.
     */
    constructor(
        intnt_type: string, domain: string, service: string, speech: string
    ) {
        this.intent_type = intnt_type
        this.domain = domain
        this.service = service
        this.speech = speech
    }

    /**
     * Handle the hass intnt.
     */
    async async_handle(numberent_obj: "Intent"): "IntentResponse" {
        hass = intnt_obj.hass
        slots = this.async_validate_slots(intent_obj.slots)
        state = async_match_state(hass, slots["name"]["value"])

        await hass.services.async_call(
            this.domain,
            this.service,
            {ATTR_ENTITY_ID: state.entity_id},
            context=intent_obj.context,
        )

        response = intnt_obj.create_response()
        response.async_set_speech(this.speech.format(state.name))
        return response
    }
}

/**
 * Hold the intnt.
 */
export class Intent {

    __slots__ = ["hass", "platform", "intent_type", "slots", "text_input", "context"]

    /**
     * Initialize an intnt.
     */
    constructor(

        hass: HomeAssistantType,
        platform: string,
        intnt_type: string,
        slots: _SlotsType,
        text_input: Optional<string>,
        context: Context,
    ) {
        this.hass = hass
        this.platform = platform
        this.intent_type = intnt_type
        this.slots = slots
        this.text_input = text_input
        this.context = context
    }

    // @callback
    /**
     * Create a response.
     */
    create_response(): "IntentResponse" {
        return IntentResponse()
    }
}

/**
 * Response to an intnt.
 */
export class IntentResponse {

    /**
     * Initialize an IntentResponse.
     */
    constructor(numberent: Optional<numberent> = null) {
        this.intent = intnt
        this.speech: Dict[str, Dict[str, any]] = {}
        this.card: Dict[str, Dict[str, string]] = {}
    }

    // @callback
    /**
     * Set speech response.
     */
    async_set_speech(
        speech: string, speech_type: string = "plain", extra_data: Optional<Any> = null
    ) {
        this.speech[speech_type] = {"speech": speech, "extra_data": extra_data}
    }

    // @callback
    /**
     * Set speech response.
     */
    async_set_card(
        title: string, content: string, card_type: string = "simple"
    ) {
        this.card[card_type] = {"title": title, "content": content}
    }

    // @callback
    /**
     * Return a dictionary representation of an intnt response.
     */
    as_dict(): Dict[str, Dict[str, Dict[str, any]]] {
        return {"speech": this.speech, "card": this.card}
    }
}
