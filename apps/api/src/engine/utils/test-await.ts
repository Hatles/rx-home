import {Awaitable} from "../core/types";
import {AggregateError} from "./aggregateError";
import {_LOGGER, BLOCK_LOG_TIMEOUT} from "../core/constants";

const waitWithTimeout = (promises: Awaitable<any>[], timeoutMs: number, options: {concurrency?: number, stopOnError?: boolean} = {}) => {
    const concurrency = options.concurrency;
    const stopOnError = options.stopOnError || false;

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

(async () => {
    let pending = [
        Promise.resolve('1'),
        Promise.reject('2'),
        Promise.resolve('3'),
        Promise.resolve('4'),
    ]

    pending = await waitWithTimeout(pending, timeout=BLOCK_LOG_TIMEOUT)
    if (!pending) {
        return;
    }
    wait_time += BLOCK_LOG_TIMEOUT;
    for (let task of pending) {
        _LOGGER.debug("Waited %s seconds for task: %s", wait_time, task)
    }
})();
