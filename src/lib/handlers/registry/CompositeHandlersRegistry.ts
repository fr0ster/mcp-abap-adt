import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listedTool } from '../../listedTool.js';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type {
  IHandlerGroup,
  IHandlersRegistry,
  SapEnvironment,
  ToolDefinition,
  ToolHandler,
} from '../interfaces.js';
import { jsonSchemaToZod } from '../utils/schemaUtils.js';

/**
 * Composite handlers registry that accepts multiple handler groups via Dependency Injection
 * Allows flexible composition of handler sets based on requirements
 */
export class CompositeHandlersRegistry implements IHandlersRegistry {
  private registeredTools: Set<string> = new Set();
  private handlerGroups: IHandlerGroup[];
  private readonly failOnDuplicate: boolean;

  /**
   * Creates a composite registry with the specified handler groups
   * @param handlerGroups - Array of handler groups to register
   * @param failOnDuplicate - When true, throws on duplicate tool names (useful in dev)
   */
  constructor(
    handlerGroups: IHandlerGroup[] = [],
    failOnDuplicate: boolean = true,
  ) {
    this.handlerGroups = handlerGroups;
    this.failOnDuplicate = failOnDuplicate;
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
    this.handlerGroups = this.handlerGroups.filter(
      (g) => g.getName() !== groupName,
    );
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
      const handlers = group.getHandlers();
      for (const entry of handlers) {
        const name = entry.toolDefinition.name;
        if (this.registeredTools.has(name)) {
          const msg = `Duplicate tool registration detected: "${name}" in group "${group.getName()}"`;
          if (this.failOnDuplicate) {
            throw new Error(msg);
          }
          // Skip duplicate if not failing
          continue;
        }
        this.registeredTools.add(name);
      }
      // Use group's own registration logic (preserves schema conversions)
      group.registerHandlers(server);
    }
  }

  /**
   * Registers a single tool on server, as the variant the registry's groups
   * state lists it (`listedTool`): left out when that variant does not
   * serve it. With no group stating a variant, or groups stating different
   * ones, the definition as it is.
   * Note: This method is provided for compatibility, but it's recommended to use handler groups
   */
  registerTool(
    server: McpServer,
    toolName: string,
    toolDefinition: ToolDefinition,
    handler: ToolHandler,
  ): void {
    const listed = listedTool(toolDefinition, this.statedSystemType());
    if (!listed.listed) return;
    // A JSON Schema is converted to Zod, as a group registers it; the SDK
    // takes nothing else.
    const { inputSchema } = listed;
    const zodSchema =
      inputSchema &&
      typeof inputSchema === 'object' &&
      inputSchema.type === 'object' &&
      inputSchema.properties
        ? jsonSchemaToZod(inputSchema)
        : inputSchema;
    server.registerTool(
      toolName,
      {
        description: listed.description,
        inputSchema: zodSchema,
        ...listed.search,
      },
      handler as any,
    );
  }

  /**
   * The one SAP environment the groups state (`BaseHandlerGroup`'s
   * context); `undefined` when none states one or they state different
   * ones.
   */
  private statedSystemType(): SapEnvironment | undefined {
    const stated = new Set<SapEnvironment>();
    for (const group of this.handlerGroups) {
      if (!(group instanceof BaseHandlerGroup)) continue;
      const environment = group.statedSystemType();
      if (environment !== undefined) stated.add(environment);
    }
    const [only, ...others] = stated;
    return others.length === 0 ? only : undefined;
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
    return this.handlerGroups.map((g) => g.getName());
  }
}
