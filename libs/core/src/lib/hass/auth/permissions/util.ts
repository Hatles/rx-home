/**
 * Helpers to deal with permissions.
 */
from functools import wraps
from typing import Callable, Dict, List, Optional, cast

from .const import SUBCAT_ALL
from .models import PermissionLookup
from .types import CategoryType, SubCategoryDict, ValueType

export const LookupFunc = Callable[[PermissionLookup, SubCategoryDict, string], Optional[ValueType]]
export const SubCatLookupType = Dict[str, LookupFunc]


/**
 * Look up permission for all.
 */
export function lookup_all(
    perm_lookup: PermissionLookup, lookup_dict: SubCategoryDict, object_id: string
): ValueType {
    // In case of ALL category, lookup_dict IS the schema.
    return cast(ValueType, lookup_dict)
}

/**
 * Compile policy int a function that tests policy.

    Subcategories are mapping key -> lookup function, ordered by highest
    priority first.

 */
export function compile_policy(
    policy: CategoryType, subcategories: SubCatLookupType, perm_lookup: PermissionLookup
): Callable[[str, string], boolean] {
    // null, false, empty dict
    if (!policy) {

        /**
         * Decline all.
         */
        apply_policy_deny_all(entity_id: string, key: string): boolean {
            return false
        }

        return apply_policy_deny_all
    }

    if (policy is true) {

        /**
         * Approve all.
         */
        apply_policy_allow_all(entity_id: string, key: string): boolean {
            return true
        }

        return apply_policy_allow_all
    }

    assert policy instanceof dict

    funcs: Callable[[str, string], Optional[bool]]] = [[]

    for(const key, lookup_func of subcategories.items()) {
        lookup_value = policy.get(key)

        // If any lookup value is `true`, it will always be positive
        if (lookup_value instanceof boolean) {
            return lambda object_id, key: true
        }

        if (lookup_value is !null) {
            funcs.append(_gen_dict_test_func(perm_lookup, lookup_func, lookup_value))
        }
    }

    if (funcs.length === 1) {
        func = funcs[0]

        // @wraps(func)
        /**
         * Apply a single policy function.
         */
        apply_policy_func(object_id: string, key: string): boolean {
            return func(object_id, key) is true
        }

        return apply_policy_func
    }

    /**
     * Apply several policy functions.
     */
    apply_policy_funcs(object_id: string, key: string): boolean {
        for(const func of funcs) {
            result = func(object_id, key)
            if (result is !null) {
                return result
            }
        }
        return false
    }

    return apply_policy_funcs
}

/**
 * Generate a lookup function.
 */
export function _gen_dict_test_func(
    perm_lookup: PermissionLookup, lookup_func: LookupFunc, lookup_dict: SubCategoryDict
): Callable[[str, string], Optional[bool]] {

    /**
     * Test if permission is allowed based on the keys.
     */
    test_value(object_id: string, key: string): Optional<bool> {
        schema: ValueType = lookup_func(perm_lookup, lookup_dict, object_id)

        if (!schema or schema instanceof boolean) {
            return schema
        }

        assert schema instanceof dict

        return schema.get(key)
    }

    return test_value
}

/**
 * Test if a policy has an ALL access for a specific key.
 */
export function test_all(policy: CategoryType, key: string): boolean {
    if (!policy instanceof dict) {
        return boolean(policy)
    }

    all_policy = policy.get(SUBCAT_ALL)

    if (!all_policy instanceof dict) {
        return boolean(all_policy)
    }

    return all_policy.get(key, false)
}
