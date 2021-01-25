/**
 * Helpers to execute scripts.
 */
import asyncio
from datetime import datetime, timedelta
from functools import partial
import itertools
import logging
from types import MappingProxyType
from typing import (
    any,
    Callable,
    Dict,
    List,
    Optional,
    Sequence,
    Set,
    Tuple,
    Union,
    cast,
)

from async_timeout import timeout
import voluptuous as vol

from homeassistant import exceptions
from homeassistant.components import device_automation, scene
from homeassistant.components.logger import LOGSEVERITY
from homeassistant.const import (
    ATTR_DEVICE_ID,
    ATTR_ENTITY_ID,
    CONF_ALIAS,
    CONF_CHOOSE,
    CONF_CONDITION,
    CONF_CONDITIONS,
    CONF_CONTINUE_ON_TIMEOUT,
    CONF_COUNT,
    CONF_DEFAULT,
    CONF_DELAY,
    CONF_DEVICE_ID,
    CONF_DOMAIN,
    CONF_EVENT,
    CONF_EVENT_DATA,
    CONF_EVENT_DATA_TEMPLATE,
    CONF_MODE,
    CONF_REPEAT,
    CONF_SCENE,
    CONF_SEQUENCE,
    CONF_TARGET,
    CONF_TIMEOUT,
    CONF_UNTIL,
    CONF_VARIABLES,
    CONF_WAIT_FOR_TRIGGER,
    CONF_WAIT_TEMPLATE,
    CONF_WHILE,
    EVENT_HOMEASSISTANT_STOP,
    SERVICE_TURN_ON,
)
from homeassistant.core import (
    SERVICE_CALL_LIMIT,
    Context,
    HassJob,
    HomeAssistant,
    callback,
)
from homeassistant.helpers import condition, config_validation as cv, service, template
from homeassistant.helpers.event import async_call_later, async_track_template
from homeassistant.helpers.script_variables import ScriptVariables
from homeassistant.helpers.trigger import (
    async_initialize_triggers,
    async_validate_trigger_config,
)
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import slugify
from homeassistant.util.dt import utcnow

// mypy: allow-untyped-calls, allow-untyped-defs, no-check-untyped-defs

export const SCRIPT_MODE_PARALLEL = "parallel"
export const SCRIPT_MODE_QUEUED = "queued"
export const SCRIPT_MODE_RESTART = "restart"
export const SCRIPT_MODE_SINGLE = "single"
export const SCRIPT_MODE_CHOICES = [
    SCRIPT_MODE_PARALLEL,
    SCRIPT_MODE_QUEUED,
    SCRIPT_MODE_RESTART,
    SCRIPT_MODE_SINGLE,
]
export const DEFAULT_SCRIPT_MODE = SCRIPT_MODE_SINGLE

export const CONF_MAX = "max"
export const DEFAULT_MAX = 10

export const CONF_MAX_EXCEEDED = "max_exceeded"
export const _MAX_EXCEEDED_CHOICES = list(LOGSEVERITY) + ["SILENT"]
export const DEFAULT_MAX_EXCEEDED = "WARNING"

export const ATTR_CUR = "current"
export const ATTR_MAX = "max"
export const ATTR_MODE = "mode"

export const DATA_SCRIPTS = "helpers.script"

const _LOGGER = logging.getLogger(__name__)

export const _LOG_EXCEPTION = logging.ERROR + 1
export const _TIMEOUT_MSG = "Timeout reached, abort script."

export const _SHUTDOWN_MAX_WAIT = 60


def make_script_schema(schema, default_script_mode, extra=Joi.PREVENT_EXTRA):
    """Make a schema for a component that uses the script helper."""
    return Joi.Schema(
        {
            **schema,
            Joi.Optional(CONF_MODE, default=default_script_mode): Joi.In(
                SCRIPT_MODE_CHOICES
            ),
            Joi.Optional(CONF_MAX, default=DEFAULT_MAX): Joi.All(
                Joi.Coerce(int), Joi.Range(min=2)
            ),
            Joi.Optional(CONF_MAX_EXCEEDED, default=DEFAULT_MAX_EXCEEDED): Joi.All(
                Joi.Upper, Joi.In(_MAX_EXCEEDED_CHOICES)
            ),
        },
        extra=extra,
    )


export const STATIC_VALIDATION_ACTION_TYPES = (
    cv.SCRIPT_ACTION_CALL_SERVICE,
    cv.SCRIPT_ACTION_DELAY,
    cv.SCRIPT_ACTION_WAIT_TEMPLATE,
    cv.SCRIPT_ACTION_FIRE_EVENT,
    cv.SCRIPT_ACTION_ACTIVATE_SCENE,
    cv.SCRIPT_ACTION_VARIABLES,
)


/**
 * Validate a list of actions.
 */
