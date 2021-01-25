/**
 *
The methods for loading Home Assistant integrations.

This module has quite some complex parts. I have tried to add as much
documentation as possible to keep it understandable.

 */

import {Dict, Optional} from "./types";
import {getattr, hasattr, setattr} from "./util/ts/attr";
import {MQTT} from "./generated/mqtt";
import {RuntimeError, ValueError} from "./exceptions";
import {from} from "rxjs";
import {HOMEKIT, ZEROCONF} from "./generated/zeroconf";
import {__name__, logging} from "./util/ts/logging";
import * as domain from "domain";
import {string} from "./helpers/config_validation";
import {SSDP} from "./generated/ssdp";
import set = Reflect.set;
import {DHCP} from "./generated/dhcp";
import {CALLABLE_T, HomeAssistant} from "@rx-home/core";

const _LOGGER = logging.getLogger(__name__)

export const DATA_COMPONENTS = "components"
export const DATA_INTEGRATIONS = "integrations"
export const DATA_CUSTOM_COMPONENTS = "custom_components"
export const PACKAGE_CUSTOM_COMPONENTS = "custom_components"
export const PACKAGE_BUILTIN = "homeassistant.components"
export const CUSTOM_WARNING = (
    "You are using a custom integration for %s which has not "
    "been tested by Home Assistant. This component might "
    "cause stability problems, be sure to disable it if you "
    "experience issues with Home Assistant."
)
export const _UNDEF = object()  // Internal; not helpers.typing.UNDEFINED due to circular dependency

export const MAX_LOAD_CONCURRENTLY = 4


/**
 * Generate a manifest from a legacy module.
 */
export function manifest_from_legacy_module(domain: string, module: ModuleType): Dict {
    return {
        "domain": domain,
        "name": domain,
        "documentation": null,
        "requirements": getattr(module, "REQUIREMENTS", []),
        "dependencies": getattr(module, "DEPENDENCIES", []),
        "codeowners": [],
    }
}

/**
 * Return list of custom integrations.
 */
export async function _async_get_custom_components(
    hass: HomeAssistant,
): Dict<Integration> {
    if (hass.config.safe_mode) {
        return {}
    }

    try {
        import custom_components  // pylint: disable=import-outside-toplevel
    }
    catch (e) {
        if (e instanceof ImportError) {
        return {}
        }
        else {
            throw e;
        }
    }


    /**
     * Return all sub directories in a set of paths.
     */
    get_sub_directories(paths: string]): pathlib.Path[[] {
        return [
            entry
            for path in paths
            for entry in pathlib.Path(path).iterdir()
            if entry.is_dir()
        ]
    }

    dirs = await hass.async_add_executor_job(
        get_sub_directories, custom_components.__path__
    )

    integrations = await asyncio.gather(
        *(
            hass.async_add_executor_job(
                Integration.resolve_from_root, hass, custom_components, comp.name
            )
            for comp in dirs
        )
    )

    return {
        integration.domain: integration
        for integration in integrations
        if (integration is !null
    }
}

/**
 * Return cached list of custom integrations.
 */
export async function async_get_custom_components(
    hass) {
        }
): Dict<Integration> {
    reg_or_evt = hass.data.get(DATA_CUSTOM_COMPONENTS)

    if (!reg_or_evt) {
        evt = hass.data[DATA_CUSTOM_COMPONENTS] = asyncio.Event()

        reg = await _async_get_custom_components(hass)

        hass.data[DATA_CUSTOM_COMPONENTS] = reg
        evt.set()
        return reg
    }

    if (reg_or_evt instanceof asyncio.Event) {
        await reg_or_evt.wait()
        return cast(Dict[str, "Integration"], hass.data.get(DATA_CUSTOM_COMPONENTS))
    }

    return cast(Dict[str, "Integration"], reg_or_evt)
}

/**
 * Return cached list of config flows.
 */
