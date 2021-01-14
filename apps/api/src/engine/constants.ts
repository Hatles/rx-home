/**
 * Constants used by Home Assistant components.
 */

export const MAJOR_VERSION = 2021
export const MINOR_VERSION = 2
export const PATCH_VERSION = "0.dev0"
export const __short_version__ = `${MAJOR_VERSION}.${MINOR_VERSION}`
export const __version__ = `${__short_version__}.${PATCH_VERSION}`
export const REQUIRED_PYTHON_VER = [3, 8, 0]
// Truthy date string triggers showing related deprecation warning messages.
export const REQUIRED_NEXT_PYTHON_VER = [3, 9, 0]
export const REQUIRED_NEXT_PYTHON_DATE = ""

// Format for platform files
export const PLATFORM_FORMAT = "{platform}.{domain}"

// Can be used to specify a catch all when registering state or event listeners.
export const MATCH_ALL = "*"

// Entity target all constant
export const ENTITY_MATCH_NONE = "none"
export const ENTITY_MATCH_ALL = "all"

// If no name is specified
export const DEVICE_DEFAULT_NAME = "Unnamed Device"

// Sun events
export const SUN_EVENT_SUNSET = "sunset"
export const SUN_EVENT_SUNRISE = "sunrise"

// ###// CONFIG ####
export const CONF_ABOVE = "above"
export const CONF_ACCESS_TOKEN = "access_token"
export const CONF_ADDRESS = "address"
export const CONF_AFTER = "after"
export const CONF_ALIAS = "alias"
export const CONF_ALLOWLIST_EXTERNAL_URLS = "allowlist_external_urls"
export const CONF_API_KEY = "api_key"
export const CONF_API_TOKEN = "api_token"
export const CONF_API_VERSION = "api_version"
export const CONF_ARMING_TIME = "arming_time"
export const CONF_AT = "at"
export const CONF_ATTRIBUTE = "attribute"
export const CONF_AUTH_MFA_MODULES = "auth_mfa_modules"
export const CONF_AUTH_PROVIDERS = "auth_providers"
export const CONF_AUTHENTICATION = "authentication"
export const CONF_BASE = "base"
export const CONF_BEFORE = "before"
export const CONF_BELOW = "below"
export const CONF_BINARY_SENSORS = "binary_sensors"
export const CONF_BRIGHTNESS = "brightness"
export const CONF_BROADCAST_ADDRESS = "broadcast_address"
export const CONF_BROADCAST_PORT = "broadcast_port"
export const CONF_CHOOSE = "choose"
export const CONF_CLIENT_ID = "client_id"
export const CONF_CLIENT_SECRET = "client_secret"
export const CONF_CODE = "code"
export const CONF_COLOR_TEMP = "color_temp"
export const CONF_COMMAND = "command"
export const CONF_COMMAND_CLOSE = "command_close"
export const CONF_COMMAND_OFF = "command_off"
export const CONF_COMMAND_ON = "command_on"
export const CONF_COMMAND_OPEN = "command_open"
export const CONF_COMMAND_STATE = "command_state"
export const CONF_COMMAND_STOP = "command_stop"
export const CONF_CONDITION = "condition"
export const CONF_CONDITIONS = "conditions"
export const CONF_CONTINUE_ON_TIMEOUT = "continue_on_timeout"
export const CONF_COUNT = "count"
export const CONF_COVERS = "covers"
export const CONF_CURRENCY = "currency"
export const CONF_CUSTOMIZE = "customize"
export const CONF_CUSTOMIZE_DOMAIN = "customize_domain"
export const CONF_CUSTOMIZE_GLOB = "customize_glob"
export const CONF_DEFAULT = "default"
export const CONF_DELAY = "delay"
export const CONF_DELAY_TIME = "delay_time"
export const CONF_DEVICE = "device"
export const CONF_DEVICES = "devices"
export const CONF_DEVICE_CLASS = "device_class"
export const CONF_DEVICE_ID = "device_id"
export const CONF_DISARM_AFTER_TRIGGER = "disarm_after_trigger"
export const CONF_DISCOVERY = "discovery"
export const CONF_DISKS = "disks"
export const CONF_DISPLAY_CURRENCY = "display_currency"
export const CONF_DISPLAY_OPTIONS = "display_options"
export const CONF_DOMAIN = "domain"
export const CONF_DOMAINS = "domains"
export const CONF_EFFECT = "effect"
export const CONF_ELEVATION = "elevation"
export const CONF_EMAIL = "email"
export const CONF_ENTITIES = "entities"
export const CONF_ENTITY_ID = "entity_id"
export const CONF_ENTITY_NAMESPACE = "entity_namespace"
export const CONF_ENTITY_PICTURE_TEMPLATE = "entity_picture_template"
export const CONF_EVENT = "event"
export const CONF_EVENT_DATA = "event_data"
export const CONF_EVENT_DATA_TEMPLATE = "event_data_template"
export const CONF_EXCLUDE = "exclude"
export const CONF_EXTERNAL_URL = "external_url"
export const CONF_FILENAME = "filename"
export const CONF_FILE_PATH = "file_path"
export const CONF_FOR = "for"
export const CONF_FORCE_UPDATE = "force_update"
export const CONF_FRIENDLY_NAME = "friendly_name"
export const CONF_FRIENDLY_NAME_TEMPLATE = "friendly_name_template"
export const CONF_HEADERS = "headers"
export const CONF_HOST = "host"
export const CONF_HOSTS = "hosts"
export const CONF_HS = "hs"
export const CONF_ICON = "icon"
export const CONF_ICON_TEMPLATE = "icon_template"
export const CONF_ID = "id"
export const CONF_INCLUDE = "include"
export const CONF_INTERNAL_URL = "internal_url"
export const CONF_IP_ADDRESS = "ip_address"
export const CONF_LATITUDE = "latitude"
export const CONF_LEGACY_TEMPLATES = "legacy_templates"
export const CONF_LIGHTS = "lights"
export const CONF_LONGITUDE = "longitude"
export const CONF_MAC = "mac"
export const CONF_MAXIMUM = "maximum"
export const CONF_MEDIA_DIRS = "media_dirs"
export const CONF_METHOD = "method"
export const CONF_MINIMUM = "minimum"
export const CONF_MODE = "mode"
export const CONF_MONITORED_CONDITIONS = "monitored_conditions"
export const CONF_MONITORED_VARIABLES = "monitored_variables"
export const CONF_NAME = "name"
export const CONF_OFFSET = "offset"
export const CONF_OPTIMISTIC = "optimistic"
export const CONF_PACKAGES = "packages"
export const CONF_PARAMS = "params"
export const CONF_PASSWORD = "password"
export const CONF_PATH = "path"
export const CONF_PAYLOAD = "payload"
export const CONF_PAYLOAD_OFF = "payload_off"
export const CONF_PAYLOAD_ON = "payload_on"
export const CONF_PENDING_TIME = "pending_time"
export const CONF_PIN = "pin"
export const CONF_PLATFORM = "platform"
export const CONF_PORT = "port"
export const CONF_PREFIX = "prefix"
export const CONF_PROFILE_NAME = "profile_name"
export const CONF_PROTOCOL = "protocol"
export const CONF_PROXY_SSL = "proxy_ssl"
export const CONF_QUOTE = "quote"
export const CONF_RADIUS = "radius"
export const CONF_RECIPIENT = "recipient"
export const CONF_REGION = "region"
export const CONF_REPEAT = "repeat"
export const CONF_RESOURCE = "resource"
export const CONF_RESOURCES = "resources"
export const CONF_RESOURCE_TEMPLATE = "resource_template"
export const CONF_RGB = "rgb"
export const CONF_ROOM = "room"
export const CONF_SCAN_INTERVAL = "scan_interval"
export const CONF_SCENE = "scene"
export const CONF_SELECTOR = "selector"
export const CONF_SENDER = "sender"
export const CONF_SENSORS = "sensors"
export const CONF_SENSOR_TYPE = "sensor_type"
export const CONF_SEQUENCE = "sequence"
export const CONF_SERVICE = "service"
export const CONF_SERVICE_DATA = "data"
export const CONF_SERVICE_TEMPLATE = "service_template"
export const CONF_SHOW_ON_MAP = "show_on_map"
export const CONF_SLAVE = "slave"
export const CONF_SOURCE = "source"
export const CONF_SSL = "ssl"
export const CONF_STATE = "state"
export const CONF_STATE_TEMPLATE = "state_template"
export const CONF_STRUCTURE = "structure"
export const CONF_SWITCHES = "switches"
export const CONF_TARGET = "target"
export const CONF_TEMPERATURE_UNIT = "temperature_unit"
export const CONF_TIMEOUT = "timeout"
export const CONF_TIME_ZONE = "time_zone"
export const CONF_TOKEN = "token"
export const CONF_TRIGGER_TIME = "trigger_time"
export const CONF_TTL = "ttl"
export const CONF_TYPE = "type"
export const CONF_UNIQUE_ID = "unique_id"
export const CONF_UNIT_OF_MEASUREMENT = "unit_of_measurement"
export const CONF_UNIT_SYSTEM = "unit_system"
export const CONF_UNTIL = "until"
export const CONF_URL = "url"
export const CONF_USERNAME = "username"
export const CONF_VALUE_TEMPLATE = "value_template"
export const CONF_VARIABLES = "variables"
export const CONF_VERIFY_SSL = "verify_ssl"
export const CONF_WAIT_FOR_TRIGGER = "wait_for_trigger"
export const CONF_WAIT_TEMPLATE = "wait_template"
export const CONF_WEBHOOK_ID = "webhook_id"
export const CONF_WEEKDAY = "weekday"
export const CONF_WHILE = "while"
export const CONF_WHITELIST = "whitelist"
export const CONF_ALLOWLIST_EXTERNAL_DIRS = "allowlist_external_dirs"
export const LEGACY_CONF_WHITELIST_EXTERNAL_DIRS = "whitelist_external_dirs"
export const CONF_WHITE_VALUE = "white_value"
export const CONF_XY = "xy"
export const CONF_ZONE = "zone"

