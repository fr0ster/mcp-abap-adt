# MCP ABAP ADT Tools Architecture

## Problem

Previously all tool descriptions lived in `index.ts`, which caused issues:
- When the LLM edited a single module it could break every description
- Keeping handlers and their descriptions in sync was hard
- Description duplication increased the risk of inconsistencies

## Solution

Each module now owns its description via a constant `TOOL_DEFINITION` structure exported from every handler.

## Structure

### 1. Handlers with definitions

Each handler (for example, `src/handlers/handleGetProgram.ts`) contains:

```typescript
export const TOOL_DEFINITION = {
  name: "GetProgram",
  description: "Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: { type: "string", description: "Name of the ABAP program" }
    },
    required: ["program_name"]
  }
} as const;

export async function handleGetProgram(args: any) {
  // Handler logic
}
```

### 2. Central registry

The `src/lib/toolsRegistry.ts` file:
- Defines the `ToolDefinition` interface for type safety
- Imports every handler `TOOL_DEFINITION`
- Aggregates them into a single `ALL_TOOLS` array
- Exports helper functions to work with the tools

**ToolDefinition Interface:**
```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: readonly string[];
  };
}
```

```typescript
import { TOOL_DEFINITION as GetProgram_Tool } from '../handlers/handleGetProgram';
import { TOOL_DEFINITION as GetClass_Tool } from '../handlers/handleGetClass';
// ... other imports

// Static descriptors for tools that rely on dynamic import
const DYNAMIC_IMPORT_TOOLS: ToolDefinition[] = [
  GetObjectsByType_Tool,
  GetObjectsList_Tool,
  GetProgFullCode_Tool,
  GetObjectNodeFromCache_Tool,
  DescribeByList_Tool
];

// Aggregate every tool definition into a single list
export const ALL_TOOLS: ToolDefinition[] = [
  // Programs, classes, functions
  GetClass_Tool,
  GetFunction_Tool,
  // ... other tools
  
  // Dynamically imported tools
  ...DYNAMIC_IMPORT_TOOLS
];

export function getAllTools(): ToolDefinition[] {
  return ALL_TOOLS;
}

// Finds a tool definition by name
export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(tool => tool.name === name);
}
```

**Important Notes:**
- All `TOOL_DEFINITION` exports are **statically imported** in the registry (even for tools with dynamic handler imports)
- The `DYNAMIC_IMPORT_TOOLS` array is just for organizational purposes - it groups tools whose handlers use dynamic imports
- Some tools (like `GetAdtTypes`, `GetObjectStructure`) use dynamic imports in `index.ts` but are placed in the main `ALL_TOOLS` array, not in `DYNAMIC_IMPORT_TOOLS`
- The `getToolByName()` helper function allows finding tools by name programmatically

### 3. Usage in index.ts

`index.ts` now relies on the dynamic registry instead of a hard-coded list:

```typescript
import { getAllTools } from "./lib/toolsRegistry";

// Handler for ListToolsRequest - relies on the dynamic tool registry
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllTools()
}));

// Handler for CallToolRequest
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "GetProgram":
      return await handleGetProgram(request.params.arguments);
    // ... other cases
    
    // Some tools use dynamic import for performance
    case "GetObjectsList":
      return await (await import("./handlers/handleGetObjectsList.js"))
        .handleGetObjectsList(request.params.arguments);
    // ...
  }
});
```

**Note:** Most handlers are statically imported, but some use dynamic imports to avoid circular dependencies or improve startup performance:
- `GetObjectsList`, `GetObjectsByType`, `GetProgFullCode`, `GetObjectNodeFromCache`, `DescribeByList` (marked in `DYNAMIC_IMPORT_TOOLS`)
- `GetAdtTypes`, `GetObjectStructure` (also use dynamic import but are in main `ALL_TOOLS` array)

## Benefits

1. **Local ownership**: Each handler maintains its own description
2. **Safer edits**: Changes in one handler do not affect others
3. **Maintainable**: New tools are easy to add
4. **Type-safety**: TypeScript validates the structure
5. **DRY principle**: No duplicated descriptions

## How to add a new tool

1. **Create a new handler** under `src/handlers/` (e.g., `handleYourTool.ts`)
   
2. **Add a `TOOL_DEFINITION` constant** to the handler:
   ```typescript
   export const TOOL_DEFINITION = {
     name: "YourToolName",
     description: "Description of what your tool does",
     inputSchema: {
       type: "object",
       properties: {
         param_name: { 
           type: "string", 
           description: "Description of the parameter" 
         }
       },
       required: ["param_name"]
     }
   } as const;
   
   export async function handleYourTool(args: any) {
     // Handler implementation
   }
   ```

3. **Import and register the tool** in `src/lib/toolsRegistry.ts`:
   ```typescript
   import { TOOL_DEFINITION as YourTool_Tool } from '../handlers/handleYourTool';
   
   export const ALL_TOOLS: ToolDefinition[] = [
     // ... existing tools
     YourTool_Tool,
   ];
   ```
   
   **Note:** If your tool needs dynamic import (for performance), add it to `DYNAMIC_IMPORT_TOOLS` array instead.

4. **Add a case** to the `CallToolRequestSchema` handler in `index.ts`:
   
   **For static import:**
   ```typescript
   import { handleYourTool } from "./handlers/handleYourTool";
   
   // In setupHandlers():
   case "YourToolName":
     return await handleYourTool(request.params.arguments);
   ```
   
   **For dynamic import:**
   ```typescript
   case "YourToolName":
     return await (await import("./handlers/handleYourTool.js"))
       .handleYourTool(request.params.arguments);
   ```

5. **Regenerate documentation:**
   ```bash
   npm run docs:tools
   ```

## Automation

### Updating Handlers

The `tools/update-handlers-with-tool-definitions.js` script helps add `TOOL_DEFINITION` blocks to handlers that don't have them yet.

```bash
node tools/update-handlers-with-tool-definitions.js [--help]
```

**What it does:**
- Checks all handler files for `TOOL_DEFINITION`
- Suggests basic definitions for missing ones
- ⚠️ **Important:** Auto-generated definitions are incomplete! Always review and update.

**When to use:**
- Creating new handlers
- Migrating existing handlers
- Verifying all handlers have `TOOL_DEFINITION`

### Generating Documentation

The `tools/generate-tools-docs.js` script automatically generates `doc/user-guide/AVAILABLE_TOOLS.md` from all `TOOL_DEFINITION` exports.

```bash
npm run docs:tools
# or
node tools/generate-tools-docs.js [--help]
```

**What it does:**
- Scans all handler files in `src/handlers/`
- Extracts `TOOL_DEFINITION` from each
- Groups tools by category
- Generates comprehensive markdown documentation

**When to use:**
- After adding or updating tools
- Before releasing a new version
- To keep documentation in sync with code

**Output:** `doc/user-guide/AVAILABLE_TOOLS.md` - Complete reference of all available tools.

See [tools/README.md](tools/README.md) for more details on available developer tools.

## Future improvements

- Add automated validation to ensure handlers and descriptions stay aligned
- Provide a CLI tool for generating new handlers from templates
- Add unit tests for tool definition structure
