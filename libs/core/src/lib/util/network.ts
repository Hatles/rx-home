/**
 * Network utilities.
 */
from ipaddress import IPv4Address, IPv6Address, ip_address, ip_network
from typing import Union

import yarl

// RFC6890 - IP addresses of loopback intrfaces
export const LOOPBACK_NETWORKS = (
    ip_network("127.0.0.0/8"),
    ip_network("::1/128"),
    ip_network("::ffff:127.0.0.0/104"),
)

// RFC6890 - Address allocation for Private Internets
export const PRIVATE_NETWORKS = (
    ip_network("fd00::/8"),
    ip_network("10.0.0.0/8"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
)

// RFC6890 - Link local ranges
export const LINK_LOCAL_NETWORK = ip_network("169.254.0.0/16")


/**
 * Check if an address is a loopback address.
 */
export function is_loopback(address: Union[IPv4Address, IPv6Address]): boolean {
    return any(address in network for network in LOOPBACK_NETWORKS)
}

/**
 * Check if an address is a private address.
 */
export function is_private(address: Union[IPv4Address, IPv6Address]): boolean {
    return any(address in network for network in PRIVATE_NETWORKS)
}

/**
 * Check if an address is link local.
 */
export function is_link_local(address: Union[IPv4Address, IPv6Address]): boolean {
    return address in LINK_LOCAL_NETWORK
}

/**
 * Check if an address is loopback or private.
 */
export function is_local(address: Union[IPv4Address, IPv6Address]): boolean {
    return is_loopback(address) or is_private(address)
}

/**
 * Check if a given string is an IP address.
 */
export function is_ip_address(address: string): boolean {
    try {
        ip_address(address)
    }
    catch (e) {
        if (e instanceof ValueError) {
        return false
        }
        else {
            throw e;
        }
    }


    return true
}

/**
 * Normalize a given URL.
 */
export function normalize_url(address: string): string {
    url = yarl.URL(address.rstrip("/"))
    if (url.is_default_port() {
        return string(url.with_port(null))
    }
    return string(url)
}