// ###// EVENTS ####
export const EVENT_CALL_SERVICE = "call_service"
export const EVENT_COMPONENT_LOADED = "component_loaded"
export const EVENT_CORE_CONFIG_UPDATE = "core_config_updated"
export const EVENT_HOMEASSISTANT_CLOSE = "homeassistant_close"
export const EVENT_HOMEASSISTANT_START = "homeassistant_start"
export const EVENT_HOMEASSISTANT_STARTED = "homeassistant_started"
export const EVENT_HOMEASSISTANT_STOP = "homeassistant_stop"
export const EVENT_HOMEASSISTANT_FINAL_WRITE = "homeassistant_final_write"
export const EVENT_LOGBOOK_ENTRY = "logbook_entry"
export const EVENT_PLATFORM_DISCOVERED = "platform_discovered"
export const EVENT_SERVICE_REGISTERED = "service_registered"
export const EVENT_SERVICE_REMOVED = "service_removed"
export const EVENT_STATE_CHANGED = "state_changed"
export const EVENT_THEMES_UPDATED = "themes_updated"
export const EVENT_TIMER_OUT_OF_SYNC = "timer_out_of_sync"
export const EVENT_TIME_CHANGED = "time_changed"


// ###// DEVICE CLASSES ####
export const DEVICE_CLASS_BATTERY = "battery"
export const DEVICE_CLASS_HUMIDITY = "humidity"
export const DEVICE_CLASS_ILLUMINANCE = "illuminance"
export const DEVICE_CLASS_SIGNAL_STRENGTH = "signal_strength"
export const DEVICE_CLASS_TEMPERATURE = "temperature"
export const DEVICE_CLASS_TIMESTAMP = "timestamp"
export const DEVICE_CLASS_PRESSURE = "pressure"
export const DEVICE_CLASS_POWER = "power"
export const DEVICE_CLASS_CURRENT = "current"
export const DEVICE_CLASS_ENERGY = "energy"
export const DEVICE_CLASS_POWER_FACTOR = "power_factor"
export const DEVICE_CLASS_VOLTAGE = "voltage"

