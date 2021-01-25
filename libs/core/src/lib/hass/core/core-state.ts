/**
 * Represent the current state of Home Assistant.
 */
export enum CoreState {
    not_running = "NOT_RUNNING",
    starting = "STARTING",
    running = "RUNNING",
    stopping = "STOPPING",
    final_write = "FINAL_WRITE",
    stopped = "STOPPED",
}
