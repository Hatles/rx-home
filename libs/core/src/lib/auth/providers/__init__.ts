/**
 * Auth providers for Home Assistant.
 */
import importlib
import logging
import types
from typing import any, Dict, List, Optional

import voluptuous as vol
from voluptuous.humanize import humanize_error

from homeassistant import data_entry_flow, requirements
from homeassistant.const import CONF_ID, CONF_NAME, CONF_TYPE
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util
from homeassistant.util.decorator import Registry

from ..auth_store import AuthStore
from ..const import MFA_SESSION_EXPIRATION
from ..models import Credentials, User, UserMeta

const _LOGGER = logging.getLogger(__name__)
export const DATA_REQS = "auth_prov_reqs_processed"

export const AUTH_PROVIDERS = Registry()

export const AUTH_PROVIDER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_TYPE): string,
        vol.Optional(CONF_NAME): string,
        // Specify ID if you have two auth providers for same type.
        vol.Optional(CONF_ID): string,
    },
    extra=vol.ALLOW_EXTRA,
)


/**
 * Provider of user authentication.
 */
export class AuthProvider {

    DEFAULT_TITLE = "Unnamed auth provider"

    /**
     * Initialize an auth provider.
     */
    constructor(
        hass: HomeAssistant, store: AuthStore, config: Dict<any>
    ) {
        this.hass = hass
        this.store = store
        this.config = config
    }

    // @property
    /**
     * Return id of the auth provider.

        Optional, can be null.

     */
    id(): Optional<string> {
        return this.config.get(CONF_ID)
    }

    // @property
    /**
     * Return type of the provider.
     */
    type(): string {
        return this.config[CONF_TYPE]  // type: ignore
    }

    // @property
    /**
     * Return the name of the auth provider.
     */
    name(): string {
        return this.config.get(CONF_NAME, this.DEFAULT_TITLE)
    }

    // @property
    /**
     * Return whether multi-factor auth supported by the auth provider.
     */
    support_mfa(): boolean {
        return true
    }

    /**
     * Return all credentials of this provider.
     */
    async async_credentials(): Credentials[] {
        users = await this.store.async_get_users()
        return [
            credentials
            for user in users
            for credentials in user.credentials
            if (
                credentials.auth_provider_type === this.type
                and credentials.auth_provider_id === this.id
            )
        ]
    }

    // @callback
    /**
     * Create credentials.
     */
    async_create_credentials(data) {
            }
        return Credentials(
            auth_provider_type=this.type, auth_provider_id=this.id, data=data
        )
    }

    // Implement by extending class

    /**
     * Return the data flow for logging in with auth provider.

        Auth provider should extend LoginFlow and return an instance.

     */
    async async_login_flow(context: Optional<Dict>): "LoginFlow" {
        throw new NotImplementedError
    }

    /**
     * Get credentials based on the flow result.
     */
    async async_get_or_create_credentials(
        flow_result: Dict<string>
    ): Credentials {
        throw new NotImplementedError
    }

    /**
     * Return extra user metadata for credentials.

        Will be used to populate info when creating a new user.

     */
    async async_user_meta_for_credentials(
        credentials: Credentials
    ): UserMeta {
        throw new NotImplementedError
    }

    /**
     * Initialize the auth provider.
     */
    async async_initialize() {
    }
}

/**
 * Initialize an auth provider from a config.
 */
export async function auth_provider_from_config(
    hass: HomeAssistant, store: AuthStore, config: Dict<any>
): AuthProvider {
    provider_name = config[CONF_TYPE]
    module = await load_auth_provider_module(hass, provider_name)

    try {
        config = module.CONFIG_SCHEMA(config)  // type: ignore
    }
    catch (e) {
        if (e instanceof vol.Invalid as err) {
        _LOGGER.error(
            "Invalid configuration for auth provider %s: %s",
            provider_name,
            humanize_error(config, err),
        )
        raise
        }
        else {
            throw e;
        }
    }


    return AUTH_PROVIDERS[provider_name](hass, store, config)  // type: ignore
}

/**
 * Load an auth provider.
 */