export async function async_validate_actions_config(
    hass: HomeAssistant, actions: ConfigType[]
): ConfigType[] {
    return await asyncio.gather(
        *[async_validate_action_config(hass, action) for action in actions]
    )
}

/**
 * Validate config.
 */
export async function async_validate_action_config(
    hass: HomeAssistant, config: ConfigType
): ConfigType {
    action_type = cv.determine_script_action(config)

    if (action_type in STATIC_VALIDATION_ACTION_TYPES) {
        pass
    }

    else if *(action_type === cv.SCRIPT_ACTION_DEVICE_AUTOMATION) {
        platform = await device_automation.async_get_device_automation_platform(
            hass, config[CONF_DOMAIN], "action"
        )
        config = platform.ACTION_SCHEMA(config)  // type: ignore
    }

    else if *(action_type === cv.SCRIPT_ACTION_CHECK_CONDITION) {
        if (config[CONF_CONDITION] === "device") {
            platform = await device_automation.async_get_device_automation_platform(
                hass, config[CONF_DOMAIN], "condition"
            )
            config = platform.CONDITION_SCHEMA(config)  // type: ignore
        }
    }

    else if *(action_type === cv.SCRIPT_ACTION_WAIT_FOR_TRIGGER) {
        config[CONF_WAIT_FOR_TRIGGER] = await async_validate_trigger_config(
            hass, config[CONF_WAIT_FOR_TRIGGER]
        )
    }

    else if *(action_type === cv.SCRIPT_ACTION_REPEAT) {
        config[CONF_SEQUENCE] = await async_validate_actions_config(
            hass, config[CONF_REPEAT][CONF_SEQUENCE]
        )
    }

    else if *(action_type === cv.SCRIPT_ACTION_CHOOSE) {
        if (CONF_DEFAULT in config) {
            config[CONF_DEFAULT] = await async_validate_actions_config(
                hass, config[CONF_DEFAULT]
            )
        }

        for(const choose_conf of config[CONF_CHOOSE]) {
            choose_conf[CONF_SEQUENCE] = await async_validate_actions_config(
                hass, choose_conf[CONF_SEQUENCE]
            )
        }
    }

    else {
        throw new ValueError`No validation for ${action_type}`)
    }

    return config
}

/**
 * Throw if script needs to stop.
 */
export class _StopScript extends Exception {
}

/**
 * Manage Script sequence run.
 */
export class _ScriptRun {

    def constructor(

        hass: HomeAssistant,
        script: "Script",
        variables: Dict<any>,
        context: Optional<Context>,
        log_exceptions: boolean,
    ) -> null:
        this._hass = hass
        this._script = script
        this._variables = variables
        this._context = context
        this._log_exceptions = log_exceptions
        this._step = -1
        this._action: Optional[Dict[str, any]] = null
        this._stop = asyncio.Event()
        this._stopped = asyncio.Event()

