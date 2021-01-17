/**
 * Constants for the auth module.
 */
from datetime import timedelta

export const ACCESS_TOKEN_EXPIRATION = timedelta(minutes=30)
export const MFA_SESSION_EXPIRATION = timedelta(minutes=5)

export const GROUP_ID_ADMIN = "system-admin"
export const GROUP_ID_USER = "system-users"
export const GROUP_ID_READ_ONLY = "system-read-only"
