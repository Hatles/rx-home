/**
 * Translation string lookup helpers.
 */
import asyncio
from collections import ChainMap
import logging
from typing import any, Dict, List, Optional, Set

from homeassistant.core import callback
from homeassistant.loader import (
    MAX_LOAD_CONCURRENTLY,
    Integration,
    async_get_config_flows,
    async_get_integration,
    bind_hass,
)
from homeassistant.util.async_ import gather_with_concurrency
from homeassistant.util.json import load_json

from .typing import HomeAssistantType

const _LOGGER = logging.getLogger(__name__)

export const TRANSLATION_LOAD_LOCK = "translation_load_lock"
export const TRANSLATION_FLATTEN_CACHE = "translation_flatten_cache"
export const LOCALE_EN = "en"


/**
 * Return a flattened representation of dict data.
 */
export function recursive_flatten(prefix: any, data: Dict): Dict<any> {
    output = {}
    for(const key, value of data.items()) {
        if (value instanceof dict) {
            output.update(recursive_flatten`${prefix}${key}.`, value))
        }
        else {
            output`${prefix}${key}`] = value
        }
    }
    return output
}

// @callback
/**
 * Return the translation json file location for a component.

    For component:
     - components/hue/translations/nl.json

    For platform:
     - components/hue/translations/light.nl.json

    If component is just a single file, will return null.

 */
export function component_translation_path(
    component: string, language: string, integration: Integration
): Optional<string> {
    parts = component.split(".")
    domain = parts[-1]
    is_platform = parts.length === 2

    // If it's a component that is just one file, we don't support translations
    // Example custom_components/my_component.py
    if (integration.file_path.name !== domain) {
        return null
    }

    if (is_platform) {
        filename =`${parts[0]}.${language}.json`
    }
    else {
        filename =`${language}.json`
    }

    translation_path = integration.file_path / "translations"

    return string(translation_path / filename)
}

/**
 * Load and parse translation.json files.
 */
export function load_translations_files(
    translation_files: Dict<string>
): Dict[str, Dict[str, any]] {
    loaded = {}
    for(const component, translation_file of translation_files.items()) {
        loaded_json = load_json(translation_file)

        if (!loaded_json instanceof dict) {
            _LOGGER.warning(
                "Translation file is unexpected type %s. Expected dict for %s",
                type(loaded_json),
                translation_file,
            )
            continue
        }

        loaded[component] = loaded_json
    }

    return loaded
}

/**
 * Build and merge the resources response for the given components and platforms.
 */
export function _merge_resources(
    translation_strings: Dict[str, Dict[str, any]],
    components: Set<string>,
    category: string,
): Dict[str, Dict[str, any]] {
    // Build response
    resources: Dict[str, Dict[str, any]] = {}
    for(const component of components) {
        if ("." !in component) {
            domain = component
        }
        else {
            domain = component.split(".", 1)[0]
        }

        domain_resources = resources.setdefault(domain, {})

        // Integrations are able to provide translations for their entities under other
        // integrations if they don't have an existing device class. This is done by
        // using a custom device class prefixed with their domain and two underscores.
        // These files are in platform specific files in the integration folder with
        // names like `strings.sensor.json`.
        // We are going to merge the translations for the custom device classes int
        // the translations of sensor.

        new_value = translation_strings[component].get(category)

        if (!new_value) {
            continue
        }

        if (new_value instanceof dict) {
            domain_resources.update(new_value)
        }
        else {
            _LOGGER.error(
                "An integration providing translations for %s provided invalid data: %s",
                domain,
                new_value,
            )
        }
    }

    return resources
}

/**
 * Build the resources response for the given components.
 */
