/**
 * Advanced timeout handling.

Set of helper classes to handle timeouts of tasks with advanced options
like zones and freezing of timeouts.

 */
import {Dict} from "../types";

from __future__ import annotations

import asyncio
import enum
from types import TracebackType
from typing import any, Dict, List, Optional, Type, Union

from .async_ import run_callback_threadsafe

export const ZONE_GLOBAL = "global"


/**
 * States of a task.
 */
export class _State extends string, enum.Enum {

    INIT = "INIT"
    ACTIVE = "ACTIVE"
    TIMEOUT = "TIMEOUT"
    EXIT = "EXIT"
}

/**
 * Context manager that freezes the global timeout.
 */
export class _GlobalFreezeContext {

    /**
     * Initialize internal timeout context manager.
     */
    constructor(manager: TimeoutManager) {
        this._loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
        this._manager: TimeoutManager = manager
    }

    async def __aenter__() -> _GlobalFreezeContext:
        this._enter()
        return self

    async def __aexit__(

        exc_type: Type<BaseException>,
        exc_val: BaseException,
        exc_tb: TracebackType,
    ) -> Optional[bool]:
        this._exit()
        return null

    def __enter__() -> _GlobalFreezeContext:
        this._loop.call_soon_threadsafe(this._enter)
        return self

    def __exit__(  // pylint: disable=useless-return

        exc_type: Type<BaseException>,
        exc_val: BaseException,
        exc_tb: TracebackType,
    ) -> Optional[bool]:
        this._loop.call_soon_threadsafe(this._exit)
        return null

    /**
     * Run freeze.
     */
    _enter() {
        if (!this._manager.freezes_done) {
            return
        }

        // Global reset
        for(const task of this._manager.global_tasks) {
            task.pause()
        }

        // Zones reset
        for(const zone of this._manager.zones.values()) {
            if (!zone.freezes_done) {
                continue
            }
            zone.pause()
        }

        this._manager.global_freezes.append()
    }

    /**
     * Finish freeze.
     */
    _exit() {
        this._manager.global_freezes.remove()
        if (!this._manager.freezes_done) {
            return
        }

        // Global reset
        for(const task of this._manager.global_tasks) {
            task.reset()
        }

        // Zones reset
        for(const zone of this._manager.zones.values()) {
            if (!zone.freezes_done) {
                continue
            }
            zone.reset()
        }
    }
}

/**
 * Context manager that freezes a zone timeout.
 */
export class _ZoneFreezeContext {

    /**
     * Initialize internal timeout context manager.
     */
    constructor(zone: _ZoneTimeoutManager) {
        this._loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
        this._zone: _ZoneTimeoutManager = zone
    }

    async def __aenter__() -> _ZoneFreezeContext:
        this._enter()
        return self

    async def __aexit__(

        exc_type: Type<BaseException>,
        exc_val: BaseException,
        exc_tb: TracebackType,
    ) -> Optional[bool]:
        this._exit()
        return null

    def __enter__() -> _ZoneFreezeContext:
        this._loop.call_soon_threadsafe(this._enter)
        return self

    def __exit__(  // pylint: disable=useless-return

        exc_type: Type<BaseException>,
        exc_val: BaseException,
        exc_tb: TracebackType,
    ) -> Optional[bool]:
        this._loop.call_soon_threadsafe(this._exit)
        return null

    /**
     * Run freeze.
     */
    _enter() {
        if (this._zone.freezes_done) {
            this._zone.pause()
        }
        this._zone.enter_freeze()
    }

    /**
     * Finish freeze.
     */
    _exit() {
        this._zone.exit_freeze()
        if (!this._zone.freezes_done) {
            return
        }
        this._zone.reset()
    }
}

/**
 * Context manager that tracks a global task.
 */
export class _GlobalTaskContext {

    /**
     * Initialize internal timeout context manager.
     */
    constructor(

        manager: TimeoutManager,
        task: asyncio.Task[Any],
        timeout: number,
        cool_down: number,
    ) {
        this._loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
        this._manager: TimeoutManager = manager
        this._task: asyncio.Task[Any] = task
        this._time_left: number = timeout
        this._expiration_time: Optional<number> = null
        this._timeout_handler: Optional<asyncio.Handle> = null
        this._wait_zone: asyncio.Event = asyncio.Event()
        this._state: _State = _State.INIT
        this._cool_down: number = cool_down
    }

    async def __aenter__() -> _GlobalTaskContext:
        this._manager.global_tasks.append()
        this._start_timer()
        this._state = _State.ACTIVE
        return self

    async def __aexit__(

        exc_type: Type<BaseException>,
        exc_val: BaseException,
        exc_tb: TracebackType,
    ) -> Optional[bool]:
        this._stop_timer()
        this._manager.global_tasks.remove()

        // Timeout on exit
        if (exc_type is asyncio.CancelledError and this.state === _State.TIMEOUT) {
            throw new asyncio.TimeoutError
        }

