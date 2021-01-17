/**
 * Asyncio utilities.
 */
import {AggregateError} from "./aggregateError";
import {Awaitable} from "../../types";
import Timeout = NodeJS.Timeout;

export class TimeoutError extends Error {
}

export const timeout = (timeoutMs: number) => new Promise((resolve, reject) => {
    let id = setTimeout(() => {
        clearTimeout(id);
        reject('Timed out in '+ timeoutMs + 'ms.')
    }, timeoutMs)
});

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const asyncWithTimeout = <T>(promise: () => Promise<T>, timeoutMs: number, failureMessage?: string) => {
    let timeoutHandle: Timeout;
    const timeoutPromise = new Promise<never>((resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new TimeoutError(failureMessage)), timeoutMs);
    });

    return Promise.race([
        promise(),
        timeoutPromise,
    ]).then((result) => {
        clearTimeout(timeoutHandle);
        return result;
    });
}

export const awaitWithTimeout = (promises: Awaitable<any>[], timeoutMs: number, options: {concurrency?: number, stopOnError?: boolean} = {}) => {
    const {concurrency, stopOnError = false} = options;
    return new Promise<Awaitable<any>[]>((resolve, reject) => {
        if (!((Number.isSafeInteger(concurrency) || concurrency === Infinity) && concurrency >= 1)) {
            throw new TypeError(`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`);
        }

        const result = [];
        const errors = [];
        let pending = [...promises];
        const iterator = promises[Symbol.iterator]();
        let isRejected = false;
        let isIterableDone = false;
        let resolvingCount = 0;
        let currentIndex = 0;

        const next = () => {
            if (isRejected) {
                return;
            }

            const nextItem = iterator.next();
            const index = currentIndex;
            currentIndex++;

            if (nextItem.done) {
                isIterableDone = true;

                if (resolvingCount === 0) {
                    if (!stopOnError && errors.length !== 0) {
                        reject(new AggregateError(errors));
                    } else {
                        resolve(pending);
                    }
                }

                return;
            }

            resolvingCount++;

            (async () => {
                const element = await nextItem.value;
                try {
                    result[index] = await element;
                    resolvingCount--;
                    pending = pending.filter(task => task !== element);
                    next();
                } catch (error) {
                    pending = pending.filter(task => task !== element);
                    if (stopOnError) {
                        isRejected = true;
                        reject(error);
                    } else {
                        errors.push(error);
                        resolvingCount--;
                        next();
                    }
                }
            })();
        };

        for (let i = 0; i < concurrency; i++) {
            next();

            if (isIterableDone) {
                break;
            }
        }
    });
}
