/**
 * Util to handle processes.
 */

import subprocess


/**
 * Force kill a subprocess and wait for it to exit.
 */
export function kill_subprocess(process: subprocess.Popen) {
    process.kill()
    process.communicate()
    process.wait()

    del process
}