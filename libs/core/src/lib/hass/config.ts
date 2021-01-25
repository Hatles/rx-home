/**
 * Module to help with parsing and generating configuration files.
 */
from collections import OrderedDict
from distutils.version import LooseVersion  // pylint: disable=import-error
import logging
import os
import re
import shutil
from types import ModuleType
from typing import any, Callable, Dict, Optional, Sequence, Set, Tuple, Union

import voluptuous as vol
from voluptuous.humanize import humanize_error

from homeassistant import auth
from homeassistant.auth import (
    mfa_modules as auth_mfa_modules,
    providers as auth_providers,
)
from homeassistant.const import (
    ATTR_ASSUMED_STATE,
    ATTR_FRIENDLY_NAME,
    ATTR_HIDDEN,
    CONF_ALLOWLIST_EXTERNAL_DIRS,
    CONF_ALLOWLIST_EXTERNAL_URLS,
    CONF_AUTH_MFA_MODULES,
    CONF_AUTH_PROVIDERS,
    CONF_CUSTOMIZE,
    CONF_CUSTOMIZE_DOMAIN,
    CONF_CUSTOMIZE_GLOB,
    CONF_ELEVATION,
    CONF_EXTERNAL_URL,
    CONF_ID,
    CONF_INTERNAL_URL,
    CONF_LATITUDE,
    CONF_LEGACY_TEMPLATES,
    CONF_LONGITUDE,
    CONF_MEDIA_DIRS,
    CONF_NAME,
    CONF_PACKAGES,
    CONF_TEMPERATURE_UNIT,
    CONF_TIME_ZONE,
    CONF_TYPE,
    CONF_UNIT_SYSTEM,
    CONF_UNIT_SYSTEM_IMPERIAL,
    LEGACY_CONF_WHITELIST_EXTERNAL_DIRS,
    TEMP_CELSIUS,
    __version__,
)
from homeassistant.core import DOMAIN as CONF_CORE, SOURCE_YAML, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_per_platform, extract_domain_configs
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.entity_values import EntityValues
from homeassistant.loader import Integration, IntegrationNotFound
from homeassistant.requirements import (
    RequirementsNotFound,
    async_get_integration_with_requirements,
)
from homeassistant.util.package import is_docker_env
from homeassistant.util.unit_system import IMPERIAL_SYSTEM, METRIC_SYSTEM
from homeassistant.util.yaml import SECRET_YAML, load_yaml

const _LOGGER = logging.getLogger(__name__)

export const DATA_PERSISTENT_ERRORS = "bootstrap_persistent_errors"
export const RE_YAML_ERROR = re.compile(r"homeassistant\.util\.yaml")
export const RE_ASCII = re.compile(r"\033\[[^m]*m")
export const YAML_CONFIG_FILE = "configuration.yaml"
export const VERSION_FILE = ".HA_VERSION"
export const CONFIG_DIR_NAME = ".homeassistant"
export const DATA_CUSTOMIZE = "hass_customize"

export const GROUP_CONFIG_PATH = "groups.yaml"
export const AUTOMATION_CONFIG_PATH = "automations.yaml"
export const SCRIPT_CONFIG_PATH = "scripts.yaml"
export const SCENE_CONFIG_PATH = "scenes.yaml"

export const DEFAULT_CONFIG =`"`
// Configure a default setup of Home Assistant (frontend, api, etc)
default_config:

// Text to speech
tts:
  - platform: google_translate

group: !include {GROUP_CONFIG_PATH}
automation: !include {AUTOMATION_CONFIG_PATH}
script: !include {SCRIPT_CONFIG_PATH}
scene: !include {SCENE_CONFIG_PATH}
/**
 *
export const DEFAULT_SECRETS =
 */
// Use this file to store secrets like usernames and passwords.
// Learn more at https://www.home-assistant.io/docs/configuration/secrets/
some_password: welcome
/**
 *
TTS_PRE_92 =
 */
tts:
  - platform: google
/**
 *
TTS_92 =
 */
tts:
  - platform: google_translate
    service_name: google_say
