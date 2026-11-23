/**
 * Git credentials bound to approved endpoints (spec §5.1): a credential is
 * attached to an abapGit request only when its remote URL is an approved
 * endpoint, or one of its trusted aliases, exactly. Any host and any port:
 * there is no host list and no host-specific parsing (spec §5.4).
 *
 * An endpoint is an exact remote URL: scheme `https`, the host lower-cased,
 * a non-default port when there is one, and the path as written — no `.git`
 * and no trailing `/` is merged, so `…/repo`, `…/repo/` and `…/repo.git`
 * are three endpoints, and the path's letter case counts. Userinfo, a query
 * or a fragment in a configured URL or alias is a start error; in a `url`
 * argument a refusal before anything is sent.
 *
 * No URL and no credential is part of any words here: a configured URL may
 * carry a credential in its userinfo, which is exactly what is refused.
 */

import type { IAbapGitCredentials } from '@mcp-abap-adt/interfaces-adt';

/** One approved endpoint as configured: its URL, its credential and its trusted aliases. */
export interface ApprovedEndpointConfig {
  readonly url: string;
  readonly user: string;
  /** What SAP's abapGit takes as the password: a password or a token. */
  readonly token: string;
  readonly aliases?: readonly string[] | undefined;
}

/** An approved endpoint, checked: what a remote URL is compared with. */
export interface ApprovedEndpoint {
  /** The configured URL, as written: what SAP is sent when an alias matched. */
  readonly url: string;
  /** The configured URL's exact form (`exactRemote`). */
  readonly exact: string;
  /** Each trusted alias's exact form. */
  readonly aliases: readonly string[];
  readonly credentials: IAbapGitCredentials;
}

/** A remote URL bound to an approved endpoint: what is sent, and with which credential. */
export interface BoundEndpoint {
  /** The URL SAP is sent: the configured URL, whichever of its forms matched. */
  readonly sendUrl: string;
  readonly credentials: IAbapGitCredentials;
}

/** Why a remote URL cannot be an endpoint. */
export type RemoteUrlFault =
  | 'not-a-url'
  | 'not-https'
  | 'userinfo'
  | 'query'
  | 'fragment'
  | 'dot-segment'
  | 'not-exact'
  | 'not-git-scheme';

/** A configuration that cannot be served: the server does not start. */
export class ApprovedEndpointError extends Error {
  constructor(readonly words: string) {
    super(words);
    this.name = 'ApprovedEndpointError';
  }
}

const FAULT_WORDS: Readonly<Record<RemoteUrlFault, string>> = {
  'not-a-url': 'is not an absolute URL',
  'not-https': 'is not an https URL',
  userinfo: 'carries a user or a password in the URL',
  query: 'carries a query',
  fragment: 'carries a fragment',
  'dot-segment': 'carries a dot segment in its path',
  'not-exact': 'is not written as the URL parser writes it',
  'not-git-scheme': 'is not an https or http URL',
};

/** The fixed words of a remote URL fault, naming the place, never the URL. */
export function remoteUrlFaultWords(
  place: string,
  fault: RemoteUrlFault,
): string {
  return `${place} ${FAULT_WORDS[fault]}`;
}

/**
 * The exact form of a remote URL — `https://<host, lower-cased>[:<port>]<path>`
 * — or the fault that keeps it from being one. A `?` or `#` anywhere is a
 * query or a fragment, an `@` in the authority userinfo (an empty one
 * included), a `.` or `..` path segment — literal or percent-encoded — a dot
 * segment. Beyond those, one rule: the raw text is accepted only as the
 * WHATWG URL parser writes it (`href`) — the same scheme, the same authority
 * but for the host's letter case, the same path but for the `/` the parser
 * gives an empty one. Anything the parser would change (an extra slash, a
 * tab or a space, a `\`, the scheme's case, a default port written out) is
 * `not-exact`. The path is kept as written.
 */
