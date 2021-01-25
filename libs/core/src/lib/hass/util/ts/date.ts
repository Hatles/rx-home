/**
 * Returns the value (in fractional seconds) of a clock
 */
export function monotonic(): number {
    return window.performance.now() / 10 ** 3
}
export function monotonicMs(): number {
    return window.performance.now()
}
