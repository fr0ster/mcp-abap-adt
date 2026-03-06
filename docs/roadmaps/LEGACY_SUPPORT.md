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

### Step 1: Upgrade dependencies [done]

```
@mcp-abap-adt/adt-clients  ^2.2.2 -> 3.0.0
@mcp-abap-adt/connection   ^1.1.0 -> 1.4.2
```

API is backward-compatible. Existing code compiles without changes.

### Step 2: System detection at connection init

Detect system type once when connection is established. Cache `isLegacy` flag.

**Where:** `src/lib/utils.ts` — `getOrCreateConnectionForServer()`, after `connection.connect()`.

```typescript
import { isModernAdtSystem } from '@mcp-abap-adt/adt-clients';

// After connection.connect():
const isModern = await isModernAdtSystem(connection);
// Store in module-level cache alongside cachedConnection
```

**Alternative:** add `isLegacy` to system context (`src/lib/systemContext.ts`).

### Step 3: Switch client factory to use detection

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

### Step 4: Add RFC auth type support

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
`node-rfc` is loaded dynamically — no error if not installed and not used.

### Step 5: Launcher CLI support

**Where:** `src/server/launcher.ts` or CLI args

Add `--auth-type=rfc` flag. Or auto-detect from env (if SAP_AUTH_TYPE is set).

### Step 6: Verify handler error handling

`AdtClientLegacy` throws on unsupported types (Domain, Table, BDEF, etc.).
Verify all handlers propagate these as clean MCP errors, not stack traces.

Affected handlers (will throw on legacy):
- Domain, DataElement, Structure, Table, TableType
- BehaviorDefinition, BehaviorImplementation, MetadataExtension
- ServiceDefinition, ServiceBinding, AccessControl, Enhancement
- Where-used, Table contents, SQL query, Runtime profiling

### Step 7: Tool descriptions for legacy awareness

Add note to unsupported tool descriptions:
> "Not available on legacy systems (BASIS < 7.50)"

Or conditionally adjust tool descriptions based on `isLegacy` flag.

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

## Risks

| Risk | Mitigation |
|------|-----------|
| node-rfc needs SAP NW RFC SDK native lib | Dynamic import; graceful error if not installed; only loaded for `authType: 'rfc'` |
| Docker images need SDK | Document; provide Dockerfile with SDK layer |
| Legacy endpoint differences between versions | Discovery-based detection, not hardcoded |
| One extra HTTP call at startup (core/discovery) | Cached, happens once |
