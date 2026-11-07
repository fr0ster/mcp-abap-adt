# MCP ABAP ADT Tools Architecture

## Problem

Previously all tool descriptions lived in `index.ts`, which caused issues:
- When the LLM edited a single module it could break every description
- Keeping handlers and their descriptions in sync was hard
- Description duplication increased the risk of inconsistencies

## Solution

Each module now owns its description via a constant `TOOL_DEFINITION` structure exported from every handler.

## Structure

### 1. Handler Organization

Handlers are organized into categorized subdirectories under `src/handlers/`:
- `behavior_definition/` - Behavior Definition handlers
- `behavior_implementation/` - Behavior Implementation handlers
- `class/` - Class handlers
- `common/` - Common handlers (activate, delete, check, lock, unlock, validate)
- (the compact facade moved out of this package: `@mcp-abap-adt/compact-readonly-entries`,
  `@mcp-abap-adt/compact-modify` and the `@mcp-abap-adt/compact` command)
- `data_element/` - Data Element handlers
- `ddlx/` - DDLX (metadata extension) handlers
- `domain/` - Domain handlers
- `enhancement/` - Enhancement handlers
- `function/` - Function (function module) handlers
- `function_group/` - Function Group handlers
- `function_include/` - Function Include handlers
- `function_module/` - Function Module handlers
- `include/` - Include handlers
- `interface/` - Interface handlers
- `metadata_extension/` - Metadata Extension handlers
- `package/` - Package handlers
- `program/` - Program handlers
- `search/` - Search handlers
- `service_binding/` - Service Binding handlers
- `service_definition/` - Service Definition handlers
- `structure/` - Structure handlers
- `system/` - System handlers
- `table/` - Table handlers
- `transport/` - Transport handlers
- `unit_test/` - ABAP Unit test handlers
- `view/` - View (CDS) handlers

This organization improves code navigation, reduces merge conflicts, and makes the codebase more maintainable.

### 2. Handlers with definitions

Each handler (for example, `src/handlers/program/high/handleGetProgram.ts`) contains its
definition and its function. The `inputSchema` is a zod object: it is the arguments' type and the
one check of a call's arguments; the JSON Schema a client lists is derived from it
(`z.toJSONSchema`).

```typescript
import * as z from "zod";

export const TOOL_DEFINITION = {
  name: "GetProgram",
  description: "Reads the ABAP program named by program_name …",
  available_in: ['onprem', 'cloud'] as const,
  inputSchema: z.object({
    program_name: z.string().describe("Program name."),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
  }),
} as const;

export async function handleGetProgram(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  // Handler logic: context.connection, context.logger
}
```

### 3. Environment-based tool filtering (`available_in`)

Each handler's `TOOL_DEFINITION` includes an `available_in` field that declares which SAP environments the tool supports:

```typescript
export const TOOL_DEFINITION = {
  name: "CreateClass",
  description: "Create a new ABAP class",
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  inputSchema: z.object({ /* … */ }),
} as const;
```

**Values:**
- `'onprem'` — On-premise systems (ECC, S/4HANA)
- `'cloud'` — ABAP Cloud (SAP BTP)
- `'legacy'` — Legacy on-premise systems (BASIS < 7.50)

**How filtering works:**

At registration, `BaseMcpServer.registerHandlers()` reads the stated system type and skips tools that don't match:

```typescript
// The kind is stated, never guessed: the server's `systemType` option, else SAP_SYSTEM_TYPE.
const currentEnv = statedEnvironment(this.systemType ?? process.env.SAP_SYSTEM_TYPE);

// For each tool:
const availableIn = entry.toolDefinition.available_in;
if (availableIn?.length > 0 && currentEnv !== undefined && !availableIn.includes(currentEnv)) {
  // Tool is not registered — hidden from the client
  continue;
}
```

