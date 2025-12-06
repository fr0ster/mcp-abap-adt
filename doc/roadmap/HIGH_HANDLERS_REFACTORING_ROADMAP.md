# Roadmap: High-Level Handlers Refactoring and Verification

## Execution Status

### ✅ Completed
- [x] `handleCreateClass` - fixed operation sequence and connection creation
- [x] `handleUpdateClass` - fixed operation sequence and connection creation
- [x] `handleCreateTable` - fixed connection creation (operation sequence needs verification)

### 🔄 In Progress
- [ ] Verification of all other handlers

### ⏳ Pending
- [ ] All other handlers (28 files)

---

## Correct Operation Sequence

### For Create handlers:
1. **Validate** - validation before creation
2. **Create** - object creation
3. **Lock** - object locking
4. **Check new code** - check new code before update (with `sourceCode`/`ddlCode` and `version='inactive'`)
5. **Update** - update only if check passed
6. **Unlock** - mandatory after lock
7. **Check inactive version** - check after unlock (`version='inactive'`, without sourceCode)
8. **Activate** - activation (if needed)

### For Update handlers:
1. **Lock** - object locking
2. **Check new code** - check new code before update (with `sourceCode`/`ddlCode` and `version='inactive'`)
3. **Update** - update only if check passed
4. **Unlock** - mandatory after lock
5. **Check inactive version** - check after unlock (`version='inactive'`, without sourceCode)
6. **Activate** - activation (if needed)

---

## Checklist for Each Handler

### 1. Connection Creation
- [ ] Replace `getManagedConnection()` with `createAbapConnection(config, logger)`
- [ ] Add `import { createAbapConnection } from '@mcp-abap-adt/connection'`
- [ ] Add `import { getConfig } from '../../../index'`
- [ ] Create connection logger
- [ ] Add `await connection.connect()`
- [ ] Add `finally` block with `connection.reset()`

### 2. Operation Sequence (Create)
- [ ] Validate before Create
- [ ] Create
- [ ] Lock
- [ ] Check new code (with sourceCode and version='inactive') **BEFORE** Update
- [ ] Update only if check passed
- [ ] Unlock (mandatory after lock)
- [ ] Check inactive version (after unlock, without sourceCode)
- [ ] Activate (if needed)

### 3. Operation Sequence (Update)
- [ ] Lock
- [ ] Check new code (with sourceCode and version='inactive') **BEFORE** Update
- [ ] Update only if check passed
- [ ] Unlock (mandatory after lock)
- [ ] Check inactive version (after unlock, without sourceCode)
- [ ] Activate (if needed)

### 4. Error Handling
- [ ] Unlock in catch block (if lock was performed)
- [ ] Proper error logging
- [ ] Cleanup connection in finally

---

## Handler List for Verification

### Class (2 files) ✅
- [x] `class/high/handleCreateClass.ts` - ✅ Fixed
- [x] `class/high/handleUpdateClass.ts` - ✅ Fixed

### Table (2 files)
- [x] `table/high/handleCreateTable.ts` - ✅ Connection fixed, ⚠️ need to fix operation sequence (check after update, missing new code check)
- [ ] `table/high/handleUpdateTable.ts` - ⚠️ Need to fix connection and operation sequence (check after update, missing new code check)

### Structure (2 files)
- [ ] `structure/high/handleCreateStructure.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `structure/high/handleUpdateStructure.ts` - ⚠️ Need to fix connection and operation sequence

### Interface (2 files)
- [ ] `interface/high/handleCreateInterface.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `interface/high/handleUpdateInterface.ts` - ⚠️ Need to fix connection and operation sequence

### Program (2 files)
- [ ] `program/high/handleCreateProgram.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `program/high/handleUpdateProgram.ts` - ⚠️ Need to fix connection and operation sequence

### View (2 files)
- [ ] `view/high/handleCreateView.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `view/high/handleUpdateView.ts` - ⚠️ Need to fix connection and operation sequence

### Domain (2 files)
- [ ] `domain/high/handleCreateDomain.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `domain/high/handleUpdateDomain.ts` - ⚠️ Need to fix connection and operation sequence

### DataElement (2 files)
- [ ] `data_element/high/handleCreateDataElement.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `data_element/high/handleUpdateDataElement.ts` - ⚠️ Need to fix connection and operation sequence

### Function (4 files)
- [ ] `function/high/handleCreateFunctionGroup.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `function/high/handleUpdateFunctionGroup.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `function/high/handleCreateFunctionModule.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `function/high/handleUpdateFunctionModule.ts` - ⚠️ Need to fix connection and operation sequence

### Behavior (4 files)
- [ ] `behavior_definition/high/handleCreateBehaviorDefinition.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `behavior_definition/high/handleUpdateBehaviorDefinition.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `behavior_implementation/high/handleCreateBehaviorImplementation.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `behavior_implementation/high/handleUpdateBehaviorImplementation.ts` - ⚠️ Need to fix connection and operation sequence

