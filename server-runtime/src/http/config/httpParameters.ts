/**
 * `mcp-abap-adt-http`'s parameter table: the Streamable HTTP
 * listener, beside lib's shared rows and the TLS rows. No destination,
 * login or SSE option is here; the CLI or YAML form of one — or any form of
 * `--transport`, which is gone — stops the start naming the binary that serves
 * it. Their environment variables are not read.
 */

import {
  ACCESS_RESTRICTION_ROWS,
  BATCH_KEEP_RAW_PARTS_ROW,
  CONF_ROW,
  DESTINATION_OPTIONS_REMOVED,
  ENABLE_DATA_TOOLS_ROW,
  flagValue,
  type IServerConfig,
  listValue,
  numberValue,
  type Parameter,
  type ParameterTable,
  parameterSource,
  readAccessRestrictions,
  readParameters,
  SHUTDOWN_TIMEOUT_ROW,
  SSE_OPTIONS_REMOVED,
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

const HTTP = 'STREAMABLE HTTP';

/** The Streamable HTTP rows: today's names. */
export const HTTP_ROWS: readonly Parameter[] = [
  {
    key: 'host',
    cli: '--host',
    cliAliases: ['--http-host'],
    env: 'MCP_HTTP_HOST',
    yaml: 'http.host',
    kind: 'string',
    default: '127.0.0.1',
    valueHint: '=<host>',
    section: HTTP,
    help: 'Host to listen on (default 127.0.0.1, this machine only; 0.0.0.0 for every interface)',
  },
  {
    key: 'port',
    cli: '--port',
    cliAliases: ['--http-port'],
    env: 'MCP_HTTP_PORT',
    yaml: 'http.port',
    kind: 'port',
    default: 3000,
    section: HTTP,
    help: 'Port to listen on, 1-65535 (default 3000)',
  },
  {
    key: 'httpPath',
    cli: '--path',
    cliAliases: ['--http-path'],
    kind: 'string',
    valueHint: '=<path>',
    section: HTTP,
    help: 'The MCP endpoint path (default /mcp/stream/http)',
  },
  {
    key: 'httpJsonResponse',
    cli: '--http-json-response',
    env: 'MCP_HTTP_ENABLE_JSON_RESPONSE',
    yaml: 'http.json-response',
    kind: 'flag',
    section: HTTP,
    help: 'Answer with JSON responses rather than SSE streams',
  },
  {
    key: 'allowedHosts',
    cli: '--http-allowed-hosts',
    env: 'MCP_HTTP_ALLOWED_HOSTS',
    yaml: 'http.allowed-hosts',
    kind: 'list',
    section: HTTP,
    help: 'Host header values accepted with DNS-rebinding protection (exact, with the port), comma-separated',
  },
  {
    key: 'allowedOrigins',
    cli: '--http-allowed-origins',
    env: 'MCP_HTTP_ALLOWED_ORIGINS',
    yaml: 'http.allowed-origins',
    kind: 'list',
    section: HTTP,
    help: 'Origin header values accepted with DNS-rebinding protection (exact, with the scheme), comma-separated',
  },
  {
    key: 'enableDnsRebindingProtection',
    cli: '--http-enable-dns-protection',
    env: 'MCP_HTTP_ENABLE_DNS_PROTECTION',
    yaml: 'http.enable-dns-protection',
    kind: 'flag',
    section: HTTP,
    help: 'Enable DNS-rebinding protection (with --http-allowed-hosts and/or --http-allowed-origins)',
  },
];

/**
 * http's table for a tool set: its rows, the shared rows, and what it
 * refuses — the set's removed `--exposition` among them, naming the http
 * binary its words asked for. `mcp-abap-adt-http-ro`, `mcp-abap-adt-compact-http`
 * and `mcp-abap-adt-compact-http-ro` are this table with their own set,
 * nothing else.
 */
export function httpParameters(
  toolSet: ToolSet,
  program = 'mcp-abap-adt-http',
): ParameterTable {
  return {
    program,
    rows: [
      CONF_ROW,
      SYSTEM_TYPE_ROW,
      ...HTTP_ROWS,
      ...tlsRows('http'),
      STATE_IDLE_ROW,
      BATCH_KEEP_RAW_PARTS_ROW,
      ENABLE_DATA_TOOLS_ROW,
      SHUTDOWN_TIMEOUT_ROW,
      ...ACCESS_RESTRICTION_ROWS,
    ],
    removed: [
      toolSet.expositionRemoved('http'),
      transportRemoved('http'),
      DESTINATION_OPTIONS_REMOVED,
      SSE_OPTIONS_REMOVED,
    ],
  };
}

/** `mcp-abap-adt-http`'s table: http's, with the full tool set. */
export const HTTP_PARAMETERS: ParameterTable = httpParameters(fullToolSet);

/** What `mcp-abap-adt-http` reads. */
export interface HttpConfig extends IServerConfig {
  host?: string;
  port?: number;
  /** The MCP endpoint path */
  httpPath?: string;
  /** JSON responses rather than SSE streams */
  httpJsonResponse?: boolean;
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
 * `mcp-abap-adt-http`'s configuration from the arguments, the environment
 * and the loaded config file. A removed parameter, or an invalid value,
 * throws a `ParameterRefusal` in its words.
 */
export function readHttpConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml: YamlConfig | null = null,
  toolSet: ToolSet = fullToolSet,
): HttpConfig {
  const table = httpParameters(toolSet);
  const values = readParameters(table, argv, env, yaml);
  return {
    configFile: textValue(values.configFile),
    systemType: wordValue(values.systemType, SYSTEM_TYPES),
    systemTypeSource: parameterSource(table, 'systemType', argv, env, yaml),
    stateIdleMinutes: numberValue(values.stateIdleMinutes),
    batchKeepRawParts: values.batchKeepRawParts === true,
    enableDataTools: values.enableDataTools === true,
    accessRestrictions: readAccessRestrictions(argv, env, yaml),
    shutdownTimeout: numberValue(values.shutdownTimeout),
    host: textValue(values.host),
    port: numberValue(values.port),
    httpPath: textValue(values.httpPath),
    httpJsonResponse: flagValue(values.httpJsonResponse),
    allowedHosts: listValue(values.allowedHosts),
    allowedOrigins: listValue(values.allowedOrigins),
    enableDnsRebindingProtection:
      flagValue(values.enableDnsRebindingProtection) ?? false,
    tls: tlsConfigOf(values),
  };
}
