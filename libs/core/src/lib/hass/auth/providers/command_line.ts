/**
 * Auth provider that validates credentials via an external command.
 */

import asyncio.subprocess
import collections
import logging
import os
from typing import any, Dict, Optional, cast

import voluptuous as vol

from homeassistant.exceptions import HomeAssistantError

from . import AUTH_PROVIDER_SCHEMA, AUTH_PROVIDERS, AuthProvider, LoginFlow
from ..models import Credentials, UserMeta

export const CONF_COMMAND = "command"
export const CONF_ARGS = "args"
export const CONF_META = "meta"

export const CONFIG_SCHEMA = AUTH_PROVIDER_SCHEMA.extend(
    {
        Joi.Required(CONF_COMMAND): Joi.All(
            string, os.path.normpath, msg="must be an absolute path"
        ),
        Joi.Optional(CONF_ARGS, default=null): Joi.Any(Joi.DefaultTo(list), [str]),
        Joi.Optional(CONF_META, default=false): boolean,
    },
    extra=Joi.PREVENT_EXTRA,
)

const _LOGGER = logging.getLogger(__name__)


/**
 * Raised when authentication with given credentials fails.
 */
export class InvalidAuthError extends HomeAssistantError {
}

// @AUTH_PROVIDERS.register("command_line")
/**
 * Auth provider validating credentials by calling a command.
 */
export class CommandLineAuthProvider extends AuthProvider {

    DEFAULT_TITLE = "Command Line Authentication"

    // which keys to accept from a program's stdout
    ALLOWED_META_KEYS = ("name",)

    /**
     * Extend parent's constructor.

        Adds this._user_meta dictionary to hold the user-specific
        attributes provided by external programs.

     */
    constructor(...args: any[], **kwargs: any) {
        super().constructor(*args, **kwargs)
        this._user_meta: Dict[str, Dict[str, any]] = {}
    }

    /**
     * Return a flow to login.
     */
    async async_login_flow(context: Optional<dict>): LoginFlow {
        return CommandLineLoginFlow()
    }

    /**
     * Validate a username and password.
     */
    async async_validate_login(username: string, password: string) {
        env = {"username": username, "password": password}
        try {
            process = await asyncio.subprocess.create_subprocess_exec(  // pylint: disable=no-member
                this.config[CONF_COMMAND],
                *this.config[CONF_ARGS],
                env=env,
                stdout=asyncio.subprocess.PIPE if this.config[CONF_META] else null,
            )
            stdout, _ = await process.communicate()
        }
        catch (e) {
            if (e instanceof OSError as err) {
            // happens when command doesn't exist or permission is denied
            _LOGGER.error("Error while authenticating %r: %s", username, err)
            throw new InvalidAuthError from err
            }
            else {
                throw e;
            }
        }


        if (process.returncode !== 0) {
            _LOGGER.error(
                "User %r failed to authenticate, command exited with code %d",
                username,
                process.returncode,
            )
            throw new InvalidAuthError
        }

        if (this.config[CONF_META]) {
            meta: Dict<string> = {}
            for(const _line of stdout.splitlines()) {
                try {
                    line = _line.decode().lstrip()
                    if (line.startswith("//") {
                        continue
                    }
                    key, value = line.split("=", 1)
                }
                catch (e) {
                    if (e instanceof ValueError) {
                    // malformed line
                    continue
                    }
                    else {
                        throw e;
                    }
                }

                key = key.strip()
                value = value.strip()
                if (key in this.ALLOWED_META_KEYS) {
                    meta[key] = value
                }
            }
            this._user_meta[username] = meta
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

        Currently, only name is supported.

     */
    async async_user_meta_for_credentials(
        credentials: Credentials
    ): UserMeta {
        meta = this._user_meta.get(credentials.data["username"], {})
        return UserMeta(name=meta.get("name"), is_active=true)
    }
}

/**
 * Handler for the login flow.
 */
export class CommandLineLoginFlow extends LoginFlow {

    /**
     * Handle the step of the form.
     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors = {}

        if (user_input is !null) {
            user_input["username"] = user_input["username"].strip()
            try {
                await cast(
                    CommandLineAuthProvider, this._auth_provider
                ).async_validate_login(user_input["username"], user_input["password"])
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

        schema: Dict<type> = collections.OrderedDict()
        schema["username"] = string
        schema["password"] = string

        return this.async_show_form(
            step_id="init", data_schema=Joi.Schema(schema), errors=errors
        )
    }
}
