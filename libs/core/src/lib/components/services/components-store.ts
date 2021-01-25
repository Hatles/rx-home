import {ComponentConfiguration} from "../models/component";
import {CollectionStore} from "../../utils/store";

export class ComponentsStore extends CollectionStore<ComponentConfiguration<any>> {
    // private components: ComponentConfiguration<any>[] = []
    //
    // get<T>(name: string): ComponentConfiguration<T> {
    //     const component = this.components.find(c => c.name === name);
    //
    //     if (!component) {
    //         throw new Error('Component with name ' + name + ' does not exist')
    //     }
    //
    //     return component
    // }
    //
    // getAll(): ComponentConfiguration<any>[] {
    //     return [...this.components]
    // }
    //
    // add(configuration: ComponentConfiguration<any>) {
    //     const component = this.components.find(c => c.name === name);
    //
    //     if (component) {
    //         throw new Error('Component with name ' + name + ' already exist')
    //     }
    //
    //     this.components.push(configuration)
    // }
    //
    // update<T>(name: string, params?: T) {
    //     const component = this.get(name);
    //     component.params = params;
    // }
    //
    // delete(name: string) {
    //     this.components = this.components.filter(c => c.name !== name)
    // }
}
