/**
 * Object to represent a state within the state machine.

 entity_id: the entity that is represented.
 state: the state of the entity
 attributes: extra information on entity and state
 last_changed: last time the state was changed, not the attributes.
 last_updated: last time this object was updated.
 context: Context in which it was created
 domain: Domain of this state.
 object_id: Object id of this state.
 */
import {Dict, Optional} from "./types";
import {Context} from "./context";
import {split_entity_id, valid_entity_id, valid_state} from "./utils";
import {Clock} from "../utils/clock";
import {repr_helper} from "../utils/helpers";
import {InvalidEntityFormatError, InvalidStateError} from "../exceptions";

export class State {

    entity_id: string;
    state: string;
    attributes: Mapping;
    last_changed: Date;
    last_updated: Date;
    context: Context;
    domain: string;
    object_id: string;
    _as_dict: Optional<Dict<Collection<any>>>;

    //
   /**
    * Initialize a new state.
    */
     constructor (
        entity_id: string,
        state: string,
        attributes: Optional<Mapping> = null,
        last_changed: Optional<Date> = null,
        last_updated: Optional<Date> = null,
        context: Optional<Context> = null,
        validate_entity_id: Optional<boolean> = true
    ) {
        state = state.toString();

        if (validate_entity_id && !valid_entity_id(entity_id)) {
            throw new InvalidEntityFormatError(
                `Invalid entity id encountered: ${entity_id}. Format should be <domain>.<object_id>`
            )
        }


        if (!valid_state(state))
            throw new  InvalidStateError(
                `Invalid state encountered for entity ID: ${entity_id}. State max length is 255 characters.`
            )

        this.entity_id = entity_id.toLowerCase()
        this.state = state
        this.attributes = MappingProxyType(attributes || {})
        this.last_updated = last_updated || Clock.now()
        this.last_changed = last_changed || this.last_updated
        this.context = context || new Context()
        const domainAndObjectId = split_entity_id(this.entity_id);
        this.domain = domainAndObjectId[0];
        this.object_id = domainAndObjectId[1];
        this._as_dict = null;
    }

    //@property
   /**
    * Name of this state.
    */
     name (): string {
        return this.attributes.get(ATTR_FRIENDLY_NAME) || this.object_id.replace("_", " ")
    }

    //
   /**
    * Return a dict representation of the State.

        Async friendly.

        To be used for JSON serialization.
        Ensures: state == State.from_dict(state.as_dict())

    */
     as_dict (): Dict {
        if (!this._as_dict)
        {
            const last_changed_isoformat: string = this.last_changed.toISOString()
            let last_updated_isoformat: string;
            if (this.last_changed == this.last_updated)
            {
                last_updated_isoformat = last_changed_isoformat
            }
            else
            {
                last_updated_isoformat = this.last_updated.isoformat()
            }

            this._as_dict = {
                "entity_id": this.entity_id,
                "state": this.state,
                "attributes": dict(this.attributes),
                "last_changed": last_changed_isoformat,
                "last_updated": last_updated_isoformat,
                "context": this.context.as_dict(),
            }
        }
        return this._as_dict
    }

    //@classmethod
   /**
    * Initialize a state from a dict.

        Async friendly.

        Ensures: state == State.from_json_dict(state.to_json_dict())

    */
     from_dict (cls, json_dict: Dict): any {
        if (!(json_dict && json_dict["entity_id"] && json_dict["entity_id"])) {
           return null
        }

        let last_changed = json_dict["last_changed"]

        if (typeof last_changed === 'string') {
           last_changed = dt_util.parse_datetime(last_changed)
        }

        let last_updated = json_dict["last_updated"]

        if (typeof last_updated === 'string') {
            last_updated = dt_util.parse_datetime(last_updated)
        }

        let context = json_dict["context"]
        if (context) {
            context = new Context(context.get("user_id"), null, context.get("id"))
        }

        return cls(
            json_dict["entity_id"],
            json_dict["state"],
            json_dict.get("attributes"),
            last_changed,
            last_updated,
            context,
        )
    }

    //
   /**
    * Return the comparison of the state.
    */
     __eq__ (other: any): boolean {
        return (  // type: ignore
            other instanceof State
            && this.entity_id == other.entity_id
            && this.state == other.state
            && this.attributes == other.attributes
            && this.context == other.context
        )
    }

    //
   /**
    * Return the representation of the states.
    */
 __repr__ (): string {
    const attrs = `; ${repr_helper(this.attributes)}" if this.attributes else "`

    return (
        `<state ${this.entity_id}=${this.state}${attrs}" @ ${dt_util.as_local(this.last_changed).toISOString()}>`
    )
   }
}
