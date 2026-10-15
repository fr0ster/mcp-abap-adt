/**
 * `mcp-abap-adt-sse`'s parameter table: every SSE
 * option of today under its name, beside lib's shared rows and the TLS rows
 *. No destination, login or Streamable HTTP option is here; the CLI or
 * YAML form of one — or any form of `--transport`, which is gone — stops the
 * start naming the binary that serves it. Their environment variables
 * are not read.
 */

import {
  CONF_ROW,
  DESTINATION_OPTIONS_REMOVED,
  HTTP_OPTIONS_REMOVED,
  type IServerConfig,
  type Parameter,
  type ParameterTable,
  type ParameterValue,
  parameterSource,
  readParameters,
  SHUTDOWN_TIMEOUT_ROW,
  STATE_IDLE_ROW,
  type TlsConfig,
  tlsConfigOf,
  tlsRows,
  transportRemoved,
  type YamlConfig,
} from '@mcp-abap-adt/lib/config';
import { fullToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { SYSTEM_TYPE_ROW } from '@mcp-abap-adt/responsible-rules';

const SSE = 'SSE';

/** The SSE rows: today's names. */
export const SSE_ROWS: readonly Parameter[] = [
  {
    key: 'host',
    cli: '--sse-host',
    env: 'MCP_SSE_HOST',
    yaml: 'sse.host',
    kind: 'string',
    default: '127.0.0.1',
    valueHint: '=<host>',
    section: SSE,
    help: 'Host to listen on (default 127.0.0.1, this machine only; 0.0.0.0 for every interface)',
  },
  {
    key: 'port',
    cli: '--sse-port',
    env: 'MCP_SSE_PORT',
    yaml: 'sse.port',
    kind: 'port',
    default: 3001,
    section: SSE,
    help: 'Port to listen on, 1-65535 (default 3001)',
  },
  {
    key: 'ssePath',
    cli: '--sse-path',
    kind: 'string',
    valueHint: '=<path>',
    section: SSE,
    help: 'The path of the GET that opens an SSE connection (default /sse)',
  },
  {
    key: 'postPath',
    cli: '--post-path',
    kind: 'string',
    valueHint: '=<path>',
    section: SSE,
    help: "The path of a connection's POST messages (default /messages)",
  },
  {
    key: 'allowedHosts',
    cli: '--sse-allowed-hosts',
    env: 'MCP_SSE_ALLOWED_HOSTS',
    yaml: 'sse.allowed-hosts',
    kind: 'list',
    section: SSE,
    help: 'Host header values accepted with DNS-rebinding protection (exact, with the port), comma-separated',
  },
  {
    key: 'allowedOrigins',
    cli: '--sse-allowed-origins',
    env: 'MCP_SSE_ALLOWED_ORIGINS',
    yaml: 'sse.allowed-origins',
    kind: 'list',
    section: SSE,
    help: 'Origin header values accepted with DNS-rebinding protection (exact, with the scheme), comma-separated',
  },
  {
    key: 'enableDnsRebindingProtection',
    cli: '--sse-enable-dns-protection',
    env: 'MCP_SSE_ENABLE_DNS_PROTECTION',
    yaml: 'sse.enable-dns-protection',
    kind: 'flag',
    section: SSE,
    help: 'Enable DNS-rebinding protection (with --sse-allowed-hosts and/or --sse-allowed-origins)',
  },
];

/**
 * sse's table for a tool set: its rows, the shared rows, and what it
 * refuses — the set's removed `--exposition` among them, naming the sse
 * binary its words asked for. `mcp-abap-adt-sse-ro`, `mcp-abap-adt-compact-sse`
 * and `mcp-abap-adt-compact-sse-ro` are this table with their own set,
 * nothing else.
 */
export function sseParameters(
  toolSet: ToolSet,
  program = 'mcp-abap-adt-sse',
): ParameterTable {
  return {
    program,
    rows: [
      CONF_ROW,
      SYSTEM_TYPE_ROW,
      ...SSE_ROWS,
      ...tlsRows('sse'),
      STATE_IDLE_ROW,
      SHUTDOWN_TIMEOUT_ROW,
    ],
    removed: [
      toolSet.expositionRemoved('sse'),
      transportRemoved('sse'),
      DESTINATION_OPTIONS_REMOVED,
      HTTP_OPTIONS_REMOVED,
    ],
  };
}

/** `mcp-abap-adt-sse`'s table: sse's, with the full tool set. */
export const SSE_PARAMETERS: ParameterTable = sseParameters(fullToolSet);

/** What `mcp-abap-adt-sse` reads. */
export interface SseConfig extends IServerConfig {
  host?: string;
  port?: number;
  /** The path of the GET that opens an SSE connection */
  ssePath?: string;
  /** The path of a connection's POST messages */
  postPath?: string;
  /** Allowed Host header values (DNS-rebinding protection; exact, incl. port) */
  allowedHosts?: string[];
  /** Allowed Origin header values (DNS-rebinding protection; exact, incl. scheme) */
  allowedOrigins?: string[];
  /** Enable DNS-rebinding protection */
  enableDnsRebindingProtection?: boolean;
  /** TLS: cert and key start HTTPS */
  tls?: TlsConfig;
}

const list = (v: ParameterValue | undefined): string[] | undefined =>
  Array.isArray(v) ? [...v] : undefined;

/**
 * `mcp-abap-adt-sse`'s configuration from the arguments, the environment and
 * the loaded config file. A removed parameter, or an invalid value, throws a
 * `ParameterRefusal` in its words.
 */
export function readSseConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml: YamlConfig | null = null,
  toolSet: ToolSet = fullToolSet,
): SseConfig {
  const table = sseParameters(toolSet);
  const values = readParameters(table, argv, env, yaml);
  return {
    configFile: values.configFile as string | undefined,
    systemType: values.systemType as SseConfig['systemType'],
    systemTypeSource: parameterSource(table, 'systemType', argv, env, yaml),
    stateIdleMinutes: values.stateIdleMinutes as number,
    shutdownTimeout: values.shutdownTimeout as number | undefined,
    host: values.host as string,
    port: values.port as number,
    ssePath: values.ssePath as string | undefined,
    postPath: values.postPath as string | undefined,
    allowedHosts: list(values.allowedHosts),
    allowedOrigins: list(values.allowedOrigins),
    enableDnsRebindingProtection:
      (values.enableDnsRebindingProtection as boolean | undefined) ?? false,
    tls: tlsConfigOf(values),
  };
}
