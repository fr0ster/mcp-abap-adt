# Roadmap: Migration from Handlers to CrudClient in Integration Tests

**Status:** Planning  
**Created:** 2025-01-XX  
**Target:** Migrate all integration tests from direct handler calls to CrudClient API

---

## Overview

Current integration tests use handlers directly (e.g., `handleValidateDomain`, `handleCreateDomain`, `handleLockDomain`). This roadmap outlines the migration to use `CrudClient` from `@mcp-abap-adt/adt-clients` instead.

### Benefits of Migration

1. **Simplified API**: CrudClient provides method chaining and state management
2. **Consistency**: Aligns with how handlers internally use CrudClient
3. **Better State Management**: CrudClient manages lock handles, results, and session state internally
4. **Reduced Boilerplate**: Less manual session state management
5. **Easier Maintenance**: Single source of truth for CRUD operations

---

## Current Architecture

### Current Test Pattern (Handlers)

```typescript
// Current approach: Direct handler calls
const validateResponse = await handleValidateDomain({
  domain_name: domainName,
  description: description,
  package_name: packageName,
  session_id: session.session_id,
  session_state: session.session_state
});

const createResponse = await handleCreateDomain({
  domain_name: domainName,
  description,
  package_name: packageName,
  transport_request: transportRequest,
  session_id: session.session_id,
  session_state: session.session_state
});

// Manual session state management
session = updateSessionFromResponse(session, createData);

const lockResponse = await handleLockDomain({
  domain_name: domainName,
  session_id: session.session_id,
  session_state: session.session_state
});

// Extract lock handle and session manually
const lockHandle = extractLockHandle(lockData);
const lockSession = extractLockSession(lockData);
```

### Target Architecture (CrudClient)

```typescript
// Target approach: CrudClient with method chaining
const client = new CrudClient(connection);

await client
  .validateDomain(domainName)
  .createDomain(domainName, description, packageName, transportRequest)
  .lockDomain(domainName)
  .updateDomain(domainName, properties)
  .unlockDomain(domainName)
  .activateDomain(domainName);

// Access results via getters
const lockHandle = client.getLockHandle();
const createResult = client.getCreateResult();
```

---

## Migration Steps

### Phase 0: CrudClient Parameter Audit (PREREQUISITE) ⚠️

**Status:** 🔴 CRITICAL - Must complete before migration

Before migrating tests, we need to verify and fix CrudClient methods to ensure all required parameters are properly passed without hardcoded empty values.

#### 0.1 Audit CrudClient Methods

**Task:** Review all CrudClient methods for:
1. Hardcoded empty values (`description: ''`, `rootEntity: ''`, etc.)
2. Missing optional parameters that should be passed through
3. Parameters that override valid data from properties

**Files to Review:**
- `mcp-abap-adt-clients/src/clients/CrudClient.ts` - All methods

**Checklist per Object Type:**

**Domain:**
- [ ] `createDomain` - ✅ OK (description required)
- [ ] `lockDomain` - ❌ Has `description: ''` (not needed)
- [ ] `unlockDomain` - ❌ Has `description: ''` (not needed)
- [ ] `updateDomain` - ❌ Has `description: ''` (overrides properties.description)
- [ ] `activateDomain` - ❌ Has `description: ''` (not needed)
- [ ] `checkDomain` - ❌ Has `description: ''` (not needed)
- [ ] `validateDomain` - ❌ Has `description: ''` (not needed)
- [ ] `deleteDomain` - ✅ OK (description optional, transportRequest passed)

**Class:**
- [ ] `createClass` - ✅ OK (description required)
- [ ] `lockClass` - ❌ Has `description: ''` (not needed)
- [ ] `unlockClass` - ❌ Has `description: ''` (not needed)
- [ ] `updateClass` - ❌ Has `description: ''` (not needed, sourceCode passed)
- [ ] `activateClass` - ❌ Has `description: ''` (not needed)
- [ ] `checkClass` - ❌ Has `description: ''` (not needed)
- [ ] `validateClass` - ❌ Has `description: ''` (not needed)
- [ ] `deleteClass` - ✅ OK (transportRequest passed)

**Interface:**
- [ ] Similar pattern to Class

**Program:**
- [ ] Similar pattern to Class

**DataElement:**
- [ ] Similar pattern to Domain

**Structure:**
- [ ] Similar pattern to Domain

