/**
 *
Support Legacy API password auth provider.

It will be removed when auth system production ready

 */
import hmac
from typing import any, Dict, Optional, cast

import voluptuous as vol

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
import homeassistant.helpers.config_validation as cv

from . import AUTH_PROVIDER_SCHEMA, AUTH_PROVIDERS, AuthProvider, LoginFlow
from .. import AuthManager
from ..models import Credentials, User, UserMeta

export const AUTH_PROVIDER_TYPE = "legacy_api_password"
export const CONF_API_PASSWORD = "api_password"

export const CONFIG_SCHEMA = AUTH_PROVIDER_SCHEMA.extend(
    {vol.Required(CONF_API_PASSWORD): cv.string}, extra=vol.PREVENT_EXTRA
)

export const LEGACY_USER_NAME = "Legacy API password user"


/**
 * Raised when submitting invalid authentication.
 */
export class InvalidAuthError extends HomeAssistantError {
}

/**
 * Return a user if password is valid. null if not.
 */
export async function async_validate_password(hass: HomeAssistant, password: string): Optional<User> {
    auth = cast(AuthManager, hass.auth)  // type: ignore
    providers = auth.get_auth_providers(AUTH_PROVIDER_TYPE)
    if (!providers) {
        throw new ValueError("Legacy API password provider not found")
    }

    try {
        provider = cast(LegacyApiPasswordAuthProvider, providers[0])
        provider.async_validate_login(password)
        return await auth.async_get_or_create_user(
            await provider.async_get_or_create_credentials({})
        )
    }
    catch (e) {
        if (e instanceof InvalidAuthError) {
        return null
        }
        else {
            throw e;
        }
    }

}

// @AUTH_PROVIDERS.register(AUTH_PROVIDER_TYPE)
/**
 * An auth provider support legacy api_password.
 */
export class LegacyApiPasswordAuthProvider extends AuthProvider {

    DEFAULT_TITLE = "Legacy API Password"

    // @property
    /**
     * Return api_password.
     */
    api_password(): string {
        return string(this.config[CONF_API_PASSWORD])
    }

    /**
     * Return a flow to login.
     */
    async async_login_flow(context: Optional<Dict>): LoginFlow {
        return LegacyLoginFlow()
    }

    // @callback
    /**
     * Validate password.
     */
    async_validate_login(password: string) {
        api_password = string(this.config[CONF_API_PASSWORD])

        if (!hmac.compare_digest(
            api_password.encode("utf-8"), password.encode("utf-8")
        ) {
            throw new InvalidAuthError
        }
    }

    /**
     * Return credentials for this login.
     */
    async async_get_or_create_credentials(
        flow_result: Dict<string>
    ): Credentials {
        credentials = await this.async_credentials()
        if (credentials) {
            return credentials[0]
        }

        return this.async_create_credentials({})
    }

    /**
     *
        Return info for the user.

        Will be used to populate info when creating a new user.

     */
    async async_user_meta_for_credentials(
        credentials: Credentials
    ): UserMeta {
        return UserMeta(name=LEGACY_USER_NAME, is_active=true)
    }
}

/**
 * Handler for the login flow.
 */
export class LegacyLoginFlow extends LoginFlow {

    /**
     * Handle the step of the form.
     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors = {}

        if (user_input is !null) {
            try {
                cast(
                    LegacyApiPasswordAuthProvider, this._auth_provider
                ).async_validate_login(user_input["password"])
            }
            catch (e) {
                if (e instanceof InvalidAuthError) {
                errors["base"] = "invalid_auth"
                }
                else {
                    throw e;
                }
            }


            if (!errors) {
                return await this.async_finish({})
            }
        }

        return this.async_show_form(
            step_id="init", data_schema=vol.Schema({"password": string}), errors=errors
        )
    }
}
