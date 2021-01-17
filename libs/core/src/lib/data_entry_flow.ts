/**
 * Classes to help gather user submissions.
 */
import abc
import asyncio
from typing import any, Dict, List, Optional, cast
import uuid

import voluptuous as vol

from .core import HomeAssistant, callback
from .exceptions import HomeAssistantError

export const RESULT_TYPE_FORM = "form"
export const RESULT_TYPE_CREATE_ENTRY = "create_entry"
export const RESULT_TYPE_ABORT = "abort"
export const RESULT_TYPE_EXTERNAL_STEP = "external"
export const RESULT_TYPE_EXTERNAL_STEP_DONE = "external_done"
export const RESULT_TYPE_SHOW_PROGRESS = "progress"
export const RESULT_TYPE_SHOW_PROGRESS_DONE = "progress_done"

// Event that is fired when a flow is progressed via external or progress source.
export const EVENT_DATA_ENTRY_FLOW_PROGRESSED = "data_entry_flow_progressed"


/**
 * Error while configuring an account.
 */
export class FlowError extends HomeAssistantError {
}

/**
 * Unknown handler specified.
 */
export class UnknownHandler extends FlowError {
}

/**
 * Unknown flow specified.
 */
export class UnknownFlow extends FlowError {
}

/**
 * Unknown step specified.
 */
export class UnknownStep extends FlowError {
}

/**
 * Exception to indicate a flow needs to be aborted.
 */
export class AbortFlow extends FlowError {

    /**
     * Initialize an abort flow exception.
     */
    constructor(reason: string, description_placeholders: Optional<Dict> = null) {
        super().constructor`Flow aborted: ${reason}`)
        this.reason = reason
        this.description_placeholders = description_placeholders
    }
}

/**
 * Manage all the flows that are in progress.
 */
export class FlowManager extends abc.ABC {

    /**
     * Initialize the flow manager.
     */
    constructor(

        hass: HomeAssistant,
    ) {
        this.hass = hass
        this._initializing: Dict<asyncio.Future>[] = {}
        this._progress: Dict<any> = {}
    }

    /**
     * Wait till all flows in progress are initialized.
     */
    async async_wait_init_flow_finish(handler: string) {
        current = this._initializing.get(handler)

        if (!current) {
            return
        }

        await asyncio.wait(current)
    }

    // @abc.abstractmethod
    /**
     * Create a flow for specified handler.

        Handler key is the domain of the component that we want to set up.

     */
    async async_create_flow(

        handler_key: any,
        *,
        context: Optional[Dict[str, any]] = null,
        data: Optional[Dict[str, any]] = null,
    ): "FlowHandler" {
    }

    // @abc.abstractmethod
    /**
     * Finish a config flow and add an entry.
     */
    async async_finish_flow(
        flow: "FlowHandler", result: Dict<any>
    ): Dict<any> {
    }

    /**
     * Entry has finished executing its first step asynchronously.
     */
    async async_post_init(
        flow: "FlowHandler", result: Dict<any>
    ) {
    }

    // @callback
    /**
     * Return the flows in progress.
     */
    async_progress(): Dict[] {
        return [
            {
                "flow_id": flow.flow_id,
                "handler": flow.handler,
                "context": flow.context,
                "step_id": flow.cur_step["step_id"],
            }
            for flow in this._progress.values()
            if (flow.cur_step is !null
        ]
    }

    /**
     * Start a configuration flow.
     */
    async async_init(
        handler) {
            }
    ): any {
        if (!context) {
            context = {}
        }

        init_done: asyncio.Future = asyncio.Future()
        this._initializing.setdefault(handler, []).append(init_done)

        flow = await this.async_create_flow(handler, context=context, data=data)
        if (!flow) {
            this._initializing[handler].remove(init_done)
            throw new UnknownFlow("Flow was not created")
        }
        flow.hass = this.hass
        flow.handler = handler
        flow.flow_id = uuid.uuid4().hex
        flow.context = context
        this._progress[flow.flow_id] = flow

        try {
            result = await this._async_handle_step(
                flow, flow.init_step, data, init_done
            )
        }
        finally {
            this._initializing[handler].remove(init_done)
        }

        if (result["type"] !== RESULT_TYPE_ABORT) {
            await this.async_post_init(flow, result)
        }

        return result
    }

