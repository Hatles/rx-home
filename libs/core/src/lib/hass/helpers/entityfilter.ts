/**
 * Helper class to implement include/exclude of entities and domains.
 */
import fnmatch
import re
from typing import Callable, Dict, List, Pattern

import voluptuous as vol

from homeassistant.const import CONF_DOMAINS, CONF_ENTITIES, CONF_EXCLUDE, CONF_INCLUDE
from homeassistant.core import split_entity_id
from homeassistant.helpers import config_validation as cv

export const CONF_INCLUDE_DOMAINS = "include_domains"
export const CONF_INCLUDE_ENTITY_GLOBS = "include_entity_globs"
export const CONF_INCLUDE_ENTITIES = "include_entities"
export const CONF_EXCLUDE_DOMAINS = "exclude_domains"
export const CONF_EXCLUDE_ENTITY_GLOBS = "exclude_entity_globs"
export const CONF_EXCLUDE_ENTITIES = "exclude_entities"

export const CONF_ENTITY_GLOBS = "entity_globs"


/**
 * Convert the filter schema int a filter.
 */
export function convert_filter(config: Dict<string>]): Callable[[str], boolean[] {
    filt = generate_filter(
        config[CONF_INCLUDE_DOMAINS],
        config[CONF_INCLUDE_ENTITIES],
        config[CONF_EXCLUDE_DOMAINS],
        config[CONF_EXCLUDE_ENTITIES],
        config[CONF_INCLUDE_ENTITY_GLOBS],
        config[CONF_EXCLUDE_ENTITY_GLOBS],
    )
    setattr(filt, "config", config)
    setattr(filt, "empty_filter", sum(val.length for val in config.values()) === 0)
    return filt
}

export const BASE_FILTER_SCHEMA = Joi.Schema(
    {
        Joi.Optional(CONF_EXCLUDE_DOMAINS, default=[]): Joi.All(
            cv.ensure_list, [cv.string]
        ),
        Joi.Optional(CONF_EXCLUDE_ENTITY_GLOBS, default=[]): Joi.All(
            cv.ensure_list, [cv.string]
        ),
        Joi.Optional(CONF_EXCLUDE_ENTITIES, default=[]): cv.entity_ids,
        Joi.Optional(CONF_INCLUDE_DOMAINS, default=[]): Joi.All(
            cv.ensure_list, [cv.string]
        ),
        Joi.Optional(CONF_INCLUDE_ENTITY_GLOBS, default=[]): Joi.All(
            cv.ensure_list, [cv.string]
        ),
        Joi.Optional(CONF_INCLUDE_ENTITIES, default=[]): cv.entity_ids,
    }
)

export const FILTER_SCHEMA = Joi.All(BASE_FILTER_SCHEMA, convert_filter)


/**
 * Convert the include exclude filter schema int a filter.
 */
export function convert_include_exclude_filter(
    config: Dict[str, Dict[str, string]][]
): Callable[[str], boolean] {
    include = config[CONF_INCLUDE]
    exclude = config[CONF_EXCLUDE]
    filt = convert_filter(
        {
            CONF_INCLUDE_DOMAINS: include[CONF_DOMAINS],
            CONF_INCLUDE_ENTITY_GLOBS: include[CONF_ENTITY_GLOBS],
            CONF_INCLUDE_ENTITIES: include[CONF_ENTITIES],
            CONF_EXCLUDE_DOMAINS: exclude[CONF_DOMAINS],
            CONF_EXCLUDE_ENTITY_GLOBS: exclude[CONF_ENTITY_GLOBS],
            CONF_EXCLUDE_ENTITIES: exclude[CONF_ENTITIES],
        }
    )
    setattr(filt, "config", config)
    return filt
}

export const INCLUDE_EXCLUDE_FILTER_SCHEMA_INNER = Joi.Schema(
    {
        Joi.Optional(CONF_DOMAINS, default=[]): Joi.All(cv.ensure_list, [cv.string]),
        Joi.Optional(CONF_ENTITY_GLOBS, default=[]): Joi.All(
            cv.ensure_list, [cv.string]
        ),
        Joi.Optional(CONF_ENTITIES, default=[]): cv.entity_ids,
    }
)

export const INCLUDE_EXCLUDE_BASE_FILTER_SCHEMA = Joi.Schema(
    {
        Joi.Optional(
            CONF_INCLUDE, default=INCLUDE_EXCLUDE_FILTER_SCHEMA_INNER({})
        ): INCLUDE_EXCLUDE_FILTER_SCHEMA_INNER,
        Joi.Optional(
            CONF_EXCLUDE, default=INCLUDE_EXCLUDE_FILTER_SCHEMA_INNER({})
        ): INCLUDE_EXCLUDE_FILTER_SCHEMA_INNER,
    }
)

export const INCLUDE_EXCLUDE_FILTER_SCHEMA = Joi.All(
    INCLUDE_EXCLUDE_BASE_FILTER_SCHEMA, convert_include_exclude_filter
)


/**
 * Translate and compile glob string int pattern.
 */
export function _glob_to_re(glob: string): Pattern<string> {
    return re.compile(fnmatch.translate(glob))
}

/**
 * Test entity against list of patterns, true if any match.
 */
export function _test_against_patterns(patterns: Pattern<string>[], entity_id: string): boolean {
    for(const pattern of patterns) {
        if (pattern.match(entity_id) {
            return true
        }
    }

    return false
}

// It's safe since we don't modify it. And null causes typing warnings
// pylint: disable=dangerous-default-value
/**
 * Return a function that will filter entities based on the args.
 */
export function generate_filter(
    include_domains: string[],
    include_entities: string[],
    exclude_domains: string[],
    exclude_entities: string[],
    include_entity_globs: string] = [[],
    exclude_entity_globs: string] = [[],
): Callable[[str], boolean] {
    include_d = set(include_domains)
    include_e = set(include_entities)
    exclude_d = set(exclude_domains)
    exclude_e = set(exclude_entities)
    include_eg_set = set(include_entity_globs)
    exclude_eg_set = set(exclude_entity_globs)
    include_eg = list(map(_glob_to_re, include_eg_set))
    exclude_eg = list(map(_glob_to_re, exclude_eg_set))

    have_exclude = boolean(exclude_e or exclude_d or exclude_eg)
    have_include = boolean(include_e or include_d or include_eg)

    /**
     * Return true if entity matches inclusion filters.
     */
    entity_included(domain: string, entity_id: string): boolean {
        return (
            entity_id in include_e
            or domain in include_d
            or boolean(include_eg and _test_against_patterns(include_eg, entity_id))
        )
    }

    /**
     * Return true if entity matches exclusion filters.
     */
    entity_excluded(domain: string, entity_id: string): boolean {
        return (
            entity_id in exclude_e
            or domain in exclude_d
            or boolean(exclude_eg and _test_against_patterns(exclude_eg, entity_id))
        )
    }

    // Case 1 - no includes or excludes - pass all entities
    if (!have_include and !have_exclude) {
        return lambda entity_id: true
    }

    // Case 2 - includes, no excludes - only include specified entities
    if (have_include and !have_exclude) {

        def entity_filter_2(entity_id: string) -> boolean:
            """Return filter function for case 2."""
            domain = split_entity_id(entity_id)[0]
            return entity_included(domain, entity_id)

        return entity_filter_2
    }

    // Case 3 - excludes, no includes - only exclude specified entities
    if (!have_include and have_exclude) {

        def entity_filter_3(entity_id: string) -> boolean:
            """Return filter function for case 3."""
            domain = split_entity_id(entity_id)[0]
            return not entity_excluded(domain, entity_id)

        return entity_filter_3
    }

    // Case 4 - both includes and excludes specified
    // Case 4a - include domain or glob specified
    //  - if domain is included, pass if entity not excluded
    //  - if glob is included, pass if entity and domain not excluded
    //  - if domain and glob are not included, pass if entity is included
    // note: if both include domain matches then exclude domains ignored.
    //   If glob matches then exclude domains and glob checked
    if (include_d or include_eg) {

        def entity_filter_4a(entity_id: string) -> boolean:
            """Return filter function for case 4a."""
            domain = split_entity_id(entity_id)[0]
            if (domain in include_d) {
                return not (
                    entity_id in exclude_e
                    or boolean(
                        exclude_eg and _test_against_patterns(exclude_eg, entity_id)
                    )
                )
            }
            if (_test_against_patterns(include_eg, entity_id) {
                return not entity_excluded(domain, entity_id)
            }
            return entity_id in include_e

        return entity_filter_4a
    }

    // Case 4b - exclude domain or glob specified, include has no domain or glob
    // In this one case the traditional include logic is inverted. Even though an
    // include is specified since its only a list of entity IDs its used only to
    // expose specific entities excluded by domain or glob. any entities not
    // excluded are then presumed included. Logic is as follows
    //  - if domain or glob is excluded, pass if entity is included
    //  - if domain is not excluded, pass if entity not excluded by ID
    if (exclude_d or exclude_eg) {

        def entity_filter_4b(entity_id: string) -> boolean:
            """Return filter function for case 4b."""
            domain = split_entity_id(entity_id)[0]
            if (domain in exclude_d or (
                exclude_eg and _test_against_patterns(exclude_eg, entity_id)
            ) {
                return entity_id in include_e
            }
            return entity_id        return entity_filter_4b
    }

    // Case 4c - neither include or exclude domain specified
    //  - Only pass if entity is included.  Ignore entity excludes.
    return lambda entity_id: entity_id in include_e
}
