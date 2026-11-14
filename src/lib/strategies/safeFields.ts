/**
 * What reaches a caller, and how little of it.
 *
 * Two narrowings, shared by `answer.ts` — which renders a failure payload — and
 * by `withLock.ts`, which builds a carrier that rides inside a thrown error on
 * its way there. Neither should hold its own copy of the rule.
 */

import type { FailureEntry } from '../answer';
import {
  type AnswerObject,
  type AnswerValue,
  answerValueOf,
  isAnswerList,
} from '../json';
import { child, isElement, isList } from '../thrownValue';
import type { LeftBehind } from './step';

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
      request?: FailedRequest | undefined;
      failures?: readonly FailureEntry[];
    } & LeftLocked)
  | ({
      error: 'client_threw';
      message: string;
      failures?: readonly FailureEntry[];
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

/** The request a failure names (`IAdtError.request`): its method and its url. */
export interface FailedRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
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
  value: FailedRequest | undefined,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const { method, url } = value;
  if (method === undefined && url === undefined) return undefined;

  const out: Record<string, string> = {};
  if (method !== undefined) out.method = method;
  if (url !== undefined) out.url = withoutLockHandle(url);
  return out;
}

/** A request read from a value of no type (a thrown carrier's), its two fields by their own types. */
function requestRead(value: unknown): FailedRequest | undefined {
  const method = child(value, 'method');
  const url = child(value, 'url');
  return {
    ...(typeof method === 'string' && { method }),
    ...(typeof url === 'string' && { url }),
  };
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
  value: Cleanup | LeftBehind | undefined,
): AnswerObject | undefined {
  if (value === undefined) return undefined;
  const out: { [key: string]: AnswerValue } = {};

  if (value.message !== undefined) out.message = value.message;
  if ('error' in value) out.error = value.error;
  else if ('origin' in value && value.origin !== undefined)
    out.origin = value.origin;

  const request = 'request' in value ? safeRequest(value.request) : undefined;
  if (request !== undefined) out.request = request;

  // What was left behind as failures of their own: entries already built in
  // the shape of every other failure (`failureEntry`, `thrownEntry`).
  if (value.failures !== undefined && value.failures.length > 0)
    out.failures = value.failures;
  if ('notes' in value && value.notes !== undefined && value.notes.length > 0)
    out.notes = value.notes;

  // The lock that may be left behind: each field as its type says, the
  // object rebuilt from its two strings — nothing else of it passes.
  if ('left_locked' in value && value.left_locked === true)
    out.left_locked = true;
  if ('lock_handle' in value && value.lock_handle !== undefined) {
    if (value.lock_handle !== '') out.lock_handle = value.lock_handle;
  }
  const object = 'object' in value ? lockedObject(value.object) : undefined;
  if (object !== undefined)
    out.object = { type: object.type, name: object.name };
  if ('warning' in value && value.warning !== undefined)
    out.warning = value.warning;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** A locked object with both its names, copied by name; one with an empty name is absent. */
function lockedObject(
  value: LockedObject | undefined,
): LockedObject | undefined {
  if (value === undefined || value.type === '' || value.name === '') {
    return undefined;
  }
  return { type: value.type, name: value.name };
}

/**
 * The cleanup a thrown value carries, field by field: a value from outside
 * the type system (whatever was thrown), each field read by its own type.
 * The same fields as `safeCleanup`, in the same two exclusive shapes.
 */
export function thrownCleanup(value: unknown): AnswerObject | undefined {
  if (!isElement(value)) return undefined;
  const carrier = value;
  const out: { [key: string]: AnswerValue } = {};

  if (typeof carrier.message === 'string') out.message = carrier.message;
  if (carrier.error === 'client_threw') out.error = 'client_threw';
  else if (typeof carrier.origin === 'string') out.origin = carrier.origin;

  const request = safeRequest(requestRead(carrier.request));
  if (request !== undefined) out.request = request;

  const failures = isList(carrier.failures)
    ? answerValueOf(carrier.failures)
    : undefined;
  if (failures !== undefined && isAnswerList(failures) && failures.length > 0)
    out.failures = failures;
  const notes = isList(carrier.notes)
    ? answerValueOf(carrier.notes)
    : undefined;
  if (notes !== undefined && isAnswerList(notes) && notes.length > 0)
    out.notes = notes;

  if (carrier.left_locked === true) out.left_locked = true;
  if (typeof carrier.lock_handle === 'string' && carrier.lock_handle !== '')
    out.lock_handle = carrier.lock_handle;
  const object = safeLockedObject(carrier.object);
  if (object !== undefined)
    out.object = { type: object.type, name: object.name };
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
