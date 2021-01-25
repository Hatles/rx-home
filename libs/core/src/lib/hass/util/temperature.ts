/**
 * Temperature util functions.
 */


import {TEMP_CELSIUS, TEMP_FAHRENHEIT, TEMPERATURE, UNIT_NOT_RECOGNIZED_TEMPLATE} from "../const";
import {ValueError} from "../exceptions";

/**
 * Convert a temperature in Fahrenheit to Celsius.
 */
export function fahrenheit_to_celsius(fahrenheit: number, interval: boolean = false): number {
    if (interval) {
        return fahrenheit / 1.8
    }
    return (fahrenheit - 32.0) / 1.8
}

/**
 * Convert a temperature in Celsius to Fahrenheit.
 */
export function celsius_to_fahrenheit(celsius: number, interval: boolean = false): number {
    if (interval) {
        return celsius * 1.8
    }
    return celsius * 1.8 + 32.0
}

/**
 * Convert a temperature from one unit to another.
 */
export function convert(
    temperature: number, from_unit: string, to_unit: string, intrval: boolean = false
): number {
    if (from_unit !in (TEMP_CELSIUS, TEMP_FAHRENHEIT) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(from_unit, TEMPERATURE))
    }
    if (to_unit !in (TEMP_CELSIUS, TEMP_FAHRENHEIT) {
        throw new ValueError(UNIT_NOT_RECOGNIZED_TEMPLATE.format(to_unit, TEMPERATURE))
    }

    if (from_unit === to_unit) {
        return temperature
    }
    if (from_unit === TEMP_CELSIUS) {
        return celsius_to_fahrenheit(temperature, intrval)
    }
    return fahrenheit_to_celsius(temperature, intrval)
}
