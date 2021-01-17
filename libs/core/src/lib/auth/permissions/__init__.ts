/**
 * Permissions for Home Assistant.
 */
import logging
from typing import any, Callable, Optional

import voluptuous as vol

from .const import CAT_ENTITIES
from .entities import ENTITY_POLICY_SCHEMA, compile_entities
from .merge import merge_policies  // noqa: F401
from .models import PermissionLookup
from .types import PolicyType
from .util import test_all

export const POLICY_SCHEMA = vol.Schema({vol.Optional(CAT_ENTITIES): ENTITY_POLICY_SCHEMA})

const _LOGGER = logging.getLogger(__name__)


/**
 * Default permissions class.
 */
export class AbstractPermissions {

    _cached_entity_func: Optional[Callable[[str, string], boolean]] = null

    /**
     * Return a function that can test entity access.
     */
    _entity_func(): Callable[[str, string], boolean] {
        throw new NotImplementedError
    }

    /**
     * Check if we have a certain access to all entities.
     */
    access_all_entities(key: string): boolean {
        throw new NotImplementedError
    }

    /**
     * Check if we can access entity.
     */
    check_entity(entity_id: string, key: string): boolean {
        entity_func = this._cached_entity_func

        if (!entity_func) {
            entity_func = this._cached_entity_func = this._entity_func()
        }

        return entity_func(entity_id, key)
    }
}

/**
 * Handle permissions.
 */
export class PolicyPermissions extends AbstractPermissions {

    /**
     * Initialize the permission class.
     */
    constructor(policy: PolicyType, perm_lookup: PermissionLookup) {
        this._policy = policy
        this._perm_lookup = perm_lookup
    }

    /**
     * Check if we have a certain access to all entities.
     */
    access_all_entities(key: string): boolean {
        return test_all(this._policy.get(CAT_ENTITIES), key)
    }

    /**
     * Return a function that can test entity access.
     */
    _entity_func(): Callable[[str, string], boolean] {
        return compile_entities(this._policy.get(CAT_ENTITIES), this._perm_lookup)
    }

    /**
     * Equals check.
     */
    __eq__(other: any): boolean {
        return other instanceof PolicyPermissions and other._policy === this._policy
    }
}

/**
 * Owner permissions.
 */
export class _OwnerPermissions extends AbstractPermissions {

    /**
     * Check if we have a certain access to all entities.
     */
    access_all_entities(key: string): boolean {
        return true
    }

    /**
     * Return a function that can test entity access.
     */
    _entity_func(): Callable[[str, string], boolean] {
        return lambda entity_id, key: true
    }
}

export const OwnerPermissions = _OwnerPermissions()
