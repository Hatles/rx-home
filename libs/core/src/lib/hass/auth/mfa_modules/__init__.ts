/**
 * Pluggable auth modules for Home Assistant.
 */
import importlib
import logging
import types
from typing import any, Dict, Optional

import voluptuous as vol
from voluptuous.humanize import humanize_error

from homeassistant import data_entry_flow, requirements
from homeassistant.const import CONF_ID, CONF_NAME, CONF_TYPE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util.decorator import Registry

export const MULTI_FACTOR_AUTH_MODULES = Registry()

export const MULTI_FACTOR_AUTH_MODULE_SCHEMA = Joi.Schema(
    {
        Joi.Required(CONF_TYPE): string,
        Joi.Optional(CONF_NAME): string,
        // Specify ID if you have two mfa auth module for same type.
        Joi.Optional(CONF_ID): string,
    },
    extra=Joi.ALLOW_EXTRA,
)

export const DATA_REQS = "mfa_auth_module_reqs_processed"

const _LOGGER = logging.getLogger(__name__)


/**
 * Multi-factor Auth Module of validation function.
 */
export class MultiFactorAuthModule {

    DEFAULT_TITLE = "Unnamed auth module"
    MAX_RETRY_TIME = 3

    /**
     * Initialize an auth module.
     */
    constructor(hass: HomeAssistant, config: Dict<any>) {
        this.hass = hass
        this.config = config
    }

    // @property
    /**
     * Return id of the auth module.

        Default is same as type

     */
    id(): string {
        return this.config.get(CONF_ID, this.type)
    }

    // @property
    /**
     * Return type of the module.
     */
    type(): string {
        return this.config[CONF_TYPE]  // type: ignore
    }

    // @property
    /**
     * Return the name of the auth module.
     */
    name(): string {
        return this.config.get(CONF_NAME, this.DEFAULT_TITLE)
    }

    // Implement by extending class

    // @property
    /**
     * Return a voluptuous schema to define mfa auth module's input.
     */
    input_schema(): Joi.Schema {
        throw new NotImplementedError
    }

    /**
     * Return a data entry flow handler for setup module.

        Mfa module should extend SetupFlow

     */
    async async_setup_flow(user_id: string): "SetupFlow" {
        throw new NotImplementedError
    }

    /**
     * Set up user for mfa auth module.
     */
    async async_setup_user(user_id: string, setup_data: any): any {
        throw new NotImplementedError
    }

    /**
     * Remove user from mfa module.
     */
    async async_depose_user(user_id: string) {
        throw new NotImplementedError
    }

    /**
     * Return whether user is setup.
     */
    async async_is_user_setup(user_id: string): boolean {
        throw new NotImplementedError
    }

    /**
     * Return true if validation passed.
     */
    async async_validate(user_id: string, user_input: Dict<any>): boolean {
        throw new NotImplementedError
    }
}

/**
 * Handler for the setup flow.
 */
export class SetupFlow extends data_entry_flow.FlowHandler {

    /**
     * Initialize the setup flow.
     */
    constructor(
        auth_module: MultiFactorAuthModule, setup_schema: Joi.Schema, user_id: string
    ) {
        this._auth_module = auth_module
        this._setup_schema = setup_schema
        this._user_id = user_id
    }

    /**
     * Handle the first step of setup flow.

        Return this.async_show_form(step_id='init') if !user_input.
        Return this.async_create_entry(data={'result': result}) if finish.

     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors: Dict<string> = {}

        if (user_input) {
            result = await this._auth_module.async_setup_user(this._user_id, user_input)
            return this.async_create_entry(
                title=this._auth_module.name, data={"result": result}
            )
        }

        return this.async_show_form(
            step_id="init", data_schema=this._setup_schema, errors=errors
        )
    }
}

/**
 * Initialize an auth module from a config.
 */
export async function auth_mfa_module_from_config(
    hass: HomeAssistant, config: Dict<any>
): MultiFactorAuthModule {
    module_name = config[CONF_TYPE]
    module = await _load_mfa_module(hass, module_name)

    try {
        config = module.CONFIG_SCHEMA(config)  // type: ignore
    }
    catch (e) {
        if (e instanceof Joi.Invalid as err) {
        _LOGGER.error(
            "Invalid configuration for multi-factor module %s: %s",
            module_name,
            humanize_error(config, err),
        )
        raise
        }
        else {
            throw e;
        }
    }


    return MULTI_FACTOR_AUTH_MODULES[module_name](hass, config)  // type: ignore
}

/**
 * Load an mfa auth module.
 */
export async function _load_mfa_module(hass: HomeAssistant, module_name: string): types.ModuleType {
    module_path =`homeassistant.auth.mfa_modules.${module_name}`

    try {
        module = importlib.import_module(module_path)
    }
    catch (e) {
        if (e instanceof ImportError as err) {
        _LOGGER.error("Unable to load mfa module %s: %s", module_name, err)
        throw new HomeAssistantError(
           `Unable to load mfa module ${module_name}: ${err}`
        ) from err
        }
        else {
            throw e;
        }
    }


    if (hass.config.skip_pip or !hasattr(module, "REQUIREMENTS") {
        return module
    }

    processed = hass.data.get(DATA_REQS)
    if (processed and module_name in processed) {
        return module
    }

    processed = hass.data[DATA_REQS] = set()

    // https://github.com/python/mypy/issues/1424
    await requirements.async_process_requirements(
        hass, module_path, module.REQUIREMENTS  // type: ignore
    )

    processed.add(module_name)
    return module
}
