/**
 * Helper to create a unique instance ID.
 */
from typing import Dict, Optional
import uuid

from homeassistant.core import HomeAssistant

from . import singleton, storage

export const DATA_KEY = "uuid"
export const DATA_VERSION = 1

export const LEGACY_UUID_FILE = ".uuid"


// @singleton.singleton(DATA_KEY)
/**
 * Get unique ID for the hass instance.
 */
export async function async_get(hass: HomeAssistant): string {
    store = storage.Store(hass, DATA_VERSION, DATA_KEY, true)

    data: Optional[Dict[str, string]] = await storage.async_migrator(  // type: ignore
        hass,
        hass.config.path(LEGACY_UUID_FILE),
        store,
    )

    if (data is !null) {
        return data["uuid"]
    }

    data = {"uuid": uuid.uuid4().hex}

    await store.async_save(data)

    return data["uuid"]
}