/**
 *


def _no_duplicate_auth_provider(
    configs: Sequence[Dict[str, any]]
) -> Sequence[Dict[str, any]]:

 */No duplicate auth provider config allowed in a list.

    Each type of auth provider can only have one config without optional id.
    Unique id is required if same type of auth provider used multiple times.
    """
    config_keys: Set[Tuple[str, Optional[str]]] = set()
    for(const config of configs) {
        key = (config[CONF_TYPE], config.get(CONF_ID))
        if (key in config_keys) {
            throw new Joi.Invalid(
               `Duplicate auth provider ${config[CONF_TYPE]} found. `
                "Please add unique IDs "
                "if you want to have the same auth provider twice"
            )
        }
        config_keys.add(key)
    }
    return configs


/**
 * No duplicate auth mfa module item allowed in a list.

    Each type of mfa module can only have one config without optional id.
    A global unique id is required if same type of mfa module used multiple
    times.
    Note: this is different than auth provider

 */
export function _no_duplicate_auth_mfa_module(
    configs: Sequence[Dict[str, any]]
): Sequence[Dict[str, any]] {
    config_keys: Set<string> = set()
    for(const config of configs) {
        key = config.get(CONF_ID, config[CONF_TYPE])
        if (key in config_keys) {
            throw new Joi.Invalid(
               `Duplicate mfa module ${config[CONF_TYPE]} found. `
                "Please add unique IDs "
                "if you want to have the same mfa module twice"
            )
        }
        config_keys.add(key)
    }
    return configs
}

export const PACKAGES_CONFIG_SCHEMA = cv.schema_with_slug_keys(  // Package names are slugs
    Joi.Schema({cv.string: Joi.Any(dict, list, null)})  // Component config
)

export const CUSTOMIZE_DICT_SCHEMA = Joi.Schema(
    {
        Joi.Optional(ATTR_FRIENDLY_NAME): cv.string,
        Joi.Optional(ATTR_HIDDEN): cv.boolean,
        Joi.Optional(ATTR_ASSUMED_STATE): cv.boolean,
    },
    extra=Joi.ALLOW_EXTRA,
)

export const CUSTOMIZE_CONFIG_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_CUSTOMIZE, default={}): Joi.Schema(
            {cv.entity_id: CUSTOMIZE_DICT_SCHEMA}
        ),
        Joi.Optional(CONF_CUSTOMIZE_DOMAIN, default={}): Joi.Schema(
            {cv.string: CUSTOMIZE_DICT_SCHEMA}
        ),
        Joi.Optional(CONF_CUSTOMIZE_GLOB, default={}): Joi.Schema(
            {cv.string: CUSTOMIZE_DICT_SCHEMA}
        ),
    }
)

export const CORE_CONFIG_SCHEMA = CUSTOMIZE_CONFIG_SCHEMA.extend(
    {
        CONF_NAME: Joi.Coerce(str),
        CONF_LATITUDE: cv.latitude,
        CONF_LONGITUDE: cv.longitude,
        CONF_ELEVATION: Joi.Coerce(int),
        Joi.Optional(CONF_TEMPERATURE_UNIT): cv.temperature_unit,
        CONF_UNIT_SYSTEM: cv.unit_system,
        CONF_TIME_ZONE: cv.time_zone,
        Joi.Optional(CONF_INTERNAL_URL): cv.url,
        Joi.Optional(CONF_EXTERNAL_URL): cv.url,
        Joi.Optional(CONF_ALLOWLIST_EXTERNAL_DIRS): Joi.All(
            cv.ensure_list, [Joi.IsDir()]  // pylint: disable=no-value-for-parameter
        ),
        Joi.Optional(LEGACY_CONF_WHITELIST_EXTERNAL_DIRS): Joi.All(
            cv.ensure_list, [Joi.IsDir()]  // pylint: disable=no-value-for-parameter
        ),
        Joi.Optional(CONF_ALLOWLIST_EXTERNAL_URLS): Joi.All(cv.ensure_list, [cv.url]),
        Joi.Optional(CONF_PACKAGES, default={}): PACKAGES_CONFIG_SCHEMA,
        Joi.Optional(CONF_AUTH_PROVIDERS): Joi.All(
            cv.ensure_list,
            [
                auth_providers.AUTH_PROVIDER_SCHEMA.extend(
                    {
                        CONF_TYPE: Joi.NotIn(
                            ["insecure_example"],
                            "The insecure_example auth provider"
                            " is for testing only.",
                        )
                    }
                )
            ],
            _no_duplicate_auth_provider,
        ),
        Joi.Optional(CONF_AUTH_MFA_MODULES): Joi.All(
            cv.ensure_list,
            [
                auth_mfa_modules.MULTI_FACTOR_AUTH_MODULE_SCHEMA.extend(
                    {
                        CONF_TYPE: Joi.NotIn(
                            ["insecure_example"],
                            "The insecure_example mfa module is for testing only.",
                        )
                    }
                )
            ],
            _no_duplicate_auth_mfa_module,
        ),
        // pylint: disable=no-value-for-parameter
        Joi.Optional(CONF_MEDIA_DIRS): cv.schema_with_slug_keys(Joi.IsDir()),
        Joi.Optional(CONF_LEGACY_TEMPLATES): cv.boolean,
    }
)


/**
 * Put together the default configuration directory based on the OS.
 */
export function get_default_config_dir(): string {
    data_dir = os.getenv("APPDATA") if os.name === "nt" else os.path.expanduser("~")
    return os.path.join(data_dir, CONFIG_DIR_NAME)  // type: ignore
}

/**
 * Ensure a configuration file exists in given configuration directory.

    Creating a default one if needed.
    Return boolean if configuration dir is ready to go.

 */
export async function async_ensure_config_exists(hass: HomeAssistant): boolean {
    config_path = hass.config.path(YAML_CONFIG_FILE)

    if (os.path.isfile(config_path) {
        return true
    }

    print(
        "Unable to find configuration. Creating default one in", hass.config.config_dir
    )
    return await async_create_default_config(hass)
}

/**
 * Create a default configuration file in given configuration directory.

    Return if creation was successful.

 */
export async function async_create_default_config(hass: HomeAssistant): boolean {
    return await hass.async_add_executor_job(
        _write_default_config, hass.config.config_dir
    )
}

/**
 * Write the default config.
 */
export function _write_default_config(config_dir: string): boolean {
    config_path = os.path.join(config_dir, YAML_CONFIG_FILE)
    secret_path = os.path.join(config_dir, SECRET_YAML)
    version_path = os.path.join(config_dir, VERSION_FILE)
    group_yaml_path = os.path.join(config_dir, GROUP_CONFIG_PATH)
    automation_yaml_path = os.path.join(config_dir, AUTOMATION_CONFIG_PATH)
    script_yaml_path = os.path.join(config_dir, SCRIPT_CONFIG_PATH)
    scene_yaml_path = os.path.join(config_dir, SCENE_CONFIG_PATH)

    // Writing files with YAML does not create the most human readable results
    // So we're hard coding a YAML template.
    try {
        with open(config_path, "wt") as config_file:
            config_file.write(DEFAULT_CONFIG)

        with open(secret_path, "wt") as secret_file:
            secret_file.write(DEFAULT_SECRETS)

        with open(version_path, "wt") as version_file:
            version_file.write(__version__)

        with open(group_yaml_path, "wt"):
            pass

        with open(automation_yaml_path, "wt") as fil:
            fil.write("[]")

        with open(script_yaml_path, "wt"):
            pass

        with open(scene_yaml_path, "wt"):
            pass

        return true
    }

    catch (e) {
        if (e instanceof OSError) {
        print("Unable to create default configuration file", config_path)
        return false
        }
        else {
            throw e;
        }
    }

}

/**
 * Load YAML from a Home Assistant configuration file.

    This function allow a component inside the asyncio loop to reload its
    configuration by itthis. Include package merge.

 */
export async function async_hass_config_yaml(hass: HomeAssistant): Dict {
    // Not using async_add_executor_job because this is an internal method.
    config = await hass.loop.run_in_executor(
        null, load_yaml_config_file, hass.config.path(YAML_CONFIG_FILE)
    )
    core_config = config.get(CONF_CORE, {})
    await merge_packages_config(hass, config, core_config.get(CONF_PACKAGES, {}))
    return config
}

/**
 * Parse a YAML configuration file.

    Raises FileNotFoundError or HomeAssistantError.

    This method needs to run in an executor.

 */
export function load_yaml_config_file(config_path: string): Dict<Any, any> {
    conf_dict = load_yaml(config_path)

    if (!conf_dict instanceof dict) {
        msg = (
           `The configuration file ${os.path.basename(config_path)} `
            "does not contain a dictionary"
        )
        _LOGGER.error(msg)
        throw new HomeAssistantError(msg)
    }

    // Convert values to dictionaries if they are null
    for(const key, value of conf_dict.items()) {
        conf_dict[key] = value or {}
    }
    return conf_dict
}

/**
 * Upgrade configuration if necessary.

    This method needs to run in an executor.

 */
export function process_ha_config_upgrade(hass: HomeAssistant) {
    version_path = hass.config.path(VERSION_FILE)

    try {
        with open(version_path) as inp:
            conf_version = inp.readline().strip()
    }
    catch (e) {
        if (e instanceof FileNotFoundError) {
        // Last version to not have this file
        conf_version = "0.7.7"
        }
        else {
            throw e;
        }
    }


    if (conf_version === __version__) {
        return
    }

    _LOGGER.info(
        "Upgrading configuration directory from %s to %s", conf_version, __version__
    )

    version_obj = LooseVersion(conf_version)

    if (version_obj < LooseVersion("0.50") {
        // 0.50 intoduced persistent deps dir.
        lib_path = hass.config.path("deps")
        if (os.path.isdir(lib_path) {
            shutil.rmtree(lib_path)
        }
    }

    if (version_obj < LooseVersion("0.92") {
        // 0.92 moved google/tts.py to google_translate/tts.py
        config_path = hass.config.path(YAML_CONFIG_FILE)

        with open(config_path, encoding="utf-8") as config_file:
            config_raw = config_file.read()

        if (TTS_PRE_92 in config_raw) {
            _LOGGER.info("Migrating google tts to google_translate tts")
            config_raw = config_raw.replace(TTS_PRE_92, TTS_92)
            try {
                with open(config_path, "wt", encoding="utf-8") as config_file:
                    config_file.write(config_raw)
            }
            catch (e) {
                if (e instanceof OSError) {
                _LOGGER.exception("Migrating to google_translate tts failed")
                }
                else {
                    throw e;
                }
            }

        }
    }

    if (version_obj < LooseVersion("0.94") and is_docker_env() {
        // In 0.94 we no longer install packages inside the deps folder when
        // running inside a Docker container.
        lib_path = hass.config.path("deps")
        if (os.path.isdir(lib_path) {
            shutil.rmtree(lib_path)
        }
    }

    with open(version_path, "wt") as outp:
        outp.write(__version__)
}

// @callback
/**
 * Log an error for configuration validation.

    This method must be run in the event loop.

 */
export function async_log_exception(
    ex: Exception,
    domain: string,
    config: Dict,
    hass: HomeAssistant,
    link: Optional<string> = null,
) {
    if (hass is !null) {
        async_notify_setup_error(hass, domain, link)
    }
    message, is_friendly = _format_config_error(ex, domain, config, link)
    _LOGGER.error(message, exc_info=not is_friendly and ex)
}

// @callback
/**
 * Generate log exception for configuration validation.

    This method must be run in the event loop.

 */
export function _format_config_error(
    ex: Exception, domain: string, config: Dict, link: Optional<string> = null
): Tuple<string, boolean> {
    is_friendly = false
    message =`Invalid config for [${domain}]: `
    if (ex instanceof Joi.Invalid) {
        if ("extra keys !allowed" in ex.error_message) {
            path = "->".join(str(m) for m in ex.path)
            message += (
               `[${ex.path[-1]}] is an invalid option for [${domain}]. `
               `Check: ${domain}->${path}.`
            )
        }
        else {
            message +=`${humanize_error(config, ex)}.`
        }
        is_friendly = true
    }
    else {
        message += string(ex) or repr(ex)
    }

    try {
        domain_config = config.get(domain, config)
    }
    catch (e) {
        if (e instanceof AttributeError) {
        domain_config = config
        }
        else {
            throw e;
        }
    }


    message += (
       ` (See ${getattr(domain_config, '__config_file__', '?')}, `
       `line ${getattr(domain_config, '__line__', '?')}). `
    )

    if (domain !== CONF_CORE and link) {
        message +=`Please check the docs at ${link}`
    }

    return message, is_friendly
}

/**
 * Process the [homeassistant] section from the configuration.

    This method is a coroutine.

 */
export async function async_process_ha_core_config(hass: HomeAssistant, config: Dict) {
    config = CORE_CONFIG_SCHEMA(config)

    // Only load auth during startup.
    if (!hasattr(hass, "auth") {
        auth_conf = config.get(CONF_AUTH_PROVIDERS)

        if (!auth_conf) {
            auth_conf = [{"type": "homeassistant"}]
        }

        mfa_conf = config.get(
            CONF_AUTH_MFA_MODULES,
            [{"type": "totp", "id": "totp", "name": "Authenticator app"}],
        )

        setattr(
            hass, "auth", await auth.auth_manager_from_config(hass, auth_conf, mfa_conf)
        )
    }

    await hass.config.async_load()

    hac = hass.config

    if (any(
        k in config
        for k in [
            CONF_LATITUDE,
            CONF_LONGITUDE,
            CONF_NAME,
            CONF_ELEVATION,
            CONF_TIME_ZONE,
            CONF_UNIT_SYSTEM,
            CONF_EXTERNAL_URL,
            CONF_INTERNAL_URL,
        ]
    ) {
        hac.config_source = SOURCE_YAML
    }

    for key, attr in (
        (CONF_LATITUDE, "latitude"),
        (CONF_LONGITUDE, "longitude"),
        (CONF_NAME, "location_name"),
        (CONF_ELEVATION, "elevation"),
        (CONF_INTERNAL_URL, "internal_url"),
        (CONF_EXTERNAL_URL, "external_url"),
        (CONF_MEDIA_DIRS, "media_dirs"),
        (CONF_LEGACY_TEMPLATES, "legacy_templates"),
    ):
        if (key in config) {
            setattr(hac, attr, config[key])
        }

    if (CONF_TIME_ZONE in config) {
        hac.set_time_zone(config[CONF_TIME_ZONE])
    }

    if (CONF_MEDIA_DIRS !in config) {
        if (is_docker_env() {
            hac.media_dirs = {"local": "/media"}
        }
        else {
            hac.media_dirs = {"local": hass.config.path("media")}
        }
    }

    // Init whitelist external dir
    hac.allowlist_external_dirs = {hass.config.path("www"), *hac.media_dirs.values()}
    if (CONF_ALLOWLIST_EXTERNAL_DIRS in config) {
        hac.allowlist_external_dirs.update(set(config[CONF_ALLOWLIST_EXTERNAL_DIRS]))
    }

    else if *(LEGACY_CONF_WHITELIST_EXTERNAL_DIRS in config) {
        _LOGGER.warning(
            "Key %s has been replaced with %s. Please update your config",
            LEGACY_CONF_WHITELIST_EXTERNAL_DIRS,
            CONF_ALLOWLIST_EXTERNAL_DIRS,
        )
        hac.allowlist_external_dirs.update(
            set(config[LEGACY_CONF_WHITELIST_EXTERNAL_DIRS])
        )
    }

    // Init whitelist external URL list – make sure to add / to every URL that doesn't
    // already have it so that we can properly test "path ownership"
    if (CONF_ALLOWLIST_EXTERNAL_URLS in config) {
        hac.allowlist_external_urls.update(
            url if url.endswith("/") else`${url}/`
            for url in config[CONF_ALLOWLIST_EXTERNAL_URLS]
        )
    }

    // Customize
    cust_exact = dict(config[CONF_CUSTOMIZE])
    cust_domain = dict(config[CONF_CUSTOMIZE_DOMAIN])
    cust_glob = OrderedDict(config[CONF_CUSTOMIZE_GLOB])

    for(const name, pkg of config[CONF_PACKAGES].items()) {
        pkg_cust = pkg.get(CONF_CORE)

        if (!pkg_cust) {
            continue
        }

        try {
            pkg_cust = CUSTOMIZE_CONFIG_SCHEMA(pkg_cust)
        }
        catch (e) {
            if (e instanceof Joi.Invalid) {
            _LOGGER.warning("Package %s contains invalid customize", name)
            continue
            }
            else {
                throw e;
            }
        }


        cust_exact.update(pkg_cust[CONF_CUSTOMIZE])
        cust_domain.update(pkg_cust[CONF_CUSTOMIZE_DOMAIN])
        cust_glob.update(pkg_cust[CONF_CUSTOMIZE_GLOB])
    }

    hass.data[DATA_CUSTOMIZE] = EntityValues(cust_exact, cust_domain, cust_glob)

    if (CONF_UNIT_SYSTEM in config) {
        if (config[CONF_UNIT_SYSTEM] === CONF_UNIT_SYSTEM_IMPERIAL) {
            hac.units = IMPERIAL_SYSTEM
        }
        else {
            hac.units = METRIC_SYSTEM
        }
    }
    else if *(CONF_TEMPERATURE_UNIT in config) {
        unit = config[CONF_TEMPERATURE_UNIT]
        hac.units = METRIC_SYSTEM if unit === TEMP_CELSIUS else IMPERIAL_SYSTEM
        _LOGGER.warning(
            "Found deprecated temperature unit in core "
            "configuration expected unit system. Replace '%s: %s' "
            "with '%s: %s'",
            CONF_TEMPERATURE_UNIT,
            unit,
            CONF_UNIT_SYSTEM,
            hac.units.name,
        )
    }
}

/**
 * Log an error while merging packages.
 */
export function _log_pkg_error(package: string, component: string, config: Dict, message: string) {
    message =`Package ${package} setup failed. Integration ${component} ${message}`

    pack_config = config[CONF_CORE][CONF_PACKAGES].get(package, config)
    message += (
       ` (See ${getattr(pack_config, '__config_file__', '?')}:`
       `${getattr(pack_config, '__line__', '?')}). `
    )

    _LOGGER.error(message)
}

/**
 * Extract the schema and identify list or dict based.
 */
export function _identify_config_schema(module: ModuleType): Optional<string> {
    if (!module.CONFIG_SCHEMA instanceof Joi.Schema) {
        return null
    }

    schema = module.CONFIG_SCHEMA.schema  // type: ignore

    if (schema instanceof Joi.All) {
        for(const subschema of schema.validators) {
            if (subschema instanceof dict) {
                schema = subschema
                break
            }
        }
        else {
            return null
        }
    }

    try {
        key = next(k for k in schema if k === module.DOMAIN)  // type: ignore
    }
    catch (e) {
        if (e instanceof (TypeError, AttributeError, StopIteration)) {
        return null
        }
        else {
            throw e;
        }
    }

    catch (e) {  // pylint: disable=broad-except
        if (e instanceof Exception) {
        _LOGGER.exception("Unexpected error identifying config schema")
        return null
        }
        else {
            throw e;
        }
    }


    if (hasattr(key, "default") and !
        key.default instanceof Joi.schema_builder.Undefined
     {
        default_value = module.CONFIG_SCHEMA({module.DOMAIN: key.default()})[  // type: ignore
            module.DOMAIN  // type: ignore
        ]

        if (default_value instanceof dict) {
            return "dict"
        }

        if (default_value instanceof list) {
            return "list"
        }

        return null
    }

    domain_schema = schema[key]

    t_schema = string(domain_schema)
    if t_schema.startswith("{") or "schema_with_slug_keys" in t_schema:
        return "dict"
    if t_schema.startswith(("[", "All(<function ensure_list")):
        return "list"
    return null
}

/**
 * Merge package int conf, recursively.
 */
export function _recursive_merge(conf: Dict<any>, package: Dict<any>): Union<bool, string> {
    error: Union<bool, string> = false
    for(const key, pack_conf of package.items()) {
        if (pack_conf instanceof dict) {
            if (!pack_conf) {
                continue
            }
            conf[key] = conf.get(key, OrderedDict())
            error = _recursive_merge(conf=conf[key], package=pack_conf)
        }

        else if *(pack_conf instanceof list {
            conf[key] = cv.remove_falsy(
                cv.ensure_list(conf.get(key)) + cv.ensure_list(pack_conf)
            )
        }

        else {
            if (conf.get(key) is !null) {
                return key
            }
            conf[key] = pack_conf
        }
    }
    return error
}

/**
 * Merge packages int the top-level configuration. Mutate config.
 */
export async function merge_packages_config(
    hass: HomeAssistant,
    config: Dict,
    packages: Dict<any>,
    _log_pkg_error: Callable = _log_pkg_error,
): Dict {
    PACKAGES_CONFIG_SCHEMA(packages)
    for(const pack_name, pack_conf of packages.items()) {
        for(const comp_name, comp_conf of pack_conf.items()) {
            if (comp_name === CONF_CORE) {
                continue
            }
            // If component name is given with a trailing description, remove it
            // when looking for component
            domain = comp_name.split(" ")[0]

            try {
                integration = await async_get_integration_with_requirements(
                    hass, domain
                )
                component = integration.get_component()
            }
            catch (e) {
                if (e instanceof (IntegrationNotFound, RequirementsNotFound, ImportError) as ex) {
                _log_pkg_error(pack_name, comp_name, config, string(ex))
                continue
                }
                else {
                    throw e;
                }
            }


            merge_list = hasattr(component, "PLATFORM_SCHEMA")

            if (!merge_list and hasattr(component, "CONFIG_SCHEMA") {
                merge_list = _identify_config_schema(component) === "list"
            }

            if (merge_list) {
                config[comp_name] = cv.remove_falsy(
                    cv.ensure_list(config.get(comp_name)) + cv.ensure_list(comp_conf)
                )
                continue
            }

            if (!comp_conf) {
                comp_conf = OrderedDict()
            }

            if (!comp_conf instanceof dict) {
                _log_pkg_error(
                    pack_name, comp_name, config, "cannot be merged. Expected a dict."
                )
                continue
            }

            if (comp_name !in config or !config[comp_name]) {
                config[comp_name] = OrderedDict()
            }

            if (!config[comp_name] instanceof dict) {
                _log_pkg_error(
                    pack_name,
                    comp_name,
                    config,
                    "cannot be merged. Dict expected in main config.",
                )
                continue
            }

            error = _recursive_merge(conf=config[comp_name], package=comp_conf)
            if (error) {
                _log_pkg_error(
                    pack_name, comp_name, config,`has duplicate key '${error}'`
                )
            }
        }
    }

    return config
}

/**
 * Check component configuration and return processed configuration.

    Returns null on error.

    This method must be run in the event loop.

 */
export async function async_process_component_config(
    hass: HomeAssistant, config: Dict, integration: Integration
): Optional<Dict> {
    domain = integration.domain
    try {
        component = integration.get_component()
    }
    catch (e) {
        if (e instanceof ImportError as ex) {
        _LOGGER.error("Unable to import %s: %s", domain, ex)
        return null
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
            _LOGGER.error("Error importing config platform %s: %s", domain, err)
            return null
        }
        else {
            throw e;
        }
    }


    if (config_validator is !null and hasattr(
        config_validator, "async_validate_config"
    ) {
        try {
            return await config_validator.async_validate_config(  // type: ignore
                hass, config
            )
        }
        catch (e) {
            if (e instanceof (Joi.Invalid, HomeAssistantError) as ex) {
            async_log_exception(ex, domain, config, hass, integration.documentation)
            return null
            }
            else {
                throw e;
            }
        }

        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception("Unknown error calling %s config validator", domain)
            return null
            }
            else {
                throw e;
            }
        }

    }

    // No custom config validator, proceed with schema validation
    if (hasattr(component, "CONFIG_SCHEMA") {
        try {
            return component.CONFIG_SCHEMA(config)  // type: ignore
        }
        catch (e) {
            if (e instanceof Joi.Invalid as ex) {
            async_log_exception(ex, domain, config, hass, integration.documentation)
            return null
            }
            else {
                throw e;
            }
        }

        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception("Unknown error calling %s CONFIG_SCHEMA", domain)
            return null
            }
            else {
                throw e;
            }
        }

    }

    component_platform_schema = getattr(
        component, "PLATFORM_SCHEMA_BASE", getattr(component, "PLATFORM_SCHEMA", null)
    )

    if (!component_platform_schema) {
        return config
    }

    platforms = []
    for(const p_name, p_config of config_per_platform(config, domain)) {
        // Validate component specific platform schema
        try {
            p_validated = component_platform_schema(p_config)
        }
        catch (e) {
            if (e instanceof Joi.Invalid as ex) {
            async_log_exception(ex, domain, p_config, hass, integration.documentation)
            continue
            }
            else {
                throw e;
            }
        }

        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception(
                "Unknown error validating %s platform config with %s component platform schema",
                p_name,
                domain,
            )
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
            p_integration = await async_get_integration_with_requirements(hass, p_name)
        }
        catch (e) {
            if (e instanceof (RequirementsNotFound, IntegrationNotFound) as ex) {
            _LOGGER.error("Platform error: %s - %s", domain, ex)
            continue
            }
            else {
                throw e;
            }
        }


        try {
            platform = p_integration.get_platform(domain)
        }
        catch (e) {
            if (e instanceof ImportError) {
            _LOGGER.exception("Platform error: %s", domain)
            continue
            }
            else {
                throw e;
            }
        }


        // Validate platform specific schema
        if (hasattr(platform, "PLATFORM_SCHEMA") {
            try {
                p_validated = platform.PLATFORM_SCHEMA(p_config)  // type: ignore
            }
            catch (e) {
                if (e instanceof Joi.Invalid as ex) {
                async_log_exception(
                    ex,
                   `${domain}.${p_name}`,
                    p_config,
                    hass,
                    p_integration.documentation,
                )
                continue
                }
                else {
                    throw e;
                }
            }

            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception) {
                _LOGGER.exception(
                    "Unknown error validating config for %s platform for %s component with PLATFORM_SCHEMA",
                    p_name,
                    domain,
                )
                continue
                }
                else {
                    throw e;
                }
            }

        }

        platforms.append(p_validated)
    }

    // Create a copy of the configuration with all config for current
    // component removed and add validated config back in.
    config = config_without_domain(config, domain)
    config[domain] = platforms

    return config
}

// @callback
/**
 * Return a config with all configuration for a domain removed.
 */
export function config_without_domain(config: Dict, domain: string): Dict {
    filter_keys = extract_domain_configs(config, domain)
    return {key: value for key, value in config.items() if key * Check if Home Assistant configuration file is valid.

    This method is a coroutine.

 */
export async function async_check_ha_config_file(hass: HomeAssistant): Optional<string> {
    // pylint: disable=import-outside-toplevel
    import homeassistant.helpers.check_config as check_config

    res = await check_config.async_check_ha_config_file(hass)

    if (!res.errors) {
        return null
    }
    return res.error_str
}

// @callback
/**
 * Print a persistent notification.

    This method must be run in the event loop.

 */
export function async_notify_setup_error(
    hass: HomeAssistant, component: string, display_link: Optional<string> = null
) {
    // pylint: disable=import-outside-toplevel
    from homeassistant.components import persistent_notification

    errors = hass.data.get(DATA_PERSISTENT_ERRORS)

    if (!errors) {
        errors = hass.data[DATA_PERSISTENT_ERRORS] = {}
    }

    errors[component] = errors.get(component) or display_link

    message = "The following integrations and platforms could not be set up:\n\n"

    for(const name, link of errors.items()) {
        part =`[${name}](${link})` if link else name
        message +=` - ${part}\n`
    }

    message += "\nPlease check your config and [logs](/config/logs)."

    persistent_notification.async_create(
        hass, message, "Invalid config", "invalid_config"
    )
}
