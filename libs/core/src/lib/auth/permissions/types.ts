/**
 * Common code for permissions.
 */
from typing import Mapping, Union

// MyPy doesn't support recursion yet. So writing it out as far as we need.

export const ValueType = Union[
    // Example: entities.all = { read: true, control: true }
    Mapping[str, boolean],
    boolean,
    null,
]

// Example: entities.domains = { light: … }
export const SubCategoryDict = Mapping[str, ValueType]

export const SubCategoryType = Union[SubCategoryDict, boolean, null]

export const CategoryType = Union[
    // Example: entities.domains
    Mapping[str, SubCategoryType],
    // Example: entities.all
    Mapping[str, ValueType],
    boolean,
    null,
]

// Example: { entities: … }
export const PolicyType = Mapping[str, CategoryType]
