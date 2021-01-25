import {boolean, string} from "../helpers/config_validation";
import {Dict, Optional} from "../types";
import {Mapping} from "@angular/compiler-cli/src/ngtsc/sourcemaps/src/source_file";
import {InvalidEntityFormatError, InvalidStateError} from "../exceptions";
import {ATTR_FRIENDLY_NAME} from "../const";
import {split_entity_id, valid_entity_id, valid_state} from "@rx-home/core";
import {Context} from "./context";
import {Clock} from "../util/ts/clock";
import {as_local, parse_datetime} from "../util/dt";
import {repr_helper} from "../util/__init__";

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
export class State {

    entity_id: string;
    state: string;
    attributes: Map<string, any>;
    last_changed: Date;
    last_updated: Date;
    context: Context;
    domain: string;
    object_id: string;
    _as_dict: Optional<Dict>;

    //
    /**
     * Initialize a new state.
     */
    constructor (
        entity_id: string,
        state: string,
        attributes: Optional<Dict> = null,
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
        this.attributes = new Map(Object.entries(attributes || {}))
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
                last_updated_isoformat = this.last_updated.toISOString()
            }

            this._as_dict = {
                "entity_id": this.entity_id,
                "state": this.state,
                "attributes": [...this.attributes.entries()].reduce((obj, [key, value]) => (obj[key] = value, obj), {}),
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
            last_changed = parse_datetime(last_changed)
        }

        let last_updated = json_dict["last_updated"]

        if (typeof last_updated === 'string') {
            last_updated = parse_datetime(last_updated)
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
    public equals (other: any): boolean {
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
    public toString (): string {
        const attrs = `; ${repr_helper(this.attributes)}" if this.attributes else "`

        return (
            `<state ${this.entity_id}=${this.state}${attrs}" @ ${as_local(this.last_changed).toISOString()}>`
        )
    }
}
