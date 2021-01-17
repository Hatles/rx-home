/**
 * ruamel.yaml utility functions.
 */
from collections import OrderedDict
import logging
import os
from os import O_CREAT, O_TRUNC, O_WRONLY, stat_result
from typing import Dict, List, Optional, Union

import ruamel.yaml
from ruamel.yaml import YAML  // type: ignore
from ruamel.yaml.compat import strO
from ruamel.yaml.constructor import SafeConstructor
from ruamel.yaml.error import YAMLError

from homeassistant.exceptions import HomeAssistantError
from homeassistant.util.yaml import secret_yaml

const _LOGGER = logging.getLogger(__name__)

export const JSON_TYPE = Union[List, Dict, string]  // pylint: disable=invalid-name


/**
 * Extended SafeConstructor.
 */
export class ExtSafeConstructor extends SafeConstructor {

    name: Optional<string> = null
}

/**
 * Unsupported YAML.
 */
export class UnsupportedYamlError extends HomeAssistantError {
}

/**
 * Error writing the data.
 */
export class WriteError extends HomeAssistantError {
}

/**
 * Load another YAML file and embeds it using the !include tag.

    Example:
        device_tracker: !include device_tracker.yaml


 */
export function _include_yaml(
    constructor: ExtSafeConstructor, node: ruamel.yaml.nodes.Node
): JSON_TYPE {
    if (!constructor.name) {
        throw new HomeAssistantError(
            "YAML include error: filename not set for %s" % node.value
        )
    }
    fname = os.path.join(os.path.dirname(constructor.name), node.value)
    return load_yaml(fname, false)
}

def _yaml_unsupported(
    constructor: ExtSafeConstructor, node: ruamel.yaml.nodes.Node
) -> null:
    throw new UnsupportedYamlError(
       `Unsupported YAML, you can not use ${node.tag} in `
       `${os.path.basename(constructor.name or '(null)')}`
    )


/**
 * Create yaml string from object.
 */
export function object_to_yaml(data: JSON_TYPE): string {
    yaml = YAML(typ="rt")
    yaml.indent(sequence=4, offset=2)
    stram = strO()
    try {
        yaml.dump(data, stram)
        result: string = stram.getvalue()
        return result
    }
    catch (e) {
        if (e instanceof YAMLError as exc) {
        _LOGGER.error("YAML error: %s", exc)
        throw new HomeAssistantError(exc) from exc
        }
        else {
            throw e;
        }
    }

}

/**
 * Create object from yaml string.
 */
export function yaml_to_object(data: string): JSON_TYPE {
    yaml = YAML(typ="rt")
    try {
        result: Union<List, Dict, string> = yaml.load(data)
        return result
    }
    catch (e) {
        if (e instanceof YAMLError as exc) {
        _LOGGER.error("YAML error: %s", exc)
        throw new HomeAssistantError(exc) from exc
        }
        else {
            throw e;
        }
    }

}

/**
 * Load a YAML file.
 */
export function load_yaml(fname: string, round_trip: boolean = false): JSON_TYPE {
    if (round_trip) {
        yaml = YAML(typ="rt")
        yaml.preserve_quotes = true
    }
    else {
        if (!ExtSafeConstructor.name) {
            ExtSafeConstructor.name = fname
        }
        yaml = YAML(typ="safe")
        yaml.Constructor = ExtSafeConstructor
    }

    try {
        with open(fname, encoding="utf-8") as conf_file:
            // If configuration file is empty YAML returns null
            // We convert that to an empty dict
            return yaml.load(conf_file) or OrderedDict()
    }
    catch (e) {
        if (e instanceof YAMLError as exc) {
        _LOGGER.error("YAML error in %s: %s", fname, exc)
        throw new HomeAssistantError(exc) from exc
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof UnicodeDecodeError as exc) {
        _LOGGER.error("Unable to read file %s: %s", fname, exc)
        throw new HomeAssistantError(exc) from exc
        }
        else {
            throw e;
        }
    }

}

/**
 * Save a YAML file.
 */
export function save_yaml(fname: string, data: JSON_TYPE) {
    yaml = YAML(typ="rt")
    yaml.indent(sequence=4, offset=2)
    tmp_fname =`${fname}__TEMP__`
    try {
        try {
            file_stat = os.stat(fname)
        }
        catch (e) {
            if (e instanceof OSError) {
            file_stat = stat_result((0o644, -1, -1, -1, -1, -1, -1, -1, -1, -1))
            }
            else {
                throw e;
            }
        }

        with open(
            os.open(tmp_fname, O_WRONLY | O_CREAT | O_TRUNC, file_stat.st_mode),
            "w",
            encoding="utf-8",
        ) as temp_file:
            yaml.dump(data, temp_file)
        os.replace(tmp_fname, fname)
        if (hasattr(os, "chown") and file_stat.st_ctime > -1) {
            try {
                os.chown(fname, file_stat.st_uid, file_stat.st_gid)
            }
            catch (e) {
                if (e instanceof OSError) {
                pass
                }
                else {
                    throw e;
                }
            }

        }
    }
    catch (e) {
        if (e instanceof YAMLError as exc) {
        _LOGGER.error(str(exc))
        throw new HomeAssistantError(exc) from exc
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof OSError as exc) {
        _LOGGER.exception("Saving YAML file %s failed: %s", fname, exc)
        throw new WriteError(exc) from exc
        }
        else {
            throw e;
        }
    }

    finally {
        if (os.path.exists(tmp_fname) {
            try {
                os.remove(tmp_fname)
            }
            catch (e) {
                if (e instanceof OSError as exc) {
                // If we are cleaning up then something else went wrong, so
                // we should suppress likely follow-on errors in the cleanup
                _LOGGER.error("YAML replacement cleanup failed: %s", exc)
                }
                else {
                    throw e;
                }
            }

        }
    }
}

ExtSafeConstructor.add_constructor("!secret", secret_yaml)
ExtSafeConstructor.add_constructor("!include", _include_yaml)
ExtSafeConstructor.add_constructor(null, _yaml_unsupported)