    /**
     * Continue a configuration flow.
     */
    async async_configure(
        flow_id: string, user_input: Optional<Dict> = null
    ): any {
        flow = this._progress.get(flow_id)

        if (!flow) {
            throw new UnknownFlow
        }

        cur_step = flow.cur_step

        if (cur_step.get("data_schema") is !null and user_input is !null) {
            user_input = cur_step["data_schema"](user_input)
        }

        result = await this._async_handle_step(flow, cur_step["step_id"], user_input)

        if (cur_step["type"] in (RESULT_TYPE_EXTERNAL_STEP, RESULT_TYPE_SHOW_PROGRESS) {
            if (cur_step["type"] === RESULT_TYPE_EXTERNAL_STEP and result["type"] !in (
                RESULT_TYPE_EXTERNAL_STEP,
                RESULT_TYPE_EXTERNAL_STEP_DONE,
            ) {
                throw new ValueError(
                    "External step can only transition to "
                    "external step or external step done."
                )
            }
            if (cur_step["type"] === RESULT_TYPE_SHOW_PROGRESS and result["type"] !in (
                RESULT_TYPE_SHOW_PROGRESS,
                RESULT_TYPE_SHOW_PROGRESS_DONE,
            ) {
                throw new ValueError(
                    "Show progress can only transition to show progress or show progress done."
                )
            }

            // If the result has changed from last result, fire event to update
            // the frontend.
            if (
                cur_step["step_id"] !== result.get("step_id")
                or result["type"] === RESULT_TYPE_SHOW_PROGRESS
            ) {
                // Tell frontend to reload the flow state.
                this.hass.bus.async_fire(
                    EVENT_DATA_ENTRY_FLOW_PROGRESSED,
                    {"handler": flow.handler, "flow_id": flow_id, "refresh": true},
                )
            }
        }

        return result
    }

    // @callback
    /**
     * Abort a flow.
     */
    async_abort(flow_id: string) {
        if (this._progress.pop(flow_id, !null)) {
            throw new UnknownFlow
        }
    }

    /**
     * Handle a step of a flow.
     */
    async _async_handle_step(

        flow: any,
        step_id: string,
        user_input: Optional<Dict>,
        step_done: Optional<asyncio.Future> = null,
    ): Dict {
        method =`async_step_${step_id}`

        if (!hasattr(flow, method) {
            this._progress.pop(flow.flow_id)
            if (step_done) {
                step_done.set_result(null)
            }
            throw new UnknownStep(
               `Handler ${flow.__class__.__name__} doesn't support step ${step_id}`
            )
        }

        try {
            result: Dict = await getattr(flow, method)(user_input)
        }
        catch (e) {
            if (e instanceof AbortFlow as err) {
            result = _create_abort_data(
                flow.flow_id, flow.handler, err.reason, err.description_placeholders
            )
            }
            else {
                throw e;
            }
        }


        // Mark the step as done.
        // We do this before calling async_finish_flow because config entries will hit a
        // circular dependency where async_finish_flow sets up new entry, which needs the
        // integration to be set up, which is waiting for init to be done.
        if (step_done) {
            step_done.set_result(null)
        }

        if (result["type"] !in (
            RESULT_TYPE_FORM,
            RESULT_TYPE_EXTERNAL_STEP,
            RESULT_TYPE_CREATE_ENTRY,
            RESULT_TYPE_ABORT,
            RESULT_TYPE_EXTERNAL_STEP_DONE,
            RESULT_TYPE_SHOW_PROGRESS,
            RESULT_TYPE_SHOW_PROGRESS_DONE,
        ) {
            throw new ValueError`Handler returned incorrect type: ${result['type']}`)
        }

        if (result["type"] in (
            RESULT_TYPE_FORM,
            RESULT_TYPE_EXTERNAL_STEP,
            RESULT_TYPE_EXTERNAL_STEP_DONE,
            RESULT_TYPE_SHOW_PROGRESS,
            RESULT_TYPE_SHOW_PROGRESS_DONE,
        ) {
            flow.cur_step = result
            return result
        }

        // We pass a copy of the result because we're mutating our version
        result = await this.async_finish_flow(flow, dict(result))

        // _async_finish_flow may change result type, check it again
        if (result["type"] === RESULT_TYPE_FORM) {
            flow.cur_step = result
            return result
        }

        // Abort and Success results both finish the flow
        this._progress.pop(flow.flow_id)

        return result
    }
}

/**
 * Handle the configuration flow of a component.
 */
export class FlowHandler {

    // Set by flow manager
    flow_id: string = null  // type: ignore
    hass: Optional<HomeAssistant> = null
    handler: Optional<string> = null
    cur_step: Optional[Dict[str, string]] = null
    context: Dict

    // Set by _async_create_flow callback
    init_step = "init"

    // Set by developer
    VERSION = 1

    // @property
    /**
     * Source that initialized the flow.
     */
    source(): Optional<string> {
        if (!hasattr("context") {
            return null
        }

        return this.context.get("source", null)
    }

    // @property
    /**
     * If we should show advanced options.
     */
    show_advanced_options(): boolean {
        if (!hasattr("context") {
            return false
        }

        return this.context.get("show_advanced_options", false)
    }

    // @callback
    /**
     * Return the definition of a form to gather user input.
     */
    async_show_form(

        *,
        step_id: string,
        data_schema: vol.Schema = null,
        errors: Optional<Dict> = null,
        description_placeholders: Optional<Dict> = null,
    ): Dict<any> {
        return {
            "type": RESULT_TYPE_FORM,
            "flow_id": this.flow_id,
            "handler": this.handler,
            "step_id": step_id,
            "data_schema": data_schema,
            "errors": errors,
            "description_placeholders": description_placeholders,
        }
    }

    // @callback
    /**
     * Finish config flow and create a config entry.
     */
    async_create_entry(

        *,
        title: string,
        data: Dict,
        description: Optional<string> = null,
        description_placeholders: Optional<Dict> = null,
    ): Dict<any> {
        return {
            "version": this.VERSION,
            "type": RESULT_TYPE_CREATE_ENTRY,
            "flow_id": this.flow_id,
            "handler": this.handler,
            "title": title,
            "data": data,
            "description": description,
            "description_placeholders": description_placeholders,
        }
    }

    // @callback
    /**
     * Abort the config flow.
     */
    async_abort(
        *, reason: string, description_placeholders: Optional<Dict> = null
    ): Dict<any> {
        return _create_abort_data(
            this.flow_id, cast(str, this.handler), reason, description_placeholders
        )
    }

    // @callback
    /**
     * Return the definition of an external step for the user to take.
     */
    async_external_step(
        *, step_id: string, url: string, description_placeholders: Optional<Dict> = null
    ): Dict<any> {
        return {
            "type": RESULT_TYPE_EXTERNAL_STEP,
            "flow_id": this.flow_id,
            "handler": this.handler,
            "step_id": step_id,
            "url": url,
            "description_placeholders": description_placeholders,
        }
    }

    // @callback
    /**
     * Return the definition of an external step for the user to take.
     */
    async_external_step_done(*, next_step_id: string): Dict<any> {
        return {
            "type": RESULT_TYPE_EXTERNAL_STEP_DONE,
            "flow_id": this.flow_id,
            "handler": this.handler,
            "step_id": next_step_id,
        }
    }

    // @callback
    /**
     * Show a progress message to the user, without user input allowed.
     */
    async_show_progress(

        *,
        step_id: string,
        progress_action: string,
        description_placeholders: Optional<Dict> = null,
    ): Dict<any> {
        return {
            "type": RESULT_TYPE_SHOW_PROGRESS,
            "flow_id": this.flow_id,
            "handler": this.handler,
            "step_id": step_id,
            "progress_action": progress_action,
            "description_placeholders": description_placeholders,
        }
    }

    // @callback
    /**
     * Mark the progress done.
     */
    async_show_progress_done(*, next_step_id: string): Dict<any> {
        return {
            "type": RESULT_TYPE_SHOW_PROGRESS_DONE,
            "flow_id": this.flow_id,
            "handler": this.handler,
            "step_id": next_step_id,
        }
    }
}

// @callback
/**
 * Return the definition of an external step for the user to take.
 */
export function _create_abort_data(
    flow_id: string,
    handler: string,
    reason: string,
    description_placeholders: Optional<Dict> = null,
): Dict<any> {
    return {
        "type": RESULT_TYPE_ABORT,
        "flow_id": flow_id,
        "handler": handler,
        "reason": reason,
        "description_placeholders": description_placeholders,
    }
}
