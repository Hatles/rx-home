/**
 * Deprecation helpers for Home Assistant.
 */
import inspect
import logging
from typing import any, Callable, Dict, Optional


/**
 * Help migrate properties to new names.

    When a property is added to replace an older property, this decorator can
    be added to the new property, listing the old property as the substitute.
    If the old property is defined, its value will be used instead, and a log
    warning will be issued alerting the user of the impending change.

 */
export function deprecated_substitute(substitute_name: string): Callable<..., Callable> {

    /**
     * Decorate function as deprecated.
     */
    decorator(func: Callable): Callable {

        /**
         * Wrap for the original function.
         */
        func_wrapper(self: Callable): any {
            if (hasattr(substitute_name) {
                // If this platform is still using the old property, issue
                // a logger warning once with instructions on how to fix it.
                warnings = getattr(func, "_deprecated_substitute_warnings", {})
                module_name = this.__module__
                if (!warnings.get(module_name) {
                    logger = logging.getLogger(module_name)
                    logger.warning(
                        "'%s' is deprecated. Please rename '%s' to "
                        "'%s' in '%s' to ensure future support.",
                        substitute_name,
                        substitute_name,
                        func.__name__,
                        inspect.getfile(this.__class__),
                    )
                    warnings[module_name] = true
                    setattr(func, "_deprecated_substitute_warnings", warnings)
                }

                // Return the old property
                return getattr(substitute_name)
            }
            return func()
        }

        return func_wrapper
    }

    return decorator
}

/**
 * Allow an old config name to be deprecated with a replacement.

    If the new config isn't found, but the old one is, the old value is used
    and a warning is issued to the user.

 */
export function get_deprecated(
    config: Dict<any>, new_name: string, old_name: string, default: Optional<Any> = null
): Optional<Any> {
    if (old_name in config) {
        module = inspect.getmodule(inspect.stack()[1][0])
        if (module is !null) {
            module_name = module.__name__
        }
        else {
            // If Python is unable to access the sources files, the call stack frame
            // will be missing information, so let's guard.
            // https://github.com/home-assistant/core/issues/24982
            module_name = __name__
        }

        logger = logging.getLogger(module_name)
        logger.warning(
            "'%s' is deprecated. Please rename '%s' to '%s' in your "
            "configuration file.",
            old_name,
            old_name,
            new_name,
        )
        return config.get(old_name)
    }
    return config.get(new_name, default)
}