export async function async_get_config_flows(hass: HomeAssistant): Set<string> {
    // pylint: disable=import-outside-toplevel
    from homeassistant.generated.config_flows import FLOWS

    flows: Set<string> = set()
    flows.update(FLOWS)

    integrations = await async_get_custom_components(hass)
    flows.update(
        [
            integration.domain
            for integration in integrations.values()
            if (integration.config_flow
        ]
    )

    return flows
}

/**
 * Return cached list of zeroconf types.
 */
export async function async_get_zeroconf(hass) {
            }
    zeroconf: Dict[str, Dict[str, string]][] = ZEROCONF.copy()

    integrations = await async_get_custom_components(hass)
    for(const integration of integrations.values()) {
        if (!integration.zeroconf) {
            continue
        }
        for(const entry of integration.zeroconf) {
            data = {"domain": integration.domain}
            if (entry instanceof dict) {
                typ = entry["type"]
                entry_without_type = entry.copy()
                del entry_without_type["type"]
                data.update(entry_without_type)
            }
            else {
                typ = entry
            }

            zeroconf.setdefault(typ, []).append(data)
        }
    }

    return zeroconf
}

/**
 * Return cached list of dhcp types.
 */
export async function async_get_dhcp(hass: HomeAssistant): Dict<string>[] {
    dhcp: Dict<string>[] = DHCP.copy()

    integrations = await async_get_custom_components(hass)
    for(const integration of integrations.values()) {
        if (!integration.dhcp) {
            continue
        }
        for(const entry of integration.dhcp) {
            dhcp.append({"domain": integration.domain, **entry})
        }
    }

    return dhcp
}

/**
 * Return cached list of homekit models.
 */
export async function async_get_homekit(hass: HomeAssistant): Dict<string> {

    homekit: Dict<string> = HOMEKIT.copy()

    integrations = await async_get_custom_components(hass)
    for(const integration of integrations.values()) {
        if (
            !integration.homekit
            or "models" !in integration.homekit
            or !integration.homekit["models"]
        ) {
            continue
        }
        for(const model of integration.homekit["models"]) {
            homekit[model] = integration.domain
        }
    }

    return homekit
}

/**
 * Return cached list of ssdp mappings.
 */
export async function async_get_ssdp(hass: HomeAssistant): Dict<List> {

    ssdp: Dict<List> = SSDP.copy()

    integrations = await async_get_custom_components(hass)
    for(const integration of integrations.values()) {
        if (!integration.ssdp) {
            continue
        }

        ssdp[integration.domain] = integration.ssdp
    }

    return ssdp
}

/**
 * Return cached list of MQTT mappings.
 */
export async function async_get_mqtt(hass: HomeAssistant): Dict<List> {

    mqtt: Dict<List> = MQTT.copy()

    integrations = await async_get_custom_components(hass)
    for(const integration of integrations.values()) {
        if (!integration.mqtt) {
            continue
        }

        mqtt[integration.domain] = integration.mqtt
    }

    return mqtt
}

/**
 * An integration in Home Assistant.
 */
export class Integration {

