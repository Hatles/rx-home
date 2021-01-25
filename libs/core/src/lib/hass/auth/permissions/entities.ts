/**
 * Entity permissions.
 */
from collections import OrderedDict
from typing import Callable, Optional

import voluptuous as vol

from .const import POLICY_CONTROL, POLICY_EDIT, POLICY_READ, SUBCAT_ALL
from .models import PermissionLookup
from .types import CategoryType, SubCategoryDict, ValueType
from .util import SubCatLookupType, compile_policy, lookup_all

export const SINGLE_ENTITY_SCHEMA = Joi.Any(
    true,
    Joi.Schema(
        {
            Joi.Optional(POLICY_READ): true,
            Joi.Optional(POLICY_CONTROL): true,
            Joi.Optional(POLICY_EDIT): true,
        }
    ),
)

export const ENTITY_DOMAINS = "domains"
export const ENTITY_AREAS = "area_ids"
export const ENTITY_DEVICE_IDS = "device_ids"
export const ENTITY_ENTITY_IDS = "entity_ids"

export const ENTITY_VALUES_SCHEMA = Joi.Any(true, Joi.Schema({str: SINGLE_ENTITY_SCHEMA}))

export const ENTITY_POLICY_SCHEMA = Joi.Any(
    true,
    Joi.Schema(
        {
            Joi.Optional(SUBCAT_ALL): SINGLE_ENTITY_SCHEMA,
            Joi.Optional(ENTITY_AREAS): ENTITY_VALUES_SCHEMA,
            Joi.Optional(ENTITY_DEVICE_IDS): ENTITY_VALUES_SCHEMA,
            Joi.Optional(ENTITY_DOMAINS): ENTITY_VALUES_SCHEMA,
            Joi.Optional(ENTITY_ENTITY_IDS): ENTITY_VALUES_SCHEMA,
        }
    ),
)


/**
 * Look up entity permissions by domain.
 */
export function _lookup_domain(
    perm_lookup: PermissionLookup, domains_dict: SubCategoryDict, entity_id: string
): Optional<ValueType> {
    return domains_dict.get(entity_id.split(".", 1)[0])
}

/**
 * Look up entity permissions by area.
 */
export function _lookup_area(
    perm_lookup: PermissionLookup, area_dict: SubCategoryDict, entity_id: string
): Optional<ValueType> {
    entity_entry = perm_lookup.entity_registry.async_get(entity_id)

    if (!entity_entry or !entity_entry.device_id) {
        return null
    }

    device_entry = perm_lookup.device_registry.async_get(entity_entry.device_id)

    if (!device_entry or !device_entry.area_id) {
        return null
    }

    return area_dict.get(device_entry.area_id)
}

/**
 * Look up entity permissions by device.
 */
export function _lookup_device(
    perm_lookup: PermissionLookup, devices_dict: SubCategoryDict, entity_id: string
): Optional<ValueType> {
    entity_entry = perm_lookup.entity_registry.async_get(entity_id)

    if (!entity_entry or !entity_entry.device_id) {
        return null
    }

    return devices_dict.get(entity_entry.device_id)
}

/**
 * Look up entity permission by entity id.
 */
export function _lookup_entity_id(
    perm_lookup: PermissionLookup, entities_dict: SubCategoryDict, entity_id: string
): Optional<ValueType> {
    return entities_dict.get(entity_id)
}

/**
 * Compile policy int a function that tests policy.
 */
export function compile_entities(
    policy: CategoryType, perm_lookup: PermissionLookup
): Callable[[str, string], boolean] {
    subcategories: SubCatLookupType = OrderedDict()
    subcategories[ENTITY_ENTITY_IDS] = _lookup_entity_id
    subcategories[ENTITY_DEVICE_IDS] = _lookup_device
    subcategories[ENTITY_AREAS] = _lookup_area
    subcategories[ENTITY_DOMAINS] = _lookup_domain
    subcategories[SUBCAT_ALL] = lookup_all

    return compile_policy(policy, subcategories, perm_lookup)
}
