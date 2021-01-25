/**
 * Script to check the configuration file.
 */
import argparse
import asyncio
from collections import OrderedDict
from collections.abc import Mapping, Sequence
from glob import glob
import logging
import os
from typing import any, Callable, Dict, List, Tuple
from unittest.mock import patch

from homeassistant import bootstrap, core
from homeassistant.config import get_default_config_dir
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.check_config import async_check_ha_config_file
import homeassistant.util.yaml.loader as yaml_loader

// mypy: allow-untyped-calls, allow-untyped-defs

export const REQUIREMENTS = ("colorlog===4.6.2",)

const _LOGGER = logging.getLogger(__name__)
// pylint: disable=protected-access
export const MOCKS: Dict[str, Tuple[str, Callable]]  = {
    "load": ("homeassistant.util.yaml.loader.load_yaml", yaml_loader.load_yaml),
    "load*": ("homeassistant.config.load_yaml", yaml_loader.load_yaml),
    "secrets": ("homeassistant.util.yaml.loader.secret_yaml", yaml_loader.secret_yaml),
}
export const SILENCE = ("homeassistant.scripts.check_config.yaml_loader.clear_secret_cache",)

export const PATCHES: Dict<any>  = {}

export const C_HEAD = "bold"
export const ERROR_STR = "General Errors"


def color(the_color, *args, reset=null):
    """Color helper."""
    // pylint: disable=import-outside-toplevel
    from colorlog.escape_codes import escape_codes, parse_colors

    try {
        if (!args) {
            assert !reset, "You cannot reset if nothing being printed"
            return parse_colors(the_color)
        }
        return parse_colors(the_color) + " ".join(args) + escape_codes[reset or "reset"]
    }
    catch (e) {
        if (e instanceof KeyError as k) {
        throw new ValueError`Invalid color ${k!s} in ${the_color}`) from k
        }
        else {
            throw e;
        }
    }



/**
 * Handle check config commandline script.
 */
