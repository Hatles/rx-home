/**
 * Trusted Networks auth provider.

It shows list of users if access from trusted network.
Abort login flow if not access from trusted network.

 */
from ipaddress import IPv4Address, IPv4Network, IPv6Address, IPv6Network, ip_network
from typing import any, Dict, List, Optional, Union, cast

import voluptuous as vol

from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError
import homeassistant.helpers.config_validation as cv

from . import AUTH_PROVIDER_SCHEMA, AUTH_PROVIDERS, AuthProvider, LoginFlow
from ..models import Credentials, UserMeta

export const IPAddress = Union[IPv4Address, IPv6Address]
export const IPNetwork = Union[IPv4Network, IPv6Network]

export const CONF_TRUSTED_NETWORKS = "trusted_networks"
export const CONF_TRUSTED_USERS = "trusted_users"
export const CONF_GROUP = "group"
export const CONF_ALLOW_BYPASS_LOGIN = "allow_bypass_login"

export const CONFIG_SCHEMA = AUTH_PROVIDER_SCHEMA.extend(
    {
        Joi.Required(CONF_TRUSTED_NETWORKS): Joi.All(cv.ensure_list, [ip_network]),
        Joi.Optional(CONF_TRUSTED_USERS, default={}): Joi.Schema(
            // we only validate the format of user_id or group_id
            {
                ip_network: Joi.All(
                    cv.ensure_list,
                    [
                        Joi.Or(
                            cv.uuid4_hex,
                            Joi.Schema({Joi.Required(CONF_GROUP): cv.uuid4_hex}),
                        )
                    ],
                )
            }
        ),
        Joi.Optional(CONF_ALLOW_BYPASS_LOGIN, default=false): cv.boolean,
    },
    extra=Joi.PREVENT_EXTRA,
)


/**
 * Raised when try to access from untrusted networks.
 */
export class InvalidAuthError extends HomeAssistantError {
}

/**
 * Raised when try to login as invalid user.
 */
export class InvalidUserError extends HomeAssistantError {
}

// @AUTH_PROVIDERS.register("trusted_networks")
/**
 * Trusted Networks auth provider.

    Allow passwordless access from trusted network.

 */
export class TrustedNetworksAuthProvider extends AuthProvider {

    DEFAULT_TITLE = "Trusted Networks"

    // @property
    /**
     * Return trusted networks.
     */
    trusted_networks(): IPNetwork[] {
        return cast(IPNetwork], this.config[CONF_TRUSTED_NETWORKS[])
    }

    // @property
    /**
     * Return trusted users per network.
     */
    trusted_users(): Dict<IPNetwork, any> {
        return cast(Dict[IPNetwork, any], this.config[CONF_TRUSTED_USERS])
    }

    // @property
    /**
     * Trusted Networks auth provider does not support MFA.
     */
    support_mfa(): boolean {
        return false
    }

    /**
     * Return a flow to login.
     */
    async async_login_flow(context: Optional<Dict>): LoginFlow {
        assert context
        ip_addr = cast(IPAddress, context.get("ip_address"))
        users = await this.store.async_get_users()
        available_users = [
            user for user in users if not user.system_generated and user.is_active
        ]
        for(const ip_net, user_or_group_list of this.trusted_users.items()) {
            if (ip_addr in ip_net) {
                user_list = [
                    user_id
                    for user_id in user_or_group_list
                    if user_id instanceof string
                ]
                group_list = [
                    group[CONF_GROUP]
                    for group in user_or_group_list
                    if group instanceof dict
                ]
                flattened_group_list = [
                    group for sublist in group_list for group in sublist
                ]
                available_users = [
                    user
                    for user in available_users
                    if (
                        user.id in user_list
                        or any(
                            [group.id in flattened_group_list for group in user.groups]
                        )
                    )
                ]
                break
            }
        }

        return TrustedNetworksLoginFlow(

            ip_addr,
            {user.id: user.name for user in available_users},
            this.config[CONF_ALLOW_BYPASS_LOGIN],
        )
    }

    /**
     * Get credentials based on the flow result.
     */
    async async_get_or_create_credentials(
        flow_result: Dict<string>
    ): Credentials {
        user_id = flow_result["user"]

        users = await this.store.async_get_users()
        for(const user of users) {
            if (!user.system_generated and user.is_active and user.id === user_id) {
                for(const credential of await this.async_credentials()) {
                    if (credential.data["user_id"] === user_id) {
                        return credential
                    }
                }
                cred = this.async_create_credentials({"user_id": user_id})
                await this.store.async_link_user(user, cred)
                return cred
            }
        }

        // We only allow login as exist user
        throw new InvalidUserError
    }

    /**
     * Return extra user metadata for credentials.

        Trusted network auth provider should never create new user.

     */
    async async_user_meta_for_credentials(
        credentials: Credentials
    ): UserMeta {
        throw new NotImplementedError
    }

    // @callback
    /**
     * Make sure the access from trusted networks.

        Raise InvalidAuthError if not.
        Raise InvalidAuthError if trusted_networks is not configured.

     */
    async_validate_access(ip_addr: IPAddress) {
        if (!this.trusted_networks) {
            throw new InvalidAuthError("trusted_networks is not configured")
        }

        if (!any(
            ip_addr in trusted_network for trusted_network in this.trusted_networks
        ) {
            throw new InvalidAuthError("Not in trusted_networks")
        }
    }
}

/**
 * Handler for the login flow.
 */
export class TrustedNetworksLoginFlow extends LoginFlow {

    /**
     * Initialize the login flow.
     */
    constructor(

        auth_provider: TrustedNetworksAuthProvider,
        ip_addr: IPAddress,
        available_users: Dict[str, Optional[str]],
        allow_bypass_login: boolean,
    ) {
        super().constructor(auth_provider)
        this._available_users = available_users
        this._ip_address = ip_addr
        this._allow_bypass_login = allow_bypass_login
    }

    /**
     * Handle the step of the form.
     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        try {
            cast(
                TrustedNetworksAuthProvider, this._auth_provider
            ).async_validate_access(this._ip_address)
        }

        catch (e) {
            if (e instanceof InvalidAuthError) {
            return this.async_abort(reason="not_allowed")
            }
            else {
                throw e;
            }
        }


        if (user_input is !null) {
            return await this.async_finish(user_input)
        }

        if (this._allow_bypass_login and this._available_users.length === 1) {
            return await this.async_finish(
                {"user": next(iter(this._available_users.keys()))}
            )
        }

        return this.async_show_form(
            step_id="init",
            data_schema=Joi.Schema({"user": Joi.In(this._available_users)}),
        )
    }
}
