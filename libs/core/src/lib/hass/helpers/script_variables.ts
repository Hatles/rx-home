/**
 * Script variables.
 */
from typing import any, Dict, Mapping, Optional

from homeassistant.core import HomeAssistant, callback

from . import template


/**
 * Class to hold and render script variables.
 */
export class ScriptVariables {

    /**
     * Initialize script variables.
     */
    constructor(variables: Dict<any>) {
        this.variables = variables
        this._has_template: Optional<bool> = null
    }

    // @callback
    /**
     * Render script variables.

        The run variables are used to compute the static variables.

        If `render_as_defaults` is true, the run variables will not be overridden.


     */
    async_render(

        hass: HomeAssistant,
        run_variables: Optional[Mapping[str, any]],
        *,
        render_as_defaults: boolean = true,
    ): Dict<any> {
        if (!this._has_template) {
            this._has_template = template.is_complex(this.variables)
            template.attach(hass, this.variables)
        }

        if (!this._has_template) {
            if (render_as_defaults) {
                rendered_variables = dict(this.variables)

                if (run_variables is !null) {
                    rendered_variables.update(run_variables)
                }
            }
            else {
                rendered_variables = (
                    {} if !run_variables else dict(run_variables)
                )
                rendered_variables.update(this.variables)
            }

            return rendered_variables
        }

        rendered_variables = {} if !run_variables else dict(run_variables)

        for(const key, value of this.variables.items()) {
            // We can skip if we're going to override this key with
            // run variables anyway
            if (render_as_defaults and key in rendered_variables) {
                continue
            }

            rendered_variables[key] = template.render_complex(value, rendered_variables)
        }

        return rendered_variables
    }

    /**
     * Return dict version of this class.
     */
    as_dict(): dict {
        return this.variables
    }
}