**Table:**
- [ ] Check if description is needed

**View:**
- [ ] Check if description is needed

**FunctionModule:**
- [ ] Check functionGroupName handling

**FunctionGroup:**
- [ ] Check description handling

**Package:**
- [ ] Check superPackage handling (`superPackage: ''` in delete)

**BehaviorDefinition:**
- [ ] Check `rootEntity: ''` in lock/unlock/update/activate/check
- [ ] Check `name: ''` in validate

**MetadataExtension:**
- [ ] Similar pattern to Domain

#### 0.2 Fix BuilderConfig Types

**Task:** Make optional fields truly optional in BuilderConfig interfaces

**Files to Update:**
- `mcp-abap-adt-clients/src/core/domain/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/class/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/interface/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/program/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/dataElement/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/structure/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/table/types.ts` - Check description requirement
- `mcp-abap-adt-clients/src/core/view/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/functionModule/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/functionGroup/types.ts` - Make `description` optional
- `mcp-abap-adt-clients/src/core/package/types.ts` - Check superPackage requirement
- `mcp-abap-adt-clients/src/core/behaviorDefinition/types.ts` - Make `description`, `rootEntity` optional
- `mcp-abap-adt-clients/src/core/metadataExtension/types.ts` - Make `description` optional

**Example Fix:**
```typescript
// Before:
export interface DomainBuilderConfig {
  domainName: string;
  packageName?: string;
  transportRequest?: string;
  description: string;  // ❌ Required but not needed for many operations
  // ...
}

// After:
export interface DomainBuilderConfig {
  domainName: string;
  packageName?: string;
  transportRequest?: string;
  description?: string;  // ✅ Optional
  // ...
}
```

#### 0.3 Fix CrudClient Methods

**Task:** Remove hardcoded empty values from CrudClient methods

**Example Fixes:**

```typescript
// Before (BAD):
async lockDomain(domainName: string): Promise<this> {
  const builder = new DomainBuilder(this.connection, {}, { domainName, description: '' });
  await builder.lock();
  this.crudState.lockHandle = builder.getState().lockHandle;
  return this;
}

async updateDomain(domainName: string, properties: any, lockHandle?: string): Promise<this> {
  const builder = new DomainBuilder(this.connection, {}, { domainName, description: '', ...properties });
  // description: '' overrides properties.description!
  (builder as any).lockHandle = lockHandle || this.crudState.lockHandle;
  await builder.update();
  this.crudState.updateResult = builder.getState().updateResult;
  return this;
}

// After (GOOD):
async lockDomain(domainName: string): Promise<this> {
  const builder = new DomainBuilder(this.connection, {}, { domainName });
  // No description needed for lock
  await builder.lock();
  this.crudState.lockHandle = builder.getState().lockHandle;
  return this;
}

async updateDomain(domainName: string, properties: any, lockHandle?: string): Promise<this> {
  const builder = new DomainBuilder(this.connection, {}, { domainName, ...properties });
  // Only spread properties, don't hardcode description
  (builder as any).lockHandle = lockHandle || this.crudState.lockHandle;
  await builder.update();
  this.crudState.updateResult = builder.getState().updateResult;
  return this;
}
```

#### 0.4 Update Builder Constructors

**Task:** Update all Builder classes to handle optional description

**Files to Update:**
- All Builder classes in `mcp-abap-adt-clients/src/core/*/`

**Example:**
```typescript
// Before:
constructor(
  connection: AbapConnection,
  logger: IAdtLogger,
  config: DomainBuilderConfig
) {
  this.config = { ...config };
  // If description is required, this will fail
}

// After:
constructor(
  connection: AbapConnection,
  logger: IAdtLogger,
  config: DomainBuilderConfig
) {
  this.config = { 
    ...config,
    description: config.description || ''  // Default to empty if not provided
  };
}
```

#### 0.5 Update Low-Level Functions

**Task:** Verify low-level functions handle optional description correctly

**Check:**
- Functions that use description should handle undefined/empty
- Functions that don't use description should ignore it
- No errors should occur when description is missing

#### 0.6 Test Fixes

**Task:** Run existing tests to ensure fixes don't break anything

**Tests to Run:**
- All Builder tests in `mcp-abap-adt-clients/src/__tests__/integration/`
- Verify no regressions

**Status:** ⏳ Not Started

---

### Phase 1: Infrastructure Setup

