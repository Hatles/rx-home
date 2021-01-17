/**
 * Helper for aiohttp webclient stuff.
 */
import asyncio
from ssl import SSLContext
import sys
from typing import any, Awaitable, Optional, Union, cast

import aiohttp
from aiohttp import web
from aiohttp.hdrs import CONTENT_TYPE, USER_AGENT
from aiohttp.web_exceptions import HTTPBadGateway, HTTPGatewayTimeout
import async_timeout

from homeassistant.const import EVENT_HOMEASSISTANT_CLOSE, __version__
from homeassistant.core import Event, callback
from homeassistant.helpers.frame import warn_use
from homeassistant.helpers.typing import HomeAssistantType
from homeassistant.loader import bind_hass
from homeassistant.util import ssl as ssl_util

export const DATA_CONNECTOR = "aiohttp_connector"
export const DATA_CONNECTOR_NOTVERIFY = "aiohttp_connector_notverify"
export const DATA_CLIENTSESSION = "aiohttp_clientsession"
export const DATA_CLIENTSESSION_NOTVERIFY = "aiohttp_clientsession_notverify"
export const SERVER_SOFTWARE = "HomeAssistant/{0} aiohttp/{1} Python/{2[0]}.{2[1]}".format(
    __version__, aiohttp.__version__, sys.version_info
)


// @callback
// @bind_hass
/**
 * Return default aiohttp ClientSession.

    This method must be run in the event loop.

 */
export function async_get_clientsession(
    hass: HomeAssistantType, verify_ssl: boolean = true
): aiohttp.ClientSession {
    if (verify_ssl) {
        key = DATA_CLIENTSESSION
    }
    else {
        key = DATA_CLIENTSESSION_NOTVERIFY
    }

    if (key !in hass.data) {
        hass.data[key] = async_create_clientsession(hass, verify_ssl)
    }

    return cast(aiohttp.ClientSession, hass.data[key])
}

// @callback
// @bind_hass
/**
 * Create a new ClientSession with kwargs, i.e. for cookies.

    If auto_cleanup is false, you need to call detach() after the session
    returned is no longer used. Default is true, the session will be
    automatically detached on homeassistant_stop.

    This method must be run in the event loop.

 */
export function async_create_clientsession(
    hass: HomeAssistantType,
    verify_ssl: boolean = true,
    auto_cleanup: boolean = true,
    **kwargs: any,
): aiohttp.ClientSession {
    connector = _async_get_connector(hass, verify_ssl)

    clientsession = aiohttp.ClientSession(
        connector=connector,
        headers={USER_AGENT: SERVER_SOFTWARE},
        **kwargs,
    )

    clientsession.close = warn_use(  // type: ignore
        clientsession.close, "closes the Home Assistant aiohttp session"
    )

    if (auto_cleanup) {
        _async_register_clientsession_shutdown(hass, clientsession)
    }

    return clientsession
}

// @bind_hass
/**
 * Stream websession request to aiohttp web response.
 */
export async function async_aiohttp_proxy_web(
    hass: HomeAssistantType,
    request: web.BaseRequest,
    web_coro: Awaitable<aiohttp.ClientResponse>,
    buffer_size: number = 102400,
    timeout: number = 10,
): Optional<web.StreamResponse> {
    try {
        with async_timeout.timeout(timeout):
            req = await web_coro
    }

    catch (e) {
        if (e instanceof asyncio.CancelledError) {
        // The user cancelled the request
        return null
        }
        else {
            throw e;
        }
    }


    catch (e) {
        if (e instanceof asyncio.TimeoutError as err) {
        // Timeout trying to start the web request
        throw new HTTPGatewayTimeout() from err
        }
        else {
            throw e;
        }
    }


    catch (e) {
        if (e instanceof aiohttp.ClientError as err) {
        // Something went wrong with the connection
        throw new HTTPBadGateway() from err
        }
        else {
            throw e;
        }
    }


    try {
        return await async_aiohttp_proxy_stream(
            hass, request, req.content, req.headers.get(CONTENT_TYPE)
        )
    }
    finally {
        req.close()
    }
}

// @bind_hass
/**
 * Stream a stram to aiohttp web response.
 */
export async function async_aiohttp_proxy_stream(
    hass: HomeAssistantType,
    request: web.BaseRequest,
    stram: aiohttp.StreamReader,
    content_type: Optional<string>,
    buffer_size: number = 102400,
    timeout: number = 10,
): web.StreamResponse {
    response = web.StreamResponse()
    if (content_type is !null) {
        response.content_type = content_type
    }
    await response.prepare(request)

    try {
        while (true) {
            with async_timeout.timeout(timeout):
                data = await stram.read(buffer_size)

            if (!data) {
                break
            }
            await response.write(data)
        }
    }

    catch (e) {
        if (e instanceof (asyncio.TimeoutError, aiohttp.ClientError)) {
        // Something went wrong fetching data, closed connection
        pass
        }
        else {
            throw e;
        }
    }


    return response
}

// @callback
/**
 * Register ClientSession close on Home Assistant shutdown.

    This method must be run in the event loop.

 */
export function _async_register_clientsession_shutdown(
    hass: HomeAssistantType, clientsession: aiohttp.ClientSession
) {

    // @callback
    /**
     * Close websession.
     */
    _async_close_websession(event: Event) {
        clientsession.detach()
    }

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_CLOSE, _async_close_websession)
}

// @callback
/**
 * Return the connector pool for aiohttp.

    This method must be run in the event loop.

 */
export function _async_get_connector(
    hass: HomeAssistantType, verify_ssl: boolean = true
): aiohttp.BaseConnector {
    key = DATA_CONNECTOR if verify_ssl else DATA_CONNECTOR_NOTVERIFY

    if (key in hass.data) {
        return cast(aiohttp.BaseConnector, hass.data[key])
    }

    if (verify_ssl) {
        ssl_context: Union<bool, SSLContext> = ssl_util.client_context()
    }
    else {
        ssl_context = false
    }

    connector = aiohttp.TCPConnector(enable_cleanup_closed=true, ssl=ssl_context)
    hass.data[key] = connector

    /**
     * Close connector pool.
     */
    async _async_close_connector(event: Event) {
        await connector.close()
    }

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_CLOSE, _async_close_connector)

    return connector
}
