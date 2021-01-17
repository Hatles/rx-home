/**
 * Manage config entries in Home Assistant.
 */
import asyncio
import functools
import logging
from types import MappingProxyType
from typing import any, Callable, Dict, List, Optional, Set, Union, cast
import weakref

import attr

from homeassistant import data_entry_flow, loader
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryNotReady, HomeAssistantError
from homeassistant.helpers import entity_registry
from homeassistant.helpers.event import Event
from homeassistant.helpers.typing import UNDEFINED, UndefinedType
from homeassistant.setup import async_process_deps_reqs, async_setup_component
from homeassistant.util.decorator import Registry
import homeassistant.util.uuid as uuid_util

const _LOGGER = logging.getLogger(__name__)

export const SOURCE_DISCOVERY = "discovery"
export const SOURCE_HASSIO = "hassio"
export const SOURCE_HOMEKIT = "homekit"
export const SOURCE_IMPORT = "import"
export const SOURCE_INTEGRATION_DISCOVERY = "integration_discovery"
export const SOURCE_MQTT = "mqtt"
export const SOURCE_SSDP = "ssdp"
export const SOURCE_USER = "user"
export const SOURCE_ZEROCONF = "zeroconf"
export const SOURCE_DHCP = "dhcp"

// If a user wants to hide a discovery from the UI they can "Ignore" it. The config_entries/ignore_flow
// websocket command creates a config entry with this source and while it exists normal discoveries
// with the same unique id are ignored.
export const SOURCE_IGNORE = "ignore"

// This is used when a user uses the "Stop Ignoring" button in the UI (the
// config_entries/ignore_flow websocket command). It's triggered after the "ignore" config entry has
// been removed and unloaded.
export const SOURCE_UNIGNORE = "unignore"

// This is used to signal that re-authentication is required by the user.
export const SOURCE_REAUTH = "reauth"

export const HANDLERS = Registry()

export const STORAGE_KEY = "config_entries"
export const STORAGE_VERSION = 1

// Deprecated since 0.73
export const PATH_CONFIG = ".config_entries.json"

export const SAVE_DELAY = 1

// The config entry has been set up successfully
export const ENTRY_STATE_LOADED = "loaded"
// There was an error while trying to set up this config entry
export const ENTRY_STATE_SETUP_ERROR = "setup_error"
// There was an error while trying to migrate the config entry to a new version
export const ENTRY_STATE_MIGRATION_ERROR = "migration_error"
// The config entry was not ready to be set up yet, but might be later
export const ENTRY_STATE_SETUP_RETRY = "setup_retry"
// The config entry has not been loaded
export const ENTRY_STATE_NOT_LOADED = "not_loaded"
// An error occurred when trying to unload the entry
export const ENTRY_STATE_FAILED_UNLOAD = "failed_unload"

export const UNRECOVERABLE_STATES = (ENTRY_STATE_MIGRATION_ERROR, ENTRY_STATE_FAILED_UNLOAD)

export const DEFAULT_DISCOVERY_UNIQUE_ID = "default_discovery_unique_id"
export const DISCOVERY_NOTIFICATION_ID = "config_entry_discovery"
export const DISCOVERY_SOURCES = (
    SOURCE_SSDP,
    SOURCE_ZEROCONF,
    SOURCE_DISCOVERY,
    SOURCE_IMPORT,
    SOURCE_UNIGNORE,
)

export const RECONFIGURE_NOTIFICATION_ID = "config_entry_reconfigure"

export const EVENT_FLOW_DISCOVERED = "config_entry_discovered"

export const CONN_CLASS_CLOUD_PUSH = "cloud_push"
export const CONN_CLASS_CLOUD_POLL = "cloud_poll"
export const CONN_CLASS_LOCAL_PUSH = "local_push"
export const CONN_CLASS_LOCAL_POLL = "local_poll"
export const CONN_CLASS_ASSUMED = "assumed"
export const CONN_CLASS_UNKNOWN = "unknown"

export const RELOAD_AFTER_UPDATE_DELAY = 30


/**
 * Error while configuring an account.
 */
export class ConfigError extends HomeAssistantError {
}

/**
 * Unknown entry specified.
 */
export class UnknownEntry extends ConfigError {
}

/**
 * Raised when a config entry operation is not allowed.
 */
export class OperationNotAllowed extends ConfigError {
}

export const UpdateListenerType = Callable[[HomeAssistant, "ConfigEntry"], any]


/**
 * Hold a configuration entry.
 */
export class ConfigEntry {

    __slots__ = (
        "entry_id",
        "version",
        "domain",
        "title",
        "data",
        "options",
        "unique_id",
        "supports_unload",
        "system_options",
        "source",
        "connection_class",
        "state",
        "_setup_lock",
        "update_listeners",
        "_async_cancel_retry_setup",
    )