#### 1.1 Create Connection Helper for Tests

**File:** `src/__tests__/integration/helpers/connectionHelpers.ts`

**Purpose:** Centralize connection creation for tests

**Implementation:**
```typescript
import { AbapConnection, createAbapConnection, SapConfig } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import * as dotenv from 'dotenv';
import * as path from 'path';

export interface TestConnection {
  connection: AbapConnection;
  client: CrudClient;
}

export async function createTestConnection(): Promise<TestConnection> {
  const config = getTestConfig();
  const connection = createAbapConnection(config, createTestLogger());
  
  // Connect to initialize session
  await (connection as any).connect();
  
  const client = new CrudClient(connection);
  
  return { connection, client };
}

function getTestConfig(): SapConfig {
  // Load from .env (same as current tests)
  // ...
}

function createTestLogger() {
  // Create logger for connection
  // ...
}
```

**Status:** ⏳ Not Started

---

#### 1.2 Create CrudClient Test Helpers

**File:** `src/__tests__/integration/helpers/crudClientHelpers.ts`

**Purpose:** Helper functions for working with CrudClient in tests

**Implementation:**
```typescript
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { AxiosResponse } from 'axios';

/**
 * Extract result from CrudClient response
 */
export function getCrudResult<T>(client: CrudClient, getter: () => AxiosResponse | undefined): T | null {
  const response = getter();
  if (!response) return null;
  
  // Parse response data (may be XML or JSON)
  if (typeof response.data === 'string') {
    try {
      return JSON.parse(response.data) as T;
    } catch {
      return response.data as T;
    }
  }
  
  return response.data as T;
}

/**
 * Check if CrudClient operation succeeded
 */
export function isCrudSuccess(client: CrudClient, getter: () => AxiosResponse | undefined): boolean {
  const response = getter();
  if (!response) return false;
  
  // Check HTTP status
  if (response.status < 200 || response.status >= 300) {
    return false;
  }
  
  // Check response data for success indicators
  if (typeof response.data === 'string') {
    // Parse XML/JSON if needed
    try {
      const data = JSON.parse(response.data);
      return data.success !== false;
    } catch {
      // Assume success if status is OK
      return true;
    }
  }
  
  return true;
}

/**
 * Wait for operation to complete (with delay)
 */
export async function waitForOperation(
  operation: string,
  delayMs: number
): Promise<void> {
  // Same as current delay() helper
  return new Promise(resolve => setTimeout(resolve, delayMs));
}
```

**Status:** ⏳ Not Started

---

#### 1.3 Update Session Helpers for CrudClient

**File:** `src/__tests__/integration/helpers/sessionHelpers.ts`

**Changes:**
- Add helper to set session state on connection
- Add helper to get session state from connection
- Keep existing helpers for backward compatibility during migration

**Implementation:**
```typescript
import { AbapConnection } from '@mcp-abap-adt/connection';
import { SessionInfo } from './sessionHelpers';

/**
 * Set session state on connection (for CrudClient)
 */
export function setConnectionSessionState(
  connection: AbapConnection,
  session: SessionInfo
): void {
  connection.setSessionState({
    cookies: session.session_state.cookies || null,
    csrfToken: session.session_state.csrf_token || null,
    cookieStore: session.session_state.cookie_store || {}
  });
}

/**
 * Get session state from connection
 */
export function getConnectionSessionState(connection: AbapConnection): SessionInfo | null {
  const state = connection.getSessionState();
  if (!state) return null;
  
  return {
    session_id: 'current', // CrudClient doesn't expose session_id
    session_state: {
      cookies: state.cookies || '',
      csrf_token: state.csrfToken || '',
      cookie_store: state.cookieStore || {}
    }
  };
}
```

**Status:** ⏳ Not Started

---

### Phase 2: Migrate Domain Tests (Pilot)

#### 2.1 Create New CrudClient-Based Test File

**File:** `src/__tests__/integration/domain/DomainCrudClient.test.ts`

**Purpose:** New test file using CrudClient (parallel to existing handler tests)

