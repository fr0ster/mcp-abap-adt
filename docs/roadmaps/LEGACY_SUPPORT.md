# Roadmap: Legacy ABAP System Support (BASIS < 7.50)

## Motivation

MCP server currently works only with modern SAP systems (S/4 HANA, BTP ABAP Cloud).
Many customers run older on-premise systems (BASIS 7.40 and below) where:
- ADT endpoints are limited (~124 vs ~800+ on modern)
- HTTP stateful sessions (`x-sap-adt-sessiontype: stateful`) not supported
- Versioned content types (v2+/v3+/v4+) not supported
- Group deletion API (`/sap/bc/adt/deletion/`) not available

`@mcp-abap-adt/adt-clients@3.0.0` introduces `AdtClientLegacy` and `createAdtClient()` factory.
`@mcp-abap-adt/connection@1.4.2` introduces `RfcAbapConnection` for stateful RFC transport.

## Migration Steps

### Step 1: Upgrade dependencies [DONE]

```
@mcp-abap-adt/adt-clients  ^2.2.2 -> 3.0.0
@mcp-abap-adt/connection   ^1.1.0 -> 1.4.2
```

API is backward-compatible. Existing code compiles without changes.

### Step 2: System detection at connection init [DONE]

Detect system type once when connection is established. Cache `isLegacy` flag.

**Where:** `src/lib/utils.ts` — `getOrCreateConnectionForServer()`, after `connection.connect()`.

```typescript
import { isModernAdtSystem } from '@mcp-abap-adt/adt-clients';

// After connection.connect():
const isModern = await isModernAdtSystem(connection);
// Store in module-level cache alongside cachedConnection
```

**Alternative:** add `isLegacy` to system context (`src/lib/systemContext.ts`).

### Step 3: Switch client factory to use detection [DONE]

**Where:** `src/lib/clients.ts`

Current (sync, always modern):
```typescript
export function createAdtClient(connection, logger): AdtClient {
  return new AdtClient(connection, logger, options);
}
```

New (sync, uses cached detection):
```typescript
import { AdtClientLegacy } from '@mcp-abap-adt/adt-clients';

export function createAdtClient(connection, logger): AdtClient {
  const ctx = getSystemContext();
  const options = { masterSystem: ctx.masterSystem, responsible: ctx.responsible };
  if (ctx.isLegacy) {
    return new AdtClientLegacy(connection, logger, options);
  }
  return new AdtClient(connection, logger, options);
}
```

No handler changes needed — `AdtClientLegacy extends AdtClient`, same interface.

### Step 4: Add RFC auth type support [DONE]

**Where:** `src/lib/config.ts`, `src/lib/utils.ts`

New env vars:
```
SAP_AUTH_TYPE=rfc
SAP_USERNAME=DEVELOPER
SAP_PASSWORD=secret
SAP_CLIENT=100
```

Config builder:
```typescript
if (process.env.SAP_AUTH_TYPE === 'rfc') {
  authType = 'rfc';
  config.username = process.env.SAP_USERNAME;
  config.password = process.env.SAP_PASSWORD;
  config.client = process.env.SAP_CLIENT;
}
```

`createAbapConnection()` from connection package already handles `authType: 'rfc'`.
`@mcp-abap-adt/sap-rfc-lite` is loaded dynamically — no error if not installed and not used.

### Step 5: Launcher CLI support [DONE]

**Where:** `src/server/launcher.ts`, `src/lib/config/ArgumentsParser.ts`

CLI flag `--connection-type=rfc` added. Also reads `SAP_CONNECTION_TYPE` env var.
Auto-detection from env works via `.env` file hydration in launcher.

### Step 6: Verify handler error handling [DONE]

`BaseMcpServer` filters tools at registration time based on `available_in` vs
detected system type (`isLegacy` from `systemContext`). Unsupported tools are
simply not registered — they don't appear in the tool list for the MCP client.

`AdtClientLegacy` also throws on unsupported types as a second safety layer.
All handlers wrap errors via `return_error()` / `McpError`, no raw stack traces.

### Step 7: Tool descriptions for legacy awareness [DONE]

Every handler TOOL_DEFINITION has `available_in` field with supported environments.
`BaseMcpServer` uses this + `isLegacy` to filter tools at registration time.
Unsupported tools are hidden from the client automatically.

### Step 8: Integration tests on legacy system

- Need access to legacy system (E77-class, BASIS ~7.40)
- Test config with `sap_auth_type: rfc`
- Tests should auto-skip unsupported operations based on system detection
- RFC tests need SAP NW RFC SDK installed on test machine

## Object Support Matrix (Legacy)

### Full CRUD
Program, Class, Interface, FunctionGroup, FunctionModule, View

### Read/Update/Delete only
Package (no validate, no create)

### Read-only utilities
Search, NodeStructure, ObjectStructure, Activation, CheckRuns, UnitTest

### Not available
Domain, DataElement, Structure, Table, TableType, BDEF, BIMP, DDLX,
ServiceDefinition, ServiceBinding, AccessControl, Enhancement,
Where-used, Table contents, SQL query, Runtime profiling/dumps

## Alternative: HTTP Stateful Sessions via SAP Note

For systems where installing the SAP NW RFC SDK is not feasible, there is an alternative approach: enabling HTTP stateful sessions on older systems.

On modern systems (BASIS >= 7.51), class `CL_ADT_WB_RES_APP` method `CONFIGURE_SESSION_STATE` handles stateful HTTP session management automatically. On older systems (BASIS < 7.51), this method does not exist, causing lock/unlock and other stateful operations to fail over HTTP.

The [abapfs_extensions](https://github.com/marcellourbani/abapfs_extensions) project by @marcellourbani provides an ABAP implementation that backports this mechanism to older systems. Once installed, it enables HTTP-based stateful sessions without requiring RFC transport.

**When to use RFC vs HTTP fix:**

| Approach | Pros | Cons |
|----------|------|------|
| RFC transport (recommended) | No SAP-side changes needed, works out of the box | Requires SAP NW RFC SDK on the machine running MCP server |
| HTTP stateful session fix | No client-side SDK needed | Requires ABAP transport import into SAP system, needs BASIS admin involvement |

## Risks

| Risk | Mitigation |
|------|-----------|
| @mcp-abap-adt/sap-rfc-lite needs SAP NW RFC SDK native lib | Dynamic import; graceful error if not installed; only loaded for `connectionType: 'rfc'` |
| Docker images need SDK | Document; provide Dockerfile with SDK layer |
| Legacy endpoint differences between versions | Discovery-based detection, not hardcoded |
| One extra HTTP call at startup (core/discovery) | Cached, happens once |
