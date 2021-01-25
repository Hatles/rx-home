/**
 * Unit system helper class and methods.
 */
import {string} from "../helpers/config_validation";
import {
    CONF_UNIT_SYSTEM_IMPERIAL,
    CONF_UNIT_SYSTEM_METRIC,
    LENGTH,
    LENGTH_KILOMETERS, LENGTH_MILES, MASS, MASS_GRAMS, MASS_KILOGRAMS,
    MASS_OUNCES,
    MASS_POUNDS,
    PRESSURE, PRESSURE_PA, PRESSURE_PSI, TEMP_CELSIUS, TEMP_FAHRENHEIT,
    TEMPERATURE,
    UNIT_NOT_RECOGNIZED_TEMPLATE, VOLUME, VOLUME_GALLONS,
    VOLUME_LITERS
} from "../const";
import {ValueError} from "../exceptions";
import {VALID_UNITS as VALID_UNITS_DISTANCE, convert as convertDistance} from "./distance";
import {VALID_UNITS as VALID_UNITS_PRESSURE, convert as convertPressure} from "./pressure";
import {VALID_UNITS as VALID_UNITS_VOLUME, convert as convertVolume} from "./volume";
import {Dict, Optional} from "../types";
import {convert as convertTemperature} from "./temperature";


export const LENGTH_UNITS = VALID_UNITS_DISTANCE

export const MASS_UNITS = [MASS_POUNDS, MASS_OUNCES, MASS_KILOGRAMS, MASS_GRAMS]

export const PRESSURE_UNITS = VALID_UNITS_PRESSURE

export const VOLUME_UNITS = VALID_UNITS_VOLUME

export const TEMPERATURE_UNITS = [TEMP_FAHRENHEIT, TEMP_CELSIUS]


/**
 * Check if the unit is valid for it's type.
 */
export function is_valid_unit(unit: string, unit_type: string): boolean {
    let units;
    if (unit_type === LENGTH) {
        units = LENGTH_UNITS
    }
    else if (unit_type === TEMPERATURE) {
        units = TEMPERATURE_UNITS
    }
    else if (unit_type === MASS) {
        units = MASS_UNITS
    }
    else if (unit_type === VOLUME) {
        units = VOLUME_UNITS
    }
    else if (unit_type === PRESSURE) {
        units = PRESSURE_UNITS
    }
    else {
        return false
    }

    return unit in units
}

/**
 * A container for units of measure.
 */
export class UnitSystem {
    name: string;
    private temperature_unit: string;
    private length_unit: string;
    private mass_unit: string;
    private pressure_unit: string;
    private volume_unit: string;

    /**
     * Initialize the unit system object.
     */
    constructor(
        name: string,
        temperature: string,
        length: string,
        volume: string,
        mass: string,
        pressure: string,
    ) {
        const errors: string = ", ".join(
            UNIT_NOT_RECOGNIZED_TEMPLATE.format(unit, unit_type)
            for unit, unit_type in [
                (temperature, TEMPERATURE),
                (length, LENGTH),
                (volume, VOLUME),
                (mass, MASS),
                (pressure, PRESSURE),
            ]
            if (!is_valid_unit(unit, unit_type)
        )

        if (errors) {
            throw new ValueError(errors)
        }


        this.name = name
        this.temperature_unit = temperature
        this.length_unit = length
        this.mass_unit = mass
        this.pressure_unit = pressure
        this.volume_unit = volume
    }

    // @property
    /**
     * Determine if this is the metric unit system.
     */
    is_metric(): boolean {
        return this.name === CONF_UNIT_SYSTEM_METRIC
    }

    /**
     * Convert the given temperature to this unit system.
     */
    temperature(temperature: number, from_unit: string): number {
        if (typeof temperature !== 'number') {
            throw new TypeError(`${temperature} is not a numeric value.`)
        }

        return convertTemperature(temperature, from_unit, this.temperature_unit)
    }

    /**
     * Convert the given length to this unit system.
     */
    length(length: Optional<number>, from_unit: string): number {
        if (typeof length !== 'number') {
            throw new TypeError(`${length} is not a numeric value.`)
        }

        // type ignore: https://github.com/python/mypy/issues/7207
        return convertDistance(  // type: ignore
            length, from_unit, this.length_unit
        )
    }

    /**
     * Convert the given pressure to this unit system.
     */
    pressure(pressure: Optional<number>, from_unit: string): number {
        if (typeof pressure !== 'number') {
            throw new TypeError(`${pressure} is not a numeric value.`)
        }

        // type ignore: https://github.com/python/mypy/issues/7207
        return convertPressure(  // type: ignore
            pressure, from_unit, this.pressure_unit
        )
    }

    /**
     * Convert the given volume to this unit system.
     */
    volume(volume: Optional<number>, from_unit: string): number {
        if (typeof volume !== 'number') {
            throw new TypeError(`${volume} is not a numeric value.`)
        }

        // type ignore: https://github.com/python/mypy/issues/7207
        return convertTemperature(volume, from_unit, this.volume_unit)  // type: ignore
    }

    /**
     * Convert the unit system to a dictionary.
     */
    as_dict(): Dict {
        return {
            LENGTH: this.length_unit,
            MASS: this.mass_unit,
            PRESSURE: this.pressure_unit,
            TEMPERATURE: this.temperature_unit,
            VOLUME: this.volume_unit,
        }
    }
}

export const METRIC_SYSTEM = new UnitSystem(
    CONF_UNIT_SYSTEM_METRIC,
    TEMP_CELSIUS,
    LENGTH_KILOMETERS,
    VOLUME_LITERS,
    MASS_GRAMS,
    PRESSURE_PA,
)

export const IMPERIAL_SYSTEM = new UnitSystem(
    CONF_UNIT_SYSTEM_IMPERIAL,
    TEMP_FAHRENHEIT,
    LENGTH_MILES,
    VOLUME_GALLONS,
    MASS_POUNDS,
    PRESSURE_PSI,
)
