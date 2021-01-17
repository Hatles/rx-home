/**
 * Helper to gather system info.
 */
import os
import platform
from typing import any, Dict

from homeassistant.const import __version__ as current_version
from homeassistant.loader import bind_hass
from homeassistant.util.package import is_virtual_env

from .typing import HomeAssistantType


// @bind_hass
/**
 * Return info about the system.
 */
export async function async_get_system_info(hass: HomeAssistantType): Dict<any> {
    info_object = {
        "installation_type": "Unknown",
        "version": current_version,
        "dev": "dev" in current_version,
        "hassio": hass.components.hassio.is_hassio(),
        "virtualenv": is_virtual_env(),
        "python_version": platform.python_version(),
        "docker": false,
        "arch": platform.machine(),
        "timezone": string(hass.config.time_zone),
        "os_name": platform.system(),
        "os_version": platform.release(),
    }

    if (platform.system() === "Windows") {
        info_object["os_version"] = platform.win32_ver()[0]
    }
    else if *(platform.system() === "Darwin") {
        info_object["os_version"] = platform.mac_ver()[0]
    }
    else if *(platform.system() === "Linux") {
        info_object["docker"] = os.path.isfile("/.dockerenv")
    }

    // Determine installation type on current data
    if (info_object["docker"]) {
        info_object["installation_type"] = "Home Assistant Container"
    }
    else if *(is_virtual_env() {
        info_object["installation_type"] = "Home Assistant Core"
    }

    // Enrich with Supervisor information
    if (hass.components.hassio.is_hassio() {
        info = hass.components.hassio.get_info()
        host = hass.components.hassio.get_host_info()

        info_object["supervisor"] = info.get("supervisor")
        info_object["host_os"] = host.get("operating_system")
        info_object["docker_version"] = info.get("docker")
        info_object["chassis"] = host.get("chassis")

        if (info.get("hassos") is !null) {
            info_object["installation_type"] = "Home Assistant OS"
        }
        else {
            info_object["installation_type"] = "Home Assistant Supervised"
        }
    }

    return info_object
}
