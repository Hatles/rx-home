/**
 * Representation of a callable service.
 */
import {Callable, Dict} from "./types";
import {Context} from "./context";
import {HassJob} from "./job";
import {repr_helper} from "../utils/helpers";

export class Service {

    job: HassJob;
    schema: vol.Schema;

    /**
     * Initialize a service.
     * @param func
     * @param schema
     * @param context
     */
    constructor(
        func: Callable,
        schema?: vol.Schema,
        context: Context = null,
    ) {
        this.job = new HassJob(func);
        this.schema = schema
    }
}

    /**
     * Representation of a call to a service.
     */
export class ServiceCall {

    domain: string;
    service: string;
    data: Dict;
    context: Context;

    /**
     * Initialize a service call.
     * @param self
     * @param domain
     * @param service
     * @param data
     * @param context
     */
    constructor(
        domain: string,
        service: string,
        data: Dict = null,
        context: Context = null,
    ) {
        this.domain = domain.toLowerCase();
        this.service = service.toLowerCase();
        this.data = MappingProxyType(data || {});
        this.context = context || new Context();
    }

    /**
     * Return the representation of the service.
     * @private
     */
    __repr__(): string {
        if (this.data) {
            return `<ServiceCall ${this.domain}.${this.service} (c:${this.context.id}): ${repr_helper(this.data)}>`;
        }

        return `<ServiceCall ${this.domain}.${this.service} (c:${this.context.id})>`;
    }
}
