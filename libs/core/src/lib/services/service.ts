import {RxHomeCore} from "../core";
import {
    ClassProvider,
    container,
    DependencyContainer,
    FactoryProvider,
    InjectionToken,
    TokenProvider,
    ValueProvider,
    RegistrationOptions
} from "tsyringe";
import "reflect-metadata";

declare type constructor<T> = {
    new (...args: any[]): T;
};

export class ServiceManager {
    private container: DependencyContainer;

    constructor(private core: RxHomeCore) {
        this.container = container.createChildContainer();

        // core instance
        this.container.registerInstance(RxHomeCore, core);
    }

    isRegistered<T>(token: InjectionToken<T>, recursive?: boolean): boolean {
        return this.container.isRegistered<T>(token, recursive);
    }

    register<T>(token: InjectionToken<T>, provider: ValueProvider<T>): DependencyContainer;
    register<T>(token: InjectionToken<T>, provider: FactoryProvider<T>): DependencyContainer;
    register<T>(token: InjectionToken<T>, provider: TokenProvider<T>, options?: RegistrationOptions): DependencyContainer;
    register<T>(token: InjectionToken<T>, provider?: ClassProvider<T>, options?: RegistrationOptions): DependencyContainer;
    register<T>(token: InjectionToken<T>, provider: constructor<T>, options?: RegistrationOptions): DependencyContainer;
    register(token, provider?, options?: RegistrationOptions): DependencyContainer {
        if(!provider) {
            provider = {useClass: token};
        }

        return this.container.register(token, provider, options);
    }

    registerInstance<T>(token: InjectionToken<T>, instance: T): DependencyContainer {
        return this.container.registerInstance<T>(token, instance);
    }

    registerSingleton<T>(from: InjectionToken<T>, to: InjectionToken<T>): DependencyContainer;
    registerSingleton<T>(token: constructor<T>): DependencyContainer;
    registerSingleton(from, to?): DependencyContainer {
        return this.container.registerSingleton(from, to);
    }

    registerType<T>(from: InjectionToken<T>, to: InjectionToken<T>): DependencyContainer {
        return this.container.registerType<T>(from, to);
    }

    resolve<T>(token: InjectionToken<T>): T {
        return this.container.resolve<T>(token);
    }

    resolveAll<T>(token: InjectionToken<T>): T[] {
        return this.container.resolveAll<T>(token);
    }
}
