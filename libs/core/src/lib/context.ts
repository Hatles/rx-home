
// @attr.s(slots=true, frozen=true)

import {random_uuid_hex} from "./utils/uuid";

/**
 * The context that triggered something.
 */
export class Context {

    user_id?: string;
    parent_id?: string;
    id: string;

    constructor(user_id?: string, parent_id?: string, id?: string) {
        this.user_id = user_id; // attr.ib(default=None)
        this.parent_id = parent_id; // attr.ib(default=None)
        this.id = id || random_uuid_hex(); // attr.ib(factory=uuid_util.random_uuid_hex)
    }
}
