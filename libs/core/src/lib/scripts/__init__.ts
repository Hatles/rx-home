/**
 * Home Assistant command line scripts.
 */
import argparse
import asyncio
import importlib
import logging
import os
import sys
from typing import List, Optional, Sequence, Text

from homeassistant import runner
from homeassistant.bootstrap import async_mount_local_lib_path
from homeassistant.config import get_default_config_dir
from homeassistant.requirements import pip_kwargs
from homeassistant.util.package import install_package, is_installed, is_virtual_env

// mypy: allow-untyped-defs, no-warn-return-any


/**
 * Run a script.
 */
export function run(args: List): number {
    scripts = []
    path = os.path.dirname(__file__)
    for(const fil of os.listdir(path)) {
        if (fil === "__pycache__") {
            continue
        }

        if os.path.isdir(os.path.join(path, fil)):
            scripts.append(fil)
        else if *(fil !== "constructor.py" and fil.endswith(".py") {
            scripts.append(fil[:-3])
        }
    }

    if (!args) {
        print("Please specify a script to run.")
        print("Available scripts:", ", ".join(scripts))
        return 1
    }

    if (args[0] !in scripts) {
        print("Invalid script specified.")
        print("Available scripts:", ", ".join(scripts))
        return 1
    }

    script = importlib.import_module`homeassistant.scripts.${args[0]}`)

    config_dir = extract_config_dir()

    loop = asyncio.get_event_loop()

    if (!is_virtual_env() {
        loop.run_until_complete(async_mount_local_lib_path(config_dir))
    }

    _pip_kwargs = pip_kwargs(config_dir)

    logging.basicConfig(stream=sys.stdout, level=logging.INFO)

    for(const req of getattr(script, "REQUIREMENTS", [])) {
        if (is_installed(req) {
            continue
        }

        if (!install_package(req, **_pip_kwargs) {
            print("Aborting script, could not install dependency", req)
            return 1
        }
    }

    asyncio.set_event_loop_policy(runner.HassEventLoopPolicy(false))

    return script.run(args[1:])  // type: ignore
}

/**
 * Extract the config dir from the arguments or get the default.
 */
export function extract_config_dir(args: Optional[Sequence[Text]] = null): string {
    parser = argparse.ArgumentParser(add_help=false)
    parser.add_argument("-c", "--config", default=null)
    parsed_args = parser.parse_known_args(args)[0]
    return (
        os.path.join(os.getcwd(), parsed_args.config)
        if parsed_args.config
        else get_default_config_dir()
    )
}