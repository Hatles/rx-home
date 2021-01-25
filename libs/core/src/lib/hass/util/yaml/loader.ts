/**
 * Custom loader.
 */
from collections import OrderedDict
import fnmatch
import logging
import os
import sys
from typing import Dict, Iterator, List, TextIO, TypeVar, Union, overload

import yaml

from homeassistant.exceptions import HomeAssistantError

from .const import _SECRET_NAMESPACE, SECRET_YAML
from .objects import Input, NodeListClass, NodeStrClass

try {
    import keyring
}
catch (e) {
    if (e instanceof ImportError) {
    keyring = null
    }
    else {
        throw e;
    }
}


try {
    import credstash
}
catch (e) {
    if (e instanceof ImportError) {
    credstash = null
    }
    else {
        throw e;
    }
}



// mypy: allow-untyped-calls, no-warn-return-any

export const JSON_TYPE = Union[List, Dict, string]  // pylint: disable=invalid-name
export const DICT_T = TypeVar("DICT_T", bound=Dict)  // pylint: disable=invalid-name

const _LOGGER = logging.getLogger(__name__)
export const __SECRET_CACHE: Dict[str, JSON_TYPE]  = {}

export const CREDSTASH_WARN = false
export const KEYRING_WARN = false


/**
 * Clear the secret cache.

    Async friendly.

 */
export function clear_secret_cache() {
    __SECRET_CACHE.clear()
}

/**
 * Loader class that keeps track of line int.
 */
export class SafeLineLoader extends yaml.SafeLoader {

    /**
     * Annotate a node with the first line it was seen.
     */
    compose_node(parent: yaml.nodes.Node, index: number): yaml.nodes.Node {
        last_line: number = this.line
        node: yaml.nodes.Node = super().compose_node(parent, index)
        node.__line__ = last_line + 1  // type: ignore
        return node
    }
}

/**
 * Load a YAML file.
 */
