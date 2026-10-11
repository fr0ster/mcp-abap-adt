/**
 * `mcp-abap-adt-http`'s parameter table (D38, spec §10.1): the Streamable HTTP
 * listener, beside lib's shared rows and the TLS rows (D50). No destination,
 * login or SSE option is here; any form of one — or of `--transport`, which is
 * gone — stops the start naming the binary that serves it (D39).
 */

import {
  CONF_ROW,
  DESTINATION_OPTIONS_REMOVED,
  EXPOSITION_ROW,
  type IServerConfig,
  type Parameter,
  type ParameterTable,
  type ParameterValue,
  parameterSource,
  readParameters,
  SSE_OPTIONS_REMOVED,
  STATE_IDLE_ROW,
  SYSTEM_TYPE_ROW,
  type TlsConfig,
  tlsConfigOf,
  tlsRows,
  toHandlerSets,
  transportRemoved,
  type YamlConfig,
} from '@mcp-abap-adt/lib/config';

const HTTP = 'STREAMABLE HTTP';

/** The Streamable HTTP rows: today's names (§10.1). */
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

/** `mcp-abap-adt-http`'s table: its rows, the shared rows, and what it refuses. */
export const HTTP_PARAMETERS: ParameterTable = {
  program: 'mcp-abap-adt-http',
  rows: [
    CONF_ROW,
    EXPOSITION_ROW,
    SYSTEM_TYPE_ROW,
    ...HTTP_ROWS,
    ...tlsRows('http'),
    STATE_IDLE_ROW,
  ],
  removed: [
    transportRemoved('http'),
    DESTINATION_OPTIONS_REMOVED,
    SSE_OPTIONS_REMOVED,
  ],
};

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

const list = (v: ParameterValue | undefined): string[] | undefined =>
  Array.isArray(v) ? [...v] : undefined;

/**
 * `mcp-abap-adt-http`'s configuration from the arguments, the environment
 * and the loaded config file. A removed parameter, or an invalid value,
 * throws a `ParameterRefusal` in its words.
 */
export function readHttpConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  yaml: YamlConfig | null = null,
): HttpConfig {
  const values = readParameters(HTTP_PARAMETERS, argv, env, yaml);
  return {
    exposition: toHandlerSets(values.exposition as readonly string[]),
    configFile: values.configFile as string | undefined,
    systemType: values.systemType as HttpConfig['systemType'],
    systemTypeSource: parameterSource(
      HTTP_PARAMETERS,
      'systemType',
      argv,
      env,
      yaml,
    ),
    stateIdleMinutes: values.stateIdleMinutes as number,
    host: values.host as string,
    port: values.port as number,
    httpPath: values.httpPath as string | undefined,
    httpJsonResponse: values.httpJsonResponse as boolean | undefined,
    allowedHosts: list(values.allowedHosts),
    allowedOrigins: list(values.allowedOrigins),
    enableDnsRebindingProtection:
      (values.enableDnsRebindingProtection as boolean | undefined) ?? false,
    tls: tlsConfigOf(values),
  };
}
