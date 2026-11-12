/**
 * `mcp-abap-adt-sse`'s parameter table: every SSE
 * option of today under its name, beside lib's shared rows and the TLS rows
 *. No destination, login or Streamable HTTP option is here; the CLI or
 * YAML form of one — or any form of `--transport`, which is gone — stops the
 * start naming the binary that serves it. Their environment variables
 * are not read.
 */

import {
  ACCESS_RESTRICTION_ROWS,
  BATCH_KEEP_RAW_PARTS_ROW,
  CONF_ROW,
  DESTINATION_OPTIONS_REMOVED,
  ENABLE_DATA_TOOLS_ROW,
  flagValue,
  HTTP_OPTIONS_REMOVED,
  type IServerConfig,
  listValue,
  numberValue,
  type Parameter,
  type ParameterTable,
  parameterSource,
  readParameters,
  SHUTDOWN_TIMEOUT_ROW,
  STATE_IDLE_ROW,
  type TlsConfig,
  textValue,
  tlsConfigOf,
  tlsRows,
  transportRemoved,
  wordValue,
  type YamlConfig,
} from '@mcp-abap-adt/lib/config';
import { fullToolSet, type ToolSet } from '@mcp-abap-adt/lib/tool-set';
import { SYSTEM_TYPE_ROW, SYSTEM_TYPES } from '@mcp-abap-adt/responsible-rules';

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
      BATCH_KEEP_RAW_PARTS_ROW,
      ENABLE_DATA_TOOLS_ROW,
      SHUTDOWN_TIMEOUT_ROW,
      ...ACCESS_RESTRICTION_ROWS,
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
    configFile: textValue(values.configFile),
    systemType: wordValue(values.systemType, SYSTEM_TYPES),
    systemTypeSource: parameterSource(table, 'systemType', argv, env, yaml),
    stateIdleMinutes: numberValue(values.stateIdleMinutes),
    batchKeepRawParts: values.batchKeepRawParts === true,
    enableDataTools: values.enableDataTools === true,
    shutdownTimeout: numberValue(values.shutdownTimeout),
    host: textValue(values.host),
    port: numberValue(values.port),
    ssePath: textValue(values.ssePath),
    postPath: textValue(values.postPath),
    allowedHosts: listValue(values.allowedHosts),
    allowedOrigins: listValue(values.allowedOrigins),
    enableDnsRebindingProtection:
      flagValue(values.enableDnsRebindingProtection) ?? false,
    tls: tlsConfigOf(values),
  };
}
