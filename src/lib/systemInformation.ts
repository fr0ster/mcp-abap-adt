/**
 * The one reader of a system's `systeminformation`
 * (`/sap/bc/adt/core/http/systeminformation`), read here with its status
 * rather than through adt-clients' `getSystemInformation`, which answers
 * `null` both for a failed request and for a successful body it could not
 * read — and the server's rules need the two apart.
 *
 * The endpoint answers on ABAP Cloud and on-premise alike, so its presence
 * does not tell the system's kind (that comes from the connection's
 * parameters, `systemKindOf`). Both kinds are asked:
 *
 * - a `2xx` is an answer; `user` is the body's `userName` only when the body
 *   is a JSON object and `userName` a non-blank string (a body that is no
 *   JSON, JSON that is no object, a missing, empty, blank or non-string user
 *   is an answer without a user: `user` `undefined`);
 * - anything else (`404`, `405`, `501`, a `5xx`, an authentication or
 *   network failure) is thrown as it came — a status other than a `2xx` the
 *   connection handed back instead of throwing as a
 *   `SystemInformationStatusError`. A `404` is the function unavailable
 *   (`isSystemInformationUnavailable`): on-premise the callers then take the
 *   configured settings; on ABAP Cloud, which always has it, the
 *   destination is not a valid ABAP Cloud system
 *   (`CloudWithoutSystemInformationError`).
 *
 * The request is the helper's: GET, the same `Accept`, no timeout, the
 * cache-busting parameter Eclipse sends.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';

const SYSTEM_INFORMATION_URL = '/sap/bc/adt/core/http/systeminformation';
const SYSTEM_INFORMATION_ACCEPT =
  'application/vnd.sap.adt.core.http.systeminformation.v1+json';

export type SystemInformation = {
  /** The session's user as the system names it; `undefined`: none named. */
  readonly user: string | undefined;
  /** The system id, when the answer carries one as a string. */
  readonly systemId: string | undefined;
};

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
  const response: { status?: unknown; data?: unknown } =
    await connection.makeAdtRequest({
      url: SYSTEM_INFORMATION_URL,
      method: 'GET',
      timeout: 0,
      headers: { Accept: SYSTEM_INFORMATION_ACCEPT },
      params: { _: Date.now() },
    });
  // A connection that hands back a status other than a 2xx instead of
  // throwing it (an embedder's own) is read by that status all the same.
  const status = response.status;
  if (typeof status === 'number' && (status < 200 || status > 299)) {
    throw new SystemInformationStatusError(status);
  }
  const body = objectOf(response.data);
  const named = fieldOf(body, 'userName');
  const id = fieldOf(body, 'systemID');
  return {
    user: typeof named === 'string' && named.trim() !== '' ? named : undefined,
    systemId: typeof id === 'string' ? id : undefined,
  };
}

/**
 * A `systeminformation` request a connection answered with a status other
 * than a `2xx` instead of throwing it: thrown as such
 * a failure is, its status on `response` the way a failed request carries it.
 */
export class SystemInformationStatusError extends Error {
  readonly response: { readonly status: number };
  constructor(status: number) {
    super(`systeminformation answered ${status}`);
    this.name = 'SystemInformationStatusError';
    this.response = { status };
  }
}

/** The HTTP status a failed request carries, if any (read guarded). */
function statusOf(error: unknown): unknown {
  try {
    return (error as { response?: { status?: unknown } } | null)?.response
      ?.status;
  } catch {
    return undefined;
  }
}

/**
 * Whether `error` — what `readSystemInformation` threw — is the function
 * unavailable on the system: a `404`, and only a `404`.
 */
export function isSystemInformationUnavailable(error: unknown): boolean {
  return statusOf(error) === 404;
}
