/**
 * HMAC-based One-time Password auth module.

Sending HOTP through notify service

 */
import asyncio
from collections import OrderedDict
import logging
from typing import any, Dict, List, Optional

import attr
import voluptuous as vol

from homeassistant.const import CONF_EXCLUDE, CONF_INCLUDE
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ServiceNotFound
from homeassistant.helpers import config_validation as cv

from . import (
    MULTI_FACTOR_AUTH_MODULE_SCHEMA,
    MULTI_FACTOR_AUTH_MODULES,
    MultiFactorAuthModule,
    SetupFlow,
)

export const REQUIREMENTS = ["pyotp===2.3.0"]

export const CONF_MESSAGE = "message"

export const CONFIG_SCHEMA = MULTI_FACTOR_AUTH_MODULE_SCHEMA.extend(
    {
        vol.Optional(CONF_INCLUDE): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(CONF_EXCLUDE): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional(CONF_MESSAGE, default="{} is your Home Assistant login code"): string,
    },
    extra=vol.PREVENT_EXTRA,
)

export const STORAGE_VERSION = 1
export const STORAGE_KEY = "auth_module.notify"
export const STORAGE_USERS = "users"
export const STORAGE_USER_ID = "user_id"

export const INPUT_FIELD_CODE = "code"

const _LOGGER = logging.getLogger(__name__)


/**
 * Generate a secret.
 */
export function _generate_secret(): string {
    import pyotp  // pylint: disable=import-outside-toplevel

    return string(pyotp.random_base32())
}

/**
 * Generate a 8 digit number.
 */
export function _generate_random(): number {
    import pyotp  // pylint: disable=import-outside-toplevel

    return number(pyotp.random_base32(length=8, chars=list("1234567890")))
}

/**
 * Generate one time password.
 */
export function _generate_otp(secret: string, count: number): string {
    import pyotp  // pylint: disable=import-outside-toplevel

    return string(pyotp.HOTP(secret).at(count))
}

/**
 * Verify one time password.
 */
export function _verify_otp(secret: string, otp: string, count: number): boolean {
    import pyotp  // pylint: disable=import-outside-toplevel

    return boolean(pyotp.HOTP(secret).verify(otp, count))
}

// @attr.s(slots=true)
/**
 * Store notify setting for one user.
 */
export class NotifySetting {

    secret: string = attr.ib(factory=_generate_secret)  // not persistent
    counter: number = attr.ib(factory=_generate_random)  // not persistent
    notify_service: Optional<string> = attr.ib(default=null)
    target: Optional<string> = attr.ib(default=null)
}

export const _UsersDict = Dict[str, NotifySetting]


// @MULTI_FACTOR_AUTH_MODULES.register("notify")
/**
 * Auth module send hmac-based one time password by notify service.
 */
export class NotifyAuthModule extends MultiFactorAuthModule {

    DEFAULT_TITLE = "Notify One-Time Password"

    /**
     * Initialize the user data store.
     */
    constructor(hass: HomeAssistant, config: Dict<any>) {
        super().constructor(hass, config)
        this._user_settings: Optional[_UsersDict] = null
        this._user_store = hass.helpers.storage.Store(
            STORAGE_VERSION, STORAGE_KEY, private=true
        )
        this._include = config.get(CONF_INCLUDE, [])
        this._exclude = config.get(CONF_EXCLUDE, [])
        this._message_template = config[CONF_MESSAGE]
        this._init_lock = asyncio.Lock()
    }

    // @property
    /**
     * Validate login flow input data.
     */
    input_schema(): vol.Schema {
        return vol.Schema({INPUT_FIELD_CODE: string})
    }

    /**
     * Load stored data.
     */
    async _async_load() {
        async with this._init_lock:
            if (this._user_settings is !null) {
                return
            }

            data = await this._user_store.async_load()

            if (!data) {
                data = {STORAGE_USERS: {}}
            }

            this._user_settings = {
                user_id: NotifySetting(**setting)
                for user_id, setting in data.get(STORAGE_USERS, {}).items()
            }
    }

    /**
     * Save data.
     */
    async _async_save() {
        if (!this._user_settings) {
            return
        }

        await this._user_store.async_save(
            {
                STORAGE_USERS: {
                    user_id: attr.asdict(
                        notify_setting,
                        filter=attr.filters.exclude(
                            attr.fields(NotifySetting).secret,
                            attr.fields(NotifySetting).counter,
                        ),
                    )
                    for user_id, notify_setting in this._user_settings.items()
                }
            }
        )
    }

    // @callback
    /**
     * Return list of notify services.
     */
    aync_get_available_notify_services(): string[] {
        unordered_services = set()

        for(const service of this.hass.services.async_services().get("notify", {})) {
            if (service !in this._exclude) {
                unordered_services.add(service)
            }
        }

        if (this._include) {
            unordered_services &= set(this._include)
        }

        return sorted(unordered_services)
    }

    /**
     * Return a data entry flow handler for setup module.

        Mfa module should extend SetupFlow

     */
    async async_setup_flow(user_id: string): SetupFlow {
        return NotifySetupFlow(
            this.input_schema, user_id, this.aync_get_available_notify_services()
        )
    }

    /**
     * Set up auth module for user.
     */
    async async_setup_user(user_id: string, setup_data: any): any {
        if (!this._user_settings) {
            await this._async_load()
            assert this._user_settings
        }

        this._user_settings[user_id] = NotifySetting(
            notify_service=setup_data.get("notify_service"),
            target=setup_data.get("target"),
        )

        await this._async_save()
    }

