/**
 * ListTransports Handler - List user's transport requests via ADT API
 *
 * Retrieves transport requests for the current user or specified user.
 * Uses AdtClient.getRequest().list().
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { TRANSPORT_SEARCH_CONFIGURATIONS_URL } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { parseStructure } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import {
  fetchSearchConfigurations,
  MAX_SEARCH_CONFIGURATIONS,
} from '../../../lib/strategies/transportSearch';
import { getEffectiveSystemContext } from '../../../lib/systemContext';

export const TOOL_DEFINITION = {
  name: 'ListTransports',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests. `user` and modifiable-only are both applied client-side, over every request the server's default search configuration answers — not sent to ADT as filters.",
  inputSchema: {
    type: 'object',
    properties: {
      user: {
        type: 'string',
        description:
          "SAP user name to filter to; applied client-side. If not provided, defaults to the current session user, so an unfiltered call already answers only that user's transports.",
      },
      modifiable_only: {
        type: 'boolean',
        description:
          'Only return modifiable (not yet released) transports; applied client-side. Default: true.',
      },
      ...DETAIL_PROPERTY,
    },
    required: [],
  },
} as const;

interface ListTransportsArgs {
  user?: string;
  modifiable_only?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

interface TransportEntry {
  number: string;
  description?: string;
  type?: string;
  status?: string;
  owner?: string;
  target?: string;
}

/**
 * Status implied by the container a request sits in, used only when the request
 * node itself carries no `tm:status` attribute.
 */
const STATUS_BY_CONTAINER: Record<string, string> = {
  'tm:modifiable': 'D',
  'tm:released': 'R',
};

/** Modifiable request statuses: D = modifiable, L = modifiable/protected. */
const MODIFIABLE_STATUSES = new Set(['D', 'L']);

function attrsOf(node: unknown): Record<string, string> {
  const a = (node as { '@'?: Record<string, string> } | undefined)?.['@'];
  return a && typeof a === 'object' ? a : {};
}

function collectRequestNodes(
  node: unknown,
  containerStatus: string,
  found: { req: Record<string, unknown>; containerStatus: string }[],
): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectRequestNodes(item, containerStatus, found);
    }
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '@') continue; // attributes of THIS node, not a child to descend into
    if (key === 'tm:request') {
      const requests = Array.isArray(value) ? value : [value];
      for (const req of requests) {
        if (req && typeof req === 'object') {
          found.push({ req: req as Record<string, unknown>, containerStatus });
        }
      }
      // Do not descend into a request: its children are tasks, not requests.
      continue;
    }
    collectRequestNodes(
      value,
      STATUS_BY_CONTAINER[key] ?? containerStatus,
      found,
    );
  }
}

/**
 * Parse the CTS transport list payload — same tree walk as before the
 * migration, adapted to the `structured` reading's `attributesGroupName: '@'`
 * (`resultSets.ts`'s `READING_BY_SLOT`; `list`'s slot name is `list`, mapped
 * to `structured` there), where the pre-migration parser had attributes
 * merged straight onto each node. `request` and `task` are both in
 * `structured`'s forced-array `REPEATABLE` set (added for this document — see
 * `reading.ts`), so a tree with exactly one request still parses as one.
 *
 * The endpoint negotiates `application/vnd.sap.adt.transportorganizertree.v1+xml`,
 * a *tree*: requests sit under status containers, one level below the category —
 * `tm:root > tm:workbench > tm:modifiable > tm:request` — and `tm:workbench` may
 * repeat, once per transport target. Requests are collected from anywhere in
 * the tree, and duplicates (same request number reached through more than one
 * branch) are collapsed, first occurrence winning.
 */
export function parseTransportListValue(value: unknown): TransportEntry[] {
  const found: { req: Record<string, unknown>; containerStatus: string }[] = [];
  collectRequestNodes(value, '', found);

  const seen = new Set<string>();
  const entries: TransportEntry[] = [];

  for (const { req, containerStatus } of found) {
    const a = attrsOf(req);
    const number = a['tm:number'] || a['adtcore:name'] || '';
    if (!number || seen.has(number)) {
      continue;
    }
    seen.add(number);
    entries.push({
      number,
      description: a['tm:desc'] || a['tm:description'] || '',
      type: a['tm:type'] || '',
      status: a['tm:status'] || containerStatus || '',
      owner: a['tm:owner'] || '',
      target: a['tm:target'] || '',
    });
  }

  return entries;
}

/**
 * `parseTransportListValue`, fed a raw XML string instead of an already-parsed
 * value — kept for `parseTransportListXml.test.ts` (the #168 regression
 * guard), which predates this migration and asserts against raw fixture XML.
 * Parses with the same `structured` reading's parser (`reading.ts`), so a
 * caller of either function sees identical results for identical documents.
 */
export function parseTransportListXml(xmlData: string): TransportEntry[] {
  return parseTransportListValue(parseStructure(xmlData));
}

/** Unknown status is kept: never hide a request because it was not classified. */
export function isModifiableStatus(status: string | undefined): boolean {
  return !status || MODIFIABLE_STATUSES.has(status);
}