    /**
     * Initialize a config entry.
     */
    constructor(

        version: number,
        domain: string,
        title: string,
        data: dict,
        source: string,
        connection_class: string,
        system_options: dict,
        options: Optional<dict> = null,
        unique_id: Optional<string> = null,
        entry_id: Optional<string> = null,
        state: string = ENTRY_STATE_NOT_LOADED,
    ) {
        // Unique id of the config entry
        this.entry_id = entry_id or uuid_util.random_uuid_hex()

        // Version of the configuration.
        this.version = version

        // Domain the configuration belongs to
        this.domain = domain

        // Title of the configuration
        this.title = title

        // Config data
        this.data = MappingProxyType(data)

        // Entry options
        this.options = MappingProxyType(options or {})

        // Entry system options
        this.system_options = SystemOptions(**system_options)

        // Source of the configuration (user, discovery, cloud)
        this.source = source

        // Connection class
        this.connection_class = connection_class

        // State of the entry (LOADED, NOT_LOADED)
        this.state = state

        // Unique ID of this entry.
        this.unique_id = unique_id

        // Supports unload
        this.supports_unload = false

        // Listeners to call on update
        this.update_listeners: weakref.ReferenceType[UpdateListenerType]] = [[]

        // Function to cancel a scheduled retry
        this._async_cancel_retry_setup: Optional[Callable[[], any]] = null
    }

    /**
     * Set up an entry.
     */
    async async_setup(

        hass: HomeAssistant,
        *,
        integration: Optional<loader.Integration> = null,
        tries: number = 0,
    ) {
        if (this.source === SOURCE_IGNORE) {
            return
        }

        if (!integration) {
            integration = await loader.async_get_integration(hass, this.domain)
        }

        this.supports_unload = await support_entry_unload(hass, this.domain)

        try {
            component = integration.get_component()
        }
        catch (e) {
            if (e instanceof ImportError as err) {
            _LOGGER.error(
                "Error importing integration %s to set up %s configuration entry: %s",
                integration.domain,
                this.domain,
                err,
            )
            if (this.domain === integration.domain) {
                this.state = ENTRY_STATE_SETUP_ERROR
            }
            return
            }
            else {
                throw e;
            }
        }


        if (this.domain === integration.domain) {
            try {
                integration.get_platform("config_flow")
            }
            catch (e) {
                if (e instanceof ImportError as err) {
                _LOGGER.error(
                    "Error importing platform config_flow from integration %s to set up %s configuration entry: %s",
                    integration.domain,
                    this.domain,
                    err,
                )
                this.state = ENTRY_STATE_SETUP_ERROR
                return
                }
                else {
                    throw e;
                }
            }


            // Perform migration
            if (!await this.async_migrate(hass) {
                this.state = ENTRY_STATE_MIGRATION_ERROR
                return
            }
        }

        try {
            result = await component.async_setup_entry(hass, self)  // type: ignore

            if (!result instanceof boolean) {
                _LOGGER.error(
                    "%s.async_setup_entry did not return boolean", integration.domain
                )
                result = false
            }
        }
        catch (e) {
            if (e instanceof ConfigEntryNotReady) {
            this.state = ENTRY_STATE_SETUP_RETRY
            wait_time = 2 ** min(tries, 4) * 5
            tries += 1
            _LOGGER.warning(
                "Config entry for %s not ready yet. Retrying in %d seconds",
                this.domain,
                wait_time,
            )

            /**
             * Run setup again.
             */
            async setup_again(now: any) {
                this._async_cancel_retry_setup = null
                await this.async_setup(hass, integration=integration, tries=tries)
            }

            this._async_cancel_retry_setup = hass.helpers.event.async_call_later(
                wait_time, setup_again
            )
            return
            }
            else {
                throw e;
            }
        }

        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception(
                "Error setting up entry %s for %s", this.title, integration.domain
            )
            result = false
            }
            else {
                throw e;
            }
        }


        // Only store setup result as state if it was not forwarded.
        if (this.domain !== integration.domain) {
            return
        }

