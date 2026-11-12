/**
 * The lock handle a compact call would be sent under, read from its
 * arguments as they reach the server (#4): the server refuses a handle its
 * instance does not hold before it takes a connection, so a refused call
 * sends nothing — no logon either. Each function answers what its handler
 * checks with `lockHeldHere`, and `undefined` where the handler sends under
 * no handle (or refuses a missing one in words of its own).
 */
import {
  acceptedOf,
  EMPTIED_INCLUDE_TYPES,
} from '@mcp-abap-adt/lib/compact-shared';
import type { ToolArgs } from '@mcp-abap-adt/lib/handlers';

/** A non-blank string, trimmed, as the handlers read it. */
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** `HandlerUnlock`: its handle, except a service binding's empty one (nothing to unlock). */
export function unlockHeldLockOf(args: ToolArgs): string | undefined {
  const handle = args.lock_handle;
  if (typeof handle !== 'string') return undefined;
  const type =
    typeof args.object_type === 'string'
      ? acceptedOf(args.object_type, ['SERVICE_BINDING'])
      : undefined;
  return type === 'SERVICE_BINDING' && handle === '' ? undefined : handle;
}

/** `HandlerUpdate`: its handle, except a service binding's empty one (a publication under none). */
export function updateHeldLockOf(args: ToolArgs): string | undefined {
  if (args.object_type === 'SERVICE_BINDING' && args.lock_handle === '') {
    return undefined;
  }
  return text(args.lock_handle);
}

/** `HandlerDelete`: an emptied include's handle; every other type deletes under none. */
export function deleteHeldLockOf(args: ToolArgs): string | undefined {
  const emptied =
    typeof args.object_type === 'string'
      ? acceptedOf(args.object_type, EMPTIED_INCLUDE_TYPES)
      : undefined;
  return emptied === undefined ? undefined : text(args.lock_handle);
}
