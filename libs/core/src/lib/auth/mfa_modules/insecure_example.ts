/**
 * Example auth module.
 */
from typing import any, Dict

import voluptuous as vol

from homeassistant.core import HomeAssistant

from . import (
    MULTI_FACTOR_AUTH_MODULE_SCHEMA,
    MULTI_FACTOR_AUTH_MODULES,
    MultiFactorAuthModule,
    SetupFlow,
)

export const CONFIG_SCHEMA = MULTI_FACTOR_AUTH_MODULE_SCHEMA.extend(
    {
        vol.Required("data"): [
            vol.Schema({vol.Required("user_id"): string, vol.Required("pin"): string})
        ]
    },
    extra=vol.PREVENT_EXTRA,
)


// @MULTI_FACTOR_AUTH_MODULES.register("insecure_example")
/**
 * Example auth module validate pin.
 */
export class InsecureExampleModule extends MultiFactorAuthModule {

    DEFAULT_TITLE = "Insecure Personal Identify Number"

    /**
     * Initialize the user data store.
     */
    constructor(hass: HomeAssistant, config: Dict<any>) {
        super().constructor(hass, config)
        this._data = config["data"]
    }

    // @property
    /**
     * Validate login flow input data.
     */
    input_schema(): vol.Schema {
        return vol.Schema({"pin": string})
    }

    // @property
    /**
     * Validate async_setup_user input data.
     */
    setup_schema(): vol.Schema {
        return vol.Schema({"pin": string})
    }

    /**
     * Return a data entry flow handler for setup module.

        Mfa module should extend SetupFlow

     */
    async async_setup_flow(user_id: string): SetupFlow {
        return SetupFlow(this.setup_schema, user_id)
    }

    /**
     * Set up user to use mfa module.
     */
    async async_setup_user(user_id: string, setup_data: any): any {
        // data shall has been validate in caller
        pin = setup_data["pin"]

        for(const data of this._data) {
            if (data["user_id"] === user_id) {
                // already setup, override
                data["pin"] = pin
                return
            }
        }

        this._data.append({"user_id": user_id, "pin": pin})
    }

    /**
     * Remove user from mfa module.
     */
    async async_depose_user(user_id: string) {
        found = null
        for(const data of this._data) {
            if (data["user_id"] === user_id) {
                found = data
                break
            }
        }
        if (found) {
            this._data.remove(found)
        }
    }

    /**
     * Return whether user is setup.
     */
    async async_is_user_setup(user_id: string): boolean {
        for(const data of this._data) {
            if (data["user_id"] === user_id) {
                return true
            }
        }
        return false
    }

    /**
     * Return true if validation passed.
     */
    async async_validate(user_id: string, user_input: Dict<any>): boolean {
        for(const data of this._data) {
            if (data["user_id"] === user_id) {
                // user_input has been validate in caller
                if (data["pin"] === user_input["pin"]) {
                    return true
                }
            }
        }

        return false
    }
}
