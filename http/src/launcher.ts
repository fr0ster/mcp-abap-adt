/**
 * `mcp-abap-adt-http` — the Streamable HTTP binary (D35, D39). Credentials
 * come only from each request's `x-sap-*` headers; no destination, no
 * broker, no store, no login. The tools are the `ToolSet` the command passes.
 */

import type { EventEmitter } from 'node:events';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import {
  answerVersionOrHelp,
  generateHelp,
  type LauncherEdges,
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
import {
  type HttpConfig,
  httpParameters,
  readHttpConfig,
} from './config/httpParameters.js';
import { StreamableHttpServer } from './StreamableHttpServer.js';

/**
 * What a command passes http's launcher (spec §3.5, D37, D49): the tools it
 * serves, and its own name and version — nothing else. Everything the
 * launcher does is http's, the same for any tool set:
 * `mcp-abap-adt-http` passes `fullToolSet`, `mcp-abap-adt-http-ro`
 * `fullReadOnlyToolSet`, `mcp-abap-adt-compact-http` and
 * `mcp-abap-adt-compact-http-ro` the compact sets.
 */
export interface HttpLauncherOptions {
  /** The tools served: fixed by the command, never by a flag. */
  toolSet: ToolSet;
  /** The command's own name: USAGE in `--help`, the `--conf` template's header. */
  program: string;
  /** The version `--version` and `initialize` report: the command's own package's. */
  version: string;
}

/** What the launcher takes from the program: the process's edges. */
export interface HttpLauncherDeps {
  stderr: (line: string) => void;
  exit: (code: number) => void;
  /** Where the shutdown listens: `process` in the program. */
  processLike: EventEmitter;
}

const HELP_SECTIONS = `
CREDENTIALS (each request's headers; nothing is stored, shared or cached):
    x-sap-url                      The system's URL (required)
    x-sap-client                   The client (optional)
    x-sap-jwt-token                A token you hold, sent as a Bearer token
    x-sap-login, x-sap-password    A user and password (basic)
  A request without them is answered 400 (ping excepted). x-mcp-destination is
  refused with 400: destinations are served only by mcp-abap-adt (stdio).

  System Context (per request, first found wins):
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

  Held state (a debug session) is reached again with its state_handle, on the
  instance that holds it; MCP_STATE_IDLE_MINUTES / --state-idle-minutes bound it.

  A health check answers GET /mcp/health.
`;

/** http's help: its own table, the set's TOOLS section, the headers. */
export function httpHelp(
  options: { toolSet?: ToolSet; program?: string } = {},
): string {
  const toolSet = options.toolSet ?? fullToolSet;
  const program = options.program ?? 'mcp-abap-adt-http';
  return generateHelp(httpParameters(toolSet, program), {
    description:
      "  MCP server for SAP ABAP systems via ADT, over Streamable HTTP: credentials only from\n  each request's x-sap-* headers. stdio (destinations, logins) is mcp-abap-adt, SSE\n  mcp-abap-adt-sse; a binary is its transport.",
    sections: [
      toolSet.toolsHelp('http'),
      HELP_SECTIONS,
      `\nEXAMPLES:\n  # Listen on port 3000\n  ${program} --port=3000\n`,
    ],
  });
}

export async function main(
  options: HttpLauncherOptions,
  edges: LauncherEdges = processEdges(),
): Promise<StreamableHttpServer | undefined> {
  const { argv, stderr, exit } = edges;
  if (
    answerVersionOrHelp(edges, {
      version: options.version,
      help: () => httpHelp(options),
    })
  ) {
    return undefined;
  }
  // http's own table: an option of another binary, --transport, or the
  // removed --exposition stops here.
  const config = readStartupConfig(
    httpParameters(options.toolSet, options.program),
    argv,
    process.env,
    { stderr, exit },
    (args, env, yaml) => readHttpConfig(args, env, yaml, options.toolSet),
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
  config: HttpConfig,
  options: HttpLauncherOptions,
  deps: HttpLauncherDeps,
): Promise<StreamableHttpServer | undefined> {
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
  const server = new StreamableHttpServer(registryOf(options.toolSet, 'http'), {
    version: options.version,
    stateIdleMinutes: config.stateIdleMinutes,
    // The state's lines go to stderr whatever the transport logger says.
    stateLogger: stderrStateLogger,
    host: config.host,
    port: config.port,
    enableJsonResponse: config.httpJsonResponse || undefined,
    path: config.httpPath,
    logger: noopLogger,
    tls: config.tls,
    allowedHosts: config.allowedHosts,
    allowedOrigins: config.allowedOrigins,
    enableDnsRebindingProtection: config.enableDnsRebindingProtection,
    // No runtime session file and no leftover-session tool: one server holds
    // the sessions of many users, so they are stdio's only.
    // Background runs of the run tools, kept in this process's memory
    // and handed to every instance; they end with the process.
    // Only where the set serves them: a -ro command has none, so a
    // run's `background: true` is refused.
    ...(options.toolSet.backgroundRuns && {
      backgroundRuns: new InMemoryBackgroundRuns(),
    }),
  });
  installTransportShutdown({
    begin: () => server.beginShutdown(),
    stopListening: () => server.stopListening(),
    release: () => server.releaseConnections(),
    exit: deps.exit,
    stderr: deps.stderr,
    processLike: deps.processLike,
    shutdownTimeoutMs:
      config.shutdownTimeout === undefined
        ? undefined
        : config.shutdownTimeout * 1000,
  });
  await server.start();
  return server;
}
