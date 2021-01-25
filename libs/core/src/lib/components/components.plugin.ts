import {PluginDefinition, Plugin} from "../plugins/plugin-manager";
import {RxHomeCore} from "../core";
import {ComponentsRegistry} from "./services/components-registry";
import {ComponentsManager} from "./services/components-manager";


export interface ComponentsPluginConfiguration {

}

export class ComponentsPlugin implements Plugin<ComponentsPluginConfiguration> {
    private manager: ComponentsManager;

    init(core: RxHomeCore, params?: ComponentsPluginConfiguration): Promise<boolean> | boolean {

        core.services.register(ComponentsRegistry);
        core.services.register(ComponentsManager);

        return true;
    }

    async afterInit(core: RxHomeCore, params?: ComponentsPluginConfiguration) {
        this.manager = core.services.resolve<ComponentsManager>(ComponentsManager);

        this.manager.loadComponents()
        await this.manager.initComponents()
    }

    async destroy(): boolean {
        await this.manager.destroyComponents();

        return true;
    }
}

export const ComponentsPluginName = 'components'
export const ComponentsPluginVersion = '0.0.1'

export const ComponentsPluginDefinition: PluginDefinition<ComponentsPluginConfiguration> = {
    name: ComponentsPluginName,
    version: ComponentsPluginVersion,
    params: null,
    loader: () => new ComponentsPlugin()
}
