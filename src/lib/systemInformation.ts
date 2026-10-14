/**
 * The one reader of a system's `systeminformation`
 * (`/sap/bc/adt/core/http/systeminformation`), read here with its status
 * rather than through adt-clients' `getSystemInformation`, which answers
 * `null` both for an absent endpoint and for a successful body it could not
 * read — and the server's rules need the two apart:
 *
 * - **absent** — the request failed with HTTP `404`, and only `404`;
 * - **answered** — a `2xx`; `user` is the body's `userName` only when the body
 *   is a JSON object and `userName` a non-blank string (a body that is no
 *   JSON, JSON that is no object, a missing, empty, blank or non-string user
 *   is an answer without a user: `user` `undefined`);
 * - anything else (`405`, `501`, a `5xx`, an authentication or network
 *   failure) is thrown as it came.
 *
 * The request is the helper's: GET, the same `Accept`, no timeout, the
 * cache-busting parameter Eclipse sends.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

const SYSTEM_INFORMATION_URL = '/sap/bc/adt/core/http/systeminformation';
const SYSTEM_INFORMATION_ACCEPT =
  'application/vnd.sap.adt.core.http.systeminformation.v1+json';

export type SystemInformation =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'answered';
      /** The session's user as the system names it; `undefined`: none named. */
      readonly user: string | undefined;
      /** The system id, when the answer carries one as a string. */
      readonly systemId: string | undefined;
    };

/** The HTTP status a failed request carries, if any. */
function statusOf(error: unknown): unknown {
  try {
    return (error as { response?: { status?: unknown } } | null)?.response
      ?.status;
  } catch {
    return undefined;
  }
}

/** The body as a plain JSON object, else `undefined`. */
function objectOf(data: unknown): Record<string, unknown> | undefined {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function fieldOf(
  body: Record<string, unknown> | undefined,
  name: string,
): unknown {
  if (body === undefined) return undefined;
  try {
    return body[name];
  } catch {
    return undefined;
  }
}

export async function readSystemInformation(
  connection: IAbapConnection,
): Promise<SystemInformation> {
  let data: unknown;
  try {
    const response = await connection.makeAdtRequest({
      url: SYSTEM_INFORMATION_URL,
      method: 'GET',
      timeout: 0,
      headers: { Accept: SYSTEM_INFORMATION_ACCEPT },
      params: { _: Date.now() },
    });
    data = response.data;
  } catch (error) {
    if (statusOf(error) === 404) return { kind: 'absent' };
    throw error;
  }
  const body = objectOf(data);
  const named = fieldOf(body, 'userName');
  const id = fieldOf(body, 'systemID');
  return {
    kind: 'answered',
    user: typeof named === 'string' && named.trim() !== '' ? named : undefined,
    systemId: typeof id === 'string' ? id : undefined,
  };
}

/**
 * A lookup that found no `systeminformation` endpoint (`404`) where the
 * server needs it — on ABAP Cloud, the system context a call runs with: a
 * failed lookup, never an answer without a user.
 */
export class SystemInformationAbsentError extends Error {
  constructor() {
    super('the system has no systeminformation endpoint');
    this.name = 'SystemInformationAbsentError';
  }
}
