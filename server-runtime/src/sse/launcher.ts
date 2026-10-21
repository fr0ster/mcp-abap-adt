/**
 * `mcp-abap-adt-sse` — the HTTP+SSE binary. Credentials come only
 * from the `x-sap-*` headers of the `GET` that opens each SSE connection; no
 * destination, no broker, no store, no login. The tools are the `ToolSet`
 * the command passes.
 */

import type { EventEmitter } from 'node:events';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import {
  answerVersionOrHelp,
  generateHelp,
  type LauncherEdges,
  libInstances,
  processEdges,
  readStartupConfig,
} from '@mcp-abap-adt/lib/config';
import { installTransportShutdown } from '@mcp-abap-adt/lib/http-transport';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import { stderrStateLogger } from '@mcp-abap-adt/lib/state';
import {
  fullToolSet,
  registryOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';
import { listenerSystemTypeRequiredWords } from '@mcp-abap-adt/responsible-rules';
import { secondCopyLine } from '../secondCopy.js';
import {
  readSseConfig,
  type SseConfig,
  sseParameters,
} from './config/sseParameters.js';
import { SseServer } from './SseServer.js';

/**
 * What a command passes sse's launcher: the tools it
 * serves, and its own name and version — nothing else. Everything the
 * launcher does is sse's, the same for any tool set:
 * `mcp-abap-adt-sse` passes `fullToolSet`, `mcp-abap-adt-sse-ro`
 * `fullReadOnlyToolSet`, `mcp-abap-adt-compact-sse` and
 * `mcp-abap-adt-compact-sse-ro` the compact sets.
 */
export interface SseLauncherOptions {
  /** The tools served: fixed by the command, never by a flag. */
  toolSet: ToolSet;
  /** The command's own name: USAGE in `--help`, the `--conf` template's header. */
  program: string;
  /** The version `--version` and `initialize` report: the command's own package's. */
  version: string;
  /** The command's own npm package: the one a second copy of lib asks to reinstall. */
  packageName: string;
}

/** What the launcher takes from the program: the process's edges. */
export interface SseLauncherDeps {
  stderr: (line: string) => void;
  exit: (code: number) => void;
  /** Where the shutdown listens: `process` in the program. */
  processLike: EventEmitter;
}

const HELP_SECTIONS = `
CREDENTIALS (the headers of the GET that opens each SSE connection; a POST is
routed by its sessionId alone, and its own x-sap-* headers are not read):
    x-sap-url                      The system's URL (required)
    x-sap-client                   The client (optional)
    x-sap-jwt-token                A token you hold, sent as a Bearer token
    x-sap-login, x-sap-password    A user and password (basic)
  A GET without them is answered 400. x-mcp-destination, on a GET or a POST, is
  refused with 400: destinations are served only by mcp-abap-adt (stdio).
  Nothing is shared with another connection, and nothing outlives it.

  System Context (the opening GET's headers, first found wins):
    x-sap-responsible              Responsible of created objects
    x-sap-master-system            Master system of created objects
    x-sap-language                 Master/original language for created objects
    x-sap-debug-terminal-id        The debugger's terminal id (where the debugger is served)
    x-sap-debug-ide-id             The debugger's IDE id
    x-sap-debug-breakpoint-conflict  replace (default) or refuse-if-held: whether a take-over
                                   of the debugger, and every later change of its breakpoints,
                                   first asks if another debugger listens for the same SAP user
    Then SAP_RESPONSIBLE, SAP_MASTER_SYSTEM, SAP_DEBUG_TERMINAL_ID, SAP_DEBUG_IDE_ID,
    SAP_DEBUG_BREAKPOINT_CONFLICT of the environment; with x-sap-login, the login is the responsible when none is stated.

  Held state (a debug session) lives in the connection's instance until the
  connection closes; MCP_STATE_IDLE_MINUTES / --state-idle-minutes bound it.

  A health check answers GET /mcp/health.
`;

/** sse's help: its own table, the set's TOOLS section, the headers. */
export function sseHelp(
  options: { toolSet?: ToolSet; program?: string } = {},
): string {
  const toolSet = options.toolSet ?? fullToolSet;
  const program = options.program ?? 'mcp-abap-adt-sse';
  return generateHelp(sseParameters(toolSet, program), {
    description:
      '  MCP server for SAP ABAP systems via ADT, over HTTP+SSE: credentials only from the\n  x-sap-* headers of the GET that opens each SSE connection. stdio (destinations,\n  logins) is mcp-abap-adt, Streamable HTTP mcp-abap-adt-http; a binary is its transport.',
    sections: [
      toolSet.toolsHelp('sse'),
      HELP_SECTIONS,
      `\nEXAMPLES:\n  # Listen on port 3000\n  ${program} --sse-port=3000\n`,
    ],
  });
}

export async function main(
  options: SseLauncherOptions,
  edges: LauncherEdges = processEdges(),
): Promise<SseServer | undefined> {
  // A second copy of lib stops the start before anything is read.
  const secondCopy = secondCopyLine(libInstances(), options.packageName);
  if (secondCopy !== undefined) {
    edges.stderr(secondCopy);
    edges.exit(1);
    return undefined;
  }
  const { argv, stderr, exit } = edges;
  if (
    answerVersionOrHelp(edges, {
      version: options.version,
      help: () => sseHelp(options),
    })
  ) {
    return undefined;
  }
  // sse's own table: an option of another binary, --transport, or the
  // removed --exposition stops here.
  const config = readStartupConfig(
    sseParameters(options.toolSet, options.program),
    argv,
    process.env,
    { stderr, exit },
    (args, env, yaml) => readSseConfig(args, env, yaml, options.toolSet),
  );
  if (config === undefined) return undefined;
  return launch(config, options, {
    stderr,
    exit,
    processLike: edges.processLike,
  });
}

/** Everything after the parameters are read: the tool list, the server, the shutdown. */
export async function launch(
  config: SseConfig,
  options: SseLauncherOptions,
  deps: SseLauncherDeps,
): Promise<SseServer | undefined> {
  // The system kind is required, never guessed: stated by --system-type,
  // SAP_SYSTEM_TYPE or YAML system-type (no request header states it).
  // Without it the start ends here, before anything listens — so no tool
  // list is filtered for a kind nobody stated.
  if (config.systemType === undefined) {
    deps.stderr(`[MCP] ${listenerSystemTypeRequiredWords()}`);
    deps.exit(1);
    return undefined;
  }
  // The connector and the tool filter read the system kind from the
  // environment (`resolveSystemKind`).
  process.env.SAP_SYSTEM_TYPE = config.systemType;
  const server = new SseServer(registryOf(options.toolSet, 'sse'), {
    version: options.version,
    stateIdleMinutes: config.stateIdleMinutes,
    // Batch mode: one InstanceBatch per SSE connection's instance.
    batch: { keepRawParts: config.batchKeepRawParts === true },
    // The state's lines go to stderr whatever the transport logger says.
    stateLogger: stderrStateLogger,
    host: config.host,
    port: config.port,
    ssePath: config.ssePath,
    postPath: config.postPath,
    logger: noopLogger,
    tls: config.tls,
    allowedHosts: config.allowedHosts,
    allowedOrigins: config.allowedOrigins,
    enableDnsRebindingProtection: config.enableDnsRebindingProtection,
    // No runtime session file and no leftover-session tool: one server holds
    // the sessions of many users, so they are stdio's only.
    // Background runs of the run tools, kept in this process's memory and
    // handed to every SSE session's instance; they end with the process.
    // Only where the set serves them: a -ro command has none, so a run's
    // `background: true` is refused.
    ...(options.toolSet.backgroundRuns && {
      backgroundRuns: new InMemoryBackgroundRuns(),
    }),
  });
  installTransportShutdown({
    stopListening: () => server.stopListening(),
    release: () => server.releaseConnections(),
    shutdownTimeoutMs:
      config.shutdownTimeout === undefined
        ? undefined
        : config.shutdownTimeout * 1000,
    exit: deps.exit,
    stderr: deps.stderr,
    processLike: deps.processLike,
  });
  await server.start();
  return server;
}
