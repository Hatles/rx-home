/**
 * """Configuration settings for Home Assistant."""
 */
import {Dict, Optional} from "./types";
import {HomeAssistant} from "./core";
import {ValueError} from "../exceptions";

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
    components: Set<string>;// List of loaded components
    api: Optional<any>; // API(HTTP) server configuration, see components.http.ApiConfig
    config_dir: Optional<string>; // Directory that holds the configuration
    allowlist_external_dirs: Set<string>; // List of allowed external dirs to access
    allowlist_external_urls: Set<string>; // List of allowed external URLs that integrations may use
    media_dirs: Dict<string, string>; // Dictionary of Media folders that integrations may use
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
        this.time_zone = dt_util.UTC;
        this.units = METRIC_SYSTEM;
        this.internal_url = null;
        this.external_url = null;
        this.config_source = "default";
        this.skip_pip = false;
        this.components = set();
        this.api = null;
        this.config_dir = null;
        this.allowlist_external_dirs = set();
        this.allowlist_external_urls = set();
        this.media_dirs = {};
        this.safe_mode = false;
        this.legacy_templates = false;
    }

   /**
    * Calculate distance from Home Assistant.

        Async friendly.

    */
     distance(lat: number, lon: number): Optional<number> {
        return this.units.length(location.distance(this.latitude, this.longitude, lat, lon), LENGTH_METERS)
    }

   /**
    * Generate path to the file within the configuration directory.

        Async friendly.

    */
     path(path: string): string {
        if (!this.config_dir) {
            throw new HomeAssistantError("config_dir is not set")
        }

        return os.path.join(this.config_dir, path)
    }

   /**
    * Check if an external URL is allowed.
    */
     is_allowed_external_url(url: string): boolean {
        const parsed_url = yarl.URL(url).toString();

        return this.allowlist_external_urls.any(allowed => parsed_url.startswith(allowed));
    }

   /**
    * Check if the path is valid for access from outside.
    */
     is_allowed_path(path: string): boolean {
        assert path is not null

        let thepath = pathlib.Path(path)
        try:
            // The file path does not have to exist(it's parent should)
            if thepath.exists():
                thepath = thepath.resolve()
            else:
                thepath = thepath.parent.resolve()
        except(FileNotFoundError, RuntimeError, PermissionError):
            return false

        for allowed_path in this.allowlist_external_dirs:
            try:
                thepath.relative_to(allowed_path)
                return true
            except ValueError:
                pass

        return false
    }

   /**
    * Create a dictionary representation of the configuration.

        Async friendly.

    */
     as_dict(): Dict {
        let time_zone = dt_util.UTC.zone
        if (this.time_zone && getattr(this.time_zone, "zone")) {
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
            "state": this.hass.state.value,
            "external_url": this.external_url,
            "internal_url": this.internal_url,
        }
    }

    /**
     * Help to set the time zone.
     */
    set_time_zone(time_zone_string: string): void {
        const time_zone = dt_util.get_time_zone(time_zone_string)

        if(time_zone) {
            this.time_zone = time_zone
            dt_util.set_default_time_zone(time_zone)
        }
        else {
            throw new ValueError(`Received invalid time zone ${time_zone_string}`)
        }
    }

    //@callback
    /**
     * Update the configuration from a dictionary.
     */
    private _update(
        source: string,
        latitude: Optional<number> = null,
        longitude: Optional<number> = null,
        elevation: Optional<int> = null,
        unit_system: Optional<string> = null,
        location_name: Optional<string> = null,
        time_zone: Optional<string> = null,
        // pylint: disable=dangerous-default-value // _UNDEFs not modified
        external_url: Optional<Union<string, dict>> = _UNDEF,
        internal_url: Optional<Union<string, dict>> = _UNDEF,
    ): void {
        this.config_source = source
        if latitude is not null:
            this.latitude = latitude
        if longitude is not null:
            this.longitude = longitude
        if elevation is not null:
            this.elevation = elevation
        if unit_system is not null:
            if unit_system == CONF_UNIT_SYSTEM_IMPERIAL:
                this.units = IMPERIAL_SYSTEM
            else:
                this.units = METRIC_SYSTEM
        if location_name is not null:
            this.location_name = location_name
        if time_zone is not null:
            this.set_time_zone(time_zone)
        if external_url is not _UNDEF:
            this.external_url = cast(Optional<string>, external_url)
        if internal_url is not _UNDEF:
            this.internal_url = cast(Optional<string>, internal_url)
    }

   /**
    * Update the configuration from a dictionary.
    */
    async async_update(**kwargs: Any): void {
        this._update(source=SOURCE_STORAGE, **kwargs)
        await this.async_store()
        this.hass.bus.async_fire(EVENT_CORE_CONFIG_UPDATE, kwargs)
    }

   /**
    * Load [homeassistant] core config.
    */
    async async_load(): void {
        store = this.hass.helpers.storage.Store(
            CORE_STORAGE_VERSION, CORE_STORAGE_KEY, private=True
        )
        data = await store.async_load()
    }

   /**
    * Migrate base_url to internal_url/external_url.
    */
    async migrate_base_url(_: Event): void {
            if this.hass.config.api is null:
                return

            base_url = yarl.URL(this.hass.config.api.deprecated_base_url)

            // Check if this is an internal URL
            if string(base_url.host).endswith(".local") || (
                network.is_ip_address(string(base_url.host))
                and network.is_private(ip_address(base_url.host))
            ):
                await this.async_update(
                    internal_url=network.normalize_url(string(base_url))
                )
                return

            // External, ensure this is not a loopback address
            if not(
                network.is_ip_address(string(base_url.host))
                and network.is_loopback(ip_address(base_url.host))
            ):
                await this.async_update(
                    external_url=network.normalize_url(string(base_url))
                )

        if data:
            // Try to migrate base_url to internal_url/external_url
            if "external_url" not in data:
                this.hass.bus.async_listen_once(
                    EVENT_HOMEASSISTANT_START, migrate_base_url
                )

            this._update(
                source=SOURCE_STORAGE,
                latitude=data.get("latitude"),
                longitude=data.get("longitude"),
                elevation=data.get("elevation"),
                unit_system=data.get("unit_system"),
                location_name=data.get("location_name"),
                time_zone=data.get("time_zone"),
                external_url=data.get("external_url", _UNDEF),
                internal_url=data.get("internal_url", _UNDEF),
            )
    }

   /**
    * Store [homeassistant] core config.
    */
    async async_store(): void {
        time_zone = dt_util.UTC.zone
        if this.time_zone and getattr(this.time_zone, "zone"):
            time_zone = getattr(this.time_zone, "zone")

        data = {
            "latitude": this.latitude,
            "longitude": this.longitude,
            "elevation": this.elevation,
            "unit_system": this.units.name,
            "location_name": this.location_name,
            "time_zone": time_zone,
            "external_url": this.external_url,
            "internal_url": this.internal_url,
        }

        store = this.hass.helpers.storage.Store(
            CORE_STORAGE_VERSION, CORE_STORAGE_KEY, private=True
        )
        await store.async_save(data)
    }
}
