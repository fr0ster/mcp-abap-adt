/**
 * The parameter machinery and the rows every binary shares (D38). Each
 * binary's own table lives in its package: core's destination rows, http's
 * Streamable HTTP rows, sse's SSE rows.
 */

export {
  CONF_ROW,
  DESTINATION_OPTIONS_REMOVED,
  DESTINATIONS_ELSEWHERE,
  EXPOSITION_ROW,
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
  SSE_ELSEWHERE,
  SSE_OPTIONS_REMOVED,
  STATE_IDLE_CLI,
  STATE_IDLE_ENV,
  STATE_IDLE_ROW,
  STATE_IDLE_YAML,
  SYSTEM_TYPE_ROW,
  TLS_ELSEWHERE,
  TLS_OPTIONS_REMOVED,
  TRANSPORT_GONE,
  tlsConfigOf,
  tlsRows,
  transportRemoved,
  validateYamlParameters,
} from './authParameters.js';
export { expositionHelp, toHandlerSets } from './exposition.js';
export type { HandlerSet, IServerConfig, TlsConfig } from './IServerConfig.js';
export { readStartupConfig, type StartupEdges } from './startup.js';
export { readStateIdleMinutes } from './stateIdleMinutes.js';
export {
  expositionProblem,
  validateExposition,
} from './validateExposition.js';
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
