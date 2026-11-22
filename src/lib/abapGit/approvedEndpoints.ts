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
  | 'fragment';

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
 * — or the fault that keeps it from being one. The WHATWG URL parser reads
 * it (the host lower-cased, a default port dropped); the path is compared as
 * the parser leaves it. A `?` or `#` anywhere is a query or a fragment, an
 * empty one included.
 */
export function exactRemote(
  text: string,
): { readonly exact: string } | { readonly fault: RemoteUrlFault } {
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { fault: 'not-a-url' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { fault: 'userinfo' };
  }
  if (parsed.search !== '' || text.includes('?')) return { fault: 'query' };
  if (parsed.hash !== '' || text.includes('#')) return { fault: 'fragment' };
  if (parsed.protocol !== 'https:') return { fault: 'not-https' };
  const port = parsed.port === '' ? '' : `:${parsed.port}`;
  return { exact: `https://${parsed.hostname}${port}${parsed.pathname}` };
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
 * Whether a `url` argument is refused before anything is sent: it carries
 * userinfo, a query or a fragment. Any other URL — `http`, or one the
 * parser does not read — is SAP's to answer, without a credential.
 */
export function argumentUrlFault(url: string): RemoteUrlFault | undefined {
  const read = exactRemote(url);
  if (!('fault' in read)) return undefined;
  return read.fault === 'userinfo' ||
    read.fault === 'query' ||
    read.fault === 'fragment'
    ? read.fault
    : undefined;
}