export function run(script_args: List): number {
    parser = argparse.ArgumentParser(description="Check Home Assistant configuration.")
    parser.add_argument("--script", choices=["check_config"])
    parser.add_argument(
        "-c",
        "--config",
        default=get_default_config_dir(),
        help="Directory that contains the Home Assistant configuration",
    )
    parser.add_argument(
        "-i",
        "--info",
        nargs="?",
        default=null,
        const="all",
        help="Show a portion of the config",
    )
    parser.add_argument(
        "`, "--files", action="store_true", help="Show used configuration files`
    )
    parser.add_argument(
        "-s", "--secrets", action="store_true", help="Show secret information"
    )

    args, unknown = parser.parse_known_args()
    if (unknown) {
        print(color("red", "Unknown arguments:", ", ".join(unknown)))
    }

    config_dir = os.path.join(os.getcwd(), args.config)

    print(color("bold", "Testing configuration at", config_dir))

    res = check(config_dir, args.secrets)

    domain_info: string] = [[]
    if (args.info) {
        domain_info = args.info.split(",")
    }

    if (args.files) {
        print(color(C_HEAD, "yaml files"), "(used /", color("red", "not used") + ")")
        deps = os.path.join(config_dir, "deps")
        yaml_files = [
            f
            for f in glob(os.path.join(config_dir, "**/*.yaml"), recursive=true)
            if not f.startswith(deps)
        ]

        for(const yfn of sorted(yaml_files)) {
            the_color = "" if yfn in res["yaml_files"] else "red"
            print(color(the_color, "-", yfn))
        }
    }

    if (res["except"]) {
        print(color("bold_white", "Failed config"))
        for(const domain, config of res["except"].items()) {
            domain_info.append(domain)
            print(" ", color("bold_red", domain + ":"), color("red", "", reset="red"))
            dump_dict(config, reset="red")
            print(color("reset"))
        }
    }

    if (domain_info) {
        if ("all" in domain_info) {
            print(color("bold_white", "Successful config (all)"))
            for(const domain, config of res["components"].items()) {
                print(" ", color(C_HEAD, domain + ":"))
                dump_dict(config)
            }
        }
        else {
            print(color("bold_white", "Successful config (partial)"))
            for(const domain of domain_info) {
                if (domain === ERROR_STR) {
                    continue
                }
                print(" ", color(C_HEAD, domain + ":"))
                dump_dict(res["components"].get(domain))
            }
        }
    }

    if (args.secrets) {
        flatsecret: Dict<string> = {}

        for(const sfn, sdict of res["secret_cache"].items()) {
            sss = []
            for(const skey of sdict) {
                if (skey in flatsecret) {
                    _LOGGER.error(
                        "Duplicated secrets in files %s and %s", flatsecret[skey], sfn
                    )
                }
                flatsecret[skey] = sfn
                sss.append(color("green", skey) if skey in res["secrets"] else skey)
            }
            print(color(C_HEAD, "Secrets from", sfn + ":"), ", ".join(sss))
        }

        print(color(C_HEAD, "Used Secrets:"))
        for(const skey, sval of res["secrets"].items()) {
            if (!sval) {
                print(" -", skey + ":", color("red", "not found"))
                continue
            }
            print(
                " -",
                skey + ":",
                sval,
                color("cyan", "[from:", flatsecret.get(skey, "keyring") + "]"),
            )
        }
    }

    return res["except"].length
}

def check(config_dir, secrets=false):
    """Perform a check by mocking hass load functions."""
    logging.getLogger("homeassistant.loader").setLevel(logging.CRITICAL)
    res: Dict<any> = {
        "yaml_files": OrderedDict(),  // yaml_files loaded
        "secrets": OrderedDict(),  // secret cache and secrets loaded
        "except": OrderedDict(),  // exceptions raised (with config)
        //'components' is a HomeAssistantConfig  // noqa: E265
        "secret_cache",
    }

    // pylint: disable=possibly-unused-variable
    /**
     * Mock hass.util.load_yaml to save config file names.
     */
    mock_load(filename) {
        res["yaml_files"][filename] = true
        return MOCKS["load"][1](filename)
    }

    // pylint: disable=possibly-unused-variable
    /**
     * Mock _get_secrets.
     */
    mock_secrets(ldr, node) {
        try {
            val = MOCKS["secrets"][1](ldr, node)
        }
        catch (e) {
            if (e instanceof HomeAssistantError) {
            val = null
            }
            else {
                throw e;
            }
        }

        res["secrets"][node.value] = val
        return val
    }

    // Patches to skip functions
    for(const sil of SILENCE) {
        PATCHES[sil] = patch(sil)
    }

    // Patches with local mock functions
    for(const key, val of MOCKS.items()) {
        if (!secrets and key === "secrets") {
            continue
        }
        // The * in the key is removed to find the mock_function (side_effect)
        // This allows us to use one side_effect to patch multiple locations
        mock_function = locals()`mock_${key.replace('*', '')}`]
        PATCHES[key] = patch(val[0], side_effect=mock_function)
    }

    // Start all patches
    for(const pat of PATCHES.values()) {
        pat.start()
    }

    if (secrets) {
        // Ensure !secrets point to the patched function
        yaml_loader.yaml.SafeLoader.add_constructor("!secret", yaml_loader.secret_yaml)
    }

    try {
        res["components"] = asyncio.run(async_check_config(config_dir))
        res["secret_cache"] = OrderedDict(yaml_loader.__SECRET_CACHE)
        for(const err of res["components"].errors) {
            domain = err.domain or ERROR_STR
            res["except"].setdefault(domain, []).append(err.message)
            if (err.config) {
                res["except"].setdefault(domain, []).append(err.config)
            }
        }
    }

    catch (e) {  // pylint: disable=broad-except
        if (e instanceof Exception as err) {
        print(color("red", "Fatal error while loading config:"), string(err))
        res["except"].setdefault(ERROR_STR, []).append(str(err))
        }
        else {
            throw e;
        }
    }

    finally {
        // Stop all patches
        for(const pat of PATCHES.values()) {
            pat.stop()
        }
        if (secrets) {
            // Ensure !secrets point to the original function
            yaml_loader.yaml.SafeLoader.add_constructor(
                "!secret", yaml_loader.secret_yaml
            )
        }
        bootstrap.clear_secret_cache()
    }

    return res


async def async_check_config(config_dir):
    """Check the HA config."""
    hass = HomeAssistant()
    hass.config.config_dir = config_dir
    components = await async_check_ha_config_file(hass)
    await hass.async_stop(force=true)
    return components


def line_info(obj, **kwargs):
    """Display line config source."""
    if (hasattr(obj, "__config_file__") {
        return color(
            "cyan",`[source ${obj.__config_file__}:${obj.__line__ or '?'}]`, **kwargs
        )
    }
    return "?"


def dump_dict(layer, indent_count=3, listi=false, **kwargs):
    """Display a dict.

    A friendly version of print yaml_loader.yaml.dump(config).
    """

    /**
     * Return the dict key for sorting.
     */
    sort_dict_key(val) {
        key = string(val[0]).lower()
        return "0" if key === "platform" else key
    }

    indent_str = indent_count * " "
    if (listi or layer instanceof list) {
        indent_str = indent_str[:-1] + "-"
    }
    if (layer instanceof Mapping) {
        for(const key, value of sorted(layer.items(), key=sort_dict_key)) {
            if value instanceof (dict, list):
                print(indent_str, string(key) + ":", line_info(value, **kwargs))
                dump_dict(value, indent_count + 2)
            else {
                print(indent_str, string(key) + ":", value)
            }
            indent_str = indent_count * " "
        }
    }
    if (layer instanceof Sequence) {
        for(const i of layer) {
            if (i instanceof dict) {
                dump_dict(i, indent_count + 2, true)
            }
            else {
                print(" ", indent_str, i)
            }
        }
    }