**Structure:**
```typescript
import { createTestConnection, TestConnection } from '../helpers/connectionHelpers';
import { getCrudResult, isCrudSuccess, waitForOperation } from '../helpers/crudClientHelpers';
import { getEnabledTestCase, resolvePackageName, resolveTransportRequest, getOperationDelay, getTimeout } from '../helpers/configHelpers';

describe('Domain CrudClient Integration', () => {
  let testConnection: TestConnection | null = null;
  let hasConfig = false;

  beforeAll(async () => {
    try {
      testConnection = await createTestConnection();
      hasConfig = true;
    } catch (error) {
      console.warn('⚠️ Skipping tests: No .env file or SAP configuration found');
      hasConfig = false;
    }
  });

  afterAll(async () => {
    if (testConnection?.connection) {
      testConnection.connection.reset();
    }
  });

  describe('Full Workflow', () => {
    it('should execute full workflow: Validate → Create → Lock → Update → Unlock → Activate', async () => {
      if (!hasConfig || !testConnection) {
        console.log('⏭️  Skipping test: No configuration');
        return;
      }

      const { client } = testConnection;
      const testCase = getEnabledTestCase('create_domain_low', 'full_workflow');
      if (!testCase) {
        console.log('⏭️  Skipping test: No test case');
        return;
      }

      const domainName = testCase.params.domain_name;
      const packageName = resolvePackageName(testCase);
      const transportRequest = resolveTransportRequest(testCase);
      const description = testCase.params.description || `Test domain for CrudClient`;

      try {
        // Step 1: Validate
        await client.validateDomain(domainName);
        const validationResponse = client.getValidationResponse();
        expect(validationResponse).toBeDefined();

        // Step 2: Create
        await client.createDomain(domainName, description, packageName, transportRequest);
        const createResult = client.getCreateResult();
        expect(createResult).toBeDefined();
        expect(isCrudSuccess(client, () => client.getCreateResult())).toBe(true);

        await waitForOperation('create', getOperationDelay('create', testCase));

        // Step 3: Lock
        await client.lockDomain(domainName);
        const lockHandle = client.getLockHandle();
        expect(lockHandle).toBeDefined();

        await waitForOperation('lock', getOperationDelay('lock', testCase));

        // Step 4: Update
        const properties = {
          description: `${description} (updated)`,
          datatype: testCase.params.datatype || 'CHAR',
          length: testCase.params.length || 10,
          packageName: packageName
        };
        await client.updateDomain(domainName, properties);
        const updateResult = client.getUpdateResult();
        expect(updateResult).toBeDefined();
        expect(isCrudSuccess(client, () => client.getUpdateResult())).toBe(true);

        await waitForOperation('update', getOperationDelay('update', testCase));

        // Step 5: Unlock
        await client.unlockDomain(domainName);
        const unlockResult = client.getUnlockResult();
        expect(unlockResult).toBeDefined();
        expect(isCrudSuccess(client, () => client.getUnlockResult())).toBe(true);

        await waitForOperation('unlock', getOperationDelay('unlock', testCase));

        // Step 6: Activate
        await client.activateDomain(domainName);
        const activateResult = client.getActivateResult();
        expect(activateResult).toBeDefined();
        expect(isCrudSuccess(client, () => client.getActivateResult())).toBe(true);

        console.log(`✅ Full workflow completed successfully for ${domainName}`);

      } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
      } finally {
        // Cleanup: Unlock and delete
        if (testConnection && domainName) {
          try {
            // Try to unlock if locked
            try {
              await client.lockDomain(domainName);
              await client.unlockDomain(domainName);
            } catch (e) {
              // Ignore unlock errors
            }

            await waitForOperation('unlock', 1000);

            // Delete domain
            await client.deleteDomain(domainName, transportRequest);
            console.log(`🧹 Cleaned up test domain: ${domainName}`);
          } catch (cleanupError: any) {
            console.warn(`⚠️  Failed to cleanup test domain ${domainName}: ${cleanupError.message}`);
          }
        }
      }
    }, getTimeout('long'));
  });
});
```

**Status:** ⏳ Not Started

---

#### 2.2 Test and Validate Domain Migration

**Tasks:**
1. Run new CrudClient test alongside existing handler test
2. Compare results and behavior
3. Fix any issues with CrudClient helpers
4. Document any differences or limitations

**Status:** ⏳ Not Started

---

### Phase 3: Migrate Remaining Object Types

#### 3.1 Priority Order

Based on current test implementation status:

1. **Priority 1 (Core Objects)**
   - [ ] Class - `ClassCrudClient.test.ts`
   - [ ] Program - `ProgramCrudClient.test.ts`
   - [ ] Interface - `InterfaceCrudClient.test.ts`
   - [ ] FunctionGroup - `FunctionGroupCrudClient.test.ts`
   - [ ] FunctionModule - `FunctionModuleCrudClient.test.ts`

