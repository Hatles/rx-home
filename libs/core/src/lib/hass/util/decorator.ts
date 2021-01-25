/**
 * Decorator utility functions.
 */
from typing import Callable, TypeVar

export const CALLABLE_T = TypeVar("CALLABLE_T", bound=Callable)  // pylint: disable=invalid-name


/**
 * Registry of items.
 */
export class Registry extends dict {

    /**
     * Return decorator to register item with a specific name.
     */
    register(name: string): Callable[[CALLABLE_T], CALLABLE_T] {

        /**
         * Register decorated function.
         */
        decorator(func: CALLABLE_T): CALLABLE_T {
            self[name] = func
            return func
        }

        return decorator
    }
}