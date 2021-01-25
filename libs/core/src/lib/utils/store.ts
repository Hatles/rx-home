import {BehaviorSubject, Observable, pipe, Subject, Subscription} from "rxjs";
import {distinctUntilChanged, filter, map} from "rxjs/operators";
import {Object as TsObject} from "ts-toolbelt";
import {ComponentConfiguration} from "../components/models/component";

export interface StateChanges<T> {
    previous: T;
    next: T;
    properties: StatePropertyChange<any>[];
}

export interface StatePropertyChange<P> {
    name: string;
    previous: P;
    next: P;
}

export interface IStore<T extends object> {
    set(value: T)
    patch(value: Partial<T>)
    get(): Observable<T>
    getSnapshot(): T
    change(): Observable<StateChanges<T>>
    setProperty<P extends keyof TsObject.Path<T, []>>(name: P, value: TsObject.Path<T, [P]>)
    getProperty<P extends keyof TsObject.Path<T, []>>(name: P): Observable<TsObject.Path<T, [P]>>
    getPropertySnapshot<P extends keyof TsObject.Path<T, []>>(name: P): TsObject.Path<T, [P]>
    propertyChange<P extends keyof TsObject.Path<T, []>>(name: P): Observable<StatePropertyChange<TsObject.Path<T, [P]>>>

    subscribeChanges(callback: (changes: StateChanges<T>) => void): Subscription
    subscribePropertyChanges<P extends keyof TsObject.Path<T, []>>(name: P, callback: (change: StatePropertyChange<TsObject.Path<T, [P]>>) => void): Subscription
}

export class Store<T extends object> implements IStore<T> {
    private state: BehaviorSubject<T> = new BehaviorSubject<T>();
    private changes: Subject<StateChanges<T>>;

    constructor(initialState: T = {}) {
        this.state = new BehaviorSubject<T>(initialState);
        this.changes = new BehaviorSubject<T>();
    }

    get(): Observable<T> {
        return this.state.asObservable();
    }

    getSnapshot(): T {
        return {...this.state.value};
    }

    set(value: T) {
        const previous = {...this.state.value};
        const next = {...value};
        const propertyChanges = Object.keys(value).map(key => this.getPropertyChange(key, value[key])).filter(c => !!c)

        if (propertyChanges.length) {
            this.state.next(next)

            const changes: StateChanges<T> = {
                previous: previous,
                next: next,
                properties: propertyChanges
            }
            this.changes.next(changes);
        }
    }

    patch(value: Partial<T>) {
        const next: T = {...this.state.value, ...value};
        this.set(next);
    }

    change(): Observable<StateChanges<T>> {
        return this.changes.asObservable();
    }

    getProperty<P extends keyof TsObject.Path<T, []>>(name: P): Observable<TsObject.Path<T, [P]>> {
        return this.get().pipe(map(state => state[name]), distinctUntilChanged());
    }

    getPropertySnapshot<P extends keyof TsObject.Path<T, []>>(name: P): TsObject.Path<T, [P]> {
        return this.state.value[name];
    }

    setProperty<P extends keyof TsObject.Path<T, []>>(name: P, value: TsObject.Path<T, [P]>) {
        this.set({...this.state.value, [name]: value});
    }

    propertyChange<P extends keyof TsObject.Path<T, []>>(name: P): Observable<StatePropertyChange<TsObject.Path<T, [P]>>> {
        return this.change().pipe(map(changes => changes.properties.find(p => p.name === name)), filter(c => !!c));
    }

    private getPropertyChange<P>(name: string, value: P): StatePropertyChange<P> {
        const previous = this.getPropertySnapshot<P>(name);
        const next = value;

        if (previous === next) {
            return null;
        }

        const change: StatePropertyChange<P> = {name: name, previous: previous, next: next};

        return change;
    }

    subscribeChanges(callback: (changes: StateChanges<T>) => void): Subscription {
        return this.change().subscribe(next => callback(next));
    }

    subscribePropertyChanges<P extends keyof TsObject.Path<T, []>>(name: string, callback: (change: StatePropertyChange<TsObject.Path<T, [P]>>) => void): Subscription {
        return this.propertyChange<P>(name).subscribe(next => callback(next));
    }
}

export interface CollectionState<T> {
    [key: string]: T
}

export interface ICollectionStore<T extends object> {
    add(name: string, value: T)
    remove(name: string)

    get(name: string): Observable<T>
    all(): Observable<T[]>
    getSnapshot(name: string): T
    allSnapshot(): T[]
}

export class CollectionStore<T extends object> implements ICollectionStore<T> {
    private store: IStore<CollectionState<T>>;

    constructor(initialState: CollectionState<T>) {
        this.store = new Store<CollectionState<T>>(initialState);
    }

    add(name: string, value: T) {
        this.store.setProperty(name, T)
    }

    all(): Observable<T[]> {
        return this.store.get().pipe(map(state => this.transformToList(state)));
    }

    allSnapshot(): T[] {
        return this.transformToList(this.store.getSnapshot());
    }

    get(name: string): Observable<T> {
        return this.store.getProperty<T>(name);
    }

    getSnapshot(name: string): T {
        return this.store.getPropertySnapshot<T>(name);
    }

    remove(name: string) {
        const state = {...this.store.getSnapshot()};
        delete state[name];
        this.store.set(state);
    }

    private transformToList(state: CollectionState<T>): T[] {
        return Object.keys(state).map(key => state[key]);
    }
}
