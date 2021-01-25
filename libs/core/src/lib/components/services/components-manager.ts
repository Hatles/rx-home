import {ComponentsRegistry} from "./components-registry";
import {Component, ComponentConfiguration, ComponentInstance, ComponentWrapper} from "../models/component";
import {ComponentsStore} from "./components-store";
import {RxHomeCore} from "../../core";
import EventEmitter = NodeJS.EventEmitter;
import {ComponentState} from "../models/state";
import {CollectionStore} from "../../utils/store";
import {injectable} from "tsyringe";

interface ComponentRegistration<T, S extends object> {
    component: Component<T, S>
    instance: ComponentInstance<S>
    configuration: ComponentConfiguration<T>
    events: EventEmitter
    state: State<S>
}

@injectable()
export class ComponentsManager {
    registry: ComponentsRegistry;
    private store: ComponentsStore;
    private components: CollectionStore<ComponentRegistration<any, any>>;

    constructor(private core: RxHomeCore, registry: ComponentsRegistry) {
        this.registry = registry;
        this.components = new CollectionStore<ComponentRegistration<any, any>>()
    }

    loadComponents() {
        for (let config of this.store.allSnapshot()) {
            const type = this.registry.getSnapshot(config.type);
            const component = type.constructor(this.core);

            const events = new EventEmitter();
            const state = new ComponentState();
            const wrapper: ComponentInstance<any> = new ComponentWrapper(component, events, state);
            const registration: ComponentRegistration<any, any> = {
                component: component,
                instance: wrapper,
                configuration: config,
                events: events,
                state: state
            };
            this.components.add(registration);
        }
    }

    async initComponents() {
        for (let component of this.components.allSnapshot()) {
            const result = await component.component.init(this.core, component.events, component.state, component.configuration.params)

            if (!result) {
                this.core._logger.warning('Error while loading component ' + component.configuration.name + ' of type ' + component.configuration.type)
            }
        }
    }

    async destroyComponents() {
        return Promise.all(this.components.allSnapshot().map(component => {
            if (component.component.destroy) {
                return component.component.destroy()
            }

            return Promise.resolve();
        }))
    }

    get<S extends object>(name: string): ComponentInstance<S> {
        const registration = this.components.find(c => c.configuration.name === name);

        if (!registration) {
            throw new Error('Component with name ' + name + ' does not exist')
        }

        return registration.instance
    }

    getAll<S extends object>(): ComponentInstance<S>[] {
        return this.components.map(c => c.instance);
    }
}