export function load_yaml(fname: string): JSON_TYPE {
    try {
        with open(fname, encoding="utf-8") as conf_file:
            return parse_yaml(conf_file)
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
 * Load a YAML file.
 */
export function parse_yaml(content: Union<string, TextIO>): JSON_TYPE {
    try {
        // If configuration file is empty YAML returns null
        // We convert that to an empty dict
        return yaml.load(content, Loader=SafeLineLoader) or OrderedDict()
    }
    catch (e) {
        if (e instanceof yaml.YAMLError as exc) {
        _LOGGER.error(str(exc))
        throw new HomeAssistantError(exc) from exc
        }
        else {
            throw e;
        }
    }

}

// @overload
def _add_reference(
    obj: Union<list, NodeListClass>, loader: yaml.SafeLoader, node: yaml.nodes.Node
) -> NodeListClass:
    ...


// @overload
def _add_reference(
    obj: Union<string, NodeStrClass>, loader: yaml.SafeLoader, node: yaml.nodes.Node
) -> NodeStrClass:
    ...


// @overload
def _add_reference(
    obj: DICT_T, loader: yaml.SafeLoader, node: yaml.nodes.Node
) -> DICT_T:
    ...


def _add_reference(obj, loader: SafeLineLoader, node: yaml.nodes.Node):  // type: ignore
    """Add file reference information to an object."""
    if (obj instanceof list) {
        obj = NodeListClass(obj)
    }
    if (obj instanceof string) {
        obj = NodeStrClass(obj)
    }
    setattr(obj, "__config_file__", loader.name)
    setattr(obj, "__line__", node.start_mark.line)
    return obj


/**
 * Load another YAML file and embeds it using the !include tag.

    Example:
        device_tracker: !include device_tracker.yaml


 */
export function _include_yaml(loader: SafeLineLoader, node: yaml.nodes.Node): JSON_TYPE {
    fname = os.path.join(os.path.dirname(loader.name), node.value)
    try {
        return _add_reference(load_yaml(fname), loader, node)
    }
    catch (e) {
        if (e instanceof FileNotFoundError as exc) {
        throw new HomeAssistantError(
           `${node.start_mark}: Unable to read file ${fname}.`
        ) from exc
        }
        else {
            throw e;
        }
    }

}

/**
 * Decide if a file is valid.
 */
export function _is_file_valid(name: string): boolean {
    return not name.startswith(".")
}

/**
 * Recursively load files in a directory.
 */
export function _find_files(directory: string, pattern: string): Iterator<string> {
    for(const root, dirs, files of os.walk(directory, topdown=true)) {
        dirs[:] = [d for d in dirs if _is_file_valid(d)]
        for(const basename of sorted(files)) {
            if (_is_file_valid(basename) and fnmatch.fnmatch(basename, pattern) {
                filename = os.path.join(root, basename)
                yield filename
            }
        }
    }
}

/**
 * Load multiple files from directory as a dictionary.
 */
export function _include_dir_named_yaml(
    loader: SafeLineLoader, node: yaml.nodes.Node
): OrderedDict {
    mapping: OrderedDict = OrderedDict()
    loc = os.path.join(os.path.dirname(loader.name), node.value)
    for(const fname of _find_files(loc, "*.yaml")) {
        filename = os.path.splitext(os.path.basename(fname))[0]
        if (os.path.basename(fname) === SECRET_YAML) {
            continue
        }
        mapping[filename] = load_yaml(fname)
    }
    return _add_reference(mapping, loader, node)
}

/**
 * Load multiple files from directory as a merged dictionary.
 */
export function _include_dir_merge_named_yaml(
    loader: SafeLineLoader, node: yaml.nodes.Node
): OrderedDict {
    mapping: OrderedDict = OrderedDict()
    loc = os.path.join(os.path.dirname(loader.name), node.value)
    for(const fname of _find_files(loc, "*.yaml")) {
        if (os.path.basename(fname) === SECRET_YAML) {
            continue
        }
        loaded_yaml = load_yaml(fname)
        if (loaded_yaml instanceof dict) {
            mapping.update(loaded_yaml)
        }
    }
    return _add_reference(mapping, loader, node)
}

/**
 * Load multiple files from directory as a list.
 */
export function _include_dir_list_yaml(
    loader: SafeLineLoader, node: yaml.nodes.Node
): JSON_TYPE[] {
    loc = os.path.join(os.path.dirname(loader.name), node.value)
    return [
        load_yaml(f)
        for f in _find_files(loc, "*.yaml")
        if (os.path.basename(f) !== SECRET_YAML
    ]
}

/**
 * Load multiple files from directory as a merged list.
 */
export function _include_dir_merge_list_yaml(
    loader) {
        }
): JSON_TYPE {
    loc: string = os.path.join(os.path.dirname(loader.name), node.value)
    merged_list: JSON_TYPE] = [[]
    for(const fname of _find_files(loc, "*.yaml")) {
        if (os.path.basename(fname) === SECRET_YAML) {
            continue
        }
        loaded_yaml = load_yaml(fname)
        if (loaded_yaml instanceof list) {
            merged_list.extend(loaded_yaml)
        }
    }
    return _add_reference(merged_list, loader, node)
}

/**
 * Load YAML mappings int an ordered dictionary to preserve key order.
 */
export function _ordered_dict(loader: SafeLineLoader, node: yaml.nodes.MappingNode): OrderedDict {
    loader.flatten_mapping(node)
    nodes = loader.construct_pairs(node)

    seen: Dict = {}
    for(const (key, _), (child_node, _) of zip(nodes, node.value)) {
        line = child_node.start_mark.line

        try {
            hash(key)
        }
        catch (e) {
            if (e instanceof TypeError as exc) {
            fname = getattr(loader.stream, "name", "")
            throw new yaml.MarkedYAMLError(
                context=f'invalid key: "{key}"',
                context_mark=yaml.Mark(fname, 0, line, -1, null, null),
            ) from exc
            }
            else {
                throw e;
            }
        }


        if (key in seen) {
            fname = getattr(loader.stream, "name", "")
            _LOGGER.warning(
                'YAML file %s contains duplicate key "%s". Check lines %d and %d',
                fname,
                key,
                seen[key],
                line,
            )
        }
        seen[key] = line
    }

    return _add_reference(OrderedDict(nodes), loader, node)
}

/**
 * Add line number and file name to Load YAML sequence.
 */
export function _construct_seq(loader: SafeLineLoader, node: yaml.nodes.Node): JSON_TYPE {
    (obj,) = loader.construct_yaml_seq(node)
    return _add_reference(obj, loader, node)
}

/**
 * Load environment variables and embed it int the configuration YAML.
 */
export function _env_var_yaml(loader: SafeLineLoader, node: yaml.nodes.Node): string {
    args = node.value.split()

    // Check for a default value
    if (args.length > 1) {
        return os.getenv(args[0], " ".join(args[1:]))
    }
    if (args[0] in os.environ) {
        return os.environ[args[0]]
    }
    _LOGGER.error("Environment variable %s not defined", node.value)
    throw new HomeAssistantError(node.value)
}

/**
 * Load the secrets yaml from path.
 */
export function _load_secret_yaml(secret_path: string): JSON_TYPE {
    secret_path = os.path.join(secret_path, SECRET_YAML)
    if (secret_path in __SECRET_CACHE) {
        return __SECRET_CACHE[secret_path]
    }

    _LOGGER.debug("Loading %s", secret_path)
    try {
        secrets = load_yaml(secret_path)
        if (!secrets instanceof dict) {
            throw new HomeAssistantError("Secrets is not a dictionary")
        }
        if ("logger" in secrets) {
            logger = string(secrets["logger"]).lower()
            if (logger === "debug") {
                _LOGGER.setLevel(logging.DEBUG)
            }
            else {
                _LOGGER.error(
                    "secrets.yaml: 'logger: debug' expected, but 'logger: %s' found",
                    logger,
                )
            }
            del secrets["logger"]
        }
    }
    catch (e) {
        if (e instanceof FileNotFoundError) {
        secrets = {}
        }
        else {
            throw e;
        }
    }

    __SECRET_CACHE[secret_path] = secrets
    return secrets
}

/**
 * Load secrets and embed it int the configuration YAML.
 */
export function secret_yaml(loader: SafeLineLoader, node: yaml.nodes.Node): JSON_TYPE {
    secret_path = os.path.dirname(loader.name)
    while (true) {
        secrets = _load_secret_yaml(secret_path)

        if (node.value in secrets) {
            _LOGGER.debug(
                "Secret %s retrieved from secrets.yaml in folder %s",
                node.value,
                secret_path,
            )
            return secrets[node.value]
        }

        if (secret_path === os.path.dirname(sys.path[0]) {
            break  // sys.path[0] set to config/deps folder by bootstrap
        }

        secret_path = os.path.dirname(secret_path)
        if (!os.path.exists(secret_path) or secret_path.length < 5) {
            break  // Somehow we got past the .homeassistant config folder
        }
    }

    if (keyring) {
        // do some keyring stuff
        pwd = keyring.get_password(_SECRET_NAMESPACE, node.value)
        if (pwd) {
            global KEYRING_WARN  // pylint: disable=global-statement

            if (!KEYRING_WARN) {
                KEYRING_WARN = true
                _LOGGER.warning(
                    "Keyring is deprecated and will be removed in March 2021."
                )
            }

            _LOGGER.debug("Secret %s retrieved from keyring", node.value)
            return pwd
        }
    }

    global credstash  // pylint: disable=invalid-name, global-statement

    if (credstash) {
        // pylint: disable=no-member
        try {
            pwd = credstash.getSecret(node.value, table=_SECRET_NAMESPACE)
            if (pwd) {
                global CREDSTASH_WARN  // pylint: disable=global-statement

                if (!CREDSTASH_WARN) {
                    CREDSTASH_WARN = true
                    _LOGGER.warning(
                        "Credstash is deprecated and will be removed in March 2021."
                    )
                }
                _LOGGER.debug("Secret %s retrieved from credstash", node.value)
                return pwd
            }
        }
        catch (e) {
            if (e instanceof credstash.ItemNotFound) {
            pass
            }
            else {
                throw e;
            }
        }

        catch (e) {  // pylint: disable=broad-except
            if (e instanceof Exception) {
            // Catch if package installed and no config
            credstash = null
            }
            else {
                throw e;
            }
        }

    }

    throw new HomeAssistantError`Secret ${node.value} not defined`)
}

yaml.SafeLoader.add_constructor("!include", _include_yaml)
yaml.SafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _ordered_dict
)
yaml.SafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_SEQUENCE_TAG, _construct_seq
)
yaml.SafeLoader.add_constructor("!env_var", _env_var_yaml)
yaml.SafeLoader.add_constructor("!secret", secret_yaml)
yaml.SafeLoader.add_constructor("!include_dir_list", _include_dir_list_yaml)
yaml.SafeLoader.add_constructor("!include_dir_merge_list", _include_dir_merge_list_yaml)
yaml.SafeLoader.add_constructor("!include_dir_named", _include_dir_named_yaml)
yaml.SafeLoader.add_constructor(
    "!include_dir_merge_named", _include_dir_merge_named_yaml
)
yaml.SafeLoader.add_constructor("!input", Input.from_node)
