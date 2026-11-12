/**
 * What reaches a caller, and how little of it.
 *
 * Two narrowings, shared by `answer.ts` — which renders a failure payload — and
 * by `withLock.ts`, which builds a carrier that rides inside a thrown error on
 * its way there. Neither should hold its own copy of the rule.
 */

import { child, isElement, isList } from '../xml/tree';

/**
 * What a failed release adds to a payload — in two shapes, and which one it is
 * carries information of its own.
 *
 * SAP refused the unlock: an origin, from the strategy that judged it.
 * Something in this process threw: `client_threw`, and deliberately no origin.
 */
export type Cleanup =
  | ({
      message: string;
      origin?: string;
      request?: unknown;
      failures?: readonly unknown[];
    } & LeftLocked)
  | ({
      error: 'client_threw';
      message: string;
      failures?: readonly unknown[];
    } & LeftLocked);

/** The object a lock was taken on: its type and its name, as the handler knows them. */
export interface LockedObject {
  type: string;
  name: string;
}

/**
 * What a failed release says about the lock, in both shapes: the object may
 * still be locked, under which handle, and the fixed words saying so
 * (fr0ster/mcp-abap-adt#314).
 */
export interface LeftLocked {
  left_locked?: true;
  lock_handle?: string;
  object?: LockedObject;
  warning?: string;
}

/**
 * Two fields, copied by name.
 *
 * The contract types `request` as `{ method?, url? }`, but a type is not a
 * filter: TypeScript accepts a wider object structurally, and a strategy that
 * put its transport config here would send headers, an Authorization bearer and
 * cookies straight to the model.
 */
export function safeRequest(
  value: unknown,
): Record<string, string> | undefined {
  const method = child(value, 'method');
  const url = child(value, 'url');
  if (typeof method !== 'string' && typeof url !== 'string') return undefined;

  const out: Record<string, string> = {};
  if (typeof method === 'string') out.method = method;
  if (typeof url === 'string') out.url = withoutLockHandle(url);
  return out;
}

/**
 * `url` without its lock handle: every query parameter whose name, decoded by
 * `URLSearchParams`, is `lockHandle` in any case is left out, the others kept
 * as they were written, and the `?` with them when none is left. A write
 * under a lock carries the handle in its url, and the failure's request is
 * rendered into answers and logs, where a handle does not belong.
 */
function withoutLockHandle(url: string): string {
  const at = url.indexOf('?');
  if (at < 0) return url;
  const kept = url
    .slice(at + 1)
    .split('&')
    .filter((part) =>
      [...new URLSearchParams(part).keys()].every(
        (name) => name.toLowerCase() !== 'lockhandle',
      ),
    );
  const path = url.slice(0, at);
  return kept.length > 0 ? `${path}?${kept.join('&')}` : path;
}

/**
 * The cleanup, field by field.
 *
 * Its two shapes are mutually exclusive: a cleanup built from a throw carries
 * no origin even when the object has one, because having none is that shape's
 * whole point.
 */
export function safeCleanup(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isElement(value)) return undefined;
  const carrier = value;
  const out: Record<string, unknown> = {};

  if (typeof carrier.message === 'string') out.message = carrier.message;
  if (carrier.error === 'client_threw') out.error = 'client_threw';
  else if (typeof carrier.origin === 'string') out.origin = carrier.origin;

  const request = safeRequest(carrier.request);
  if (request !== undefined) out.request = request;

  // What was left behind as failures of their own: entries already built in
  // the shape of every other failure (`failureEntry`, `thrownEntry`).
  if (isList(carrier.failures) && carrier.failures.length > 0)
    out.failures = carrier.failures;
  if (isList(carrier.notes) && carrier.notes.length > 0)
    out.notes = carrier.notes;

  // The lock that may be left behind: each field by its own type, the object
  // rebuilt from its two strings — nothing else of it passes.
  if (carrier.left_locked === true) out.left_locked = true;
  if (typeof carrier.lock_handle === 'string' && carrier.lock_handle !== '')
    out.lock_handle = carrier.lock_handle;
  const object = safeLockedObject(carrier.object);
  if (object !== undefined) out.object = object;
  if (typeof carrier.warning === 'string') out.warning = carrier.warning;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** `{ type, name }`, both non-empty strings, copied by name; anything else is absent. */
function safeLockedObject(value: unknown): LockedObject | undefined {
  const type = child(value, 'type');
  const name = child(value, 'name');
  if (typeof type !== 'string' || type === '') return undefined;
  if (typeof name !== 'string' || name === '') return undefined;
  return { type, name };
}
