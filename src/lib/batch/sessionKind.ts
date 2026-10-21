/**
 * The session kind of a recorded request — the key adt-clients'
 * `AdtBatchConnection` partitions its queue by (`envelopeKey`, 34.2.0):
 * consecutive requests of one kind go into one envelope, a change of kind
 * starts the next. A batch holds one kind, decided by its first recorded
 * request, so every batch end sends one envelope.
 *
 * Read as adt-clients reads it, before the request is recorded:
 * - stateless: neither the batch connection's session (the member's own
 *   switch, scoped to its next request) nor the request's
 *   `X-sap-adt-sessiontype` header is `stateful`;
 * - a debugger batch: every request is the one stateful kind;
 * - otherwise `_action=LOCK` / `_action=UNLOCK` in the URL (or its params)
 *   is `lock` / `unlock`; any other stateful request is `stateful` — none
 *   is sent today (only LOCK and UNLOCK go stateful), and it would be a
 *   kind of its own as adt-clients keeps it.
 */
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

export type SessionKind = 'lock' | 'unlock' | 'stateless' | 'stateful';

/** `request`'s kind, recorded on a batch connection whose session is `session`. */
export function requestKind(
  request: IAbapRequestOptions,
  session: 'stateful' | 'stateless',
  endpoint: 'communication' | 'debugger',
): SessionKind {
  const stateful =
    session === 'stateful' ||
    Object.entries(request.headers ?? {}).some(
      ([key, value]) =>
        key.toLowerCase() === 'x-sap-adt-sessiontype' && value === 'stateful',
    );
  if (!stateful) return 'stateless';
  if (endpoint === 'debugger') return 'stateful';
  const action =
    new URL(request.url, 'https://batch.invalid').searchParams.get('_action') ??
    new URLSearchParams(
      (request.params ?? {}) as ConstructorParameters<
        typeof URLSearchParams
      >[0],
    ).get('_action');
  if (action === 'LOCK') return 'lock';
  if (action === 'UNLOCK') return 'unlock';
  return 'stateful';
}

/** How a kind is named in the refusal's words. */
export function sessionKindLabel(kind: SessionKind): string {
  switch (kind) {
    case 'lock':
      return 'LOCK';
    case 'unlock':
      return 'UNLOCK';
    case 'stateless':
      return 'stateless';
    case 'stateful':
      return 'stateful';
  }
}