// ###// STATES ####
export const STATE_ON = "on"
export const STATE_OFF = "off"
export const STATE_HOME = "home"
export const STATE_NOT_HOME = "not_home"
export const STATE_UNKNOWN = "unknown"
export const STATE_OPEN = "open"
export const STATE_OPENING = "opening"
export const STATE_CLOSED = "closed"
export const STATE_CLOSING = "closing"
export const STATE_PLAYING = "playing"
export const STATE_PAUSED = "paused"
export const STATE_IDLE = "idle"
export const STATE_STANDBY = "standby"
export const STATE_ALARM_DISARMED = "disarmed"
export const STATE_ALARM_ARMED_HOME = "armed_home"
export const STATE_ALARM_ARMED_AWAY = "armed_away"
export const STATE_ALARM_ARMED_NIGHT = "armed_night"
export const STATE_ALARM_ARMED_CUSTOM_BYPASS = "armed_custom_bypass"
export const STATE_ALARM_PENDING = "pending"
export const STATE_ALARM_ARMING = "arming"
export const STATE_ALARM_DISARMING = "disarming"
export const STATE_ALARM_TRIGGERED = "triggered"
export const STATE_LOCKED = "locked"
export const STATE_UNLOCKED = "unlocked"
export const STATE_UNAVAILABLE = "unavailable"
export const STATE_OK = "ok"
export const STATE_PROBLEM = "problem"

