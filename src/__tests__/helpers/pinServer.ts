/**
 * The in-process server a pin of a server-dispatched tool calls (spec §8,
 * "Pinned"): the background dispatch, the batch, the debugger, the long
 * sessions and the leftover sessions are dispatched by the server
 * (`BaseMcpServer`, its background branch included), not by the entry.
 *
 * It serves the full and the compact tool sets — their stdio groups and
 * the groups only Streamable HTTP adds (the long session) — through the
 * server's own dispatch, on an in-memory MCP transport, against the ADT
 * stand-in: a connection built from basic settings pointing at it, the
 * variant declared (`systemType`), a batch owner, a background-run store
 * (`@mcp-abap-adt/background-runs-memory`) and a long session. A setup
 * (`leftover-session`) gives it the runtime files of a leftover session
 * before it starts.
 *
 * Build it after the pin's clock and random fakes are installed:
 * `InstanceState` captures its random source at construction.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryBackgroundRuns } from '../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { compactToolSet } from '../../../compact/src/launcher';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import type { IAccessChecks } from '../../lib/access/accessChecks';
import type { DeniedActions } from '../../lib/access/deniedActions';
import { withoutDenied } from '../../lib/access/withoutDenied';
import type { McpResult } from '../../lib/answer';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  BackgroundRunStart,
  BackgroundRunStarted,
  IBackgroundRuns,
} from '../../lib/backgroundRuns/contract';
import { InstanceBatch } from '../../lib/batch/InstanceBatch';
import type { ToolArgs } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { noConnectionContext } from '../../lib/handlers/registry/expositionRegistry';
import { LeftoverSessions } from '../../lib/leftoverSessions/LeftoverSessions';
import { defaultSystemContextResolver } from '../../lib/requestSystemResolution';
import { LongSession } from '../../lib/state/longSession';
import { fullToolSet, type ToolSet } from '../../lib/toolSet';
import type { AdtStandIn } from './adtStandIn';
import { fakeProbe, killedProcessSession } from './leftoverSession';
import type { SystemKind } from './servedTools';

export type { McpResult };

/** The destination the pin server serves: who calls, for its leftover sessions. */
export const PIN_DESTINATION = 'PIN_DEST';

/**
 * The key an injected connection's system is named by when it answers no
 * URL (RFC), as a host states it (`EmbeddableMcpServerOptions.system`).
 */
const PIN_SYSTEM = 'pin-system';

/** The SAP user the pin server logs on as. */
export const PIN_USER = 'PIN_USER';

/** This process, as the pin server's leftover-session probe sees it. */
const PIN_PID = 222;

/** What must exist before the server starts. */
export type PinSetup = 'leftover-session';

/**
 * What an in-process server is started with beyond the base's: the denied
 * actions applied to its groups at registration and the access-check
 * strategy given to the server. Both absent: the server is as before.
 */
export interface ServerRestriction {
  readonly deniedActions?: DeniedActions | undefined;
  readonly accessChecks?: IAccessChecks | undefined;
}

export interface PinServer {
  call(tool: string, args: ToolArgs): Promise<McpResult>;
  /** The tool names the server lists (`tools/list`), in its order. */
  listed(): Promise<string[]>;
  /**
   * Settles once every background run the server started has ended: its
   * answer handed to the store (`finish`). A run's end is waited for on
   * the store, never polled.
   */
  runsEnded(): Promise<void>;
  close(): Promise<void>;
}

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/**
 * The launchers' store (`InMemoryBackgroundRuns`), its runs counted: how
 * many it took and has not been handed the answer of, and who waits for
 * none to be left.
 */
class PinBackgroundRuns implements IBackgroundRuns {
  private readonly kept = new InMemoryBackgroundRuns();
  private running = 0;
  private waiting: Array<() => void> = [];

