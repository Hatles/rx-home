export interface ILogger {
    debug(str: string, ...args: any[]);
    warning(str: string, ...args: any[]);
    info(str: string, ...args: any[]);
    exception(str: string, ...args: any[]);
}

export class Logger implements ILogger {
    debug(str: string, ...args: any[]) {
        console.debug(str, args)
    }

    info(str: string, ...args: any[]) {
        console.info(str, args)
    }

    warning(str: string, ...args: any[]) {
        console.warn(str, args)
    }

    exception(str: string, ...args: any[]) {
        console.exception(str, args)
    }

    error(str: string, ...args: any[]) {
        console.error(str, args)
    }
}
