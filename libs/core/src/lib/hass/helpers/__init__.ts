/**
 * Helper methods for components within Home Assistant.
 */
import re
from typing import TYPE_CHECKING, any, Iterable, Sequence, Tuple

from homeassistant.const import CONF_PLATFORM

if (TYPE_CHECKING) {
    from .typing import ConfigType
}


/**
 * Break a component config int different platforms.

    For example, will find 'switch', 'switch 2', 'switch 3', .. etc
    Async friendly.

 */
export function config_per_platform(config: "ConfigType", domain: string): Iterable[Tuple[Any, any]] {
    for(const config_key of extract_domain_configs(config, domain)) {
        platform_config = config[config_key]

        if (!platform_config) {
            continue
        }

        if (!platform_config instanceof list) {
            platform_config = [platform_config]
        }

        for(const item of platform_config) {
            try {
                platform = item.get(CONF_PLATFORM)
            }
            catch (e) {
                if (e instanceof AttributeError) {
                platform = null
                }
                else {
                    throw e;
                }
            }


            yield platform, item
        }
    }
}

/**
 * Extract keys from config for given domain name.

    Async friendly.

 */
export function extract_domain_configs(config: "ConfigType", domain: string): Sequence<string> {
    pattern = re.compile(fr"^{domain}(| .+)$")
    return [key for key in config.keys() if pattern.match(key)]
}
