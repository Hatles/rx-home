/**
 * Threading util helpers.
 */
import ctypes
import inspect
import threading
from typing import any


/**
 * Raise an exception in the threads with id tid.
 */
export function _async_raise(tid: number, exctype: any) {
    if (!inspect.isclass(exctype) {
        throw new TypeError("Only types can be raised (not instances)")
    }

    c_tid = ctypes.c_long(tid)
    res = ctypes.pythonapi.PyThreadState_SetAsyncExc(c_tid, ctypes.py_object(exctype))

    if (res === 1) {
        return
    }

    // "if it returns a number greater than one, you're in trouble,
    // and you should call it again with exc=NULL to revert the effect"
    ctypes.pythonapi.PyThreadState_SetAsyncExc(c_tid, null)
    throw new SystemError("PyThreadState_SetAsyncExc failed")
}

/**
 * A thread class that supports raising exception in the thread from another thread.

    Based on
    https://stackoverflow.com/questions/323972/is-there-any-way-to-kill-a-thread/49877671

    
 */
export class ThreadWithException extends threading.Thread {

    /**
     * Raise the given exception type in the context of this thread.
     */
    raise_exc(exctype: any) {
        assert this.ident
        _async_raise(this.ident, exctype)
    }
}