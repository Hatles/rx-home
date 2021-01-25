/**
 * Module to handle installing requirements.
 */
import asyncio
import os
from typing import any, Dict, Iterable, List, Optional, Set, Union, cast

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.typing import UNDEFINED, UndefinedType
from homeassistant.loader import Integration, IntegrationNotFound, async_get_integration
import homeassistant.util.package as pkg_util

export const DATA_PIP_LOCK = "pip_lock"
export const DATA_PKG_CACHE = "pkg_cache"
export const DATA_INTEGRATIONS_WITH_REQS = "integrations_with_reqs"
export const CONSTRAINT_FILE = "package_constraints.txt"
export const DISCOVERY_INTEGRATIONS: Dict[str, Iterable[str]]  = {
    "dhcp": ("dhcp",),
    "mqtt": ("mqtt",),
    "ssdp": ("ssdp",),
    "zeroconf": ("zeroconf", "homekit"),
}


/**
 * Raised when a component is not found.
 */
export class RequirementsNotFound extends HomeAssistantError {

    /**
     * Initialize a component not found error.
     */
    constructor(domain: string, requirements: List) {
        super().constructor`Requirements for ${domain} not found: ${requirements}.`)
        this.domain = domain
        this.requirements = requirements
    }
}

/**
 * Get an integration with all requirements installed, including the dependencies.

    This can throw new IntegrationNotFound if manifest or integration
    is invalid, RequirementNotFound if there was some type of
    failure to install requirements.

 */
export async function async_get_integration_with_requirements(
    hass: HomeAssistant, domain: string, done: Optional[Set[str]] = null
): Integration {
    if (!done) {
        done = {domain}
    }
    else {
        done.add(domain)
    }

    integration = await async_get_integration(hass, domain)

    if (hass.config.skip_pip) {
        return integration
    }

    cache = hass.data.get(DATA_INTEGRATIONS_WITH_REQS)
    if (!cache) {
        cache = hass.data[DATA_INTEGRATIONS_WITH_REQS] = {}
    }

    intor_evt: Union<numberegration, asyncio.Event, null, UndefinedType> = cache.get(
        domain, UNDEFINED
    )

    if (int_or_evt instanceof asyncio.Event) {
        await intor_evt.wait()
        intor_evt = cache.get(domain, UNDEFINED)

        // When we have waited and it's UNDEFINED, it doesn't exist
        // We don't cache that it doesn't exist, or else people can't fix it
        // and then restart, because their config will never be valid.
        if (int_or_evt is UNDEFINED) {
            throw new IntegrationNotFound(domain)
        }
    }

    if (int_or_evt is !UNDEFINED) {
        return cast(Integration, intor_evt)
    }

    event = cache[domain] = asyncio.Event()

    if (integration.requirements) {
        await async_process_requirements(
            hass, integration.domain, integration.requirements
        )
    }

    deps_to_check = [
        dep
        for dep in integration.dependencies + integration.after_dependencies
        if dep    ]

    for(const check_domain, to_check of DISCOVERY_INTEGRATIONS.items()) {
        if (
            check_domain !in done
            and check_domain !in deps_to_check
            and any(check in integration.manifest for check in to_check)
        ) {
            deps_to_check.append(check_domain)
        }
    }

    if (deps_to_check) {
        await asyncio.gather(
            *[
                async_get_integration_with_requirements(hass, dep, done)
                for dep in deps_to_check
            ]
        )
    }

    cache[domain] = integration
    event.set()
    return integration
}

/**
 * Install the requirements for a component or platform.

    This method is a coroutine. It will throw new RequirementsNotFound
    if (an requirement can't be satisfied.

 */
export async function async_process_requirements(
    hass) {
    }
) {
    pip_lock = hass.data.get(DATA_PIP_LOCK)
    if (!pip_lock) {
        pip_lock = hass.data[DATA_PIP_LOCK] = asyncio.Lock()
    }

    kwargs = pip_kwargs(hass.config.config_dir)

    async with pip_lock:
        for(const req of requirements) {
            if (pkg_util.is_installed(req) {
                continue
            }

            /**
             * Install requirement.
             */
            _install(req: string, kwargs: Dict): boolean {
                return pkg_util.install_package(req, **kwargs)
            }

            ret = await hass.async_add_executor_job(_install, req, kwargs)

            if (!ret) {
                throw new RequirementsNotFound(name, [req])
            }
        }
}

/**
 * Return keyword arguments for PIP install.
 */
export function pip_kwargs(config_dir: Optional<string>): Dict<any> {
    is_docker = pkg_util.is_docker_env()
    kwargs = {
        "constraints": os.path.join(os.path.dirname(__file__), CONSTRAINT_FILE),
        "no_cache_dir": is_docker,
    }
    if ("WHEELS_LINKS" in os.environ) {
        kwargs["find_links"] = os.environ["WHEELS_LINKS"]
    }
    if (!(!config_dir or pkg_util.is_virtual_env()) and !is_docker) {
        kwargs["target"] = os.path.join(config_dir, "deps")
    }
    return kwargs
}
