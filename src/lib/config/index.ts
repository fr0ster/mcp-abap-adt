/**
 * Unified configuration system
 * Exports all configuration-related classes and types
 */

export { ArgumentsParser, type ParsedArguments } from "./ArgumentsParser.js";
export { ConfigLoader } from "./ConfigLoader.js";
export { type IServerConfig, type Transport, type HandlerSet } from "./IServerConfig.js";

// Server configuration manager
export { ServerConfigManager } from './ServerConfigManager.js';

// YAML configuration
export {
  parseConfigArg,
  loadYamlConfig,
  generateConfigTemplateIfNeeded,
  applyYamlConfigToArgs,
  validateYamlConfig,
  generateYamlConfigTemplate,
} from './yamlConfig.js';
export type { YamlConfig } from './yamlConfig.js';

// Runtime configuration
export { buildRuntimeConfig } from './runtimeConfig.js';
