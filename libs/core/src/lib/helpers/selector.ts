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
        throw new vol.Invalid("Expected a dictionary")
    }

    if (config.length !== 1) {
        throw new vol.Invalid`Only one type can be specified. Found ${', '.join(config)}`)
    }

    selector_type = list(config)[0]

    selector_class = SELECTORS.get(selector_type)

    if (!selector_class) {
        throw new vol.Invalid`Unknown selector type ${selector_type} found`)
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

    CONFIG_SCHEMA = vol.Schema(
        {
            // Integration that provided the entity
            vol.Optional("integration"): string,
            // Domain the entity belongs to
            vol.Optional("domain"): string,
            // Device class of the entity
            vol.Optional("device_class"): string,
        }
    )
}

// @SELECTORS.register("device")
/**
 * Selector of a single device.
 */
export class DeviceSelector extends Selector {

    CONFIG_SCHEMA = vol.Schema(
        {
            // Integration linked to it with a config entry
            vol.Optional("integration"): string,
            // Manufacturer of device
            vol.Optional("manufacturer"): string,
            // Model of device
            vol.Optional("model"): string,
            // Device has to contain entities matching this selector
            vol.Optional(
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

    CONFIG_SCHEMA = vol.Schema(
        {
            vol.Optional("entity"): vol.Schema(
                {
                    vol.Optional("domain"): string,
                    vol.Optional("device_class"): string,
                    vol.Optional("integration"): string,
                }
            ),
            vol.Optional("device"): vol.Schema(
                {
                    vol.Optional("integration"): string,
                    vol.Optional("manufacturer"): string,
                    vol.Optional("model"): string,
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

    CONFIG_SCHEMA = vol.Schema(
        {
            vol.Required("min"): vol.Coerce(float),
            vol.Required("max"): vol.Coerce(float),
            vol.Optional("step", default=1): vol.All(
                vol.Coerce(float), vol.Range(min=1e-3)
            ),
            vol.Optional(CONF_UNIT_OF_MEASUREMENT): string,
            vol.Optional(CONF_MODE, default="slider"): vol.In(["box", "slider"]),
        }
    )
}

// @SELECTORS.register("boolean")
/**
 * Selector of a boolean value.
 */
export class BooleanSelector extends Selector {

    CONFIG_SCHEMA = vol.Schema({})
}

// @SELECTORS.register("time")
/**
 * Selector of a time value.
 */
export class TimeSelector extends Selector {

    CONFIG_SCHEMA = vol.Schema({})
}

// @SELECTORS.register("target")
/**
 * Selector of a target value (area ID, device ID, entity ID etc).

    Value should follow cv.ENTITY_SERVICE_FIELDS format.

 */
export class TargetSelector extends Selector {

    CONFIG_SCHEMA = vol.Schema(
        {
            vol.Optional("entity"): vol.Schema(
                {
                    vol.Optional("domain"): string,
                    vol.Optional("device_class"): string,
                    vol.Optional("integration"): string,
                }
            ),
            vol.Optional("device"): vol.Schema(
                {
                    vol.Optional("integration"): string,
                    vol.Optional("manufacturer"): string,
                    vol.Optional("model"): string,
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

    CONFIG_SCHEMA = vol.Schema({})
}