**Rules:**
- If `available_in` is omitted or empty, the tool is registered everywhere (backward compatibility)
- Tools are filtered at registration time — clients never see unsupported tools
- The environment is the stated system type (`--system-type`, `SAP_SYSTEM_TYPE`, YAML `system-type`, or an embedder's `systemType`): `onprem`, `cloud` or `legacy`. It is never guessed from the credential or the URL (19.0.0: a `jwt` destination is no longer taken for `cloud`). Every binary requires it at start, stdio's inspection-only mode (no destination) included, which lists the tools of that system type. With none stated — an embedder that states none — nothing is filtered, and every call that would reach the system is refused `system_type_required`
- Beside `available_in`, a tool is registered only where the system type's ADT type table (`ADT_TYPES_ONPREM`, `ADT_TYPES_CLOUD` of `@mcp-abap-adt/interfaces-adt`) serves what it needs (`src/lib/variantToolSet.ts`); a tool that differs by system type states its description, enums and type lists per system type (`ToolDefinition.variants`, built from the projections in `src/lib/adtProjections.ts`), and the declared one is registered

**Common patterns:**

| Pattern | Meaning |
|---------|---------|
| `['onprem', 'cloud', 'legacy']` | Available everywhere |
| `['onprem', 'cloud']` | Modern systems only (e.g., Domain, DataElement, Table, Structure, CDS, BDEF) |
| `['onprem', 'legacy']` | On-premise only, no cloud (e.g., Programs) |
| `['onprem']` | Modern on-premise only (e.g., runtime profiling with programs) |

**Tool availability by level:**

See generated documentation:
- [All Tools](../user-guide/AVAILABLE_TOOLS.md)

### 4. Handler groups and entries

There is no central list of definitions. Each handler group (`src/lib/handlers/groups/`, an
`IHandlerGroup`) answers its entries, each built by `defineTool(definition, handler)`
(`@mcp-abap-adt/lib/handlers`), which the compiler checks: the handler takes the call's context
and the output of the definition's schema.

```typescript
import {
  TOOL_DEFINITION as GetTypeInfo_Tool,
  handleGetTypeInfo,
} from '../../../handlers/system/readonly/handleGetTypeInfo';

getHandlers(): HandlerEntry[] {
  return [
    defineTool(GetTypeInfo_Tool, handleGetTypeInfo),
    // ... the group's other tools
  ];
}
```

A `HandlerEntry` is `{ toolDefinition, call(context, args), connectionless? }`. Its `call` parses
the arguments with the definition's schema and runs the handler on the result; arguments that do
not parse are refused, naming each issue, and the handler does not run.

**ToolDefinition Interface:**
```typescript
export interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  inputSchema: S;
  available_in?: readonly SapEnvironment[];
  variants?: { readonly [V in AbapSystemKind]: VariantToolDefinition };
}
```

### 5. Registration

A server instance (`BaseMcpServer`) or a plain registration (`CompositeHandlersRegistry`,
`registerAllTools(server)` or `registerTool(server, entry)`) registers each entry on the MCP SDK
with the variant's description and zod schema (`listedTool`), and runs each call as
`entry.call(context, args)` with the call's context. Which groups a binary serves is its tool set
(`@mcp-abap-adt/lib/tool-set`).

## Benefits

1. **Local ownership**: Each handler maintains its own description
2. **Safer edits**: Changes in one handler do not affect others
3. **Maintainable**: New tools are easy to add
4. **Type-safety**: TypeScript validates the structure
5. **DRY principle**: No duplicated descriptions

## How to add a new tool

1. **Create a new handler** under the appropriate subdirectory in `src/handlers/` (e.g., `src/handlers/system/handleYourTool.ts` for system tools, `src/handlers/class/handleYourTool.ts` for class tools)
   
2. **Add a `TOOL_DEFINITION` constant** to the handler, its schema in zod:
   ```typescript
   export const TOOL_DEFINITION = {
     name: "YourToolName",
     description: "Description of what your tool does",
     available_in: ['onprem', 'cloud'] as const,  // specify supported environments
     inputSchema: z.object({
       param_name: z.string().describe("Description of the parameter"),
     }),
   } as const;

   export async function handleYourTool(
     context: HandlerContext,
     args: z.output<typeof TOOL_DEFINITION.inputSchema>,
   ) {
     try {
       // Handler implementation — return a success result here.
     } catch (error) {
       // Signal failure by RETURNING the error, never by throwing McpError.
       // return_error yields { isError: true, content } with a bare message.
       // See docs/development/ASSISTANT_GUIDELINES.md → "Tool error contract".
       return return_error(error);
     }
   }
   ```

3. **Add its entry** to the group that serves it (`src/lib/handlers/groups/`):
   ```typescript
   defineTool(YourTool_Tool, handleYourTool),
   ```

4. **Update the fixtures** that record what is listed — the listed schemas
   (`WRITE_LISTED_SCHEMAS=1`), the transport and variant surfaces — and the tool search table
   (`tools/tool-search.json`), as their tests say.

5. **Regenerate documentation:**
   ```bash
   npm run docs:tools
   ```

## Automation

### Generating Documentation

The `tools/generate-tools-docs.js` script generates `docs/user-guide/AVAILABLE_TOOLS.md` (and its `_READONLY` and `_HIGH` pages) from the tool definitions the server builds.

```bash
npm run docs:tools
# or
node tools/generate-tools-docs.js [--help]
```

**What it does:**
- Reads the built tool sets (`fullToolSet`, `fullReadOnlyToolSet` in `dist`): every tool a binary serves, with the description and input schema it registers (the zod schema converted as the MCP SDK lists it)
- Files each tool under the object and level of the built handler module that holds its definition (`dist/handlers/<object>/<level>/…`), a `low` module under its handler group's level
- Reads no source text, so a spread-in or shared property is listed as the server registers it
- Generates the markdown pages

**When to use:**
- After adding or updating tools
- Before releasing a new version
- To keep documentation in sync with code

**Output:** `docs/user-guide/AVAILABLE_TOOLS.md` - Complete reference of all available tools.

See [tools/README.md](../../tools/README.md) for more details on available developer tools.

## Future improvements

- Add automated validation to ensure handlers and descriptions stay aligned
- Provide a CLI tool for generating new handlers from templates
- Add unit tests for tool definition structure
