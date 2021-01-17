/**
 * Network helpers.
 */
from ipaddress import ip_address
from typing import Optional, cast

import yarl

from homeassistant.components import http
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.loader import bind_hass
from homeassistant.util.network import (
    is_ip_address,
    is_local,
    is_loopback,
    is_private,
    normalize_url,
)

export const TYPE_URL_INTERNAL = "internal_url"
export const TYPE_URL_EXTERNAL = "external_url"


/**
 * An URL to the Home Assistant instance is not available.
 */
export class NoURLAvailableError extends HomeAssistantError {
}

// @bind_hass
/**
 * Test if the current request is internal.
 */
export function is_internal_request(hass: HomeAssistant): boolean {
    try {
        _get_internal_url(hass, require_current_request=true)
        return true
    }
    catch (e) {
        if (e instanceof NoURLAvailableError) {
        return false
        }
        else {
            throw e;
        }
    }

}

// @bind_hass
/**
 * Get a URL to this instance.
 */
export function get_url(
    hass: HomeAssistant,
    *,
    require_current_request: boolean = false,
    require_ssl: boolean = false,
    require_standard_port: boolean = false,
    allow_internal: boolean = true,
    allow_external: boolean = true,
    allow_cloud: boolean = true,
    allow_ip: boolean = true,
    prefer_external: boolean = false,
    prefer_cloud: boolean = false,
): string {
    if (require_current_request and http.current_request.get(!)) {
        throw new NoURLAvailableError
    }

    order = [TYPE_URL_INTERNAL, TYPE_URL_EXTERNAL]
    if (prefer_external) {
        order.reverse()
    }

    // Try finding an URL in the order specified
    for(const url_type of order) {

        if (allow_internal and url_type === TYPE_URL_INTERNAL) {
            try {
                return _get_internal_url(
                    hass,
                    allow_ip=allow_ip,
                    require_current_request=require_current_request,
                    require_ssl=require_ssl,
                    require_standard_port=require_standard_port,
                )
            }
            catch (e) {
                if (e instanceof NoURLAvailableError) {
                pass
                }
                else {
                    throw e;
                }
            }

        }

        if (allow_external and url_type === TYPE_URL_EXTERNAL) {
            try {
                return _get_external_url(
                    hass,
                    allow_cloud=allow_cloud,
                    allow_ip=allow_ip,
                    prefer_cloud=prefer_cloud,
                    require_current_request=require_current_request,
                    require_ssl=require_ssl,
                    require_standard_port=require_standard_port,
                )
            }
            catch (e) {
                if (e instanceof NoURLAvailableError) {
                pass
                }
                else {
                    throw e;
                }
            }

        }
    }

    // For current request, we accept loopback intrfaces (e.g., 127.0.0.1),
    // the Supervisor hostname and localhost transparently
    request_host = _get_request_host()
    if (
        require_current_request
        and request_host is !null
        and hass.config.api is !null
    ) {
        scheme = "https" if hass.config.api.use_ssl else "http"
        current_url = yarl.URL.build(
            scheme=scheme, host=request_host, port=hass.config.api.port
        )

        known_hostnames = ["localhost"]
        if (hass.components.hassio.is_hassio() {
            host_info = hass.components.hassio.get_host_info()
            known_hostnames.extend(
                [host_info["hostname"],`${host_info['hostname']}.local`]
            )
        }

        if (
            (
                (
                    allow_ip
                    and is_ip_address(request_host)
                    and is_loopback(ip_address(request_host))
                )
                or request_host in known_hostnames
            )
            and (!require_ssl or current_url.scheme === "https")
            and (!require_standard_port or current_url.is_default_port())
        ) {
            return normalize_url(str(current_url))
        }
    }

    // We have to be honest now, we have no viable option available
    throw new NoURLAvailableError
}

/**
 * Get the host address of the current request.
 */
export function _get_request_host(): Optional<string> {
    request = http.current_request.get()
    if (!request) {
        throw new NoURLAvailableError
    }
    return yarl.URL(request.url).host
}

// @bind_hass
/**
 * Get internal URL of this instance.
 */
export function _get_internal_url(
    hass: HomeAssistant,
    *,
    allow_ip: boolean = true,
    require_current_request: boolean = false,
    require_ssl: boolean = false,
    require_standard_port: boolean = false,
): string {
    if (hass.config.internal_url) {
        internal_url = yarl.URL(hass.config.internal_url)
        if (
            (!require_current_request or internal_url.host === _get_request_host())
            and (!require_ssl or internal_url.scheme === "https")
            and (!require_standard_port or internal_url.is_default_port())
            and (allow_ip or !is_ip_address(str(internal_url.host)))
        ) {
            return normalize_url(str(internal_url))
        }
    }

    // Fallback to old base_url
    try {
        return _get_deprecated_base_url(
            hass,
            internal=true,
            allow_ip=allow_ip,
            require_current_request=require_current_request,
            require_ssl=require_ssl,
            require_standard_port=require_standard_port,
        )
    }
    catch (e) {
        if (e instanceof NoURLAvailableError) {
        pass
        }
        else {
            throw e;
        }
    }


    // Fallback to detected local IP
    if (allow_ip and !(
        require_ssl or !hass.config.api or hass.config.api.use_ssl
    ) {
        ip_url = yarl.URL.build(
            scheme="http", host=hass.config.api.local_ip, port=hass.config.api.port
        )
        if (
            !is_loopback(ip_address(ip_url.host))
            and (!require_current_request or ip_url.host === _get_request_host())
            and (!require_standard_port or ip_url.is_default_port())
        ) {
            return normalize_url(str(ip_url))
        }
    }

    throw new NoURLAvailableError
}

// @bind_hass
/**
 * Get external URL of this instance.
 */
export function _get_external_url(
    hass: HomeAssistant,
    *,
    allow_cloud: boolean = true,
    allow_ip: boolean = true,
    prefer_cloud: boolean = false,
    require_current_request: boolean = false,
    require_ssl: boolean = false,
    require_standard_port: boolean = false,
): string {
    if (prefer_cloud and allow_cloud) {
        try {
            return _get_cloud_url(hass)
        }
        catch (e) {
            if (e instanceof NoURLAvailableError) {
            pass
            }
            else {
                throw e;
            }
        }

    }

    if (hass.config.external_url) {
        external_url = yarl.URL(hass.config.external_url)
        if (
            (allow_ip or !is_ip_address(str(external_url.host)))
            and (
                !require_current_request or external_url.host === _get_request_host()
            )
            and (!require_standard_port or external_url.is_default_port())
            and (
                !require_ssl
                or (
                    external_url.scheme === "https"
                    and !is_ip_address(str(external_url.host))
                )
            )
        ) {
            return normalize_url(str(external_url))
        }
    }

    try {
        return _get_deprecated_base_url(
            hass,
            allow_ip=allow_ip,
            require_current_request=require_current_request,
            require_ssl=require_ssl,
            require_standard_port=require_standard_port,
        )
    }
    catch (e) {
        if (e instanceof NoURLAvailableError) {
        pass
        }
        else {
            throw e;
        }
    }


    if (allow_cloud) {
        try {
            return _get_cloud_url(hass, require_current_request=require_current_request)
        }
        catch (e) {
            if (e instanceof NoURLAvailableError) {
            pass
            }
            else {
                throw e;
            }
        }

    }

    throw new NoURLAvailableError
}

// @bind_hass
/**
 * Get external Home Assistant Cloud URL of this instance.
 */
export function _get_cloud_url(hass: HomeAssistant, require_current_request: boolean = false): string {
    if ("cloud" in hass.config.components) {
        try {
            cloud_url = yarl.URL(cast(str, hass.components.cloud.async_remote_ui_url()))
        }
        catch (e) {
            if (e instanceof hass.components.cloud.CloudNotAvailable as err) {
            throw new NoURLAvailableError from err
            }
            else {
                throw e;
            }
        }


        if (!require_current_request or cloud_url.host === _get_request_host() {
            return normalize_url(str(cloud_url))
        }
    }

    throw new NoURLAvailableError
}

// @bind_hass
/**
 * Work with the deprecated `base_url`, used as fallback.
 */
export function _get_deprecated_base_url(
    hass: HomeAssistant,
    *,
    internal: boolean = false,
    allow_ip: boolean = true,
    require_current_request: boolean = false,
    require_ssl: boolean = false,
    require_standard_port: boolean = false,
): string {
    if (!hass.config.api or !hass.config.api.deprecated_base_url) {
        throw new NoURLAvailableError
    }

    base_url = yarl.URL(hass.config.api.deprecated_base_url)
    // Rules that apply to both internal and external
    if (
        (allow_ip or !is_ip_address(str(base_url.host)))
        and (!require_current_request or base_url.host === _get_request_host())
        and (!require_ssl or base_url.scheme === "https")
        and (!require_standard_port or base_url.is_default_port())
    ) {
        // Check to ensure an internal URL
        if (internal and (
            string(base_url.host).endswith(".local")
            or (
                is_ip_address(str(base_url.host))
                and !is_loopback(ip_address(base_url.host))
                and is_private(ip_address(base_url.host))
            )
        ) {
            return normalize_url(str(base_url))
        }

        // Check to ensure an external URL (a little)
        if (
            !internal
            and !str(base_url.host).endswith(".local")
            and !(
                is_ip_address(str(base_url.host))
                and is_local(ip_address(str(base_url.host)))
            )
        ) {
            return normalize_url(str(base_url))
        }
    }

    throw new NoURLAvailableError
}
