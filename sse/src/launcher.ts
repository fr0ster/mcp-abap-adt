/**
 * `mcp-abap-adt-sse` — the HTTP+SSE binary (D48). Credentials come only
 * from the `x-sap-*` headers of the `GET` that opens each SSE connection; no
 * destination, no broker, no store, no login. The tools are the `ToolSet`
 * the command passes.
 */

import type { EventEmitter } from 'node:events';
import { generateHelp, readStartupConfig } from '@mcp-abap-adt/lib/config';
import { installTransportShutdown } from '@mcp-abap-adt/lib/http-transport';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import { stderrStateLogger } from '@mcp-abap-adt/lib/state';
import {
  fullToolSet,
  registryOf,
  type ToolSet,
} from '@mcp-abap-adt/lib/tool-set';
import {
  readSseConfig,
  type SseConfig,
  sseParameters,
} from './config/sseParameters.js';
import { SseServer } from './SseServer.js';

/**
 * What a command passes sse's launcher (spec §3.5, D37, D49): the tools it
 * serves, and its own name and version — nothing else. Everything the
 * launcher does is sse's, the same for any tool set:
 * `mcp-abap-adt-sse` passes `fullToolSet`, `mcp-abap-adt-compact-sse` the
 * compact set.
 */
export interface SseLauncherOptions {
  /** The tools served, and the `--exposition` they are chosen by. */
  toolSet: ToolSet;
  /** The command's own name: USAGE in `--help`, the `--conf` template's header. */
  program: string;
  /** The version `--version` and `initialize` report: the command's own package's. */
  version: string;
}

/** What the launcher takes from the program: the process's edges. */
export interface SseLauncherDeps {
  stderr: (line: string) => void;
  exit: (code: number) => void;
  /** Where the shutdown listens: `process` in the program. */
  processLike: EventEmitter;
}

/** The process as `main` meets it; a test passes its own. */
export interface SseLauncherEdges extends SseLauncherDeps {
  /** The arguments, without node's and the script's. */
  argv: readonly string[];
  /** `--version`'s one line. */
  stdout: (line: string) => void;
}

/** The edges of the program: `process`. */
export function processEdges(): SseLauncherEdges {
  return {
    argv: process.argv.slice(2),
    stdout: (line) => console.log(line),
    stderr: (line) => process.stderr.write(`${line}\n`),
    exit: (code) => process.exit(code),
    processLike: process,
  };
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
    x-sap-debug-terminal-id        The debugger's terminal id (with --exposition=...,debug)
    x-sap-debug-ide-id             The debugger's IDE id
    Then SAP_RESPONSIBLE, SAP_MASTER_SYSTEM, SAP_DEBUG_TERMINAL_ID, SAP_DEBUG_IDE_ID
    of the environment; with x-sap-login, the login is the responsible when none is stated.

  Held state (a debug session) lives in the connection's instance until the
  connection closes; MCP_STATE_IDLE_MINUTES / --state-idle-minutes bound it.

  A health check answers GET /mcp/health.
`;

/** sse's help: its own table with the tool set's exposition row, the set's exposition, the headers. */
export function sseHelp(
  options: { toolSet?: ToolSet; program?: string } = {},
): string {
  const toolSet = options.toolSet ?? fullToolSet;
  return generateHelp(sseParameters(toolSet, options.program), {
    description:
      '  MCP server for SAP ABAP systems via ADT, over HTTP+SSE: credentials only from the\n  x-sap-* headers of the GET that opens each SSE connection. stdio (destinations,\n  logins) is mcp-abap-adt, Streamable HTTP mcp-abap-adt-http; a binary is its transport.',
    sections: [toolSet.expositionHelp, HELP_SECTIONS],
  });
}

export async function main(
  options: SseLauncherOptions,
  edges: SseLauncherEdges = processEdges(),
): Promise<SseServer | undefined> {
  const { argv, stderr, exit } = edges;
  if (argv.includes('--version') || argv.includes('-v')) {
    edges.stdout(options.version);
    exit(0);
    return undefined;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    stderr(sseHelp(options));
    exit(0);
    return undefined;
  }
  // sse's own table with the set's exposition row: an option of another
  // binary, --transport, or an exposition the set does not serve stops here.
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
): Promise<SseServer> {
  // The connector and the tool filter read the system kind from the
  // environment (`resolveSystemKind`).
  if (config.systemType) process.env.SAP_SYSTEM_TYPE = config.systemType;
  // The tool set's groups for the exposition read (a config made by hand
  // without one: the set's default).
  const exposition =
    config.exposition ??
    options.toolSet.exposition(options.toolSet.expositionRow.default, []);
  const server = new SseServer(registryOf(options.toolSet, exposition), {
    version: options.version,
    stateIdleMinutes: config.stateIdleMinutes,
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
  });
  installTransportShutdown({
    stop: () => server.stop(),
    exit: deps.exit,
    stderr: deps.stderr,
    processLike: deps.processLike,
  });
  await server.start();
  return server;
}