### ServiceDefinition (2 files)
- [ ] `service_definition/high/handleCreateServiceDefinition.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `service_definition/high/handleUpdateServiceDefinition.ts` - ⚠️ Need to fix connection and operation sequence

### MetadataExtension (2 files)
- [ ] `ddlx/high/handleCreateMetadataExtension.ts` - ⚠️ Need to fix connection and operation sequence
- [ ] `ddlx/high/handleUpdateMetadataExtension.ts` - ⚠️ Need to fix connection and operation sequence

### Package (1 file)
- [ ] `package/high/handleCreatePackage.ts` - ⚠️ Need to fix connection and operation sequence

### Transport (1 file)
- [ ] `transport/high/handleCreateTransport.ts` - ⚠️ Need to fix connection and operation sequence

---

## Priorities

### Priority 1 (Most Important - Basic Objects)
1. ✅ Class (Create/Update) - **COMPLETED**
2. Table (Create/Update)
3. Structure (Create/Update)
4. Interface (Create/Update)

### Priority 2 (Important Objects)
5. Program (Create/Update)
6. View (Create/Update)
7. Domain (Create/Update)
8. DataElement (Create/Update)

### Priority 3 (Specialized Objects)
9. Function (Create/Update - 4 files)
10. Behavior (Create/Update - 4 files)
11. ServiceDefinition (Create/Update)
12. MetadataExtension (Create/Update)
13. Package (Create)
14. Transport (Create)

---

## Detailed Information About Check Methods

### CrudClient check methods (parameter order):
- `checkClass({ className }, version?, sourceCode?)` - for classes
- `checkTable({ tableName }, sourceCode?, version?)` - for tables (different order!)
- `checkStructure({ structureName }, sourceCode?, version?)` - for structures (different order!)
- `checkInterface({ interfaceName }, sourceCode?, version?)` - for interfaces (different order!)
- `checkProgram({ programName }, version?, sourceCode?)` - for programs
- `checkView({ viewName }, sourceCode?, version?)` - for views (different order!)
- `checkDomain({ domainName }, version?)` - for domains (without sourceCode)
- `checkDataElement({ dataElementName }, version?)` - for data elements (without sourceCode)

**Important:** 
- For check new code: pass `version='inactive'` and `sourceCode`/`ddlCode`
- For check inactive version: pass only `version='inactive'` (without sourceCode)
- **Note:** Table, Structure, Interface, View have different parameter order: `(config, sourceCode?, version?)`

---

## Code Examples

### Create Handler Pattern (Class, Program):
```typescript
// 1. Validate
await client.validateXxx({ ... });

// 2. Create
await client.createXxx({ ... });

// 3. Lock
await client.lockXxx({ ... });
const lockHandle = client.getLockHandle();

try {
  // 4. Check new code BEFORE update
  await client.checkXxx({ ... }, 'inactive', newSourceCode);
  
  // 5. Update (only if check passed)
  await client.updateXxx({ ... }, lockHandle);
  
  // 6. Unlock (MANDATORY)
  await client.unlockXxx({ ... }, lockHandle);
  
  // 7. Check inactive version (after unlock)
  await client.checkXxx({ ... }, 'inactive');
  
  // 8. Activate
  if (shouldActivate) {
    await client.activateXxx({ ... });
  }
} catch (error) {
  // Unlock on error
  await client.unlockXxx({ ... }, lockHandle);
  throw error;
}
```

### Create Handler Pattern (Table, Structure, Interface, View):
```typescript
// 1. Validate
await client.validateXxx({ ... });

// 2. Create
await client.createXxx({ ... });

// 3. Lock
await client.lockXxx({ ... });
const lockHandle = client.getLockHandle();

try {
  // 4. Check new code BEFORE update (different parameter order!)
  await client.checkXxx({ ... }, newSourceCode, 'inactive');
  
  // 5. Update (only if check passed)
  await client.updateXxx({ ... }, lockHandle);
  
  // 6. Unlock (MANDATORY)
  await client.unlockXxx({ ... }, lockHandle);
  
  // 7. Check inactive version (after unlock, without sourceCode)
  await client.checkXxx({ ... }, undefined, 'inactive');
  
  // 8. Activate
  if (shouldActivate) {
    await client.activateXxx({ ... });
  }
} catch (error) {
  // Unlock on error
  await client.unlockXxx({ ... }, lockHandle);
  throw error;
}
```

### Update Handler Pattern (Class, Program):
```typescript
// 1. Lock
await client.lockXxx({ ... });
const lockHandle = client.getLockHandle();

try {
  // 2. Check new code BEFORE update
  await client.checkXxx({ ... }, 'inactive', newSourceCode);
  
  // 3. Update (only if check passed)
  await client.updateXxx({ ... }, lockHandle);
  
  // 4. Unlock (MANDATORY)
  await client.unlockXxx({ ... }, lockHandle);
  
  // 5. Check inactive version (after unlock)
  await client.checkXxx({ ... }, 'inactive');
  
  // 6. Activate
  if (shouldActivate) {
    await client.activateXxx({ ... });
  }
} catch (error) {
  // Unlock on error
  await client.unlockXxx({ ... }, lockHandle);
  throw error;
}
```

### Update Handler Pattern (Table, Structure, Interface, View):
```typescript
// 1. Lock
await client.lockXxx({ ... });
const lockHandle = client.getLockHandle();

try {
  // 2. Check new code BEFORE update (different parameter order!)
  await client.checkXxx({ ... }, newSourceCode, 'inactive');
  
  // 3. Update (only if check passed)
  await client.updateXxx({ ... }, lockHandle);
  
  // 4. Unlock (MANDATORY)
  await client.unlockXxx({ ... }, lockHandle);
  
  // 5. Check inactive version (after unlock, without sourceCode)
  await client.checkXxx({ ... }, undefined, 'inactive');
  
  // 6. Activate
  if (shouldActivate) {
    await client.activateXxx({ ... });
  }
} catch (error) {
  // Unlock on error
  await client.unlockXxx({ ... }, lockHandle);
  throw error;
}
```

---

## Notes

- All handlers must create a separate connection for each call
- Unlock is always mandatory after lock (even if update did not execute)
- Check new code is executed BEFORE update, not after
- Check inactive version is executed AFTER unlock
- All handlers must have connection cleanup in finally block

---

**Last Updated:** 2025-01-XX  
**Status:** In Progress

