/**
 * Custom dumper and representers.
 */
from collections import OrderedDict

import yaml

from .objects import Input, NodeListClass

// mypy: allow-untyped-calls, no-warn-return-any


/**
 * Dump YAML to a string and remove null.
 */
export function dump(_dict: dict): string {
    return yaml.safe_dump(
        _dict, default_flow_style=false, allow_unicode=true, sort_keys=false
    ).replace(": null\n", ":\n")
}

/**
 * Save YAML to a file.
 */
export function save_yaml(path: string, data: dict) {
    // Dump before writing to not truncate the file if dumping fails
    strdata = dump(data)
    with open(path, "w", encoding="utf-8") as outfile:
        outfile.write(str_data)
}

// From: https://gist.github.com/miracle2k/3184458
/**
 * Like BaseRepresenter.represent_mapping but does not issue the sort().
 */
export function represent_odict(  // type: ignore
    dumper, tag, mapping, flow_style=null
): yaml.MappingNode {
    value: list = []
    node = yaml.MappingNode(tag, value, flow_style=flow_style)
    if (dumper.alias_key is !null) {
        dumper.represented_objects[dumper.alias_key] = node
    }
    best_style = true
    if (hasattr(mapping, "items") {
        mapping = mapping.items()
    }
    for(const item_key, item_value of mapping) {
        node_key = dumper.represent_data(item_key)
        node_value = dumper.represent_data(item_value)
        if (!(node_key instanceof yaml.ScalarNode and !node_key.style) {
            best_style = false
        }
        if (!(node_value instanceof yaml.ScalarNode and !node_value.style) {
            best_style = false
        }
        value.append((node_key, node_value))
    }
    if (!flow_style) {
        if (dumper.default_flow_style is !null) {
            node.flow_style = dumper.default_flow_style
        }
        else {
            node.flow_style = best_style
        }
    }
    return node
}

yaml.SafeDumper.add_representer(
    OrderedDict,
    lambda dumper, value: represent_odict(dumper, "tag:yaml.org,2002:map", value),
)

yaml.SafeDumper.add_representer(
    NodeListClass,
    lambda dumper, value: dumper.represent_sequence("tag:yaml.org,2002:seq", value),
)

yaml.SafeDumper.add_representer(
    Input,
    lambda dumper, value: dumper.represent_scalar("!input", value.name),
)