    // @classmethod
    /**
     * Resolve an integration from a root module.
     */
    resolve_from_root(
        cls, hass: HomeAssistant, root_module: ModuleType, domain: string
    ): "Optional[Integration]" {
        for base in root_module.__path__:  // type: ignore
            manifest_path = pathlib.Path(base) / domain / "manifest.json"

            if (!manifest_path.is_file() {
                continue
            }

            try {
                manifest = json.loads(manifest_path.read_text())
            }
            catch (e) {
                if (e instanceof ValueError as err) {
                _LOGGER.error(
                    "Error parsing manifest.json file at %s: %s", manifest_path, err
                )
                continue
                }
                else {
                    throw e;
                }
            }


            return cls(
                hass,`${root_module.__name__}.${domain}`, manifest_path.parent, manifest
            )

        return null
    }

    // @classmethod
    /**
     * Resolve legacy component.

        Will create a stub manifest.

     */
    resolve_legacy(
        cls, hass: HomeAssistant, domain: string
    ): "Optional[Integration]" {
        comp = _load_file(hass, domain, _lookup_path(hass))

        if (!comp) {
            return null
        }

        return cls(
            hass,
            comp.__name__,
            pathlib.Path(comp.__file__).parent,
            manifest_from_legacy_module(domain, comp),
        )
    }

    /**
     * Initialize an integration.
     */
    constructor(

        hass: HomeAssistant,
        pkg_path: string,
        file_path: pathlib.Path,
        manifest: Dict<any>,
    ) {
        this.hass = hass
        this.pkg_path = pkg_path
        this.file_path = file_path
        this.manifest = manifest
        manifest["is_built_in"] = this.is_built_in

        if (this.dependencies) {
            this._all_dependencies_resolved: Optional<bool> = null
            this._all_dependencies: Optional[Set[str]] = null
        }
        else {
            this._all_dependencies_resolved = true
            this._all_dependencies = set()
        }

        _LOGGER.info("Loaded %s from %s", this.domain, pkg_path)
    }

    // @property
    /**
     * Return name.
     */
    name(): string {
        return cast(str, this.manifest["name"])
    }

    // @property
    /**
     * Return reason integration is disabled.
     */
    disabled(): Optional<string> {
        return cast(Optional<string>, this.manifest.get("disabled"))
    }

    // @property
    /**
     * Return domain.
     */
    domain(): string {
        return cast(str, this.manifest["domain"])
    }

    // @property
    /**
     * Return dependencies.
     */
    get dependencies: string[] {
        return cast(str], this.manifest.get("dependencies", [[]))
    }

    // @property
    /**
     * Return after_dependencies.
     */
    get after_dependencies: string[] {
        return cast(str], this.manifest.get("after_dependencies", [[]))
    }

    // @property
    /**
     * Return requirements.
     */
    get requirements: string[] {
        return cast(string[], this.manifest.get("requirements", [[]))
    }

    // @property
    /**
     * Return config_flow.
     */
    get config_flow: boolean {
        return cast(bool, this.manifest.get("config_flow", false))
    }

    // @property
    /**
     * Return documentation.
     */
    get documentation: Optional<string> {
        return cast(str, this.manifest.get("documentation"))
    }

    // @property
    /**
     * Return issue tracker link.
     */
    get issue_tracker: Optional<string> {
        return cast(str, this.manifest.get("issue_tracker"))
    }

    // @property
    /**
     * Return Integration Quality Scale.
     */
    get quality_scale: Optional<string> {
        return cast(str, this.manifest.get("quality_scale"))
    }

    // @property
    /**
     * Return Integration MQTT entries.
     */
    get mqtt: Optional<any[]> {
        return cast(dict[], this.manifest.get("mqtt"))
    }

    // @property
    /**
     * Return Integration SSDP entries.
     */
    get ssdp: Optional<list> {
        return cast(dict[], this.manifest.get("ssdp"))
    }

    // @property
    /**
     * Return Integration zeroconf entries.
     */
    get zeroconf: Optional<list> {
        return cast(str[], this.manifest.get("zeroconf"))
    }

    // @property
    /**
     * Return Integration dhcp entries.
     */
    dhcp(): Optional<list> {
        return cast(str[], this.manifest.get("dhcp"))
    }

    // @property
    /**
     * Return Integration homekit entries.
     */
    homekit(): Optional<dict> {
        return cast(Dict[str, List], this.manifest.get("homekit"))
    }

    // @property
    /**
     * Test if package is a built-in integration.
     */
    is_built_in(): boolean {
        return this.pkg_path.startswith(PACKAGE_BUILTIN)
    }

    // @property
    /**
     * Return all dependencies including sub-dependencies.
     */
    all_dependencies(): Set<string> {
        if (!this._all_dependencies) {
            throw new RuntimeError("Dependencies not resolved!")
        }

        return this._all_dependencies
    }

    // @property
    /**
     * Return if all dependencies have been resolved.
     */
    all_dependencies_resolved(): boolean {
        return this._all_dependencies_resolved
    }

    /**
     * Resolve all dependencies.
     */
    async resolve_dependencies(): boolean {
        if (this._all_dependencies_resolved is !null) {
            return this._all_dependencies_resolved
        }

        try {
            dependencies = await _async_component_dependencies(
                this.hass, this.domain, set(), set()
            )
            dependencies.discard(this.domain)
            this._all_dependencies = dependencies
            this._all_dependencies_resolved = true
        }
        catch (e) {
            if (e instanceof IntegrationNotFound as err) {
            _LOGGER.error(
                "Unable to resolve dependencies for %s:  we are unable to resolve (sub)dependency %s",
                this.domain,
                err.domain,
            )
            this._all_dependencies_resolved = false
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof CircularDependency as err) {
            _LOGGER.error(
                "Unable to resolve dependencies for %s:  it contains a circular dependency: %s -> %s",
                this.domain,
                err.from_domain,
                err.to_domain,
            )
            this._all_dependencies_resolved = false
            }
            else {
                throw e;
            }
        }


        return this._all_dependencies_resolved
    }

    /**
     * Return the component.
     */
    get_component(): ModuleType {
        cache = this.hass.data.setdefault(DATA_COMPONENTS, {})
        if (this.domain !in cache) {
            cache[this.domain] = importlib.import_module(this.pkg_path)
        }
        return cache[this.domain]  // type: ignore
    }

    /**
     * Return a platform for an integration.
     */
    get_platform(platform_name: string): ModuleType {
        cache = this.hass.data.setdefault(DATA_COMPONENTS, {})
        full_name =`${this.domain}.${platform_name}`
        if (full_name !in cache) {
            cache[full_name] = this._import_platform(platform_name)
        }
        return cache[full_name]  // type: ignore
    }

    /**
     * Import the platform.
     */
    _import_platform(platform_name: string): ModuleType {
        return importlib.import_module`${this.pkg_path}.${platform_name}`)
    }

    /**
     * Text representation of class.
     */
    __repr__(): string {
        return`<numberegration ${this.domain}: ${this.pkg_path}>`
    }
}

/**
 * Get an integration.
 */
export async function async_get_integration(hass: HomeAssistant, domain: string): Integration {
    cache = hass.data.get(DATA_INTEGRATIONS)
    if (!cache) {
        if (!_async_mount_config_dir(hass) {
            throw new IntegrationNotFound(domain)
        }
        cache = hass.data[DATA_INTEGRATIONS] = {}
    }

    intor_evt: Union<numberegration, asyncio.Event, null> = cache.get(domain, _UNDEF)

    if (int_or_evt instanceof asyncio.Event) {
        await intor_evt.wait()
        intor_evt = cache.get(domain, _UNDEF)

        // When we have waited and it's _UNDEF, it doesn't exist
        // We don't cache that it doesn't exist, or else people can't fix it
        // and then restart, because their config will never be valid.
        if (int_or_evt is _UNDEF) {
            throw new IntegrationNotFound(domain)
        }
    }

    if (int_or_evt is !_UNDEF) {
        return cast(Integration, intor_evt)
    }

    event = cache[domain] = asyncio.Event()

    // Instead of using resolve_from_root we use the cache of custom
    // components to find the integration.
    integration = (await async_get_custom_components(hass)).get(domain)
    if (integration is !null) {
        _LOGGER.warning(CUSTOM_WARNING, domain)
        cache[domain] = integration
        event.set()
        return integration
    }

    from homeassistant import components  // pylint: disable=import-outside-toplevel

    integration = await hass.async_add_executor_job(
        Integration.resolve_from_root, hass, components, domain
    )

    if (integration is !null) {
        cache[domain] = integration
        event.set()
        return integration
    }

    integration = Integration.resolve_legacy(hass, domain)
    if (integration is !null) {
        cache[domain] = integration
    }
    else {
        // Remove event from cache.
        cache.pop(domain)
    }

    event.set()

    if (!integration) {
        throw new IntegrationNotFound(domain)
    }

    return integration
}

/**
 * Loader base error.
 */
export class LoaderError extends Exception {
}

/**
 * Raised when a component is not found.
 */
export class IntegrationNotFound extends LoaderError {

    /**
     * Initialize a component not found error.
     */
    constructor(domain: string) {
        super().constructor`Integration '${domain}' not found.`)
        this.domain = domain
    }
}

/**
 * Raised when a circular dependency is found when resolving components.
 */
export class CircularDependency extends LoaderError {

