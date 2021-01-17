/**
 * Helpers for logging allowing more advanced logging styles to be used.
 */
import inspect
import logging
from typing import any, Mapping, MutableMapping, Optional, Tuple


/**
 *
    Represents a logging message with keyword arguments.

    Adapted from: https://stackoverflow.com/a/24683360/2267718

 */
export class KeywordMessage {

    /**
     * Initialize a new KeywordMessage object.
     */
    constructor(fmt: any, args: any, kwargs: Mapping<string, any>) {
        this._fmt = fmt
        this._args = args
        this._kwargs = kwargs
    }

    /**
     * Convert the object to a string for logging.
     */
    __str__(): string {
        return string(this._fmt).format(*this._args, **this._kwargs)
    }
}

/**
 * Represents an adapter wrapping the logger allowing KeywordMessages.
 */
export class KeywordStyleAdapter extends logging.LoggerAdapter {

    /**
     * Initialize a new StyleAdapter for the provided logger.
     */
    constructor(
        logger: logging.Logger, extra: Optional[Mapping[str, any]] = null
    ) {
        super().constructor(logger, extra or {})
    }

    /**
     * Log the message provided at the appropriate level.
     */
    log(level: number, msg: any, ...args: any[], **kwargs: any) {
        if (this.isEnabledFor(level) {
            msg, log_kwargs = this.process(msg, kwargs)
            this.logger._log(  // pylint: disable=protected-access
                level, KeywordMessage(msg, args, kwargs), (), **log_kwargs
            )
        }
    }

    /**
     * Process the keyword args in preparation for logging.
     */
    process(
        msg: any, kwargs: MutableMapping<string, any>
    ): Tuple[Any, MutableMapping[str, any]] {
        return (
            msg,
            {
                k: kwargs<k>
                for k in inspect.getfullargspec(
                    this.logger._log  // pylint: disable=protected-access
                ).args[1:]
                if k in kwargs
            },
        )
    }
}
