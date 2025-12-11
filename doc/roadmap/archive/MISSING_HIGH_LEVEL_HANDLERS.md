# Roadmap: Missing High-Level Create/Update Handlers

## Overview
This document tracks missing high-level handlers for Create and Update operations in mcp-abap-adt.

## Current Status

### ✅ Complete (Have both Create and Update high-level handlers)
- **Class** - `handleCreateClass`, `handleUpdateClass` ✅
- **Interface** - `handleCreateInterface`, `handleUpdateInterface` ✅
- **Program** - `handleCreateProgram`, `handleUpdateProgram` ✅
- **Table** - `handleCreateTable`, `handleUpdateTable` ✅
- **Structure** - `handleCreateStructure`, `handleUpdateStructure` ✅
- **View** - `handleCreateView`, `handleUpdateView` ✅
- **Domain** - `handleCreateDomain`, `handleUpdateDomain` ✅
- **DataElement** - `handleCreateDataElement`, `handleUpdateDataElement` ✅
- **BehaviorDefinition** - `handleCreateBehaviorDefinition`, `handleUpdateBehaviorDefinition` ✅
- **BehaviorImplementation** - `handleCreateBehaviorImplementation`, `handleUpdateBehaviorImplementation` ✅
- **MetadataExtension (DDLX)** - `handleCreateMetadataExtension`, `handleUpdateMetadataExtension` ✅
- **FunctionModule** - `handleCreateFunctionModule`, `handleUpdateFunctionModule` ✅
- **FunctionGroup** - `handleCreateFunctionGroup`, `handleUpdateFunctionGroup` ✅
- **ServiceDefinition** - `handleCreateServiceDefinition`, `handleUpdateServiceDefinition` ✅
- **Package** - `handleCreatePackage`, `handleUpdatePackage` ✅

### ✅ All High-Level Handlers Implemented

All missing high-level Create/Update handlers have been successfully implemented:

1. ✅ **UpdateStructure** - `src/handlers/structure/high/handleUpdateStructure.ts`
2. ✅ **CreateBehaviorImplementation** - `src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts`
3. ✅ **UpdateBehaviorImplementation** - `src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts`
4. ✅ **UpdateFunctionGroup** - `src/handlers/function/high/handleUpdateFunctionGroup.ts`
5. ✅ **CreateServiceDefinition** - `src/handlers/service_definition/high/handleCreateServiceDefinition.ts`
6. ✅ **UpdateServiceDefinition** - `src/handlers/service_definition/high/handleUpdateServiceDefinition.ts`
7. ✅ **UpdateTable** - `src/handlers/table/high/handleUpdateTable.ts`

## Implementation Status

### ✅ All Handlers Implemented (Completed)

All missing high-level Create/Update handlers have been successfully implemented and registered:

1. ✅ **UpdateStructure** - Implemented and registered
2. ✅ **CreateBehaviorImplementation** - Implemented and registered
3. ✅ **UpdateBehaviorImplementation** - Implemented and registered
4. ✅ **UpdateFunctionGroup** - Implemented and registered
5. ✅ **CreateServiceDefinition** - Implemented and registered
6. ✅ **UpdateServiceDefinition** - Implemented and registered
7. ✅ **UpdateTable** - Implemented and registered

All handlers follow the established patterns and are ready for use.

## Implementation Pattern

All high-level handlers follow this pattern:

```typescript
// 1. TOOL_DEFINITION with inputSchema
export const TOOL_DEFINITION = {
  name: "Create/Update<ObjectType>",
  description: "...",
  inputSchema: { ... }
} as const;

// 2. Handler function
export async function handleCreate/Update<ObjectType>(args: ...) {
  // Validation
  // Get connection
  // Create CrudClient
  // Execute workflow: validate -> create/lock -> update -> check -> unlock -> (activate)
  // Return response
}
```

### Common Workflow for Create:
1. Validate parameters
2. Validate transport request (if needed)
3. Create object
4. Lock object
5. Update source code/metadata
6. Check syntax
7. Unlock object
8. Activate (if requested)

### Common Workflow for Update:
1. Validate parameters
2. Validate object exists (validation may return "already exists" - this is OK)
3. Lock object
4. Update source code/metadata
5. Check syntax
6. Unlock object
7. Activate (if requested)

## Registration

After implementation, register handlers in:
- `src/index.ts` - `registerAllToolsOnServer()` method
- Import TOOL_DEFINITION and handler function
- Add registration call: `this.registerToolOnServer(server, ...)`

## Testing

Each handler should:
1. Follow existing handler patterns
2. Use CrudClient methods
3. Handle errors gracefully
4. Return proper MCP response format
5. Support optional activation parameter
6. Parse and return activation warnings if any

