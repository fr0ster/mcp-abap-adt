/**
 * The parameter machinery and the rows every binary shares. Each
 * binary's own table lives in its package: core's destination rows, http's
 * Streamable HTTP rows, sse's SSE rows.
 */

export {
  CONF_ROW,
  DESTINATION_OPTIONS_REMOVED,
  DESTINATIONS_ELSEWHERE,
  findSecretYamlKeys,
  generateHelp,
  HTTP_ELSEWHERE,
  HTTP_OPTIONS_REMOVED,
  type Parameter,
  type ParameterKind,
  ParameterRefusal,
  type ParameterTable,
  type ParameterValue,
  parameterSource,
  parametersHelp,
  parametersTemplate,
  type RemovedParameter,
  readParameters,
  refuseRemovedParameters,
  SHUTDOWN_TIMEOUT_ROW,
  SSE_ELSEWHERE,
  SSE_OPTIONS_REMOVED,
  STATE_IDLE_CLI,
  STATE_IDLE_ENV,
  STATE_IDLE_ROW,
  STATE_IDLE_YAML,
  TLS_ELSEWHERE,
  TLS_OPTIONS_REMOVED,
  TRANSPORT_GONE,
  tlsConfigOf,
  tlsRows,
  transportRemoved,
  validateYamlParameters,
} from './authParameters.js';
export {
  BINARIES,
  type Binary,
  decidingWord,
  expositionGoneWords,
  expositionRemoved,
  LOW_SET_GONE,
  type ServedTransport,
  type ToolSetKind,
} from './binaries.js';
export type { HandlerSet, IServerConfig, TlsConfig } from './IServerConfig.js';
export {
  applyMessageServerFields,
  MESSAGE_SERVER_ENV,
  MESSAGE_SERVER_FIELDS,
  type MessageServerField,
} from './messageServer.js';
export {
  answerVersionOrHelp,
  type LauncherEdges,
  processEdges,
  readStartupConfig,
  type StartupEdges,
} from './startup.js';
export { readStateIdleMinutes } from './stateIdleMinutes.js';
export {
  type ConfigurationRead,
  generateConfigTemplateIfNeeded,
  generateYamlConfigTemplate,
  loadYamlConfig,
  parseConfigArg,
  readConfigFile,
  validateYamlConfig,
  type YamlConfig,
} from './yamlConfig.js';
