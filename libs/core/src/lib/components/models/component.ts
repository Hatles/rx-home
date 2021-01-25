import {ValidationSchema} from "class-validator";
import {RxHomeCore} from "../../core";
import {ComponentState} from "./state";
import {StateChanges, StatePropertyChange} from "../../utils/store";
import EventEmitter = NodeJS.EventEmitter;
import {Object as TsObject} from "ts-toolbelt";

export interface ServiceAction {
    name: string;
    params?: ValidationSchema;
    result?: ValidationSchema;
}

export interface ServiceEvent {
    name: string;
    result?: ValidationSchema;
}

export interface ServiceType<T> {
    name: string;
    params?: ValidationSchema;
    actions: ServiceAction[];
    events: ServiceEvent[];
    constructor: (core: RxHomeCore) => Service<T>
}

export interface ServiceConfiguration<T> {
    name: string;
    type: string;
    params?: T;
}

export interface Service<T> {
    init(core: RxHomeCore, events: EventEmitter, params?: T): Promise<boolean> | boolean;
    destroy(): Promise<boolean> | boolean;
    do(action: string, ...args: any[])
}

export interface ServiceInstance<T> {
    do(action: string, ...args: any[])
    on<T>(name: string, callback: (event: T) => void)
}

export interface ComponentType<T, S extends object> {
    name: string;
    params?: ValidationSchema;
    actions: ServiceAction[];
    events: ServiceEvent[];
    state: ValidationSchema[];
    constructor: (core: RxHomeCore) => Component<T, S>;
}

export interface ComponentConfiguration<T> {
    name: string;
    type: string;
    params?: T;
}

export interface Component<T, S extends object> {
    init(core: RxHomeCore, events: EventEmitter, state: ComponentState<S>, params?: T): Promise<boolean> | boolean;
    destroy(): Promise<boolean> | boolean;
    do(action: string, ...args: any[])
}


export interface ComponentInstance<S extends object> {
    // action
    do(action: string, ...args: any[])
    // event
    on<E>(name: string, callback: (event: E) => void)

    // state
    set(value: S)
    get(): S
    change(callback: (changes: StateChanges<S>) => void)
    setProperty<P>(name: string, value: P)
    getProperty<P>(name: string): P
    propertyChange<P>(name: string, callback: (change: StatePropertyChange<P>) => void)
}

export class ComponentWrapper<T, S extends object> implements ComponentInstance<S> {
    constructor(
        private component: Component<T, S>,
        private events: EventEmitter,
        public state: ComponentState<S>
    ) {
    }

    // action
    do(action: string, ...args: any[]) {
        this.component.do(action, ...args)
    }

    // event
    on<E>(name: string, callback: (event: E) => void) {
        this.events.on(name, callback)
    }

    // state
    get(): S {
        return this.state.getSnapshot();
    }

    set(value: S) {
        return this.state.set(value);
    }

    change(callback: (changes: StateChanges<S>) => void) {
        return this.state.subscribeChanges(callback);
    }

    getProperty<P extends keyof TsObject.Path<T, []>>(name: P): TsObject.Path<T, [P]> {
        return this.state.getPropertySnapshot<P>(name);
    }

    setProperty<P extends keyof TsObject.Path<T, []>>(name: P, value: TsObject.Path<T, [P]>) {
        return this.state.setProperty<P>(name, value);
    }

    propertyChange<P extends keyof TsObject.Path<T, []>>(name: P, callback: (change: StatePropertyChange<TsObject.Path<T, [P]>>) => void) {
        return this.state.subscribePropertyChanges<P>(name, callback);
    }

}
