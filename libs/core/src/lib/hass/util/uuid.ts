/**
 * Helpers to generate uuids.
 */

/**
 * Generate a random UUID hex.

    This uuid should not be used for cryptographically secure
    operations.

 */
export function random_uuid_hex(): string {
    return (crypto.getRandomValues(new Uint8Array(1))[0] % 16).toString(16)
}