// ###// STATE AND EVENT ATTRIBUTES ####
// Attribution
export const ATTR_ATTRIBUTION = "attribution"

// Credentials
export const ATTR_CREDENTIALS = "credentials"

// Contains time-related attributes
export const ATTR_NOW = "now"
export const ATTR_DATE = "date"
export const ATTR_TIME = "time"
export const ATTR_SECONDS = "seconds"

// Contains domain, service for a SERVICE_CALL event
export const ATTR_DOMAIN = "domain"
export const ATTR_SERVICE = "service"
export const ATTR_SERVICE_DATA = "service_data"

// IDs
export const ATTR_ID = "id"

// Name
export const ATTR_NAME = "name"

// Contains one string or a list of strings, each being an entity id
export const ATTR_ENTITY_ID = "entity_id"

// Contains one string or a list of strings, each being an area id
export const ATTR_AREA_ID = "area_id"

// Contains one string, the device ID
export const ATTR_DEVICE_ID = "device_id"

// String with a friendly name for the entity
export const ATTR_FRIENDLY_NAME = "friendly_name"

// A picture to represent entity
export const ATTR_ENTITY_PICTURE = "entity_picture"

// Icon to use in the frontend
export const ATTR_ICON = "icon"

// The unit of measurement if applicable
export const ATTR_UNIT_OF_MEASUREMENT = "unit_of_measurement"

export const CONF_UNIT_SYSTEM_METRIC: string = "metric"
export const CONF_UNIT_SYSTEM_IMPERIAL: string = "imperial"

// Electrical attributes
export const ATTR_VOLTAGE = "voltage"

// Contains the information that is discovered
export const ATTR_DISCOVERED = "discovered"

// Location of the device/sensor
export const ATTR_LOCATION = "location"

export const ATTR_MODE = "mode"

export const ATTR_BATTERY_CHARGING = "battery_charging"
export const ATTR_BATTERY_LEVEL = "battery_level"
export const ATTR_WAKEUP = "wake_up_interval"

// For devices which support a code attribute
export const ATTR_CODE = "code"
export const ATTR_CODE_FORMAT = "code_format"

// For calling a device specific command
export const ATTR_COMMAND = "command"

// For devices which support an armed state
export const ATTR_ARMED = "device_armed"

// For devices which support a locked state
export const ATTR_LOCKED = "locked"

// For sensors that support 'tripping', eg. motion and door sensors
export const ATTR_TRIPPED = "device_tripped"

// For sensors that support 'tripping' this holds the most recent
// time the device was tripped
export const ATTR_LAST_TRIP_TIME = "last_tripped_time"

// For all entity's, this hold whether or not it should be hidden
export const ATTR_HIDDEN = "hidden"

// Location of the entity
export const ATTR_LATITUDE = "latitude"
export const ATTR_LONGITUDE = "longitude"

// Accuracy of location in meters
export const ATTR_GPS_ACCURACY = "gps_accuracy"

// If state is assumed
export const ATTR_ASSUMED_STATE = "assumed_state"
export const ATTR_STATE = "state"

export const ATTR_EDITABLE = "editable"
export const ATTR_OPTION = "option"

// The entity has been restored with restore state
export const ATTR_RESTORED = "restored"

