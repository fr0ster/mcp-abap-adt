/**
 * What reaches a caller, and how little of it.
 *
 * Two narrowings, shared by `answer.ts` — which renders a failure payload — and
 * by `withLock.ts`, which builds a carrier that rides inside a thrown error on
 * its way there. Neither should hold its own copy of the rule.
 */

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
  leftLocked?: true;
  lockHandle?: string;
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
  const method = (value as { method?: unknown } | undefined)?.method;
  const url = (value as { url?: unknown } | undefined)?.url;
  if (typeof method !== 'string' && typeof url !== 'string') return undefined;

  const out: Record<string, string> = {};
  if (typeof method === 'string') out.method = method;
  if (typeof url === 'string') out.url = url;
  return out;
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
  if (value === null || typeof value !== 'object') return undefined;

  const carrier = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof carrier.message === 'string') out.message = carrier.message;
  if (carrier.error === 'client_threw') out.error = 'client_threw';
  else if (typeof carrier.origin === 'string') out.origin = carrier.origin;

  const request = safeRequest(carrier.request);
  if (request !== undefined) out.request = request;

  // What was left behind as failures of their own: entries already built in
  // the shape of every other failure (`failureEntry`, `thrownEntry`).
  if (Array.isArray(carrier.failures) && carrier.failures.length > 0)
    out.failures = carrier.failures;
  if (Array.isArray(carrier.notes) && carrier.notes.length > 0)
    out.notes = carrier.notes;

  // The lock that may be left behind: each field by its own type, the object
  // rebuilt from its two strings — nothing else of it passes.
  if (carrier.leftLocked === true) out.leftLocked = true;
  if (typeof carrier.lockHandle === 'string' && carrier.lockHandle !== '')
    out.lockHandle = carrier.lockHandle;
  const object = safeLockedObject(carrier.object);
  if (object !== undefined) out.object = object;
  if (typeof carrier.warning === 'string') out.warning = carrier.warning;

  return Object.keys(out).length > 0 ? out : undefined;
}

/** `{ type, name }`, both non-empty strings, copied by name; anything else is absent. */
function safeLockedObject(value: unknown): LockedObject | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const { type, name } = value as { type?: unknown; name?: unknown };
  if (typeof type !== 'string' || type === '') return undefined;
  if (typeof name !== 'string' || name === '') return undefined;
  return { type, name };
}
