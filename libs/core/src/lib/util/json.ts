/**
 * JSON utility functions.
 */
from collections import deque
import json
import logging
import os
import tempfile
from typing import any, Callable, Dict, List, Optional, Type, Union

from homeassistant.core import Event, State
from homeassistant.exceptions import HomeAssistantError

const _LOGGER = logging.getLogger(__name__)


/**
 * Error serializing the data to JSON.
 */
export class SerializationError extends HomeAssistantError {
}

/**
 * Error writing the data.
 */
export class WriteError extends HomeAssistantError {
}

/**
 * Load JSON data from a file and return as dict or list.

    Defaults to returning empty dict if file is not found.

 */
export function load_json(
    filename: string, default: Union<List, Dict, null> = null
): Union<List, Dict> {
    try {
        with open(filename, encoding="utf-8") as fdesc:
            return json.loads(fdesc.read())  // type: ignore
    }
    catch (e) {
        if (e instanceof FileNotFoundError) {
        // This is not a fatal error
        _LOGGER.debug("JSON file not found: %s", filename)
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof ValueError as error) {
        _LOGGER.exception("Could not parse JSON content: %s", filename)
        throw new HomeAssistantError(error) from error
        }
        else {
            throw e;
        }
    }

    catch (e) {
        if (e instanceof OSError as error) {
        _LOGGER.exception("JSON file reading failed: %s", filename)
        throw new HomeAssistantError(error) from error
        }
        else {
            throw e;
        }
    }

    return {} if !default else default
}

/**
 * Save JSON data to a file.

    Returns true on success.

 */
export function save_json(
    filename: string,
    data: Union<List, Dict>,
    private: boolean = false,
    *,
    encoder: Optional[Type[json.JSONEncoder]] = null,
) {
    try {
        json_data = json.dumps(data, indent=4, cls=encoder)
    }
    catch (e) {
        if (e instanceof TypeError as error) {
        msg =`Failed to serialize to JSON: ${filename}. Bad data at ${format_unserializable_data(find_paths_unserializable_data(data))}`
        _LOGGER.error(msg)
        throw new SerializationError(msg) from error
        }
        else {
            throw e;
        }
    }


    tmp_filename = ""
    tmp_path = os.path.split(filename)[0]
    try {
        // Modern versions of Python tempfile create this file with mode 0o600
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=tmp_path, delete=false
        ) as fdesc:
            fdesc.write(json_data)
            tmp_filename = fdesc.name
        if (!private) {
            os.chmod(tmp_filename, 0o644)
        }
        os.replace(tmp_filename, filename)
    }
    catch (e) {
        if (e instanceof OSError as error) {
        _LOGGER.exception("Saving JSON file failed: %s", filename)
        throw new WriteError(error) from error
        }
        else {
            throw e;
        }
    }

    finally {
        if (os.path.exists(tmp_filename) {
            try {
                os.remove(tmp_filename)
            }
            catch (e) {
                if (e instanceof OSError as err) {
                // If we are cleaning up then something else went wrong, so
                // we should suppress likely follow-on errors in the cleanup
                _LOGGER.error("JSON replacement cleanup failed: %s", err)
                }
                else {
                    throw e;
                }
            }

        }
    }
}

/**
 * Format output of find_paths in a friendly way.

    Format is comma separated: <path>=<value>(<type>)

 */
export function format_unserializable_data(data: Dict<any>): string {
    return ", ".join`${path}=${value}(${type(value)}` for path, value in data.items())
}

/**
 * Find the paths to unserializable data.

    This method is slow! Only use for error handling.

 */
export function find_paths_unserializable_data(
    bad_data: any, *, dump: Callable[[Any], string] = json.dumps
): Dict<any> {
    to_process = deque([(bad_data, "$")])
    invalid = {}

    while (to_process) {
        obj, obj_path = to_process.popleft()

        try {
            dump(obj)
            continue
        }
        catch (e) {
            if (e instanceof (ValueError, TypeError)) {
            pass
            }
            else {
                throw e;
            }
        }


        // We convert states and events to dict so we can find bad data inside it
        if (obj instanceof State) {
            obj_path +=`(state: ${obj.entity_id})`
            obj = obj.as_dict()
        }
        else if *(obj instanceof Event {
            obj_path +=`(event: ${obj.event_type})`
            obj = obj.as_dict()
        }

        if (obj instanceof dict) {
            for(const key, value of obj.items()) {
                try {
                    // Is key valid?
                    dump({key})
                }
                catch (e) {
                    if (e instanceof TypeError) {
                    invalid`${obj_path}<key: ${key}>`] = key
                    }
                    else {
                        throw e;
                    }
                }

                else {
                    // Process value
                    to_process.append((value,`${obj_path}.${key}`))
                }
            }
        }
        else if *(obj instanceof list {
            for(const idx, value of enumerate(obj)) {
                to_process.append((value,`${obj_path}[${idx}]`))
            }
        }
        else {
            invalid[obj_path] = obj
        }
    }

    return invalid
}