2. **Priority 2 (Dictionary Objects)**
   - [x] Domain - `DomainCrudClient.test.ts` (Phase 2)
   - [ ] DataElement - `DataElementCrudClient.test.ts`
   - [ ] Structure - `StructureCrudClient.test.ts`
   - [ ] Table - `TableCrudClient.test.ts`
   - [ ] View - `ViewCrudClient.test.ts`

3. **Priority 3 (Other Objects)**
   - [ ] Package - `PackageCrudClient.test.ts`
   - [ ] BehaviorDefinition - `BehaviorDefinitionCrudClient.test.ts`
   - [ ] MetadataExtension - `MetadataExtensionCrudClient.test.ts`

**Status:** ⏳ Not Started

---

#### 3.2 Migration Template

For each object type:

1. Copy `DomainCrudClient.test.ts` as template
2. Replace domain-specific methods with object-specific methods
3. Adapt properties/parameters for each object type
4. Update test case names in `test-config.yaml` if needed
5. Run tests and fix issues

**Status:** ⏳ Not Started

---

### Phase 4: Method Chaining Optimization

#### 4.1 Implement Method Chaining Pattern

**Current Pattern (Sequential):**
```typescript
await client.validateDomain(domainName);
await client.createDomain(domainName, description, packageName);
await client.lockDomain(domainName);
await client.updateDomain(domainName, properties);
await client.unlockDomain(domainName);
await client.activateDomain(domainName);
```

**Optimized Pattern (Chaining):**
```typescript
await client
  .validateDomain(domainName)
  .then(() => waitForOperation('validate', delay))
  .then(() => client.createDomain(domainName, description, packageName))
  .then(() => waitForOperation('create', delay))
  .then(() => client.lockDomain(domainName))
  .then(() => waitForOperation('lock', delay))
  .then(() => client.updateDomain(domainName, properties))
  .then(() => waitForOperation('update', delay))
  .then(() => client.unlockDomain(domainName))
  .then(() => waitForOperation('unlock', delay))
  .then(() => client.activateDomain(domainName));
```

**Note:** CrudClient methods return `Promise<this>`, so chaining works, but delays need to be handled between steps.

**Status:** ⏳ Not Started

---

### Phase 5: Cleanup and Documentation

#### 5.1 Remove Old Handler Tests

**Tasks:**
1. After all CrudClient tests pass, mark old handler tests as deprecated
2. Add deprecation notices to old test files
3. Update PLAN.md to reflect new test structure
4. Remove old test files after confirmation period

**Status:** ⏳ Not Started

---

#### 5.2 Update Documentation

**Files to Update:**
- `src/__tests__/integration/PLAN.md` - Update with CrudClient pattern
- `src/__tests__/integration/README.md` - Add CrudClient test documentation
- Create `src/__tests__/integration/CRUDCLIENT_PATTERN.md` - Document CrudClient test pattern

**Status:** ⏳ Not Started

---

## Key Differences: Handlers vs CrudClient

### Session Management

**Handlers:**
- Manual session state management
- Must pass `session_id` and `session_state` to each handler
- Must extract and update session state after each operation
- Lock operations return new session that must be used for Update/Unlock

**CrudClient:**
- Session state managed internally by connection
- No need to pass session to each method
- Connection automatically maintains session state
- Lock handle stored in CrudClient state

### Error Handling

**Handlers:**
- Return `{ isError: boolean, content: Array<{ type: string, text: string }> }`
- Must check `isError` and parse `content[0].text`
- Errors are JSON strings in content

**CrudClient:**
- Methods throw exceptions on error
- Results stored in state, accessible via getters
- HTTP errors are AxiosError exceptions
- Must check HTTP status codes in responses

### Result Access

**Handlers:**
- Results returned in handler response
- Must parse JSON from `content[0].text`
- Each handler call returns new response

**CrudClient:**
- Results stored in internal state
- Access via getters: `getCreateResult()`, `getLockHandle()`, etc.
- Results persist until next operation of same type

### Lock Handle Management

**Handlers:**
- Must extract `lock_handle` from Lock response
- Must pass `lock_handle` explicitly to Update/Unlock
- Must track lock handle manually

