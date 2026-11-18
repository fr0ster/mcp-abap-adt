/**
 * ListTransports — the transport requests of a user, by SAP's query
 * (`AdtClient.getRequest().list()` with `user`, `requestStatus` and
 * `requestType`).
 */
import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer, type McpResult } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { parseStructure } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { succeeded } from '../../../lib/strategies/stepResponse';
import { getCreateSystemContext } from '../../../lib/systemContext';
import {
  attr,
  child,
  type Element,
  elements,
  entries,
  isList,
  type XmlRead,
} from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'ListTransports',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    "[read-only] List the transport requests of a user: the workbench, customizing and transport-of-copies requests the user owns or holds a task in, as SAP selects them. Returns each request's number, description, type, status, owner and target. Modifiable requests by default; with modifiable_only false, released requests too, from SAP's default window of the last 14 days.",
  ),
  inputSchema: z.object({
    background: LONG_BACKGROUND_FIELD,
    user: z
      .string()
      .optional()
      .describe(
        'The SAP user whose requests to list, sent in upper case. Default: the current session user.',
      ),
    modifiable_only: z
      .boolean()
      .optional()
      .describe(
        "Modifiable requests only (true, the default), or modifiable and released requests (false; released ones from SAP's default window of the last 14 days).",
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type ListTransportsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

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

/** The attribute `name` of `node` (the reading groups them under `@`), `''` when absent. */
function attrOf(node: XmlRead, name: string): string {
  return attr(child(node, '@'), name) ?? '';
}

function collectRequestNodes(
  node: XmlRead,
  containerStatus: string,
  found: { req: Element; containerStatus: string }[],
): void {
  if (isList(node)) {
    for (const item of node) {
      collectRequestNodes(item, containerStatus, found);
    }
    return;
  }
  for (const [key, value] of entries(node)) {
    if (key === '@') continue; // attributes of THIS node, not a child to descend into
    if (key === 'tm:request') {
      for (const req of elements(value)) {
        found.push({ req, containerStatus });
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
export function parseTransportListValue(value: XmlRead): TransportEntry[] {
  const found: { req: Element; containerStatus: string }[] = [];
  collectRequestNodes(value, '', found);

  const seen = new Set<string>();
  const listed: TransportEntry[] = [];

  for (const { req, containerStatus } of found) {
    const number = attrOf(req, 'tm:number') || attrOf(req, 'adtcore:name');
    if (!number || seen.has(number)) {
      continue;
    }
    seen.add(number);
    listed.push({
      number,
      description: attrOf(req, 'tm:desc') || attrOf(req, 'tm:description'),
      type: attrOf(req, 'tm:type'),
      status: attrOf(req, 'tm:status') || containerStatus || '',
      owner: attrOf(req, 'tm:owner'),
      target: attrOf(req, 'tm:target'),
    });
  }

  return listed;
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

/** `D` modifiable, and `R` released beside it when asked for. */
type RequestStatuses = readonly ['D'] | readonly ['D', 'R'];

/** The request types listed: workbench, customizing, transport of copies. */
const REQUEST_TYPES = ['K', 'W', 'T'] as const;

/**
 * The user a listing is for: the argument, else the session's user
 * (`getCreateSystemContext`: the stated responsible, else the request
 * scope's login), upper case as SAP stores user ids; `''` when neither is
 * stated.
 */
function listedUser(args: ListTransportsArgs): string {
  return (args.user?.trim() || getCreateSystemContext().responsible || '')
    .trim()
    .toUpperCase();
}

/**
 * The listing: one `GET /sap/bc/adt/cts/transportrequests` with the query
 * by user (adt-clients 45.5.3, `IListTransportsQuery`) — `user`,
 * `requestStatus` `D` (or `DR` when `modifiable_only` is false) and
 * `requestType` `KWT` — and no saved search configuration. SAP selects the
 * requests the user owns or holds a task in (measured on premise
 * 2026-11-18), and released ones from its default window of the last 14
 * days; every request it returns is answered, as it returned it.
 */
export async function handleListTransports(
  context: HandlerContext,
  args: ListTransportsArgs,
): Promise<McpResult> {
  const { connection, logger } = context;
  const detail = detailOf(args);
  const user = listedUser(args);
  const requestStatus: RequestStatuses =
    args.modifiable_only === false ? ['D', 'R'] : ['D'];

  logger?.debug(
    `ListTransports: user=${user}, requestStatus=${requestStatus.join('')}`,
  );

  return answer(
    { tool: 'ListTransports', detail },
    async () => {
      if (user === '') {
        throw new Error(
          'ListTransports has no user to list for: pass `user`, or state the session user (the responsible) on the connection.',
        );
      }
      const listed = await atStep('list', () =>
        createAdtClient(connection, logger)
          .getRequest(resultsFor(transportDocuments))
          .list({
            analyse: analyseException,
            user,
            requestStatus,
            requestType: REQUEST_TYPES,
          }),
      )();
      // SAP's refusal, forwarded as it came.
      if (!listed.ok) return listed;
      return succeeded(listed.getResult().value, 'ListTransports');
    },
    project(detail, (value) => {
      const transports = parseTransportListValue(value);
      logger?.info(`ListTransports: found ${transports.length} transport(s)`);
      return { success: true, count: transports.length, transports };
    }),
  );
}
