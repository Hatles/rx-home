// pylint: disable=invalid-name

export const CORE_STORAGE_KEY = "core.config";
export const CORE_STORAGE_VERSION = 1;

export const DOMAIN = "homeassistant";

// How long to wait to log tasks that are blocking
export const BLOCK_LOG_TIMEOUT = 60;

// How long we wait for the result of a service call
export const SERVICE_CALL_LIMIT = 10;  // seconds

// Source of core configuration
export const SOURCE_DISCOVERED = "discovered";
export const SOURCE_STORAGE = "storage";
export const SOURCE_YAML = "yaml";

// How long to wait until things that run on startup have to finish.
export const TIMEOUT_EVENT_START = 15;

export const _LOGGER = {
    debug: (a, b?, c?, d?) => {},
    info: (a, b?, c?, d?) => {},
    warning: (a, b?, c?, d?) => {},
    exception: (a, b?, c?, d?) => {},
};
// const _LOGGER = logging.getLogger(__name__);
