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
- Imports every handler `TOOL_DEFINITION`
- Aggregates them into a single `ALL_TOOLS` array
- Exports helper functions to work with the tools

```typescript
import { TOOL_DEFINITION as GetProgram_Tool } from '../handlers/handleGetProgram';
import { TOOL_DEFINITION as GetClass_Tool } from '../handlers/handleGetClass';
// ... other imports

export const ALL_TOOLS: ToolDefinition[] = [
  GetProgram_Tool,
  GetClass_Tool,
  // ... other tools
];

export function getAllTools(): ToolDefinition[] {
  return ALL_TOOLS;
}
```

### 3. Usage in index.ts

`index.ts` now relies on the dynamic registry instead of a hard-coded list:

```typescript
import { getAllTools } from "./lib/toolsRegistry";

// Handler for ListToolsRequest
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllTools()
}));
```

## Benefits

1. **Local ownership**: Each handler maintains its own description
2. **Safer edits**: Changes in one handler do not affect others
3. **Maintainable**: New tools are easy to add
4. **Type-safety**: TypeScript validates the structure
5. **DRY principle**: No duplicated descriptions

## How to add a new tool

1. Create a new handler under `src/handlers/`
2. Add a `TOOL_DEFINITION` constant to the handler:
   ```typescript
   export const TOOL_DEFINITION = {
     name: "YourToolName",
     description: "Description of what your tool does",
     inputSchema: {
       type: "object",
       properties: {
         // your parameters
       },
       required: ["required_param"]
     }
   } as const;
   ```
3. Import and register the tool in `src/lib/toolsRegistry.ts`
4. Add a case to the `CallToolRequestSchema` handler in `index.ts`

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

The `tools/generate-tools-docs.js` script automatically generates `doc/AVAILABLE_TOOLS.md` from all `TOOL_DEFINITION` exports.

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

**Output:** `doc/AVAILABLE_TOOLS.md` - Complete reference of all available tools.

See [tools/README.md](tools/README.md) for more details on available developer tools.

## Future improvements

- Add automated validation to ensure handlers and descriptions stay aligned
- Provide a CLI tool for generating new handlers from templates
- Add unit tests for tool definition structure
