/**
 * The stand the listed long tools' suites run on (spec §5.8, §14.9): an
 * embedded server on a connection the server's factory built (so a fresh one
 * can be opened from it), connected to the ADT stand-in, offering ONE listed
 * tool — taken from the group that registers it in the shipped binaries —
 * and the probe tool. The MCP client talks to it in memory.
 *
 * The stand-in gives every connection an ABAP session of its own and records
 * which session each request ran in, so a case can tell the instance's
 * connection from the call's own and see which one was logged off.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { HighLevelHandlersGroup } from '../../../lib/handlers/groups/HighLevelHandlersGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { LONG_TOOLS } from '../../../lib/longTools';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  PROBE_PATH,
  probeGroup,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';

/**
 * Each listed tool's arguments: valid, and enough to make it send its first
 * request. Placeholder names only.
 */
export const LONG_TOOL_ARGS: Record<string, Record<string, unknown>> = {
  GetWhereUsed: { object_name: 'PLACEHOLDER_CLASS', object_type: 'class' },
  SearchObject: { object_name: 'PLACEHOLDER*' },
  SearchSource: { query: 'placeholder', packages: ['PLACEHOLDER_PACKAGE'] },
  GetPackageContents: { package_name: 'PLACEHOLDER_PACKAGE' },
  GetPackageTree: { package_name: 'PLACEHOLDER_PACKAGE' },
  GetObjectsList: {
    parent_name: 'PLACEHOLDER_PROGRAM',
    parent_tech_name: 'PLACEHOLDER_PROGRAM',
    parent_type: 'PROG/P',
  },
  GetStructuresList: { structure_name: 'PLACEHOLDER_STRUCTURE' },
  GetIncludesList: {
    object_name: 'PLACEHOLDER_PROGRAM',
    object_type: 'PROG/P',
  },
  RuntimeListFeeds: { feed_type: 'dumps' },
  ListTransports: {},
  GetSqlQuery: { sql_query: 'SELECT * FROM placeholder_table' },
  GetTableContents: { table_name: 'PLACEHOLDER_TABLE' },
  GetObjectInfo: { parent_type: 'PROG/P', parent_name: 'PLACEHOLDER_PROGRAM' },
  DescribeByList: { objects: [{ name: 'PLACEHOLDER_CLASS', type: 'CLAS/OC' }] },
  GetAbapSystemSymbols: {
    code: 'CLASS cl_placeholder_class DEFINITION.\nENDCLASS.',
  },
  GetATCFindings: { worklist_id: 'worklist-placeholder-1' },
  RuntimeGetProfilerTraceData: {
    trace_id_or_uri: 'trace-placeholder-1',
    view: 'hitlist',
  },
  RuntimeAnalyzeProfilerTrace: { trace_id_or_uri: 'trace-placeholder-1' },
  HandlerWhereUsed: { object_type: 'CLASS', object_name: 'PLACEHOLDER_CLASS' },
  HandlerSearch: { query: 'PLACEHOLDER*' },
  HandlerDumpList: {},
  HandlerGetData: { object_name: 'PLACEHOLDER_TABLE' },
  HandlerProfileView: {
    trace_id_or_uri: 'trace-placeholder-1',
    view: 'hitlist',
  },
  HandlerGet: { object_type: 'CLASS', class_name: 'PLACEHOLDER_CLASS' },
};

/** The group of the shipped binaries that registers `tool`, and its entry. */
function shippedEntry(tool: string): {
  group: IHandlerGroup & { getHandlers(): HandlerEntry[] };
  entry: HandlerEntry;
} {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  const groups = [
    new ReadOnlyHandlersGroup(placeholder),
    new HighLevelHandlersGroup(placeholder),
    new SystemHandlersGroup(placeholder),
    new SearchHandlersGroup(placeholder),
    new CompactReadOnlyHandlersGroup(placeholder),
    new CompactModifyHandlersGroup(placeholder),
  ];
  for (const group of groups) {
    const entry = group
      .getHandlers()
      .find((e) => e.toolDefinition.name === tool);
    if (entry) return { group, entry };
  }
  throw new Error(`no shipped group registers ${tool}`);
}