// Bitfield of supported component features for the entity
export const ATTR_SUPPORTED_FEATURES = "supported_features"

// Class of device within its domain
export const ATTR_DEVICE_CLASS = "device_class"

// Temperature attribute
export const ATTR_TEMPERATURE = "temperature"

// ###// UNITS OF MEASUREMENT ####
// Power units
export const POWER_WATT = "W"
export const POWER_KILO_WATT = "kW"

// Voltage units
export const VOLT = "V"

// Energy units
export const ENERGY_WATT_HOUR = "Wh"
export const ENERGY_KILO_WATT_HOUR = "kWh"

// Electrical units
export const ELECTRICAL_CURRENT_AMPERE = "A"
export const ELECTRICAL_VOLT_AMPERE = "VA"

// Degree units
export const DEGREE = "°"

// Currency units
export const CURRENCY_EURO = "€"
export const CURRENCY_DOLLAR = "$"
export const CURRENCY_CENT = "¢"

// Temperature units
export const TEMP_CELSIUS = "°C"
export const TEMP_FAHRENHEIT = "°F"
export const TEMP_KELVIN = "K"

// Time units
export const TIME_MICROSECONDS = "μs"
export const TIME_MILLISECONDS = "ms"
export const TIME_SECONDS = "s"
export const TIME_MINUTES = "min"
export const TIME_HOURS = "h"
export const TIME_DAYS = "d"
export const TIME_WEEKS = "w"
export const TIME_MONTHS = "m"
export const TIME_YEARS = "y"

// Length units
export const LENGTH_MILLIMETERS: string = "mm"
export const LENGTH_CENTIMETERS: string = "cm"
export const LENGTH_METERS: string = "m"
export const LENGTH_KILOMETERS: string = "km"

export const LENGTH_INCHES: string = "in"
export const LENGTH_FEET: string = "ft"
export const LENGTH_YARD: string = "yd"
export const LENGTH_MILES: string = "mi"

// Frequency units
export const FREQUENCY_HERTZ = "Hz"
export const FREQUENCY_GIGAHERTZ = "GHz"

// Pressure units
export const PRESSURE_PA: string = "Pa"
export const PRESSURE_HPA: string = "hPa"
export const PRESSURE_BAR: string = "bar"
export const PRESSURE_MBAR: string = "mbar"
export const PRESSURE_INHG: string = "inHg"
export const PRESSURE_PSI: string = "psi"

// Volume units
export const VOLUME_LITERS: string = "L"
export const VOLUME_MILLILITERS: string = "mL"
export const VOLUME_CUBIC_METERS = "m³"
export const VOLUME_CUBIC_FEET = "ft³"

export const VOLUME_GALLONS: string = "gal"
export const VOLUME_FLUID_OUNCE: string = "fl. oz."

// Volume Flow Rate units
export const VOLUME_FLOW_RATE_CUBIC_METERS_PER_HOUR = "m³/h"
export const VOLUME_FLOW_RATE_CUBIC_FEET_PER_MINUTE = "ft³/m"

// Area units
export const AREA_SQUARE_METERS = "m²"

// Mass units
export const MASS_GRAMS: string = "g"
export const MASS_KILOGRAMS: string = "kg"
export const MASS_MILLIGRAMS = "mg"
export const MASS_MICROGRAMS = "µg"

export const MASS_OUNCES: string = "oz"
export const MASS_POUNDS: string = "lb"

// Conductivity units
export const CONDUCTIVITY: string = "µS/cm"

// Light units
export const LIGHT_LUX: string = "lx"

// UV Index units
export const UV_INDEX: string = "UV index"

// Percentage units
export const PERCENTAGE = "%"

// Irradiation units
export const IRRADIATION_WATTS_PER_SQUARE_METER = "W/m²"

// Precipitation units
export const PRECIPITATION_MILLIMETERS_PER_HOUR = "mm/h"

// Concentration units
export const CONCENTRATION_MICROGRAMS_PER_CUBIC_METER = "µg/m³"
export const CONCENTRATION_MILLIGRAMS_PER_CUBIC_METER = "mg/m³"
export const CONCENTRATION_PARTS_PER_CUBIC_METER = "p/m³"
export const CONCENTRATION_PARTS_PER_MILLION = "ppm"
export const CONCENTRATION_PARTS_PER_BILLION = "ppb"

