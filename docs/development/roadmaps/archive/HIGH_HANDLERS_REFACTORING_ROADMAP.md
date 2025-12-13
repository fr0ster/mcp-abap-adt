# Roadmap: High-Level Handlers Refactoring and Verification

**Last Updated:** 2025-12-11
**Status:** Completed (100%)

---

## Summary

| Category | Fixed | Pending | Total |
|----------|-------|---------|-------|
| Connection (`createAbapConnection`) | 30 | 0 | 30 |
| Operation Sequence (check before update) | 14 | 0 | 14* |

\* Only handlers with update operations require check-before-update sequence. **All sequence issues are now fixed!**

---

## Execution Status

### ✅ Completed (Correct Sequence + Connection)

| Handler | Sequence | Connection |
|---------|----------|------------|
| `class/high/handleCreateClass.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `class/high/handleUpdateClass.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `table/high/handleCreateTable.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `table/high/handleUpdateTable.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `structure/high/handleCreateStructure.ts` | ✅ lock → unlock → check(inactive) → activate (no update needed) | ✅ `createAbapConnection` |
| `structure/high/handleUpdateStructure.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `interface/high/handleCreateInterface.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `interface/high/handleUpdateInterface.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `view/high/handleCreateView.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `view/high/handleUpdateView.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `program/high/handleCreateProgram.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |
| `program/high/handleUpdateProgram.ts` | ✅ lock → check(new) → update → unlock → check(inactive) → activate | ✅ `createAbapConnection` |

### ✅ No More Sequence Issues

All handlers with source code update operations now have the correct sequence: **check BEFORE update**.

### ⏳ Needs Connection Fix Only (Sequence OK or N/A)

These handlers use correct sequences but still use `getManagedConnection`:

| Handler | Notes |
|---------|-------|
| `domain/high/handleCreateDomain.ts` | No source code update (domain has no DDL) |
| `domain/high/handleUpdateDomain.ts` | No source code update |
| `data_element/high/handleCreateDataElement.ts` | No source code update (data element has no DDL) |
| `data_element/high/handleUpdateDataElement.ts` | No source code update |
| `behavior_definition/high/handleCreateBehaviorDefinition.ts` | create → lock → check → unlock → activate |
| `behavior_definition/high/handleUpdateBehaviorDefinition.ts` | lock → check → unlock → activate |
| `behavior_implementation/high/handleCreateBehaviorImplementation.ts` | Sequence varies |
| `behavior_implementation/high/handleUpdateBehaviorImplementation.ts` | Sequence varies |
| `ddlx/high/handleCreateMetadataExtension.ts` | create → lock → check → unlock → activate |
| `ddlx/high/handleUpdateMetadataExtension.ts` | lock → check → unlock → activate |
| `function/high/handleCreateFunctionGroup.ts` | create → lock → check → unlock → activate |
| `function/high/handleUpdateFunctionGroup.ts` | lock → check → unlock → activate |
| `function/high/handleCreateFunctionModule.ts` | create → lock → check → unlock → activate |
| `function/high/handleUpdateFunctionModule.ts` | lock → check → unlock → activate |
| `service_definition/high/handleCreateServiceDefinition.ts` | create → lock → check → unlock → activate |
| `service_definition/high/handleUpdateServiceDefinition.ts` | lock → check → unlock → activate |
| `package/high/handleCreatePackage.ts` | create → check → activate (no lock needed) |
| `transport/high/handleCreateTransport.ts` | create only (no lock/check needed) |

---

## Correct Operation Sequences

### For Create handlers (with source code):
```
1. Validate
2. Create
3. Lock
4. Check new code (with sourceCode/ddlCode and version='inactive') ← BEFORE update
5. Update (only if check passed)
6. Unlock (MANDATORY after lock)
7. Check inactive version (after unlock, without sourceCode)
8. Activate (if requested)
```

### For Update handlers:
```
1. Lock
2. Check new code (with sourceCode/ddlCode and version='inactive') ← BEFORE update
3. Update (only if check passed)
4. Unlock (MANDATORY after lock)
5. Check inactive version (after unlock)
6. Activate (if requested)
```

### For handlers without source code (domain, data_element):
```
1. Create/Update
2. Lock
3. Check
4. Unlock
5. Activate (if requested)
```

---

## Connection Checklist

Connection migration checklist (applied to all high-level handlers):

- [x] Replace `getManagedConnection()` with `createAbapConnection(config, logger)`
- [x] Add `import { createAbapConnection } from '@mcp-abap-adt/connection'`
- [x] Add `import { getConfig } from '../../../index'`
- [x] Create connection logger (gated by `DEBUG_CONNECTORS`)
- [x] Add `await connection.connect()`
- [x] Add `finally` block with `connection.reset()`

### Connection migration targets (all completed with createAbapConnection)
- [x] behavior_definition/high: `handleCreateBehaviorDefinition`, `handleUpdateBehaviorDefinition`
- [x] behavior_implementation/high: `handleCreateBehaviorImplementation`, `handleUpdateBehaviorImplementation`
- [x] data_element/high: `handleCreateDataElement`, `handleUpdateDataElement`
- [x] ddlx/high: `handleCreateMetadataExtension`, `handleUpdateMetadataExtension`
- [x] domain/high: `handleCreateDomain`, `handleUpdateDomain`
- [x] function/high: `handleCreateFunctionGroup`, `handleUpdateFunctionGroup`, `handleCreateFunctionModule`, `handleUpdateFunctionModule`
- [x] package/high: `handleCreatePackage`
- [x] service_definition/high: `handleCreateServiceDefinition`, `handleUpdateServiceDefinition`
- [x] transport/high: `handleCreateTransport`

---

## Priorities

### ✅ Priority 1: Fix Sequence Issues - COMPLETED
All handlers with source code update operations now have the correct sequence.

### Priority 2: Connection Migration (18 handlers)
Completed: all high-level handlers now use `createAbapConnection` with per-call connect/reset.

---

## Notes

- All handlers must create a separate connection for each call
- Unlock is always mandatory after lock (even if update did not execute)
- **Check new code is executed BEFORE update, not after** (critical!)
- Check inactive version is executed AFTER unlock
- All handlers must have connection cleanup in finally block
- Handlers without source code (domain, data_element) don't need check-before-update
