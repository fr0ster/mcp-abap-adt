/**
 * The stand the stateful-window suites run on (spec §5.7, §14.9, RF12): an
 * embedded server on ONE connection the server's factory built — the shared
 * connection a stdio instance keeps, or a pooled HTTP instance's — connected
 * to the ADT stand-in, offering the shipped tools a case names, each taken
 * from the group that registers it in the shipped binaries. The MCP client
 * talks to it in memory.
 *
 * The stand-in records each request's `x-sap-adt-sessiontype` and `Cookie`;
 * a `LOCK` is answered with a stateful context cookie (`sap-contextid`), so
 * a case can tell a request sent inside the lock's stateful context from one
 * sent outside it.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
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
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { LOCK_SUCCESS_XML } from '../../helpers/recordingConnection';

/** The context cookie a `LOCK` opens (HTTP's stateful ABAP context). */
export const CONTEXT_COOKIE = 'sap-contextid';

/** The shipped groups, in the order a tool is looked up in. */
function shippedGroups(): Array<
  IHandlerGroup & { getHandlers(): HandlerEntry[] }
> {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  return [
    new ReadOnlyHandlersGroup(placeholder),
    new HighLevelHandlersGroup(placeholder),
    new SystemHandlersGroup(placeholder),
    new SearchHandlersGroup(placeholder),
    new CompactReadOnlyHandlersGroup(placeholder),
    new CompactModifyHandlersGroup(placeholder),
  ] as never;
}

/** A group offering the shipped `tool` alone, its handler reading its own group's context. */
export function oneToolGroup(tool: string): IHandlerGroup {
  for (const group of shippedGroups()) {
    const entry = group
      .getHandlers()
      .find((e) => e.toolDefinition.name === tool);
    if (!entry) continue;
    return {
      getName: () => `stateful-${tool}`,
      getHandlers: () => [entry],
      registerHandlers: () => {},
      setContext: (context: HandlerContext) => {
        (group as unknown as { context: HandlerContext }).context = context;
      },
    } as unknown as IHandlerGroup;
  }
  throw new Error(`no shipped group registers ${tool}`);
}

export interface CallAnswer {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

export interface StatefulStand {
  standIn: AdtStandIn;
  /** Calls a tool; settles with its answer. */
  call(name: string, args: Record<string, unknown>): Promise<CallAnswer>;
  /** Calls a tool the client may cancel through `signal`. */
  callWith(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<CallAnswer>;
  /** The requests a block of work sent (the handshake left out). */
  during(work: () => Promise<unknown>): Promise<StandInRequest[]>;
  /** The instance's end: its connection's one `disconnect()`, the logoff. */
  logoff(): Promise<void>;
  close(): Promise<void>;
}

export async function statefulStand(
  tools: string[],
  options: {
    /** The credential the connection presents; basic by default. */
    credential?: (basic: IAuthProvider) => IAuthProvider;
  } = {},
): Promise<StatefulStand> {
  const standIn = await adtStandIn();
  // A LOCK answers a lock handle and opens the stateful context.
  standIn.body((r) => r.url.includes('_action=LOCK'), LOCK_SUCCESS_XML, {
    'set-cookie': `${CONTEXT_COOKIE}=context-of-the-lock; path=/`,
  });
  const connection = createAbapConnection(
    { url: standIn.url, client: '100', authType: 'basic' },
    (options.credential ?? ((basic) => basic))(
      new BasicAuthProvider('STATEFUL_USER', 'stateful-password'),
    ),
  );
  await connection.connect();
  const server = new EmbeddableMcpServer({
    connection: connection as never,
    handlersRegistry: new CompositeHandlersRegistry(tools.map(oneToolGroup)),
    systemType: 'onprem',
    logger: silent,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'stateful-window', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = (name: string, args: Record<string, unknown>) =>
    client
      .callTool({ name, arguments: args }, undefined, { timeout: 60_000 })
      .then((answer) => answer as CallAnswer);
  let ended = false;
  return {
    standIn,
    call,
    callWith: (name, args, signal) =>
      client
        .callTool({ name, arguments: args }, undefined, {
          timeout: 60_000,
          signal,
        })
        .then((answer) => answer as CallAnswer),
    during: async (work) => {
      const from = standIn.requests.length;
      await work();
      return standIn.requests.slice(from);
    },
    logoff: async () => {
      ended = true;
      await (connection as unknown as { disconnect(): Promise<void> })
        .disconnect()
        .catch(() => undefined);
    },
    close: async () => {
      await client.close().catch(() => undefined);
      if (!ended) {
        await (connection as unknown as { disconnect(): Promise<void> })
          .disconnect()
          .catch(() => undefined);
      }
      await standIn.close();
    },
  };
}

/** Whether a request went stateful: it asked for the session in its header. */
export const isStateful = (r: StandInRequest): boolean =>
  r.sessionType?.toLowerCase() === 'stateful';

/** Whether a request carried the lock's stateful context cookie. */
export const carriesContext = (r: StandInRequest): boolean =>
  (r.cookie ?? '').includes(`${CONTEXT_COOKIE}=`);

/** The requests of a block that are not the platform's logoff or a CSRF fetch. */
export const toolRequests = (requests: StandInRequest[]): StandInRequest[] =>
  requests.filter((r) => !isLogoff(r.url));

export const isLock = (r: StandInRequest): boolean =>
  r.url.includes('_action=LOCK');
export const isUnlock = (r: StandInRequest): boolean =>
  r.url.includes('_action=UNLOCK');
export const isActivation = (r: StandInRequest): boolean =>
  r.url.startsWith('/sap/bc/adt/activation');

/** One line per request, for a failure's message. */
export const shown = (requests: StandInRequest[]): string[] =>
  requests.map(
    (r) =>
      `${r.method} ${r.url.split('?')[0]}${r.url.includes('_action=') ? ` ${r.url.slice(r.url.indexOf('_action='))}` : ''} [${r.sessionType ?? 'stateless'}${carriesContext(r) ? ', context' : ''}]`,
  );

const silent = {
  info() {},
  debug() {},
  warn() {},
  error() {},
};
