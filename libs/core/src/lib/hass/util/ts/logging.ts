
export class Logger {
    constructor(public name) {
    }

    debug: (a, b?, c?, d?) => {}
    info: (a, b?, c?, d?) => {}
    warning: (a, b?, c?, d?) => {}
    exception: (a, b?, c?, d?) => {}
    error: (a, b?, c?, d?) => {}
}

export class LoggerFactory {
    getLogger(name: string) {
        return new Logger(name)
    }
}

export const logging = new LoggerFactory()
export const __name__ = 'DEFAULT_CLASS_LOGGER'
export const __package__ = 'DEFAULT_PACKAGE_LOGGER'
