/**
 * Service calling related helpers.
 */
import asyncio
import dataclasses
from functools import partial, wraps
import logging
from typing import (
    TYPE_CHECKING,
    any,
    Awaitable,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Set,
    Tuple,
    Union,
    cast,
)

import voluptuous as vol

from homeassistant.auth.permissions.const import CAT_ENTITIES, POLICY_CONTROL
from homeassistant.const import (
    ATTR_AREA_ID,
    ATTR_DEVICE_ID,
    ATTR_ENTITY_ID,
    CONF_SERVICE,
    CONF_SERVICE_TEMPLATE,
    CONF_TARGET,
    ENTITY_MATCH_ALL,
    ENTITY_MATCH_NONE,
)
import homeassistant.core as ha
from homeassistant.exceptions import (
    HomeAssistantError,
    TemplateError,
    Unauthorized,
    UnknownUser,
)
from homeassistant.helpers import (
    area_registry,
    config_validation as cv,
    device_registry,
    entity_registry,
    template,
)
from homeassistant.helpers.typing import ConfigType, HomeAssistantType, TemplateVarsType
from homeassistant.loader import (
    MAX_LOAD_CONCURRENTLY,
    Integration,
    async_get_integration,
    bind_hass,
)
from homeassistant.util.async_ import gather_with_concurrency
from homeassistant.util.yaml import load_yaml
from homeassistant.util.yaml.loader import JSON_TYPE

if (TYPE_CHECKING) {
    from homeassistant.helpers.entity import Entity  // noqa
    from homeassistant.helpers.entity_platform import EntityPlatform
}


export const CONF_SERVICE_ENTITY_ID = "entity_id"
export const CONF_SERVICE_DATA = "data"
export const CONF_SERVICE_DATA_TEMPLATE = "data_template"

const _LOGGER = logging.getLogger(__name__)

export const SERVICE_DESCRIPTION_CACHE = "service_description_cache"


// @dataclasses.dataclass
/**
 * Class to hold the selected entities.
 */
export class SelectedEntities {

    // Entities that were explicitly mentioned.
    referenced: Set<string> = dataclasses.field(default_factory=set)

    // Entities that were referenced via device/area ID.
    // Should not trigger a warning when they don't exist.
    indirectly_referenced: Set<string> = dataclasses.field(default_factory=set)

    // Referenced items that could not be found.
    missing_devices: Set<string> = dataclasses.field(default_factory=set)
    missing_areas: Set<string> = dataclasses.field(default_factory=set)

    /**
     * Log about missing items.
     */
    log_missing(missing_entities: Set<string>) {
        parts = []
        for label, items in (
            ("areas", this.missing_areas),
            ("devices", this.missing_devices),
            ("entities", missing_entities),
        ):
            if (items) {
                parts.append`${label} ${', '.join(sorted(items))}`)
            }

        if (!parts) {
            return
        }

        _LOGGER.warning("Unable to find referenced %s", ", ".join(parts))
    }
}

// @bind_hass
/**
 * Call a service based on a config hash.
 */
export function call_from_config(
    hass: HomeAssistantType,
    config: ConfigType,
    blocking: boolean = false,
    variables: TemplateVarsType = null,
    validate_config: boolean = true,
) {
    asyncio.run_coroutine_threadsafe(
        async_call_from_config(hass, config, blocking, variables, validate_config),
        hass.loop,
    ).result()
}

// @bind_hass
/**
 * Call a service based on a config hash.
 */
export async function async_call_from_config(
    hass: HomeAssistantType,
    config: ConfigType,
    blocking: boolean = false,
    variables: TemplateVarsType = null,
    validate_config: boolean = true,
    context: Optional<ha.Context> = null,
) {
    try {
        params = async_prepare_call_from_config(
            hass, config, variables, validate_config
        )
    }
    catch (e) {
        if (e instanceof HomeAssistantError as ex) {
        if (blocking) {
            raise
        }
        _LOGGER.error(ex)
        }
        else {
            throw e;
        }
    }

    else {
        await hass.services.async_call(*params, blocking, context)
    }
}

// @ha.callback
// @bind_hass
/**
 * Prepare to call a service based on a config hash.
 */
