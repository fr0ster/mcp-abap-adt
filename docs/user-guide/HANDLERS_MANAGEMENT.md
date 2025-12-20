# Handler Sets Management

## Overview

V2 server supports flexible handler set configuration through the `--exposition` parameter.

## Handler Sets

### Available Sets

1. **readonly** - Read-only operations (safe, recommended for production)
   - Programs, classes, functions (read)
   - Tables and structures (schema only)
   - Search operations
   - Package and interface queries
   - Type information

2. **high** - High-level write operations
   - Object creation
   - Object modification through ADT
   - Package creation
   - Transport operations

3. **low** - Low-level direct operations (dangerous)
   - Direct ABAP execution
   - System modifications
   - Database operations

4. **search** - Always included automatically
   - Object search
   - Code search

5. **system** - Always included automatically  
   - Where-used analysis (GetWhereUsed)
   - Type information (GetTypeInfo)
   - Object info (GetObjectInfo)
   - ABAP AST and semantic analysis
   - System symbols
   - Session management
   - SQL queries
   - Inactive objects
   - Transactions

## Usage

**Note:** `search` and `system` handler groups are ALWAYS included regardless of `--exposition` setting.

### Command Line

```bash
# Default: readonly + high (+ search + system always included)
node bin/mcp-abap-adt-v2.js --transport=stdio --env=.env

# Only read-only operations (safest)
node bin/mcp-abap-adt-v2.js --transport=stdio --env=.env --exposition=readonly

# Read-only + high-level writes (recommended)
node bin/mcp-abap-adt-v2.js --transport=stdio --env=.env --exposition=readonly,high

# All operations (dangerous, for development only)
node bin/mcp-abap-adt-v2.js --transport=stdio --env=.env --exposition=readonly,high,low
```

### Config File

If using `--config` parameter, specify in YAML:

```yaml
transport: stdio
envFile: .env
exposition:
  - readonly
  - high
```

### Environment Variable

Set `MCP_EXPOSITION`:

```bash
export MCP_EXPOSITION=readonly,high
node bin/mcp-abap-adt-v2.js --transport=stdio --env=.env
```

## Generating Handler Documentation

### Generate Full List

```bash
npm run docs:tools
```

This generates `docs/AVAILABLE_TOOLS.md` with:
- All available handlers
- Parameters and types
- Usage examples
- Category grouping

### Manual Inspection

List handlers by set:

```bash
# ReadOnly handlers
ls -la src/handlers/*/readonly/

# High-level handlers  
ls -la src/handlers/*/high/

# Low-level handlers
ls -la src/handlers/*/low/
```

## Handler Set Details

### ReadOnly Handlers Location

```
src/handlers/
├── class/readonly/
├── function/readonly/
├── package/readonly/
├── program/readonly/
├── system/readonly/
├── table/readonly/
└── transport/readonly/
```

### High-Level Handlers Location

```
src/handlers/
├── class/high/
├── function/high/
├── package/high/
├── program/high/
└── transport/high/
```

### Low-Level Handlers Location

```
src/handlers/
├── class/low/
├── function/low/
└── program/low/
```

## Security Recommendations

1. **Production**: Use only `readonly`
2. **Development**: Use `readonly,high` 
3. **Testing/Admin**: Use `readonly,high,low` with caution
4. **Never expose low-level handlers to untrusted users**

## Implementation

Handler sets are registered in [src/server/v2/launcher.ts](../src/server/v2/launcher.ts):

```typescript
const handlerGroups: any[] = [];
if (config.exposition.includes('readonly')) {
  handlerGroups.push(new ReadOnlyHandlersGroup(baseContext));
}
if (config.exposition.includes('high')) {
  handlerGroups.push(new HighLevelHandlersGroup(baseContext));
}
if (config.exposition.includes('low')) {
  handlerGroups.push(new LowLevelHandlersGroup(baseContext));
}
// SearchHandlersGroup is always included
handlerGroups.push(new SearchHandlersGroup(baseContext));
```

## Adding New Handlers

To add handlers to a specific set:

1. Create handler file in appropriate directory:
   - `src/handlers/<domain>/readonly/` for read operations
   - `src/handlers/<domain>/high/` for safe writes
   - `src/handlers/<domain>/low/` for dangerous operations

2. Export `TOOL_DEFINITION`:
   ```typescript
   export const TOOL_DEFINITION = {
     name: 'my_handler',
     description: 'Handler description',
     inputSchema: { /* zod schema */ }
   } as const;
   ```

3. Export handler function:
   ```typescript
   export async function handleMyOperation(args: any, context: HandlerContext) {
     // implementation
   }
   ```

4. Register in appropriate group:
   - `src/server/v2/handlers/ReadOnlyHandlersGroup.ts`
   - `src/server/v2/handlers/HighLevelHandlersGroup.ts`
   - `src/server/v2/handlers/LowLevelHandlersGroup.ts`

5. Regenerate docs:
   ```bash
   npm run docs:tools
   ```
