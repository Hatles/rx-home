/**
 * Custom yaml object types.
 */
from dataclasses import dataclass

import yaml


/**
 * Wrapper class to be able to add attributes on a list.
 */
export class NodeListClass extends list {
}

/**
 * Wrapper class to be able to add attributes on a string.
 */
export class NodeStrClass extends string {
}

// @dataclass(frozen=true)
/**
 * Input that should be substituted.
 */
export class Input {

    name: string

    // @classmethod
    /**
     * Create a new placeholder from a node.
     */
    from_node(cls, loader: yaml.Loader, node: yaml.nodes.Node): "Input" {
        return cls(node.value)
    }
}