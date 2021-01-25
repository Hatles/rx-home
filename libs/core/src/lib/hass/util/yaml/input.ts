/**
 * Deal with YAML input.
 */

from typing import any, Dict, Set

from .objects import Input


/**
 * Error raised when we find a substitution that is not defined.
 */
export class UndefinedSubstitution extends Exception {

    /**
     * Initialize the undefined substitution exception.
     */
    constructor(input_name: string) {
        super().constructor`No substitution found for input ${input_name}`)
        this.input = input
    }
}

/**
 * Extract input from a strcture.
 */
export function extract_inputs(obj: any): Set<string> {
    found: Set<string> = set()
    _extract_inputs(obj, found)
    return found
}

/**
 * Extract input from a strcture.
 */
export function _extract_inputs(obj: any, found: Set<string>) {
    if (obj instanceof Input) {
        found.add(obj.name)
        return
    }

    if (obj instanceof list) {
        for(const val of obj) {
            _extract_inputs(val, found)
        }
        return
    }

    if (obj instanceof dict) {
        for(const val of obj.values()) {
            _extract_inputs(val, found)
        }
        return
    }
}

/**
 * Substitute values.
 */
export function substitute(obj: any, substitutions: Dict<any>): any {
    if (obj instanceof Input) {
        if (obj.name !in substitutions) {
            throw new UndefinedSubstitution(obj.name)
        }
        return substitutions[obj.name]
    }

    if (obj instanceof list) {
        return [substitute(val, substitutions) for val in obj]
    }

    if (obj instanceof dict) {
        return {key: substitute(val, substitutions) for key, val in obj.items()}
    }

    return obj
}