    /**
     * Initialize circular dependency error.
     */
    constructor(from_domain: string, to_domain: string) {
        super().constructor`Circular dependency detected: ${from_domain} -> ${to_domain}.`)
        this.from_domain = from_domain
        this.to_domain = to_domain
    }
}

/**
 * Try to load specified file.

    Looks in config dir first, then built-in components.
    Only returns it if also found to be valid.
    Async friendly.

 */
export function _load_file(
    hass: HomeAssistant, comp_or_platform: string, base_paths: string[]
): Optional<ModuleType> {
    try {
        return hass.data[DATA_COMPONENTS][comp_or_platform]  // type: ignore
    }
    catch (e) {
        if (e instanceof KeyError) {
        pass
        }
        else {
            throw e;
        }
    }


    cache = hass.data.get(DATA_COMPONENTS)
    if (!cache) {
        if (!_async_mount_config_dir(hass) {
            return null
        }
        cache = hass.data[DATA_COMPONENTS] = {}
    }

    for(const path in `${base}.${comp_or_platform}` for base of base_paths)) {
        try {
            module = importlib.import_module(path)

            // In Python 3 you can import files from directories that do not
            // contain the file constructor.py. A directory is a valid module if
            // it contains a file with the .py extension. In this case Python
            // will succeed in importing the directory as a module and call it
            // a namespace. We do not care about namespaces.
            // This prevents that when only
            // custom_components/switch/some_platform.py exists,
            // the import custom_components.switch would succeed.
            // __file__ was unset for namespaces before Python 3.7
            if (getattr(module, "__file__", !null)) {
                continue
            }

            cache[comp_or_platform] = module

            if (module.__name__.startswith(PACKAGE_CUSTOM_COMPONENTS) {
                _LOGGER.warning(CUSTOM_WARNING, comp_or_platform)
            }

            return module
        }

        catch (e) {
            if (e instanceof ImportError as err) {
            // This error happens if for example custom_components/switch
            // exists and we try to load switch.demo.
            // Ignore errors for custom_components, custom_components.switch
            // and custom_components.switch.demo.
            white_listed_errors = []
            parts = []
            for(const part of path.split(".")) {
                parts.append(part)
                white_listed_errors.append`No module named '${'.'.join(parts)}'`)
            }

            if (str(err) !in white_listed_errors) {
                _LOGGER.exception(
                    ("Error loading %s. Make sure all dependencies are installed"), path
                )
            }
            }
            else {
                throw e;
            }
        }

    }

    return null
}

