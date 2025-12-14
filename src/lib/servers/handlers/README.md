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
- **`ReadOnlyHandlersGroup`** - All read-only handlers (get operations)
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
import { BaseHandlerGroup } from "./handlers/base/BaseHandlerGroup.js";
import { HandlerEntry } from "./handlers/interfaces.js";

export class CustomHandlersGroup extends BaseHandlerGroup {
  protected groupName = "CustomHandlers";

  getHandlers(): HandlerEntry[] {
    return [
      {
        toolDefinition: {
          name: "MyCustomTool",
          description: "Description of my custom tool",
          inputSchema: {
            type: "object",
            properties: {
              param1: { type: "string" },
            },
            required: ["param1"],
          },
        },
        handler: async (args: any) => {
          // Handler implementation
          return { content: [{ type: "text", text: "Result" }] };
        },
      },
    ];
  }
}
```

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
