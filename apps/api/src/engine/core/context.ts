// @attr.s(slots=True, frozen=True)

let uid = 0;

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
        this.id = id || (uid++).toString(); // attr.ib(factory=uuid_util.random_uuid_hex)
    }

    /**
     * Return a dictionary representation of the context.
     */
    as_dict(): object{
        return {"id": this.id, "parent_id": this.parent_id, "user_id": this.user_id}
    }
}
