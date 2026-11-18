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
import { getRequestContext } from '../../../lib/requestContext';
import { statedUserOf } from '../../../lib/requestSystemResolution';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { parseStructure } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { succeeded } from '../../../lib/strategies/stepResponse';
import {
  isSystemInformationUnavailable,
  readSystemInformation,
} from '../../../lib/systemInformation';
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
        "The SAP user whose requests to list, sent in upper case. Default: the session's login user.",
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
 * The user a listing is for, upper case as SAP stores user ids: the
 * argument; else the session's login (`statedUserOf`: the connection's
 * `SAP_USERNAME`, else the request scope's `x-sap-login`) — a request's
 * owner is its creator's login, so the responsible is never read here;
 * else, with no login stated (a token's session), the user the system's
 * `systeminformation` names. `''` when none of them names one: the
 * endpoint absent (`404`) names none, and any other failure of that read
 * is thrown as it came.
 */
async function listedUser(
  args: ListTransportsArgs,
  connection: HandlerContext['connection'],
): Promise<string> {
  const named =
    args.user?.trim() ||
    statedUserOf(connection, getRequestContext()?.login)?.trim();
  if (named) return named.toUpperCase();
  try {
    const { user } = await readSystemInformation(connection);
    return (user ?? '').trim().toUpperCase();
  } catch (error) {
    if (isSystemInformationUnavailable(error)) return '';
    throw error;
  }
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
  const requestStatus: RequestStatuses =
    args.modifiable_only === false ? ['D', 'R'] : ['D'];

  return answer(
    { tool: 'ListTransports', detail },
    async () => {
      const user = await listedUser(args, connection);
      if (user === '') {
        throw new Error(
          'ListTransports has no user to list for: the session states no login and the system names no user. Pass `user`.',
        );
      }
      logger?.debug(
        `ListTransports: user=${user}, requestStatus=${requestStatus.join('')}`,
      );
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
