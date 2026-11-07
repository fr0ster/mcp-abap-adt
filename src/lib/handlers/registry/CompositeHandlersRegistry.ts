import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isBackgroundRunTool } from '../../backgroundRuns/tools.js';
import { listedTool } from '../../listedTool.js';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
  SapEnvironment,
} from '../interfaces.js';
import type { CallContext } from '../utils/handlerCall.js';

/**
 * Why `registerTool` refuses a tool: no `BaseHandlerGroup` of the registry
 * holds a tool of that name, so its call has no group context to run on.
 */
export const REGISTER_TOOL_UNHELD_WORDS = (toolName: string): string =>
  `registerTool registers a tool of one of the registry's handler groups: no group of this registry holds "${toolName}", so its call has no context to run on`;

/**
 * Composite handlers registry that accepts multiple handler groups via Dependency Injection
 * Allows flexible composition of handler sets based on requirements
 */
export class CompositeHandlersRegistry<
  Group extends IHandlerGroup = IHandlerGroup,
> implements IHandlersRegistry
{
  private registeredTools: Set<string> = new Set();
  private handlerGroups: Group[];
  private readonly failOnDuplicate: boolean;

  /**
   * Creates a composite registry with the specified handler groups
   * @param handlerGroups - Array of handler groups to register
   * @param failOnDuplicate - When true, throws on duplicate tool names (useful in dev)
   */
  constructor(handlerGroups: Group[] = [], failOnDuplicate: boolean = true) {
    this.handlerGroups = handlerGroups;
    this.failOnDuplicate = failOnDuplicate;
  }

  /**
   * Adds a handler group to the registry
   * @param group - Handler group to add
   */
  addHandlerGroup(group: Group): void {
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
  getHandlerGroups(): Group[] {
    return [...this.handlerGroups];
  }

  /**
   * Registers all tools from all handler groups on MCP server, each group
   * on the variant its context states. Groups stating different variants —
   * one of them none included — are refused before anything is registered.
   */
  registerAllTools(server: McpServer): void {
    this.registerGroups((group) => group.registerHandlers(server));
  }

  /**
   * Registers all tools as `registerAllTools` does — the same listing, the
   * same refusals — each call running in the context `callContext` gives it
   * when the call comes (`BaseHandlerGroup.registerHandlersOnCall`). Only a
   * registry of `BaseHandlerGroup`s takes it.
   */
  registerAllToolsOnCall(
    this: CompositeHandlersRegistry<BaseHandlerGroup>,
    server: McpServer,
    callContext: CallContext,
  ): void {
    this.registerGroups((group) =>
      group.registerHandlersOnCall(server, callContext),
    );
  }

  /**
   * The registration every path shares: groups stating different variants
   * refused, the listed tools counted and checked for duplicates, then each
   * group registered by `register`.
   */
  private registerGroups(register: (group: Group) => void): void {
    // Each group lists the variant its own context states; groups stating
    // different ones — one of them none included — are refused before
    // anything is registered.
    this.refuseDifferentVariants();
    this.registeredTools.clear();

    for (const group of this.handlerGroups) {
      // The tools the group lists on the variant it states: one the
      // variant leaves out is not registered, so it is not counted.
      const environment = statedBy(group);
      const handlers = group.getHandlers();
      for (const entry of handlers) {
        if (!listedTool(entry.toolDefinition, environment).listed) continue;
        const name = entry.toolDefinition.name;
        // A plain registration keeps no background runs: no
        // background-run tool is listed (`BaseHandlerGroup.registerOneTool`).
        if (isBackgroundRunTool(name)) continue;
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
      register(group);
    }
  }

  /**
   * Registers a single tool of one of the registry's groups, as
   * `registerAllTools` registers it: on the variant every group states
   * (`listedTool`; left out when that variant does not serve it), each call
   * through the path of the group that holds a tool of that name
   * (`BaseHandlerGroup.registerOneTool`) — the entry's call with that
   * group's context, on the stated kind. Groups
   * stating different variants — one of them none included — are refused
   * before anything is registered; so is a tool no `BaseHandlerGroup` of the
   * registry holds, which has no context to run on.
   * Note: This method is provided for compatibility, but it's recommended to use handler groups
   */
  registerTool(server: McpServer, entry: HandlerEntry): void {
    const toolName = entry.toolDefinition.name;
    this.refuseDifferentVariants();
    const holder = this.handlerGroups.find((group) =>
      group
        .getHandlers()
        .some((entry) => entry.toolDefinition.name === toolName),
    );
    if (!(holder instanceof BaseHandlerGroup)) {
      throw new Error(REGISTER_TOOL_UNHELD_WORDS(toolName));
    }
    holder.registerOneTool(server, entry);
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
   * The one variant every group states (`undefined`: none stated by any).
   * Groups stating different ones — a variant beside none included — are
   * refused before anything is registered: the error names each group and
   * what it states.
   */
  private refuseDifferentVariants(): SapEnvironment | undefined {
    const statements = this.statements();
    const stated = new Set(statements.map(({ stated }) => stated));
    const [environment] = stated;
    if (stated.size <= 1) return environment;
    const named = statements
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
