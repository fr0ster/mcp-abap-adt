/**
 * The stand the leftover-session suites run on: a server instance built from
 * a source of basic settings (as http's headers or core's destination give
 * it) against the ADT stand-in, with the leftover-session tools and the
 * probe tool, its runtime files in a temporary directory, and a process
 * probe the case controls: which pids are "alive". The MCP client talks to
 * it in memory.
 *
 * A leftover session is made as a killed process leaves one: a connection
 * connected to the stand-in and kept by another owner (another pid), whose
 * logoff never comes — the connection is simply dropped.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BasicAuthProvider,
  TokenAuthProvider,
} from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  BaseMcpServer,
  type StartedConnection,
} from '../../../embeddable/BaseMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { LeftoverSessionHandlersGroup } from '../../../lib/handlers/groups/LeftoverSessionHandlersGroup';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type KnownSystem,
  type LeftoverRole,
  LeftoverSessions,
  sessionIdentity,
} from '../../../lib/leftoverSessions/LeftoverSessions';
import {
  type AdtStandIn,
  adtStandIn,
  probeGroup,
} from '../../helpers/adtStandIn';
import { fakeProbe } from '../../helpers/leftoverSession';

export const OUR_PID = 222;

/** The destination the stand serves: who calls, for its leftover sessions. */
export const DESTINATION = 'LEFT_DEST';

export { fakeProbe };

export const settingsFor = (url: string, user: string): SapConfig => ({
  url,
  client: '100',
  authType: 'basic',
  username: user,
});

class StandServer extends BaseMcpServer {
  use(source: { settings: SapConfig; credential: IAuthProvider }): void {
    this.setConnectionContext({
      kind: 'built',
      source: { resolve: async () => source },
      sessionId: 'leftover-stand',
      destination: DESTINATION,
    });
  }
  register(registry: CompositeHandlersRegistry): void {
    this.registerHandlers(registry);
  }
  /** The connection born as a stdio start makes it (`bornAtStart`). */
  born(signal: AbortSignal): Promise<StartedConnection> {
    return this.bornAtStart(signal);
  }
}

export interface LeftoverStand {
  standIn: AdtStandIn;
  dir: string;
  /** The pids the probe says still run (besides this process). */
  alive: Set<number>;
  owner: LeftoverSessions;
  server: StandServer;
  /** The connection born as a stdio start makes it, before any tool call. */
  start(): Promise<StartedConnection>;
  /** Calls a tool; its answer's text and isError. */
  call(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ text: string; isError: boolean }>;
  /** Calls a tool with the request's own signal (the client cancels it). */
  callWith(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown>;
  /** The files in the runtime directory. */
  files(): string[];
  /** A runtime file, parsed. */
  file(handle: string): Record<string, unknown>;
  /**
   * A session a killed process (`pid`) left: connected at the stand-in,
   * kept in its file, never logged off. Answers its handle and the
   * stand-in session it is.
   */
  leftover(options?: {
    pid?: number;
    user?: string;
    role?: LeftoverRole;
    /** The destination it was opened for; default the stand's. */
    destination?: string;
    /** The system information its file carries; none by default. */
    system?: KnownSystem;
  }): Promise<{ handle: string; session: string }>;
  close(): Promise<void>;
}

export async function leftoverStand(
  options: {
    /** No owner given to the instance: the tools are not available. */
    noOwner?: boolean;
    user?: string;
    /**
     * A token credential: settings with no user (`authType: jwt`), the
     * token on the wire. SAP's `systeminformation` answers `tokenUser` —
     * none when absent (the endpoint answers 404) — for the tools that ask
     * it (the background runs, the debugger).
     */
    token?: { tokenUser?: string };
    /** Extra tools beside the leftover-session ones and the probe. */
    extra?: Parameters<typeof probeGroup>[0];
  } = {},
): Promise<LeftoverStand> {
  const standIn = await adtStandIn();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-'));
  const runtime = path.join(dir, 'runtime');
  const alive = new Set<number>();
  const owner = new LeftoverSessions({
    directory: runtime,
    probe: fakeProbe(OUR_PID, alive),
    report: () => {},
  });
  const server = new StandServer({
    name: 'leftover-stand',
    logger: silent,
    ...(options.noOwner ? {} : { leftoverSessions: owner }),
  });
  const user = options.user ?? 'LEFT_USER';
  if (options.token !== undefined) {
    // The token's SAP user, switchable later (`standIn.systemInformation`).
    standIn.systemInformation(options.token.tokenUser ?? null);
    server.use({
      settings: { url: standIn.url, client: '100', authType: 'jwt' },
      credential: TokenAuthProvider.fixed('placeholder.token.sig'),
    });
  } else {
    server.use({
      settings: settingsFor(standIn.url, user),
      credential: new BasicAuthProvider(user, 'left-password'),
    });
  }
  server.register(
    new CompositeHandlersRegistry([
      new LeftoverSessionHandlersGroup({
        connection: undefined as never,
      } as HandlerContext),
      probeGroup(options.extra ?? []),
    ]),
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'leftover', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const files = () => {
    try {
      return fs.readdirSync(runtime).sort();
    } catch {
      return [];
    }
  };
  return {
    standIn,
    dir: runtime,
    alive,
    owner,
    server,
    start: () => server.born(new AbortController().signal),
    call: async (name, args = {}) => {
      const answer = (await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: 60_000 },
      )) as { isError?: boolean; content?: Array<{ text?: string }> };
      return {
        text: answer.content?.[0]?.text ?? '',
        isError: answer.isError === true,
      };
    },
    callWith: (name, args, signal) =>
      client.callTool({ name, arguments: args }, undefined, {
        timeout: 60_000,
        signal,
      }),
    files,
    file: (handle) =>
      JSON.parse(fs.readFileSync(path.join(runtime, handle), 'utf8')),
    leftover: async (made = {}) => {
      const pid = made.pid ?? 111;
      const leftUser = made.user ?? user;
      const killed = new LeftoverSessions({
        directory: runtime,
        probe: fakeProbe(pid, new Set()),
        report: () => {},
      });
      const before = new Set(files());
      const settings = settingsFor(standIn.url, leftUser);
      const connection = createAbapConnection(
        settings,
        new BasicAuthProvider(leftUser, 'left-password'),
      );
      await (connection as unknown as { connect(): Promise<void> }).connect();
      const identity = sessionIdentity(
        made.destination ?? DESTINATION,
        settings,
      );
      if (!identity) throw new Error('no identity');
      killed.track(connection, made.role ?? 'built', identity);
      if (made.system !== undefined) {
        killed.describeSystem(connection, made.system);
      }
      const handle = files().find((f) => !before.has(f));
      if (!handle) throw new Error('no file was written');
      const session = standIn.requests.at(-1)?.session ?? '';
      return { handle, session };
    },
    close: async () => {
      await client.close().catch(() => undefined);
      await server.terminalClose();
      await standIn.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const silent = {
  info() {},
  debug() {},
  warn() {},
  error() {},
};

/** The JSON of an answer's text. */
export function json(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

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
