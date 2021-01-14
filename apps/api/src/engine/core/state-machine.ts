/**
 * """Helper class that tracks the state of different entities."""
 */
import {Dict, Optional} from "./types";
import {Context} from "./context";
import {EventBus} from "./event-bus";
import {State} from "./state";
import {run_callback_threadsafe} from "../utils/async";
import {EventOrigin} from "./event";
import {HomeAssistantError} from "../exceptions";
import {Clock} from "../utils/clock";

export class StateMachine {

    private _states: Map<string, State>;
    private _reservations: Set<string>;
    private _bus: EventBus;
    private _loop: asyncio.events.AbstractEventLoop;

   /**
    * Initialize state machine.
    */
     constructor (bus: EventBus, loop: asyncio.events.AbstractEventLoop): void {
        this._states = new Map<string, State>()
        this._reservations = set()
        this._bus = bus
        this._loop = loop
    }

   /**
    * List of entity ids that are being tracked.
    */
     entity_ids (domain_filter: Optional<string> = null): string[] {
        const future = run_callback_threadsafe(this._loop, this.async_entity_ids, domain_filter)
        return future.result()
    }

    //@callback
   /**
    * List of entity ids that are being tracked.

        This method must be run in the event loop.

    */
     async_entity_ids (domain_filter?: string | string[] = null): string[] {
        if (!domain_filter) {
            return [...this._states.values()].map(state => state.entity_id);
        }

        if (typeof domain_filter === 'string') {
            domain_filter = domain_filter.toLowerCase();

            return [...this._states.values()]
                .filter(state => state.domain === domain_filter)
                .map(state => state.entity_id);
        }
        else {
            domain_filter = domain_filter.map(domain => domain.toLowerCase());

            return [...this._states.values()]
                .filter(state => domain_filter.includes(state.domain))
                .map(state => state.entity_id);
        }
    }

    //@callback
   /**
    * Count the entity ids that are being tracked.

        This method must be run in the event loop.

    */
     async_entity_ids_count (
        domain_filter?: string | string[] = null
    ): number {
       if (!domain_filter) {
           return this._states.size;
       }

       if (typeof domain_filter === 'string') {
           domain_filter = domain_filter.toLowerCase();

           return [...this._states.values()]
               .filter(state => state.domain === domain_filter)
               .length;
       }
       else {
           domain_filter = domain_filter.map(domain => domain.toLowerCase());

           return [...this._states.values()]
               .filter(state => domain_filter.includes(state.domain))
               .length;
       }
    }

   /**
    * Create a list of all states.
    */
     all (domain_filter?: string | string[] = null): State[] {
        return run_callback_threadsafe(this._loop, this.async_all, domain_filter).result();
    }

   /**
    * Create a list of all states matching the filter.

        This method must be run in the event loop.

    */
     async_all (domain_filter?: string | string[] = null): State[] {
        if (domain_filter)
        {
           return [...this._states.values()];
        }

        if (typeof domain_filter === 'string') {
            domain_filter = domain_filter.toLowerCase();

            return [...this._states.values()]
               .filter(state => state.domain === domain_filter);
        }
        else {
            domain_filter = domain_filter.map(domain => domain.toLowerCase());

            return [...this._states.values()]
                .filter(state => domain_filter.includes(state.domain));
        }
    }

   /**
    * Retrieve state of entity_id or null if not found.

        Async friendly.

    */
     get (entity_id: string): State {
        return this._states.get(entity_id.toLowerCase())
    }

   /**
    * Test if entity exists and is in specified state.

        Async friendly.

    */
     is_state (entity_id: string, state: string): boolean {
        const state_obj = this.get(entity_id)
        return state_obj && state_obj.state == state;
    }

   /**
    * Remove the state of an entity.

        Returns boolean to indicate if an entity was removed.

    */
     remove (entity_id: string): boolean {
        return run_callback_threadsafe(this._loop, this.async_remove, entity_id).result()
     }

    //@callback
   /**
    * Remove the state of an entity.

        Returns boolean to indicate if an entity was removed.

        This method must be run in the event loop.

    */
     async_remove (entity_id: string, context?: Context = null): boolean {
        entity_id = entity_id.toLowerCase()
        let old_state = null;

        if (this._states.has(entity_id)) {
            old_state = this._states.get(entity_id);
            this._states.delete(entity_id);
        }

        if (entity_id in this._reservations) {
            this._reservations.delete(entity_id)
        }

        if (!old_state) {
            return false;
        }

        this._bus.async_fire(
            EVENT_STATE_CHANGED,
            {"entity_id": entity_id, "old_state": old_state, "new_state": void},
            EventOrigin.local,
            context=context,
        )

        return true;
    }

   /**
    * Set the state of an entity, add entity if it does not exist.

        Attributes is an optional dict to specify attributes of this state.

        If you just update the attributes and not the state, last changed will
        not be affected.

    */
     set (
        entity_id: string,
        new_state: string,
        attributes: Optional<Dict> = null,
        force_update: boolean = false,
        context: Optional<Context> = null,
    ): void {
        run_callback_threadsafe(
            this._loop,
            this.async_set,
            entity_id,
            new_state,
            attributes,
            force_update,
            context,
        ).result()
    }

    //@callback
   /**
    * Reserve a state in the state machine for an entity being added.

        This must not fire an event when the state is reserved.

        This avoids a race condition where multiple entities with the same
        entity_id are added.
    */
     async_reserve (entity_id: string): void {
        entity_id = entity_id.toLowerCase()
        if (this._states.hasOwnProperty(entity_id) || this._reservations.has(entity_id))
        {
           throw new HomeAssistantError("async_reserve must not be called once the state is in the state machine.")
        }

        this._reservations.add(entity_id)
    }

    //@callback
   /**
    * Check to see if an entity_id is available to be used.
    */
     async_available (entity_id: string): boolean {
        entity_id = entity_id.toLowerCase()
        return (!this._states.has(entity_id) && !this._reservations.has(entity_id))
     }

    //@callback
   /**
    * Set the state of an entity, add entity if it does not exist.

        Attributes is an optional dict to specify attributes of this state.

        If you just update the attributes and not the state, last changed will
        not be affected.

        This method must be run in the event loop.

    */
     async_set (
        entity_id: string,
        new_state: string,
        attributes: Optional<Dict> = null,
        force_update: boolean = false,
        context: Optional<Context> = null,
    ) {
        entity_id = entity_id.toLowerCase()
        new_state = new_state.toString()
        attributes = attributes || {};
        const old_state = this._states.get(entity_id)

        let same_state: boolean;
        let same_attr: boolean;
        let last_changed: Optional<Date>;

        if (!old_state) {
            same_state = false
            same_attr = false
            last_changed = null
        }
        else {
            same_state = old_state.state === new_state && !force_update
            same_attr = old_state.attributes === MappingProxyType(attributes)
            last_changed = same_state ? old_state.last_changed : null
        }

        if (same_state && same_attr) {
            return
        }

        if (!context) {
            context = new Context()
        }

        const now = Clock.now()

        const state = new State(
            entity_id,
            new_state,
            attributes,
            last_changed,
            now,
            context,
            !!old_state
        );

        this._states[entity_id] = state
        this._bus.async_fire(
            EVENT_STATE_CHANGED,
            {"entity_id": entity_id, "old_state": old_state, "new_state": state},
            EventOrigin.local,
            context,
            time_fired=now,
        )
    }
}
