/**
 * Helpers for the data entry flow.
 */

from typing import any, Dict

from aiohttp import web
import voluptuous as vol

from homeassistant import config_entries, data_entry_flow
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.data_validator import RequestDataValidator
from homeassistant.const import HTTP_BAD_REQUEST, HTTP_NOT_FOUND
import homeassistant.helpers.config_validation as cv


/**
 * Foundation for flow manager views.
 */
export class _BaseFlowManagerView extends HomeAssistantView {

    /**
     * Initialize the flow manager index view.
     */
    constructor(flow_mgr: data_entry_flow.FlowManager) {
        this._flow_mgr = flow_mgr
    }

    // pylint: disable=no-self-use
    /**
     * Convert result to JSON.
     */
    _prepare_result_json(result: Dict<any>): Dict<any> {
        if (result["type"] === data_entry_flow.RESULT_TYPE_CREATE_ENTRY) {
            data = result.copy()
            data.pop("result")
            data.pop("data")
            return data
        }

        if (result["type"] !== data_entry_flow.RESULT_TYPE_FORM) {
            return result
        }

        import voluptuous_serialize  // pylint: disable=import-outside-toplevel

        data = result.copy()

        schema = data["data_schema"]
        if (!schema) {
            data["data_schema"] = []
        }
        else {
            data["data_schema"] = voluptuous_serialize.convert(
                schema, custom_serializer=cv.custom_serializer
            )
        }

        return data
    }
}

/**
 * View to create config flows.
 */
export class FlowManagerIndexView extends _BaseFlowManagerView {

    // @RequestDataValidator(
        vol.Schema(
            {
                vol.Required("handler"): vol.Any(str, list),
                vol.Optional("show_advanced_options", default=false): cv.boolean,
            },
            extra=vol.ALLOW_EXTRA,
        )
    )
    /**
     * Handle a POST request.
     */
    async post(request: web.Request, data: Dict<any>): web.Response {
        if (data["handler"] instanceof list) {
            handler = tuple(data["handler"])
        }
        else {
            handler = data["handler"]
        }

        try {
            result = await this._flow_mgr.async_init(
                handler,  // type: ignore
                context={
                    "source": config_entries.SOURCE_USER,
                    "show_advanced_options": data["show_advanced_options"],
                },
            )
        }
        catch (e) {
            if (e instanceof data_entry_flow.UnknownHandler) {
            return this.json_message("Invalid handler specified", HTTP_NOT_FOUND)
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof data_entry_flow.UnknownStep) {
            return this.json_message("Handler does not support user", HTTP_BAD_REQUEST)
            }
            else {
                throw e;
            }
        }


        result = this._prepare_result_json(result)

        return this.json(result)
    }
}

/**
 * View to intract with the flow manager.
 */
export class FlowManagerResourceView extends _BaseFlowManagerView {

    /**
     * Get the current state of a data_entry_flow.
     */
    async get(request: web.Request, flow_id: string): web.Response {
        try {
            result = await this._flow_mgr.async_configure(flow_id)
        }
        catch (e) {
            if (e instanceof data_entry_flow.UnknownFlow) {
            return this.json_message("Invalid flow specified", HTTP_NOT_FOUND)
            }
            else {
                throw e;
            }
        }


        result = this._prepare_result_json(result)

        return this.json(result)
    }

    // @RequestDataValidator(vol.Schema(dict), allow_empty=true)
    /**
     * Handle a POST request.
     */
    async post(
        request: web.Request, flow_id: string, data: Dict<any>
    ): web.Response {
        try {
            result = await this._flow_mgr.async_configure(flow_id, data)
        }
        catch (e) {
            if (e instanceof data_entry_flow.UnknownFlow) {
            return this.json_message("Invalid flow specified", HTTP_NOT_FOUND)
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof vol.Invalid) {
            return this.json_message("User input malformed", HTTP_BAD_REQUEST)
            }
            else {
                throw e;
            }
        }


        result = this._prepare_result_json(result)

        return this.json(result)
    }

    /**
     * Cancel a flow in progress.
     */
    async delete(request: web.Request, flow_id: string): web.Response {
        try {
            this._flow_mgr.async_abort(flow_id)
        }
        catch (e) {
            if (e instanceof data_entry_flow.UnknownFlow) {
            return this.json_message("Invalid flow specified", HTTP_NOT_FOUND)
            }
            else {
                throw e;
            }
        }


        return this.json_message("Flow aborted")
    }
}
