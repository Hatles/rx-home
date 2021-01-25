import {PluginDefinition} from "./plugins/plugin-manager";

export class RxHomeConfig {
    plugins: {plugin: PluginDefinition, params?: object}[];
}
