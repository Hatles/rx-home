/**
 * Distance util functions.
 */
import {
    LENGTH,
    LENGTH_CENTIMETERS, LENGTH_FEET, LENGTH_INCHES,
    LENGTH_KILOMETERS, LENGTH_METERS, LENGTH_MILES,
    LENGTH_MILLIMETERS, LENGTH_YARD,
    UNIT_NOT_RECOGNIZED_TEMPLATE
} from "../const";
import {ValueError} from "../exceptions";
import {Callable, Dict} from "../types";


export const VALID_UNITS = [
    LENGTH_KILOMETERS,
    LENGTH_MILES,
    LENGTH_FEET,
    LENGTH_METERS,
    LENGTH_CENTIMETERS,
    LENGTH_MILLIMETERS,
    LENGTH_INCHES,
    LENGTH_YARD,
]

export const TO_METERS: Dict<Callable<number>> = {
    LENGTH_METERS: (meters) => meters,
    LENGTH_MILES: (miles) => miles * 1609.344,
    LENGTH_YARD: (yards) => yards * 0.9144,
    LENGTH_FEET: (feet) => feet * 0.3048,
    LENGTH_INCHES: (inches) => inches * 0.0254,
    LENGTH_KILOMETERS: (kilometers) => kilometers * 1000,
    LENGTH_CENTIMETERS: (centimeters) => centimeters * 0.01,
    LENGTH_MILLIMETERS: (millimeters) => millimeters * 0.001,
}

export const METERS_TO: Dict<Callable<number>> = {
    LENGTH_METERS: (meters) => meters,
    LENGTH_MILES: (meters) => meters * 0.000621371,
    LENGTH_YARD: (meters) => meters * 1.09361,
    LENGTH_FEET: (meters) => meters * 3.28084,
    LENGTH_INCHES: (meters) => meters * 39.3701,
    LENGTH_KILOMETERS: (meters) => meters * 0.001,
    LENGTH_CENTIMETERS: (meters) => meters * 100,
    LENGTH_MILLIMETERS: (meters) => meters * 1000,
}


/**
 * Convert one unit of measurement to another.
 */
export function convert(value: number, unit_1: string, unit_2: string): number {
    if (unit_1 !in VALID_UNITS) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(unit_1, LENGTH))
    }
    if (unit_2 !in VALID_UNITS) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(unit_2, LENGTH))
    }

    if (!(typeof value === 'number')) {
        throw new TypeError(`${value} is not of numeric type`)
    }

    if (unit_1 === unit_2 || unit_1 !in VALID_UNITS) {
        return value
    }

    const meters: number = TO_METERS[unit_1](value)

    return METERS_TO[unit_2](meters)
}
