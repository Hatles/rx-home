/**
 * Home Assistant auth provider.
 */
import asyncio
import base64
from collections import OrderedDict
import logging
from typing import any, Dict, List, Optional, Set, cast

import bcrypt
import voluptuous as vol

from homeassistant.const import CONF_ID
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError

from . import AUTH_PROVIDER_SCHEMA, AUTH_PROVIDERS, AuthProvider, LoginFlow
from ..models import Credentials, UserMeta

export const STORAGE_VERSION = 1
export const STORAGE_KEY = "auth_provider.homeassistant"


/**
 * Disallow ID in config.
 */
export function _disallow_id(conf: Dict<any>): Dict<any> {
    if (CONF_ID in conf) {
        throw new vol.Invalid("ID is not allowed for the homeassistant auth provider.")
    }

    return conf
}

export const CONFIG_SCHEMA = vol.All(AUTH_PROVIDER_SCHEMA, _disallow_id)


// @callback
/**
 * Get the provider.
 */
export function async_get_provider(hass: HomeAssistant): "HassAuthProvider" {
    for(const prv of hass.auth.auth_providers) {
        if (prv.type === "homeassistant") {
            return cast(HassAuthProvider, prv)
        }
    }

    throw new RuntimeError("Provider not found")
}

/**
 * Raised when we encounter invalid authentication.
 */
export class InvalidAuth extends HomeAssistantError {
}

/**
 * Raised when invalid user is specified.

    Will not be raised when validating authentication.

 */
export class InvalidUser extends HomeAssistantError {
}

/**
 * Hold the user data.
 */
export class Data {

    /**
     * Initialize the user data store.
     */
    constructor(hass: HomeAssistant) {
        this.hass = hass
        this._store = hass.helpers.storage.Store(
            STORAGE_VERSION, STORAGE_KEY, private=true
        )
        this._data: Optional[Dict[str, any]] = null
        // Legacy mode will allow usernames to start/end with whitespace
        // and will compare usernames case-insensitive.
        // Remove in 2020 or when we launch 1.0.
        this.is_legacy = false
    }

    // @callback
    /**
     * Normalize a username based on the mode.
     */
    normalize_username(username: string): string {
        if (this.is_legacy) {
            return username
        }

        return username.strip().casefold()
    }

    /**
     * Load stored data.
     */
    async async_load() {
        data = await this._store.async_load()

        if (!data) {
            data = {"users": []}
        }

        seen: Set<string> = set()

        for(const user of data["users"]) {
            username = user["username"]

            // check if we have duplicates
            folded = username.casefold()

            if (folded in seen) {
                this.is_legacy = true

                logging.getLogger(__name__).warning(
                    "Home Assistant auth provider is running in legacy mode "
                    "because we detected usernames that are case-insensitive"
                    "equivalent. Please change the username: '%s'.",
                    username,
                )

                break
            }

            seen.add(folded)

            // check if we have unstripped usernames
            if (username !== username.strip() {
                this.is_legacy = true

                logging.getLogger(__name__).warning(
                    "Home Assistant auth provider is running in legacy mode "
                    "because we detected usernames that start or end in a "
                    "space. Please change the username: '%s'.",
                    username,
                )

                break
            }
        }

        this._data = data
    }

    // @property
    /**
     * Return users.
     */
    users(): Dict<string>[] {
        return this._data["users"]  // type: ignore
    }

    /**
     * Validate a username and password.

        Raises InvalidAuth if auth invalid.

     */
    validate_login(username: string, password: string) {
        username = this.normalize_username(username)
        dummy = b"$2b$12$CiuFGszHx9eNHxPuQcwBWez4CwDTOcLTX5CbOpV6gef2nYuXkY7BO"
        found = null

        // Compare all users to avoid timing attacks.
        for(const user of this.users) {
            if (this.normalize_username(user["username"]) === username) {
                found = user
            }
        }

        if (!found) {
            // check a hash to make timing the same as if user was found
            bcrypt.checkpw(b"foo", dummy)
            throw new InvalidAuth
        }

        user_hash = base64.b64decode(found["password"])

        // bcrypt.checkpw is timing-safe
        if (!bcrypt.checkpw(password.encode(), user_hash) {
            throw new InvalidAuth
        }
    }

    /**
     * Encode a password.
     */
    hash_password(  // pylint: disable=no-self-use
        password: string, for_storage: boolean = false
    ): bytes {
        hashed: bytes = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))

        if (for_storage) {
            hashed = base64.b64encode(hashed)
        }
        return hashed
    }

