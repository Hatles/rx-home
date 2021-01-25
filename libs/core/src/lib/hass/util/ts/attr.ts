export function setattr<T = any>(target: any, name: string, value: T) {
    target[name] = value;
}

export function getattr<T = any>(target: any, name: string, defaultValue?: T): T {
    return target.hasOwnProperty(name) ? target[name] : defaultValue;
}

export function hasattr<T = any>(target: any, name: string): boolean {
    return target.hasOwnProperty(name);
}
