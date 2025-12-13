# Handlers Refactoring Roadmap

**Status:** ⏸️ Deferred  
**Priority:** Medium  
**Created:** 2025-01-30  
**Last Updated:** 2025-01-30

**Note:** This refactoring is planned for future releases. All handlers currently work correctly with the existing implementation. The roadmap is kept for tracking purposes.

## Goal

Migrate all **read-only handlers** from manual URL construction (`makeAdtRequestWithTimeout`, `getBaseUrl`) to use `ReadOnlyClient` and `SharedBuilder` from `@mcp-abap-adt/adt-clients` package.

**Note:** All handlers in this roadmap are located in `*/readonly/*` directories and perform read-only operations (GET requests or POST requests that only retrieve data without modifying the system).

## Current Status

### ✅ Completed (12 handlers)
- **handleSearchObject** - Uses `SharedBuilder.search()` ✅
- **handleGetClass** - Uses `ReadOnlyClient.readClass()` ✅
- **handleGetProgram** - Uses `ReadOnlyClient.readProgram()` ✅
- **handleGetInterface** - Uses `ReadOnlyClient.readInterface()` ✅
- **handleGetTable** - Uses `ReadOnlyClient.readTable()` ✅
- **handleGetStructure** - Uses `ReadOnlyClient.readStructure()` ✅
- **handleGetDataElement** - Uses `ReadOnlyClient.readDataElement()` ✅
- **handleGetDomain** - Uses `ReadOnlyClient.readDomain()` ✅
- **handleGetFunctionGroup** - Uses `ReadOnlyClient.readFunctionGroup()` ✅
- **handleGetFunction** - Uses `ReadOnlyClient.readFunctionModule()` ✅
- **handleGetServiceDefinition** - Uses `ReadOnlyClient.readServiceDefinition()` ✅
- **handleGetInactiveObjects** - Uses `SharedBuilder.listInactiveObjects()` ✅

### ⏸️ Deferred (17 handlers)

**Decision:** All remaining handlers are deferred to future releases. They work correctly with the current implementation using `makeAdtRequestWithTimeout` and `getBaseUrl`. Refactoring will be done incrementally when time permits.

## Detailed Analysis

**All handlers listed below are read-only operations** (located in `*/readonly/*` directories) and can potentially use `ReadOnlyClient` or `SharedBuilder` instead of manual URL construction.

### Category 1: Direct Replacements (6 handlers)

These handlers can be directly replaced with existing methods from `ReadOnlyClient` or `SharedBuilder`:

| Handler | Current Approach | Target Method | Status |
|---------|-----------------|---------------|--------|
| [ ] `handleGetPackage` | `makeAdtRequestWithTimeout` + manual URL | `ReadOnlyClient.readPackage()` | ❌ Pending |
| [ ] `handleGetTransport` | `getBaseUrl` + `makeAdtRequestWithTimeout` | `ReadOnlyClient.readTransport()` | ❌ Pending |
| [ ] `handleGetView` | `getBaseUrl` + `makeAdtRequestWithTimeout` | `ReadOnlyClient.readView()` | ❌ Pending |
| [ ] `handleGetWhereUsed` | `getBaseUrl` + `makeAdtRequestWithTimeout` | `SharedBuilder.whereUsed()` | ❌ Pending |
| [ ] `handleGetSqlQuery` | `getBaseUrl` + `makeAdtRequestWithTimeout` | `SharedBuilder.sqlQuery()` | ❌ Pending |
| [ ] `handleGetTableContents` | `getBaseUrl` + `makeAdtRequestWithTimeout` | `SharedBuilder.tableContents()` | ❌ Pending |

### Category 2: Simple Source Code Reading (2 handlers)

These handlers read source code and can use `SharedBuilder.readSource()`:

| Handler | Current Approach | Target Method | Status |
|---------|-----------------|---------------|--------|
| [ ] `handleGetInclude` | `getBaseUrl` + `/sap/bc/adt/programs/includes/{name}/source/main` | `SharedBuilder.readSource('PROG/I', name)` | ❌ Pending |
| [ ] `handleGetBdef` | `getBaseUrl` + `/sap/bc/adt/bo/behaviordefinitions/{name}/source/main` | `SharedBuilder.readSource('BDEF', name)` | ❌ Pending |

**Note:** Need to verify if `SharedBuilder.readSource()` supports these object types.

### Category 3: Complex Operations (9 handlers)

These handlers require more complex logic or methods that may not exist in clients:

| Handler | Current Approach | Complexity | Status |
|---------|-----------------|------------|--------|
| [ ] `handleGetObjectInfo` | `getBaseUrl` + `/sap/bc/adt/repository/nodestructure` | High - recursive tree building, enrichment | ❌ Pending |
| [ ] `handleGetTypeInfo` | `getBaseUrl` + multiple endpoints (domain, data element, table type) | Medium - multiple type detection | ❌ Pending |
| [ ] `handleGetTransaction` | `getBaseUrl` + `/sap/bc/adt/repository/informationsystem/objectproperties/values` | Medium - custom endpoint | ❌ Pending |
| [ ] `handleGetAllTypes` | `getBaseUrl` + `/sap/bc/adt/repository/informationsystem/objecttypes` | Low - simple GET | ❌ Pending |
| [ ] `handleGetObjectStructure` | `getBaseUrl` + `/sap/bc/adt/repository/objectstructure` | Low - simple POST | ❌ Pending |
| [ ] `handleGetObjectNodeFromCache` | `getBaseUrl` + cache lookup | Medium - cache integration | ❌ Pending |
| [ ] `handleGetEnhancementImpl` | `getBaseUrl` + `/sap/bc/adt/enhancements/{spot}/{impl}/source/main` | Low - source reading | ❌ Pending |
| [ ] `handleGetEnhancementSpot` | `getBaseUrl` + `/sap/bc/adt/enhancements/enhsxsb/{spot}` | Low - metadata reading | ❌ Pending |
| [ ] `handleGetEnhancements` | `getBaseUrl` + multiple endpoints (class, program, include) | Medium - multiple object types | ❌ Pending |