/**
 * Class to wrap a Python module and auto fill in hass argument.
 */
export class ModuleWrapper<T = any> {
    private _hass: HomeAssistant;
    private _module: T;

    /**
     * Initialize the module wrapper.
     */
    constructor(hass: HomeAssistant, module: T) { // T = ModuleType
        this._hass = hass
        this._module = module
    }

    /**
     * Fetch an attribute.
     */
    get<A>(attr: string): any {
        let value = getattr(this._module, attr)

        if (hasattr(value, "__bind_hass")) {
            value = ft.partial(value, this._hass)
        }

        setattr(module, attr, value)
        return value
    }
}

/**
 * Helper to load components.
 */
export class Components {
    private _hass: HomeAssistant;

    /**
     * Initialize the Components class.
     */
    constructor(hass: HomeAssistant) {
        this._hass = hass
    }

    /**
     * Fetch a component.
     */
    __getattr__(comp_name: string): ModuleWrapper {
        // Test integration cache
        const integration = this._hass.data.get(DATA_INTEGRATIONS, {}).get(comp_name)
        let component: Optional<ModuleType>;

        if (integration instanceof Integration) {
            component = integration.get_component()
        }
        else {
            // Fallback to importing old-school
            component = _load_file(this._hass, comp_name, _lookup_path(this._hass))
        }

        if (!component) {
            throw new ImportError(`Unable to load ${comp_name}`);
        }

        const wrapped = new ModuleWrapper(this._hass, component)
        setattr(comp_name, wrapped)
        return wrapped
    }
}

