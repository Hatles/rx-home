export type Callable<K = void, T = void> = (...args: any[]) => T
export type Optional<T = any> = T | null | undefined;
export type Awaitable<T = any> = Promise<T>;
export type Coroutine<T = any> = Promise<T>;
export type Dict<T = any> = {[key: string]: T};
// export type Dict<K = string, T = any> = Map<K, T>;
// export type Dict<T = any> = Map<string, T>;
export type Set<T = any> = T[];

// export type CALLABLE_T = Callable<void>;
// export type CALLBACK_TYPE = Callable<void>;
// const CALLABLE_T = TypeVar("CALLABLE_T", bound=Callable);
// const CALLBACK_TYPE = Callable[[], None];

// pylint: enable=invalid-name

export class Future<T = any> {
    private _result: T;

    set_result(result: T) {
        this._result = result;
    }

    result(): T {
        return this._result;
    }

    set_running_or_notify_cancel() {
        return false;
    }

    set_exception(e: Error) {

    }
}