// Speed units
export const SPEED_MILLIMETERS_PER_DAY = "mm/d"
export const SPEED_INCHES_PER_DAY = "in/d"
export const SPEED_METERS_PER_SECOND = "m/s"
export const SPEED_INCHES_PER_HOUR = "in/h"
export const SPEED_KILOMETERS_PER_HOUR = "km/h"
export const SPEED_MILES_PER_HOUR = "mph"

// Signal_strength units
export const SIGNAL_STRENGTH_DECIBELS = "dB"
export const SIGNAL_STRENGTH_DECIBELS_MILLIWATT = "dBm"

// Data units
export const DATA_BITS = "bit"
export const DATA_KILOBITS = "kbit"
export const DATA_MEGABITS = "Mbit"
export const DATA_GIGABITS = "Gbit"
export const DATA_BYTES = "B"
export const DATA_KILOBYTES = "kB"
export const DATA_MEGABYTES = "MB"
export const DATA_GIGABYTES = "GB"
export const DATA_TERABYTES = "TB"
export const DATA_PETABYTES = "PB"
export const DATA_EXABYTES = "EB"
export const DATA_ZETTABYTES = "ZB"
export const DATA_YOTTABYTES = "YB"
export const DATA_KIBIBYTES = "KiB"
export const DATA_MEBIBYTES = "MiB"
export const DATA_GIBIBYTES = "GiB"
export const DATA_TEBIBYTES = "TiB"
export const DATA_PEBIBYTES = "PiB"
export const DATA_EXBIBYTES = "EiB"
export const DATA_ZEBIBYTES = "ZiB"
export const DATA_YOBIBYTES = "YiB"
export const DATA_RATE_BITS_PER_SECOND = "bit/s"
export const DATA_RATE_KILOBITS_PER_SECOND = "kbit/s"
export const DATA_RATE_MEGABITS_PER_SECOND = "Mbit/s"
export const DATA_RATE_GIGABITS_PER_SECOND = "Gbit/s"
export const DATA_RATE_BYTES_PER_SECOND = "B/s"
export const DATA_RATE_KILOBYTES_PER_SECOND = "kB/s"
export const DATA_RATE_MEGABYTES_PER_SECOND = "MB/s"
export const DATA_RATE_GIGABYTES_PER_SECOND = "GB/s"
export const DATA_RATE_KIBIBYTES_PER_SECOND = "KiB/s"
export const DATA_RATE_MEBIBYTES_PER_SECOND = "MiB/s"
export const DATA_RATE_GIBIBYTES_PER_SECOND = "GiB/s"

// ###// SERVICES ####
export const SERVICE_HOMEASSISTANT_STOP = "stop"
export const SERVICE_HOMEASSISTANT_RESTART = "restart"

export const SERVICE_TURN_ON = "turn_on"
export const SERVICE_TURN_OFF = "turn_off"
export const SERVICE_TOGGLE = "toggle"
export const SERVICE_RELOAD = "reload"

export const SERVICE_VOLUME_UP = "volume_up"
export const SERVICE_VOLUME_DOWN = "volume_down"
export const SERVICE_VOLUME_MUTE = "volume_mute"
export const SERVICE_VOLUME_SET = "volume_set"
export const SERVICE_MEDIA_PLAY_PAUSE = "media_play_pause"
export const SERVICE_MEDIA_PLAY = "media_play"
export const SERVICE_MEDIA_PAUSE = "media_pause"
export const SERVICE_MEDIA_STOP = "media_stop"
export const SERVICE_MEDIA_NEXT_TRACK = "media_next_track"
export const SERVICE_MEDIA_PREVIOUS_TRACK = "media_previous_track"
export const SERVICE_MEDIA_SEEK = "media_seek"
export const SERVICE_REPEAT_SET = "repeat_set"
export const SERVICE_SHUFFLE_SET = "shuffle_set"

export const SERVICE_ALARM_DISARM = "alarm_disarm"
export const SERVICE_ALARM_ARM_HOME = "alarm_arm_home"
export const SERVICE_ALARM_ARM_AWAY = "alarm_arm_away"
export const SERVICE_ALARM_ARM_NIGHT = "alarm_arm_night"
export const SERVICE_ALARM_ARM_CUSTOM_BYPASS = "alarm_arm_custom_bypass"
export const SERVICE_ALARM_TRIGGER = "alarm_trigger"


