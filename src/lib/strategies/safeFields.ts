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
  | { message: string; origin?: string; request?: unknown }
  | { error: 'client_threw'; message: string };

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

  return Object.keys(out).length > 0 ? out : undefined;
}