  /** Settles once no run the store took is without its answer. */
  ended(): Promise<void> {
    if (this.running === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  async start(
    caller: BackgroundRunCaller,
    run: BackgroundRunStart,
  ): Promise<BackgroundRunStarted> {
    const started = await this.kept.start(caller, run);
    if ('handle' in started) this.running += 1;
    return started;
  }

  async finish(
    handle: string,
    answer: BackgroundRunAnswer,
    finishedAt: string,
  ): Promise<void> {
    await this.kept.finish(handle, answer, finishedAt);
    this.running -= 1;
    if (this.running > 0) return;
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) resolve();
  }

  get(handle: string, caller: BackgroundRunCaller) {
    return this.kept.get(handle, caller);
  }

  list(caller: BackgroundRunCaller) {
    return this.kept.list(caller);
  }

  discard(handle: string, caller: BackgroundRunCaller) {
    return this.kept.discard(handle, caller);
  }
}

class PinMcpServer extends BaseMcpServer {
  use(source: ServerSource): void {
    this.setConnectionContext(
      'injected' in source
        ? {
            kind: 'injected',
            connection: source.injected,
            // An injected RFC connection answers no URL: its background runs
            // are kept under this key (one system per run).
            system: PIN_SYSTEM,
            sessionId: 'pin-server',
            destination: PIN_DESTINATION,
          }
        : {
            kind: 'built',
            source: { resolve: async () => source },
            sessionId: 'pin-server',
            destination: PIN_DESTINATION,
          },
    );
  }
  register(registry: CompositeHandlersRegistry): void {
    this.registerHandlers(registry);
  }
}

/** A set's stdio groups, and the groups only its Streamable HTTP binary adds. */
function groupsOf(toolSet: ToolSet) {
  const context = noConnectionContext();
  const stdio = toolSet.groups(context, 'stdio', { dataTools: true });
  const names = new Set(
    stdio.flatMap((group) =>
      group.getHandlers().map((entry) => entry.toolDefinition.name),
    ),
  );
  const httpOnly = toolSet
    .groups(context, 'http', { dataTools: true })
    .filter((group) =>
      group
        .getHandlers()
        .every((entry) => !names.has(entry.toolDefinition.name)),
    );
  return [...stdio, ...httpOnly];
}

/** A tool call's answer as the MCP client declares it. */
type CallAnswer = Awaited<ReturnType<Client['callTool']>>;

/**
 * An answer in the tool's result shape, its text items. `callTool` declares
 * a union with the legacy `toolResult` form; the SDK's own
 * `CallToolResultSchema` reads it as the result it is.
 */
function resultOf(answer: CallAnswer): McpResult {
  const result = CallToolResultSchema.parse(answer);
  return {
    isError: result.isError === true,
    content: result.content.flatMap((item) =>
      item.type === 'text' ? [{ type: 'text' as const, text: item.text }] : [],
    ),
  };
}

/**
 * Where an in-process server's connection comes from: built from settings
 * and a credential, or a connection handed in and used as given (a live
 * run's guarded connection, whose fresh connections its own registered
 * factory builds).
 */
export type ServerSource =
  | { settings: SapConfig; credential: IAuthProvider }
  | { injected: IAbapConnection };

/**
 * The full and compact sets in one server of `variant` against `stand`,
 * with what `setup` makes before it starts.
 */
export function pinServer(
  variant: SystemKind,
  stand: AdtStandIn,
  setup?: PinSetup,
): Promise<PinServer> {
  return inProcessServer(
    variant,
    {
      settings: {
        url: stand.url,
        client: '100',
        authType: 'basic',
        username: PIN_USER,
      },
      credential: new BasicAuthProvider(PIN_USER, 'pin-password'),
    },
    setup,
  );
}

/**
 * The full and compact sets in one server of `variant`, its connection
 * built from `source` (the stand-in, or a live destination), with what
 * `setup` makes before it starts.
 */
export async function inProcessServer(
  variant: SystemKind,
  source: ServerSource,
  setup?: PinSetup,
  restriction: ServerRestriction = {},
): Promise<PinServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-server-'));
  const runtime = path.join(dir, 'runtime');
  const leftoverSessions = new LeftoverSessions({
    directory: runtime,
    probe: fakeProbe(PIN_PID),
    report: () => {},
  });
  if (setup === 'leftover-session') {
    if ('injected' in source) {
      throw new Error(
        'a leftover session needs a server that builds its connection',
      );
    }
    await killedProcessSession(source.settings.url ?? '', runtime, {
      user: PIN_USER,
      destination: PIN_DESTINATION,
    });
  }
  const runs = new PinBackgroundRuns();
  const server = new PinMcpServer({
    name: 'pin-server',
    logger: silent,
    systemType: variant,
    systemContextResolver: defaultSystemContextResolver,
    batch: new InstanceBatch({ keepRawParts: false }),
    backgroundRuns: runs,
    leftoverSessions,
    longSession: new LongSession(),
    ...(restriction.accessChecks !== undefined
      ? { accessChecks: restriction.accessChecks }
      : {}),
  });
  server.use(source);
  server.register(
    new CompositeHandlersRegistry(
      withoutDenied(
        [...groupsOf(fullToolSet), ...groupsOf(compactToolSet)],
        restriction.deniedActions ?? [],
      ),
    ),
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'pin', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    call: async (tool, args) =>
      resultOf(await client.callTool({ name: tool, arguments: { ...args } })),
    listed: async () =>
      (await client.listTools()).tools.map((tool) => tool.name),
    runsEnded: () => runs.ended(),
    close: async () => {
      await client.close();
      await server.terminalClose();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
