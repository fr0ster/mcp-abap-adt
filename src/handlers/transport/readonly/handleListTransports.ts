/**
 * ListTransports — the transport requests of a user, by SAP's query
 * (`AdtClient.getRequest().list()` with `user`, `requestStatus` and
 * `requestType`).
 */
import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type ITransportTree,
  transportTree,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import * as z from 'zod';
import { answer, type McpResult } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  answered,
  type DetailTable,
  formatted,
  fullLevel,
  rawLevel,
  readingAt,
  tsv,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  LONG_BACKGROUND_FIELD,
  withLongToolAdvice,
} from '../../../lib/longTools';
import { getRequestContext } from '../../../lib/requestContext';
import { statedUserOf } from '../../../lib/requestSystemResolution';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { succeeded } from '../../../lib/strategies/stepResponse';
import {
  isSystemInformationUnavailable,
  readSystemInformation,
} from '../../../lib/systemInformation';
import type { XmlNode } from '../../../lib/xml/node';

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
 * Status implied by the container a request sits in (`tm:modifiable`,
 * `tm:released`), used only when the request itself carries no `tm:status`;
 * the innermost such container decides.
 */
const STATUS_BY_CONTAINER: Readonly<Record<string, string>> = {
  modifiable: 'D',
  released: 'R',
};

/** No listing: what a document with no `tm:root` reads as. */
const NO_LISTING: ITransportTree = { attributes: {}, requests: [] };

/**
 * The listing as adt-strategies reads it (`transportTree`): every
 * `tm:request` wherever it sits in the tree — the endpoint negotiates
 * `application/vnd.sap.adt.transportorganizertree.v1+xml`, requests under
 * status containers one level below the category
 * (`tm:root > tm:workbench > tm:modifiable > tm:request`), `tm:workbench`
 * repeated once per transport target and `tm:target` inserted with
 * `?targets=true`. A document with no `tm:root` lists nothing, as the walk
 * this replaced answered it.
 */
function listingOf(answer: IAdtWireResponse): ITransportTree {
  try {
    return transportTree(answer);
  } catch {
    return NO_LISTING;
  }
}

/**
 * The requests of a listing, one entry each: a request reached through more
 * than one branch is listed once, its first occurrence winning.
 */
export function listedTransports(tree: ITransportTree): TransportEntry[] {
  const seen = new Set<string>();
  const listed: TransportEntry[] = [];
  for (const request of tree.requests) {
    const attributes = request.attributes;
    const number = attributes['tm:number'] || attributes['adtcore:name'] || '';
    if (!number || seen.has(number)) continue;
    seen.add(number);
    const containerStatus = request.containers.reduce(
      (status, container) => STATUS_BY_CONTAINER[container.element] ?? status,
      '',
    );
    listed.push({
      number,
      description: attributes['tm:desc'] || attributes['tm:description'] || '',
      type: attributes['tm:type'] ?? '',
      status: attributes['tm:status'] || containerStatus || '',
      owner: attributes['tm:owner'] ?? '',
      target: attributes['tm:target'] ?? '',
    });
  }
  return listed;
}

/** A listing document's requests — for the #168 regression guard, which asserts against raw XML. */
export function parseTransportListXml(xmlData: string): TransportEntry[] {
  return listedTransports(
    listingOf({ status: 200, statusText: 'OK', headers: {}, data: xmlData }),
  );
}

/** The terse answer: the requests listed. */
interface ListedAnswer {
  success: true;
  count: number;
  transports: TransportEntry[];
}

/** What `ListTransports` answers: the terse rows, the medium listing, the parse, or the document. */
type ListAnswer = ListedAnswer | XmlNode | string;

/**
 * What `ListTransports` answers at each `detail`: the reading the listing is
 * read with, selected before the call (`src/lib/detail`): terse a TSV row per
 * request (number, type, status, owner, target, description); medium the
 * requests as JSON; full the parse; raw the document.
 */
function listReadings(
  logger: HandlerContext['logger'],
): DetailTable<ListAnswer> {
  const listed = (tree: ITransportTree) => {
    const transports = listedTransports(tree);
    logger?.info(`ListTransports: found ${transports.length} transport(s)`);
    return transports;
  };
  return {
    terse: formatted(listingOf, (tree) => {
      const transports = listed(tree);
      return [
        `# count ${transports.length}`,
        tsv(
          ['number', 'type', 'status', 'owner', 'target', 'description'],
          transports.map((t) => [
            t.number,
            t.type ?? '',
            t.status ?? '',
            t.owner ?? '',
            t.target ?? '',
            t.description ?? '',
          ]),
        ),
      ].join('\n');
    }),
    medium: formatted(listingOf, (tree) => {
      const transports = listed(tree);
      const listedAnswer: ListedAnswer = {
        success: true,
        count: transports.length,
        transports,
      };
      return listedAnswer;
    }),
    full: fullLevel,
    raw: rawLevel,
  };
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
          .getRequest({
            ...resultsFor(transportDocuments),
            list: readingAt(listReadings(logger), levelOf(args)),
          })
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
    answered,
  );
}
