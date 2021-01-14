/**
 * Offer the services over the eventbus.
 */
import {Service, ServiceCall} from "./service";
import {HomeAssistant} from "./core";
import {Callable, Coroutine, Dict, Optional} from "./types";
import {Context} from "./context";
import {HassJobType} from "./job";
import {run_callback_threadsafe} from "../utils/async";
import {_LOGGER, SERVICE_CALL_LIMIT} from "./constants";

export class ServiceRegistry {

    private _services: Dict<Dict<Service>>;
    private _hass: HomeAssistant;
   /**
    * Initialize a service registry.
    */
     constructor(hass: HomeAssistant): void {
       this._services = {}
       this._hass = hass;
    }

    //property
    /**
     * Return dictionary with per domain a list of available services.
     */
    services(): Dict<Dict<Service>> {
        return run_callback_threadsafe(this._hass.loop, this.async_services).result()
    }

    //callback
    /**
     * Return dictionary with per domain a list of available services.
     This method must be run in the event loop.
     */
    async_services(): Dict<Dict<Service>> {
        return Object.keys(this._services).reduce((services, domain) => ({...services, [domain]: {...this._services[domain]}}), {});
    }

   /**
    * Test if specified service exists.
        Async friendly.
    */
     has_service (domain: string, service: string): boolean {
        return service.toLowerCase() in this._services.get(domain.toLowerCase(), [])
    }

    //
   /**
    *
        Register a service.
        Schema is called to coerce and validate the service data.
    */
     register (
        domain: string,
        service: string,
        service_func: Callable,
        schema: Optional<vol.Schema> = null,
    ): void {
        run_callback_threadsafe(this._hass.loop, this.async_register, domain, service, service_func, schema).result()
    }

    //@callback
   /**
    *
        Register a service.

        Schema is called to coerce and validate the service data.

        This method must be run in the event loop.

    */
     async_register (
        domain: string,
        service: string,
        service_func: Callable,
        schema: Optional<vol.Schema> = null,
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

        this._hass.bus.async_fire(EVENT_SERVICE_REGISTERED, {ATTR_DOMAIN: domain, ATTR_SERVICE: service})
    }

    //
   /**
    * Remove a registered service from service handler.
    */
     remove (domain: string, service: string): void {
        run_callback_threadsafe(this._hass.loop, this.async_remove, domain, service).result()
    }

    //@callback
   /**
    * Remove a registered service from service handler.

        This method must be run in the event loop.

    */
     async_remove (domain: string, service: string): void {
        domain = domain.toLowerCase()
        service = service.toLowerCase()

        if (!this._services.get(domain, {}).hasKey([service]))
        {
            _LOGGER.warning("Unable to remove unknown service %s/%s", domain, service)
            return;
        }

        this._services[domain].pop(service)

        if (this._services[domain]) {
            this._services.pop(domain)
        }

        this._hass.bus.async_fire(EVENT_SERVICE_REMOVED, {ATTR_DOMAIN: domain, ATTR_SERVICE: service})
    }

    //
   /**
    *
        Call a service.

        See description of async_call for details.

    */
    call (
        domain: string,
        service: string,
        service_data: Optional<Dict> = null,
        blocking: boolean = false,
        context: Optional<Context> = null,
        limit: Optional<number> = SERVICE_CALL_LIMIT,
    ): Optional<boolean> {
        return asyncio.run_coroutine_threadsafe(
            this.async_call(domain, service, service_data, blocking, context, limit),
            this._hass.loop,
        ).result()
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
    async async_call (
        domain: string,
        service: string,
        service_data: Optional<Dict> = null,
        blocking: boolean = false,
        context: Optional<Context> = null,
        limit: Optional<number> = SERVICE_CALL_LIMIT,
    ): Optional<boolean> {
        domain = domain.toLowerCase();
        service = service.toLowerCase();
        context = context || new Context();
        service_data = service_data || {};

        if (!this._services[domain] || !this._services[domain][service]) {
            throw new ServiceNotFoundError(domain, service);
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

        this._hass.bus.async_fire(
            EVENT_CALL_SERVICE,
            {
                ATTR_DOMAIN: domain.toLowerCase(),
                ATTR_SERVICE: service.toLowerCase(),
                ATTR_SERVICE_DATA: service_data,
            },
            context=context,
        )

        const coro = this._execute_service(handler, service_call)
        if (!blocking) {
            this._run_service_in_background(coro, service_call)
            return null
        }

        const task = this._hass.async_create_task(coro)
        try
        {
           await asyncio.wait({task}, timeout = limit)
        }
        catch (error: asyncio.CancelledError)
        {
           // Task calling us was cancelled, so cancel service call task, and wait for
           // it to be cancelled, within reason, before leaving.
           _LOGGER.debug("Service call was cancelled: %s", service_call)
           task.cancel()
           await asyncio.wait({task}, timeout = SERVICE_CALL_LIMIT)
           throw;
        }

        if (task.cancelled()) {// Service call task was cancelled some other way, such as during shutdown.
            _LOGGER.debug("Service was cancelled: %s", service_call)
            throw asyncio.CancelledError;
        }
        if (task.done()) {// Propagate any exceptions that might have happened during service call.
            task.result()
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
            catch (e: Unauthorized) {
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

        this._hass.async_create_task(catch_exceptions())
    }

    //
   /**
    * Execute a service.
    */
    async _execute_service (handler: Service, service_call: ServiceCall) {
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
           await this._hass.async_add_executor_job(handler.job.target, service_call)
        }
    }
}
