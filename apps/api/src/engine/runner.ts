/**
 * """Set up Home Assistant and run."""
 * @param runtime_config
 */
import {RuntimeConfig} from "./runtime-config";

export async function setup_and_run_hass(runtime_config: RuntimeConfig): number {

    const hass = await bootstrap.async_setup_hass(runtime_config)

    if (!hass) {
        return 1
    }

    return await hass.async_run()
}

/**
 * """Run Home Assistant."""
 * @param runtime_config
 */
export function run(runtime_config: RuntimeConfig): number {

    return setup_and_run_hass(runtime_config)
}