**CrudClient:**
- Lock handle stored automatically in `crudState.lockHandle`
- Update/Unlock methods use stored lock handle if not provided
- No need to manually track lock handles

---

## Challenges and Solutions

### Challenge 1: Session State Persistence

**Issue:** CrudClient manages session internally, but tests may need to verify session state.

**Solution:** 
- Use `connection.getSessionState()` to inspect session
- Add helper functions to extract session info from connection
- Keep session verification minimal (CrudClient handles it)

### Challenge 2: Error Response Format

**Issue:** Handlers return structured error responses, CrudClient throws exceptions.

**Solution:**
- Wrap CrudClient calls in try-catch
- Extract error information from AxiosError
- Create helper to format errors similar to handler format

### Challenge 3: Result Parsing

**Issue:** CrudClient returns AxiosResponse, which may contain XML or JSON strings.

**Solution:**
- Create helper functions to parse responses
- Handle both XML and JSON formats
- Extract relevant data from response

### Challenge 4: Test Configuration Compatibility

**Issue:** Test configuration may need updates for CrudClient tests.

**Solution:**
- Reuse existing `test-config.yaml`
- Add new test case names if needed (e.g., `create_domain_crudclient`)
- Keep same parameter structure

### Challenge 5: Hardcoded Empty Values in CrudClient ⚠️ CRITICAL

**Issue:** CrudClient methods pass hardcoded empty values (`description: ''`) to builders, which then pass them to low-level functions.

**Problem Analysis:**

1. **Domain Operations:**
   ```typescript
   // Current (BAD):
   async lockDomain(domainName: string): Promise<this> {
     const builder = new DomainBuilder(this.connection, {}, { domainName, description: '' });
     // ...
   }
   
   async updateDomain(domainName: string, properties: any, lockHandle?: string): Promise<this> {
     const builder = new DomainBuilder(this.connection, {}, { domainName, description: '', ...properties });
     // description: '' overrides properties.description!
   }
   ```

2. **Root Cause:**
   - `DomainBuilderConfig.description` is **required** (not optional)
   - But for operations like `lock`, `unlock`, `activate`, `check`, `validate` - description is not needed
   - For `update` - description should come from `properties`, not be hardcoded