/**
 * Helper to load helpers.
 */
export class Helpers {
    private _hass: HomeAssistant;
    private _modules: Dict<ModuleWrapper>;

    /**
     * Initialize the Helpers class.
     */
    constructor(hass: HomeAssistant) {
        this._hass = hass
        this._modules = {};
    }

    /**
     * Fetch a helper.
     */
    async get<T extends object>(helper_name: string): Promise<ModuleWrapper<T>> {
        if (hasattr(this._modules, helper_name)) {
            return getattr<T>(this._modules, helper_name);
        }

        const helper = await import(`./hass/helpers`) // importlib.import_module(`homeassistant.helpers.${helper_name}`)
        const wrapped = new ModuleWrapper(this._hass, helper)
        setattr(this._modules, helper_name, wrapped)
        return wrapped
    }
}

/**
 * Decorate function to indicate that first argument is hass.
 */
export function bind_hass(func: CALLABLE_T): CALLABLE_T {
    setattr(func, "__bind_hass", true)
    return func
}

/**
 * Recursive function to get component dependencies.

    Async friendly.

 */
export async function _async_component_dependencies(
    hass: HomeAssistant,
    start_domain: string,
    integration: Integration,
    loaded: Set<string>,
    loading: Set<string>,
): Set<string> {
    const domain = integration.domain
    loading.add(domain)

    for(const dependency_domain of integration.dependencies) {
        // Check not already loaded
        if (dependency_domain in loaded) {
            continue
        }

        // If we are already loading it, we have a circular dependency.
        if (dependency_domain in loading) {
            throw new CircularDependency(domain, dependency_domain)
        }

        loaded.add(dependency_domain)

        dep_integration = await async_get_integration(hass, dependency_domain)

        if (start_domain in dep_integration.after_dependencies) {
            throw new CircularDependency(start_domain, dependency_domain)
        }

        if (dep_integration.dependencies) {
            dep_loaded = await _async_component_dependencies(
                hass, start_domain, dep_integration, loaded, loading
            )

            loaded.update(dep_loaded)
        }
    }

    loaded.add(domain)
    loading.remove(domain)

    return loaded
}

/**
 * Mount config dir in order to load custom_component.

    Async friendly but not a coroutine.

 */
export function _async_mount_config_dir(hass: HomeAssistant): boolean {
    if (!hass.config.config_dir) {
        _LOGGER.error("Can't load integrations - configuration directory is not set")
        return false
    }
    if (hass.config.config_dir !in sys.path) {
        sys.path.insert(0, hass.config.config_dir)
    }
    return true
}

/**
 * Return the lookup paths for legacy lookups.
 */
export function _lookup_path(hass: HomeAssistant): string[] {
    if (hass.config.safe_mode) {
        return [PACKAGE_BUILTIN]
    }
    return [PACKAGE_CUSTOM_COMPONENTS, PACKAGE_BUILTIN]
}
