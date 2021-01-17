/**
 * The exceptions used by Home Assistant.
 */
import {Optional} from "./types";
import {Context} from "./core/context";

export class ValueError extends TypeError {
    constructor(message: string) {
        super(message);
    }
}

export class RuntimeError extends Error {

}

/**
 * General Home Assistant exception occurred.
 */
export class HomeAssistantError extends Error {
}

/**
 * When an invalid formatted entity is encountered.
 */
export class InvalidEntityFormatError extends HomeAssistantError {
}

/**
 * When no entity is specified.
 */
export class NoEntitySpecifiedError extends HomeAssistantError {
}

/**
 * Error during template rendering.
 */
export class TemplateError extends HomeAssistantError {

    /**
     * Init the error.
     */
    constructor (exception: Error) {
        super(`${exception.constructor.name}: ${exception}`)
    }
}

/**
 * Error to indicate that platform is not ready.
 */
export class PlatformNotReady extends HomeAssistantError {
}

/**
 * Error to indicate that config entry is not ready.
 */
export class ConfigEntryNotReady extends HomeAssistantError {
}

/**
 * When an invalid state is encountered.
 */
export class InvalidStateError extends HomeAssistantError {
}


/**
 * When an action is unauthorized.
 */
export class Unauthorized extends HomeAssistantError {
    context: Optional<Context>;
    user_id: Optional<string>;
    entity_id: Optional<string>;
    config_entry_id: Optional<string>;
    permission: Optional<string>;
    perm_category: Optional<string>;

    /**
     * Unauthorized error.
     */
    constructor(
        context: Optional<Context> = null,
        user_id: Optional<string> = null,
        entity_id: Optional<string> = null,
        config_entry_id: Optional<string> = null,
        perm_category: Optional<string> = null,
        permission: Optional<string> = null,
    ) {
        super('Unauthorized')
        this.context = context

        if (!user_id && context) {
            user_id = context.user_id
        }

        this.user_id = user_id
        this.entity_id = entity_id
        this.config_entry_id = config_entry_id
        // Not all actions have an ID (like adding config entry)
        // We then use this fallback to know what category was unauth
        this.perm_category = perm_category
        this.permission = permission
    }
}

/**
 * When call is made with user ID that doesn't exist.
 */
export class UnknownUser extends Unauthorized {
}

/**
 * Raised when a service is not found.
 */
export class ServiceNotFound extends HomeAssistantError {
    domain: string;
    service: string;

    /**
     * Initialize error.
     */
    constructor(domain: string, service: string) {
        super(`Service ${domain}.${service} not found`)
        this.domain = domain
        this.service = service
    }

    /**
     * Return string representation.
     */
    __str__(): string {
        return`Unable to find service ${this.domain}.${this.service}`
    }
}
