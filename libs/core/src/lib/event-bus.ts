import {Context} from "./context";
import {Clock} from "./utils/clock";
import {EVENT_RX_HOME_CLOSE, RxHomeCore} from "./core";
import {RxHomeJob} from "./job";
import {Callable, Callback, Dict} from "./utils/types";

export const MATCH_ALL = "*"

export enum EventOrigin {
    local = "LOCAL",
    remote = "REMOTE"
}

/**
 * Representation of an event within the bus.
 */
export class RxHomeEvent<T = any> {

    event_type: string;
    data?: T;
    origin: EventOrigin;
    time_fired: Date;
    context: Context

    /**
     * """Initialize a new event."""
     * @param event_type
     * @param data
     * @param origin
     * @param time_fired
     * @param context
     */
    constructor(
        event_type: string,
        data: T = null,
        origin: EventOrigin = EventOrigin.local,
        time_fired: Date = null,
        context: Context = null
    ) {
        this.event_type = event_type;
        this.data = data;
        this.origin = origin;
        this.time_fired = time_fired || Clock.now();
        this.context = context || new Context();
    }

    /**
     * """Return the representation."""
     * @private
     */
    public toString(): string {
        // pylint: disable=maybe-no-member
        if (this.data){
            return `<Event ${this.event_type}[${this.origin.toString()[0]}]: ${this.data}>`
        }

        return `<Event ${this.event_type}[${this.origin.toString()[0]}]>`
    }



    /**
     * """Return the comparison."""
     * @param other
     */
    public equals(other: any): boolean
    {
        return (
            other instanceof RxHomeEvent
            && this.event_type == other.event_type
            && this.data == other.data
            && this.origin == other.origin
            && this.time_fired == other.time_fired
            && this.context == other.context
        );
    }
}


/**
 * Allow the firing of and listening for events.
 */
export class EventBus {

    private _listeners: Map<string, Set<RxHomeJob>>;
    private _core: RxHomeCore;

    /**
     * Initialize a new event bus.
     */
    constructor(_core: RxHomeCore) {
        this._listeners = new Map<string, Set<RxHomeJob>>()
        this._core = _core
    }

    // @callback
    /**
     * Return dictionary with events and the number of listeners.

     This method must be run in the event loop.

     */
    listeners(): Dict<number> {
        const listeners: Dict<number> = {};
        for (let [key, value] of this._listeners.entries()) {
            listeners[key] = value.size;
        }
        return listeners;
    }

    // @callback
    /**
     * Fire an event.

     This method must be run in the event loop.

     */
    fire<T = any>(
        event_type: string,
        event_data: T = null,
        origin: EventOrigin = EventOrigin.local,
        context: Context = null,
        time_fired: Date = null,
    ) {
        let listeners = [...(this._listeners.get(event_type) || [])]

        // EVENT_RX_HOME_CLOSE should go only to his listeners
        const match_all_listeners = this._listeners.get(MATCH_ALL)
        if (match_all_listeners && event_type !== EVENT_RX_HOME_CLOSE) {
            listeners = [...match_all_listeners, ...listeners]
        }

        const event = new RxHomeEvent<T>(event_type, event_data, origin, time_fired, context)

        // if (event_type !== EVENT_TIME_CHANGED) {
        //     this._core._logger.debug("Bus:Handling %s", event)
        // }

        if (!listeners && !listeners.length) {
            return
        }

        for(const job of listeners) {
            this._core.addRxHomeJob(job, event)
        }
    }

    // @callback
    /**
     * Listen for all events or events of a specific type.

     To listen to all events specify the constant ``MATCH_ALL``
     as event_type.

     This method must be run in the event loop.

     */
    listen<T = any>(event_type: string, listener: (event: RxHomeEvent<T>) => void): Callback {
        return this._listen_job(event_type, new RxHomeJob(listener))
    }

        // @callback
    _listen_job(event_type: string, hassjob: RxHomeJob): Callback {
        if(!this._listeners.has(event_type)) {
            this._listeners.set(event_type, new Set<RxHomeJob>())
        }
        this._listeners.get(event_type).add(hassjob)

        /**
         * Remove the listener.
         */
        const remove_listener = () => {
            this._remove_listener(event_type, hassjob)
        }

        return remove_listener
    }

    // @callback
    /**
     * Listen once for event of a specific type.

     To listen to all events specify the constant ``MATCH_ALL``
     as event_type.

     Returns registered listener that can be used with remove_listener.

     This method must be run in the event loop.

     */
    listen_once(event_type: string, listener: Callable): Callback {
        let job: RxHomeJob = null

        // @callback
        /**
         * Remove listener from event bus and then fire listener.
         */
        const _onetime_listener = (event: Event) => {
            // Set variable so that we will never run twice.
            // Because the event bus loop might have async_fire queued multiple
            // times, its possible this listener may already be lined up
            // multiple times as well.
            // This will make sure the second time it does nothing.
            this._remove_listener(event_type, job)
            this._core.addJob(listener, event)
        }

        job = new RxHomeJob(_onetime_listener)

        return this._listen_job(event_type, job)
    }

    // @callback
    /**
     * Remove a listener of a specific event_type.

     This method must be run in the event loop.

     */
    _remove_listener(event_type: string, hassjob: RxHomeJob) {
        if(this._listeners.has(event_type) && this._listeners.get(event_type).has(hassjob)) {
            this._listeners.get(event_type).delete(hassjob)

            // delete event_type list if empty
            if (!this._listeners[event_type]) {
                this._listeners.delete(event_type)
            }
        }
        else {
            this._core._logger.exception("Unable to remove unknown job listener %s", hassjob)
        }
    }
}
