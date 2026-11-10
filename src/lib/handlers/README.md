# Handler Registration System with Dependency Injection

This module provides a flexible system for registering MCP tool handlers through Dependency Injection, allowing handlers to be organized into groups and selectively injected based on requirements.

## Architecture

### Core Components

1. **`IHandlerGroup`** - Interface for a group of handlers
2. **`IHandlersRegistry`** - Interface for handlers registry
3. **`BaseHandlerGroup`** - Base class providing common functionality for handler groups
4. **`CompositeHandlersRegistry`** - Registry implementation that accepts multiple handler groups via DI

### Handler Groups

Handlers are organized into logical groups:
- **`ReadOnlyHandlersGroup`** - All read-only handlers (get operations), but the data tools
- **`DataHandlersGroup`** - The data tools, `GetSqlQuery` and `GetTableContents`: opt-in. No other
  group serves them; add this group only when serving them is the customer's decision (SAP API
  Policy FAQ v1.3, June 2026, Q33, says ADT APIs are not intended for reading application tables,
  exporting business data or running SQL against SAP systems). The compact form, `HandlerGetData`,
  is `CompactDataHandlersGroup`'s (`@mcp-abap-adt/compact-readonly-entries`)
- Additional groups can be created (HighLevel, LowLevel, System, Search, etc.)

## Usage Examples

### Basic Usage: Register All Handlers

```typescript
import { CompositeHandlersRegistry } from "./handlers/index.js";
import { ReadOnlyHandlersGroup } from "./handlers/groups/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create handler groups
const readonlyGroup = new ReadOnlyHandlersGroup();
// const highLevelGroup = new HighLevelHandlersGroup();
// const lowLevelGroup = new LowLevelHandlersGroup();

// Create registry with groups
const handlersRegistry = new CompositeHandlersRegistry([
  readonlyGroup,
  // highLevelGroup,
  // lowLevelGroup,
]);

// Register all tools on MCP server
const mcpServer = new McpServer({ name: "mcp-abap-adt", version: "1.0.0" });
handlersRegistry.registerAllTools(mcpServer);
```

### Which variant a plain registration lists

`registerAllTools(mcpServer)` (and `registerTool`) on a plain SDK `McpServer` lists the
variant the groups' context states — `systemType` in the `HandlerContext` the groups are
built with, `HandlerExporter`'s `systemType` option. It is the rule a server instance
(`BaseMcpServer`) applies: a tool the variant's ADT type table does not serve, or whose
`available_in` leaves the environment out, is not listed; the others carry that variant's
description and schema, and their search `_meta` (`mcp-abap-adt/search`) names only the members
the variant offers. Its calls run on the same variant. `SAP_SYSTEM_TYPE` is not read on this
path, for the listing or for a call: an embedded library takes no configuration from the
environment.

```typescript
const registry = new HandlerExporter({ systemType: "cloud" }).createRegistry();
registry.registerAllTools(mcpServer); // the cloud tools, schemas and descriptions
```

The exporter's groups are built on a context with no connection: listed this way, their calls
have none to run on. `exporter.registerOnServer(mcpServer, connectionProvider)` lists the same
tools through the same code and runs each call on the connection the provider returns for it
(see [the Handler Exporter guide](../../../docs/architecture/HANDLER_EXPORTER.md)).

With no `systemType` stated, every definition is listed as it is (the on-premise description and
schema, every member in the search `_meta`), and every call that would reach a system is refused
`system_type_required` before anything is sent, whatever `SAP_SYSTEM_TYPE` says.

Groups that state different variants are refused at registration, before anything is registered:
the error names each group and the variant it states (`none` for a group that states none).
`registerAllTools` and `registerTool` take only one variant stated by every group, or none stated
by any (the definitions as they are); one group stating a variant beside another stating none is
refused.

`registerTool(server, entry)` registers a tool of one of the registry's groups through that
group's path, as `registerAllTools` registers it: the entry's call with the group's context, on
the stated variant. A tool no group of the registry holds (by its definition's name) is refused at
registration: its call would have no context to run on.

### Selective Handler Registration

```typescript
// For a read-only server (e.g., public API)
const readonlyRegistry = new CompositeHandlersRegistry([
  new ReadOnlyHandlersGroup(),
]);

// For a full-featured server
const fullRegistry = new CompositeHandlersRegistry([
  new ReadOnlyHandlersGroup(),
  new HighLevelHandlersGroup(),
  new LowLevelHandlersGroup(),
]);

// For a development server with all features
const devRegistry = new CompositeHandlersRegistry([
  new ReadOnlyHandlersGroup(),
  new HighLevelHandlersGroup(),
  new LowLevelHandlersGroup(),
  new SystemHandlersGroup(),
  new SearchHandlersGroup(),
]);
```

### Dynamic Handler Group Management

```typescript
const registry = new CompositeHandlersRegistry();

// Add groups dynamically
registry.addHandlerGroup(new ReadOnlyHandlersGroup());
registry.addHandlerGroup(new HighLevelHandlersGroup());

// Register all tools
registry.registerAllTools(mcpServer);

// Remove a group if needed
registry.removeHandlerGroup("HighLevelHandlers");

// Get information about registered groups
console.log(registry.getHandlerGroupNames()); // ["ReadOnlyHandlers", "HighLevelHandlers"]
console.log(registry.getRegisteredTools()); // Array of tool names
```

### Creating Custom Handler Groups

```typescript
import * as z from "zod";
import { BaseHandlerGroup } from "./handlers/base/BaseHandlerGroup.js";
import { defineTool, type HandlerEntry } from "./handlers/interfaces.js";

export class CustomHandlersGroup extends BaseHandlerGroup {
  protected groupName = "CustomHandlers";

  getHandlers(): HandlerEntry[] {
    return [
      defineTool(
        {
          name: "MyCustomTool",
          description: "Description of my custom tool",
          inputSchema: z.object({
            param1: z.string().describe("The first parameter."),
          }),
        },
        // context: the call's HandlerContext; args: { param1: string }
        async (context, args) => {
          return { content: [{ type: "text", text: `Result for ${args.param1}` }] };
        },
      ),
    ];
  }
}
```

`defineTool` types the handler by the schema; the entry's `call(context, args)` parses the
arguments with it before the handler runs, and refuses, naming each issue, what does not parse.

## Benefits

1. **Flexibility**: Inject only the handler groups you need
2. **Modularity**: Handlers are organized into logical groups
3. **Testability**: Easy to mock handler groups in tests
4. **Maintainability**: Clear separation of concerns
5. **Scalability**: Easy to add new handler groups without modifying existing code

## Integration with Server Architecture

The `CompositeHandlersRegistry` implements `IHandlersRegistry` and can be injected into the `McpServer` class:

```typescript
class McpServer {
  constructor(
    private handlersRegistry: IHandlersRegistry, // Injected
    // ... other dependencies
  ) {
    // Initialize protocol handler with registry
    this.protocolHandler.initialize(this.handlersRegistry, this.mcpServer);
  }
}
```

## Future Enhancements

- Create additional handler groups (HighLevel, LowLevel, System, Search)
- Support for handler group plugins
- Handler group validation and conflict detection
- Performance metrics per handler group