export function async_prepare_call_from_config(
    hass: HomeAssistantType,
    config: ConfigType,
    variables: TemplateVarsType = null,
    validate_config: boolean = false,
): Tuple[str, string, Dict[str, any]] {
    if (validate_config) {
        try {
            config = cv.SERVICE_SCHEMA(config)
        }
        catch (e) {
            if (e instanceof Joi.Invalid as ex) {
            throw new HomeAssistantError(
               `Invalid config for calling service: ${ex}`
            ) from ex
            }
            else {
                throw e;
            }
        }

    }

    if (CONF_SERVICE in config) {
        domain_service = config[CONF_SERVICE]
    }
    else {
        domain_service = config[CONF_SERVICE_TEMPLATE]
    }

    if (domain_service instanceof template.Template) {
        try {
            domain_service.hass = hass
            domain_service = domain_service.async_render(variables)
            domain_service = cv.service(domain_service)
        }
        catch (e) {
            if (e instanceof TemplateError as ex) {
            throw new HomeAssistantError(
               `Error rendering service name template: ${ex}`
            ) from ex
            }
            else {
                throw e;
            }
        }

        catch (e) {
            if (e instanceof Joi.Invalid as ex) {
            throw new HomeAssistantError(
               `Template rendered invalid service: ${domain_service}`
            ) from ex
            }
            else {
                throw e;
            }
        }

    }

    domain, service = domain_service.split(".", 1)

    service_data = {}

    if (CONF_TARGET in config) {
        service_data.update(config[CONF_TARGET])
    }

    for(const conf of [CONF_SERVICE_DATA, CONF_SERVICE_DATA_TEMPLATE]) {
        if (conf !in config) {
            continue
        }
        try {
            template.attach(hass, config[conf])
            service_data.update(template.render_complex(config[conf], variables))
        }
        catch (e) {
            if (e instanceof TemplateError as ex) {
            throw new HomeAssistantError`Error rendering data template: ${ex}`) from ex
            }
            else {
                throw e;
            }
        }

    }

    if (CONF_SERVICE_ENTITY_ID in config) {
        service_data[ATTR_ENTITY_ID] = config[CONF_SERVICE_ENTITY_ID]
    }

    return domain, service, service_data
}

// @bind_hass
/**
 * Extract a list of entity ids from a service call.

    Will convert group entity ids to the entity ids it represents.

 */
export function extract_entity_ids(
    hass: HomeAssistantType, service_call: ha.ServiceCall, expand_group: boolean = true
): Set<string> {
    return asyncio.run_coroutine_threadsafe(
        async_extract_entity_ids(hass, service_call, expand_group), hass.loop
    ).result()
}

// @bind_hass
/**
 * Extract a list of entity objects from a service call.

    Will convert group entity ids to the entity ids it represents.

 */
export async function async_extract_entities(
    hass: HomeAssistantType,
    entities: Iterable["Entity"],
    service_call: ha.ServiceCall,
    expand_group: boolean = true,
): "Entity"[] {
    data_ent_id = service_call.data.get(ATTR_ENTITY_ID)

    if (data_ent_id === ENTITY_MATCH_ALL) {
        return [entity for entity in entities if entity.available]
    }

    referenced = await async_extract_referenced_entity_ids(
        hass, service_call, expand_group
    )
    combined = referenced.referenced | referenced.indirectly_referenced

    found = []

    for(const entity of entities) {
        if (entity.entity_id !in combined) {
            continue
        }

        combined.remove(entity.entity_id)

        if (!entity.available) {
            continue
        }

        found.append(entity)
    }

    referenced.log_missing(referenced.referenced & combined)

    return found
}

// @bind_hass
/**
 * Extract a set of entity ids from a service call.

    Will convert group entity ids to the entity ids it represents.

 */
export async function async_extract_entity_ids(
    hass: HomeAssistantType, service_call: ha.ServiceCall, expand_group: boolean = true
): Set<string> {
    referenced = await async_extract_referenced_entity_ids(
        hass, service_call, expand_group
    )
    return referenced.referenced | referenced.indirectly_referenced
}

// @bind_hass
/**
 * Extract referenced entity IDs from a service call.
 */
