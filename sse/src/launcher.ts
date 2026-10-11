/**
 * `mcp-abap-adt-sse` — the HTTP+SSE binary (D48). Credentials come only
 * from the `x-sap-*` headers of the `GET` that opens each SSE connection; no
 * destination, no broker, no store, no login. A7 adds the `ToolSet`.
 */

import type { EventEmitter } from 'node:events';
import type { IServerConfig } from '@mcp-abap-adt/lib/config';
import {
  ServerConfigManager,
  validateExposition,
} from '@mcp-abap-adt/lib/config';
import { registryForExposition } from '@mcp-abap-adt/lib/handlers';
import { installTransportShutdown } from '@mcp-abap-adt/lib/http-transport';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import { stderrStateLogger } from '@mcp-abap-adt/lib/state';
import { SseServer } from './SseServer.js';
import { SSE_VERSION } from './sseVersion.js';

export interface SseLauncherOptions {
  /** The command's own name, for USAGE in `--help`. */
  program?: string;
  /** The version `--version` and `initialize` report; default sse's own. */
  version?: string;
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
    x-sap-debug-terminal-id        The debugger's terminal id (with --exposition=...,debug)
    x-sap-debug-ide-id             The debugger's IDE id
    Then SAP_RESPONSIBLE, SAP_MASTER_SYSTEM, SAP_DEBUG_TERMINAL_ID, SAP_DEBUG_IDE_ID
    of the environment; with x-sap-login, the login is the responsible when none is stated.

  Held state (a debug session) lives in the connection's instance until the
  connection closes; MCP_STATE_IDLE_MINUTES / --state-idle-minutes bound it.

  A health check answers GET /mcp/health.
`;

export async function main(options: SseLauncherOptions = {}): Promise<void> {
  const version = options.version ?? SSE_VERSION;
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(version);
    process.exit(0);
  }
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.error(
      ServerConfigManager.generateHelp(HELP_SECTIONS, {
        program: options.program ?? 'mcp-abap-adt-sse',
      }),
    );
    process.exit(0);
  }
  const config = await new ServerConfigManager({
    transport: 'sse',
  }).getConfig();
  await launch(config, options, {
    stderr: (line) => process.stderr.write(`${line}\n`),
    exit: (code) => process.exit(code),
    processLike: process,
  });
}

/** Everything after the parameters are read: the tool list, the server, the shutdown. */
export async function launch(
  config: IServerConfig,
  options: SseLauncherOptions,
  deps: SseLauncherDeps,
): Promise<SseServer> {
  // The connector and the tool filter read the system kind from the
  // environment (`resolveSystemKind`).
  if (config.systemType) process.env.SAP_SYSTEM_TYPE = config.systemType;
  const exposition = config.exposition ?? ['readonly', 'high'];
  validateExposition(exposition);
  const server = new SseServer(registryForExposition(exposition), {
    version: options.version ?? SSE_VERSION,
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
