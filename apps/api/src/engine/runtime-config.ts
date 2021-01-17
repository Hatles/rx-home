import {Optional} from "./core/types";

/**
 * """Class to hold the information for running Home Assistant."""
 */
export class RuntimeConfig {
    config_dir: string
    skip_pip: boolean = false
    safe_mode: boolean = false

    verbose: boolean = false

    log_rotate_days: Optional<number> = null
    log_file: Optional<string> = null
    log_no_color: boolean = false

    debug: boolean = false
    open_ui: boolean = false
}
