/**
 * Asyncio utilities.
 */
import {AggregateError} from "./aggregateError";
import {Awaitable, Callable} from "../../types";
import Timeout = NodeJS.Timeout;

export class TimeoutError extends Error {
}

export const timeout = (timeoutMs: number) => new Promise((resolve, reject) => {
    let id = setTimeout(() => {
        clearTimeout(id);
        reject('Timed out in '+ timeoutMs + 'ms.')
    }, timeoutMs)
});

export function sleep(ms: number = 0) {
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

export function run_in_executor<T>(target: Callable<any, T>, ...args: any[]): Promise<T> {
    return new Promise<any>((resolve, reject) => {
        setTimeout(() => resolve(target(...args)))
    });
}

export class PromiseTask<T = any> extends Promise<T> {
    private _isPending: boolean;
    private _isRejected: boolean;
    private _isFulfilled: boolean;

    private promise: Promise<T> | any;

    constructor(promise: Promise<T> | any) {
        super(() => {});

        // Don't modify any promise that has been already modified.
        if (promise.isResolved) {
            this._isPending = false;
            this._isRejected = false;
            this._isFulfilled = true;

            this.promise = promise;
            return;
        }

        // Set initial state
        this._isPending = true;
        this._isRejected = false;
        this._isFulfilled = false;

        // Observe the promise, saving the fulfillment in a closure scope.
        this.promise = promise.then(
            (v) => {
                this._isFulfilled = true;
                this._isPending = false;
                return v;
            },
            (e) => {
                this._isRejected = true;
                this._isPending = false;
                throw e;
            }
        );
    }


    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => (PromiseLike<TResult1> | TResult1)) | undefined | null, onrejected?: ((reason: any) => (PromiseLike<TResult2> | TResult2)) | undefined | null): Promise<TResult1 | TResult2> {
        return this.promise.then(onfulfilled, onrejected);
    }

    catch<TResult = never>(onrejected?: ((reason: any) => (PromiseLike<TResult> | TResult)) | undefined | null): Promise<T | TResult> {
        return this.promise.catch(onrejected);
    }

    isFulfilled() { return this._isFulfilled; };
    isPending() { return this._isPending; };
    isRejected() { return this._isRejected; };
    isDone() { return this._isFulfilled || this._isRejected; };
}

export const waitTasks = (promises: PromiseTask<any>[], timeoutMs: number, options: {concurrency?: number, stopOnError?: boolean} = {}): Promise<{done: PromiseTask<any>[], pending: PromiseTask<any>[]}> => {
    const {concurrency, stopOnError = false} = options;
    return new Promise<{done: PromiseTask<any>[], pending: PromiseTask<any>[]}>((resolve, reject) => {
        if (!((Number.isSafeInteger(concurrency) || concurrency === Infinity) && concurrency >= 1)) {
            throw new TypeError(`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`);
        }

        const result = [];
        const errors = [];
        let done = [];
        let pending = [...promises];
        const iterator = promises[Symbol.iterator]();
        let isRejected = false;
        let isIterableDone = false;
        let resolvingCount = 0;
        let currentIndex = 0;

        setTimeout(() => {
            isIterableDone = true;
            resolve({done: [...done], pending: [...pending]});
        })

        const next = () => {
            if (isRejected) {
                return;
            }

            const nextItem = iterator.next();
            const index = currentIndex;
            currentIndex++;

            if (nextItem.done && !isIterableDone) {
                isIterableDone = true;

                if (resolvingCount === 0) {
                    if (!stopOnError && errors.length !== 0) {
                        reject(new AggregateError(errors));
                    } else {
                        resolve({done: done, pending: pending});
                    }
                }

                return;
            }

            resolvingCount++;

            (async () => {
                const element = await nextItem.value;
                try {
                    result[index] = await element;
                    done.push(element)
                    resolvingCount--;
                    pending = pending.filter(task => task !== element);
                    next();
                } catch (error) {
                    done.push(element)
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
