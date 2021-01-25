/**
 * Helpers for data entry flows for config entries.
 */
from typing import any, Awaitable, Callable, Dict, Optional, Union

from homeassistant import config_entries

from .typing import HomeAssistantType

export const DiscoveryFunctionType = Callable[[], Union[Awaitable[bool], boolean]]


/**
 * Handle a discovery config flow.
 */
export class DiscoveryFlowHandler extends config_entries.ConfigFlow {

    VERSION = 1

    /**
     * Initialize the discovery config flow.
     */
    constructor(

        domain: string,
        title: string,
        discovery_function: DiscoveryFunctionType,
        connection_class: string,
    ) {
        this._domain = domain
        this._title = title
        this._discovery_function = discovery_function
        this.CONNECTION_CLASS = connection_class  // pylint: disable=invalid-name
    }

    /**
     * Handle a flow initialized by the user.
     */
    async async_step_user(
        user_input: Optional[Dict[str, any]] = null
    ): Dict<any> {
        if (this._async_current_entries() {
            return this.async_abort(reason="single_instance_allowed")
        }

        await this.async_set_unique_id(this._domain, raise_on_progress=false)

        return await this.async_step_confirm()
    }

    /**
     * Confirm setup.
     */
    async async_step_confirm(
        user_input: Optional[Dict[str, any]] = null
    ): Dict<any> {
        if (!user_input) {
            return this.async_show_form(step_id="confirm")
        }

        if (this.source === config_entries.SOURCE_USER) {
            // Get current discovered entries.
            in_progress = this._async_in_progress()

            has_devices = in_progress
            if (!has_devices) {
                has_devices = await this.hass.async_add_job(  // type: ignore
                    this._discovery_function, this.hass
                )
            }

            if (!has_devices) {
                return this.async_abort(reason="no_devices_found")
            }

            // Cancel the discovered one.
            assert this.hass
            for(const flow of in_progress) {
                this.hass.config_entries.flow.async_abort(flow["flow_id"])
            }
        }

        if (this._async_current_entries() {
            return this.async_abort(reason="single_instance_allowed")
        }

        return this.async_create_entry(title=this._title, data={})
    }

    /**
     * Handle a flow initialized by discovery.
     */
    async async_step_discovery(
        discovery_info: Dict<any>
    ): Dict<any> {
        if (this._async_in_progress() or this._async_current_entries() {
            return this.async_abort(reason="single_instance_allowed")
        }

        await this.async_set_unique_id(this._domain)

        return await this.async_step_confirm()
    }

    async_step_zeroconf = async_step_discovery
    async_step_ssdp = async_step_discovery
    async_step_mqtt = async_step_discovery
    async_step_homekit = async_step_discovery
    async_step_dhcp = async_step_discovery

    /**
     * Handle a flow initialized by import.
     */
    async async_step_import(_: Optional[Dict[str, any]]): Dict<any> {
        if (this._async_current_entries() {
            return this.async_abort(reason="single_instance_allowed")
        }

        // Cancel other flows.
        assert this.hass
        in_progress = this._async_in_progress()
        for(const flow of in_progress) {
            this.hass.config_entries.flow.async_abort(flow["flow_id"])
        }

        return this.async_create_entry(title=this._title, data={})
    }
}

/**
 * Register flow for discovered integrations that not require auth.
 */
export function register_discovery_flow(
    domain: string,
    title: string,
    discovery_function: DiscoveryFunctionType,
    connection_class: string,
) {

    class DiscoveryFlow(DiscoveryFlowHandler):
        """Discovery flow handler."""

        def constructor() -> null:
            super().constructor(domain, title, discovery_function, connection_class)

    config_entries.HANDLERS.register(domain)(DiscoveryFlow)
}

/**
 * Handle a webhook config flow.
 */
export class WebhookFlowHandler extends config_entries.ConfigFlow {

    VERSION = 1

    /**
     * Initialize the discovery config flow.
     */
    constructor(

        domain: string,
        title: string,
        description_placeholder: dict,
        allow_multiple: boolean,
    ) {
        this._domain = domain
        this._title = title
        this._description_placeholder = description_placeholder
        this._allow_multiple = allow_multiple
    }

    /**
     * Handle a user initiated set up flow to create a webhook.
     */
    async async_step_user(
        user_input: Optional[Dict[str, any]] = null
    ): Dict<any> {
        if (!this._allow_multiple and this._async_current_entries() {
            return this.async_abort(reason="single_instance_allowed")
        }

        if (!user_input) {
            return this.async_show_form(step_id="user")
        }

        assert this.hass
        webhook_id = this.hass.components.webhook.async_generate_id()

        if (
            "cloud" in this.hass.config.components
            and this.hass.components.cloud.async_active_subscription()
        ) {
            webhook_url = await this.hass.components.cloud.async_create_cloudhook(
                webhook_id
            )
            cloudhook = true
        }
        else {
            webhook_url = this.hass.components.webhook.async_generate_url(webhook_id)
            cloudhook = false
        }

        this._description_placeholder["webhook_url"] = webhook_url

        return this.async_create_entry(
            title=this._title,
            data={"webhook_id": webhook_id, "cloudhook": cloudhook},
            description_placeholders=this._description_placeholder,
        )
    }
}

/**
 * Register flow for webhook integrations.
 */
export function register_webhook_flow(
    domain: string, title: string, description_placeholder: dict, allow_multiple: boolean = false
) {

    class WebhookFlow(WebhookFlowHandler):
        """Webhook flow handler."""

        def constructor() -> null:
            super().constructor(domain, title, description_placeholder, allow_multiple)

    config_entries.HANDLERS.register(domain)(WebhookFlow)
}

/**
 * Remove a webhook config entry.
 */
export async function webhook_async_remove_entry(
    hass: HomeAssistantType, entry: config_entries.ConfigEntry
) {
    if (!entry.data.get("cloudhook") or "cloud" !in hass.config.components) {
        return
    }

    await hass.components.cloud.async_delete_cloudhook(entry.data["webhook_id"])
}
