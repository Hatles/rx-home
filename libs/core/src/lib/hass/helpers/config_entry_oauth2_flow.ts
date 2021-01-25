/**
 * Config Flow using OAuth2.

This module exists of the following parts:
 - OAuth2 config flow which supports multiple OAuth2 implementations
 - OAuth2 implementation that works with local provided client ID/secret


 */
from abc import ABC, ABCMeta, abstractmethod
import asyncio
import logging
import secrets
import time
from typing import any, Awaitable, Callable, Dict, Optional, cast

from aiohttp import client, web
import async_timeout
import jwt
import voluptuous as vol
from yarl import URL

from homeassistant import config_entries
from homeassistant.components import http
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.network import NoURLAvailableError

from .aiohttp_client import async_get_clientsession

const _LOGGER = logging.getLogger(__name__)

export const DATA_JWT_SECRET = "oauth2_jwt_secret"
export const DATA_VIEW_REGISTERED = "oauth2_view_reg"
export const DATA_IMPLEMENTATIONS = "oauth2_impl"
export const DATA_PROVIDERS = "oauth2_providers"
export const AUTH_CALLBACK_PATH = "/auth/external/callback"
export const HEADER_FRONTEND_BASE = "HA-Frontend-Base"

export const CLOCK_OUT_OF_SYNC_MAX_SEC = 20


class AbstractOAuth2Implementation(ABC):
    """Base class to abstract OAuth2 authentication."""

    // @property
    // @abstractmethod
    /**
     * Name of the implementation.
     */
    name(): string {
    }

    // @property
    // @abstractmethod
    /**
     * Domain that is providing the implementation.
     */
    domain(): string {
    }

    // @abstractmethod
    /**
     * Generate a url for the user to authorize.

        This step is called when a config flow is initialized. It should redirect the
        user to the vendor website where they can authorize Home Assistant.

        The implementation is responsible to get notified when the user is authorized
        and pass this to the specified config flow. Do as little work as possible once
        notified. You can do the work inside async_resolve_external_data. This will
        give the best UX.

        Pass external data in with:

        await hass.config_entries.flow.async_configure(
            flow_id=flow_id, user_input={'code': 'abcd', 'state': { … }
        )


     */
    async async_generate_authorize_url(flow_id: string): string {
    }

    // @abstractmethod
    /**
     * Resolve external data to tokens.

        Turn the data that the implementation passed to the config flow as external
        step data int tokens. These tokens will be stored as 'token' in the
        config entry data.

     */
    async async_resolve_external_data(external_data: any): dict {
    }

    /**
     * Refresh a token and update expires info.
     */
    async async_refresh_token(token: dict): dict {
        new_token = await this._async_refresh_token(token)
        // Force number for non-compliant oauth2 providers
        new_token["expires_in"] = number(new_token["expires_in"])
        new_token["expires_at"] = time.time() + new_token["expires_in"]
        return new_token
    }

    // @abstractmethod
    /**
     * Refresh a token.
     */
    async _async_refresh_token(token: dict): dict {
    }


