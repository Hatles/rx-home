import {AssertionError} from "assert";

export function assert(condition: any, message?: string): void {
    if (!condition) {
        throw new AssertionError();
    }
}
