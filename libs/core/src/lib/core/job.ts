
// @enum.unique
/**
 * Represent a job type.
 */
import {Callable} from "../types";
import {ValueError} from "../exceptions";
import {string} from "../helpers/config_validation";
import {_get_callable_job_type} from "@rx-home/core";

export enum HassJobType {
    Coroutinefunction = 1,
    Callback = 2,
    Executor = 3,
}

/**
 * Represent a job to be run later.

 We check the callable type in advance
 so we can avoid checking it every time
 we run the job.

 */
export class HassJob {
    target: Callable;
    job_type: HassJobType;

    /**
     * Create a job object.
     */
    constructor(target: Callable) {
        if (asyncio.iscoroutine(target)) {
            throw new ValueError("Coroutine not allowed to be passed to HassJob")
        }

        this.target = target
        this.job_type = _get_callable_job_type(target)
    }

    /**
     * Return the job.
     */
    public toString(): string {
        return`<Job ${this.job_type} ${this.target}>`
    }
}
