/**
 * The realm check before any logon (spec §8, "Safety of every live run").
 *
 * An unauthenticated `GET <baseUrl>/sap/bc/adt/discovery` must answer `401`:
 * - on premise, its `WWW-Authenticate` realm must equal the configured
 *   `environment.expected_realm` — empty refuses, before anything is sent;
 * - on the cloud, the session's JWT `exp` must lie in the future, decoded
 *   locally before anything is sent.
 * Any mismatch throws: the run stops before `globalSetup` logs on. No
 * credential travels with the check.
 */

import type { SystemKind } from '../../helpers/servedTools';

/** What the session states that the check reads. */
export interface SessionFacts {
  /** The session's access token (the cloud's), if any. */
  jwt: string | undefined;
}

const DISCOVERY = '/sap/bc/adt/discovery';

/** A JWT's payload member, decoded locally; `undefined` when unreadable. */
function jwtClaim(token: string, claim: string): unknown {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined) return undefined;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    return typeof decoded === 'object' && decoded !== null
      ? Reflect.get(decoded, claim)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The `realm` parameter of a `WWW-Authenticate` value; `undefined` when none. */
export function realmOf(header: string | null): string | undefined {
  if (header === null) return undefined;
  const marker = 'realm="';
  const start = header.indexOf(marker);
  if (start < 0) return undefined;
  const from = start + marker.length;
  const end = header.indexOf('"', from);
  return end < 0 ? undefined : header.slice(from, end);
}

/** Refuses unless the session's JWT is readable and its `exp` lies ahead. */
function requireLiveToken(session: SessionFacts): void {
  if (session.jwt === undefined || session.jwt === '') {
    throw new Error('realm check: the cloud session holds no JWT');
  }
  const exp = jwtClaim(session.jwt, 'exp');
  if (typeof exp !== 'number') {
    throw new Error('realm check: the session JWT carries no readable exp');
  }
  if (exp * 1000 <= Date.now()) {
    throw new Error(
      `realm check: the session JWT expired at ${new Date(exp * 1000).toISOString()}`,
    );
  }
}

export async function realmCheck(
  kind: SystemKind,
  baseUrl: string,
  expectedRealm: string,
  session: SessionFacts,
): Promise<void> {
  if (kind === 'onprem' && expectedRealm.trim() === '') {
    throw new Error(
      'realm check: environment.expected_realm is empty — set it to the on-premise system’s 401 realm',
    );
  }
  if (kind === 'cloud') requireLiveToken(session);
  const answer = await fetch(new URL(DISCOVERY, baseUrl), {
    method: 'GET',
    redirect: 'manual',
  });
  // The body is not read: only the status and the realm decide.
  await answer.body?.cancel();
  if (answer.status !== 401) {
    throw new Error(
      `realm check: ${DISCOVERY} answered ${answer.status} without a credential, not 401`,
    );
  }
  if (kind === 'onprem') {
    const realm = realmOf(answer.headers.get('www-authenticate'));
    if (realm !== expectedRealm) {
      throw new Error(
        `realm check: the system's realm is ${realm === undefined ? 'absent' : `"${realm}"`}, not the expected "${expectedRealm}"`,
      );
    }
  }
}
