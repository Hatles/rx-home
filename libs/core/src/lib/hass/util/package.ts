/**
 * Helpers to install PyPi packages.
 */
import asyncio
from importlib.metadata import PackageNotFoundError, version
import logging
import os
from pathlib import Path
from subprocess import PIPE, Popen
import sys
from typing import Optional
from urllib.parse import urlparse

import pkg_resources

const _LOGGER = logging.getLogger(__name__)


/**
 * Return if we run in a virtual environment.
 */
export function is_virtual_env(): boolean {
    // Check supports venv && virtualenv
    return getattr(sys, "base_prefix", sys.prefix) !== sys.prefix or hasattr(
        sys, "real_prefix"
    )
}

/**
 * Return true if we run in a docker env.
 */
export function is_docker_env(): boolean {
    return Path("/.dockerenv").exists()
}

/**
 * Check if a package is installed and will be loaded when we import it.

    Returns true when the requirement is met.
    Returns false when the package is not installed or doesn't meet req.

 */
export function is_installed(package: string): boolean {
    try {
        req = pkg_resources.Requirement.parse(package)
    }
    catch (e) {
        if (e instanceof ValueError) {
        // This is a zip file. We no longer use this in Home Assistant,
        // leaving it in for custom components.
        req = pkg_resources.Requirement.parse(urlparse(package).fragment)
        }
        else {
            throw e;
        }
    }


    try {
        return version(req.project_name) in req
    }
    catch (e) {
        if (e instanceof PackageNotFoundError) {
        return false
        }
        else {
            throw e;
        }
    }

}

/**
 * Install a package on PyPi. Accepts pip compatible package str.

    Return boolean if install successful.

 */
export function install_package(
    package: string,
    upgrade: boolean = true,
    target: Optional<string> = null,
    constraints: Optional<string> = null,
    find_links: Optional<string> = null,
    no_cache_dir: Optional<bool> = false,
): boolean {
    // Not using 'import pip; pip.main([])' because it breaks the logger
    _LOGGER.info("Attempting install of %s", package)
    env = os.environ.copy()
    args = [sys.executable, "-m", "pip", "install", "--quiet", package]
    if (no_cache_dir) {
        args.append("--no-cache-dir")
    }
    if (upgrade) {
        args.append("--upgrade")
    }
    if (constraints is !null) {
        args += ["--constraint", constraints]
    }
    if (find_links is !null) {
        args += ["--find-links", find_links, "--prefer-binary"]
    }
    if (target) {
        assert not is_virtual_env()
        // This only works if not running in venv
        args += ["--user"]
        env["PYTHONUSERBASE"] = os.path.abspath(target)
        if (sys.platform !== "win32") {
            // Workaround for incompatible prefix setting
            // See http://stackoverflow.com/a/4495175
            args += ["--prefix="]
        }
    }
    process = Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, env=env)
    _, stderr = process.communicate()
    if (process.returncode !== 0) {
        _LOGGER.error(
            "Unable to install package %s: %s",
            package,
            stderr.decode("utf-8").lstrip().strip(),
        )
        return false
    }

    return true
}

/**
 * Return user local library path.

    This function is a coroutine.

 */
export async function async_get_user_site(deps_dir: string): string {
    env = os.environ.copy()
    env["PYTHONUSERBASE"] = os.path.abspath(deps_dir)
    args = [sys.executable, "-m", "site", "--user-site"]
    process = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env=env,
    )
    stdout, _ = await process.communicate()
    lib_dir = stdout.decode().strip()
    return lib_dir
}
