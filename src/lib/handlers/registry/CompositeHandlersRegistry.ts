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
import { registeredSchema } from '../utils/schemaUtils.js';

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
    // Each group lists the variant its own context states; groups stating
    // two different ones are refused before anything is registered.
    this.refuseDifferentVariants(
      new Set(
        this.statements().flatMap(({ stated }) =>
          stated === undefined ? [] : [stated],
        ),
      ),
    );
    this.registeredTools.clear();

    for (const group of this.handlerGroups) {
      // The tools the group lists on the variant it states: one the
      // variant leaves out is not registered, so it is not counted.
      const environment = statedBy(group);
      const handlers = group.getHandlers();
      for (const entry of handlers) {
        if (!listedTool(entry.toolDefinition, environment).listed) continue;
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
   * Registers a single tool on server, as the variant every group of the
   * registry states lists it (`listedTool`): left out when that variant
   * does not serve it; as it is when no group states one. Groups stating
   * different variants — one of them none included — are refused before
   * anything is registered.
   * Note: This method is provided for compatibility, but it's recommended to use handler groups
   */
  registerTool(
    server: McpServer,
    toolName: string,
    toolDefinition: ToolDefinition,
    handler: ToolHandler,
  ): void {
    const stated = new Set(this.statements().map(({ stated }) => stated));
    this.refuseDifferentVariants(stated);
    const [environment] = stated;
    const listed = listedTool(toolDefinition, environment);
    if (!listed.listed) return;
    // A JSON Schema is converted to Zod, as a group registers it; the SDK
    // takes nothing else.
    const { inputSchema } = listed;
    // A JSON Schema converted to Zod (`registeredSchema`), as the SDK takes it.
    const zodSchema = registeredSchema(inputSchema);
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
   * What each group states (`BaseHandlerGroup`'s context); a group of
   * another kind states none.
   */
  private statements(): Array<{
    readonly group: string;
    readonly stated: SapEnvironment | undefined;
  }> {
    return this.handlerGroups.map((group) => ({
      group: group.getName(),
      stated: statedBy(group),
    }));
  }

  /**
   * Refuses `stated` holding more than one variant, before anything is
   * registered: the error names each group and what it states.
   */
  private refuseDifferentVariants(
    stated: ReadonlySet<SapEnvironment | undefined>,
  ): void {
    if (stated.size <= 1) return;
    const named = this.statements()
      .map(({ group, stated }) => `${group} states ${stated ?? 'none'}`)
      .join(', ');
    throw new Error(
      `The handler groups state different system types: ${named}; one registration lists one variant`,
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
    return this.handlerGroups.map((g) => g.getName());
  }
}

/**
 * What `group` states (`BaseHandlerGroup`'s context); a group of another
 * kind states none.
 */
function statedBy(group: IHandlerGroup): SapEnvironment | undefined {
  return group instanceof BaseHandlerGroup
    ? group.statedSystemType()
    : undefined;
}
