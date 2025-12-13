/**
 * Server module exports
 */

export {
  jsonSchemaToZod,
  registerToolOnServer,
} from "./toolRegistration";
export type { ToolDefinition, ToolHandler } from "./toolRegistration";

export {
  setupSignalHandlers,
  shutdown,
} from "./lifecycle";
export type { LifecycleOptions } from "./lifecycle";
