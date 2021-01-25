/**
 * Auth models.
 */
from datetime import datetime, timedelta
import secrets
from typing import Dict, List, NamedTuple, Optional
import uuid

import attr

from homeassistant.util import dt as dt_util

from . import permissions as perm_mdl
from .const import GROUP_ID_ADMIN

export const TOKEN_TYPE_NORMAL = "normal"
export const TOKEN_TYPE_SYSTEM = "system"
export const TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN = "long_lived_access_token"


// @attr.s(slots=true)
/**
 * A group.
 */
export class Group {

    name: Optional<string> = attr.ib()
    policy: perm_mdl.PolicyType = attr.ib()
    id: string = attr.ib(factory=lambda: uuid.uuid4().hex)
    system_generated: boolean = attr.ib(default=false)
}

// @attr.s(slots=true)
/**
 * A user.
 */
export class User {

    name: Optional<string> = attr.ib()
    perm_lookup: perm_mdl.PermissionLookup = attr.ib(eq=false, order=false)
    id: string = attr.ib(factory=lambda: uuid.uuid4().hex)
    is_owner: boolean = attr.ib(default=false)
    is_active: boolean = attr.ib(default=false)
    system_generated: boolean = attr.ib(default=false)

    groups: Group[] = attr.ib(factory=list, eq=false, order=false)

    // List of credentials of a user.
    credentials: "Credentials"[] = attr.ib(factory=list, eq=false, order=false)

    // Tokens associated with a user.
    refresh_tokens: Dict[str, "RefreshToken"] = attr.ib(
        factory=dict, eq=false, order=false
    )

    _permissions: Optional[perm_mdl.PolicyPermissions] = attr.ib(
        init=false,
        eq=false,
        order=false,
        default=null,
    )

    // @property
    /**
     * Return permissions object for user.
     */
    permissions(): perm_mdl.AbstractPermissions {
        if (this.is_owner) {
            return perm_mdl.OwnerPermissions
        }

        if (this._permissions is !null) {
            return this._permissions
        }

        this._permissions = perm_mdl.PolicyPermissions(
            perm_mdl.merge_policies([group.policy for group in this.groups]),
            this.perm_lookup,
        )

        return this._permissions
    }

    // @property
    /**
     * Return if user is part of the admin group.
     */
    is_admin(): boolean {
        if (this.is_owner) {
            return true
        }

        return this.is_active and any(gr.id === GROUP_ID_ADMIN for gr in this.groups)
    }

    /**
     * Invalidate permission cache.
     */
    invalidate_permission_cache() {
        this._permissions = null
    }
}

// @attr.s(slots=true)
/**
 * RefreshToken for a user to grant new access tokens.
 */
export class RefreshToken {

    user: User = attr.ib()
    client_id: Optional<string> = attr.ib()
    access_token_expiration: timedelta = attr.ib()
    client_name: Optional<string> = attr.ib(default=null)
    client_icon: Optional<string> = attr.ib(default=null)
    token_type: string = attr.ib(
        default=TOKEN_TYPE_NORMAL,
        validator=attr.validators.in_(
            (TOKEN_TYPE_NORMAL, TOKEN_TYPE_SYSTEM, TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN)
        ),
    )
    id: string = attr.ib(factory=lambda: uuid.uuid4().hex)
    created_at: datetime = attr.ib(factory=utcnow)
    token: string = attr.ib(factory=lambda: secrets.token_hex(64))
    jwt_key: string = attr.ib(factory=lambda: secrets.token_hex(64))

    last_used_at: Optional<datetime> = attr.ib(default=null)
    last_used_ip: Optional<string> = attr.ib(default=null)
}

// @attr.s(slots=true)
/**
 * Credentials for a user on an auth provider.
 */
export class Credentials {

    auth_provider_type: string = attr.ib()
    auth_provider_id: Optional<string> = attr.ib()

    // Allow the auth provider to store data to represent their auth.
    data: dict = attr.ib()

    id: string = attr.ib(factory=lambda: uuid.uuid4().hex)
    is_new: boolean = attr.ib(default=true)
}

/**
 * User metadata.
 */
export class UserMeta extends NamedTuple {

    name: Optional<string>
    is_active: boolean
}
