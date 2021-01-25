import {Callable} from "./hass/types";

/**
 * Represent a job to be run later.

 We check the callable type in advance
 so we can avoid checking it every time
 we run the job.

 */
export class RxHomeJob {
    target: Callable;

    /**
     * Create a job object.
     */
    constructor(target: Callable) {
        this.target = target
    }

    /**
     * Return the job.
     */
    public toString(): string {
        return`<Job ${this.target}>`
    }
}
