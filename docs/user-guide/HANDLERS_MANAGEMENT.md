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

4. **compact** - Compact facade operations
   - `HandlerValidate`
   - `HandlerActivate`
   - `HandlerLock`
   - `HandlerUnlock`
   - `HandlerCheckRun`
   - `HandlerUnitTestRun`, `HandlerUnitTestStatus`, `HandlerUnitTestResult`
   - `HandlerCdsUnitTestStatus`, `HandlerCdsUnitTestResult`
   - `HandlerProfileRun`, `HandlerProfileList`, `HandlerProfileView`
   - `HandlerDumpList`, `HandlerDumpView`
   - `HandlerServiceBindingListTypes`, `HandlerServiceBindingValidate`
   - `HandlerTransportCreate`
   - `HandlerCreate`
   - `HandlerGet`
   - `HandlerUpdate`
   - `HandlerDelete`
   - Contract:
     - CRUD via `HandlerCreate|Get|Update|Delete` + required `object_type`
     - Lifecycle via `HandlerValidate|Activate|Lock|Unlock|CheckRun`
     - Runtime/tests/service-binding/transport via dedicated compact handlers
   - Source of truth for compact route coverage:
     - `src/handlers/compact/high/compactMatrix.ts`
     - auto-reflected into `docs/user-guide/AVAILABLE_TOOLS_COMPACT.md`
   - Current action coverage:
     - `UNIT_TEST`: `run`, `status`, `result`
     - `CDS_UNIT_TEST`: `status`, `result`
     - `SERVICE_BINDING`: `list_types`, `validate`
     - `TRANSPORT`: `create_transport`
     - `CLASS` / `PROGRAM`: `runProfiling`
     - `RUNTIME_PROFILE`: `viewProfiles`, `viewProfile`
     - `RUNTIME_DUMP`: `viewDumps`, `viewDump`

5. **search** - Always included automatically
   - Object search
   - Code search

6. **system** - Always included automatically  
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
node bin/mcp-abap-adt-v2.js --transport=stdio --env-path=.env

# Only read-only operations (safest)
node bin/mcp-abap-adt-v2.js --transport=stdio --env-path=.env --exposition=readonly

# Read-only + high-level writes (recommended)
node bin/mcp-abap-adt-v2.js --transport=stdio --env-path=.env --exposition=readonly,high

# Compact facade only
node bin/mcp-abap-adt-v2.js --transport=stdio --env-path=.env --exposition=compact

# Low-level writes (use instead of `high`, not together)
node bin/mcp-abap-adt-v2.js --transport=stdio --env-path=.env --exposition=readonly,low
```

#### Validation rules

The launcher rejects invalid `--exposition` combinations at startup:

- `compact` must be exposed alone — it replaces both `high` and `low`. Combining it with anything else errors out.
- `high` and `low` are mutually exclusive.

Valid combinations: `[readonly]`, `[readonly, high]`, `[readonly, low]`, `[high]`, `[low]`, `[compact]`.

#### Readonly / high-level dedup

When both `readonly` and `high` are exposed, `Read<X>` readonly handlers duplicate the corresponding `Get<X>` from the high-level group (e.g. `ReadFunctionModule` vs `GetFunctionModule`). The launcher hides the readonly `Read<X>` variants in this case so that only one tool per operation is visible to the client.

Embedder consumers of `EmbeddableMcpServer` keep the previous behavior (both variants exposed) unless they opt in by passing a `readOnlyDedupStrategy`. See [EmbeddableMcpServer dedup strategies](#embeddablemcpserver-dedup-strategies) below.

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
node bin/mcp-abap-adt-v2.js --transport=stdio --env-path=.env
```

## Generating Handler Documentation

### Generate Full List

```bash
npm run docs:tools
```

This generates:
- `docs/user-guide/AVAILABLE_TOOLS.md`
- `docs/user-guide/AVAILABLE_TOOLS_READONLY.md`
- `docs/user-guide/AVAILABLE_TOOLS_HIGH.md`
- `docs/user-guide/AVAILABLE_TOOLS_LOW.md`
- `docs/user-guide/AVAILABLE_TOOLS_COMPACT.md`

With:
- All available handlers
- Parameters and types
- Usage examples
- Category grouping

## Manual Inspection

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
if (config.exposition.includes('compact')) {
  handlerGroups.push(new CompactHandlersGroup(baseContext));
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

## EmbeddableMcpServer dedup strategies

`EmbeddableMcpServer` exposes an optional `readOnlyDedupStrategy` option to let consumers decide how readonly handlers are deduped against other groups (e.g. HighLevel, LowLevel, Compact) when multiple are exposed at the same time.

```ts
import {
  EmbeddableMcpServer,
  ReadVsGetDedupStrategy,
} from '@mcp-abap-adt/core/server';

const server = new EmbeddableMcpServer({
  connection,
  exposition: ['readonly', 'high'],
  // Opt in to dedup — hide ReadFunctionModule when GetFunctionModule is exposed, etc.
  readOnlyDedupStrategy: new ReadVsGetDedupStrategy(),
});
```

**Shipped implementations** (importable from `@mcp-abap-adt/core/handlers` or `@mcp-abap-adt/core/server`):

| Strategy | Behavior |
|---|---|
| `NoDedupStrategy` (default) | Never excludes anything — readonly group is exposed as-is. |
| `ReadVsGetDedupStrategy` | Hides a `Read<X>` entry when a corresponding `Get<X>` is contributed by another group. |

**Custom strategies**: implement `IReadOnlyDedupStrategy` for role-based or domain-specific rules:

```ts
import type {
  HandlerEntry,
  IReadOnlyDedupStrategy,
} from '@mcp-abap-adt/core/handlers';

class RoleAwareDedup implements IReadOnlyDedupStrategy {
  constructor(private readonly role: 'viewer' | 'editor') {}
  shouldExclude(entry: HandlerEntry, overriding: ReadonlySet<string>): boolean {
    if (this.role === 'viewer') return false; // expose readonly as-is
    // editor: dedup against whatever other groups contribute
    const n = entry.toolDefinition.name;
    return n.startsWith('Read') && overriding.has('Get' + n.slice(4));
  }
}
```

The default (no dedup) preserves behavior for existing consumers — upgrading the package does not change exposed tool sets unless the consumer explicitly passes a strategy.
