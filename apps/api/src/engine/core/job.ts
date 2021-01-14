/**
 * """Represent a job type."""
 */
import {Callable} from "./types";
import {is_callback} from "./utils";
import {ValueError} from "../exceptions";

export enum HassJobType {
    //
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
     * @param target
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
    __repr__(): string {
        return `<Job ${this.job_type} ${this.target}>`
    }
}

/**
 * Determine the job type from the callable.
 * @param target
 * @private
 */
function _get_callable_job_type(target: Callable): HassJobType {
    // Check for partials to properly determine if coroutine function
    let check_target = target;
    while (check_target instanceof functools.partial) {
        check_target = check_target.func
    }

    if (asyncio.iscoroutinefunction(check_target)) {
        return HassJobType.Coroutinefunction
    }
    if (is_callback(check_target)) {
        HassJobType.Callback
    }

    return HassJobType.Executor
}
