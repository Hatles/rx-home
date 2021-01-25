/**
 * System policies.
 */
from .const import CAT_ENTITIES, POLICY_READ, SUBCAT_ALL

export const ADMIN_POLICY = {CAT_ENTITIES: true}

export const USER_POLICY = {CAT_ENTITIES: true}

export const READ_ONLY_POLICY = {CAT_ENTITIES: {SUBCAT_ALL: {POLICY_READ: true}}}
