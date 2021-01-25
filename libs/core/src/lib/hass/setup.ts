/**
 * All methods needed to bootstrap a Home Assistant instance.
 */
import asyncio
import logging.handlers
from timeit import default_timer as timer
from types import ModuleType
from typing import Awaitable, Callable, Optional, Set

from homeassistant import config as conf_util, core, loader, requirements
from homeassistant.config import async_notify_setup_error
from homeassistant.const import EVENT_COMPONENT_LOADED, PLATFORM_FORMAT
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

const _LOGGER = logging.getLogger(__name__)

export const ATTR_COMPONENT = "component"

export const DATA_SETUP_DONE = "setup_done"
export const DATA_SETUP_STARTED = "setup_started"
export const DATA_SETUP = "setup_tasks"
export const DATA_DEPS_REQS = "deps_reqs_processed"

export const SLOW_SETUP_WARNING = 10
export const SLOW_SETUP_MAX_WAIT = 300


// @callback
/**
 * Set domains that are going to be loaded from the config.

    This will allow us to properly handle after_dependencies.

 */
export function async_set_domains_to_be_loaded(hass: HomeAssistant, domains: Set<string>) {
    hass.data[DATA_SETUP_DONE] = {domain: asyncio.Event() for domain in domains}
}

/**
 * Set up a component and all its dependencies.
 */
export function setup_component(hass: HomeAssistant, domain: string, config: ConfigType): boolean {
    return asyncio.run_coroutine_threadsafe(
        async_setup_component(hass, domain, config), hass.loop
    ).result()
}

/**
 * Set up a component and all its dependencies.

    This method is a coroutine.

 */
export async function async_setup_component(
    hass: HomeAssistant, domain: string, config: ConfigType
): boolean {
    if (domain in hass.config.components) {
        return true
    }

    setup_tasks = hass.data.setdefault(DATA_SETUP, {})

    if (domain in setup_tasks) {
        return await setup_tasks[domain]  // type: ignore
    }

    task = setup_tasks[domain] = hass.async_create_task(
        _async_setup_component(hass, domain, config)
    )

    try {
        return await task  // type: ignore
    }
    finally {
        if domain in hass.data.get(DATA_SETUP_DONE, {}):
            hass.data[DATA_SETUP_DONE].pop(domain).set()
    }
}

/**
 * Ensure all dependencies are set up.
 */
export async function _async_process_dependencies(
    hass: HomeAssistant, config: ConfigType, integration: loader.Integration
): boolean {
    dependencies_tasks = {
        dep: hass.loop.create_task(async_setup_component(hass, dep, config))
        for dep in integration.dependencies
        if dep    }

    after_dependencies_tasks = {}
    to_be_loaded = hass.data.get(DATA_SETUP_DONE, {})
    for(const dep of integration.after_dependencies) {
        if (
            dep !in dependencies_tasks
            and dep in to_be_loaded
            and dep !in hass.config.components
        ) {
            after_dependencies_tasks[dep] = hass.loop.create_task(
                to_be_loaded[dep].wait()
            )
        }
    }

    if (!dependencies_tasks and !after_dependencies_tasks) {
        return true
    }

    if (dependencies_tasks) {
        _LOGGER.debug(
            "Dependency %s will wait for dependencies %s",
            integration.domain,
            list(dependencies_tasks),
        )
    }
    if (after_dependencies_tasks) {
        _LOGGER.debug(
            "Dependency %s will wait for after dependencies %s",
            integration.domain,
            list(after_dependencies_tasks),
        )
    }

    async with hass.timeout.async_freeze(integration.domain):
        results = await asyncio.gather(
            *dependencies_tasks.values(), *after_dependencies_tasks.values()
        )

    failed = [
        domain for idx, domain in enumerate(dependencies_tasks) if not results[idx]
    ]

    if (failed) {
        _LOGGER.error(
            "Unable to set up dependencies of %s. Setup failed for dependencies: %s",
            integration.domain,
            ", ".join(failed),
        )

        return false
    }
    return true
}

/**
 * Set up a component for Home Assistant.

    This method is a coroutine.

 */