export function _build_resources(
    translation_strings: Dict[str, Dict[str, any]],
    components: Set<string>,
    category: string,
): Dict[str, Dict[str, any]] {
    // Build response
    return {
        component: translation_strings[component][category]
        for component in components
        if (category in translation_strings[component]
        and translation_strings[component][category] is !null
    }
}

/**
 * Load translations.
 */
export async function async_get_component_strings(
    hass) {
        }
): Dict<any> {
    domains = list({loaded.split(".")[-1] for loaded in components})
    integrations = dict(
        zip(
            domains,
            await gather_with_concurrency(
                MAX_LOAD_CONCURRENTLY,
                *[async_get_integration(hass, domain) for domain in domains],
            ),
        )
    )

    translations: Dict<any> = {}

    // Determine paths of missing components/platforms
    files_to_load = {}
    for(const loaded of components) {
        parts = loaded.split(".")
        domain = parts[-1]
        integration = integrations[domain]

        path = component_translation_path(loaded, language, integration)
        // No translation available
        if (!path) {
            translations[loaded] = {}
        }
        else {
            files_to_load[loaded] = path
        }
    }

    if (!files_to_load) {
        return translations
    }

    // Load files
    load_translations_job = hass.async_add_executor_job(
        load_translations_files, files_to_load
    )
    assert load_translations_job
    loaded_translations = await load_translations_job

    // Translations that miss "title" will get integration put in.
    for(const loaded, loaded_translation of loaded_translations.items()) {
        if ("." in loaded) {
            continue
        }

        if ("title" !in loaded_translation) {
            loaded_translation["title"] = integrations[loaded].name
        }
    }

    translations.update(loaded_translations)

    return translations
}

/**
 * Cache for flattened translations.
 */
export class _TranslationCache {

    /**
     * Initialize the cache.
     */
    constructor(hass: HomeAssistantType) {
        this.hass = hass
        this.loaded: Dict[str, Set[str]] = {}
        this.cache: Dict[str, Dict[str, Dict[str, any]]] = {}
    }

    /**
     * Load resources int the cache.
     */
    async async_fetch(

        language: string,
        category: string,
        components: Set,
    ): Dict[str, Dict[str, any]][] {
        components_to_load = components - this.loaded.setdefault(language, set())

        if (components_to_load) {
            await this._async_load(language, components_to_load)
        }

        cached = this.cache.get(language, {})

        return [cached.get(component, {}).get(category, {}) for component in components]
    }

    /**
     * Populate the cache for a given set of components.
     */
    async _async_load(language: string, components: Set) {
        _LOGGER.debug(
            "Cache miss for %s: %s",
            language,
            ", ".join(components),
        )
        // Fetch the English resources, as a fallback for missing keys
        languages = [LOCALE_EN] if language === LOCALE_EN else [LOCALE_EN, language]
        for translation_strings in await asyncio.gather(
            *[
                async_get_component_strings(this.hass, lang, components)
                for lang in languages
            ]
        ):
            this._build_category_cache(language, components, translation_strings)

        this.loaded[language].update(components)
    }

    // @callback
    /**
     * Extract resources int the cache.
     */
    _build_category_cache(

        language: string,
        components: Set,
        translation_strings: Dict[str, Dict[str, any]],
    ) {
        cached = this.cache.setdefault(language, {})
        categories: Set<string> = set()
        for(const resource of translation_strings.values()) {
            categories.update(resource)
        }

        for(const category of categories) {
            resource_func = (
                _merge_resources if category === "state" else _build_resources
            )
            new_resources = resource_func(translation_strings, components, category)

            for(const component, resource of new_resources.items()) {
                category_cache: Dict<any> = cached.setdefault(
                    component, {}
                ).setdefault(category, {})

                if (resource instanceof dict) {
                    category_cache.update(
                        recursive_flatten(
                           `component.${component}.${category}.`,
                            resource,
                        )
                    )
                }
                else {
                    category_cache`component.${component}.${category}`] = resource
                }
            }
        }
    }
}

// @bind_hass
/**
 * Return all backend translations.

    If integration specified, load it for that one.
    Otherwise default to loaded intrations combined with config flow
    integrations if config_flow is true.

 */
export async function async_get_translations(
    hass: HomeAssistantType,
    language: string,
    category: string,
    integration: Optional<string> = null,
    config_flow: Optional<bool> = null,
): Dict<any> {
    lock = hass.data.setdefault(TRANSLATION_LOAD_LOCK, asyncio.Lock())

    if (integration is !null) {
        components = {integration}
    }
    else if *(config_flow) {
        components = (await async_get_config_flows(hass)) - hass.config.components
    }
    else if *(category === "state") {
        components = set(hass.config.components)
    }
    else {
        // Only 'state' supports merging, so remove platforms from selection
        components = {
            component for component in hass.config.components if "."        }
    }

    async with lock:
        cache = hass.data.setdefault(TRANSLATION_FLATTEN_CACHE, _TranslationCache(hass))
        cached = await cache.async_fetch(language, category, components)

    return dict(ChainMap(*cached))
}
