/**
 * Typing Helpers for Home Assistant.
 */
from enum import Enum
from typing import any, Dict, Mapping, Optional, Tuple, Union

import homeassistant.core

export const GPSType = Tuple[float, number]
export const ConfigType = Dict[str, any]
export const ContextType = homeassistant.Context
export const DiscoveryInfoType = Dict[str, any]
export const EventType = homeassistant.Event
export const HomeAssistantType = homeassistant.HomeAssistant
export const ServiceCallType = homeassistant.ServiceCall
export const ServiceDataType = Dict[str, any]
export const StateType = Union[null, string, number, number]
export const TemplateVarsType = Optional[Mapping[str, any]]

// Custom type for recorder Queries
export const QueryType = any


/**
 * Singleton type for use with not set sentinel values.
 */
export class UndefinedType extends Enum {

    _singleton = 0
}

export const UNDEFINED = UndefinedType._singleton  // pylint: disable=protected-access