export function exactRemote(
  text: string,
): { readonly exact: string } | { readonly fault: RemoteUrlFault } {
  if (text.includes('?')) return { fault: 'query' };
  if (text.includes('#')) return { fault: 'fragment' };
  const raw = rawParts(text);
  if (raw === undefined) return { fault: 'not-a-url' };
  if (raw.authority.includes('@')) return { fault: 'userinfo' };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { fault: 'not-a-url' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { fault: 'userinfo' };
  }
  // Only https and http are git remotes SAP's abapGit reaches.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { fault: 'not-git-scheme' };
  }
  if (raw.path.split('/').some(isDotSegment)) return { fault: 'dot-segment' };
  const written = rawParts(parsed.href);
  if (
    written === undefined ||
    raw.scheme !== written.scheme ||
    raw.authority.toLowerCase() !== written.authority ||
    !(raw.path === written.path || (raw.path === '' && written.path === '/'))
  ) {
    return { fault: 'not-exact' };
  }
  if (parsed.protocol !== 'https:') return { fault: 'not-https' };
  return { exact: `https://${written.authority}${raw.path}` };
}

/** The raw scheme, authority and path of `<scheme>://<authority><path>`, as written. */
function rawParts(text: string):
  | {
      readonly scheme: string;
      readonly authority: string;
      readonly path: string;
    }
  | undefined {
  const start = text.indexOf('://');
  if (start <= 0) return undefined;
  const scheme = text.slice(0, start);
  const rest = text.slice(start + 3);
  const slash = rest.indexOf('/');
  return slash < 0
    ? { scheme, authority: rest, path: '' }
    : { scheme, authority: rest.slice(0, slash), path: rest.slice(slash) };
}

/** Whether a path segment is `.` or `..`, any dot written as `%2e` or `%2E`. */
function isDotSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return (
    lower === '.' ||
    lower === '..' ||
    lower === '%2e' ||
    lower === '.%2e' ||
    lower === '%2e.' ||
    lower === '%2e%2e'
  );
}

/**
 * The configured endpoints, checked once at the start: each URL and alias
 * an exact remote (`exactRemote`), a user and a token given. A fault is an
 * `ApprovedEndpointError` naming the entry by its place, never its value.
 */
export function parseApprovedEndpoints(
  config: readonly ApprovedEndpointConfig[],
  source: string,
): readonly ApprovedEndpoint[] {
  return config.map((entry, index) => {
    const read = approvedEndpointOf(entry, `${source}: endpoint ${index + 1}`);
    if ('fault' in read) throw new ApprovedEndpointError(read.fault);
    return read.endpoint;
  });
}

/**
 * One configured endpoint, checked (`parseApprovedEndpoints`), or the fixed
 * words of its fault, naming `place`.
 */
export function approvedEndpointOf(
  entry: ApprovedEndpointConfig,
  place: string,
): { readonly endpoint: ApprovedEndpoint } | { readonly fault: string } {
  const url = exactRemote(entry.url);
  if ('fault' in url) {
    return { fault: remoteUrlFaultWords(`${place} url`, url.fault) };
  }
  const aliases: string[] = [];
  for (const [at, alias] of (entry.aliases ?? []).entries()) {
    const read = exactRemote(alias);
    if ('fault' in read) {
      return {
        fault: remoteUrlFaultWords(`${place} alias ${at + 1}`, read.fault),
      };
    }
    aliases.push(read.exact);
  }
  if (entry.user === '') return { fault: `${place} has no user` };
  if (entry.token === '') return { fault: `${place} has no token` };
  return {
    endpoint: {
      url: entry.url,
      exact: url.exact,
      aliases,
      credentials: { user: entry.user, password: entry.token },
    },
  };
}

/**
 * The approved endpoint `url` is, exactly — its configured URL or one of its
 * aliases — with what SAP is sent and the credential; `undefined` when none
 * matches (the request then goes without a credential, spec §9.3 a) or when
 * `url` is no exact remote. The first matching endpoint wins.
 */
export function matchEndpoint(
  url: string,
  endpoints: readonly ApprovedEndpoint[],
): BoundEndpoint | undefined {
  const read = exactRemote(url);
  if ('fault' in read) return undefined;
  for (const endpoint of endpoints) {
    if (
      endpoint.exact === read.exact ||
      endpoint.aliases.includes(read.exact)
    ) {
      return { sendUrl: endpoint.url, credentials: endpoint.credentials };
    }
  }
  return undefined;
}

/**
 * Whether a `url` argument is refused before anything is sent: it is no
 * URL, or carries userinfo, a query, a fragment or a dot segment. An `http`
 * URL is SAP's to answer, without a credential.
 */
export function argumentUrlFault(url: string): RemoteUrlFault | undefined {
  const read = exactRemote(url);
  if (!('fault' in read)) return undefined;
  return read.fault === 'not-https' ? undefined : read.fault;
}
