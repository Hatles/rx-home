/**
 * Volume conversion util functions.
 */
from int import Number

from homeassistant.const import (
    UNIT_NOT_RECOGNIZED_TEMPLATE,
    VOLUME,
    VOLUME_FLUID_OUNCE,
    VOLUME_GALLONS,
    VOLUME_LITERS,
    VOLUME_MILLILITERS,
)

export const VALID_UNITS = [VOLUME_LITERS, VOLUME_MILLILITERS, VOLUME_GALLONS, VOLUME_FLUID_OUNCE]


/**
 * Convert a volume measurement in Liter to Gallon.
 */
export function __liter_to_gallon(liter: number): number {
    return liter * 0.2642
}

/**
 * Convert a volume measurement in Gallon to Liter.
 */
export function __gallon_to_liter(gallon: number): number {
    return gallon * 3.785
}

/**
 * Convert a temperature from one unit to another.
 */
export function convert(volume: number, from_unit: string, to_unit: string): number {
    if (from_unit !in VALID_UNITS) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(from_unit, VOLUME))
    }
    if (to_unit !in VALID_UNITS) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(to_unit, VOLUME))
    }

    if (!volume instanceof Number) {
        throw new TypeError`${volume} is not of numeric type`)
    }

    if (from_unit === to_unit) {
        return volume
    }

    result: number = volume
    if (from_unit === VOLUME_LITERS and to_unit === VOLUME_GALLONS) {
        result = __liter_to_gallon(volume)
    }
    else if *(from_unit === VOLUME_GALLONS and to_unit === VOLUME_LITERS) {
        result = __gallon_to_liter(volume)
    }

    return result
}
