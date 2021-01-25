/**
 * Configuration settings for Home Assistant.
 */
import {
    __version__,
    CONF_UNIT_SYSTEM_IMPERIAL,
    EVENT_CORE_CONFIG_UPDATE,
    EVENT_HOMEASSISTANT_START,
    LENGTH_METERS
} from "../const";
import {IMPERIAL_SYSTEM, METRIC_SYSTEM, UnitSystem} from "../util/unit_system";
import {unit_system} from "../helpers/config_validation";
import {HomeAssistantError, RuntimeError, ValueError} from "../exceptions";
import {getattr, hasattr} from "../util/ts/attr";
import {distance} from "../util/location";
import * as osPath from "path";
import {Dict, Optional} from "../types";
import {HomeAssistant} from "@rx-home/core";
import {get_time_zone, set_default_time_zone, UTC} from "../util/dt";
import {CORE_STORAGE_KEY, CORE_STORAGE_VERSION, SOURCE_STORAGE} from "./constants";
import {HassEvent} from "./event";
import {is_ip_address, is_loopback, is_private, normalize_url} from "../util/network";
import {Store} from "../helpers/storage";
import {assert} from "../util/ts/assert";

export interface ConfigState {
    latitude: number,
    longitude: number,
    elevation: number,
    unit_system: string,
    location_name: string,
    time_zone: string,
    external_url: string,
    internal_url: string,
}

export class Config {

    hass: HomeAssistant;
    latitude: number;
    longitude: number;
    elevation: number;
    location_name: string;
    time_zone: datetime.tzinfo;
    units: UnitSystem;
    internal_url: Optional<string>;
    external_url: Optional<string>;
    config_source: string;
    skip_pip: boolean; // If True, pip install is skipped for requirements on startup
    components: string[];// List of loaded components
    api: Optional<any>; // API(HTTP) server configuration, see components.http.ApiConfig
    config_dir: Optional<string>; // Directory that holds the configuration
    allowlist_external_dirs: string[]; // List of allowed external dirs to access
    allowlist_external_urls: string[]; // List of allowed external URLs that integrations may use
    media_dirs: Dict<string>; // Dictionary of Media folders that integrations may use
    safe_mode: boolean = false; // If Home Assistant is running in safe mode
    legacy_templates: boolean = false; // Use legacy template behavior

    /**
     * Initialize a new config object.
     */
    constructor(hass: HomeAssistant): void {
        this.hass = hass

        this.latitude = 0;
        this.longitude = 0;
        this.elevation = 0;
        this.location_name = "Home";
        this.time_zone = UTC;
        this.units = METRIC_SYSTEM;
        this.internal_url = null;
        this.external_url = null;
        this.config_source = "default";
        this.skip_pip = false;
        this.components = [];
        this.api = null;
        this.config_dir = null;
        this.allowlist_external_dirs = [];
        this.allowlist_external_urls = [];
        this.media_dirs = {};
        this.safe_mode = false;
        this.legacy_templates = false;
    }

    /**
     * Calculate distance from Home Assistant.

        Async friendly.

     */
    distance(lat: number, lon: number): Optional<number> {
        return this.units.length(
            distance(this.latitude, this.longitude, lat, lon), LENGTH_METERS
        )
    }

    /**
     * Generate path to the file within the configuration directory.

        Async friendly.

     */
    path(path: string): string {
        if (!this.config_dir) {
            throw new HomeAssistantError("config_dir is not set")
        }
        return osPath.join(this.config_dir, path)
    }

    /**
     * Check if an external URL is allowed.
     */
    is_allowed_external_url(url: string): boolean {
        const parsed_url = `${new URL(url)}/`

        return this.allowlist_external_urls.some(allowed => parsed_url.startsWith(allowed));
    }

    /**
     * Check if the path is valid for access from outside.
     */
    is_allowed_path(path) {
        assert(path)

        let thepath = osPath.parse(path)
        // try {
        //     fs.existsSync(path, );
        //     fs.accessSync(path);
        //     // The check succeeded
        // } catch (error) { //FileNotFoundError, RuntimeError, PermissionError
        //     return false
        // }

        try {
            // The file path does not have to exist (it's parent should)
            if (thepath.exists()) {
                thepath = thepath.resolve()
            }
            else {
                thepath = thepath.parent.resolve()
            }
        }
        catch (e) {
            if (e instanceof (FileNotFoundError, RuntimeError, PermissionError)) {
            return false
            }
            else {
                throw e;
            }
        }


        for(const allowed_path of this.allowlist_external_dirs) {
            try {
                thepath.relative_to(allowed_path)
                return true
            }
            catch (e) {
                if (e instanceof ValueError) {
                }
                else {
                    throw e;
                }
            }

        }

        return false
    }

