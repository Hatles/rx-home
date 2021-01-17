const cleanInternalStack = stack => stack.replace(/\s+at .*aggregate-error\/index.js:\d+:\d+\)?/g, '');

export class AggregateError extends Error {
    private readonly _errors: Error[];

    constructor(errorsOrMessages: (Error | string)[]) {
        if (!Array.isArray(errorsOrMessages)) {
            throw new TypeError(`Expected input to be an Array, got ${typeof errorsOrMessages}`);
        }

        const errors = errorsOrMessages.map(error => {
            if (error instanceof Error) {
                return error;
            }

            if (error !== null && typeof error === 'object') {
                // Handle plain error objects with message property and/or possibly other metadata
                return Object.assign(new Error(error), error);
            }

            return new Error(error);
        });

        let message = errors
            .map(error => {
                // The `stack` property is not standardized, so we can't assume it exists
                return typeof error.stack === 'string' ? cleanInternalStack(error.stack) : String(error);
            })
            .join('\n');
        message = '\n' + message;
        super(message);

        this.name = 'AggregateError';

        this._errors = errors;
    }

    * [Symbol.iterator]() {
        for (const error of this._errors) {
            yield error;
        }
    }
}
