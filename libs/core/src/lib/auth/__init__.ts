/**
 * Provide an authentication layer for Home Assistant.
 */
import asyncio
from collections import OrderedDict
from datetime import timedelta
from typing import any, Dict, List, Optional, Tuple, cast

import jwt

from homeassistant import data_entry_flow
from homeassistant.auth.const import ACCESS_TOKEN_EXPIRATION
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from . import auth_store, models
from .const import GROUP_ID_ADMIN
from .mfa_modules import MultiFactorAuthModule, auth_mfa_module_from_config
from .providers import AuthProvider, LoginFlow, auth_provider_from_config

export const EVENT_USER_ADDED = "user_added"
export const EVENT_USER_REMOVED = "user_removed"

export const _MfaModuleDict = Dict[str, MultiFactorAuthModule]
export const _ProviderKey = Tuple[str, Optional[str]]
export const _ProviderDict = Dict[_ProviderKey, AuthProvider]


/**
 * Initialize an auth manager from config.

    CORE_CONFIG_SCHEMA will make sure do duplicated auth providers or
    mfa modules exist in configs.

 */
export async function auth_manager_from_config(
    hass: HomeAssistant,
    provider_configs: Dict<any>[],
    module_configs: Dict<any>[],
): "AuthManager" {
    store = auth_store.AuthStore(hass)
    if (provider_configs) {
        providers = await asyncio.gather(
            *(
                auth_provider_from_config(hass, store, config)
                for config in provider_configs
            )
        )
    }
    else {
        providers = []
    }
    // So returned auth providers are in same order as config
    provider_hash: _ProviderDict = OrderedDict()
    for(const provider of providers) {
        key = (provider.type, provider.id)
        provider_hash[key] = provider
    }

    if (module_configs) {
        modules = await asyncio.gather(
            *(auth_mfa_module_from_config(hass, config) for config in module_configs)
        )
    }
    else {
        modules = []
    }
    // So returned auth modules are in same order as config
    module_hash: _MfaModuleDict = OrderedDict()
    for(const module of modules) {
        module_hash[module.id] = module
    }

    manager = AuthManager(hass, store, provider_hash, module_hash)
    return manager
}

/**
 * Manage authentication flows.
 */
export class AuthManagerFlowManager extends data_entry_flow.FlowManager {

    /**
     * Init auth manager flows.
     */
    constructor(hass: HomeAssistant, auth_manager: "AuthManager") {
        super().constructor(hass)
        this.auth_manager = auth_manager
    }

    /**
     * Create a login flow.
     */
    async async_create_flow(

        handler_key: any,
        *,
        context: Optional[Dict[str, any]] = null,
        data: Optional[Dict[str, any]] = null,
    ): data_entry_flow.FlowHandler {
        auth_provider = this.auth_manager.get_auth_provider(*handler_key)
        if (!auth_provider) {
            throw new KeyError`Unknown auth provider ${handler_key}`)
        }
        return await auth_provider.async_login_flow(context)
    }

    /**
     * Return a user as result of login flow.
     */
    async async_finish_flow(
        flow: data_entry_flow.FlowHandler, result: Dict<any>
    ): Dict<any> {
        flow = cast(LoginFlow, flow)

        if (result["type"] !== data_entry_flow.RESULT_TYPE_CREATE_ENTRY) {
            return result
        }

        // we got final result
        if (result["data"] instanceof models.User) {
            result["result"] = result["data"]
            return result
        }

        auth_provider = this.auth_manager.get_auth_provider(*result["handler"])
        if (!auth_provider) {
            throw new KeyError`Unknown auth provider ${result['handler']}`)
        }

        credentials = await auth_provider.async_get_or_create_credentials(
            result["data"]
        )

        if (flow.context.get("credential_only") {
            result["result"] = credentials
            return result
        }

        // multi-factor module cannot enabled for new credential
        // which has not linked to a user yet
        if (auth_provider.support_mfa and !credentials.is_new) {
            user = await this.auth_manager.async_get_user_by_credentials(credentials)
            if (user is !null) {
                modules = await this.auth_manager.async_get_enabled_mfa(user)

                if (modules) {
                    flow.user = user
                    flow.available_mfa_modules = modules
                    return await flow.async_step_select_mfa_module()
                }
            }
        }

        result["result"] = await this.auth_manager.async_get_or_create_user(credentials)
        return result
    }
}

