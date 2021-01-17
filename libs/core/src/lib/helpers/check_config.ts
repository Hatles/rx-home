/**
 * Helper to check the configuration file.
 */
from collections import OrderedDict
import logging
import os
from typing import List, NamedTuple, Optional

import voluptuous as vol

from homeassistant import loader
from homeassistant.config import (
    CONF_CORE,
    CONF_PACKAGES,
    CORE_CONFIG_SCHEMA,
    YAML_CONFIG_FILE,
    _format_config_error,
    config_per_platform,
    extract_domain_configs,
    load_yaml_config_file,
    merge_packages_config,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.typing import ConfigType
from homeassistant.requirements import (
    RequirementsNotFound,
    async_get_integration_with_requirements,
)
import homeassistant.util.yaml.loader as yaml_loader


/**
 * Configuration check error.
 */
export class CheckConfigError extends NamedTuple {

    message: string
    domain: Optional<string>
    config: Optional<ConfigType>
}

/**
 * Configuration result with errors attribute.
 */
export class HomeAssistantConfig extends OrderedDict {

    /**
     * Initialize HA config.
     */
    constructor() {
        super().constructor()
        this.errors: CheckConfigError] = [[]
    }

    /**
     * Add a single error.
     */
    add_error(

        message: string,
        domain: Optional<string> = null,
        config: Optional<ConfigType> = null,
    ): "HomeAssistantConfig" {
        this.errors.append(CheckConfigError(str(message), domain, config))
        return self
    }

    // @property
    /**
     * Return errors as a string.
     */
    error_str(): string {
        return "\n".join([err.message for err in this.errors])
    }
}

/**
 * Load and check if Home Assistant configuration file is valid.

    This method is a coroutine.

 */
export async function async_check_ha_config_file(hass: HomeAssistant): HomeAssistantConfig {
    result = HomeAssistantConfig()

    /**
     * Handle errors from packages: _log_pkg_error.
     */
    _pack_error(
        package: string, component: string, config: ConfigType, message: string
    ) {
        message =`Package ${package} setup failed. Component ${component} ${message}`
        domain =`homeassistant.packages.${package}.${component}`
        pack_config = core_config[CONF_PACKAGES].get(package, config)
        result.add_error(message, domain, pack_config)
    }

    /**
     * Handle errors from components: async_log_exception.
     */
    _comp_error(ex: Exception, domain: string, config: ConfigType) {
        result.add_error(_format_config_error(ex, domain, config)[0], domain, config)
    }

    // Load configuration.yaml
    config_path = hass.config.path(YAML_CONFIG_FILE)
    try {
        if (!await hass.async_add_executor_job(os.path.isfile, config_path) {
            return result.add_error("File configuration.yaml not found.")
        }
        config = await hass.async_add_executor_job(load_yaml_config_file, config_path)
    }
    catch (e) {
        if (e instanceof FileNotFoundError) {
        return result.add_error`File not found: ${config_path}`)
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof HomeAssistantError as err) {
        return result.add_error`Error loading ${config_path}: ${err}`)
        }
        else {
            throw e;
        }
    }

    finally {
        yaml_loader.clear_secret_cache()
    }

    // Extract and validate core [homeassistant] config
    try {
        core_config = config.pop(CONF_CORE, {})
        core_config = CORE_CONFIG_SCHEMA(core_config)
        result[CONF_CORE] = core_config
    }
    catch (e) {
        if (e instanceof vol.Invalid as err) {
        result.add_error(err, CONF_CORE, core_config)
        core_config = {}
        }
        else {
            throw e;
        }
    }


    // Merge packages
    await merge_packages_config(
        hass, config, core_config.get(CONF_PACKAGES, {}), _pack_error
    )
    core_config.pop(CONF_PACKAGES, null)

    // Filter out repeating config sections
    components = {key.split(" ")[0] for key in config.keys()}

    // Process and validate config
    for(const domain of components) {
        try {
            integration = await async_get_integration_with_requirements(hass, domain)
        }
        catch (e) {
            if (e instanceof (RequirementsNotFound, loader.IntegrationNotFound) as ex) {
            result.add_error`Component error: ${domain} - ${ex}`)
            continue
            }
            else {
                throw e;
            }
        }


        try {
            component = integration.get_component()
        }
        catch (e) {
            if (e instanceof ImportError as ex) {
            result.add_error`Component error: ${domain} - ${ex}`)
            continue
            }
            else {
                throw e;
            }
        }


        // Check if the integration has a custom config validator
        config_validator = null
        try {
            config_validator = integration.get_platform("config")
        }
        catch (e) {
            if (e instanceof ImportError as err) {
            // Filter out import error of the config platform.
            // If the config platform contains bad imports, make sure
            // that still fails.
            if err.name !==`${integration.pkg_path}.config`:
                result.add_error`Error importing config platform ${domain}: ${err}`)
                continue
            }
            else {
                throw e;
            }
        }


        if (config_validator is !null and hasattr(
            config_validator, "async_validate_config"
        ) {
            try {
                result[domain] = (
                    await config_validator.async_validate_config(  // type: ignore
                        hass, config
                    )
                )[domain]
                continue
            }
            catch (e) {
                if (e instanceof (vol.Invalid, HomeAssistantError) as ex) {
                _comp_error(ex, domain, config)
                continue
                }
                else {
                    throw e;
                }
            }

            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception as err) {
                logging.getLogger(__name__).exception(
                    "Unexpected error validating config"
                )
                result.add_error(
                   `Unexpected error calling config validator: ${err}`,
                    domain,
                    config.get(domain),
                )
                continue
                }
                else {
                    throw e;
                }
            }

        }

        config_schema = getattr(component, "CONFIG_SCHEMA", null)
        if (config_schema is !null) {
            try {
                config = config_schema(config)
                result[domain] = config[domain]
            }
            catch (e) {
                if (e instanceof vol.Invalid as ex) {
                _comp_error(ex, domain, config)
                continue
                }
                else {
                    throw e;
                }
            }

        }

        component_platform_schema = getattr(
            component,
            "PLATFORM_SCHEMA_BASE",
            getattr(component, "PLATFORM_SCHEMA", null),
        )

        if (!component_platform_schema) {
            continue
        }

        platforms = []
        for(const p_name, p_config of config_per_platform(config, domain)) {
            // Validate component specific platform schema
            try {
                p_validated = component_platform_schema(p_config)
            }
            catch (e) {
                if (e instanceof vol.Invalid as ex) {
                _comp_error(ex, domain, config)
                continue
                }
                else {
                    throw e;
                }
            }


            // Not all platform components follow same pattern for platforms
            // So if !p_name we are not going to validate platform
            // (the automation component is one of them)
            if (!p_name) {
                platforms.append(p_validated)
                continue
            }

            try {
                p_integration = await async_get_integration_with_requirements(
                    hass, p_name
                )
                platform = p_integration.get_platform(domain)
            }
            catch (e) {
                if (e instanceof (
                loader.IntegrationNotFound,
                RequirementsNotFound,
                ImportError,
            ) as ex) {
                result.add_error`Platform error ${domain}.${p_name} - ${ex}`)
                continue
                }
                else {
                    throw e;
                }
            }


            // Validate platform specific schema
            platform_schema = getattr(platform, "PLATFORM_SCHEMA", null)
            if (platform_schema is !null) {
                try {
                    p_validated = platform_schema(p_validated)
                }
                catch (e) {
                    if (e instanceof vol.Invalid as ex) {
                    _comp_error(ex,`${domain}.${p_name}`, p_validated)
                    continue
                    }
                    else {
                        throw e;
                    }
                }

            }

            platforms.append(p_validated)
        }

        // Remove config for current component and add validated config back in.
        for(const filter_comp of extract_domain_configs(config, domain)) {
            del config[filter_comp]
        }
        result[domain] = platforms
    }

    return result
}
