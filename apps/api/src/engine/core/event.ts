/**
 * Represent the origin of an event.
 */
import {Dict, Optional} from "./types";
import {Context} from "./context";
import {Clock} from "../utils/clock";
import {repr_helper} from "../utils/helpers";

export enum EventOrigin {
    local = "LOCAL",
    remote = "REMOTE"

    // def __str__(): str:  // pylint: disable=invalid-str-returned
    // """Return the event."""
    // return this.value  // type: ignore
}

/**
 *     """Representation of an event within the bus."""
 */
export class Event {

    event_type: string;
    data: Optional<Dict> ;
    origin: EventOrigin;
    time_fired: Optional<Date>;
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
        data: Optional<Dict> = null,
        origin: EventOrigin = EventOrigin.local,
        time_fired: Optional<Date> = null,
        context: Optional<Context> = null
    ) {
        this.event_type = event_type;
        this.data = data || {};
        this.origin = origin;
        this.time_fired = time_fired || Clock.now();
        this.context = context || new Context();
    }

    private __hash__(): number
    {
        // The only event type that shares context are the TIME_CHANGED
        return hash((this.event_type, this.context.id, this.time_fired));
    }

    /**
     * Create a dict representation of this Event.

     Async friendly.
     */
    as_dict(): Dict {
        return {
            "event_type": this.event_type,
            "data": dict(this.data),
            "origin": this.origin.toString(),
            "time_fired": this.time_fired.toISOString(),
            "context": this.context.as_dict(),
        };
    }


    /**
     * """Return the representation."""
     * @private
     */
    private __repr__(): string {
        // pylint: disable=maybe-no-member
        if (this.data){
            return `<Event ${this.event_type}[${this.origin.toString()[0]}]: ${repr_helper(this.data)}>`
        }

        return `<Event ${this.event_type}[${this.origin.toString()[0]}]>`
    }

    /**
     * """Return the comparison."""
     * @param other
     * @private
     */
    private __eq__(other: any): boolean
    {
        return (
            other instanceof Event
            && this.event_type == other.event_type
            && this.data == other.data
            && this.origin == other.origin
            && this.time_fired == other.time_fired
            && this.context == other.context
        );
    }
}
