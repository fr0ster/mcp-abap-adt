# Report: Check Before Update Usage in High-Level Handlers

**adt-clients version:** 0.1.39 ✅  
**Check date:** 2025-01-XX

---

## ✅ Correctly using check before update

### Class handlers
- ✅ `class/high/handleCreateClass.ts` - check new code BEFORE update (with sourceCode and version='inactive')
- ✅ `class/high/handleUpdateClass.ts` - check new code BEFORE update (with sourceCode and version='inactive')

---

## ❌ INCORRECT: check is executed AFTER update

### Table handlers
- ❌ `table/high/handleCreateTable.ts` - check AFTER update (line 136-153)
  - Required: check new code BEFORE update with `ddlCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

- ❌ `table/high/handleUpdateTable.ts` - check AFTER update (line 88-106)
  - Required: check new code BEFORE update with `ddlCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

### Structure handlers
- ❌ `structure/high/handleCreateStructure.ts` - check AFTER update (line 199-214)
  - Required: check new code BEFORE update with `ddlCode` and `version='inactive'`
  - Current sequence: Lock → Check → Unlock → Activate (no update!)
  - Note: Structure doesn't have update, but check is still executed after creation

- ❌ `structure/high/handleUpdateStructure.ts` - check AFTER update (line 88-106)
  - Required: check new code BEFORE update with `ddlCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

### Interface handlers
- ❌ `interface/high/handleCreateInterface.ts` - check AFTER update (line 128-143)
  - Required: check new code BEFORE update with `sourceCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

- ❌ `interface/high/handleUpdateInterface.ts` - check AFTER update (line 88-106)
  - Required: check new code BEFORE update with `sourceCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

### View handlers
- ❌ `view/high/handleCreateView.ts` - check AFTER update (line 113-129)
  - Required: check new code BEFORE update with `ddlSource` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

- ❌ `view/high/handleUpdateView.ts` - check AFTER update (line 77-95)
  - Required: check new code BEFORE update with `ddlSource` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

### Program handlers
- ❌ `program/high/handleCreateProgram.ts` - check AFTER update (line 197-209)
  - Required: check new code BEFORE update with `sourceCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

- ❌ `program/high/handleUpdateProgram.ts` - check AFTER update (line 81-96)
  - Required: check new code BEFORE update with `sourceCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

### Behavior Implementation handlers
- ❌ `behavior_implementation/high/handleUpdateBehaviorImplementation.ts` - check AFTER update (line 107-122)
  - Required: check new code BEFORE update with `sourceCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate
  - Note: Uses `checkClass` for verification

### Service Definition handlers
- ❌ `service_definition/high/handleUpdateServiceDefinition.ts` - check AFTER update (line 87-108)
  - Required: check new code BEFORE update with `sourceCode` and `version='inactive'`
  - Current sequence: Lock → Update → Check → Unlock → Activate
  - Correct: Lock → Check (new code) → Update → Unlock → Check (inactive) → Activate

---

## Check Method Parameter Order

### Correct order for different types:

**Class, Program:**
```typescript
client.checkClass({ className }, 'inactive', sourceCode)  // version, sourceCode
client.checkProgram({ programName }, 'inactive', sourceCode)  // version, sourceCode
```

**Table, Structure, Interface, View:**
```typescript
client.checkTable({ tableName }, ddlCode, 'inactive')  // sourceCode, version
client.checkStructure({ structureName }, ddlCode, 'inactive')  // sourceCode, version
client.checkInterface({ interfaceName }, sourceCode, 'inactive')  // sourceCode, version
client.checkView({ viewName }, ddlSource, 'inactive')  // sourceCode, version
```

**Domain, DataElement (without sourceCode):**
```typescript
client.checkDomain({ domainName }, 'inactive')  // version only
client.checkDataElement({ dataElementName }, 'inactive')  // version only
```

---

## Statistics

- **Correct:** 2 handlers (Class Create/Update)
- **Incorrect:** 12 handlers
- **Total checked:** 14 handlers with update capability

---

## Fix Plan

### Priority 1 (Basic Objects)
1. ✅ Class (Create/Update) - **FIXED**
2. Table (Create/Update) - needs fixing
3. Structure (Create/Update) - needs fixing
4. Interface (Create/Update) - needs fixing

### Priority 2 (Important Objects)
5. View (Create/Update) - needs fixing
6. Program (Create/Update) - needs fixing

### Priority 3 (Specialized Objects)
7. Behavior Implementation (Update) - needs fixing
8. Service Definition (Update) - needs fixing

---

## Correct Usage Examples

### For Table/Structure/Interface/View:
```typescript
// Lock
await client.lockXxx({ ... });
const lockHandle = client.getLockHandle();

try {
  // Check new code BEFORE update (with sourceCode and version='inactive')
  await safeCheckOperation(
    () => client.checkXxx({ ... }, newSourceCode, 'inactive'),  // sourceCode, version
    objectName,
    { debug: (msg) => logger.info(`[Handler] ${msg}`) }
  );
  
  // Update (only if check passed)
  await client.updateXxx({ ... }, lockHandle);
  
  // Unlock (MANDATORY)
  await client.unlockXxx({ ... }, lockHandle);
  
  // Check inactive version (after unlock, without sourceCode)
  await safeCheckOperation(
    () => client.checkXxx({ ... }, undefined, 'inactive'),  // without sourceCode
    objectName,
    { debug: (msg) => logger.info(`[Handler] ${msg}`) }
  );
  
  // Activate
  if (shouldActivate) {
    await client.activateXxx({ ... });
  }
} catch (error) {
  // Unlock on error
  await client.unlockXxx({ ... }, lockHandle);
  throw error;
}
```

### For Class/Program:
```typescript
// Lock
await client.lockXxx({ ... });
const lockHandle = client.getLockHandle();

try {
  // Check new code BEFORE update (with sourceCode and version='inactive')
  await safeCheckOperation(
    () => client.checkXxx({ ... }, 'inactive', newSourceCode),  // version, sourceCode
    objectName,
    { debug: (msg) => logger.info(`[Handler] ${msg}`) }
  );
  
  // Update (only if check passed)
  await client.updateXxx({ ... }, lockHandle);
  
  // Unlock (MANDATORY)
  await client.unlockXxx({ ... }, lockHandle);
  
  // Check inactive version (after unlock, without sourceCode)
  await safeCheckOperation(
    () => client.checkXxx({ ... }, 'inactive'),  // version only
    objectName,
    { debug: (msg) => logger.info(`[Handler] ${msg}`) }
  );
  
  // Activate
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

**Conclusion:** Most handlers (12 out of 14) execute check AFTER update instead of BEFORE update. All handlers need to be fixed to use check new code BEFORE update, as implemented in handleCreateClass and handleUpdateClass.