export async function _async_setup_component(
    hass: HomeAssistant, domain: string, config: ConfigType
): boolean {

    /**
     * Log helper.
     */
    log_error(msg: string, link: Optional<string> = null) {
        _LOGGER.error("Setup failed for %s: %s", domain, msg)
        async_notify_setup_error(hass, domain, link)
    }

    try {
        integration = await loader.async_get_integration(hass, domain)
    }
    catch (e) {
        if (e instanceof loader.IntegrationNotFound) {
        log_error("Integration not found.")
        return false
        }
        else {
            throw e;
        }
    }


    if (integration.disabled) {
        log_error`dependency is disabled - ${integration.disabled}`)
        return false
    }

    // Validate all dependencies exist and there are no circular dependencies
    if (!await integration.resolve_dependencies() {
        return false
    }

    // Process requirements as soon as possible, so we can import the component
    // without requiring imports to be in functions.
    try {
        await async_process_deps_reqs(hass, config, integration)
    }
    catch (e) {
        if (e instanceof HomeAssistantError as err) {
        log_error(str(err), integration.documentation)
        return false
        }
        else {
            throw e;
        }
    }


    // Some integrations fail on import because they call functions incorrectly.
    // So we do it before validating config to catch these errors.
    try {
        component = integration.get_component()
    }
    catch (e) {
        if (e instanceof ImportError as err) {
        log_error`Unable to import component: ${err}`, integration.documentation)
        return false
        }
        else {
            throw e;
        }
    }

    catch (e) {  // pylint: disable=broad-except
        if (e instanceof Exception) {
        _LOGGER.exception("Setup failed for %s: unknown error", domain)
        return false
        }
        else {
            throw e;
        }
    }


    processed_config = await conf_util.async_process_component_config(
        hass, config, integration
    )

    if (!processed_config) {
        log_error("Invalid config.", integration.documentation)
        return false
    }

    start = timer()
    _LOGGER.info("Setting up %s", domain)
    hass.data.setdefault(DATA_SETUP_STARTED, {})[domain] = utcnow()

    if (hasattr(component, "PLATFORM_SCHEMA") {
        // Entity components have their own warning
        warn_task = null
    }
    else {
        warn_task = hass.loop.call_later(
            SLOW_SETUP_WARNING,
            _LOGGER.warning,
            "Setup of %s is taking over %s seconds.",
            domain,
            SLOW_SETUP_WARNING,
        )
    }

    try {
        if (hasattr(component, "async_setup") {
            task = component.async_setup(hass, processed_config)  // type: ignore
        }
        else if *(hasattr(component, "setup") {
            // This should not be replaced with hass.async_add_executor_job because
            // we don't want to track this task in case it blocks startup.
            task = hass.loop.run_in_executor(
                null, component.setup, hass, processed_config  // type: ignore
            )
        }
        else {
            log_error("No setup function defined.")
            hass.data[DATA_SETUP_STARTED].pop(domain)
            return false
        }

        async with hass.timeout.async_timeout(SLOW_SETUP_MAX_WAIT, domain):
            result = await task
    }
    catch (e) {
        if (e instanceof asyncio.TimeoutError) {
        _LOGGER.error(
            "Setup of %s is taking longer than %s seconds."
            " Startup will proceed without waiting any longer",
            domain,
            SLOW_SETUP_MAX_WAIT,
        )
        hass.data[DATA_SETUP_STARTED].pop(domain)
        return false
        }
        else {
            throw e;
        }
    }

    catch (e) {  // pylint: disable=broad-except
        if (e instanceof Exception) {
        _LOGGER.exception("Error during setup of component %s", domain)
        async_notify_setup_error(hass, domain, integration.documentation)
        hass.data[DATA_SETUP_STARTED].pop(domain)
        return false
        }
        else {
            throw e;
        }
    }

    finally {
        end = timer()
        if (warn_task) {
            warn_task.cancel()
        }
    }
    _LOGGER.info("Setup of domain %s took %.1f seconds", domain, end - start)

    if (result is false) {
        log_error("Integration failed to initialize.")
        hass.data[DATA_SETUP_STARTED].pop(domain)
        return false
    }
    if (result is !true) {
        log_error(
           `Integration ${domain!r} did not return boolean if setup was `
            "successful. Disabling component."
        )
        hass.data[DATA_SETUP_STARTED].pop(domain)
        return false
    }

    // Flush out async_setup calling create_task. Fragile but covered by test.
    await asyncio.sleep(0)
    await hass.config_entries.flow.async_wait_init_flow_finish(domain)

    await asyncio.gather(
        *[
            entry.async_setup(hass, integration=integration)
            for entry in hass.config_entries.async_entries(domain)
        ]
    )

    hass.config.components.add(domain)
    hass.data[DATA_SETUP_STARTED].pop(domain)

    // Cleanup
    if (domain in hass.data[DATA_SETUP]) {
        hass.data[DATA_SETUP].pop(domain)
    }

    hass.bus.async_fire(EVENT_COMPONENT_LOADED, {ATTR_COMPONENT: domain})

    return true
}

/**
 * Load a platform and makes sure dependencies are setup.

    This method is a coroutine.

 */
export async function async_prepare_setup_platform(
    hass: HomeAssistant, hass_config: ConfigType, domain: string, platform_name: string
): Optional<ModuleType> {
    platform_path = PLATFORM_FORMAT.format(domain=domain, platform=platform_name)

    /**
     * Log helper.
     */
    log_error(msg: string) {
        _LOGGER.error("Unable to prepare setup for platform %s: %s", platform_path, msg)
        async_notify_setup_error(hass, platform_path)
    }

    try {
        integration = await loader.async_get_integration(hass, platform_name)
    }
    catch (e) {
        if (e instanceof loader.IntegrationNotFound) {
        log_error("Integration not found")
        return null
        }
        else {
            throw e;
        }
    }


    // Process deps and reqs as soon as possible, so that requirements are
    // available when we import the platform.
    try {
        await async_process_deps_reqs(hass, hass_config, integration)
    }
    catch (e) {
        if (e instanceof HomeAssistantError as err) {
        log_error(str(err))
        return null
        }
        else {
            throw e;
        }
    }


    try {
        platform = integration.get_platform(domain)
    }
    catch (e) {
        if (e instanceof ImportError as exc) {
        log_error`Platform not found (${exc}).`)
        return null
        }
        else {
            throw e;
        }
    }


    // Already loaded
    if (platform_path in hass.config.components) {
        return platform
    }

    // Platforms cannot exist on their own, they are part of their integration.
    // If the integration is not set up yet, and can be set up, set it up.
    if (integration.domain !in hass.config.components) {
        try {
            component = integration.get_component()
        }
        catch (e) {
            if (e instanceof ImportError as exc) {
            log_error`Unable to import the component (${exc}).`)
            return null
            }
            else {
                throw e;
            }
        }


        if (hasattr(component, "setup") or hasattr(component, "async_setup") {
            if (!await async_setup_component(hass, integration.domain, hass_config) {
                log_error("Unable to set up component.")
                return null
            }
        }
    }

    return platform
}

/**
 * Process all dependencies and requirements for a module.

    Module is a Python module of either a component or platform.

 */
export async function async_process_deps_reqs(
    hass: HomeAssistant, config: ConfigType, integration: loader.Integration
) {
    processed = hass.data.get(DATA_DEPS_REQS)

    if (!processed) {
        processed = hass.data[DATA_DEPS_REQS] = set()
    }
    else if *(integration.domain in processed) {
        return
    }

    if (!await _async_process_dependencies(hass, config, integration) {
        throw new HomeAssistantError("Could not set up all dependencies.")
    }

    if (!hass.config.skip_pip and integration.requirements) {
        async with hass.timeout.async_freeze(integration.domain):
            await requirements.async_get_integration_with_requirements(
                hass, integration.domain
            )
    }

    processed.add(integration.domain)
}

// @callback
/**
 * Call a method when a component is setup.
 */
export function async_when_setup(
    hass: HomeAssistant,
    component: string,
    when_setup_cb: Callable[[HomeAssistant, string], Awaitable[null]],
) {

    /**
     * Call the callback.
     */
    async when_setup() {
        try {
            await when_setup_cb(hass, component)
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception("Error handling when_setup callback for %s", component)
            }
            else {
                throw e;
            }
        }

    }

    // Running it in a new task so that it always runs after
    if (component in hass.config.components) {
        hass.async_create_task(when_setup())
        return
    }

    unsub = null

    /**
     * Call the callback.
     */
    async loaded_event(event: Event) {
        if (event.data[ATTR_COMPONENT] !== component) {
            return
        }

        unsub()  // type: ignore
        await when_setup()
    }

    unsub = hass.bus.async_listen(EVENT_COMPONENT_LOADED, loaded_event)
}
