/**
 * Unified configuration system
 * Exports all configuration-related classes and types
 */

export { ArgumentsParser, type ParsedArguments } from './ArgumentsParser.js';
export { ConfigLoader } from './ConfigLoader.js';
export type { HandlerSet, IServerConfig, Transport } from './IServerConfig.js';
// Runtime configuration
export { buildRuntimeConfig } from './runtimeConfig.js';
// Server configuration manager
export { ServerConfigManager } from './ServerConfigManager.js';
export type { YamlConfig } from './yamlConfig.js';
// YAML configuration
export {
  applyYamlConfigToArgs,
  generateConfigTemplateIfNeeded,
  generateYamlConfigTemplate,
  loadYamlConfig,
  parseConfigArg,
  validateYamlConfig,
} from './yamlConfig.js';
