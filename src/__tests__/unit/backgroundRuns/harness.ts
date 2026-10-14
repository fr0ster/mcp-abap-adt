/**
 * The stand the background-run suites run on: server instances built from a
 * source of settings (as http's headers or core's destination give them)
 * against the ADT stand-in, serving the shipped run tools (the system group,
 * and compact's half that runs code) and the background-run tools, all
 * sharing one strategy — the store the host created. The MCP client talks
 * to each instance in memory.
 *
 * The stand-in gives every connection an ABAP session of its own and records
 * which session each request ran in, so a case can tell the instance's
 * connection from the run's own and see which one was logged off, and when.
 */

import {
  BasicAuthProvider,
  TokenAuthProvider,
} from '@mcp-abap-adt/auth-providers';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { DestinationSystemContext } from '../../../lib/auth/destinationSystemContext';
import type { IBackgroundRuns } from '../../../lib/backgroundRuns/contract';
import { CompactBackgroundRunHandlersGroup } from '../../../lib/compact/backgroundRuns/group';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  basicOf,
  isLogoff,
  type StandInRequest,
} from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';

/** Whether a request is a class run (`POST …/oo/classrun/<name>`). */
export const isClassRun = (r: StandInRequest): boolean =>
  r.method === 'POST' && r.url.includes('/oo/classrun/');

/** Whether a request is a program run (`POST …/programs/programrun/<name>`). */
export const isProgramRun = (r: StandInRequest): boolean =>
  r.method === 'POST' && r.url.includes('/programs/programrun/');

export class StandServer extends BaseMcpServer {
  use(source: {
    settings: SapConfig;
    credential: IAuthProvider;
    systemContext?: DestinationSystemContext;
  }): void {
    stateSystemKind();
    this.setConnectionContext({
      kind: 'built',
      source: { resolve: async () => source },
      sessionId: 'background-stand',
    });
  }
  register(registry: CompositeHandlersRegistry): void {
    this.registerHandlers(registry);
  }
}

export interface Answer {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
  /** The first text, parsed when it is JSON. */
  payload: Record<string, unknown>;
}

export interface Caller {
  server: StandServer;
  /** Calls a tool and answers its result. */
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  close(): Promise<void>;
}

const placeholderContext = {
  connection: undefined as never,
  logger: undefined,
} as HandlerContext;

/** The groups the shipped binaries register for the run tools and their background runs. */
export function shippedGroups(): CompositeHandlersRegistry {
  return new CompositeHandlersRegistry([
    new SystemHandlersGroup(placeholderContext),
    new BackgroundRunHandlersGroup(placeholderContext),
    new CompactModifyHandlersGroup(placeholderContext),
    new CompactBackgroundRunHandlersGroup(placeholderContext),
  ]);
}

export const silent = {
  info() {},
  debug() {},
  warn() {},
  error() {},
};

function answerOf(raw: unknown): Answer {
  const result = raw as {
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
  };
  const content = result.content ?? [];
  const text = content[0]?.text ?? '';
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = { text };
  }
  return { isError: result.isError === true, content, payload };
}

/** An MCP client on `server`. */
export async function clientOf(server: BaseMcpServer): Promise<{
  call: Caller['call'];
  close: () => Promise<void>;
}> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'background', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    call: async (name, args = {}) =>
      answerOf(
        await client.callTool({ name, arguments: args }, undefined, {
          timeout: 60_000,
        }),
      ),
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
}

/**
 * An instance whose request names `user` (basic), or names none (a token
 * credential: SAP's `systeminformation` answers `tokenUser`).
 */
export async function callerOn(
  standIn: AdtStandIn,
  strategy: IBackgroundRuns | undefined,
  who: { user: string } | { tokenUser: string },
): Promise<Caller> {
  const server = new StandServer({
    name: 'background-stand',
    logger: silent,
    systemType: 'onprem',
    ...(strategy !== undefined ? { backgroundRuns: strategy } : {}),
  });
  if ('user' in who) {
    // The system names the session's user (systeminformation), as a session
    // of that SAP user would: the caller is that user.
    const authorization = basicOf(who.user, 'run-password');
    standIn.body(
      (r) =>
        r.url.includes('systeminformation') &&
        r.authorization === authorization,
      JSON.stringify({ userName: who.user, systemID: 'SID' }),
    );
    server.use({
      settings: {
        url: standIn.url,
        client: '100',
        authType: 'basic',
        username: who.user,
      },
      credential: new BasicAuthProvider(who.user, 'run-password'),
    });
  } else {
    server.use({
      settings: { url: standIn.url, client: '100', authType: 'jwt' },
      credential: TokenAuthProvider.fixed('placeholder.token.sig'),
    });
  }
  server.register(shippedGroups());
  const client = await clientOf(server);
  return {
    server,
    call: client.call,
    close: async () => {
      await client.close();
      await server.terminalClose();
    },
  };
}

export interface BackgroundStand {
  standIn: AdtStandIn;
  strategy: InMemoryBackgroundRuns;
  /** The first caller (`RUN_USER`). */
  a: Caller;
  close(): Promise<void>;
}

export async function backgroundStand(): Promise<BackgroundStand> {
  const standIn = await adtStandIn();
  const strategy = new InMemoryBackgroundRuns();
  const a = await callerOn(standIn, strategy, { user: 'RUN_USER' });
  return {
    standIn,
    strategy,
    a,
    close: async () => {
      await a.close();
      await standIn.close();
    },
  };
}

/** The sessions the stand-in logged off, and when (the request's index). */
export function logoffIndex(standIn: AdtStandIn, session: string): number {
  return standIn.requests.findIndex(
    (r) => isLogoff(r.url) && r.session === session,
  );
}

/** Real short waits until `done()` holds; fails after `limitMs`. */
export async function until(
  done: () => boolean | Promise<boolean>,
  limitMs = 10_000,
): Promise<void> {
  const end = Date.now() + limitMs;
  while (!(await done())) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}