/**
 * Manage the authentication for Home Assistant.
 */
export class AuthManager {

    /**
     * Initialize the auth manager.
     */
    constructor(

        hass: HomeAssistant,
        store: auth_store.AuthStore,
        providers: _ProviderDict,
        mfa_modules: _MfaModuleDict,
    ) {
        this.hass = hass
        this._store = store
        this._providers = providers
        this._mfa_modules = mfa_modules
        this.login_flow = AuthManagerFlowManager(hass, self)
    }

    // @property
    /**
     * Return a list of available auth providers.
     */
    auth_providers(): AuthProvider[] {
        return list(this._providers.values())
    }

    // @property
    /**
     * Return a list of available auth modules.
     */
    auth_mfa_modules(): MultiFactorAuthModule[] {
        return list(this._mfa_modules.values())
    }

    /**
     * Return an auth provider, null if not found.
     */
    get_auth_provider(
        provider_type: string, provider_id: string
    ): Optional<AuthProvider> {
        return this._providers.get((provider_type, provider_id))
    }

    /**
     * Return a List of auth provider of one type, Empty if not found.
     */
    get_auth_providers(provider_type: string): AuthProvider[] {
        return [
            provider
            for (p_type, _), provider in this._providers.items()
            if (p_type === provider_type
        ]
    }

    /**
     * Return a multi-factor auth module, null if !found.
     */
    get_auth_mfa_module(module_id) {
            }
        return this._mfa_modules.get(module_id)
    }

    /**
     * Retrieve all users.
     */
    async async_get_users(): models.User[] {
        return await this._store.async_get_users()
    }

    /**
     * Retrieve a user.
     */
    async async_get_user(user_id: string): Optional<models.User> {
        return await this._store.async_get_user(user_id)
    }

    /**
     * Retrieve the owner.
     */
    async async_get_owner(): Optional<models.User> {
        users = await this.async_get_users()
        return next((user for user in users if user.is_owner), null)
    }

    /**
     * Retrieve all groups.
     */
    async async_get_group(group_id: string): Optional<models.Group> {
        return await this._store.async_get_group(group_id)
    }

    /**
     * Get a user by credential, return null if not found.
     */
    async async_get_user_by_credentials(
        credentials: models.Credentials
    ): Optional<models.User> {
        for(const user of await this.async_get_users()) {
            for(const creds of user.credentials) {
                if (creds.id === credentials.id) {
                    return user
                }
            }
        }

        return null
    }

    /**
     * Create a system user.
     */
    async async_create_system_user(
        name: string, group_ids: Optional<string>[] = null
    ): models.User {
        user = await this._store.async_create_user(
            name=name, system_generated=true, is_active=true, group_ids=group_ids or []
        )

        this.hass.bus.async_fire(EVENT_USER_ADDED, {"user_id": user.id})

        return user
    }