    /**
     * Create a dictionary representation of the configuration.

        Async friendly.

     */
    as_dict(): Dict {
        let time_zone = UTC.zone
        if (this.time_zone && hasattr(this.time_zone, "zone")) {
            time_zone = getattr(this.time_zone, "zone")
        }

        return {
            "latitude": this.latitude,
            "longitude": this.longitude,
            "elevation": this.elevation,
            "unit_system": this.units.as_dict(),
            "location_name": this.location_name,
            "time_zone": time_zone,
            "components": this.components,
            "config_dir": this.config_dir,
            // legacy, backwards compat
            "whitelist_external_dirs": this.allowlist_external_dirs,
            "allowlist_external_dirs": this.allowlist_external_dirs,
            "allowlist_external_urls": this.allowlist_external_urls,
            "version": __version__,
            "config_source": this.config_source,
            "safe_mode": this.safe_mode,
            "state": this.hass.state,
            "external_url": this.external_url,
            "internal_url": this.internal_url,
        }
    }

    /**
     * Help to set the time zone.
     */
    set_time_zone(time_zone_str: string) {
        const time_zone = get_time_zone(time_zone_str)

        if (time_zone) {
            this.time_zone = time_zone
            set_default_time_zone(time_zone)
        }
        else {
            throw new ValueError(`Received invalid time zone ${time_zone_str}`)
        }
    }

    // @callback
    /**
     * Update the configuration from a dictionary.
     */
    private _update(
        source: string,
        state: Partial<ConfigState>
    ) {
        this.config_source = source
        if (state.latitude) {
            this.latitude = state.latitude
        }
        if (state.longitude) {
            this.longitude = state.longitude
        }
        if (state.elevation) {
            this.elevation = state.elevation
        }
        if (state.unit_system) {
            if (state.unit_system === CONF_UNIT_SYSTEM_IMPERIAL) {
                this.units = IMPERIAL_SYSTEM
            }
            else {
                this.units = METRIC_SYSTEM
            }
        }
        if (state.location_name) {
            this.location_name = state.location_name
        }
        if (state.time_zone) {
            this.set_time_zone(state.time_zone)
        }
        if (state.external_url) {
            this.external_url = state.external_url
        }
        if (state.internal_url) {
            this.internal_url = state.internal_url
        }
    }

    /**
     * Update the configuration from a dictionary.
     */
    async async_update(state: Partial<ConfigState>) {
        this._update(SOURCE_STORAGE, state)
        await this.async_store()
        this.hass.bus.fire(EVENT_CORE_CONFIG_UPDATE, state)
    }

    /**
     * Load [homeassistant] core config.
     */
    async async_load() {
        const store = new (await this.hass.helpers.get('storage')).get('Store')(CORE_STORAGE_VERSION, CORE_STORAGE_KEY, private=true)
        const data = await store.async_load()

        /**
         * Migrate base_url to internal_url/external_url.
         */
        const migrate_base_url = async (event: HassEvent) => {
            if (!this.hass.config.api) {
                return
            }

            const base_url = new URL(this.hass.config.api.deprecated_base_url)

            // Check if this is an internal URL
            if (base_url.host.endsWith(".local") || (
                is_ip_address(base_url.host) && is_private(ip_address(base_url.host))
            )) {
                await this.async_update({internal_url: normalize_url(base_url.toString())})
                return
            }

            // External, ensure this is not a loopback address
            if (!(is_ip_address(base_url.host) && is_loopback(ip_address(base_url.host)))) {
                await this.async_update({external_url: normalize_url(base_url.toString())})
            }
        }

        if (data) {
            // Try to migrate base_url to internal_url/external_url
            if (!data["external_url"]) {
                this.hass.bus.listen_once(
                    EVENT_HOMEASSISTANT_START, migrate_base_url
                )
            }

            this._update(
                SOURCE_STORAGE,
                {
                    latitude: data.get("latitude"),
                    longitude: data.get("longitude"),
                    elevation: data.get("elevation"),
                    unit_system: data.get("unit_system"),
                    location_name: data.get("location_name"),
                    time_zone: data.get("time_zone"),
                    external_url: data.get("external_url"),
                    internal_url: data.get("internal_url")
                }
            )
        }
    }

    /**
     * Store [homeassistant] core config.
     */
    async async_store() {
        let time_zone = UTC.zone
        if (this.time_zone && getattr(this.time_zone, "zone")) {
            time_zone = getattr(this.time_zone, "zone")
        }

        const data = {
            "latitude": this.latitude,
            "longitude": this.longitude,
            "elevation": this.elevation,
            "unit_system": this.units.name,
            "location_name": this.location_name,
            "time_zone": time_zone,
            "external_url": this.external_url,
            "internal_url": this.internal_url,
        }

       const store = new Store(this.hass, CORE_STORAGE_VERSION, CORE_STORAGE_KEY, true)
        await store.async_save(data)
    }
}
