# Activation Refactoring - Centralized Utilities

## Summary
Refactored ABAP object activation to use centralized utility functions with correct Eclipse ADT API endpoints:
- **Group activation** (2-3 related objects): `/sap/bc/adt/activation/runs`
- **Individual activation** (single object in session): `/sap/bc/adt/activation`

## Changes Made

### New Centralized Activation Utilities
Created **`src/lib/activationUtils.ts`** with three main functions:

1. **`activateObjectInSession()`** - Individual object activation
   - Used by Update/Create handlers after lock/unlock operations
   - Endpoint: `/sap/bc/adt/activation?method=activate&preauditRequested=true`
   - Parameters: `objectUri`, `objectName`, `sessionId`, `preaudit`
   - Uses stateful session for proper context

2. **`activateObjectsGroup()`** - Group activation
   - Used by ActivateObject tool for activating 2-3 related objects
   - Endpoint: `/sap/bc/adt/activation/runs?method=activate&preauditRequested=true`
   - Parameters: `objects[]` (2-3 objects), `preaudit`
   - Stateless operation for related objects

3. **`parseActivationResponse()`** - Response parser
   - Common parsing logic for both activation types
   - Extracts status (activated, checked, generated) and messages
   - Returns structured result with warnings/errors

### Updated Handlers

#### Group Activation Handler
- **handleActivateObject.ts** - Now uses `activateObjectsGroup()` and `parseActivationResponse()`

#### Update Handlers (Individual Activation)
All now use `activateObjectInSession()`:
1. **handleUpdateClassSource.ts**
2. **handleUpdateProgramSource.ts**
3. **handleUpdateViewSource.ts**
4. **handleUpdateInterfaceSource.ts**
5. **handleUpdateFunctionModuleSource.ts**

#### Create Handlers (Individual Activation)
All now use `activateObjectInSession()`:
1. **handleCreateProgram.ts**
2. **handleCreateView.ts**
3. **handleCreateTable.ts**
4. **handleCreateStructure.ts**

## Eclipse ADT Reference

### Group Activation (2-3 Related Objects)
```http
POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=false HTTP/1.1
Accept: application/xml
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_test_mcp_01" adtcore:name="ZCL_TEST_MCP_01"/>
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/z_test_program_01" adtcore:name="Z_TEST_PROGRAM_01"/>
</adtcore:objectReferences>
```

### Individual Activation (Single Object in Session)
```http
POST /sap/bc/adt/activation?method=activate&preauditRequested=true HTTP/1.1
Content-Type: application/xml
sap-adt-connection-id: 31cbba4fa6214122afd6a7f714f0f790

<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zok_i_order_0001" adtcore:name="ZOK_I_ORDER_0001"/>
</adtcore:objectReferences>
```

## Testing

### Build the Project
```bash
npm run build
```

### Test Group Activation

1. **Configure 2-3 test objects** in `tests/test-config.yaml`:
   ```yaml
   activate_object:
     objects:
       - name: "ZCL_TEST_MCP_01"
         uri: "/sap/bc/adt/oo/classes/zcl_test_mcp_01"
         type: "CLAS/OC"
       - name: "Z_TEST_PROGRAM_01"
         uri: "/sap/bc/adt/programs/programs/z_test_program_01"
         type: "PROG/P"
     preaudit: false
   ```

2. **Run the test**:
   ```bash
   node tests/test-activate-object.js
   ```

3. **See detailed testing guide**:
   - [tests/README_GROUP_ACTIVATION.md](tests/README_GROUP_ACTIVATION.md) - Complete testing guide
   - [tests/README.md](tests/README.md) - General testing documentation
   - [tests/test-config.yaml.template](tests/test-config.yaml.template) - Configuration template

## Benefits
- **✅ Centralized Logic**: Single source of truth for activation operations
- **✅ Correct Endpoints**: Uses proper Eclipse ADT endpoints for each scenario
- **✅ DRY Principle**: Eliminated code duplication across 10+ handlers
- **✅ Easier Maintenance**: Changes to activation logic only need to be made in one place
- **✅ Consistent Behavior**: All handlers use the same activation logic
- **✅ Better Testing**: Activation utilities can be tested independently
- **✅ Type Safety**: Proper TypeScript types and interfaces

## Files Modified
### New Files
- `src/lib/activationUtils.ts` - Centralized activation utilities

### Modified Handlers (10 files)
- `src/handlers/handleActivateObject.ts` (group activation)
- `src/handlers/handleUpdateClassSource.ts`
- `src/handlers/handleUpdateProgramSource.ts`
- `src/handlers/handleUpdateViewSource.ts`
- `src/handlers/handleUpdateInterfaceSource.ts`
- `src/handlers/handleUpdateFunctionModuleSource.ts`
- `src/handlers/handleCreateProgram.ts`
- `src/handlers/handleCreateView.ts`
- `src/handlers/handleCreateTable.ts`
- `src/handlers/handleCreateStructure.ts`

## Date
November 10, 2025
