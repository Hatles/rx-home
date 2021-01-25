import {EVENT_CALL_SERVICE, EVENT_SERVICE_REGISTERED, EVENT_SERVICE_REMOVED} from "../const";
import {_LOGGER, SERVICE_CALL_LIMIT} from "./constants";
import {Service, ServiceCall} from "./service";
import {Callable, Coroutine, Dict, Optional} from "../types";
import {HassJobType} from "./job";
import {ServiceNotFound, Unauthorized} from "../exceptions";
import {HomeAssistant} from "@rx-home/core";
import {Context} from "./context";
import {EventOrigin} from "./event";
import {asyncWithTimeout} from "../util/ts/async";
import * as Joi from "joi";

/**
 * Offer the services over the eventbus.
 */
export class ServiceRegistry {

    private _services: Map<string , Map<string, Service>>;
    private _hass: HomeAssistant;
    /**
     * Initialize a service registry.
     */
    constructor(hass: HomeAssistant) {
        this._services = new Map<string, Map<string, Service>>()
        this._hass = hass;
    }

    //callback
    /**
     * Return dictionary with per domain a list of available services.
     This method must be run in the event loop.
     */
    services(): Dict<Dict<Service>> {
        return Object.keys(this._services).reduce((services, domain) => ({...services, [domain]: {...this._services[domain]}}), {});
    }

    /**
     * Test if specified service exists.
     Async friendly.
     */
    has_service (domain: string, service: string): boolean {
        return !!(this._services[domain.toLowerCase()] || {})[service.toLowerCase()]
    }

    //@callback
    /**
     *
     Register a service.

     Schema is called to coerce and validate the service data.

     This method must be run in the event loop.

     */
    register (
        domain: string,
        service: string,
        service_func: Callable,
        schema: Optional<Joi.Schema> = null,
    ): void {

        domain = domain.toLowerCase()
        service = service.toLowerCase()
        const service_obj = new Service(service_func, schema);

        if (this._services[domain])
        {
            this._services[domain][service] = service_obj
        }
        else
        {
            this._services[domain] = {service: service_obj}
        }

        this._hass.bus.fire(EVENT_SERVICE_REGISTERED, {ATTR_DOMAIN: domain, ATTR_SERVICE: service})
    }

    //@callback
    /**
     * Remove a registered service from service handler.

     This method must be run in the event loop.

     */
    remove (domain: string, service: string): void {
        domain = domain.toLowerCase()
        service = service.toLowerCase()

        if (!((this._services[domain] || {})[service]))
        {
            _LOGGER.warning("Unable to remove unknown service %s/%s", domain, service)
            return;
        }

        this._services.get(domain).delete(service);

        if (!this._services.size) {
            this._services.delete(domain)
        }

        this._hass.bus.fire(EVENT_SERVICE_REMOVED, {ATTR_DOMAIN: domain, ATTR_SERVICE: service})
    }

    //
    /**
     *
     Call a service.

     Specify blocking=True to wait until service is executed.
     Waits a maximum of limit, which may be null for no timeout.

     If blocking = True, will return boolean if service executed
     successfully within limit.

     This method will fire an event to indicate the service has been called.

     Because the service is sent as an event you are not allowed to use
     the keys ATTR_DOMAIN and ATTR_SERVICE in your service_data.

     This method is a coroutine.

     */
    async call (
        domain: string,
        service: string,
        service_data: Optional<Dict> = null,
        blocking: boolean = false,
        context: Optional<Context> = null,
        limit: Optional<number> = SERVICE_CALL_LIMIT,
    ): Promise<Optional<boolean>> {
        domain = domain.toLowerCase();
        service = service.toLowerCase();
        context = context || new Context();
        service_data = service_data || {};

        if (!this._services[domain] || !this._services[domain][service]) {
            throw new ServiceNotFound(domain, service);
        }

        const handler = this._services[domain][service];

        let processed_data: Dict;
        if (handler.schema) {
            try {
                processed_data = handler.schema(service_data)
            } catch {
                _LOGGER.debug(
                    "Invalid data for service call %s.%s: %s",
                    domain,
                    service,
                    service_data,
                )

            }
        }
        else {
            processed_data = service_data;
        }

        const service_call = new ServiceCall(domain, service, processed_data, context)

        this._hass.bus.fire(
            EVENT_CALL_SERVICE,
            {
                ATTR_DOMAIN: domain.toLowerCase(),
                ATTR_SERVICE: service.toLowerCase(),
                ATTR_SERVICE_DATA: service_data,
            },
            EventOrigin.local,
            context,
        )

        const coro = this._execute_service(handler, service_call)
        if (!blocking) {
            this._run_service_in_background(coro, service_call)
            return null
        }

        const task = this._hass.create_task(coro)
        try
        {
            await asyncWithTimeout(() => task, limit);
        }
        // catch (error: asyncio.CancelledError)
        catch (e)
        {
            // Task calling us was cancelled, so cancel service call task, and wait for
            // it to be cancelled, within reason, before leaving.
            _LOGGER.debug("Service call was cancelled: %s", service_call)
            // task.cancel()
            // await asyncWithTimeout(() => task, SERVICE_CALL_LIMIT)
            throw e;
        }

        if (task.isRejected()) {// Service call task was cancelled some other way, such as during shutdown.
            _LOGGER.debug("Service was cancelled: %s", service_call)
            throw asyncio.CancelledError;
        }
        if (task.isFulfilled()) {// Propagate any exceptions that might have happened during service call.
            // task.result()
            // Service call completed successfully!
            return true
        }
        // Service call task did not complete before timeout expired.
        // Let it keep running in background.
        this._run_service_in_background(task, service_call)
        _LOGGER.debug("Service did not complete before timeout: %s", service_call)
        return false;
    }

    //
    /**
     * Run service call in background, catching and logging any exceptions.
     */
    private _run_service_in_background (
        coro_or_task: Coroutine | asyncio.Task, service_call: ServiceCall
    ): void {
        const catch_exceptions = async () => {
            try {
                await coro_or_task
            }
            catch (e) {
                if(e instanceof Unauthorized) {
                    _LOGGER.warning(
                        "Unauthorized service called %s/%s",
                        service_call.domain,
                        service_call.service,
                    )
                } else if(e instanceof asyncio.CancelledError) {
                    _LOGGER.debug("Service was cancelled: %s", service_call)
                } else {
                    _LOGGER.exception("Error executing service: %s", service_call)
                }
            }
        }

        this._hass.create_task(catch_exceptions())
    }

    //
    /**
     * Execute a service.
     */
    async _execute_service (handler: Service, service_call: ServiceCall): Promise<any> {
        if (handler.job.job_type == HassJobType.Coroutinefunction)
        {
            await handler.job.target(service_call)
        }
        else if (handler.job.job_type == HassJobType.Callback)
        {
            handler.job.target(service_call)
        }
        else
        {
            await this._hass.add_executor_job(handler.job.target, service_call)
        }
    }
}