## Implementation Plan (Deferred)

**Status:** All phases deferred to future releases. Current implementation works correctly.

### Phase 1: Direct Replacements (Priority: High) - ⏸️ Deferred
1. ✅ `handleSearchObject` - DONE
2. [ ] `handleGetPackage` → `ReadOnlyClient.readPackage()` - **Deferred**
3. [ ] `handleGetTransport` → `ReadOnlyClient.readTransport()` - **Deferred** (requires parameter support)
4. [ ] `handleGetView` → `ReadOnlyClient.readView()` - **Deferred**
5. [ ] `handleGetWhereUsed` → `SharedBuilder.whereUsed()` - **Deferred** (complex parsing logic)
6. [ ] `handleGetSqlQuery` → `SharedBuilder.sqlQuery()` - **Deferred** (complex parsing logic)
7. [ ] `handleGetTableContents` → `SharedBuilder.tableContents()` - **Deferred** (complex parsing logic)

**Estimated effort:** 1-2 hours per handler (when implemented)

### Phase 2: Source Code Reading (Priority: Medium) - ⏸️ Deferred
8. [ ] `handleGetInclude` → `SharedBuilder.readSource('PROG/I', name)` - **Deferred**
9. [ ] `handleGetBdef` → `SharedBuilder.readSource('BDEF', name)` - **Deferred**

**Estimated effort:** 2-3 hours per handler (need to verify method support)

### Phase 3: Complex Operations (Priority: Low) - ⏸️ Deferred
10. [ ] `handleGetAllTypes` → Check if method exists in `ReadOnlyClient` or `SharedBuilder` - **Deferred**
11. [ ] `handleGetObjectStructure` → Check if method exists in `ReadOnlyClient` or `SharedBuilder` - **Deferred**
12. [ ] `handleGetEnhancementImpl` → `SharedBuilder.readSource()` or custom method - **Deferred**
13. [ ] `handleGetEnhancementSpot` → Check if method exists - **Deferred**
14. [ ] `handleGetTypeInfo` → May require multiple method calls or custom implementation - **Deferred**
15. [ ] `handleGetTransaction` → Check if method exists - **Deferred**
16. [ ] `handleGetEnhancements` → May require multiple method calls - **Deferred**
17. [ ] `handleGetObjectNodeFromCache` → Requires cache integration - **Deferred**
18. [ ] `handleGetObjectInfo` → Complex recursive logic, may need to keep custom implementation - **Deferred**

**Estimated effort:** 3-5 hours per handler (when implemented)

## Verification Checklist

For each **read-only handler** refactoring:
- [ ] Verify handler is in `*/readonly/*` directory (read-only operation)
- [ ] Remove `makeAdtRequestWithTimeout` imports
- [ ] Remove `getBaseUrl` imports (if used)
- [ ] Add `ReadOnlyClient`/`SharedBuilder` imports (NOT `CrudClient` - only for write operations)
- [ ] Replace manual URL construction with client method calls
- [ ] Update error handling to match client response format
- [ ] Test with actual SAP system
- [ ] Verify response format matches original handler output
- [ ] Update handler documentation if needed

## Notes

- **All handlers in this roadmap are read-only** - they only retrieve data and don't modify the SAP system
- Some handlers use POST requests (e.g., `handleGetPackage`, `handleGetWhereUsed`) but these are still read-only operations (POST is used for complex queries with parameters)
- **Current Status (2025-01-30):** All handlers work correctly with existing implementation. Refactoring is deferred to future releases.
- Some handlers may require methods that don't exist in `adt-clients` yet
- Complex handlers like `handleGetObjectInfo` may need to keep some custom logic
- All handlers should maintain backward compatibility with existing MCP tool definitions
- Error handling should remain consistent with current implementation
- **Use `ReadOnlyClient` or `SharedBuilder` for read-only handlers, NOT `CrudClient`** (CrudClient is for write operations)
- **Refactoring Rationale:** Many handlers have complex parsing logic, custom error handling, and specific response formatting. Refactoring will be done incrementally to ensure no regressions.

## Related Files

- `@mcp-abap-adt/adt-clients/src/clients/ReadOnlyClient.ts`
- `@mcp-abap-adt/adt-clients/src/clients/CrudClient.ts`
- `@mcp-abap-adt/adt-clients/src/core/shared/SharedBuilder.ts`
- `mcp-abap-adt/src/lib/utils.ts` (contains `makeAdtRequestWithTimeout`, `getBaseUrl`)

