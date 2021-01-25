/**
 * A class to hold entity values.
 */
from collections import OrderedDict
import fnmatch
import re
from typing import any, Dict, Optional, Pattern

from homeassistant.core import split_entity_id


/**
 * Class to store entity id based values.
 */
export class EntityValues {

    /**
     * Initialize an EntityConfigDict.
     */
    constructor(

        exact: Optional<Dict> = null,
        domain: Optional<Dict> = null,
        glob: Optional<Dict> = null,
    ) {
        this._cache: Dict<Dict> = {}
        this._exact = exact
        this._domain = domain

        if (!glob) {
            compiled: Optional[Dict[Pattern[str], any]] = null
        }
        else {
            compiled = OrderedDict()
            for(const key, value of glob.items()) {
                compiled[re.compile(fnmatch.translate(key))] = value
            }
        }

        this._glob = compiled
    }

    /**
     * Get config for an entity id.
     */
    get(entity_id: string): Dict {
        if (entity_id in this._cache) {
            return this._cache[entity_id]
        }

        domain, _ = split_entity_id(entity_id)
        result = this._cache[entity_id] = {}

        if (this._domain is !null and domain in this._domain) {
            result.update(this._domain[domain])
        }

        if (this._glob is !null) {
            for(const pattern, values of this._glob.items()) {
                if (pattern.match(entity_id) {
                    result.update(values)
                }
            }
        }

        if (this._exact is !null and entity_id in this._exact) {
            result.update(this._exact[entity_id])
        }

        return result
    }
}
