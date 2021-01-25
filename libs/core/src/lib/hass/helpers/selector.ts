/**
 * Selectors for Home Assistant.
 */
from typing import any, Callable, Dict, cast

import voluptuous as vol

from homeassistant.const import CONF_MODE, CONF_UNIT_OF_MEASUREMENT
from homeassistant.util import decorator

export const SELECTORS = decorator.Registry()


/**
 * Validate a selector.
 */
export function validate_selector(config: any): Dict {
    if (!config instanceof dict) {
        throw new Joi.Invalid("Expected a dictionary")
    }

    if (config.length !== 1) {
        throw new Joi.Invalid`Only one type can be specified. Found ${', '.join(config)}`)
    }

    selector_type = list(config)[0]

    selector_class = SELECTORS.get(selector_type)

    if (!selector_class) {
        throw new Joi.Invalid`Unknown selector type ${selector_type} found`)
    }

    // Selectors can be empty
    if (!config[selector_type]) {
        return {selector_type: {}}
    }

    return {
        selector_type: cast(Dict, selector_class.CONFIG_SCHEMA(config[selector_type]))
    }
}

/**
 * Base class for selectors.
 */
export class Selector {

    CONFIG_SCHEMA: Callable
}

// @SELECTORS.register("entity")
/**
 * Selector of a single entity.
 */
export class EntitySelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema(
        {
            // Integration that provided the entity
            Joi.Optional("integration"): string,
            // Domain the entity belongs to
            Joi.Optional("domain"): string,
            // Device class of the entity
            Joi.Optional("device_class"): string,
        }
    )
}

// @SELECTORS.register("device")
/**
 * Selector of a single device.
 */
export class DeviceSelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema(
        {
            // Integration linked to it with a config entry
            Joi.Optional("integration"): string,
            // Manufacturer of device
            Joi.Optional("manufacturer"): string,
            // Model of device
            Joi.Optional("model"): string,
            // Device has to contain entities matching this selector
            Joi.Optional(
                "entity"
            ): EntitySelector.CONFIG_SCHEMA,  // pylint: disable=no-member
        }
    )
}

// @SELECTORS.register("area")
/**
 * Selector of a single area.
 */
export class AreaSelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema(
        {
            Joi.Optional("entity"): Joi.Schema(
                {
                    Joi.Optional("domain"): string,
                    Joi.Optional("device_class"): string,
                    Joi.Optional("integration"): string,
                }
            ),
            Joi.Optional("device"): Joi.Schema(
                {
                    Joi.Optional("integration"): string,
                    Joi.Optional("manufacturer"): string,
                    Joi.Optional("model"): string,
                }
            ),
        }
    )
}

// @SELECTORS.register("number")
/**
 * Selector of a numeric value.
 */
export class intelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema(
        {
            Joi.Required("min"): Joi.Coerce(float),
            Joi.Required("max"): Joi.Coerce(float),
            Joi.Optional("step", default=1): Joi.All(
                Joi.Coerce(float), Joi.Range(min=1e-3)
            ),
            Joi.Optional(CONF_UNIT_OF_MEASUREMENT): string,
            Joi.Optional(CONF_MODE, default="slider"): Joi.In(["box", "slider"]),
        }
    )
}

// @SELECTORS.register("boolean")
/**
 * Selector of a boolean value.
 */
export class BooleanSelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema({})
}

// @SELECTORS.register("time")
/**
 * Selector of a time value.
 */
export class TimeSelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema({})
}

// @SELECTORS.register("target")
/**
 * Selector of a target value (area ID, device ID, entity ID etc).

    Value should follow cv.ENTITY_SERVICE_FIELDS format.

 */
export class TargetSelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema(
        {
            Joi.Optional("entity"): Joi.Schema(
                {
                    Joi.Optional("domain"): string,
                    Joi.Optional("device_class"): string,
                    Joi.Optional("integration"): string,
                }
            ),
            Joi.Optional("device"): Joi.Schema(
                {
                    Joi.Optional("integration"): string,
                    Joi.Optional("manufacturer"): string,
                    Joi.Optional("model"): string,
                }
            ),
        }
    )
}

// @SELECTORS.register("action")
/**
 * Selector of an action sequence (script syntax).
 */
export class ActionSelector extends Selector {

    CONFIG_SCHEMA = Joi.Schema({})
}