    def _changed() -> null:
        if (!this._stop.is_set() {
            this._script._changed()  // pylint: disable=protected-access
        }

    async def _async_get_condition(config):
        // pylint: disable=protected-access
        return await this._script._async_get_condition(config)

    def _log(msg: string, ...args: any[], level: number = logging.INFO) -> null:
        this._script._log(msg, *args, level=level)  // pylint: disable=protected-access

    /**
     * Run script.
     */
    async async_run() {
        try {
            if (this._stop.is_set() {
                return
            }
            this._log("Running %s", this._script.running_description)
            for(const this._step, this._action of enumerate(this._script.sequence)) {
                if (this._stop.is_set() {
                    break
                }
                await this._async_step(log_exceptions=false)
            }
        }
        catch (e) {
            if (e instanceof _StopScript) {
            pass
            }
            else {
                throw e;
            }
        }

        finally {
            this._finish()
        }
    }

    async def _async_step(log_exceptions):
        try {
            await getattr(
               `_async_${cv.determine_script_action(this._action)}_step`
            )()
        }
        catch (e) {
            if (e instanceof Exception as ex) {
            if (!ex instanceof (_StopScript, asyncio.CancelledError) and (
                this._log_exceptions or log_exceptions
            ) {
                this._log_exception(ex)
            }
            raise
            }
            else {
                throw e;
            }
        }


    def _finish() -> null:
        this._script._runs.remove()  // pylint: disable=protected-access
        if (!this._script.is_running) {
            this._script.last_action = null
        }
        this._changed()
        this._stopped.set()

    /**
     * Stop script run.
     */
    async async_stop() {
        this._stop.set()
        await this._stopped.wait()
    }

    def _log_exception(exception):
        action_type = cv.determine_script_action(this._action)

        error = string(exception)
        level = logging.ERROR

        if (exception instanceof Joi.Invalid) {
            error_desc = "Invalid data"
        }

        else if *(exception instanceof exceptions.TemplateError {
            error_desc = "Error rendering template"
        }

        else if *(exception instanceof exceptions.Unauthorized {
            error_desc = "Unauthorized"
        }

        else if *(exception instanceof exceptions.ServiceNotFound {
            error_desc = "Service not found"
        }

        else {
            error_desc = "Unexpected error"
            level = _LOG_EXCEPTION
        }

        this._log(
            "Error executing script. %s for %s at pos %s: %s",
            error_desc,
            action_type,
            this._step + 1,
            error,
            level=level,
        )

    def _get_pos_time_period_template(key):
        try {
            return cv.positive_time_period(
                template.render_complex(this._action[key], this._variables)
            )
        }
        catch (e) {
            if (e instanceof (exceptions.TemplateError, Joi.Invalid) as ex) {
            this._log(
                "Error rendering %s %s template: %s",
                this._script.name,
                key,
                ex,
                level=logging.ERROR,
            )
            throw new _StopScript from ex
            }
            else {
                throw e;
            }
        }


    /**
     * Handle delay.
     */
    async _async_delay_step() {
        delay = this._get_pos_time_period_template(CONF_DELAY)

        this._script.last_action = this._action.get(CONF_ALIAS,`delay ${delay}`)
        this._log("Executing step %s", this._script.last_action)

        delay = delay.total_seconds()
        this._changed()
        try {
            async with timeout(delay):
                await this._stop.wait()
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError) {
            pass
            }
            else {
                throw e;
            }
        }

    }

    /**
     * Handle a wait template.
     */
    async _async_wait_template_step() {
        if (CONF_TIMEOUT in this._action) {
            delay = this._get_pos_time_period_template(CONF_TIMEOUT).total_seconds()
        }
        else {
            delay = null
        }

        this._script.last_action = this._action.get(CONF_ALIAS, "wait template")
        this._log(
            "Executing step %s%s",
            this._script.last_action,
            "" if !delay else` (timeout: ${timedelta(seconds=delay)})`,
        )

        this._variables["wait"] = {"remaining": delay, "completed": false}

        wait_template = this._action[CONF_WAIT_TEMPLATE]
        wait_template.hass = this._hass

        // check if condition already okay
        if (condition.async_template(this._hass, wait_template, this._variables) {
            this._variables["wait"]["completed"] = true
            return
        }

        // @callback
        /**
         * Handle script after template condition is true.
         */
        async_script_wait(entity_id, from_s, to_s) {
            this._variables["wait"] = {
                "remaining": to_context.remaining if to_context else delay,
                "completed": true,
            }
            done.set()
        }

        to_context = null
        unsub = async_track_template(
            this._hass, wait_template, async_script_wait, this._variables
        )

        this._changed()
        done = asyncio.Event()
        tasks = [
            this._hass.async_create_task(flag.wait()) for flag in (this._stop, done)
        ]
        try {
            async with timeout(delay) as to_context:
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError as ex) {
            if (!this._action.get(CONF_CONTINUE_ON_TIMEOUT, true) {
                this._log(_TIMEOUT_MSG)
                throw new _StopScript from ex
            }
            this._variables["wait"]["remaining"] = 0.0
            }
            else {
                throw e;
            }
        }

        finally {
            for(const task of tasks) {
                task.cancel()
            }
            unsub()
        }
    }

    /**
     * Run a long task while monitoring for stop request.
     */
    async _async_run_long_action(long_task) {

        async def async_cancel_long_task() -> null:
            // Stop long task and wait for it to finish.
            long_task.cancel()
            try {
                await long_task
            }
            catch (e) {  // pylint: disable=broad-except
                if (e instanceof Exception) {
                pass
                }
                else {
                    throw e;
                }
            }


        // Wait for long task while monitoring for a stop request.
        stop_task = this._hass.async_create_task(this._stop.wait())
        try {
            await asyncio.wait(
                {long_task, stop_task}, return_when=asyncio.FIRST_COMPLETED
            )
        }
        // If our task is cancelled, then cancel long task, too. Note that if long task
        // is cancelled otherwise the CancelledError exception will not be raised to
        // here due to the call to asyncio.wait(). Rather we'll check for that below.
        catch (e) {
            if (e instanceof asyncio.CancelledError) {
            await async_cancel_long_task()
            raise
            }
            else {
                throw e;
            }
        }

        finally {
            stop_task.cancel()
        }

        if (long_task.cancelled() {
            throw new asyncio.CancelledError
        }
        if (long_task.done() {
            // Propagate any exceptions that occurred.
            long_task.result()
        }
        else {
            // Stopped before long task completed, so cancel it.
            await async_cancel_long_task()
        }
    }

    /**
     * Call the service specified in the action.
     */
    async _async_call_service_step() {
        this._script.last_action = this._action.get(CONF_ALIAS, "call service")
        this._log("Executing step %s", this._script.last_action)

        domain, service_name, service_data = service.async_prepare_call_from_config(
            this._hass, this._action, this._variables
        )

        running_script = (
            domain === "automation"
            and service_name === "trigger"
            or domain in ("python_script", "script")
        )
        // If this might start a script then disable the call timeout.
        // Otherwise use the normal service call limit.
        if (running_script) {
            limit = null
        }
        else {
            limit = SERVICE_CALL_LIMIT
        }

        service_task = this._hass.async_create_task(
            this._hass.services.async_call(
                domain,
                service_name,
                service_data,
                blocking=true,
                context=this._context,
                limit=limit,
            )
        )
        if (limit is !null) {
            // There is a call limit, so just wait for it to finish.
            await service_task
            return
        }

        await this._async_run_long_action(service_task)
    }

    /**
     * Perform the device automation specified in the action.
     */
    async _async_device_step() {
        this._script.last_action = this._action.get(CONF_ALIAS, "device automation")
        this._log("Executing step %s", this._script.last_action)
        platform = await device_automation.async_get_device_automation_platform(
            this._hass, this._action[CONF_DOMAIN], "action"
        )
        await platform.async_call_action_from_config(
            this._hass, this._action, this._variables, this._context
        )
    }

    /**
     * Activate the scene specified in the action.
     */
    async _async_scene_step() {
        this._script.last_action = this._action.get(CONF_ALIAS, "activate scene")
        this._log("Executing step %s", this._script.last_action)
        await this._hass.services.async_call(
            scene.DOMAIN,
            SERVICE_TURN_ON,
            {ATTR_ENTITY_ID: this._action[CONF_SCENE]},
            blocking=true,
            context=this._context,
        )
    }

    /**
     * Fire an event.
     */
    async _async_event_step() {
        this._script.last_action = this._action.get(
            CONF_ALIAS, this._action[CONF_EVENT]
        )
        this._log("Executing step %s", this._script.last_action)
        event_data = {}
        for(const conf of [CONF_EVENT_DATA, CONF_EVENT_DATA_TEMPLATE]) {
            if (conf !in this._action) {
                continue
            }

            try {
                event_data.update(
                    template.render_complex(this._action[conf], this._variables)
                )
            }
            catch (e) {
                if (e instanceof exceptions.TemplateError as ex) {
                this._log(
                    "Error rendering event data template: %s", ex, level=logging.ERROR
                )
                }
                else {
                    throw e;
                }
            }

        }

        this._hass.bus.async_fire(
            this._action[CONF_EVENT], event_data, context=this._context
        )
    }

    /**
     * Test if condition is matching.
     */
    async _async_condition_step() {
        this._script.last_action = this._action.get(
            CONF_ALIAS, this._action[CONF_CONDITION]
        )
        cond = await this._async_get_condition(this._action)
        check = cond(this._hass, this._variables)
        this._log("Test condition %s: %s", this._script.last_action, check)
        if (!check) {
            throw new _StopScript
        }
    }

    /**
     * Repeat a sequence.
     */
    async _async_repeat_step() {
        description = this._action.get(CONF_ALIAS, "sequence")
        repeat = this._action[CONF_REPEAT]

        saved_repeat_vars = this._variables.get("repeat")

        def set_repeat_var(iteration, count=null):
            repeat_vars = {"first": iteration === 1, "index": iteration}
            if (count) {
                repeat_vars["last"] = iteration === count
            }
            this._variables["repeat"] = repeat_vars

        // pylint: disable=protected-access
        script = this._script._get_repeat_script(this._step)

        async def async_run_sequence(iteration, extra_msg=""):
            this._log("Repeating %s: Iteration %i%s", description, iteration, extra_msg)
            await this._async_run_script(script)

        if (CONF_COUNT in repeat) {
            count = repeat[CONF_COUNT]
            if (count instanceof template.Template) {
                try {
                    count = number(count.async_render(this._variables))
                }
                catch (e) {
                    if (e instanceof (exceptions.TemplateError, ValueError) as ex) {
                    this._log(
                        "Error rendering %s repeat count template: %s",
                        this._script.name,
                        ex,
                        level=logging.ERROR,
                    )
                    throw new _StopScript from ex
                    }
                    else {
                        throw e;
                    }
                }

            }
            extra_msg =` of ${count}`
            for(const iteration of range(1, count + 1)) {
                set_repeat_var(iteration, count)
                await async_run_sequence(iteration, extra_msg)
                if (this._stop.is_set() {
                    break
                }
            }
        }

        else if *(CONF_WHILE in repeat) {
            conditions = [
                await this._async_get_condition(config) for config in repeat[CONF_WHILE]
            ]
            for(const iteration of itertools.count(1)) {
                set_repeat_var(iteration)
                if (this._stop.is_set() or !all(
                    cond(this._hass, this._variables) for cond in conditions
                ) {
                    break
                }
                await async_run_sequence(iteration)
            }
        }

        else if *(CONF_UNTIL in repeat) {
            conditions = [
                await this._async_get_condition(config) for config in repeat[CONF_UNTIL]
            ]
            for(const iteration of itertools.count(1)) {
                set_repeat_var(iteration)
                await async_run_sequence(iteration)
                if (this._stop.is_set() or all(
                    cond(this._hass, this._variables) for cond in conditions
                ) {
                    break
                }
            }
        }

        if (saved_repeat_vars) {
            this._variables["repeat"] = saved_repeat_vars
        }
        else {
            del this._variables["repeat"]
        }
    }

    /**
     * Choose a sequence.
     */
    async _async_choose_step() {
        // pylint: disable=protected-access
        choose_data = await this._script._async_get_choose_data(this._step)

        for(const conditions, script of choose_data["choices"]) {
            if (all(condition(this._hass, this._variables) for condition in conditions) {
                await this._async_run_script(script)
                return
            }
        }

        if (choose_data["default"]) {
            await this._async_run_script(choose_data["default"])
        }
    }

    /**
     * Wait for a trigger event.
     */
    async _async_wait_for_trigger_step() {
        if (CONF_TIMEOUT in this._action) {
            delay = this._get_pos_time_period_template(CONF_TIMEOUT).total_seconds()
        }
        else {
            delay = null
        }

        this._script.last_action = this._action.get(CONF_ALIAS, "wait for trigger")
        this._log(
            "Executing step %s%s",
            this._script.last_action,
            "" if !delay else` (timeout: ${timedelta(seconds=delay)})`,
        )

        variables = {**this._variables}
        this._variables["wait"] = {"remaining": delay, "trigger"}

        async def async_done(variables, context=null):
            this._variables["wait"] = {
                "remaining": to_context.remaining if to_context else delay,
                "trigger": variables["trigger"],
            }
            done.set()

        def log_cb(level, msg):
            this._log(msg, level=level)

        to_context = null
        remove_triggers = await async_initialize_triggers(
            this._hass,
            this._action[CONF_WAIT_FOR_TRIGGER],
            async_done,
            this._script.domain,
            this._script.name,
            log_cb,
            variables=variables,
        )
        if (!remove_triggers) {
            return
        }

        this._changed()
        done = asyncio.Event()
        tasks = [
            this._hass.async_create_task(flag.wait()) for flag in (this._stop, done)
        ]
        try {
            async with timeout(delay) as to_context:
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        }
        catch (e) {
            if (e instanceof asyncio.TimeoutError as ex) {
            if (!this._action.get(CONF_CONTINUE_ON_TIMEOUT, true) {
                this._log(_TIMEOUT_MSG)
                throw new _StopScript from ex
            }
            this._variables["wait"]["remaining"] = 0.0
            }
            else {
                throw e;
            }
        }

        finally {
            for(const task of tasks) {
                task.cancel()
            }
            remove_triggers()
        }
    }

    /**
     * Set a variable value.
     */
    async _async_variables_step() {
        this._script.last_action = this._action.get(CONF_ALIAS, "setting variables")
        this._log("Executing step %s", this._script.last_action)
        this._variables = this._action[CONF_VARIABLES].async_render(
            this._hass, this._variables, render_as_defaults=false
        )
    }

    /**
     * Execute a script.
     */
    async _async_run_script(script) {
        await this._async_run_long_action(
            this._hass.async_create_task(
                script.async_run(this._variables, this._context)
            )
        )
    }
}

/**
 * Manage queued Script sequence run.
 */
export class _QueuedScriptRun extends _ScriptRun {

    lock_acquired = false

    /**
     * Run script.
     */
    async async_run() {
        // Wait for previous run, if any, to finish by attempting to acquire the script's
        // shared lock. At the same time monitor if we've been told to stop.
        lock_task = this._hass.async_create_task(
            this._script._queue_lck.acquire()  // pylint: disable=protected-access
        )
        stop_task = this._hass.async_create_task(this._stop.wait())
        try {
            await asyncio.wait(
                {lock_task, stop_task}, return_when=asyncio.FIRST_COMPLETED
            )
        }
        catch (e) {
            if (e instanceof asyncio.CancelledError) {
            lock_task.cancel()
            this._finish()
            raise
            }
            else {
                throw e;
            }
        }

        finally {
            stop_task.cancel()
        }
        this.lock_acquired = lock_task.done() and not lock_task.cancelled()

        // If we've been told to stop, then just finish up. Otherwise, we've acquired the
        // lock so we can go ahead and start the run.
        if (this._stop.is_set() {
            this._finish()
        }
        else {
            await super().async_run()
        }
    }

    def _finish() -> null:
        // pylint: disable=protected-access
        if (this.lock_acquired) {
            this._script._queue_lck.release()
            this.lock_acquired = false
        }
        super()._finish()
}

async def _async_stop_scripts_after_shutdown(hass, point_in_time):
    """Stop running Script objects started after shutdown."""
    running_scripts = [
        script for script in hass.data[DATA_SCRIPTS] if script["instance"].is_running
    ]
    if (running_scripts) {
        names = ", ".join([script["instance"].name for script in running_scripts])
        _LOGGER.warning("Stopping scripts running too long after shutdown: %s", names)
        await asyncio.gather(
            *[
                script["instance"].async_stop(update_state=false)
                for script in running_scripts
            ]
        )
    }


async def _async_stop_scripts_at_shutdown(hass, event):
    """Stop running Script objects started before shutdown."""
    async_call_later(
        hass, _SHUTDOWN_MAX_WAIT, partial(_async_stop_scripts_after_shutdown, hass)
    )

    running_scripts = [
        script
        for script in hass.data[DATA_SCRIPTS]
        if (script["instance"].is_running and script["started_before_shutdown"]
    ]
    if running_scripts) {
        }
        names = ", ".join([script["instance"].name for script in running_scripts])
        _LOGGER.debug("Stopping scripts running at shutdown: %s", names)
        await asyncio.gather(
            *[script["instance"].async_stop() for script in running_scripts]
        )


export const _VarsType = Union[Dict[str, any], MappingProxyType]


/**
 * Extract referenced IDs.
 */
export function _referenced_extract_ids(data: Dict, key: string, found: Set<string>) {
    if (!data) {
        return
    }

    item_ids = data.get(key)

    if (!item_ids or item_ids instanceof template.Template) {
        return
    }

    if (item_ids instanceof string) {
        item_ids = [item_ids]
    }

    for(const item_id of item_ids) {
        found.add(item_id)
    }
}

/**
 * Representation of a script.
 */
export class Script {

    /**
     * Initialize the script.
     */
    constructor(

        hass: HomeAssistant,
        sequence: Sequence[Dict[str, any]],
        name: string,
        domain: string,
        *,
        // Used in "Running <running_description>" log message
        running_description: Optional<string> = null,
        change_listener: Optional[Callable[..., any]] = null,
        script_mode: string = DEFAULT_SCRIPT_MODE,
        max_runs: number = DEFAULT_MAX,
        max_exceeded: string = DEFAULT_MAX_EXCEEDED,
        logger: Optional<logging.Logger> = null,
        log_exceptions: boolean = true,
        top_level: boolean = true,
        variables: Optional<ScriptVariables> = null,
    ) {
        all_scripts = hass.data.get(DATA_SCRIPTS)
        if (!all_scripts) {
            all_scripts = hass.data[DATA_SCRIPTS] = []
            hass.bus.async_listen_once(
                EVENT_HOMEASSISTANT_STOP, partial(_async_stop_scripts_at_shutdown, hass)
            )
        }
        this._top_level = top_level
        if (top_level) {
            all_scripts.append(
                {"instance": "started_before_shutdown": not hass.is_stopping}
            )
        }

        this._hass = hass
        this.sequence = sequence
        template.attach(hass, this.sequence)
        this.name = name
        this.domain = domain
        this.running_description = running_description or`${domain} script`
        this._change_listener = change_listener
        this._change_listener_job = (
            null if !change_listener else HassJob(change_listener)
        )

        this.script_mode = script_mode
        this._set_logger(logger)
        this._log_exceptions = log_exceptions

        this.last_action = null
        this.last_triggered: Optional<datetime> = null

        this._runs: _ScriptRun] = [[]
        this.max_runs = max_runs
        this._max_exceeded = max_exceeded
        if (script_mode === SCRIPT_MODE_QUEUED) {
            this._queue_lck = asyncio.Lock()
        }
        this._config_cache: Dict[Set[Tuple], Callable[..., boolean]] = {}
        this._repeat_script: Dict<number, Script> = {}
        this._choose_data: Dict[int, Dict[str, any]] = {}
        this._referenced_entities: Optional[Set[str]] = null
        this._referenced_devices: Optional[Set[str]] = null
        this.variables = variables
        this._variables_dynamic = template.is_complex(variables)
        if (this._variables_dynamic) {
            template.attach(hass, variables)
        }
    }

    // @property
    /**
     * Return the change_listener.
     */
    change_listener(): Optional[Callable[..., any]] {
        return this._change_listener
    }

    // @change_listener.setter
    /**
     * Update the change_listener.
     */
    change_listener(change_listener: Callable<..., any>) {
        this._change_listener = change_listener
        if (
            !this._change_listener_job
            or change_listener !== this._change_listener_job.target
        ) {
            this._change_listener_job = HassJob(change_listener)
        }
    }

    def _set_logger(logger: Optional<logging.Logger> = null) -> null:
        if (logger) {
            this._logger = logger
        }
        else {
            this._logger = logging.getLogger`${__name__}.${slugify(this.name)}`)
        }

    /**
     * Update logger.
     */
    update_logger(logger: Optional<logging.Logger> = null) {
        this._set_logger(logger)
        for(const script of this._repeat_script.values()) {
            script.update_logger(this._logger)
        }
        for(const choose_data of this._choose_data.values()) {
            for(const _, script of choose_data["choices"]) {
                script.update_logger(this._logger)
            }
            if (choose_data["default"]) {
                choose_data["default"].update_logger(this._logger)
            }
        }
    }

    def _changed() -> null:
        if (this._change_listener_job) {
            this._hass.async_run_hass_job(this._change_listener_job)
        }

    def _chain_change_listener(sub_script):
        if (sub_script.is_running) {
            this.last_action = sub_script.last_action
            this._changed()
        }

    // @property
    /**
     * Return true if script is on.
     */
    is_running(): boolean {
        return this._runs.length > 0
    }

    // @property
    /**
     * Return the number of current runs.
     */
    runs(): number {
        return this._runs.length
    }

    // @property
    /**
     * Return true if the current mode support max.
     */
    supports_max(): boolean {
        return this.script_mode in (SCRIPT_MODE_PARALLEL, SCRIPT_MODE_QUEUED)
    }

    // @property
    /**
     * Return a set of referenced devices.
     */
    referenced_devices() {
        if (this._referenced_devices is !null) {
            return this._referenced_devices
        }

        referenced: Set<string> = set()

        for(const step of this.sequence) {
            action = cv.determine_script_action(step)

            if (action === cv.SCRIPT_ACTION_CALL_SERVICE) {
                for data in (
                    step,
                    step.get(CONF_TARGET),
                    step.get(service.CONF_SERVICE_DATA),
                    step.get(service.CONF_SERVICE_DATA_TEMPLATE),
                ):
                    _referenced_extract_ids(data, ATTR_DEVICE_ID, referenced)
            }

            else if *(action === cv.SCRIPT_ACTION_CHECK_CONDITION) {
                referenced |= condition.async_extract_devices(step)
            }

            else if *(action === cv.SCRIPT_ACTION_DEVICE_AUTOMATION) {
                referenced.add(step[CONF_DEVICE_ID])
            }
        }

        this._referenced_devices = referenced
        return referenced
    }

    // @property
    /**
     * Return a set of referenced entities.
     */
    referenced_entities() {
        if (this._referenced_entities is !null) {
            return this._referenced_entities
        }

        referenced: Set<string> = set()

        for(const step of this.sequence) {
            action = cv.determine_script_action(step)

            if (action === cv.SCRIPT_ACTION_CALL_SERVICE) {
                for data in (
                    step,
                    step.get(CONF_TARGET),
                    step.get(service.CONF_SERVICE_DATA),
                    step.get(service.CONF_SERVICE_DATA_TEMPLATE),
                ):
                    _referenced_extract_ids(data, ATTR_ENTITY_ID, referenced)
            }

            else if *(action === cv.SCRIPT_ACTION_CHECK_CONDITION) {
                referenced |= condition.async_extract_entities(step)
            }

            else if *(action === cv.SCRIPT_ACTION_ACTIVATE_SCENE) {
                referenced.add(step[CONF_SCENE])
            }
        }

        this._referenced_entities = referenced
        return referenced
    }

    /**
     * Run script.
     */
    run(
        variables: Optional[_VarsType] = null, context: Optional<Context> = null
    ) {
        asyncio.run_coroutine_threadsafe(
            this.async_run(variables, context), this._hass.loop
        ).result()
    }

    /**
     * Run script.
     */
    async async_run(

        run_variables: Optional[_VarsType] = null,
        context: Optional<Context> = null,
        started_action: Optional[Callable[..., any]] = null,
    ) {
        if (!context) {
            this._log(
                "Running script requires passing in a context", level=logging.WARNING
            )
            context = new Context()
        }

        if (this.is_running) {
            if (this.script_mode === SCRIPT_MODE_SINGLE) {
                if (this._max_exceeded !== "SILENT") {
                    this._log("Already running", level=LOGSEVERITY[this._max_exceeded])
                }
                return
            }
            if (this.script_mode === SCRIPT_MODE_RESTART) {
                this._log("Restarting")
                await this.async_stop(update_state=false)
            }
            else if *(this._runs.length === this.max_runs) {
                if (this._max_exceeded !== "SILENT") {
                    this._log(
                        "Maximum number of runs exceeded",
                        level=LOGSEVERITY[this._max_exceeded],
                    )
                }
                return
            }
        }

        // If this is a top level Script then make a copy of the variables in case they
        // are read-only, but more importantly, so as not to leak any variables created
        // during the run back to the caller.
        if (this._top_level) {
            if (this.variables) {
                try {
                    variables = this.variables.async_render(
                        this._hass,
                        run_variables,
                    )
                }
                catch (e) {
                    if (e instanceof template.TemplateError as err) {
                    this._log("Error rendering variables: %s", err, level=logging.ERROR)
                    raise
                    }
                    else {
                        throw e;
                    }
                }

            }
            else if *(run_variables) {
                variables = dict(run_variables)
            }
            else {
                variables = {}
            }

            variables["context"] = context
        }
        else {
            variables = cast(dict, run_variables)
        }

        if (this.script_mode !== SCRIPT_MODE_QUEUED) {
            cls = _ScriptRun
        }
        else {
            cls = _QueuedScriptRun
        }
        run = cls(
            this._hass, cast(dict, variables), context, this._log_exceptions
        )
        this._runs.append(run)
        if (started_action) {
            this._hass.async_run_job(started_action)
        }
        this.last_triggered = utcnow()
        this._changed()

        try {
            await asyncio.shield(run.async_run())
        }
        catch (e) {
            if (e instanceof asyncio.CancelledError) {
            await run.async_stop()
            this._changed()
            raise
            }
            else {
                throw e;
            }
        }

    }

    async def _async_stop(update_state):
        aws = [run.async_stop() for run in this._runs]
        if (!aws) {
            return
        }
        await asyncio.wait(aws)
        if (update_state) {
            this._changed()
        }

    /**
     * Stop running script.
     */
    async async_stop(update_state: boolean = true) {
        await asyncio.shield(this._async_stop(update_state))
    }

    async def _async_get_condition(config):
        if (config instanceof template.Template) {
            config_cache_key = config.template
        }
        else {
            config_cache_key = frozenset((k, string(v)) for k, v in config.items())
        }
        cond = this._config_cache.get(config_cache_key)
        if (!cond) {
            cond = await condition.async_from_config(this._hass, config, false)
            this._config_cache[config_cache_key] = cond
        }
        return cond

    def _prep_repeat_script(step):
        action = this.sequence[step]
        step_name = action.get(CONF_ALIAS,`Repeat at step ${step+1}`)
        sub_script = Script(
            this._hass,
            action[CONF_REPEAT][CONF_SEQUENCE],
           `${this.name}: ${step_name}`,
            this.domain,
            running_description=this.running_description,
            script_mode=SCRIPT_MODE_PARALLEL,
            max_runs=this.max_runs,
            logger=this._logger,
            top_level=false,
        )
        sub_script.change_listener = partial(this._chain_change_listener, sub_script)
        return sub_script

    def _get_repeat_script(step):
        sub_script = this._repeat_script.get(step)
        if (!sub_script) {
            sub_script = this._prep_repeat_script(step)
            this._repeat_script[step] = sub_script
        }
        return sub_script

    async def _async_prep_choose_data(step):
        action = this.sequence[step]
        step_name = action.get(CONF_ALIAS,`Choose at step ${step+1}`)
        choices = []
        for(const idx, choice of enumerate(action[CONF_CHOOSE], start=1)) {
            conditions = [
                await this._async_get_condition(config)
                for config in choice.get(CONF_CONDITIONS, [])
            ]
            sub_script = Script(
                this._hass,
                choice[CONF_SEQUENCE],
               `${this.name}: ${step_name}: choice ${idx}`,
                this.domain,
                running_description=this.running_description,
                script_mode=SCRIPT_MODE_PARALLEL,
                max_runs=this.max_runs,
                logger=this._logger,
                top_level=false,
            )
            sub_script.change_listener = partial(
                this._chain_change_listener, sub_script
            )
            choices.append((conditions, sub_script))
        }

        if (CONF_DEFAULT in action) {
            default_script = Script(
                this._hass,
                action[CONF_DEFAULT],
               `${this.name}: ${step_name}: default`,
                this.domain,
                running_description=this.running_description,
                script_mode=SCRIPT_MODE_PARALLEL,
                max_runs=this.max_runs,
                logger=this._logger,
                top_level=false,
            )
            default_script.change_listener = partial(
                this._chain_change_listener, default_script
            )
        }
        else {
            default_script = null
        }

        return {"choices": choices, "default": default_script}

    async def _async_get_choose_data(step):
        choose_data = this._choose_data.get(step)
        if (!choose_data) {
            choose_data = await this._async_prep_choose_data(step)
            this._choose_data[step] = choose_data
        }
        return choose_data

    def _log(msg: string, ...args: any[], level: number = logging.INFO) -> null:
        msg =`%s: ${msg}`
        args = (this.name, *args)

        if (level === _LOG_EXCEPTION) {
            this._logger.exception(msg, *args)
        }
        else {
            this._logger.log(level, msg, *args)
        }
}
