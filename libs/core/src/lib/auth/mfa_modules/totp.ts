/**
 * Time-based One Time Password auth module.
 */
import asyncio
from io import BytesIO
from typing import any, Dict, Optional, Tuple

import voluptuous as vol

from homeassistant.auth.models import User
from homeassistant.core import HomeAssistant

from . import (
    MULTI_FACTOR_AUTH_MODULE_SCHEMA,
    MULTI_FACTOR_AUTH_MODULES,
    MultiFactorAuthModule,
    SetupFlow,
)

export const REQUIREMENTS = ["pyotp===2.3.0", "PyQRCode===1.2.1"]

export const CONFIG_SCHEMA = MULTI_FACTOR_AUTH_MODULE_SCHEMA.extend({}, extra=vol.PREVENT_EXTRA)

export const STORAGE_VERSION = 1
export const STORAGE_KEY = "auth_module.totp"
export const STORAGE_USERS = "users"
export const STORAGE_USER_ID = "user_id"
export const STORAGE_OTA_SECRET = "ota_secret"

export const INPUT_FIELD_CODE = "code"

export const DUMMY_SECRET = "FPPTH34D4E3MI2HG"


/**
 * Generate a base64 PNG string represent QR Code image of data.
 */
export function _generate_qr_code(data: string): string {
    import pyqrcode  // pylint: disable=import-outside-toplevel

    qr_code = pyqrcode.create(data)

    with BytesIO() as buffer:
        qr_code.svg(file=buffer, scale=4)
        return string(
            buffer.getvalue()
            .decode("ascii")
            .replace("\n", "")
            .replace(
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<svg xmlns="http://www.w3.org/2000/svg"',
                "<svg",
            )
        )
}

/**
 * Generate a secret, url, and QR code.
 */
export function _generate_secret_and_qr_code(username: string): Tuple<string, string, string> {
    import pyotp  // pylint: disable=import-outside-toplevel

    ota_secret = pyotp.random_base32()
    url = pyotp.totp.TOTP(ota_secret).provisioning_uri(
        username, issuer_name="Home Assistant"
    )
    image = _generate_qr_code(url)
    return ota_secret, url, image
}

// @MULTI_FACTOR_AUTH_MODULES.register("totp")
/**
 * Auth module validate time-based one time password.
 */
export class TotpAuthModule extends MultiFactorAuthModule {

    DEFAULT_TITLE = "Time-based One Time Password"
    MAX_RETRY_TIME = 5

    /**
     * Initialize the user data store.
     */
    constructor(hass: HomeAssistant, config: Dict<any>) {
        super().constructor(hass, config)
        this._users: Optional[Dict[str, string]] = null
        this._user_store = hass.helpers.storage.Store(
            STORAGE_VERSION, STORAGE_KEY, private=true
        )
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
            if (this._users is !null) {
                return
            }

            data = await this._user_store.async_load()

            if (!data) {
                data = {STORAGE_USERS: {}}
            }

            this._users = data.get(STORAGE_USERS, {})
    }

    /**
     * Save data.
     */
    async _async_save() {
        await this._user_store.async_save({STORAGE_USERS: this._users})
    }

    /**
     * Create a ota_secret for user.
     */
    _add_ota_secret(user_id: string, secret: Optional<string> = null): string {
        import pyotp  // pylint: disable=import-outside-toplevel

        ota_secret: string = secret or pyotp.random_base32()

        this._users[user_id] = ota_secret  // type: ignore
        return ota_secret
    }

    /**
     * Return a data entry flow handler for setup module.

        Mfa module should extend SetupFlow

     */
    async async_setup_flow(user_id: string): SetupFlow {
        user = await this.hass.auth.async_get_user(user_id)
        assert user
        return TotpSetupFlow(this.input_schema, user)
    }

    /**
     * Set up auth module for user.
     */
    async async_setup_user(user_id: string, setup_data: any): string {
        if (!this._users) {
            await this._async_load()
        }

        result = await this.hass.async_add_executor_job(
            this._add_ota_secret, user_id, setup_data.get("secret")
        )

        await this._async_save()
        return result
    }

    /**
     * Depose auth module for user.
     */
    async async_depose_user(user_id: string) {
        if (!this._users) {
            await this._async_load()
        }

        if (this._users.pop(user_id, null) {
            await this._async_save()
        }
    }

    /**
     * Return whether user is setup.
     */
    async async_is_user_setup(user_id: string): boolean {
        if (!this._users) {
            await this._async_load()
        }

        return user_id in this._users  // type: ignore
    }

    /**
     * Return true if validation passed.
     */
    async async_validate(user_id: string, user_input: Dict<any>): boolean {
        if (!this._users) {
            await this._async_load()
        }

        // user_input has been validate in caller
        // set INPUT_FIELD_CODE as vol.Required is not user friendly
        return await this.hass.async_add_executor_job(
            this._validate_2fa, user_id, user_input.get(INPUT_FIELD_CODE, "")
        )
    }

    def _validate_2fa(user_id: string, code: string) -> boolean:
        """Validate two factor authentication code."""
        import pyotp  // pylint: disable=import-outside-toplevel

        ota_secret = this._users.get(user_id)  // type: ignore
        if (!ota_secret) {
            // even we cannot find user, we still do verify
            // to make timing the same as if user was found.
            pyotp.TOTP(DUMMY_SECRET).verify(code, valid_window=1)
            return false
        }

        return boolean(pyotp.TOTP(ota_secret).verify(code, valid_window=1))
}

/**
 * Handler for the setup flow.
 */
export class TotpSetupFlow extends SetupFlow {

    /**
     * Initialize the setup flow.
     */
    constructor(
        auth_module: TotpAuthModule, setup_schema: vol.Schema, user: User
    ) {
        super().constructor(auth_module, setup_schema, user.id)
        // to fix typing complaint
        this._auth_module: TotpAuthModule = auth_module
        this._user = user
        this._ota_secret: Optional<string> = null
        this._url = null  // type Optional[str]
        this._image = null  // type Optional[str]
    }

    /**
     * Handle the first step of setup flow.

        Return this.async_show_form(step_id='init') if !user_input.
        Return this.async_create_entry(data={'result': result}) if finish.

     */
    async async_step_init(
        user_input: Optional[Dict[str, string]] = null
    ): Dict<any> {
        import pyotp  // pylint: disable=import-outside-toplevel

        errors: Dict<string> = {}

        if (user_input) {
            verified = await this.hass.async_add_executor_job(  // type: ignore
                pyotp.TOTP(this._ota_secret).verify, user_input["code"]
            )
            if (verified) {
                result = await this._auth_module.async_setup_user(
                    this._user_id, {"secret": this._ota_secret}
                )
                return this.async_create_entry(
                    title=this._auth_module.name, data={"result": result}
                )
            }

            errors["base"] = "invalid_code"
        }

        else {
            hass = this._auth_module.hass
            (
                this._ota_secret,
                this._url,
                this._image,
            ) = await hass.async_add_executor_job(
                _generate_secret_and_qr_code,  // type: ignore
                string(this._user.name),
            )
        }

        return this.async_show_form(
            step_id="init",
            data_schema=this._setup_schema,
            description_placeholders={
                "code": this._ota_secret,
                "url": this._url,
                "qr_code": this._image,
            },
            errors=errors,
        )
    }
}
