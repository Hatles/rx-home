import {Callable, Dict, Optional} from "../types";
import {EVENT_HOMEASSISTANT_CLOSE, EVENT_TIME_CHANGED, MATCH_ALL} from "../const";
import {hasattr, setattr} from "../util/ts/attr";
import {HomeAssistant} from "./core";
import {HassJob} from "./job";
import {EventOrigin, HassEvent} from "./event";
import {_LOGGER, CALLBACK_TYPE} from "./constants";
import {Context} from "./context";
import {assert} from "../util/ts/assert";

/**
 * Allow the firing of and listening for events.
 */
export class EventBus {

    private _listeners: Map<string, Set<HassJob>>;
    private _hass: HomeAssistant;

    /**
     * Initialize a new event bus.
     */
    constructor(hass: HomeAssistant) {
        this._listeners = new Map<string, Set<HassJob>>()
        this._hass = hass
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
        event_data: Optional<T> = null,
        origin: EventOrigin = EventOrigin.local,
        context: Optional<Context> = null,
        time_fired: Optional<Date> = null,
    ) {
        let listeners = [...(this._listeners.get(event_type) || [])]

        // EVENT_HOMEASSISTANT_CLOSE should go only to his listeners
        const match_all_listeners = this._listeners.get(MATCH_ALL)
        if (match_all_listeners && event_type !== EVENT_HOMEASSISTANT_CLOSE) {
            listeners = [...match_all_listeners, ...listeners]
        }

        const event = new HassEvent<T>(event_type, event_data, origin, time_fired, context)

        if (event_type !== EVENT_TIME_CHANGED) {
            _LOGGER.debug("Bus:Handling %s", event)
        }

        if (!listeners && !listeners.length) {
            return
        }

        for(const job of listeners) {
            this._hass.add_hass_job(job, event)
        }
    }

    // @callback
    /**
     * Listen for all events or events of a specific type.

     To listen to all events specify the constant ``MATCH_ALL``
     as event_type.

     This method must be run in the event loop.

     */
    listen<T = any>(event_type: string, listener: (event: HassEvent<T>) => void): () => void {
        return this._listen_job(event_type, new HassJob(listener))
    }

        // @callback
    _listen_job(event_type: string, hassjob: HassJob): CALLBACK_TYPE {
        if(!this._listeners.has(event_type)) {
            this._listeners.set(event_type, new Set<HassJob>())
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
    listen_once(event_type: string, listener: Callable): CALLBACK_TYPE {
        let job: Optional<HassJob> = null

        // @callback
        /**
         * Remove listener from event bus and then fire listener.
         */
        const _onetime_listener = (event: Event) => {
            // nonlocal job
            if (hasattr(_onetime_listener, "run")) {
                return
            }
            // Set variable so that we will never run twice.
            // Because the event bus loop might have async_fire queued multiple
            // times, its possible this listener may already be lined up
            // multiple times as well.
            // This will make sure the second time it does nothing.
            setattr(_onetime_listener, "run", true)
            assert(job)
            this._remove_listener(event_type, job)
            this._hass.run_job(listener, event)
        }

        job = new HassJob(_onetime_listener)

        return this._listen_job(event_type, job)
    }

    // @callback
    /**
     * Remove a listener of a specific event_type.

     This method must be run in the event loop.

     */
    _remove_listener(event_type: string, hassjob: HassJob) {
        if(this._listeners.has(event_type) && this._listeners.get(event_type).has(hassjob)) {
            this._listeners.get(event_type).delete(hassjob)

            // delete event_type list if empty
            if (!this._listeners[event_type]) {
                this._listeners.delete(event_type)
            }
        }
        else {
            _LOGGER.exception("Unable to remove unknown job listener %s", hassjob)
        }
    }
}
