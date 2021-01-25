/**
 * Storage for auth models.
 */
import asyncio
from collections import OrderedDict
from datetime import timedelta
import hmac
from logging import getLogger
from typing import any, Dict, List, Optional

from homeassistant.auth.const import ACCESS_TOKEN_EXPIRATION
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from . import models
from .const import GROUP_ID_ADMIN, GROUP_ID_READ_ONLY, GROUP_ID_USER
from .permissions import PermissionLookup, system_policies
from .permissions.types import PolicyType

export const STORAGE_VERSION = 1
export const STORAGE_KEY = "auth"
export const GROUP_NAME_ADMIN = "Administrators"
export const GROUP_NAME_USER = "Users"
export const GROUP_NAME_READ_ONLY = "Read Only"


/**
 * Stores authentication info.

    any mutation to an object should happen inside the auth store.

    The auth store is lazy. It won't load the data from disk until a method is
    called that needs it.

 */
export class AuthStore {

    /**
     * Initialize the auth store.
     */
    constructor(hass: HomeAssistant) {
        this.hass = hass
        this._users: Optional[Dict[str, models.User]] = null
        this._groups: Optional[Dict[str, models.Group]] = null
        this._perm_lookup: Optional<PermissionLookup> = null
        this._store = hass.helpers.storage.Store(
            STORAGE_VERSION, STORAGE_KEY, private=true
        )
        this._lock = asyncio.Lock()
    }

    /**
     * Retrieve all users.
     */
    async async_get_groups(): models.Group[] {
        if (!this._groups) {
            await this._async_load()
            assert this._groups
        }

        return list(this._groups.values())
    }

    /**
     * Retrieve all users.
     */
    async async_get_group(group_id: string): Optional<models.Group> {
        if (!this._groups) {
            await this._async_load()
            assert this._groups
        }

        return this._groups.get(group_id)
    }

    /**
     * Retrieve all users.
     */
    async async_get_users(): models.User[] {
        if (!this._users) {
            await this._async_load()
            assert this._users
        }

        return list(this._users.values())
    }

    /**
     * Retrieve a user by id.
     */
    async async_get_user(user_id: string): Optional<models.User> {
        if (!this._users) {
            await this._async_load()
            assert this._users
        }

        return this._users.get(user_id)
    }

    /**
     * Create a new user.
     */
    async async_create_user(

        name: Optional<string>,
        is_owner: Optional<bool> = null,
        is_active: Optional<bool> = null,
        system_generated: Optional<bool> = null,
        credentials: Optional<models.Credentials> = null,
        group_ids: Optional<string>[] = null,
    ): models.User {
        if (!this._users) {
            await this._async_load()
        }

        assert this._users
        assert this._groups

        groups = []
        for(const group_id of group_ids or []) {
            group = this._groups.get(group_id)
            if (!group) {
                throw new ValueError`Invalid group specified ${group_id}`)
            }
            groups.append(group)
        }

        kwargs: Dict<any> = {
            "name": name,
            // Until we get group management, we just put everyone in the
            // same group.
            "groups": groups,
            "perm_lookup": this._perm_lookup,
        }

        if (is_owner is !null) {
            kwargs["is_owner"] = is_owner
        }

        if (is_active is !null) {
            kwargs["is_active"] = is_active
        }

        if (system_generated is !null) {
            kwargs["system_generated"] = system_generated
        }

        new_user = models.User(**kwargs)

        this._users[new_user.id] = new_user

        if (!credentials) {
            this._async_schedule_save()
            return new_user
        }