/** A group offering `tool` alone, its handler reading its own group's context. */
function oneToolGroup(tool: string): IHandlerGroup {
  const { group, entry } = shippedEntry(tool);
  return {
    getName: () => `long-${tool}`,
    getHandlers: () => [entry],
    registerHandlers: () => {},
    setContext: (context: HandlerContext) => {
      (group as unknown as { context: HandlerContext }).context = context;
    },
  } as unknown as IHandlerGroup;
}

export interface LongStand {
  standIn: AdtStandIn;
  /** The server instance: what owns the call's own connection. */
  server: EmbeddableMcpServer;
  /** The session of the instance's (injected) connection. */
  instanceSession: string;
  /** Whether a request is the tool's own — not the instance's, not a connect, not a logoff. */
  isToolRequest(request: StandInRequest): boolean;
  /** Calls a tool; the promise settles with the answer (or the error). */
  call(name: string, args: Record<string, unknown>): Promise<CallAnswer>;
  close(): Promise<void>;
}

export interface CallAnswer {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

/**
 * The stand for `tool`. `injected: 'bare'` serves a connection the host
 * injected with no fresh-connection factory (§4.3): a listed tool is refused.
 */
export async function longStand(
  tool: string,
  options: { injected?: 'built' | 'bare' } = {},
): Promise<LongStand> {
  if (!LONG_TOOLS.includes(tool)) throw new Error(`${tool} is not listed`);
  const standIn = await adtStandIn();
  stateSystemKind();
  const built = createAbapConnection(
    { url: standIn.url, client: '100', authType: 'basic' },
    new BasicAuthProvider('LONG_USER', 'long-password'),
  );
  // A consumer's connection comes connected.
  await built.connect();
  const handshake = new Set(standIn.requests.map((r) => r.url));
  const instanceSession = standIn.requests.at(-1)?.session ?? '';
  const connection: IAbapConnection =
    options.injected === 'bare' ? bareConnection(built) : built;
  const server = new EmbeddableMcpServer({
    connection: connection as never,
    handlersRegistry: new CompositeHandlersRegistry([
      oneToolGroup(tool),
      probeGroup(),
    ]),
    systemType: 'onprem',
    logger: silent,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'long-tools', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    standIn,
    server,
    instanceSession,
    isToolRequest: (r) =>
      r.session !== instanceSession &&
      !handshake.has(r.url) &&
      !isLogoff(r.url),
    call: (name, args) =>
      client
        .callTool({ name, arguments: args }, undefined, {
          timeout: 120_000,
        })
        .then((answer) => answer as CallAnswer),
    close: async () => {
      await client.close().catch(() => undefined);
      await (built as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
      await standIn.close();
    },
  };
}

/** The probe's request on the instance's connection, answered. */
export const probeAnswered = (stand: LongStand, id: string): boolean =>
  stand.standIn.requests.some(
    (r) =>
      r.url === `${PROBE_PATH}${id}` && r.session === stand.instanceSession,
  );

/**
 * A connection the host injected, not built by the server's factory and with
 * no `freshConnection`: every member delegates to `built`.
 */
function bareConnection(built: IAbapConnection): IAbapConnection {
  return new Proxy({} as IAbapConnection, {
    get: (_target, property) => {
      const value = Reflect.get(built as object, property);
      return typeof value === 'function' ? value.bind(built) : value;
    },
  });
}

const silent = {
  info() {},
  debug() {},
  warn() {},
  error() {},
};

/** Real short waits until `done()` holds; fails after `limitMs`. */
export async function until(
  done: () => boolean,
  limitMs = 10_000,
): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** The JSON of an answer's first text. */
export function payloadOf(answer: CallAnswer): Record<string, unknown> {
  const text = answer.content?.[0]?.text ?? '';
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}
