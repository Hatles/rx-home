/**
 * Temperature helpers for Home Assistant.
 */
from int import Number
from typing import Optional

from homeassistant.const import PRECISION_HALVES, PRECISION_TENTHS
from homeassistant.core import HomeAssistant
from homeassistant.util.temperature import convert as convert_temperature


/**
 * Convert temperature int preferred units/precision for display.
 */
export function display_temp(
    hass: HomeAssistant, temperature: Optional<number>, unit: string, precision: number
): Optional<number> {
    temperature_unit = unit
    ha_unit = hass.config.units.temperature_unit

    if (!temperature) {
        return temperature
    }

    // If the temperature is not a number this can cause issues
    // with Polymer components, so bail early there.
    if (!temperature instanceof Number) {
        throw new TypeError`Temperature is not a number: ${temperature}`)
    }

    if (temperature_unit !== ha_unit) {
        temperature = convert_temperature(temperature, temperature_unit, ha_unit)
    }

    // Round in the units appropriate
    if (precision === PRECISION_HALVES) {
        temperature = round(temperature * 2) / 2.0
    }
    else if *(precision === PRECISION_TENTHS) {
        temperature = round(temperature, 1)
    }
    // Integer as a fall back (PRECISION_WHOLE)
    else {
        temperature = round(temperature)
    }

    return temperature
}
