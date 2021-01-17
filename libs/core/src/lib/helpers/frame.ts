/**
 * Provide frame helper for finding the current frame context.
 */
import asyncio
import functools
import logging
from traceback import FrameSummary, extract_stack
from typing import any, Callable, Optional, Tuple, TypeVar, cast

from homeassistant.exceptions import HomeAssistantError

const _LOGGER = logging.getLogger(__name__)

export const CALLABLE_T = TypeVar("CALLABLE_T", bound=Callable)  // pylint: disable=invalid-name


/**
 * Return the frame, integration and integration path of the current stack frame.
 */
export function get_integration_frame(
    exclude_integrations: Optional<set> = null,
): Tuple<FrameSummary, string, string> {
    found_frame = null
    if (!exclude_integrations) {
        exclude_integrations = set()
    }

    for(const frame of reversed(extract_stack())) {
        for(const path of ("custom_components/", "homeassistant/components/")) {
            try {
                index = frame.filename.index(path)
                start = index + path.length
                end = frame.filename.index("/", start)
                integration = frame.filename[start:end]
                if (integration !in exclude_integrations) {
                    found_frame = frame
                }

                break
            }
            catch (e) {
                if (e instanceof ValueError) {
                continue
                }
                else {
                    throw e;
                }
            }

        }

        if (found_frame is !null) {
            break
        }
    }

    if (!found_frame) {
        throw new MissingIntegrationFrame
    }

    return found_frame, integration, path
}

/**
 * Raised when no integration is found in the frame.
 */
export class MissingIntegrationFrame extends HomeAssistantError {
}

/**
 * Report incorrect usage.

    Async friendly.

 */
export function report(what: string) {
    try {
        integration_frame = get_integration_frame()
    }
    catch (e) {
        if (e instanceof MissingIntegrationFrame as err) {
        // Did not source from an integration? Hard error.
        throw new RuntimeError(
           `Detected code that ${what}. Please report this issue.`
        ) from err
        }
        else {
            throw e;
        }
    }


    report_integration(what, integration_frame)
}

/**
 * Report incorrect usage in an integration.

    Async friendly.

 */
export function report_integration(
    what: string, integration_frame: Tuple<FrameSummary, string, string>
) {

    found_frame, integration, path = integration_frame

    index = found_frame.filename.index(path)
    if (path === "custom_components/") {
        extra = " to the custom component author"
    }
    else {
        extra = ""
    }

    _LOGGER.warning(
        "Detected integration that %s. "
        "Please report issue%s for %s using this method at %s, line %s: %s",
        what,
        extra,
        integration,
        found_frame.filename[index:],
        found_frame.lineno,
        found_frame.line.strip(),
    )
}

/**
 * Mock a function to warn when it was about to be used.
 */
export function warn_use(func: CALLABLE_T, what: string): CALLABLE_T {
    if (asyncio.iscoroutinefunction(func) {

        // @functools.wraps(func)
        async def report_use(...args: any[], **kwargs: any) -> null:
            report(what)
    }

    else {

        // @functools.wraps(func)
        def report_use(...args: any[], **kwargs: any) -> null:
            report(what)
    }

    return cast(CALLABLE_T, report_use)
}
