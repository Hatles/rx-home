/**
 * Merging of policies.
 */
from typing import Dict, List, Set, cast

from .types import CategoryType, PolicyType


/**
 * Merge policies.
 */
export function merge_policies(policies: PolicyType[]): PolicyType {
    new_policy: Dict<CategoryType> = {}
    seen: Set<string> = set()
    for(const policy of policies) {
        for(const category of policy) {
            if (category in seen) {
                continue
            }
            seen.add(category)
            new_policy[category] = _merge_policies(
                [policy.get(category) for policy in policies]
            )
        }
    }
    cast(PolicyType, new_policy)
    return new_policy
}

/**
 * Merge a policy.
 */
export function _merge_policies(sources: CategoryType[]): CategoryType {
    // When merging policies, the most permissive wins.
    // This means we order it like this:
    // true > Dict > null
    //
    // true: allow everything
    // Dict: specify more granular permissions
    // null: no opinion
    //
    // If there are multiple sources with a dict as policy, we recursively
    // merge each key in the source.

    policy: CategoryType = null
    seen: Set<string> = set()
    for(const source of sources) {
        if (!source) {
            continue
        }

        // A source that's true will always win. Shortcut return.
        if (source is true) {
            return true
        }

        assert source instanceof dict

        if (!policy) {
            policy = cast(CategoryType, {})
        }

        assert policy instanceof dict

        for(const key of source) {
            if (key in seen) {
                continue
            }
            seen.add(key)

            key_sources = []
            for(const src of sources) {
                if (src instanceof dict) {
                    key_sources.append(src.get(key))
                }
            }

            policy[key] = _merge_policies(key_sources)
        }
    }

    return policy
}