class LocalOAuth2Implementation(AbstractOAuth2Implementation):
    """Local OAuth2 implementation."""

    /**
     * Initialize local auth implementation.
     */
    constructor(

        hass: HomeAssistant,
        domain: string,
        client_id: string,
        client_secret: string,
        authorize_url: string,
        token_url: string,
    ) {
        this.hass = hass
        this._domain = domain
        this.client_id = client_id
        this.client_secret = client_secret
        this.authorize_url = authorize_url
        this.token_url = token_url
    }

    // @property
    /**
     * Name of the implementation.
     */
    name(): string {
        return "Configuration.yaml"
    }

    // @property
    /**
     * Domain providing the implementation.
     */
    domain(): string {
        return this._domain
    }

    // @property
    /**
     * Return the redirect uri.
     */
    redirect_uri(): string {
        req = http.current_request.get()

        if (!req) {
            throw new RuntimeError("No current request in context")
        }

        ha_host = req.headers.get(HEADER_FRONTEND_BASE)

        if (!ha_host) {
            throw new RuntimeError("No header in request")
        }

        return`${ha_host}${AUTH_CALLBACK_PATH}`
    }

    // @property
    /**
     * Extra data that needs to be appended to the authorize url.
     */
    extra_authorize_data(): dict {
        return {}
    }

    /**
     * Generate a url for the user to authorize.
     */
    async async_generate_authorize_url(flow_id: string): string {
        redirect_uri = this.redirect_uri
        return string(
            URL(this.authorize_url)
            .with_query(
                {
                    "response_type": "code",
                    "client_id": this.client_id,
                    "redirect_uri": redirect_uri,
                    "state": _encode_jwt(
                        this.hass, {"flow_id": flow_id, "redirect_uri": redirect_uri}
                    ),
                }
            )
            .update_query(this.extra_authorize_data)
        )
    }

    /**
     * Resolve the authorization code to tokens.
     */
    async async_resolve_external_data(external_data: any): dict {
        return await this._token_request(
            {
                "grant_type": "authorization_code",
                "code": external_data["code"],
                "redirect_uri": external_data["state"]["redirect_uri"],
            }
        )
    }

    /**
     * Refresh tokens.
     */
    async _async_refresh_token(token: dict): dict {
        new_token = await this._token_request(
            {
                "grant_type": "refresh_token",
                "client_id": this.client_id,
                "refresh_token": token["refresh_token"],
            }
        )
        return {**token, **new_token}
    }

    /**
     * Make a token request.
     */
    async _token_request(data: dict): dict {
        session = async_get_clientsession(this.hass)

        data["client_id"] = this.client_id

        if (this.client_secret is !null) {
            data["client_secret"] = this.client_secret
        }

        resp = await session.post(this.token_url, data=data)
        if (resp.status >= 400 and _LOGGER.isEnabledFor(logging.DEBUG) {
            body = await resp.text()
            _LOGGER.debug(
                "Token request failed with status=%s, body=%s",
                resp.status,
                body,
            )
        }
        resp.raise_for_status()
        return cast(dict, await resp.json())
    }


class AbstractOAuth2FlowHandler(config_entries.ConfigFlow, metaclass=ABCMeta):
    """Handle a config flow."""

    DOMAIN = ""

    VERSION = 1
    CONNECTION_CLASS = config_entries.CONN_CLASS_UNKNOWN

    /**
     * Instantiate config flow.
     */
    constructor() {
        if (this.DOMAIN === "") {
            throw new TypeError(
               `Can't instantiate class ${this.__class__.__name__} without DOMAIN being set`
            )
        }

        this.external_data: any = null
        this.flow_impl: AbstractOAuth2Implementation = null  // type: ignore
    }

    // @property
    // @abstractmethod
    /**
     * Return logger.
     */
    logger(): logging.Logger {
    }

    // @property
    /**
     * Extra data that needs to be appended to the authorize url.
     */
    extra_authorize_data(): dict {
        return {}
    }

    /**
     * Handle a flow start.
     */
    async async_step_pick_implementation(
        user_input: Optional<dict> = null
    ): dict {
        assert this.hass
        implementations = await async_get_implementations(this.hass, this.DOMAIN)

        if (user_input is !null) {
            this.flow_impl = implementations[user_input["implementation"]]
            return await this.async_step_auth()
        }

        if (!implementations) {
            return this.async_abort(reason="missing_configuration")
        }

        if (implementations.length === 1) {
            // Pick first implementation as we have only one.
            this.flow_impl = list(implementations.values())[0]
            return await this.async_step_auth()
        }

        return this.async_show_form(
            step_id="pick_implementation",
            data_schema=Joi.Schema(
                {
                    Joi.Required(
                        "implementation", default=list(implementations)[0]
                    ): Joi.In({key: impl.name for key, impl in implementations.items()})
                }
            ),
        )
    }

    /**
     * Create an entry for auth.
     */
    async async_step_auth(
        user_input: Optional[Dict[str, any]] = null
    ): Dict<any> {
        // Flow has been triggered by external data
        if (user_input) {
            this.external_data = user_input
            return this.async_external_step_done(next_step_id="creation")
        }

        try {
            with async_timeout.timeout(10):
                url = await this.flow_impl.async_generate_authorize_url(this.flow_id)
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            return this.async_abort(reason="authorize_url_timeout")
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof NoURLAvailableError) {
            return this.async_abort(
                reason="no_url_available",
                description_placeholders={
                    "docs_url": "https://www.home-assistant.io/more-info/no-url-available"
                },
            )
            }
            else {
                throw e;
            }
        }


        url = string(URL(url).update_query(this.extra_authorize_data))

        return this.async_external_step(step_id="auth", url=url)
    }

    /**
     * Create config entry from external data.
     */
    async async_step_creation(
        user_input: Optional[Dict[str, any]] = null
    ): Dict<any> {
        token = await this.flow_impl.async_resolve_external_data(this.external_data)
        // Force number for non-compliant oauth2 providers
        try {
            token["expires_in"] = number(token["expires_in"])
        }
        catch (e) {
            if (e instanceof ValueError as err) {
            _LOGGER.warning("Error converting expires_in to number: %s", err)
            return this.async_abort(reason="oauth_error")
            }
            else {
                throw e;
            }
        }

        token["expires_at"] = time.time() + token["expires_in"]

        this.logger.info("Successfully authenticated")

        return await this.async_oauth_create_entry(
            {"auth_implementation": this.flow_impl.domain, "token": token}
        )
    }

    /**
     * Create an entry for the flow.

        Ok to override if you want to fetch extra info or even add another step.

     */
    async async_oauth_create_entry(data: dict): dict {
        return this.async_create_entry(title=this.flow_impl.name, data=data)
    }

    /**
     * Handle a flow initialized by discovery.
     */
    async async_step_discovery(
        discovery_info: Dict<any>
    ): Dict<any> {
        await this.async_set_unique_id(this.DOMAIN)

        assert this.hass
        if (this.hass.config_entries.async_entries(this.DOMAIN) {
            return this.async_abort(reason="already_configured")
        }

        return await this.async_step_pick_implementation()
    }

    async_step_user = async_step_pick_implementation
    async_step_mqtt = async_step_discovery
    async_step_ssdp = async_step_discovery
    async_step_zeroconf = async_step_discovery
    async_step_homekit = async_step_discovery
    async_step_dhcp = async_step_discovery

    // @classmethod
    /**
     * Register a local implementation.
     */
    async_register_implementation(
        cls, hass: HomeAssistant, local_impl: LocalOAuth2Implementation
    ) {
        async_register_implementation(hass, cls.DOMAIN, local_impl)
    }


// @callback
/**
 * Register an OAuth2 flow implementation for an integration.
 */
export function async_register_implementation(
    hass: HomeAssistant, domain: string, implementation: AbstractOAuth2Implementation
) {
    if (implementation instanceof LocalOAuth2Implementation and !hass.data.get(
        DATA_VIEW_REGISTERED, false
    ) {
        hass.http.register_view(OAuth2AuthorizeCallbackView())  // type: ignore
        hass.data[DATA_VIEW_REGISTERED] = true
    }

    implementations = hass.data.setdefault(DATA_IMPLEMENTATIONS, {})
    implementations.setdefault(domain, {})[implementation.domain] = implementation
}

async def async_get_implementations(
    hass: HomeAssistant, domain: string
) -> Dict[str, AbstractOAuth2Implementation]:
    """Return OAuth2 implementations for specified domain."""
    registered = cast(
        Dict[str, AbstractOAuth2Implementation],
        hass.data.setdefault(DATA_IMPLEMENTATIONS, {}).get(domain, {}),
    )

    if (DATA_PROVIDERS !in hass.data) {
        return registered
    }

    registered = dict(registered)

    for(const provider_domain, get_impl of hass.data[DATA_PROVIDERS].items()) {
        implementation = await get_impl(hass, domain)
        if (implementation is !null) {
            registered[provider_domain] = implementation
        }
    }

    return registered


async def async_get_config_entry_implementation(
    hass: HomeAssistant, config_entry: config_entries.ConfigEntry
) -> AbstractOAuth2Implementation:
    """Return the implementation for this config entry."""
    implementations = await async_get_implementations(hass, config_entry.domain)
    implementation = implementations.get(config_entry.data["auth_implementation"])

    if (!implementation) {
        throw new ValueError("Implementation not available")
    }

    return implementation


// @callback
/**
 * Add an implementation provider.

    If no implementation found, return null.

 */
export function async_add_implementation_provider(
    hass: HomeAssistant,
    provider_domain: string,
    async_provide_implementation: Callable[
        [HomeAssistant, string], Awaitable[Optional[AbstractOAuth2Implementation]]
    ],
) {
    hass.data.setdefault(DATA_PROVIDERS, {})[
        provider_domain
    ] = async_provide_implementation
}

class OAuth2AuthorizeCallbackView(http.HomeAssistantView):
    """OAuth2 Authorization Callback View."""

    requires_auth = false
    url = AUTH_CALLBACK_PATH
    name = "auth:external:callback"

    /**
     * Receive authorization code.
     */
    async get(request: web.Request): web.Response {
        if ("code" !in request.query or "state" !in request.query) {
            return web.Response(
                text`Missing code or state parameter in ${request.url}`
            )
        }

        hass = request.app["hass"]

        state = _decode_jwt(hass, request.query["state"])

        if (!state) {
            return web.Response(text="Invalid state")
        }

        await hass.config_entries.flow.async_configure(
            flow_id=state["flow_id"],
            user_input={"state": state, "code": request.query["code"]},
        )

        return web.Response(
            headers={"content-type": "text/html"},
            text="<script>window.close()</script>",
        )
    }


class OAuth2Session:
    """Session to make requests authenticated with OAuth2."""

    /**
     * Initialize an OAuth2 session.
     */
    constructor(

        hass: HomeAssistant,
        config_entry: config_entries.ConfigEntry,
        implementation: AbstractOAuth2Implementation,
    ) {
        this.hass = hass
        this.config_entry = config_entry
        this.implementation = implementation
    }

    // @property
    /**
     * Return the token.
     */
    token(): dict {
        return cast(dict, this.config_entry.data["token"])
    }

    // @property
    /**
     * Return if token is still valid.
     */
    valid_token(): boolean {
        return (
            cast(float, this.token["expires_at"])
            > time.time() + CLOCK_OUT_OF_SYNC_MAX_SEC
        )
    }

    /**
     * Ensure that the current token is valid.
     */
    async async_ensure_token_valid() {
        if (this.valid_token) {
            return
        }

        new_token = await this.implementation.async_refresh_token(this.token)

        this.hass.config_entries.async_update_entry(
            this.config_entry, data={**this.config_entry.data, "token": new_token}
        )
    }

    /**
     * Make a request.
     */
    async async_request(
        method: string, url: string, **kwargs: any
    ): client.ClientResponse {
        await this.async_ensure_token_valid()
        return await async_oauth2_request(
            this.hass, this.config_entry.data["token"], method, url, **kwargs
        )
    }


async def async_oauth2_request(
    hass: HomeAssistant, token: dict, method: string, url: string, **kwargs: any
) -> client.ClientResponse:
    """Make an OAuth2 authenticated request.

    This method will not refresh tokens. Use OAuth2 session for that.
    """
    session = async_get_clientsession(hass)

    return await session.request(
        method,
        url,
        **kwargs,
        headers={
            **(kwargs.get("headers") or {}),
            "authorization":`Bearer ${token['access_token']}`,
        },
    )


// @callback
/**
 * JWT encode data.
 */
export function _encode_jwt(hass: HomeAssistant, data: dict): string {
    secret = hass.data.get(DATA_JWT_SECRET)

    if (!secret) {
        secret = hass.data[DATA_JWT_SECRET] = secrets.token_hex()
    }

    return jwt.encode(data, secret, algorithm="HS256").decode()
}

// @callback
/**
 * JWT encode data.
 */
export function _decode_jwt(hass: HomeAssistant, encoded: string): Optional<dict> {
    secret = cast(str, hass.data.get(DATA_JWT_SECRET))

    try {
        return jwt.decode(encoded, secret, algorithms=["HS256"])
    }
    catch (e) {
        if (e instanceof jwt.InvalidTokenError) {
        return null
        }
        else {
            throw e;
        }
    }

}