    /**
     * Depose auth module for user.
     */
    async async_depose_user(user_id: string) {
        if (!this._user_settings) {
            await this._async_load()
            assert this._user_settings
        }

        if (this._user_settings.pop(user_id, null) {
            await this._async_save()
        }
    }

    /**
     * Return whether user is setup.
     */
    async async_is_user_setup(user_id: string): boolean {
        if (!this._user_settings) {
            await this._async_load()
            assert this._user_settings
        }

        return user_id in this._user_settings
    }

    /**
     * Return true if validation passed.
     */
    async async_validate(user_id: string, user_input: Dict<any>): boolean {
        if (!this._user_settings) {
            await this._async_load()
            assert this._user_settings
        }

        notify_setting = this._user_settings.get(user_id)
        if (!notify_setting) {
            return false
        }

        // user_input has been validate in caller
        return await this.hass.async_add_executor_job(
            _verify_otp,
            notify_setting.secret,
            user_input.get(INPUT_FIELD_CODE, ""),
            notify_setting.counter,
        )
    }

    /**
     * Generate code and notify user.
     */
    async async_initialize_login_mfa_step(user_id: string) {
        if (!this._user_settings) {
            await this._async_load()
            assert this._user_settings
        }

        notify_setting = this._user_settings.get(user_id)
        if (!notify_setting) {
            throw new ValueError("Cannot find user_id")
        }

        /**
         * Generate and send one time password.
         */
        generate_secret_and_one_time_password(): string {
            assert notify_setting
            // secret and counter are not persistent
            notify_setting.secret = _generate_secret()
            notify_setting.counter = _generate_random()
            return _generate_otp(notify_setting.secret, notify_setting.counter)
        }

        code = await this.hass.async_add_executor_job(
            generate_secret_and_one_time_password
        )

        await this.async_notify_user(user_id, code)
    }

    /**
     * Send code by user's notify service.
     */
    async async_notify_user(user_id: string, code: string) {
        if (!this._user_settings) {
            await this._async_load()
            assert this._user_settings
        }

        notify_setting = this._user_settings.get(user_id)
        if (!notify_setting) {
            _LOGGER.error("Cannot find user %s", user_id)
            return
        }

        await this.async_notify(
            code,
            notify_setting.notify_service,  // type: ignore
            notify_setting.target,
        )
    }

    /**
     * Send code by notify service.
     */
    async async_notify(
        code: string, notify_service: string, target: Optional<string> = null
    ) {
        data = {"message": this._message_template.format(code)}
        if (target) {
            data["target"] = [target]
        }

        await this.hass.services.async_call("notify", notify_service, data)
    }
}

/**
 * Handler for the setup flow.
 */
export class NotifySetupFlow extends SetupFlow {

    /**
     * Initialize the setup flow.
     */
    constructor(

        auth_module: NotifyAuthModule,
        setup_schema: vol.Schema,
        user_id: string,
        available_notify_services: string[],
    ) {
        super().constructor(auth_module, setup_schema, user_id)
        // to fix typing complaint
        this._auth_module: NotifyAuthModule = auth_module
        this._available_notify_services = available_notify_services
        this._secret: Optional<string> = null
        this._count: Optional<number> = null
        this._notify_service: Optional<string> = null
        this._target: Optional<string> = null
    }

    /**
     * Let user select available notify services.
     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors: Dict<string> = {}

        hass = this._auth_module.hass
        if (user_input) {
            this._notify_service = user_input["notify_service"]
            this._target = user_input.get("target")
            this._secret = await hass.async_add_executor_job(_generate_secret)
            this._count = await hass.async_add_executor_job(_generate_random)

            return await this.async_step_setup()
        }

        if (!this._available_notify_services) {
            return this.async_abort(reason="no_available_service")
        }

        schema: Dict<any> = OrderedDict()
        schema["notify_service"] = vol.In(this._available_notify_services)
        schema["target"] = vol.Optional(str)

        return this.async_show_form(
            step_id="init", data_schema=vol.Schema(schema), errors=errors
        )
    }

    /**
     * Verify user can receive one-time password.
     */
    async async_step_setup(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        errors: Dict<string> = {}

        hass = this._auth_module.hass
        if (user_input) {
            verified = await hass.async_add_executor_job(
                _verify_otp, this._secret, user_input["code"], this._count
            )
            if (verified) {
                await this._auth_module.async_setup_user(
                    this._user_id,
                    {"notify_service": this._notify_service, "target": this._target},
                )
                return this.async_create_entry(title=this._auth_module.name, data={})
            }

            errors["base"] = "invalid_code"
        }

        // generate code every time, no retry logic
        assert this._secret and this._count
        code = await hass.async_add_executor_job(
            _generate_otp, this._secret, this._count
        )

        assert this._notify_service
        try {
            await this._auth_module.async_notify(
                code, this._notify_service, this._target
            )
        }
        catch (e) {
            if (e instanceof ServiceNotFound) {
            return this.async_abort(reason="notify_service_not_exist")
            }
            else {
                throw e;
            }
        }


        return this.async_show_form(
            step_id="setup",
            data_schema=this._setup_schema,
            description_placeholders={"notify_service": this._notify_service},
            errors=errors,
        )
    }
}
