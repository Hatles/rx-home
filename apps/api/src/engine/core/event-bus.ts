/**
 * Allow the firing of and listening for events.
 */
import {Callable, CALLBACK_TYPE, Dict, Optional} from "./types";
import {Context} from "./context";
import {EventOrigin} from "./event";
import {HomeAssistant} from "./core";
import {HassJob} from "./job";
import {run_callback_threadsafe} from "../utils/async";
import {ValueError} from "../exceptions";
import {_LOGGER} from "./constants";
import {Event} from "./event";

export class EventBus {

    private _listeners: Map<string, HassJob[]>;
    private _hass: HomeAssistant;

   /**
    * Initialize a new event bus.
    */
     constructor(hass: HomeAssistant): null {
       this._listeners = new Map<string, HassJob[]>()
       this._hass = hass
   }

    // @callback
    /**
     * Return dictionary with events and the number of listeners.

     This method must be run in the event loop.
     */
    async_listeners(): Dict<number> {
        return {key: len(this._listeners<key>) for key in this._listeners}
    }

    // @property
    /**
     * Return dictionary with events and the number of listeners.
     */
    listeners(): Dict<number> {
        return run_callback_threadsafe(this._hass.loop, this.async_listeners).result()
    }

   /**
    * Fire an event.
    */
     fire(
        self,
        event_type: string,
        event_data: Optional<Dict> = null,
        origin: EventOrigin = EventOrigin.local,
        context: Optional<Context> = null,
    ) {
        this._hass.loop.call_soon_threadsafe(this.async_fire, event_type, event_data, origin, context)
    }

    //@callback
   /**
    * Fire an event.

        This method must be run in the event loop.

    */
     async_fire(
        event_type: string,
        event_data: Optional<Dict> = null,
        origin: EventOrigin = EventOrigin.local,
        context: Optional<Context> = null,
        time_fired: Optional<Date> = null,
    ): null {
        let listeners: HassJob[] = this._listeners.get(event_type) || []

        // EVENT_HOMEASSISTANT_CLOSE should go only to his listeners
        const match_all_listeners = this._listeners.get(MATCH_ALL)
        if (match_all_listeners && event_type != EVENT_HOMEASSISTANT_CLOSE) {
           listeners = [...match_all_listeners, ...listeners];
       }

        const event = new Event(event_type, event_data, origin, time_fired, context)

        if (event_type != EVENT_TIME_CHANGED) {
            _LOGGER.debug("Bus:Handling %s", event)
        }

        if (!listeners)
            return

       listeners.forEach(job => this._hass.async_add_hass_job(job, event));
    }

   /**
    * Listen for all events or events of a specific type.

        To listen to all events specify the constant ``MATCH_ALL``
        as event_type.

    */
     listen(event_type: string, listener: Callable): CALLBACK_TYPE {
        const async_remove_listener = run_callback_threadsafe(
            this._hass.loop, this.async_listen, event_type, listener
        ).result()

        /**
        * Remove the listener.
        */
         const remove_listener = () => {
            run_callback_threadsafe(this._hass.loop, async_remove_listener).result()
         }

        return remove_listener
    }

    //@callback
   /**
    * Listen for all events or events of a specific type.

        To listen to all events specify the constant ``MATCH_ALL``
        as event_type.

        This method must be run in the event loop.

    */
   async_listen(event_type: string, listener: Callable): CALLBACK_TYPE {
       return this._async_listen_job(event_type, new HassJob(listener))
   }

    //@callback
   private _async_listen_job(event_type: string, hassjob: HassJob): CALLBACK_TYPE {
      this._listeners.setdefault(event_type, []).append(hassjob)

       /**
        * Remove the listener.
        */
       const remove_listener = () => {
           this._async_remove_listener(event_type, hassjob)
       }

       return remove_listener
   }

    //
   /**
    * Listen once for event of a specific type.

        To listen to all events specify the constant ``MATCH_ALL``
        as event_type.

        Returns function to unsubscribe the listener.

    */
   listen_once(event_type: string, listener: Callable): CALLBACK_TYPE {
        const async_remove_listener = run_callback_threadsafe(
            this._hass.loop, this.async_listen_once, event_type, listener
        ).result()

        /**
        * Remove the listener.
        */

        const remove_listener = () => {
            run_callback_threadsafe(this._hass.loop, async_remove_listener).result()

            return remove_listener

        }
   }

    //@callback
   /**
    * Listen once for event of a specific type.

        To listen to all events specify the constant ``MATCH_ALL``
        as event_type.

        Returns registered listener that can be used with remove_listener.

        This method must be run in the event loop.

    */
     async_listen_once(event_type: string, listener: Callable): CALLBACK_TYPE {
       let job: Optional<HassJob> = null;

       //@callback
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

           // assert job is not null

           if (!job) {
               throw new ValueError('job must not be null')
           }

           this._async_remove_listener(event_type, job)
           this._hass.async_run_job(listener, event)
       }

       job = new HassJob(_onetime_listener)

       return this._async_listen_job(event_type, job)
   }

    //@callback
   /**
    * Remove a listener of a specific event_type.

        This method must be run in the event loop.

    */
     private _async_remove_listener(event_type: string, hassjob: HassJob): null {
        try {
            this._listeners[event_type].remove(hassjob)

            // delete event_type list if empty
            if (!this._listeners[event_type]) {
                this._listeners.delete(event_type)
            }
        }
        catch (e) {
            if (e instanceof ValueError || e instanceof KeyError) {
                // KeyError is key event_type listener did not exist
                // ValueError if listener did not exist within event_type
                _LOGGER.exception("Unable to remove unknown job listener %s", hassjob)
            }
            else {
                throw e;
            }
        }
    }
}
