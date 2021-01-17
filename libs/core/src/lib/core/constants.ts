import {Callable, Dict} from "../types";
import {__name__, logging} from "../util/ts/logging";

export const _UNDEF: Dict  = {}  // Internal; not helpers.typing.UNDEFINED due to circular dependency
// pylint: disable=invalid-name
// export const CALLABLE_T = TypeVar("CALLABLE_T", bound=Callable)
// export const CALLBACK_TYPE = Callable[[], null]

export type CALLABLE_T = Callable<void>;
export type CALLBACK_TYPE = Callable<void>;

// pylint: enable=invalid-name

export const CORE_STORAGE_KEY = "config"
export const CORE_STORAGE_VERSION = 1

export const DOMAIN = "homeassistant"

// How long to wait to log tasks that are blocking
export const BLOCK_LOG_TIMEOUT = 60

// How long we wait for the result of a service call
export const SERVICE_CALL_LIMIT = 10  // seconds

// Source of core configuration
export const SOURCE_DISCOVERED = "discovered"
export const SOURCE_STORAGE = "storage"
export const SOURCE_YAML = "yaml"

// How long to wait until things that run on startup have to finish.
export const TIMEOUT_EVENT_START = 15

export const _LOGGER = logging.getLogger(__name__)