        // Saving is done inside the link.
        await this.async_link_user(new_user, credentials)
        return new_user
    }

    /**
     * Add credentials to an existing user.
     */
    async async_link_user(
        user: models.User, credentials: models.Credentials
    ) {
        user.credentials.append(credentials)
        this._async_schedule_save()
        credentials.is_new = false
    }

    /**
     * Remove a user.
     */
    async async_remove_user(user: models.User) {
        if (!this._users) {
            await this._async_load()
            assert this._users
        }

        this._users.pop(user.id)
        this._async_schedule_save()
    }

    /**
     * Update a user.
     */
    async async_update_user(

        user: models.User,
        name: Optional<string> = null,
        is_active: Optional<bool> = null,
        group_ids: Optional<string>[] = null,
    ) {
        assert this._groups

        if (group_ids is !null) {
            groups = []
            for(const grid of group_ids) {
                group = this._groups.get(grid)
                if (!group) {
                    throw new ValueError("Invalid group specified.")
                }
                groups.append(group)
            }

            user.groups = groups
            user.invalidate_permission_cache()
        }

        for(const attr_name, value of (("name", name), ("is_active", is_active))) {
            if (value is !null) {
                setattr(user, attr_name, value)
            }
        }

        this._async_schedule_save()
    }

    /**
     * Activate a user.
     */
    async async_activate_user(user: models.User) {
        user.is_active = true
        this._async_schedule_save()
    }

    /**
     * Activate a user.
     */
    async async_deactivate_user(user: models.User) {
        user.is_active = false
        this._async_schedule_save()
    }

    /**
     * Remove credentials.
     */
    async async_remove_credentials(credentials: models.Credentials) {
        if (!this._users) {
            await this._async_load()
            assert this._users
        }

        for(const user of this._users.values()) {
            found = null

            for(const index, cred of enumerate(user.credentials)) {
                if (cred is credentials) {
                    found = index
                    break
                }
            }

            if (found is !null) {
                user.credentials.pop(found)
                break
            }
        }

        this._async_schedule_save()
    }

    /**
     * Create a new token for a user.
     */
    async async_create_refresh_token(

        user: models.User,
        client_id: Optional<string> = null,
        client_name: Optional<string> = null,
        client_icon: Optional<string> = null,
        token_type: string = models.TOKEN_TYPE_NORMAL,
        access_token_expiration: timedelta = ACCESS_TOKEN_EXPIRATION,
    ): models.RefreshToken {
        kwargs: Dict<any> = {
            "user": user,
            "client_id": client_id,
            "token_type": token_type,
            "access_token_expiration": access_token_expiration,
        }
        if (client_name) {
            kwargs["client_name"] = client_name
        }
        if (client_icon) {
            kwargs["client_icon"] = client_icon
        }

        refresh_token = models.RefreshToken(**kwargs)
        user.refresh_tokens[refresh_token.id] = refresh_token

        this._async_schedule_save()
        return refresh_token
    }

    /**
     * Remove a refresh token.
     */
    async async_remove_refresh_token(
        refresh_token: models.RefreshToken
    ) {
        if (!this._users) {
            await this._async_load()
            assert this._users
        }

        for(const user of this._users.values()) {
            if (user.refresh_tokens.pop(refresh_token.id, null) {
                this._async_schedule_save()
                break
            }
        }
    }

    /**
     * Get refresh token by id.
     */
    async async_get_refresh_token(
        token_id: string
    ): Optional<models.RefreshToken> {
        if (!this._users) {
            await this._async_load()
            assert this._users
        }

        for(const user of this._users.values()) {
            refresh_token = user.refresh_tokens.get(token_id)
            if (refresh_token is !null) {
                return refresh_token
            }
        }

        return null
    }

    /**
     * Get refresh token by token.
     */
    async async_get_refresh_token_by_token(
        token: string
    ): Optional<models.RefreshToken> {
        if (!this._users) {
            await this._async_load()
            assert this._users
        }

        found = null

        for(const user of this._users.values()) {
            for(const refresh_token of user.refresh_tokens.values()) {
                if (hmac.compare_digest(refresh_token.token, token) {
                    found = refresh_token
                }
            }
        }

        return found
    }

    // @callback
    /**
     * Update refresh token last used information.
     */
    async_log_refresh_token_usage(
        refresh_token: models.RefreshToken, remote_ip: Optional<string> = null
    ) {
        refresh_token.last_used_at = utcnow()
        refresh_token.last_used_ip = remote_ip
        this._async_schedule_save()
    }

    /**
     * Load the users.
     */
    async _async_load() {
        async with this._lock:
            if (this._users is !null) {
                return
            }
            await this._async_load_task()
    }

    /**
     * Load the users.
     */
    async _async_load_task() {
        [ent_reg, dev_reg, data] = await asyncio.gather(
            this.hass.helpers.entity_registry.async_get_registry(),
            this.hass.helpers.device_registry.async_get_registry(),
            this._store.async_load(),
        )

        // Make sure that we're not overriding data if 2 loads happened at the
        // same time
        if (this._users is !null) {
            return
        }

        this._perm_lookup = perm_lookup = PermissionLookup(ent_reg, dev_reg)

        if (!data) {
            this._set_defaults()
            return
        }

        users: Dict<models.User> = OrderedDict()
        groups: Dict<models.Group> = OrderedDict()

        // Soft-migrating data as we load. We are going to make sure we have a
        // read only group and an admin group. There are two states that we can
        // migrate from:
        // 1. Data from a recent version which has a single group without policy
        // 2. Data from old version which has no groups
        has_admin_group = false
        has_user_group = false
        has_read_only_group = false
        group_without_policy = null

        // When creating objects we mention each attribute explicitly. This
        // prevents crashing if user rolls back HA version after a new property
        // was added.

        for(const group_dict of data.get("groups", [])) {
            policy: Optional<PolicyType> = null

            if (group_dict["id"] === GROUP_ID_ADMIN) {
                has_admin_group = true

                name = GROUP_NAME_ADMIN
                policy = system_policies.ADMIN_POLICY
                system_generated = true
            }

            else if *(group_dict["id"] === GROUP_ID_USER) {
                has_user_group = true

                name = GROUP_NAME_USER
                policy = system_policies.USER_POLICY
                system_generated = true
            }

            else if *(group_dict["id"] === GROUP_ID_READ_ONLY) {
                has_read_only_group = true

                name = GROUP_NAME_READ_ONLY
                policy = system_policies.READ_ONLY_POLICY
                system_generated = true
            }

            else {
                name = group_dict["name"]
                policy = group_dict.get("policy")
                system_generated = false
            }

            // We don't want groups without a policy that are not system groups
            // This is part of migrating from state 1
            if (!policy) {
                group_without_policy = group_dict["id"]
                continue
            }

            groups[group_dict["id"]] = models.Group(
                id=group_dict["id"],
                name=name,
                policy=policy,
                system_generated=system_generated,
            )
        }

        // If there are no groups, add all existing users to the admin group.
        // This is part of migrating from state 2
        migrate_users_to_admin_group = not groups and !group_without_policy

        // If we find a no_policy_group, we need to migrate all users to the
        // admin group. We only do this if there are no other groups, as is
        // the expected state. If not expected state, not marking people admin.
        // This is part of migrating from state 1
        if (groups and group_without_policy is !null) {
            group_without_policy = null
        }

        // This is part of migrating from state 1 and 2
        if (!has_admin_group) {
            admin_group = _system_admin_group()
            groups[admin_group.id] = admin_group
        }

        // This is part of migrating from state 1 and 2
        if (!has_read_only_group) {
            read_only_group = _system_read_only_group()
            groups[read_only_group.id] = read_only_group
        }

        if (!has_user_group) {
            user_group = _system_user_group()
            groups[user_group.id] = user_group
        }

        for(const user_dict of data["users"]) {
            // Collect the users group.
            user_groups = []
            for(const group_id of user_dict.get("group_ids", [])) {
                // This is part of migrating from state 1
                if (group_id === group_without_policy) {
                    group_id = GROUP_ID_ADMIN
                }
                user_groups.append(groups[group_id])
            }

            // This is part of migrating from state 2
            if (!user_dict["system_generated"] and migrate_users_to_admin_group) {
                user_groups.append(groups[GROUP_ID_ADMIN])
            }

            users[user_dict["id"]] = models.User(
                name=user_dict["name"],
                groups=user_groups,
                id=user_dict["id"],
                is_owner=user_dict["is_owner"],
                is_active=user_dict["is_active"],
                system_generated=user_dict["system_generated"],
                perm_lookup=perm_lookup,
            )
        }

        for(const cred_dict of data["credentials"]) {
            users[cred_dict["user_id"]].credentials.append(
                models.Credentials(
                    id=cred_dict["id"],
                    is_new=false,
                    auth_provider_type=cred_dict["auth_provider_type"],
                    auth_provider_id=cred_dict["auth_provider_id"],
                    data=cred_dict["data"],
                )
            )
        }

        for(const rt_dict of data["refresh_tokens"]) {
            // Filter out the old keys that don't have jwt_key (pre-0.76)
            if ("jwt_key" !in rt_dict) {
                continue
            }

            created_at = parse_datetime(rt_dict["created_at"])
            if (!created_at) {
                getLogger(__name__).error(
                    "Ignoring refresh token %(id)s with invalid created_at "
                    "%(created_at)s for user_id %(user_id)s",
                    rt_dict,
                )
                continue
            }

            token_type = rt_dict.get("token_type")
            if (!token_type) {
                if (!rt_dict["client_id"]) {
                    token_type = models.TOKEN_TYPE_SYSTEM
                }
                else {
                    token_type = models.TOKEN_TYPE_NORMAL
                }
            }

            // old refresh_token don't have last_used_at (pre-0.78)
            last_used_at_str = rt_dict.get("last_used_at")
            if (last_used_at_str) {
                last_used_at = parse_datetime(last_used_at_str)
            }
            else {
                last_used_at = null
            }

            token = models.RefreshToken(
                id=rt_dict["id"],
                user=users[rt_dict["user_id"]],
                client_id=rt_dict["client_id"],
                // use dict.get to keep backward compatibility
                client_name=rt_dict.get("client_name"),
                client_icon=rt_dict.get("client_icon"),
                token_type=token_type,
                created_at=created_at,
                access_token_expiration=timedelta(
                    seconds=rt_dict["access_token_expiration"]
                ),
                token=rt_dict["token"],
                jwt_key=rt_dict["jwt_key"],
                last_used_at=last_used_at,
                last_used_ip=rt_dict.get("last_used_ip"),
            )
            users[rt_dict["user_id"]].refresh_tokens[token.id] = token
        }

        this._groups = groups
        this._users = users
    }

    // @callback
    /**
     * Save users.
     */
    _async_schedule_save() {
        if (!this._users) {
            return
        }

        this._store.async_delay_save(this._data_to_save, 1)
    }

    // @callback
    /**
     * Return the data to store.
     */
    _data_to_save(): Dict {
        assert this._users
        assert this._groups

        users = [
            {
                "id": user.id,
                "group_ids": [group.id for group in user.groups],
                "is_owner": user.is_owner,
                "is_active": user.is_active,
                "name": user.name,
                "system_generated": user.system_generated,
            }
            for user in this._users.values()
        ]

        groups = []
        for(const group of this._groups.values()) {
            g_dict: Dict<any> = {
                "id": group.id,
                // Name not read for sys groups. Kept here for backwards compat
                "name": group.name,
            }

            if (!group.system_generated) {
                g_dict["policy"] = group.policy
            }

            groups.append(g_dict)
        }

        credentials = [
            {
                "id": credential.id,
                "user_id": user.id,
                "auth_provider_type": credential.auth_provider_type,
                "auth_provider_id": credential.auth_provider_id,
                "data": credential.data,
            }
            for user in this._users.values()
            for credential in user.credentials
        ]

        refresh_tokens = [
            {
                "id": refresh_token.id,
                "user_id": user.id,
                "client_id": refresh_token.client_id,
                "client_name": refresh_token.client_name,
                "client_icon": refresh_token.client_icon,
                "token_type": refresh_token.token_type,
                "created_at": refresh_token.created_at.isoformat(),
                "access_token_expiration": refresh_token.access_token_expiration.total_seconds(),
                "token": refresh_token.token,
                "jwt_key": refresh_token.jwt_key,
                "last_used_at": refresh_token.last_used_at.isoformat()
                if (refresh_token.last_used_at
                else null,
                "last_used_ip") {
                }
            }
            for user in this._users.values()
            for refresh_token in user.refresh_tokens.values()
        ]

        return {
            "users": users,
            "groups": groups,
            "credentials": credentials,
            "refresh_tokens": refresh_tokens,
        }
    }

    /**
     * Set default values for auth store.
     */
    _set_defaults() {
        this._users = OrderedDict()

        groups: Dict<models.Group> = OrderedDict()
        admin_group = _system_admin_group()
        groups[admin_group.id] = admin_group
        user_group = _system_user_group()
        groups[user_group.id] = user_group
        read_only_group = _system_read_only_group()
        groups[read_only_group.id] = read_only_group
        this._groups = groups
    }
}

/**
 * Create system admin group.
 */
export function _system_admin_group(): models.Group {
    return models.Group(
        name=GROUP_NAME_ADMIN,
        id=GROUP_ID_ADMIN,
        policy=system_policies.ADMIN_POLICY,
        system_generated=true,
    )
}

/**
 * Create system user group.
 */
export function _system_user_group(): models.Group {
    return models.Group(
        name=GROUP_NAME_USER,
        id=GROUP_ID_USER,
        policy=system_policies.USER_POLICY,
        system_generated=true,
    )
}

/**
 * Create read only group.
 */
export function _system_read_only_group(): models.Group {
    return models.Group(
        name=GROUP_NAME_READ_ONLY,
        id=GROUP_ID_READ_ONLY,
        policy=system_policies.READ_ONLY_POLICY,
        system_generated=true,
    )
}
