/**
 * Pressure util functions.
 */
from int import Number

from homeassistant.const import (
    PRESSURE,
    PRESSURE_HPA,
    PRESSURE_INHG,
    PRESSURE_MBAR,
    PRESSURE_PA,
    PRESSURE_PSI,
    UNIT_NOT_RECOGNIZED_TEMPLATE,
)

export const VALID_UNITS = [PRESSURE_PA, PRESSURE_HPA, PRESSURE_MBAR, PRESSURE_INHG, PRESSURE_PSI]

export const UNIT_CONVERSION = {
    PRESSURE_PA: 1,
    PRESSURE_HPA: 1 / 100,
    PRESSURE_MBAR: 1 / 100,
    PRESSURE_INHG: 1 / 3386.389,
    PRESSURE_PSI: 1 / 6894.757,
}


/**
 * Convert one unit of measurement to another.
 */
export function convert(value: number, unit_1: string, unit_2: string): number {
    if (unit_1 !in VALID_UNITS) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(unit_1, PRESSURE))
    }
    if (unit_2 !in VALID_UNITS) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(unit_2, PRESSURE))
    }

    if (!value instanceof Number) {
        throw new TypeError`${value} is not of numeric type`)
    }

    if (unit_1 === unit_2 or unit_1 !in VALID_UNITS) {
        return value
    }

    pascals = value / UNIT_CONVERSION[unit_1]
    return pascals * UNIT_CONVERSION[unit_2]
}