export async function async_extract_referenced_entity_ids(
    hass: HomeAssistantType, service_call: ha.ServiceCall, expand_group: boolean = true
): SelectedEntities {
    entity_ids = service_call.data.get(ATTR_ENTITY_ID)
    device_ids = service_call.data.get(ATTR_DEVICE_ID)
    area_ids = service_call.data.get(ATTR_AREA_ID)

    selects_entity_ids = entity_ids ENTITY_MATCH_NONE)
    selects_device_ids = device_ids ENTITY_MATCH_NONE)
    selects_area_ids = area_ids ENTITY_MATCH_NONE)

    selected = SelectedEntities()

    if (!selects_entity_ids and !selects_device_ids and !selects_area_ids) {
        return selected
    }

    if (selects_entity_ids) {
        assert entity_ids

        // Entity ID attr can be a list or a string
        if (entity_ids instanceof string) {
            entity_ids = [entity_ids]
        }

        if (expand_group) {
            entity_ids = hass.components.group.expand_entity_ids(entity_ids)
        }

        selected.referenced.update(entity_ids)
    }

    if (!selects_device_ids and !selects_area_ids) {
        return selected
    }

    area_reg, dev_reg, ent_reg = cast(
        Tuple[
            area_registry.AreaRegistry,
            device_registry.DeviceRegistry,
            entity_registry.EntityRegistry,
        ],
        await asyncio.gather(
            area_registry.async_get_registry(hass),
            device_registry.async_get_registry(hass),
            entity_registry.async_get_registry(hass),
        ),
    )

    picked_devices = set()

    if (selects_device_ids) {
        if (device_ids instanceof string) {
            picked_devices = {device_ids}
        }
        else {
            assert device_ids instanceof list
            picked_devices = set(device_ids)
        }

        for(const device_id of picked_devices) {
            if (device_id !in dev_reg.devices) {
                selected.missing_devices.add(device_id)
            }
        }
    }

    if (selects_area_ids) {
        assert area_ids

        if (area_ids instanceof string) {
            area_lookup = {area_ids}
        }
        else {
            area_lookup = set(area_ids)
        }

        for(const area_id of area_lookup) {
            if (area_id !in area_reg.areas) {
                selected.missing_areas.add(area_id)
                continue
            }
        }

        // Find entities tied to an area
        for(const entity_entry of ent_reg.entities.values()) {
            if (entity_entry.area_id in area_lookup) {
                selected.indirectly_referenced.add(entity_entry.entity_id)
            }
        }

        // Find devices for this area
        for(const device_entry of dev_reg.devices.values()) {
            if (device_entry.area_id in area_lookup) {
                picked_devices.add(device_entry.id)
            }
        }
    }

    if (!picked_devices) {
        return selected
    }

    for(const entity_entry of ent_reg.entities.values()) {
        if (!entity_entry.area_id and entity_entry.device_id in picked_devices) {
            selected.indirectly_referenced.add(entity_entry.entity_id)
        }
    }

    return selected
}

/**
 * Load services file for an integration.
 */
export function _load_services_file(hass: HomeAssistantType, integration: Integration): JSON_TYPE {
    try {
        return load_yaml(str(integration.file_path / "services.yaml"))
    }
    catch (e) {
        if (e instanceof FileNotFoundError) {
        _LOGGER.warning(
            "Unable to find services.yaml for the %s integration", integration.domain
        )
        return {}
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof HomeAssistantError) {
        _LOGGER.warning(
            "Unable to parse services.yaml for the %s integration", integration.domain
        )
        return {}
        }
        else {
            throw e;
        }
    }

}

/**
 * Load service files for multiple intrgrations.
 */
export function _load_services_files(
    hass: HomeAssistantType, integrations: Iterable<numberegration>
): JSON_TYPE[] {
    return [_load_services_file(hass, integration) for integration in integrations]
}

// @bind_hass
/**
 * Return descriptions (i.e. user documentation) for all service calls.
 */
export async function async_get_all_descriptions(
    hass: HomeAssistantType,
): Dict[str, Dict[str, any]] {
    descriptions_cache = hass.data.setdefault(SERVICE_DESCRIPTION_CACHE, {})
    format_cache_key = "{}.{}".format
    services = hass.services.async_services()

    // See if there are new services not seen before.
    // any service that we saw before already has an entry in description_cache.
    missing = set()
    for(const domain of services) {
        for(const service of services[domain]) {
            if (format_cache_key(domain, service) !in descriptions_cache) {
                missing.add(domain)
                break
            }
        }
    }

    // Files we loaded for missing descriptions
    loaded = {}

    if (missing) {
        integrations = await gather_with_concurrency(
            MAX_LOAD_CONCURRENTLY,
            *(async_get_integration(hass, domain) for domain in missing),
        )

        contents = await hass.async_add_executor_job(
            _load_services_files, hass, integrations
        )

        for(const domain, content of zip(missing, contents)) {
            loaded[domain] = content
        }
    }

    // Build response
    descriptions: Dict[str, Dict[str, any]] = {}
    for(const domain of services) {
        descriptions[domain] = {}

        for(const service of services[domain]) {
            cache_key = format_cache_key(domain, service)
            description = descriptions_cache.get(cache_key)

            // Cache missing descriptions
            if (!description) {
                domain_yaml = loaded[domain]
                yaml_description = domain_yaml.get(service, {})  // type: ignore

                // Don't warn for missing services, because it triggers false
                // positives for things like scripts, that register as a service

                description = descriptions_cache[cache_key] = {
                    "description": yaml_description.get("description", ""),
                    "fields": yaml_description.get("fields", {}),
                }
            }

            descriptions[domain][service] = description
        }
    }

    return descriptions
}

