import {Callable, CALLABLE_T} from "./types";

/**
 * Split a state entity_id into domain, object_id.
 * @param entity_id
 */
export function split_entity_id(entity_id: string): string[] {
  return entity_id.split(".", 1)
}

const VALID_ENTITY_ID = /^(?!.+__)(?!_)[\da-z_]+(?<!_)\.(?!_)[\da-z_]+(?<!_)$/;

/**
 * Test if an entity ID is a valid format.
  Format: <domain>.<entity> where both are slugs.
 * @param entity_id
 */
export function valid_entity_id(entity_id: string): boolean {
  //
  return VALID_ENTITY_ID.test(entity_id)
}

/**
 * Test if a state is valid.
 * @param state
 */
export function valid_state(state: string): boolean {
  return state.length < 256
}

/**
 * """Annotation to mark method as safe to call from within the event loop."""
 * @param func
 */
export function callback(func: CALLABLE_T): CALLABLE_T {
  //
  setattr(func, "_hass_callback", true)
  return func
}

/***
 * """Check if function is safe to be called in the event loop."""
 * @param func
 */
export function is_callback(func: Callable): boolean {
  return getattr(func, "_hass_callback", false) === true;
}
