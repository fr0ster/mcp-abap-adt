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
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InMemoryBackgroundRuns } from '../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { compactToolSet } from '../../../compact/src/launcher';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import type { McpResult } from '../../lib/answer';
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

/** The SAP user the pin server logs on as. */
export const PIN_USER = 'PIN_USER';

/** This process, as the pin server's leftover-session probe sees it. */
const PIN_PID = 222;

/** What must exist before the server starts. */
export type PinSetup = 'leftover-session' | 'background-run-store';

export interface PinServer {
  call(tool: string, args: ToolArgs): Promise<McpResult>;
  close(): Promise<void>;
}

const silent = { info() {}, debug() {}, warn() {}, error() {} };

class PinMcpServer extends BaseMcpServer {
  use(source: { settings: SapConfig; credential: IAuthProvider }): void {
    this.setConnectionContext({
      kind: 'built',
      source: { resolve: async () => source },
      sessionId: 'pin-server',
      destination: PIN_DESTINATION,
    });
  }
  register(registry: CompositeHandlersRegistry): void {
    this.registerHandlers(registry);
  }
}

/** A set's stdio groups, and the groups only its Streamable HTTP binary adds. */
function groupsOf(toolSet: ToolSet) {
  const context = noConnectionContext();
  const stdio = toolSet.groups(context, 'stdio');
  const names = new Set(
    stdio.flatMap((group) =>
      group.getHandlers().map((entry) => entry.toolDefinition.name),
    ),
  );
  const httpOnly = toolSet
    .groups(context, 'http')
    .filter((group) =>
      group
        .getHandlers()
        .every((entry) => !names.has(entry.toolDefinition.name)),
    );
  return [...stdio, ...httpOnly];
}

/** An answer as the MCP client hands it back, in the tool's result shape. */
function resultOf(answer: unknown): McpResult {
  const isError =
    typeof answer === 'object' &&
    answer !== null &&
    'isError' in answer &&
    answer.isError === true;
  const content: unknown =
    typeof answer === 'object' && answer !== null && 'content' in answer
      ? answer.content
      : undefined;
  const items: unknown[] = Array.isArray(content) ? content : [];
  return {
    isError,
    content: items.map((item) => ({
      type: 'text',
      text:
        typeof item === 'object' &&
        item !== null &&
        'text' in item &&
        typeof item.text === 'string'
          ? item.text
          : '',
    })),
  };
}

/** Where an in-process server's connection is built from: settings and a credential. */
export interface ServerSource {
  settings: SapConfig;
  credential: IAuthProvider;
}

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
): Promise<PinServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-server-'));
  const runtime = path.join(dir, 'runtime');
  const leftoverSessions = new LeftoverSessions({
    directory: runtime,
    probe: fakeProbe(PIN_PID),
    report: () => {},
  });
  if (setup === 'leftover-session') {
    await killedProcessSession(source.settings.url ?? '', runtime, {
      user: PIN_USER,
      destination: PIN_DESTINATION,
    });
  }
  const server = new PinMcpServer({
    name: 'pin-server',
    logger: silent,
    systemType: variant,
    systemContextResolver: defaultSystemContextResolver,
    batch: new InstanceBatch({ keepRawParts: false }),
    backgroundRuns: new InMemoryBackgroundRuns(),
    leftoverSessions,
    longSession: new LongSession(),
  });
  server.use(source);
  server.register(
    new CompositeHandlersRegistry([
      ...groupsOf(fullToolSet),
      ...groupsOf(compactToolSet),
    ]),
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'pin', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    call: async (tool, args) =>
      resultOf(await client.callTool({ name: tool, arguments: { ...args } })),
    close: async () => {
      await client.close();
      await server.terminalClose();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
