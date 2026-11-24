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
  longRunning,
  purpose,
  returnsOf,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  answered,
  type DetailTable,
  entries,
  fullLevel,
  headShape,
  type ListDetailTable,
  omitting,
  type RowSchemas,
  rawLevel,
  readingAt,
  rows,
  shapesOf,
  writeJson,
  writeListing,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_BACKGROUND_FIELD } from '../../../lib/longTools';
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

/** A request as a row reads it. */
function entryOf(request: ITransportTree['requests'][number]): TransportEntry {
  const attributes = request.attributes;
  const containerStatus = request.containers.reduce(
    (status, container) => STATUS_BY_CONTAINER[container.element] ?? status,
    '',
  );
  return {
    number: attributes['tm:number'] || attributes['adtcore:name'] || '',
    description: attributes['tm:desc'] || attributes['tm:description'] || '',
    type: attributes['tm:type'] ?? '',
    status: attributes['tm:status'] || containerStatus || '',
    owner: attributes['tm:owner'] ?? '',
    target: attributes['tm:target'] ?? '',
  };
}

/** A request listed, and whether it repeats one listed before it. */
interface ListedRequest {
  readonly entry: TransportEntry;
  /** The same request again through another branch: the same number, the same content and tasks. */
  readonly repeat: boolean;
}

/**
 * Every request of a listing, in order, each with its row's fields. A
 * request SAP lists through several branches is a repeat only when it is
 * the same request again — its number, every attribute, link and task
 * alike;
 * the same number with other content is written again. A request without
 * a number is a request all the same: its row has an empty number.
 */
export function listedRequests(tree: ITransportTree): ListedRequest[] {
  const seen = new Set<string>();
  return tree.requests.map((request) => {
    const entry = entryOf(request);
    // The whole request as the reading holds it — every attribute, link,
    // long description and task — and its row (the status a branch gives
    // it). Only the branch itself, its containers, may differ in a repeat.
    const content = JSON.stringify([
      entry,
      request.attributes,
      request.links,
      request.longDesc ?? null,
      request.tasks,
    ]);
    const repeat = entry.number !== '' && seen.has(content);
    seen.add(content);
    return { entry, repeat };
  });
}

/** Every request a listing holds, a repeat once (`listedRequests`). */
export function listedTransports(tree: ITransportTree): TransportEntry[] {
  return listedRequests(tree).flatMap(({ entry, repeat }) =>
    repeat ? [] : [entry],
  );
}

/** A repeat of a request listed before: the kind the answer's shape leaves out. */
const REPEATS = omitting(
  (listed: ListedRequest) => (listed.repeat ? 'repeat' : 'request'),
  { repeat: 'a branch repeating a request already listed' },
);

/** The lists the transport listing writes: what its description states. */
export const TRANSPORTS_LISTS: RowSchemas<{ requests: ListedRequest[] }> = {
  requests: about(
    'for each transport',
    rows('requests', {
      columns: [
        {
          name: 'number',
          means: 'its number',
          cell: (l: ListedRequest) => l.entry.number,
        },
        {
          name: 'type',
          means: 'its type',
          cell: (l: ListedRequest) => l.entry.type ?? '',
        },
        {
          name: 'status',
          means: 'its status',
          cell: (l: ListedRequest) => l.entry.status ?? '',
        },
        {
          name: 'owner',
          means: 'its owner',
          cell: (l: ListedRequest) => l.entry.owner ?? '',
        },
        {
          name: 'target',
          means: 'its target system',
          cell: (l: ListedRequest) => l.entry.target ?? '',
        },
        {
          name: 'description',
          means: 'its description',
          cell: (l: ListedRequest) => l.entry.description ?? '',
        },
      ],
      header: 'always',
      omit: REPEATS,
    }),
  ),
};

/** The head the transport listing opens with. */
export const TRANSPORTS_HEADS = [headShape('count', 'how many there are')];

/** A listing document's requests — for the #168 regression guard, which asserts against raw XML. */
export function parseTransportListXml(xmlData: string): TransportEntry[] {
  return listedTransports(
    listingOf({ status: 200, statusText: 'OK', headers: {}, data: xmlData }),
  );
}

export const TOOL_DEFINITION = {
  name: 'ListTransports',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      "Lists a user's transports, workbench, customizing and transport-of-copies alike, that the user owns or holds a task in.",
    ),
    returns: returnsOf({
      heads: TRANSPORTS_HEADS,
      shapes: [shapesOf(TRANSPORTS_LISTS)],
    }),
    inline: true,
    notes: [longRunning],
  }),
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

/** What `ListTransports` answers: the terse rows, the medium listing, the parse, or the document. */
type ListAnswer = object | XmlNode | string;

/**
 * What `ListTransports` answers at each `detail`: the reading the listing is
 * read with, selected before the call (`src/lib/detail`): terse a TSV row per
 * request (number, type, status, owner, target, description); medium the
 * requests as JSON; full the parse; raw the document. Each is pure: it
 * reads the answer and nothing else, the logger included.
 */
const LIST_READINGS: ListDetailTable<ListAnswer> = (() => {
  /** The requests a listing writes, a repeat counted once. */
  const counted = (requests: readonly ListedRequest[]) =>
    requests.filter((listed) => !REPEATS.omits(listed)).length;
  return {
    terse: written(listingOf, (tree) => {
      const requests = listedRequests(tree);
      return writeListing({
        heads: [{ head: 'count', value: String(counted(requests)) }],
        reading: { requests },
        lists: TRANSPORTS_LISTS,
      });
    }),
    medium: written(listingOf, (tree) => {
      const requests = listedRequests(tree);
      return writeJson(
        { success: true, count: counted(requests) },
        { requests },
        {
          requests: entries('requests', (l: ListedRequest) => l.entry, {
            as: 'transports',
            omit: REPEATS,
          }),
        },
      );
    }),
    full: fullLevel,
    raw: rawLevel,
  };
})();

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
            list: readingAt(LIST_READINGS, levelOf(args)),
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