export const SERVICE_LOCK = "lock"
export const SERVICE_UNLOCK = "unlock"

export const SERVICE_OPEN = "open"
export const SERVICE_CLOSE = "close"

export const SERVICE_CLOSE_COVER = "close_cover"
export const SERVICE_CLOSE_COVER_TILT = "close_cover_tilt"
export const SERVICE_OPEN_COVER = "open_cover"
export const SERVICE_OPEN_COVER_TILT = "open_cover_tilt"
export const SERVICE_SET_COVER_POSITION = "set_cover_position"
export const SERVICE_SET_COVER_TILT_POSITION = "set_cover_tilt_position"
export const SERVICE_STOP_COVER = "stop_cover"
export const SERVICE_STOP_COVER_TILT = "stop_cover_tilt"
export const SERVICE_TOGGLE_COVER_TILT = "toggle_cover_tilt"

export const SERVICE_SELECT_OPTION = "select_option"

// ###// API / REMOTE ####
export const SERVER_PORT = 8123

export const URL_ROOT = "/"
export const URL_API = "/api/"
export const URL_API_STREAM = "/api/stream"
export const URL_API_CONFIG = "/api/config"
export const URL_API_DISCOVERY_INFO = "/api/discovery_info"
export const URL_API_STATES = "/api/states"
export const URL_API_STATES_ENTITY = "/api/states/{}"
export const URL_API_EVENTS = "/api/events"
export const URL_API_EVENTS_EVENT = "/api/events/{}"
export const URL_API_SERVICES = "/api/services"
export const URL_API_SERVICES_SERVICE = "/api/services/{}/{}"
export const URL_API_COMPONENTS = "/api/components"
export const URL_API_ERROR_LOG = "/api/error_log"
export const URL_API_LOG_OUT = "/api/log_out"
export const URL_API_TEMPLATE = "/api/template"

export const HTTP_OK = 200
export const HTTP_CREATED = 201
export const HTTP_ACCEPTED = 202
export const HTTP_MOVED_PERMANENTLY = 301
export const HTTP_BAD_REQUEST = 400
export const HTTP_UNAUTHORIZED = 401
export const HTTP_FORBIDDEN = 403
export const HTTP_NOT_FOUND = 404
export const HTTP_METHOD_NOT_ALLOWED = 405
export const HTTP_UNPROCESSABLE_ENTITY = 422
export const HTTP_TOO_MANY_REQUESTS = 429
export const HTTP_INTERNAL_SERVER_ERROR = 500
export const HTTP_BAD_GATEWAY = 502
export const HTTP_SERVICE_UNAVAILABLE = 503

export const HTTP_BASIC_AUTHENTICATION = "basic"
export const HTTP_DIGEST_AUTHENTICATION = "digest"

export const HTTP_HEADER_X_REQUESTED_WITH = "X-Requested-With"

export const CONTENT_TYPE_JSON = "application/json"
export const CONTENT_TYPE_MULTIPART = "multipart/x-mixed-replace; boundary={}"
export const CONTENT_TYPE_TEXT_PLAIN = "text/plain"

// The exit code to send to request a restart
export const RESTART_EXIT_CODE = 100

export const UNIT_NOT_RECOGNIZED_TEMPLATE: string = "{} is not a recognized {} unit."

export const LENGTH: string = "length"
export const MASS: string = "mass"
export const PRESSURE: string = "pressure"
export const VOLUME: string = "volume"
export const TEMPERATURE: string = "temperature"
export const SPEED_MS: string = "speed_ms"
export const ILLUMINANCE: string = "illuminance"

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

// The degree of precision for platforms
export const PRECISION_WHOLE = 1
export const PRECISION_HALVES = 0.5
export const PRECISION_TENTHS = 0.1

// Static list of entities that will never be exposed to
// cloud, alexa, or google_home components
export const CLOUD_NEVER_EXPOSED_ENTITIES = ["group.all_locks"]

// The ID of the Home Assistant Cast App
export const CAST_APP_ID_HOMEASSISTANT = "B12CE3CA"