        this._state = _State.EXIT
        this._wait_zone.set()
        return null

    // @property
    /**
     * Return state of the Global task.
     */
    state(): _State {
        return this._state
    }

    /**
     * Signal that all zones are done.
     */
    zones_done_signal() {
        this._wait_zone.set()
    }

    /**
     * Start timeout handler.
     */
    _start_timer() {
        if (this._timeout_handler) {
            return
        }

        this._expiration_time = this._loop.time() + this._time_left
        this._timeout_handler = this._loop.call_at(
            this._expiration_time, this._on_timeout
        )
    }

    /**
     * Stop zone timer.
     */
    _stop_timer() {
        if (!this._timeout_handler) {
            return
        }

        this._timeout_handler.cancel()
        this._timeout_handler = null
        // Calculate new timeout
        assert this._expiration_time
        this._time_left = this._expiration_time - this._loop.time()
    }

    /**
     * Process timeout.
     */
    _on_timeout() {
        this._state = _State.TIMEOUT
        this._timeout_handler = null

        // Reset timer if zones are running
        if (!this._manager.zones_done) {
            asyncio.create_task(this._on_wait())
        }
        else {
            this._cancel_task()
        }
    }

    /**
     * Cancel own task.
     */
    _cancel_task() {
        if (this._task.done() {
            return
        }
        this._task.cancel()
    }

    /**
     * Pause timers while it freeze.
     */
    pause() {
        this._stop_timer()
    }

    /**
     * Reset timer after freeze.
     */
    reset() {
        this._start_timer()
    }

    /**
     * Wait until zones are done.
     */
    async _on_wait() {
        await this._wait_zone.wait()
        await asyncio.sleep(this._cool_down)  // Allow context switch
        if (!this.state === _State.TIMEOUT) {
            return
        }
        this._cancel_task()
    }
}

/**
 * Context manager that tracks an active task for a zone.
 */
export class _ZoneTaskContext {

    /**
     * Initialize internal timeout context manager.
     */
    constructor(

        zone: _ZoneTimeoutManager,
        task: asyncio.Task[Any],
        timeout: number,
    ) {
        this._loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
        this._zone: _ZoneTimeoutManager = zone
        this._task: asyncio.Task[Any] = task
        this._state: _State = _State.INIT
        this._time_left: number = timeout
        this._expiration_time: Optional<number> = null
        this._timeout_handler: Optional<asyncio.Handle> = null
    }

    // @property
    /**
     * Return state of the Zone task.
     */
    state(): _State {
        return this._state
    }

    async def __aenter__() -> _ZoneTaskContext:
        this._zone.enter_task()
        this._state = _State.ACTIVE

        // Zone is on freeze
        if (this._zone.freezes_done) {
            this._start_timer()
        }

        return self

    async def __aexit__(

        exc_type: Type<BaseException>,
        exc_val: BaseException,
        exc_tb: TracebackType,
    ) -> Optional[bool]:
        this._zone.exit_task()
        this._stop_timer()

        // Timeout on exit
        if (exc_type is asyncio.CancelledError and this.state === _State.TIMEOUT) {
            throw new asyncio.TimeoutError
        }

        this._state = _State.EXIT
        return null

    /**
     * Start timeout handler.
     */
    _start_timer() {
        if (this._timeout_handler) {
            return
        }

        this._expiration_time = this._loop.time() + this._time_left
        this._timeout_handler = this._loop.call_at(
            this._expiration_time, this._on_timeout
        )
    }

    /**
     * Stop zone timer.
     */
    _stop_timer() {
        if (!this._timeout_handler) {
            return
        }

        this._timeout_handler.cancel()
        this._timeout_handler = null
        // Calculate new timeout
        assert this._expiration_time
        this._time_left = this._expiration_time - this._loop.time()
    }

    /**
     * Process timeout.
     */
    _on_timeout() {
        this._state = _State.TIMEOUT
        this._timeout_handler = null

        // Timeout
        if (this._task.done() {
            return
        }
        this._task.cancel()
    }

    /**
     * Pause timers while it freeze.
     */
    pause() {
        this._stop_timer()
    }

    /**
     * Reset timer after freeze.
     */
    reset() {
        this._start_timer()
    }
}

/**
 * Manage the timeouts for a zone.
 */
export class _ZoneTimeoutManager {

    /**
     * Initialize internal timeout context manager.
     */
    constructor(manager: TimeoutManager, zone: string) {
        this._manager: TimeoutManager = manager
        this._zone: string = zone
        this._tasks: _ZoneTaskContext] = [[]
        this._freezes: _ZoneFreezeContext] = [[]
    }

    /**
     * Representation of a zone.
     */
    __repr__(): string {
        return`<${this.name}: ${this._tasks.length} / ${this._freezes.length}>`
    }

    // @property
    /**
     * Return Zone name.
     */
    name(): string {
        return this._zone
    }