    /**
     * Add a new authenticated user/pass.
     */
    add_auth(username: string, password: string) {
        username = this.normalize_username(username)

        if (any(
            this.normalize_username(user["username"]) === username for user in this.users
        ) {
            throw new InvalidUser
        }

        this.users.append(
            {
                "username": username,
                "password": this.hash_password(password, true).decode(),
            }
        )
    }

    // @callback
    /**
     * Remove authentication.
     */
    async_remove_auth(username: string) {
        username = this.normalize_username(username)

        index = null
        for(const i, user of enumerate(this.users)) {
            if (this.normalize_username(user["username"]) === username) {
                index = i
                break
            }
        }

        if (!index) {
            throw new InvalidUser
        }

        this.users.pop(index)
    }

    /**
     * Update the password.

        Raises InvalidUser if user cannot be found.

     */
    change_password(username: string, new_password: string) {
        username = this.normalize_username(username)

        for(const user of this.users) {
            if (this.normalize_username(user["username"]) === username) {
                user["password"] = this.hash_password(new_password, true).decode()
                break
            }
        }
        else {
            throw new InvalidUser
        }
    }

    /**
     * Save data.
     */
    async async_save() {
        await this._store.async_save(this._data)
    }
}

// @AUTH_PROVIDERS.register("homeassistant")
/**
 * Auth provider based on a local storage of users in Home Assistant config dir.
 */
export class HassAuthProvider extends AuthProvider {

    DEFAULT_TITLE = "Home Assistant Local"

    /**
     * Initialize an Home Assistant auth provider.
     */
    constructor(...args: any[], **kwargs: any) {
        super().constructor(*args, **kwargs)
        this.data: Optional<Data> = null
        this._init_lock = asyncio.Lock()
    }

    /**
     * Initialize the auth provider.
     */
    async async_initialize() {
        async with this._init_lock:
            if (this.data is !null) {
                return
            }

            data = Data(this.hass)
            await data.async_load()
            this.data = data
    }

    /**
     * Return a flow to login.
     */
    async async_login_flow(context: Optional<Dict>): Promise<LoginFlow> {
        return HassLoginFlow()
    }

    /**
     * Validate a username and password.
     */
    async async_validate_login(username: string, password: string) {
        if (!this.data) {
            await this.async_initialize()
            assert this.data
        }

        await this.hass.async_add_executor_job(
            this.data.validate_login, username, password
        )
    }

    /**
     * Call add_auth on data.
     */
    async async_add_auth(username: string, password: string) {
        if (!this.data) {
            await this.async_initialize()
            assert this.data
        }

        await this.hass.async_add_executor_job(this.data.add_auth, username, password)
        await this.data.async_save()
    }

    /**
     * Call remove_auth on data.
     */
    async async_remove_auth(username: string) {
        if (!this.data) {
            await this.async_initialize()
            assert this.data
        }

        this.data.async_remove_auth(username)
        await this.data.async_save()
    }

    /**
     * Call change_password on data.
     */
    async async_change_password(username: string, new_password: string) {
        if (!this.data) {
            await this.async_initialize()
            assert this.data
        }

        await this.hass.async_add_executor_job(
            this.data.change_password, username, new_password
        )
        await this.data.async_save()
    }

    /**
     * Get credentials based on the flow result.
     */
    async async_get_or_create_credentials(
        flow_result: Dict<string>
    ): Credentials {
        if (!this.data) {
            await this.async_initialize()
            assert this.data
        }

        norm_username = this.data.normalize_username
        username = norm_username(flow_result["username"])

        for(const credential of await this.async_credentials()) {
            if (norm_username(credential.data["username"]) === username) {
                return credential
            }
        }

        // Create new credentials.
        return this.async_create_credentials({"username": username})
    }

    /**
     * Get extra info for this credential.
     */
    async async_user_meta_for_credentials(
        credentials: Credentials
    ): UserMeta {
        return UserMeta(name=credentials.data["username"], is_active=true)
    }

    /**
     * When credentials get removed, also remove the auth.
     */
    async async_will_remove_credentials(credentials: Credentials) {
        if (!this.data) {
            await this.async_initialize()
            assert this.data
        }

        try {
            this.data.async_remove_auth(credentials.data["username"])
            await this.data.async_save()
        }
        catch (e) {
            if (e instanceof InvalidUser) {
            // Can happen if somehow we didn't clean up a credential
            pass
            }
            else {
                throw e;
            }
        }

    }
}

/**
 * Handler for the login flow.
 */
export class HassLoginFlow extends LoginFlow {

    /**
     * Handle the step of the form.
     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors = {}

        if (user_input is !null) {
            try {
                await cast(HassAuthProvider, this._auth_provider).async_validate_login(
                    user_input["username"], user_input["password"]
                )
            }
            catch (e) {
                if (e instanceof InvalidAuth) {
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
