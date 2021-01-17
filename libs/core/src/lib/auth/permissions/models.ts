/**
 * Models for permissions.
 */
from typing import TYPE_CHECKING

import attr

if (TYPE_CHECKING) {
    // pylint: disable=unused-import
    from homeassistant.helpers import (  // noqa: F401
        device_registry as dev_reg,
        entity_registry as ent_reg,
    )
}


// @attr.s(slots=true)
/**
 * Class to hold data for permission lookups.
 */
export class PermissionLookup {

    entity_registry: "ent_reg.EntityRegistry" = attr.ib()
    device_registry: "dev_reg.DeviceRegistry" = attr.ib()
}