        if (result) {
            this.state = ENTRY_STATE_LOADED
        }
        else {
            this.state = ENTRY_STATE_SETUP_ERROR
        }
    }

    /**
     * Unload an entry.

        Returns if unload is possible and was successful.

     */
    async async_unload(
        hass: HomeAssistant, *, integration: Optional<loader.Integration> = null
    ): boolean {
        if (this.source === SOURCE_IGNORE) {
            this.state = ENTRY_STATE_NOT_LOADED
            return true
        }

        if (!integration) {
            try {
                integration = await loader.async_get_integration(hass, this.domain)
            }
            catch (e) {
                if (e instanceof loader.IntegrationNotFound) {
                // The integration was likely a custom_component
                // that was uninstalled, or an integration
                // that has been renamed without removing the config
                // entry.
                this.state = ENTRY_STATE_NOT_LOADED
                return true
                }
                else {
                    throw e;
                }
            }

        }

        component = integration.get_component()

        if (integration.domain === this.domain) {
            if (this.state in UNRECOVERABLE_STATES) {
                return false
            }

            if (this.state !== ENTRY_STATE_LOADED) {
                if (this._async_cancel_retry_setup is !null) {
                    this._async_cancel_retry_setup()
                    this._async_cancel_retry_setup = null
                }

                this.state = ENTRY_STATE_NOT_LOADED
                return true
            }
        }

        supports_unload = hasattr(component, "async_unload_entry")

        if (!supports_unload) {
            if (integration.domain === this.domain) {
                this.state = ENTRY_STATE_FAILED_UNLOAD
            }
            return false
        }

        try {
            result = await component.async_unload_entry(hass, self)  // type: ignore

            assert result instanceof boolean

            // Only adjust state if we unloaded the component
            if (result and integration.domain === this.domain) {
                this.state = ENTRY_STATE_NOT_LOADED
            }

            return result
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception(
                "Error unloading entry %s for %s", this.title, integration.domain
            )
            if (integration.domain === this.domain) {
                this.state = ENTRY_STATE_FAILED_UNLOAD
            }
            return false
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Invoke remove callback on component.
     */
    async async_remove(hass: HomeAssistant) {
        if (this.source === SOURCE_IGNORE) {
            return
        }

        try {
            integration = await loader.async_get_integration(hass, this.domain)
        }
        catch (e) {
            if (e instanceof loader.IntegrationNotFound) {
            // The integration was likely a custom_component
            // that was uninstalled, or an integration
            // that has been renamed without removing the config
            // entry.
            return
            }
            else {
                throw e;
            }
        }


        component = integration.get_component()
        if (!hasattr(component, "async_remove_entry") {
            return
        }
        try {
            await component.async_remove_entry(hass, self)  // type: ignore
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception(
                "Error calling entry remove callback %s for %s",
                this.title,
                integration.domain,
            )
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Migrate an entry.

        Returns true if config entry is up-to-date or has been migrated.

     */
    async async_migrate(hass: HomeAssistant): boolean {
        handler = HANDLERS.get(this.domain)
        if (!handler) {
            _LOGGER.error(
                "Flow handler not found for entry %s for %s", this.title, this.domain
            )
            return false
        }
        // Handler may be a partial
        while (handler instanceof functools.partial) {
            handler = handler.func
        }

        if (this.version === handler.VERSION) {
            return true
        }

        integration = await loader.async_get_integration(hass, this.domain)
        component = integration.get_component()
        supports_migrate = hasattr(component, "async_migrate_entry")
        if (!supports_migrate) {
            _LOGGER.error(
                "Migration handler not found for entry %s for %s",
                this.title,
                this.domain,
            )
            return false
        }

        try {
            result = await component.async_migrate_entry(hass, self)  // type: ignore
            if (!result instanceof boolean) {
                _LOGGER.error(
                    "%s.async_migrate_entry did not return boolean", this.domain
                )
                return false
            }
            if (result) {
                // pylint: disable=protected-access
                hass.config_entries._async_schedule_save()
            }
            return result
        }
        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            _LOGGER.exception(
                "Error migrating entry %s for %s", this.title, this.domain
            )
            return false
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Listen for when entry is updated.

        Returns function to unlisten.

     */
    add_update_listener(listener: UpdateListenerType): CALLBACK_TYPE {
        weak_listener = weakref.ref(listener)
        this.update_listeners.append(weak_listener)

        return lambda: this.update_listeners.remove(weak_listener)
    }

    /**
     * Return dictionary version of this entry.
     */
    as_dict(): Dict<any> {
        return {
            "entry_id": this.entry_id,
            "version": this.version,
            "domain": this.domain,
            "title": this.title,
            "data": dict(this.data),
            "options": dict(this.options),
            "system_options": this.system_options.as_dict(),
            "source": this.source,
            "connection_class": this.connection_class,
            "unique_id": this.unique_id,
        }
    }
}

/**
 * Manage all the config entry flows that are in progress.
 */
export class ConfigEntriesFlowManager extends data_entry_flow.FlowManager {

    /**
     * Initialize the config entry flow manager.
     */
    constructor(
        hass: HomeAssistant, config_entries: "ConfigEntries", hass_config: dict
    ) {
        super().constructor(hass)
        this.config_entries = config_entries
        this._hass_config = hass_config
    }

    /**
     * Finish a config flow and add an entry.
     */
    async async_finish_flow(
        flow: data_entry_flow.FlowHandler, result: Dict<any>
    ): Dict<any> {
        flow = cast(ConfigFlow, flow)

        // Remove notification if no other discovery config entries in progress
        if (!any(
            ent["context"]["source"] in DISCOVERY_SOURCES
            for ent in this.hass.config_entries.flow.async_progress()
            if ent["flow_id"] !== flow.flow_id
        ) {
            this.hass.components.persistent_notification.async_dismiss(
                DISCOVERY_NOTIFICATION_ID
            )
        }

        if (result["type"] !== data_entry_flow.RESULT_TYPE_CREATE_ENTRY) {
            return result
        }

        // Check if config entry exists with unique ID. Unload it.
        existing_entry = null

        if (flow.unique_id is !null) {
            // Abort all flows in progress with same unique ID.
            for(const progress_flow of this.async_progress()) {
                if (
                    progress_flow["handler"] === flow.handler
                    and progress_flow["flow_id"] !== flow.flow_id
                    and progress_flow["context"].get("unique_id") === flow.unique_id
                ) {
                    this.async_abort(progress_flow["flow_id"])
                }
            }

            // Reset unique ID when the default discovery ID has been used
            if (flow.unique_id === DEFAULT_DISCOVERY_UNIQUE_ID) {
                await flow.async_set_unique_id(null)
            }

            // Find existing entry.
            for(const check_entry of this.config_entries.async_entries(result["handler"])) {
                if (check_entry.unique_id === flow.unique_id) {
                    existing_entry = check_entry
                    break
                }
            }
        }

        // Unload the entry before setting up the new one.
        // We will remove it only after the other one is set up,
        // so that device customizations are not getting lost.
        if (
            existing_entry is !null
            and existing_entry.state !in UNRECOVERABLE_STATES
        ) {
            await this.config_entries.async_unload(existing_entry.entry_id)
        }

        entry = ConfigEntry(
            version=result["version"],
            domain=result["handler"],
            title=result["title"],
            data=result["data"],
            options={},
            system_options={},
            source=flow.context["source"],
            connection_class=flow.CONNECTION_CLASS,
            unique_id=flow.unique_id,
        )

        await this.config_entries.async_add(entry)

        if (existing_entry is !null) {
            await this.config_entries.async_remove(existing_entry.entry_id)
        }

        result["result"] = entry
        return result
    }

    /**
     * Create a flow for specified handler.

        Handler key is the domain of the component that we want to set up.

     */
    async async_create_flow(
        handler_key: any, *, context: Optional<Dict> = null, data: any = null
    ): "ConfigFlow" {
        try {
            integration = await loader.async_get_integration(this.hass, handler_key)
        }
        catch (e) {
            if (e instanceof loader.IntegrationNotFound as err) {
            _LOGGER.error("Cannot find integration %s", handler_key)
            throw new data_entry_flow.UnknownHandler from err
            }
            else {
                throw e;
            }
        }


        // Make sure requirements and dependencies of component are resolved
        await async_process_deps_reqs(this.hass, this._hass_config, integration)

        try {
            integration.get_platform("config_flow")
        }
        catch (e) {
            if (e instanceof ImportError as err) {
            _LOGGER.error(
                "Error occurred loading configuration flow for integration %s: %s",
                handler_key,
                err,
            )
            throw new data_entry_flow.UnknownHandler
            }
            else {
                throw e;
            }
        }


        handler = HANDLERS.get(handler_key)

        if (!handler) {
            throw new data_entry_flow.UnknownHandler
        }

        if (!context or "source" !in context) {
            throw new KeyError("Context not set or doesn't have a source set")
        }

        flow = cast(ConfigFlow, handler())
        flow.init_step = context["source"]
        return flow
    }

    /**
     * After a flow is initialised trigger new flow notifications.
     */
    async async_post_init(
        flow: data_entry_flow.FlowHandler, result: dict
    ) {
        source = flow.context["source"]

        // Create notification.
        if (source in DISCOVERY_SOURCES) {
            this.hass.bus.async_fire(EVENT_FLOW_DISCOVERED)
            this.hass.components.persistent_notification.async_create(
                title="New devices discovered",
                message=(
                    "We have discovered new devices on your network. "
                    "[Check it out](/config/integrations)."
                ),
                notification_id=DISCOVERY_NOTIFICATION_ID,
            )
        }
        else if *(source === SOURCE_REAUTH) {
            this.hass.components.persistent_notification.async_create(
                title="Integration requires reconfiguration",
                message=(
                    "At least one of your integrations requires reconfiguration to "
                    "continue functioning. [Check it out](/config/integrations)."
                ),
                notification_id=RECONFIGURE_NOTIFICATION_ID,
            )
        }
    }
}

/**
 * Manage the configuration entries.

    An instance of this object is available via `hass.config_entries`.

 */
export class ConfigEntries {

    /**
     * Initialize the entry manager.
     */
    constructor(hass: HomeAssistant, hass_config: dict) {
        this.hass = hass
        this.flow = ConfigEntriesFlowManager(hass, hass_config)
        this.options = OptionsFlowManager(hass)
        this._hass_config = hass_config
        this._entries: ConfigEntry] = [[]
        this._store = hass.helpers.storage.Store(STORAGE_VERSION, STORAGE_KEY)
        EntityRegistryDisabledHandler(hass).async_setup()
    }

    // @callback
    /**
     * Return domains for which we have entries.
     */
    async_domains(): string[] {
        seen: Set<string> = set()
        result = []

        for(const entry of this._entries) {
            if (entry.domain !in seen) {
                seen.add(entry.domain)
                result.append(entry.domain)
            }
        }

        return result
    }

    // @callback
    /**
     * Return entry with matching entry_id.
     */
    async_get_entry(entry_id: string): Optional<ConfigEntry> {
        for(const entry of this._entries) {
            if (entry_id === entry.entry_id) {
                return entry
            }
        }
        return null
    }

    // @callback
    /**
     * Return all entries or entries for a specific domain.
     */
    async_entries(domain: Optional<string> = null): ConfigEntry[] {
        if (!domain) {
            return list(this._entries)
        }
        return [entry for entry in this._entries if entry.domain === domain]
    }

    /**
     * Add and setup an entry.
     */
    async async_add(entry: ConfigEntry) {
        this._entries.append(entry)
        await this.async_setup(entry.entry_id)
        this._async_schedule_save()
    }

    /**
     * Remove an entry.
     */
    async async_remove(entry_id: string): Dict<any> {
        entry = this.async_get_entry(entry_id)

        if (!entry) {
            throw new UnknownEntry
        }

        if (entry.state in UNRECOVERABLE_STATES) {
            unload_success = entry.state !== ENTRY_STATE_FAILED_UNLOAD
        }
        else {
            unload_success = await this.async_unload(entry_id)
        }

        await entry.async_remove(this.hass)

        this._entries.remove(entry)
        this._async_schedule_save()

        dev_reg, ent_reg = await asyncio.gather(
            this.hass.helpers.device_registry.async_get_registry(),
            this.hass.helpers.entity_registry.async_get_registry(),
        )

        dev_reg.async_clear_config_entry(entry_id)
        ent_reg.async_clear_config_entry(entry_id)

        // After we have fully removed an "ignore" config entry we can try and rediscover it so that a
        // user is able to immediately start configuring it. We do this by starting a new flow with
        // the 'unignore' step. If the integration doesn't implement async_step_unignore then
        // this will be a no-op.
        if (entry.source === SOURCE_IGNORE) {
            this.hass.async_create_task(
                this.hass.config_entries.flow.async_init(
                    entry.domain,
                    context={"source": SOURCE_UNIGNORE},
                    data={"unique_id": entry.unique_id},
                )
            )
        }

        return {"require_restart": not unload_success}
    }

    /**
     * Initialize config entry config.
     */
    async async_initialize() {
        // Migrating for config entries stored before 0.73
        config = await this.hass.helpers.storage.async_migrator(
            this.hass.config.path(PATH_CONFIG),
            this._store,
            old_conf_migrate_func=_old_conf_migrator,
        )

        if (!config) {
            this._entries = []
            return
        }

        this._entries = [
            ConfigEntry(
                version=entry["version"],
                domain=entry["domain"],
                entry_id=entry["entry_id"],
                data=entry["data"],
                source=entry["source"],
                title=entry["title"],
                // New in 0.79
                connection_class=entry.get("connection_class", CONN_CLASS_UNKNOWN),
                // New in 0.89
                options=entry.get("options"),
                // New in 0.98
                system_options=entry.get("system_options", {}),
                // New in 0.104
                unique_id=entry.get("unique_id"),
            )
            for entry in config["entries"]
        ]
    }

    /**
     * Set up a config entry.

        Return true if entry has been successfully loaded.

     */
    async async_setup(entry_id: string): boolean {
        entry = this.async_get_entry(entry_id)

        if (!entry) {
            throw new UnknownEntry
        }

        if (entry.state !== ENTRY_STATE_NOT_LOADED) {
            throw new OperationNotAllowed
        }

        // Setup Component if not set up yet
        if (entry.domain in this.hass.config.components) {
            await entry.async_setup(this.hass)
        }
        else {
            // Setting up the component will set up all its config entries
            result = await async_setup_component(
                this.hass, entry.domain, this._hass_config
            )

            if (!result) {
                return result
            }
        }

        return entry.state === ENTRY_STATE_LOADED
    }

    /**
     * Unload a config entry.
     */
    async async_unload(entry_id: string): boolean {
        entry = this.async_get_entry(entry_id)

        if (!entry) {
            throw new UnknownEntry
        }

        if (entry.state in UNRECOVERABLE_STATES) {
            throw new OperationNotAllowed
        }

        return await entry.async_unload(this.hass)
    }

    /**
     * Reload an entry.

        If an entry was not loaded, will just load.

     */
    async async_reload(entry_id: string): boolean {
        unload_result = await this.async_unload(entry_id)

        if (!unload_result) {
            return unload_result
        }

        return await this.async_setup(entry_id)
    }

    // @callback
    /**
     * Update a config entry.

        If the entry was changed, the update_listeners are
        fired and this function returns true

        If the entry was not changed, the update_listeners are
        not fired and this function returns false

     */
    async_update_entry(

        entry: ConfigEntry,
        *,
        unique_id: Union<string, dict, null, UndefinedType> = UNDEFINED,
        title: Union<string, dict, UndefinedType> = UNDEFINED,
        data: Union<dict, UndefinedType> = UNDEFINED,
        options: Union<dict, UndefinedType> = UNDEFINED,
        system_options: Union<dict, UndefinedType> = UNDEFINED,
    ): boolean {
        changed = false

        if (unique_id is !UNDEFINED and entry.unique_id !== unique_id) {
            changed = true
            entry.unique_id = cast(Optional[str], unique_id)
        }

        if (title is !UNDEFINED and entry.title !== title) {
            changed = true
            entry.title = cast(str, title)
        }

        if (data is !UNDEFINED and entry.data !== data) {
            changed = true
            entry.data = MappingProxyType(data)
        }

        if (options is !UNDEFINED and entry.options !== options) {
            changed = true
            entry.options = MappingProxyType(options)
        }

        if (
            system_options is !UNDEFINED
            and entry.system_options.as_dict() !== system_options
        ) {
            changed = true
            entry.system_options.update(**system_options)
        }

        if (!changed) {
            return false
        }

        for(const listener_ref of entry.update_listeners) {
            listener = listener_ref()
            if (listener is !null) {
                this.hass.async_create_task(listener(this.hass, entry))
            }
        }

        this._async_schedule_save()

        return true
    }

    /**
     * Forward the setup of an entry to a different component.

        By default an entry is setup with the component it belongs to. If that
        component also has related platforms, the component will have to
        forward the entry to be setup by that component.

        You don't want to await this coroutine if it is called as part of the
        setup of a component, because it can cause a deadlock.

     */
    async async_forward_entry_setup(entry: ConfigEntry, domain: string): boolean {
        // Setup Component if not set up yet
        if (domain !in this.hass.config.components) {
            result = await async_setup_component(this.hass, domain, this._hass_config)

            if (!result) {
                return false
            }
        }

        integration = await loader.async_get_integration(this.hass, domain)

        await entry.async_setup(this.hass, integration=integration)
        return true
    }

    /**
     * Forward the unloading of an entry to a different component.
     */
    async async_forward_entry_unload(entry: ConfigEntry, domain: string): boolean {
        // It was never loaded.
        if (domain !in this.hass.config.components) {
            return true
        }

        integration = await loader.async_get_integration(this.hass, domain)

        return await entry.async_unload(this.hass, integration=integration)
    }

    // @callback
    /**
     * Save the entity registry to a file.
     */
    _async_schedule_save() {
        this._store.async_delay_save(this._data_to_save, SAVE_DELAY)
    }

    // @callback
    /**
     * Return data to save.
     */
    _data_to_save(): Dict[str, Dict[str, any]][] {
        return {"entries": [entry.as_dict() for entry in this._entries]}
    }
}

/**
 * Migrate the pre-0.73 config format to the latest version.
 */
export async function _old_conf_migrator(old_config: Dict<any>): Dict<any> {
    return {"entries": old_config}
}

/**
 * Base class for config flows with some helpers.
 */
export class ConfigFlow extends data_entry_flow.FlowHandler {

    /**
     * Initialize a subclass, register if possible.
     */
    __init_subclass__(cls, domain: Optional<string> = null, **kwargs: any) {
        super().__init_subclass__(**kwargs)  // type: ignore
        if (domain is !null) {
            HANDLERS.register(domain)(cls)
        }
    }

    CONNECTION_CLASS = CONN_CLASS_UNKNOWN

    // @property
    /**
     * Return unique ID if available.
     */
    unique_id(): Optional<string> {
        // pylint: disable=no-member
        if (!this.context) {
            return null
        }

        return cast(Optional[str], this.context.get("unique_id"))
    }

    // @staticmethod
    // @callback
    /**
     * Get the options flow for this handler.
     */
    async_get_options_flow(config_entry: ConfigEntry): "OptionsFlow" {
        throw new data_entry_flow.UnknownHandler
    }

    // @callback
    /**
     * Abort if the unique ID is already configured.
     */
    _abort_if_unique_id_configured(

        updates: Optional[Dict[Any, any]] = null,
        reload_on_update: boolean = true,
    ) {
        assert this.hass
        if (!this.unique_id) {
            return
        }

        for(const entry of this._async_current_entries()) {
            if (entry.unique_id === this.unique_id) {
                if (updates is !null) {
                    changed = this.hass.config_entries.async_update_entry(
                        entry, data={**entry.data, **updates}
                    )
                    if (
                        changed
                        and reload_on_update
                        and entry.state in (ENTRY_STATE_LOADED, ENTRY_STATE_SETUP_RETRY)
                    ) {
                        this.hass.async_create_task(
                            this.hass.config_entries.async_reload(entry.entry_id)
                        )
                    }
                }
                // Allow ignored entries to be configured on manual user step
                if (entry.source === SOURCE_IGNORE and this.source === SOURCE_USER) {
                    continue
                }
                throw new data_entry_flow.AbortFlow("already_configured")
            }
        }
    }

    /**
     * Set a unique ID for the config flow.

        Returns optionally existing config entry with same ID.

     */
    async async_set_unique_id(
        unique_id: Optional<string> = null, *, raise_on_progress: boolean = true
    ): Optional<ConfigEntry> {
        if (!unique_id) {
            this.context["unique_id"] = null  // pylint: disable=no-member
            return null
        }

        if (raise_on_progress) {
            for(const progress of this._async_in_progress()) {
                if (progress["context"].get("unique_id") === unique_id) {
                    throw new data_entry_flow.AbortFlow("already_in_progress")
                }
            }
        }

        this.context["unique_id"] = unique_id  // pylint: disable=no-member

        // Abort discoveries done using the default discovery unique id
        assert this.hass
        if (unique_id !== DEFAULT_DISCOVERY_UNIQUE_ID) {
            for(const progress of this._async_in_progress()) {
                if (progress["context"].get("unique_id") === DEFAULT_DISCOVERY_UNIQUE_ID) {
                    this.hass.config_entries.flow.async_abort(progress["flow_id"])
                }
            }
        }

        for(const entry of this._async_current_entries()) {
            if (entry.unique_id === unique_id) {
                return entry
            }
        }

        return null
    }

    // @callback
    /**
     * Return current entries.
     */
    _async_current_entries(): ConfigEntry[] {
        assert this.hass
        return this.hass.config_entries.async_entries(this.handler)
    }

    // @callback
    /**
     * Return current unique IDs.
     */
    _async_current_ids(include_ignore: boolean = true): Set[Optional[str]] {
        assert this.hass
        return {
            entry.unique_id
            for entry in this.hass.config_entries.async_entries(this.handler)
            if (include_ignore or entry.source !== SOURCE_IGNORE
        }
    }

    // @callback
    /**
     * Return other in progress flows for current domain.
     */
    _async_in_progress() {
            }
        assert this.hass
        return [
            flw
            for flw in this.hass.config_entries.flow.async_progress()
            if (flw["handler"] === this.handler and flw["flow_id"] !== this.flow_id
        ]
    }

    /**
     * Ignore this config flow.
     */
    async async_step_ignore(user_input) {
            }
        await this.async_set_unique_id(user_input["unique_id"], raise_on_progress=false)
        return this.async_create_entry(title=user_input["title"], data={})
    }

    /**
     * Rediscover a config entry by it's unique_id.
     */
    async async_step_unignore(user_input: Dict<any>): Dict<any> {
        return this.async_abort(reason="not_implemented")
    }

    /**
     * Handle a flow initiated by the user.
     */
    async async_step_user(
        user_input: Optional[Dict[str, any]] = null
    ): Dict<any> {
        return this.async_abort(reason="not_implemented")
    }

    /**
     * Mark this flow discovered, without a unique identifier.

        If a flow initiated by discovery, doesn't have a unique ID, this can
        be used alternatively. It will ensure only 1 flow is started and only
        when the handler has no existing config entries.

        It ensures that the discovery can be ignored by the user.

     */
    async _async_handle_discovery_without_unique_id() {
        if (this.unique_id is !null) {
            return
        }

        // Abort if the handler has config entries already
        if (this._async_current_entries() {
            throw new data_entry_flow.AbortFlow("already_configured")
        }

        // Use an special unique id to differentiate
        await this.async_set_unique_id(DEFAULT_DISCOVERY_UNIQUE_ID)
        this._abort_if_unique_id_configured()

        // Abort if any other flow for this handler is already in progress
        assert this.hass
        if (this._async_in_progress() {
            throw new data_entry_flow.AbortFlow("already_in_progress")
        }
    }

    /**
     * Handle a flow initialized by discovery.
     */
    async async_step_discovery(
        discovery_info: Dict<any>
    ): Dict<any> {
        await this._async_handle_discovery_without_unique_id()
        return await this.async_step_user()
    }

    // @callback
    /**
     * Abort the config flow.
     */
    async_abort(
        *, reason: string, description_placeholders: Optional<Dict> = null
    ): Dict<any> {
        assert this.hass

        // Remove reauth notification if no reauth flows are in progress
        if (this.source === SOURCE_REAUTH and !any(
            ent["context"]["source"] === SOURCE_REAUTH
            for ent in this.hass.config_entries.flow.async_progress()
            if ent["flow_id"] !== this.flow_id
        ) {
            this.hass.components.persistent_notification.async_dismiss(
                RECONFIGURE_NOTIFICATION_ID
            )
        }

        return super().async_abort(
            reason=reason, description_placeholders=description_placeholders
        )
    }

    async_step_hassio = async_step_discovery
    async_step_homekit = async_step_discovery
    async_step_mqtt = async_step_discovery
    async_step_ssdp = async_step_discovery
    async_step_zeroconf = async_step_discovery
    async_step_dhcp = async_step_discovery
}

/**
 * Flow to set options for a configuration entry.
 */
export class OptionsFlowManager extends data_entry_flow.FlowManager {

    /**
     * Create an options flow for a config entry.

        Entry_id and flow.handler is the same thing to map entry with flow.

     */
    async async_create_flow(

        handler_key: any,
        *,
        context: Optional[Dict[str, any]] = null,
        data: Optional[Dict[str, any]] = null,
    ): "OptionsFlow" {
        entry = this.hass.config_entries.async_get_entry(handler_key)
        if (!entry) {
            throw new UnknownEntry(handler_key)
        }

        if (entry.domain !in HANDLERS) {
            throw new data_entry_flow.UnknownHandler
        }

        return cast(OptionsFlow, HANDLERS[entry.domain].async_get_options_flow(entry))
    }

    /**
     * Finish an options flow and update options for configuration entry.

        Flow.handler and entry_id is the same thing to map flow with entry.

     */
    async async_finish_flow(
        flow: data_entry_flow.FlowHandler, result: Dict<any>
    ): Dict<any> {
        flow = cast(OptionsFlow, flow)

        if (result["type"] !== data_entry_flow.RESULT_TYPE_CREATE_ENTRY) {
            return result
        }

        entry = this.hass.config_entries.async_get_entry(flow.handler)
        if (!entry) {
            throw new UnknownEntry(flow.handler)
        }
        if (result["data"] is !null) {
            this.hass.config_entries.async_update_entry(entry, options=result["data"])
        }

        result["result"] = true
        return result
    }
}

/**
 * Base class for config option flows.
 */
export class OptionsFlow extends data_entry_flow.FlowHandler {

    handler: string
}

// @attr.s(slots=true)
/**
 * Config entry system options.
 */
export class SystemOptions {

    disable_new_entities: boolean = attr.ib(default=false)

    /**
     * Update properties.
     */
    update(*, disable_new_entities: boolean) {
        this.disable_new_entities = disable_new_entities
    }

    /**
     * Return dictionary version of this config entries system options.
     */
    as_dict(): Dict<any> {
        return {"disable_new_entities": this.disable_new_entities}
    }
}

/**
 * Handler to handle when entities related to config entries updating disabled_by.
 */
export class EntityRegistryDisabledHandler {

    /**
     * Initialize the handler.
     */
    constructor(hass: HomeAssistant) {
        this.hass = hass
        this.registry: Optional[entity_registry.EntityRegistry] = null
        this.changed: Set<string> = set()
        this._remove_call_later: Optional[Callable[[], null]] = null
    }

    // @callback
    /**
     * Set up the disable handler.
     */
    async_setup() {
        this.hass.bus.async_listen(
            entity_registry.EVENT_ENTITY_REGISTRY_UPDATED, this._handle_entry_updated
        )
    }

    /**
     * Handle entity registry entry update.
     */
    async _handle_entry_updated(event: Event) {
        if (
            event.data["action"] !== "update"
            or "disabled_by" !in event.data["changes"]
        ) {
            return
        }

        if (!this.registry) {
            this.registry = await entity_registry.async_get_registry(this.hass)
        }

        entity_entry = this.registry.async_get(event.data["entity_id"])

        if (
            // Stop if no entry found
            !entity_entry
            // Stop if entry !connected to config entry
            or !entity_entry.config_entry_id
            // Stop if the entry got disabled. In that case the entity handles it
            // themselves.
            or entity_entry.disabled_by
        ) {
            return
        }

        config_entry = this.hass.config_entries.async_get_entry(
            entity_entry.config_entry_id
        )
        assert config_entry

        if (config_entry.entry_id !in this.changed and config_entry.supports_unload) {
            this.changed.add(config_entry.entry_id)
        }

        if (!this.changed) {
            return
        }

        // We are going to delay reloading on *every* entity registry change so that
        // if a user is happily clicking along, it will only reload at the end.

        if (this._remove_call_later) {
            this._remove_call_later()
        }

        this._remove_call_later = this.hass.helpers.event.async_call_later(
            RELOAD_AFTER_UPDATE_DELAY, this._handle_reload
        )
    }

    /**
     * Handle a reload.
     */
    async _handle_reload(_now: any) {
        this._remove_call_later = null
        to_reload = this.changed
        this.changed = set()

        _LOGGER.info(
            "Reloading configuration entries because disabled_by changed in entity registry: %s",
            ", ".join(this.changed),
        )

        await asyncio.gather(
            *[this.hass.config_entries.async_reload(entry_id) for entry_id in to_reload]
        )
    }
}

/**
 * Test if a domain supports entry unloading.
 */
export async function support_entry_unload(hass: HomeAssistant, domain: string): boolean {
    integration = await loader.async_get_integration(hass, domain)
    component = integration.get_component()
    return hasattr(component, "async_unload_entry")
}
