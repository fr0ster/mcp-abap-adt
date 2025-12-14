import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IHandlersRegistry, IHandlerGroup, ToolDefinition, ToolHandler } from "../interfaces.js";

/**
 * Composite handlers registry that accepts multiple handler groups via Dependency Injection
 * Allows flexible composition of handler sets based on requirements
 */
export class CompositeHandlersRegistry implements IHandlersRegistry {
  private registeredTools: Set<string> = new Set();
  private handlerGroups: IHandlerGroup[];

  /**
   * Creates a composite registry with the specified handler groups
   * @param handlerGroups - Array of handler groups to register
   */
  constructor(handlerGroups: IHandlerGroup[] = []) {
    this.handlerGroups = handlerGroups;
  }

  /**
   * Adds a handler group to the registry
   * @param group - Handler group to add
   */
  addHandlerGroup(group: IHandlerGroup): void {
    this.handlerGroups.push(group);
  }

  /**
   * Removes a handler group from the registry
   * @param groupName - Name of the group to remove
   */
  removeHandlerGroup(groupName: string): void {
    this.handlerGroups = this.handlerGroups.filter(g => g.getName() !== groupName);
  }

  /**
   * Gets all handler groups in this registry
   */
  getHandlerGroups(): IHandlerGroup[] {
    return [...this.handlerGroups];
  }

  /**
   * Registers all tools from all handler groups on MCP server
   */
  registerAllTools(server: McpServer): void {
    this.registeredTools.clear();

    for (const group of this.handlerGroups) {
      group.registerHandlers(server);

      // Track registered tools
      const handlers = group.getHandlers();
      for (const entry of handlers) {
        this.registeredTools.add(entry.toolDefinition.name);
      }
    }
  }

  /**
   * Registers a single tool on server
   * Note: This method is provided for compatibility, but it's recommended to use handler groups
   */
  registerTool(
    server: McpServer,
    toolName: string,
    toolDefinition: ToolDefinition,
    handler: ToolHandler
  ): void {
    // For single tool registration, we need to use the base group's registerToolOnServer
    // This is a fallback method - prefer using handler groups
    throw new Error(
      "Single tool registration not supported. Use handler groups instead. " +
      "Create a handler group and add it via addHandlerGroup() or constructor."
    );
  }

  /**
   * Gets list of registered tools
   */
  getRegisteredTools(): string[] {
    return Array.from(this.registeredTools);
  }

  /**
   * Gets list of handler group names
   */
  getHandlerGroupNames(): string[] {
    return this.handlerGroups.map(g => g.getName());
  }
}
