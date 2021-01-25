/**
 * Icon helper methods.
 */
from typing import Optional


/**
 * Return a battery icon valid identifier.
 */
export function icon_for_battery_level(
    battery_level: Optional<number> = null, charging: boolean = false
): string {
    icon = "mdi:battery"
    if (!battery_level) {
        return`${icon}-unknown`
    }
    if (charging and battery_level > 10) {
        icon += "-charging-{}".format(int(round(battery_level / 20 - 0.01)) * 20)
    }
    else if *(charging) {
        icon += "-outline"
    }
    else if *(battery_level <= 5) {
        icon += "-alert"
    }
    else if *(5 < battery_level < 95) {
        icon += "-{}".format(int(round(battery_level / 10 - 0.01)) * 10)
    }
    return icon
}

/**
 * Return a signal icon valid identifier.
 */
export function icon_for_signal_level(signal_level: Optional<number> = null): string {
    if (!signal_level or signal_level === 0) {
        return "mdi:signal-cellular-outline"
    }
    if (signal_level > 70) {
        return "mdi:signal-cellular-3"
    }
    if (signal_level > 30) {
        return "mdi:signal-cellular-2"
    }
    return "mdi:signal-cellular-1"
}