export async function handleListTransports(
  context: HandlerContext,
  args: ListTransportsArgs,
) {
  const { connection, logger } = context;
  const modifiableOnly = args?.modifiable_only !== false;
  // `getEffectiveSystemContext`, not `getSystemContext`: the responsible a
  // request carries wins over the process-wide one, so a host serving several
  // SAP users from one process does not hand every concurrent request
  // whichever user resolved last. Arrived on `main` while this branch was
  // open (#202, #206); the migrated body below is this branch's.
  const user =
    args?.user ||
    getEffectiveSystemContext().responsible ||
    process.env.SAP_USERNAME ||
    '';

  logger?.debug(
    `ListTransports: user=${user}, modifiable_only=${modifiableOnly}`,
  );

  const detail = detailOf(args);

  // **Both requests a listing takes are made here.**
  //
  // `IListTransportsOptions` carries `configUri` and NOTHING else since
  // adt-clients 19 — `user` and `status` (the old `{user, status}` this
  // handler used to pass to `list()`) have nowhere to go any more, and the
  // package's own note says why: "The five filter parameters this used to
  // take were never read by the server; filtering is a property of the saved
  // configuration." So `user` and `modifiable_only` are applied CLIENT-SIDE
  // below, on whatever the searches answer — the same backstop this handler
  // already used for `modifiable_only` ("it is not established that the
  // endpoint honours the status query param", #168), now load-bearing for
  // `user` too.
  //
  // Which saved search to run is resolved by `fetchSearchConfigurations`
  // (`lib/strategies/transportSearch.ts`) rather than by `list()` itself.
  // That file carries the reasoning; the short version is that `list()`
  // without a `configUri` makes the same request internally behind a
  // `protected` member no strategy of ours reaches, and throws outright on a
  // system holding several saved searches — telling the caller to pass a
  // `configUri` that this tool has no parameter for. Composed here, the
  // request count is unchanged for the ordinary one-configuration system,
  // both requests are ours to read, and several configurations are searched
  // rather than refused.
  //
  // **This is an observable behaviour change, not merely an implementation
  // one.** Before, `user`/`status` were sent to the server and never proven
  // to be honoured — so the answer, in practice, was every owner's
  // modifiable transports. `user` defaults to the request's own responsible
  // (or `SAP_USERNAME`) when the caller passes nothing, and the filter below
  // is now always applied — so a caller who passes no `user` gets a NARROWER
  // list than before: only the session user's transports, not everyone's.
  // Believed to be what the tool should answer (its own description always
  // said "for the current or specified user"), kept deliberately rather than
  // reverted, and named here and in the tool's own description rather than
  // left implicit.

  // Assigned by the call below and read by the projection: which searches
  // actually ran. Only reported when there was more than one, so the ordinary
  // answer keeps the shape it has always had.
  let searched: string[] = [];
  let capped = false;

  return answer(
    { tool: 'ListTransports', detail },
    async () => {
      const configurations = await fetchSearchConfigurations(
        connection,
        logger,
      );
      if (configurations.length === 0) {
        throw new Error(
          `This system holds no saved transport search configuration, and a transport listing is a saved search: ${TRANSPORT_SEARCH_CONFIGURATIONS_URL} answered none. Create one in ADT's Transport Organizer and the tool will use it.`,
        );
      }

      capped = configurations.length > MAX_SEARCH_CONFIGURATIONS;
      const running = configurations.slice(0, MAX_SEARCH_CONFIGURATIONS);
      searched = running.map((configuration) => configuration.uri);

      const request = createAdtClient(connection, logger).getRequest(
        resultsFor(transportDocuments),
      );

      const readings: AdtReading<unknown>[] = [];
      for (const configuration of running) {
        const answered = await request.list({ configUri: configuration.uri });
        // The failing search's own answer, untouched — the rule `sequence()`
        // follows, for the same reason: a sentence composed here would stand
        // beside the strategy's own account of the same refusal.
        if (!answered.ok) {
          return answered as unknown as IAdtResponse<
            AdtReading<unknown>,
            IAdtError
          >;
        }
        readings.push(answered.getResult().value as AdtReading<unknown>);
      }

      // One search: its reading, unchanged. Several: the values as an array,
      // which `parseTransportListValue` walks like any other node, and the
      // documents joined for `detail: 'raw'` — there is no single document to
      // answer when several were read, and dropping all but one would be a
      // quieter lie than joining them.
      const merged: AdtReading<unknown> =
        readings.length === 1
          ? readings[0]
          : {
              value: readings.map((r) => r.value),
              raw: readings.map((r) => r.raw).join('\n'),
              status: readings[0]?.status ?? 200,
            };

      return {
        ok: true,
        getResult: () => ({ value: merged }),
        getError: () => {
          throw new Error('ListTransports: asked for the error of a success');
        },
      } as unknown as IAdtResponse<AdtReading<unknown>, IAdtError>;
    },
    project(detail, (value) => {
      const parsed = parseTransportListValue(value);
      const byUser = user
        ? parsed.filter((t) => !t.owner || t.owner === user)
        : parsed;
      const transports = modifiableOnly
        ? byUser.filter((t) => isModifiableStatus(t.status))
        : byUser;

      logger?.info(`ListTransports: found ${transports.length} transport(s)`);

      return {
        success: true,
        count: transports.length,
        transports,
        ...(searched.length > 1 ? { searched_configurations: searched } : {}),
        ...(capped ? { configurations_capped: MAX_SEARCH_CONFIGURATIONS } : {}),
      };
    }),
  );
}
