import {AssertionError} from "libs/core/src/lib/hass/util/ts/assert";

export function assert(condition: any, message?: string): void {
    if (!condition) {
        throw new AssertionError();
    }
}
