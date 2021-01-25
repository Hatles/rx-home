import {RxHomeCore} from "../core";
import {ValidationSchema} from "class-validator";

export interface PluginConfiguration<T = any> {
    name: string;
    params?: T;
}

export interface PluginDefinition<T = any> {
    name: string;
    version: string;
    params?: ValidationSchema;
    dependencies?: string[]
    loader: () => Promise<Plugin<T>> | Plugin<T>
}

export interface PluginInstance<T = any> {
    plugin: Plugin<T>;
    definition: PluginDefinition<T>;
    configuration: PluginConfiguration<T>;
    initialized: boolean;
    error?: boolean;
}

export interface Plugin<T> {
    init(core: RxHomeCore, params?: T): Promise<boolean> | boolean;

    afterInit?(core: RxHomeCore, params?: T): Promise<any> | any;

    destroy?(): Promise<boolean> | boolean;
}

export class PluginManager {
    pluginDefinitions: PluginDefinition[]
    pluginConfigurations: PluginConfiguration[]
    plugins: PluginInstance[]

    constructor(private core: RxHomeCore) {
    }

    async loadPlugins() {
        for (const c of this.pluginConfigurations) {
            const def = this.getPluginDefinition(c.name);
            const instance = await this.createPluginInstance(def);

            this.plugins.push({
                configuration: c,
                definition: def,
                plugin: instance,
                initialized: false
            })
        }
    }

    getPluginDefinition(name: string) {
        const definition = this.pluginDefinitions.find(def => def.name === name);

        if (!definition) {
            throw new Error('Plugin with name ' + name + ' does not exist');
        }

        return definition;
    }

    private async createPluginInstance<T = any>(definition: PluginDefinition<T>) {
        return definition.loader();
    }

    async initPlugins() {
        let it = 0;
        const maxIt = 1000;

        let plugins = [...this.plugins];
        while (plugins.length && it < maxIt) {
            const plugin = plugins.shift();

            if (this.dependenciesAreLoaded(plugin)) {
                const result = await plugin.plugin.init(this.core, plugin.configuration.params)

                if (!result) {
                    plugin.initialized = false;

                    this.core._logger.warning('Error while loading plugin ' + plugin.definition.name)
                } else {
                    plugin.initialized = true;
                }
            } else {
                plugins.push(plugin);
            }

            it++;
        }

        if (it >= maxIt && plugins.length) {
            this.core._logger.warning('Error while loading plugins ' + plugins.map(p => p.definition.name).join(', ') + '. Probably a circular dependency.')
        }

        for (const plugin of this.plugins) {
            if (plugin.initialized && plugin.plugin.afterInit) {
                await Promise.resolve().then(plugin.plugin.afterInit(this.core, plugin.configuration.params));
            }
        }
    }

    async destroy() {

    }

    private dependenciesAreLoaded(plugin: PluginInstance<any>) {
        const dependencies = plugin.definition.dependencies || []

        if (dependencies && dependencies.length) {
            return dependencies.every(dep => this.isInstalled(dep) && this.isInitialized(dep))
        }

        return true;
    }

    registerPlugin<T>(plugin: PluginDefinition<T>, params?: T) {
        this.pluginDefinitions.push(plugin);
        this.pluginConfigurations.push({name: plugin.name, params});
    }

    isInstalled(name: string) {
        const plugin = this.get(name);

        return !!plugin;
    }

    isInitialized(name: string) {
        const plugin = this.get(name);

        return plugin && plugin.initialized;
    }

    get(name: string) {
        return this.plugins.find(p => p.definition.name === name);
    }
}