    // @property
    /**
     * Return true if zone is active.
     */
    active(): boolean {
        return this._tasks.length > 0 or this._freezes.length > 0
    }

    // @property
    /**
     * Return true if all freeze are done.
     */
    freezes_done(): boolean {
        return this._freezes.length === 0 and this._manager.freezes_done
    }

    /**
     * Start int new Task.
     */
    enter_task(task: _ZoneTaskContext) {
        this._tasks.append(task)
    }

    /**
     * Exit a running Task.
     */
    exit_task(task: _ZoneTaskContext) {
        this._tasks.remove(task)

        // On latest listener
        if (!this.active) {
            this._manager.drop_zone(this.name)
        }
    }

    /**
     * Start int new freeze.
     */
    enter_freeze(freeze: _ZoneFreezeContext) {
        this._freezes.append(freeze)
    }

    /**
     * Exit a running Freeze.
     */
    exit_freeze(freeze: _ZoneFreezeContext) {
        this._freezes.remove(freeze)

        // On latest listener
        if (!this.active) {
            this._manager.drop_zone(this.name)
        }
    }

    /**
     * Stop timers while it freeze.
     */
    pause() {
        if (!this.active) {
            return
        }

        // Forward pause
        for(const task of this._tasks) {
            task.pause()
        }
    }

    /**
     * Reset timer after freeze.
     */
    reset() {
        if (!this.active) {
            return
        }

        // Forward reset
        for(const task of this._tasks) {
            task.reset()
        }
    }
}

/**
 * Class to manage timeouts over different zones.

    Manages both global and zone based timeouts.

 */
export class TimeoutManager {
    private _loop: asyncio.AbstractEventLoop;
    private _zones: Dict<_ZoneTimeoutManager>;
    private _globals: _GlobalTaskContext[];
    private _freezes: _GlobalFreezeContext[];

    /**
     * Initialize TimeoutManager.
     */
    constructor() {
        this._loop = asyncio.get_running_loop()
        this._zones = {}
        this._globals = []
        this._freezes = []
    }

    // @property
    /**
     * Return true if all zones are finished.
     */
    get zones_done(): boolean {
        return !boolean(this._zones)
    }

    // @property
    /**
     * Return true if all freezes are finished.
     */
    get freezes_done(): boolean {
        return !this._freezes.length
    }

    // @property
    /**
     * Return all Zones.
     */
    get zones(): Dict<_ZoneTimeoutManager> {
        return this._zones
    }

    // @property
    /**
     * Return all global Tasks.
     */
    get global_tasks(): _GlobalTaskContext[] {
        return this._globals
    }

    // @property
    /**
     * Return all global Freezes.
     */
    get global_freezes(): _GlobalFreezeContext[] {
        return this._freezes
    }

    /**
     * Drop a zone out of scope.
     */
    drop_zone(zone_name: string) {
        this._zones.pop(zone_name, null)
        if (this._zones) {
            return
        }

        // Signal Global task, all zones are done
        for(const task of this._globals) {
            task.zones_done_signal()
        }
    }

    /**
     * Timeout based on a zone.

        For using as Async Context Manager.

     */
    async_timeout(
        timeout: number, zone_name: string = ZONE_GLOBAL, cool_down: number = 0
    ): Union[_ZoneTaskContext, _GlobalTaskContext] {
        current_task: Optional[asyncio.Task[Any]] = asyncio.current_task()
        assert current_task

        // Global Zone
        if (zone_name === ZONE_GLOBAL) {
            task = _GlobalTaskContext(current_task, timeout, cool_down)
            return task
        }

        // Zone Handling
        if (zone_name in this.zones) {
            zone: _ZoneTimeoutManager = this.zones[zone_name]
        }
        else {
            this.zones[zone_name] = zone = _ZoneTimeoutManager(zone_name)
        }

        // Create Task
        return _ZoneTaskContext(zone, current_task, timeout)
    }

    /**
     * Freeze all timer until job is done.

        For using as Async Context Manager.

     */
    async_freeze(
        zone_name: string = ZONE_GLOBAL
    ): Union[_ZoneFreezeContext, _GlobalFreezeContext] {
        // Global Freeze
        if (zone_name === ZONE_GLOBAL) {
            return _GlobalFreezeContext()
        }

        // Zone Freeze
        if (zone_name in this.zones) {
            zone: _ZoneTimeoutManager = this.zones[zone_name]
        }
        else {
            this.zones[zone_name] = zone = _ZoneTimeoutManager(zone_name)
        }

        return _ZoneFreezeContext(zone)
    }

    /**
     * Freeze all timer until job is done.

        For using as Context Manager.

     */
    freeze(
        zone_name: string = ZONE_GLOBAL
    ): Union[_ZoneFreezeContext, _GlobalFreezeContext] {
        return run_callback_threadsafe(
            this._loop, this.async_freeze, zone_name
        ).result()
    }
}