export async function load_auth_provider_module(
    hass: HomeAssistant, provider: string
): types.ModuleType {
    try {
        module = importlib.import_module`homeassistant.auth.providers.${provider}`)
    }
    catch (e) {
        if (e instanceof ImportError as err) {
        _LOGGER.error("Unable to load auth provider %s: %s", provider, err)
        throw new HomeAssistantError(
           `Unable to load auth provider ${provider}: ${err}`
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

    if (!processed) {
        processed = hass.data[DATA_REQS] = set()
    }
    else if *(provider in processed) {
        return module
    }

    // https://github.com/python/mypy/issues/1424
    reqs = module.REQUIREMENTS  // type: ignore
    await requirements.async_process_requirements(
        hass,`auth provider ${provider}`, reqs
    )

    processed.add(provider)
    return module
}

/**
 * Handler for the login flow.
 */
export class LoginFlow extends data_entry_flow.FlowHandler {

    /**
     * Initialize the login flow.
     */
    constructor(auth_provider: AuthProvider) {
        this._auth_provider = auth_provider
        this._auth_module_id: Optional<string> = null
        this._auth_manager = auth_provider.hass.auth
        this.available_mfa_modules: Dict<string> = {}
        this.created_at = utcnow()
        this.invalid_mfa_times = 0
        this.user: Optional<User> = null
    }

    /**
     * Handle the first step of login flow.

        Return this.async_show_form(step_id='init') if !user_input.
        Return await this.async_finish(flow_result) if login init step pass.

     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        throw new NotImplementedError
    }

    /**
     * Handle the step of select mfa module.
     */
    async async_step_select_mfa_module(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors = {}

        if (user_input is !null) {
            auth_module = user_input.get("multi_factor_auth_module")
            if (auth_module in this.available_mfa_modules) {
                this._auth_module_id = auth_module
                return await this.async_step_mfa()
            }
            errors["base"] = "invalid_auth_module"
        }

        if (this.available_mfa_modules.length === 1) {
            this._auth_module_id = list(this.available_mfa_modules)[0]
            return await this.async_step_mfa()
        }

        return this.async_show_form(
            step_id="select_mfa_module",
            data_schema=vol.Schema(
                {"multi_factor_auth_module": vol.In(this.available_mfa_modules)}
            ),
            errors=errors,
        )
    }

    /**
     * Handle the step of mfa validation.
     */
    async async_step_mfa(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        assert this.user

        errors = {}

        assert this._auth_module_id
        auth_module = this._auth_manager.get_auth_mfa_module(this._auth_module_id)
        if (!auth_module) {
            // Given an invalid input to async_step_select_mfa_module
            // will show invalid_auth_module error
            return await this.async_step_select_mfa_module(user_input={})
        }

        if (!user_input and hasattr(
            auth_module, "async_initialize_login_mfa_step"
        ) {
            try {
                await auth_module.async_initialize_login_mfa_step(  // type: ignore
                    this.user.id
                )
            }
            catch (e) {
                if (e instanceof HomeAssistantError) {
                _LOGGER.exception("Error initializing MFA step")
                return this.async_abort(reason="unknown_error")
                }
                else {
                    throw e;
                }
            }

        }

        if (user_input is !null) {
            expires = this.created_at + MFA_SESSION_EXPIRATION
            if (utcnow() > expires) {
                return this.async_abort(reason="login_expired")
            }

            result = await auth_module.async_validate(this.user.id, user_input)
            if (!result) {
                errors["base"] = "invalid_code"
                this.invalid_mfa_times += 1
                if (this.invalid_mfa_times >= auth_module.MAX_RETRY_TIME > 0) {
                    return this.async_abort(reason="too_many_retry")
                }
            }

            if (!errors) {
                return await this.async_finish(this.user)
            }
        }

        description_placeholders: Dict[str, Optional[str]] = {
            "mfa_module_name": auth_module.name,
            "mfa_module_id": auth_module.id,
        }

        return this.async_show_form(
            step_id="mfa",
            data_schema=auth_module.input_schema,
            description_placeholders=description_placeholders,
            errors=errors,
        )
    }

    /**
     * Handle the pass of login flow.
     */
    async async_finish(flow_result: any): Dict {
        return this.async_create_entry(title=this._auth_provider.name, data=flow_result)
    }
}
