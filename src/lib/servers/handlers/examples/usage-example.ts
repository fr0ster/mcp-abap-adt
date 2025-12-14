/**
 * Example usage of handler registration system with Dependency Injection
 *
 * This example demonstrates how to use handler groups to create different
 * server configurations with different sets of handlers.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CompositeHandlersRegistry } from "../registry/CompositeHandlersRegistry.js";
import { IHandlerGroup } from "../interfaces.js";
import { ReadOnlyHandlersGroup } from "../groups/ReadOnlyHandlersGroup.js";
import { HighLevelHandlersGroup } from "../groups/HighLevelHandlersGroup.js";
import { LowLevelHandlersGroup } from "../groups/LowLevelHandlersGroup.js";
import { SystemHandlersGroup } from "../groups/SystemHandlersGroup.js";
import { SearchHandlersGroup } from "../groups/SearchHandlersGroup.js";

/**
 * Example 1: Read-only server (e.g., for public API)
 * Only registers read-only handlers, system handlers, and search handlers
 */
export function createReadOnlyServer(): McpServer {
  const mcpServer = new McpServer({
    name: "mcp-abap-adt-readonly",
    version: "1.0.0",
  });

  const handlersRegistry = new CompositeHandlersRegistry([
    new ReadOnlyHandlersGroup(),
    new SystemHandlersGroup(),
    new SearchHandlersGroup(),
  ]);

  handlersRegistry.registerAllTools(mcpServer);

  return mcpServer;
}

/**
 * Example 2: Full-featured server
 * Registers all handler groups
 */
export function createFullServer(): McpServer {
  const mcpServer = new McpServer({
    name: "mcp-abap-adt-full",
    version: "1.0.0",
  });

  const handlersRegistry = new CompositeHandlersRegistry([
    new ReadOnlyHandlersGroup(),
    new HighLevelHandlersGroup(),
    new LowLevelHandlersGroup(),
    new SystemHandlersGroup(),
    new SearchHandlersGroup(),
  ]);

  handlersRegistry.registerAllTools(mcpServer);

  return mcpServer;
}

/**
 * Example 3: Dynamic handler group management
 * Add/remove handler groups at runtime
 */
export function createDynamicServer(): McpServer {
  const mcpServer = new McpServer({
    name: "mcp-abap-adt-dynamic",
    version: "1.0.0",
  });

  const handlersRegistry = new CompositeHandlersRegistry();

  // Add groups dynamically
  handlersRegistry.addHandlerGroup(new ReadOnlyHandlersGroup());
  handlersRegistry.addHandlerGroup(new HighLevelHandlersGroup());
  handlersRegistry.addHandlerGroup(new SystemHandlersGroup());
  handlersRegistry.addHandlerGroup(new SearchHandlersGroup());

  // Register all tools
  handlersRegistry.registerAllTools(mcpServer);

  // Get information about registered groups
  console.log("Handler groups:", handlersRegistry.getHandlerGroupNames());
  console.log("Registered tools:", handlersRegistry.getRegisteredTools());

  // Remove a group if needed
  // handlersRegistry.removeHandlerGroup("HighLevelHandlers");

  // Add low-level handlers if needed
  handlersRegistry.addHandlerGroup(new LowLevelHandlersGroup());

  return mcpServer;
}

/**
 * Example 4: Custom server configuration
 * Create a server with only specific handler groups
 */
export function createCustomServer(includeReadOnly: boolean = true): McpServer {
  const mcpServer = new McpServer({
    name: "mcp-abap-adt-custom",
    version: "1.0.0",
  });

  const handlerGroups: IHandlerGroup[] = [];

  if (includeReadOnly) {
    handlerGroups.push(new ReadOnlyHandlersGroup() as IHandlerGroup);
  }

  // Add other groups based on configuration
  // if (config.includeHighLevel) {
  //   handlerGroups.push(new HighLevelHandlersGroup() as IHandlerGroup);
  // }
  // if (config.includeLowLevel) {
  //   handlerGroups.push(new LowLevelHandlersGroup() as IHandlerGroup);
  // }
  // if (config.includeSystem) {
  //   handlerGroups.push(new SystemHandlersGroup() as IHandlerGroup);
  // }
  // if (config.includeSearch) {
  //   handlerGroups.push(new SearchHandlersGroup() as IHandlerGroup);
  // }

  // Example: Add high-level, low-level, system, and search groups
  handlerGroups.push(new HighLevelHandlersGroup() as IHandlerGroup);
  handlerGroups.push(new LowLevelHandlersGroup() as IHandlerGroup);
  handlerGroups.push(new SystemHandlersGroup() as IHandlerGroup);
  handlerGroups.push(new SearchHandlersGroup() as IHandlerGroup);

  const handlersRegistry = new CompositeHandlersRegistry(handlerGroups);
  handlersRegistry.registerAllTools(mcpServer);

  return mcpServer;
}
