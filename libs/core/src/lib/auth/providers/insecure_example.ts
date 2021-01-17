/**
 * Example auth provider.
 */
from collections import OrderedDict
import hmac
from typing import any, Dict, Optional, cast

import voluptuous as vol

from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError

from . import AUTH_PROVIDER_SCHEMA, AUTH_PROVIDERS, AuthProvider, LoginFlow
from ..models import Credentials, UserMeta

export const USER_SCHEMA = vol.Schema(
    {
        vol.Required("username"): string,
        vol.Required("password"): string,
        vol.Optional("name"): string,
    }
)


export const CONFIG_SCHEMA = AUTH_PROVIDER_SCHEMA.extend(
    {vol.Required("users"): [USER_SCHEMA]}, extra=vol.PREVENT_EXTRA
)


/**
 * Raised when submitting invalid authentication.
 */
export class InvalidAuthError extends HomeAssistantError {
}

// @AUTH_PROVIDERS.register("insecure_example")
/**
 * Example auth provider based on hardcoded usernames and passwords.
 */
export class ExampleAuthProvider extends AuthProvider {

    /**
     * Return a flow to login.
     */
    async async_login_flow(context: Optional<Dict>): LoginFlow {
        return ExampleLoginFlow()
    }

    // @callback
    /**
     * Validate a username and password.
     */
    async_validate_login(username: string, password: string) {
        user = null

        // Compare all users to avoid timing attacks.
        for(const usr of this.config["users"]) {
            if (hmac.compare_digest(
                username.encode("utf-8"), usr["username"].encode("utf-8")
            ) {
                user = usr
            }
        }

        if (!user) {
            // Do one more compare to make timing the same as if user was found.
            hmac.compare_digest(password.encode("utf-8"), password.encode("utf-8"))
            throw new InvalidAuthError
        }

        if (!hmac.compare_digest(
            user["password"].encode("utf-8"), password.encode("utf-8")
        ) {
            throw new InvalidAuthError
        }
    }

    /**
     * Get credentials based on the flow result.
     */
    async async_get_or_create_credentials(
        flow_result: Dict<string>
    ): Credentials {
        username = flow_result["username"]

        for(const credential of await this.async_credentials()) {
            if (credential.data["username"] === username) {
                return credential
            }
        }

        // Create new credentials.
        return this.async_create_credentials({"username": username})
    }

    /**
     * Return extra user metadata for credentials.

        Will be used to populate info when creating a new user.

     */
    async async_user_meta_for_credentials(
        credentials: Credentials
    ): UserMeta {
        username = credentials.data["username"]
        name = null

        for(const user of this.config["users"]) {
            if (user["username"] === username) {
                name = user.get("name")
                break
            }
        }

        return UserMeta(name=name, is_active=true)
    }
}

/**
 * Handler for the login flow.
 */
export class ExampleLoginFlow extends LoginFlow {

    /**
     * Handle the step of the form.
     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors = {}

        if (user_input is !null) {
            try {
                cast(ExampleAuthProvider, this._auth_provider).async_validate_login(
                    user_input["username"], user_input["password"]
                )
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
                user_input.pop("password")
                return await this.async_finish(user_input)
            }
        }

        schema: Dict<type> = OrderedDict()
        schema["username"] = string
        schema["password"] = string

        return this.async_show_form(
            step_id="init", data_schema=vol.Schema(schema), errors=errors
        )
    }
}