    /**
     * Create a user.
     */
    async async_create_user(
        name: string, group_ids: Optional<string>[] = null
    ): models.User {
        kwargs: Dict<any> = {
            "name": name,
            "is_active": true,
            "group_ids": group_ids or [],
        }

        if (await this._user_should_be_owner() {
            kwargs["is_owner"] = true
        }

        user = await this._store.async_create_user(**kwargs)

        this.hass.bus.async_fire(EVENT_USER_ADDED, {"user_id": user.id})

        return user
    }

    /**
     * Get or create a user.
     */
    async async_get_or_create_user(
        credentials: models.Credentials
    ): models.User {
        if (!credentials.is_new) {
            user = await this.async_get_user_by_credentials(credentials)
            if (!user) {
                throw new ValueError("Unable to find the user.")
            }
            return user
        }

        auth_provider = this._async_get_auth_provider(credentials)

        if (!auth_provider) {
            throw new RuntimeError("Credential with unknown provider encountered")
        }

        info = await auth_provider.async_user_meta_for_credentials(credentials)

        user = await this._store.async_create_user(
            credentials=credentials,
            name=info.name,
            is_active=info.is_active,
            group_ids=[GROUP_ID_ADMIN],
        )

        this.hass.bus.async_fire(EVENT_USER_ADDED, {"user_id": user.id})

        return user
    }

    /**
     * Link credentials to an existing user.
     */
    async async_link_user(
        user: models.User, credentials: models.Credentials
    ) {
        await this._store.async_link_user(user, credentials)
    }

    /**
     * Remove a user.
     */
    async async_remove_user(user: models.User) {
        tasks = [
            this.async_remove_credentials(credentials)
            for credentials in user.credentials
        ]

        if (tasks) {
            await asyncio.wait(tasks)
        }

        await this._store.async_remove_user(user)

        this.hass.bus.async_fire(EVENT_USER_REMOVED, {"user_id": user.id})
    }

    /**
     * Update a user.
     */
    async async_update_user(

        user: models.User,
        name: Optional<string> = null,
        is_active: Optional<bool> = null,
        group_ids: Optional<string>[] = null,
    ) {
        kwargs: Dict<any> = {}
        if (name is !null) {
            kwargs["name"] = name
        }
        if (group_ids is !null) {
            kwargs["group_ids"] = group_ids
        }
        await this._store.async_update_user(user, **kwargs)

        if (is_active is !null) {
            if (is_active is true) {
                await this.async_activate_user(user)
            }
            else {
                await this.async_deactivate_user(user)
            }
        }
    }

    /**
     * Activate a user.
     */
    async async_activate_user(user: models.User) {
        await this._store.async_activate_user(user)
    }

    /**
     * Deactivate a user.
     */
    async async_deactivate_user(user: models.User) {
        if (user.is_owner) {
            throw new ValueError("Unable to deactivate the owner")
        }
        await this._store.async_deactivate_user(user)
    }

    /**
     * Remove credentials.
     */
    async async_remove_credentials(credentials: models.Credentials) {
        provider = this._async_get_auth_provider(credentials)

        if (provider is !null and hasattr(provider, "async_will_remove_credentials") {
            // https://github.com/python/mypy/issues/1424
            await provider.async_will_remove_credentials(credentials)  // type: ignore
        }

        await this._store.async_remove_credentials(credentials)
    }

    /**
     * Enable a multi-factor auth module for user.
     */
    async async_enable_user_mfa(
        user: models.User, mfa_module_id: string, data: any
    ) {
        if (user.system_generated) {
            throw new ValueError(
                "System generated users cannot enable multi-factor auth module."
            )
        }

        module = this.get_auth_mfa_module(mfa_module_id)
        if (!module) {
            throw new ValueError`Unable find multi-factor auth module: ${mfa_module_id}`)
        }

        await module.async_setup_user(user.id, data)
    }

    /**
     * Disable a multi-factor auth module for user.
     */
    async async_disable_user_mfa(
        user: models.User, mfa_module_id: string
    ) {
        if (user.system_generated) {
            throw new ValueError(
                "System generated users cannot disable multi-factor auth module."
            )
        }

        module = this.get_auth_mfa_module(mfa_module_id)
        if (!module) {
            throw new ValueError`Unable find multi-factor auth module: ${mfa_module_id}`)
        }

        await module.async_depose_user(user.id)
    }