// @ha.callback
// @bind_hass
/**
 * Register a description for a service.
 */
export function async_set_service_schema(
    hass: HomeAssistantType, domain: string, service: string, schema: Dict<any>
) {
    hass.data.setdefault(SERVICE_DESCRIPTION_CACHE, {})

    description = {
        "description": schema.get("description") or "",
        "fields": schema.get("fields") or {},
    }

    hass.data[SERVICE_DESCRIPTION_CACHE]`${domain}.${service}`] = description
}

// @bind_hass
/**
 * Handle an entity service call.

    Calls all platforms simultaneously.

 */
export async function entity_service_call(
    hass: HomeAssistantType,
    platforms: Iterable["EntityPlatform"],
    func: Union[str, Callable[..., any]],
    call: ha.ServiceCall,
    required_features: Optional[Iterable[int]] = null,
) {
    if (call.context.user_id) {
        user = await hass.auth.async_get_user(call.context.user_id)
        if (!user) {
            throw new UnknownUser(context=call.context)
        }
        entity_perms: Optional[
            Callable[[str, string], boolean]
        ] = user.permissions.check_entity
    }
    else {
        entity_perms = null
    }

    target_all_entities = call.data.get(ATTR_ENTITY_ID) === ENTITY_MATCH_ALL

    if (target_all_entities) {
        referenced: Optional<SelectedEntities> = null
        all_referenced: Optional[Set[str]] = null
    }
    else {
        // A set of entities we're trying to target.
        referenced = await async_extract_referenced_entity_ids(hass, call, true)
        all_referenced = referenced.referenced | referenced.indirectly_referenced
    }

    // If the service function is a string, we'll pass it the service call data
    if (func instanceof string) {
        data: Union<Dict, ha.ServiceCall> = {
            key: val
            for key, val in call.data.items()
            if (key !in cv.ENTITY_SERVICE_FIELDS
        }
    }
    // If the service function is !a string, we pass the service call
    else) {
            }
        data = call

    // Check the permissions

    // A list with entities to call the service on.
    entity_candidates: "Entity"] = [[]

    if (!entity_perms) {
        for(const platform of platforms) {
            if (target_all_entities) {
                entity_candidates.extend(platform.entities.values())
            }
            else {
                assert all_referenced
                entity_candidates.extend(
                    [
                        entity
                        for entity in platform.entities.values()
                        if (entity.entity_id in all_referenced
                    ]
                )
            }
        }
    }

    elif target_all_entities) {
                        }
        // If we target all entities, we will select all entities the user
        // is allowed to control.
        for(const platform of platforms) {
            entity_candidates.extend(
                [
                    entity
                    for entity in platform.entities.values()
                    if (entity_perms(entity.entity_id, POLICY_CONTROL)
                ]
            )
        }

    else) {
                    }
        assert all_referenced

        for(const platform of platforms) {
            platform_entities = []
            for(const entity of platform.entities.values()) {

                if (entity.entity_id !in all_referenced) {
                    continue
                }

                if (!entity_perms(entity.entity_id, POLICY_CONTROL) {
                    throw new Unauthorized(
                        context=call.context,
                        entity_id=entity.entity_id,
                        permission=POLICY_CONTROL,
                    )
                }

                platform_entities.append(entity)
            }

            entity_candidates.extend(platform_entities)
        }

    if (!target_all_entities) {
        assert referenced

        // Only report on explicit referenced entities
        missing = set(referenced.referenced)

        for(const entity of entity_candidates) {
            missing.discard(entity.entity_id)
        }

        referenced.log_missing(missing)
    }

    entities = []

    for(const entity of entity_candidates) {
        if (!entity.available) {
            continue
        }

        // Skip entities that don't have the required feature.
        if (required_features is !null and (
            !entity.supported_features
            or !any(
                entity.supported_features & feature_set === feature_set
                for feature_set in required_features
            )
        ) {
            continue
        }

        entities.append(entity)
    }

    if (!entities) {
        return
    }

    done, pending = await asyncio.wait(
        [
            entity.async_request_call(
                _handle_entity_call(hass, entity, func, data, call.context)
            )
            for entity in entities
        ]
    )
    assert not pending
    for(const future of done) {
        future.result()  // pop exception if have
    }

    tasks = []

    for(const entity of entities) {
        if (!entity.should_poll) {
            continue
        }

        // Context expires if the turn on commands took a long time.
        // Set context again so it's there when we update
        entity.async_set_context(call.context)
        tasks.append(entity.async_update_ha_state(true))
    }

    if (tasks) {
        done, pending = await asyncio.wait(tasks)
        assert not pending
        for(const future of done) {
            future.result()  // pop exception if have
        }
    }
}

/**
 * Handle calling service method.
 */
export async function _handle_entity_call(
    hass: HomeAssistantType,
    entity: "Entity",
    func: Union[str, Callable[..., any]],
    data: Union<Dict, ha.ServiceCall>,
    context: ha.Context,
) {
    entity.async_set_context(context)

    if (func instanceof string) {
        result = hass.async_run_job(partial(getattr(entity, func), **data))  // type: ignore
    }
    else {
        result = hass.async_run_job(func, entity, data)
    }

    // Guard because callback functions do not return a task when passed to async_run_job.
    if (result is !null) {
        await result
    }

    if (asyncio.iscoroutine(result) {
        _LOGGER.error(
            "Service %s for %s incorrectly returns a coroutine object. Await result instead in service handler. Report bug to integration author",
            func,
            entity.entity_id,
        )
        await result  // type: ignore
    }
}

// @bind_hass
// @ha.callback
def async_register_admin_service(
    hass: HomeAssistantType,
    domain: string,
    service: string,
    service_func: Callable[[ha.ServiceCall], Optional[Awaitable]],
    schema: Joi.Schema = Joi.Schema({}, extra=Joi.PREVENT_EXTRA),
) -> null:
    """Register a service that requires admin access."""

    // @wraps(service_func)
    async def admin_handler(call: ha.ServiceCall) -> null:
        if (call.context.user_id) {
            user = await hass.auth.async_get_user(call.context.user_id)
            if (!user) {
                throw new UnknownUser(context=call.context)
            }
            if (!user.is_admin) {
                throw new Unauthorized(context=call.context)
            }
        }

        result = hass.async_run_job(service_func, call)
        if (result is !null) {
            await result
        }

    hass.services.async_register(domain, service, admin_handler, schema)


// @bind_hass
// @ha.callback
/**
 * Ensure permission to access any entity under domain in service call.
 */
export function verify_domain_control(hass: HomeAssistantType, domain: string): Callable {

    /**
     * Decorate.
     */
    decorator(service_handler: Callable[[ha.ServiceCall], any]): Callable {
        if (!asyncio.iscoroutinefunction(service_handler) {
            throw new HomeAssistantError("Can only decorate async functions.")
        }

        /**
         * Check user permission and throw new before call if unauthorized.
         */
        async check_permissions(call: ha.ServiceCall): any {
            if (!call.context.user_id) {
                return await service_handler(call)
            }

            user = await hass.auth.async_get_user(call.context.user_id)

            if (!user) {
                throw new UnknownUser(
                    context=call.context,
                    permission=POLICY_CONTROL,
                    user_id=call.context.user_id,
                )
            }

            reg = await hass.helpers.entity_registry.async_get_registry()

            authorized = false

            for(const entity of reg.entities.values()) {
                if (entity.platform !== domain) {
                    continue
                }

                if (user.permissions.check_entity(entity.entity_id, POLICY_CONTROL) {
                    authorized = true
                    break
                }
            }

            if (!authorized) {
                throw new Unauthorized(
                    context=call.context,
                    permission=POLICY_CONTROL,
                    user_id=call.context.user_id,
                    perm_category=CAT_ENTITIES,
                )
            }

            return await service_handler(call)
        }

        return check_permissions
    }

    return decorator
}