3. **Impact:**
   - Unnecessary empty strings passed to low-level functions
   - Potential override of valid description in `updateDomain` properties
   - Inconsistent API (some methods require description, others don't)

**Solution Required:**

**Option A: Make description optional in BuilderConfig (Recommended)**
- Change `DomainBuilderConfig.description` from `string` to `string | undefined`
- Update all builders to handle optional description
- Update low-level functions to handle optional description
- Remove hardcoded `description: ''` from CrudClient methods

**Option B: Separate config types for different operations**
- Create `DomainLockConfig`, `DomainUpdateConfig`, etc.
- Each config only includes required fields
- More type-safe but more complex

**Option C: Keep current but document and verify**
- Keep hardcoded values but ensure they don't override valid data
- Add validation to prevent empty description in update properties
- Document that empty description is expected for read-only operations

**Action Items:**

1. **Audit all CrudClient methods** for hardcoded empty values:
   - [ ] Domain: `lockDomain`, `unlockDomain`, `updateDomain`, `activateDomain`, `checkDomain`, `validateDomain`
   - [ ] Class: `lockClass`, `unlockClass`, `updateClass`, `activateClass`, `checkClass`, `validateClass`
   - [ ] Interface: `lockInterface`, `unlockInterface`, `updateInterface`, `activateInterface`, `checkInterface`, `validateInterface`
   - [ ] Program: `lockProgram`, `unlockProgram`, `updateProgram`, `activateProgram`, `checkProgram`, `validateProgram`
   - [ ] DataElement: `lockDataElement`, `unlockDataElement`, `updateDataElement`, `activateDataElement`, `checkDataElement`, `validateDataElement`
   - [ ] Structure: `lockStructure`, `unlockStructure`, `updateStructure`, `activateStructure`, `checkStructure`, `validateStructure`
   - [ ] Table: `lockTable`, `unlockTable`, `updateTable`, `activateTable`, `checkTable`, `validateTable`
   - [ ] View: `lockView`, `unlockView`, `updateView`, `activateView`, `checkView`, `validateView`
   - [ ] FunctionModule: `lockFunctionModule`, `unlockFunctionModule`, `updateFunctionModule`, `activateFunctionModule`, `checkFunctionModule`, `validateFunctionModule`
   - [ ] FunctionGroup: `lockFunctionGroup`, `unlockFunctionGroup`, `activateFunctionGroup`, `checkFunctionGroup`, `validateFunctionGroup`
   - [ ] Package: `lockPackage`, `unlockPackage`, `updatePackage`, `checkPackage`
   - [ ] BehaviorDefinition: `lockBehaviorDefinition`, `unlockBehaviorDefinition`, `updateBehaviorDefinition`, `activateBehaviorDefinition`, `checkBehaviorDefinition`, `validateBehaviorDefinition`
   - [ ] MetadataExtension: `lockMetadataExtension`, `unlockMetadataExtension`, `updateMetadataExtension`, `activateMetadataExtension`, `checkMetadataExtension`, `validateMetadataExtension`

2. **Check if empty values are actually used in low-level functions:**
   - Review `lock.ts`, `unlock.ts`, `activate.ts`, `check.ts`, `validate.ts` for each object type
   - Verify if empty description causes issues or is ignored

3. **Fix update methods to not override properties:**
   ```typescript
   // Current (BAD):
   async updateDomain(domainName: string, properties: any, lockHandle?: string): Promise<this> {
     const builder = new DomainBuilder(this.connection, {}, { domainName, description: '', ...properties });
     // description: '' overrides properties.description
   }
   
   // Fixed:
   async updateDomain(domainName: string, properties: any, lockHandle?: string): Promise<this> {
     const builder = new DomainBuilder(this.connection, {}, { domainName, ...properties });
     // Only spread properties, don't hardcode description
   }
   ```

4. **Update BuilderConfig types:**
   - Make `description` optional in all BuilderConfig interfaces
   - Update builder constructors to handle optional description
   - Update low-level functions to handle optional description

**Priority:** 🔴 HIGH - This affects data integrity and API consistency

---

## Testing Strategy

### Parallel Testing

During migration, run both handler and CrudClient tests in parallel:
- Compare results
- Verify same behavior
- Identify any differences

### Gradual Migration

1. Start with Domain (simplest, already tested)
2. Migrate one object type at a time
3. Validate each migration before moving to next
4. Keep old tests until all migrations complete

### Validation Checklist

For each migrated test:
- [ ] All operations execute successfully
- [ ] Results match handler test results
- [ ] Cleanup works correctly
- [ ] Error handling works as expected
- [ ] Session state is maintained correctly
- [ ] Lock handles are managed correctly

---

## Timeline Estimate

- **Phase 0 (CrudClient Parameter Audit):** 3-5 days ⚠️ **MUST COMPLETE FIRST**
  - Audit all methods: 1 day
  - Fix BuilderConfig types: 1 day
  - Fix CrudClient methods: 1-2 days
  - Update Builder constructors: 0.5 day
  - Update low-level functions: 0.5 day
  - Test fixes: 1 day
- **Phase 1 (Infrastructure):** 2-3 days
- **Phase 2 (Domain Pilot):** 1-2 days
- **Phase 3 (Remaining Objects):** 5-7 days (1 day per object type)
- **Phase 4 (Optimization):** 1-2 days
- **Phase 5 (Cleanup):** 1 day

**Total:** ~13-20 days (including Phase 0)

---

## Success Criteria

1. ✅ **Phase 0 Complete:** All CrudClient methods verified, no hardcoded empty values
2. ✅ All object types have CrudClient-based tests
3. ✅ All CrudClient tests pass
4. ✅ Test execution time is similar or better
5. ✅ Code is cleaner and more maintainable
6. ✅ Documentation is updated
7. ✅ Old handler tests are deprecated/removed
8. ✅ No data loss or override issues (description, properties, etc.)

---

## Notes

- CrudClient internally uses Builders (DomainBuilder, ClassBuilder, etc.)
- This migration aligns tests with how handlers actually work internally
- CrudClient provides better abstraction and state management
- Method chaining can make tests more readable
- State management is handled automatically by CrudClient

---

## References

- CrudClient API: `mcp-abap-adt-clients/src/clients/CrudClient.ts`
- Current Handler Tests: `src/__tests__/integration/domain/DomainLowHandlers.test.ts`
- Builder Tests (reference): `mcp-abap-adt-clients/src/__tests__/integration/domain/DomainBuilder.test.ts`
- Test Configuration: `tests/test-config.yaml`