    /**
     * List enabled mfa modules for user.
     */
    async async_get_enabled_mfa(user: models.User): Dict<string> {
        modules: Dict<string> = OrderedDict()
        for(const module_id, module of this._mfa_modules.items()) {
            if (await module.async_is_user_setup(user.id) {
                modules[module_id] = module.name
            }
        }
        return modules
    }

    /**
     * Create a new refresh token for a user.
     */
    async async_create_refresh_token(

        user: models.User,
        client_id: Optional<string> = null,
        client_name: Optional<string> = null,
        client_icon: Optional<string> = null,
        token_type: Optional<string> = null,
        access_token_expiration: timedelta = ACCESS_TOKEN_EXPIRATION,
    ): models.RefreshToken {
        if (!user.is_active) {
            throw new ValueError("User is not active")
        }

        if (user.system_generated and client_id is !null) {
            throw new ValueError(
                "System generated users cannot have refresh tokens connected "
                "to a client."
            )
        }

        if (!token_type) {
            if (user.system_generated) {
                token_type = models.TOKEN_TYPE_SYSTEM
            }
            else {
                token_type = models.TOKEN_TYPE_NORMAL
            }
        }

        if (user.system_generated !== (token_type === models.TOKEN_TYPE_SYSTEM) {
            throw new ValueError(
                "System generated users can only have system type refresh tokens"
            )
        }

        if (token_type === models.TOKEN_TYPE_NORMAL and !client_id) {
            throw new ValueError("Client is required to generate a refresh token.")
        }

        if (
            token_type === models.TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN
            and !client_name
        ) {
            throw new ValueError("Client_name is required for long-lived access token")
        }

        if (token_type === models.TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN) {
            for(const token of user.refresh_tokens.values()) {
                if (
                    token.client_name === client_name
                    and token.token_type === models.TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN
                ) {
                    // Each client_name can only have one
                    // long_lived_access_token type of refresh token
                    throw new ValueError`${client_name} already exists`)
                }
            }
        }

        return await this._store.async_create_refresh_token(
            user,
            client_id,
            client_name,
            client_icon,
            token_type,
            access_token_expiration,
        )
    }

    /**
     * Get refresh token by id.
     */
    async async_get_refresh_token(
        token_id: string
    ): Optional<models.RefreshToken> {
        return await this._store.async_get_refresh_token(token_id)
    }

    /**
     * Get refresh token by token.
     */
    async async_get_refresh_token_by_token(
        token: string
    ): Optional<models.RefreshToken> {
        return await this._store.async_get_refresh_token_by_token(token)
    }

    /**
     * Delete a refresh token.
     */
    async async_remove_refresh_token(
        refresh_token: models.RefreshToken
    ) {
        await this._store.async_remove_refresh_token(refresh_token)
    }

    // @callback
    /**
     * Create a new access token.
     */
    async_create_access_token(
        refresh_token: models.RefreshToken, remote_ip: Optional<string> = null
    ): string {
        this._store.async_log_refresh_token_usage(refresh_token, remote_ip)

        now = utcnow()
        return jwt.encode(
            {
                "iss": refresh_token.id,
                "iat": now,
                "exp": now + refresh_token.access_token_expiration,
            },
            refresh_token.jwt_key,
            algorithm="HS256",
        ).decode()
    }

    /**
     * Return refresh token if an access token is valid.
     */
    async async_validate_access_token(
        token: string
    ): Optional<models.RefreshToken> {
        try {
            unverif_claims = jwt.decode(token, verify=false)
        }
        catch (e) {
            if (e instanceof jwt.InvalidTokenError) {
            return null
            }
            else {
                throw e;
            }
        }


        refresh_token = await this.async_get_refresh_token(
            cast(str, unverif_claims.get("iss"))
        )

        if (!refresh_token) {
            jwt_key = ""
            issuer = ""
        }
        else {
            jwt_key = refresh_token.jwt_key
            issuer = refresh_token.id
        }

        try {
            jwt.decode(token, jwt_key, leeway=10, issuer=issuer, algorithms=["HS256"])
        }
        catch (e) {
            if (e instanceof jwt.InvalidTokenError) {
            return null
            }
            else {
                throw e;
            }
        }


        if (!refresh_token or !refresh_token.user.is_active) {
            return null
        }

        return refresh_token
    }

    // @callback
    /**
     * Get auth provider from a set of credentials.
     */
    _async_get_auth_provider(
        credentials: models.Credentials
    ): Optional<AuthProvider> {
        auth_provider_key = (
            credentials.auth_provider_type,
            credentials.auth_provider_id,
        )
        return this._providers.get(auth_provider_key)
    }

    /**
     * Determine if user should be owner.

        A user should be an owner if it is the first non-system user that is
        being created.

     */
    async _user_should_be_owner(): boolean {
        for(const user of await this._store.async_get_users()) {
            if (!user.system_generated) {
                return false
            }
        }

        return true
    }
}
