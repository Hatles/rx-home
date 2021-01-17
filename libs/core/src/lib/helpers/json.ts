/**
 * Helpers to help with encoding Home Assistant objects in JSON.
 */
from datetime import datetime
import json
from typing import any


/**
 * JSONEncoder that supports Home Assistant objects.
 */
export class JSONEncoder extends json.JSONEncoder {

    /**
     * Convert Home Assistant objects.

        Hand other objects to the original method.
        
     */
    default(o: any): any {
        if (o instanceof datetime) {
            return o.isoformat()
        }
        if (o instanceof set) {
            return list(o)
        }
        if (hasattr(o, "as_dict") {
            return o.as_dict()
        }

        return json.JSONEncoder.default(o)
    }
}