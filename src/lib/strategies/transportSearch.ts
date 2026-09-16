import type { IAbapConnection, ILogger } from '@mcp-abap-adt/interfaces';
import { TRANSPORT_SEARCH_CONFIGURATIONS_URL } from '@mcp-abap-adt/interfaces';
import { makeAdtRequestWithTimeout } from '../utils';
import { parseStructure } from './reading';

/**
 * The saved search a transport listing runs, resolved here.
 *
 * **Why the consumer makes this call.** `AdtRequest.list()` takes a
 * `configUri` and, when it is not given one, resolves a saved search itself:
 * "With `configUri`: one request. Without: two — the configurations, then the
 * list." That second request is the one this file takes back. Two reasons,
 * both consequences rather than preferences:
 *
 * 1. **It can refuse, and its refusal is not readable.** The resolution is a
 *    `protected` member, so no `analyse` of ours reaches it and no result
 *    strategy shapes its answer. Whatever that request says arrives as a
 *    throw from inside a member we called for something else.
 * 2. **It throws on a system it cannot decide for.** Given several saved
 *    searches, the shipped resolver refuses to guess and throws, telling the
 *    caller to "pass configUri explicitly" — which `ListTransports` has no
 *    parameter for and is not getting one, since the tool surface does not
 *    change in this migration. On such a system the tool simply does not
 *    work, and the caller cannot fix it.
 *
 * So the consumer asks for the configurations, decides what to do with what
 * comes back, and passes a `configUri` down. `list()` then makes exactly one
 * request, the same total as before.
 *
 * **What we do with several.** Not guess, and not refuse either: run each of
 * them and merge, capped. A saved search is a filter, so merging can only
 * widen the candidate set, and the caller's own `user`/`modifiable_only`
 * narrow it again afterwards — a request that belongs in the answer cannot be
 * lost by looking in more than one place, and one that does not is filtered
 * out either way. Duplicates are collapsed by request number downstream, in
 * `parseTransportListValue`.
 *
 * Measured against the trial system (2026-09-16): one configuration, so the
 * merge path is reasoned rather than observed, and the cap says so.
 */
export interface TransportSearchConfiguration {
  /** The address to pass to `list({ configUri })`. */
  uri: string;
  /** The server's version marker, kept because the document carries it. */
  etag?: string;
  /** The configuration's own attributes, unrenamed. */
  attributes: Record<string, string>;
}

/**
 * How many saved searches one listing will run.
 *
 * A bound rather than a principle, in the same spirit as `MAX_STATUS_POLLS`:
 * the only system this has been run against holds one configuration, so no
 * measurement justifies a particular number. Five is enough that a system
 * with a handful is served completely, and small enough that a system with
 * fifty does not turn one tool call into fifty round trips. The answer says
 * when the cap was reached, so a caller is never quietly given a partial
 * list.
 */
export const MAX_SEARCH_CONFIGURATIONS = 5;

/**
 * Without this exact media type the endpoint answers **406**, measured on
 * trial. It is the same constant the shipped client sends
 * (`ACCEPT_TRANSPORT_CONFIGURATIONS`), which is not exported from the
 * package — the URL is, from `@mcp-abap-adt/interfaces`, which is why only
 * this one string is restated here.
 */
const ACCEPT_CONFIGURATIONS = 'application/vnd.sap.adt.configurations.v1+xml';

function attrsOf(node: unknown): Record<string, string> {
  const a = (node as { '@'?: Record<string, unknown> } | undefined)?.['@'];
  if (!a || typeof a !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(a)) {
    out[key] = String(value);
  }
  return out;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Read an attribute whether or not ADT namespace-qualifies it.
 *
 * Releases differ on whether these carry a prefix; pinning one spelling
 * answers an empty string on a system using the other. The shipped
 * `parseSearchConfigurations` does the same, for the same reason.
 */
function attr(
  attributes: Record<string, string>,
  name: string,
): string | undefined {
  for (const [key, value] of Object.entries(attributes)) {
    if (key.split(':').pop() !== name) continue;
    const text = value.trim();
    if (text.length > 0) return text;
  }
  return undefined;
}

/**
 * The configurations, out of the document the endpoint answers.
 *
 * Measured against `read-transport-search-configurations--01-searchconfiguration-configurations`
 * in the corpus: `configurations:configurations` holding
 * `configuration:configuration` entries, each addressed by an `atom:link`'s
 * `href`. Namespace prefixes are read as they arrive, both spellings
 * accepted, because `parseStructure` keeps them.
 */
export function parseSearchConfigurations(
  value: unknown,
): TransportSearchConfiguration[] {
  const record = value as Record<string, unknown> | null | undefined;
  const root = (record?.['configurations:configurations'] ??
    record?.configurations) as Record<string, unknown> | undefined;
  if (!root) return [];

  const nodes = asArray(
    root['configuration:configuration'] ?? root.configuration,
  );

  const configurations: TransportSearchConfiguration[] = [];
  for (const node of nodes) {
    const entry = node as Record<string, unknown>;
    const links = asArray(entry['atom:link'] ?? entry.link);
    let uri: string | undefined;
    let etag: string | undefined;
    for (const link of links) {
      const linkAttrs = attrsOf(link);
      const href = attr(linkAttrs, 'href');
      if (!href) continue;
      uri = href;
      etag = attr(linkAttrs, 'etag');
      break;
    }
    // A configuration we cannot address is not one we can search with.
    if (!uri) continue;
    configurations.push({
      uri,
      ...(etag ? { etag } : {}),
      attributes: attrsOf(entry),
    });
  }
  return configurations;
}

/**
 * Ask the system which saved searches it holds.
 *
 * One request, made here rather than inside `list()`. A refusal arrives as a
 * throw from `makeAdtRequestWithTimeout` — the same way it does for every other endpoint
 * this repository addresses directly (`handleGetInclude`,
 * `handleGetEnhancements`, `handleGetTransport`) — and `answer()` names it
 * for the caller.
 */
export async function fetchSearchConfigurations(
  connection: IAbapConnection,
  logger?: ILogger,
): Promise<TransportSearchConfiguration[]> {
  const response = await makeAdtRequestWithTimeout(
    connection,
    TRANSPORT_SEARCH_CONFIGURATIONS_URL,
    'GET',
    'default',
    undefined,
    undefined,
    { Accept: ACCEPT_CONFIGURATIONS },
  );
  const configurations = parseSearchConfigurations(
    parseStructure((response as { data?: unknown })?.data),
  );
  logger?.debug(
    `transport search configurations: ${configurations.length} found`,
  );
  return configurations;
}
