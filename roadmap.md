# Roadmap: Implementing Missing Handlers

This roadmap outlines the steps to achieve full coverage of `CrudClient` methods in the MCP server handlers.

## Phase 1: Update Generic Handlers
Extend existing generic handlers to support new object types (`behavior_definition`, `metadata_extension`) and missing functionality.

- [x] **Update `handleLockObject.ts`** ✅ Completed
    - Added support for `behavior_definition` (using `lockBehaviorDefinition`).
    - Added support for `metadata_extension` (using `lockMetadataExtension`).
    - Added support for `package` (using `lockPackage` - requires `superPackage` parameter).

- [x] **Update `handleDeleteObject.ts`** ✅ Already completed
    - Already supports `behavior_definition` (using `deleteBehaviorDefinition`).
    - Already supports `metadata_extension` (using `deleteMetadataExtension`).

- [x] **Update `handleValidateObject.ts`** ✅ Completed
    - Added enum support for `behavior_definition` and `metadata_extension`.
    - Note: These types require additional parameters (rootEntity/implementationType for BDEF, description/packageName for DDLX), so validation returns helpful error message directing to specific handlers.

- [x] **Update `handleCheckObject.ts`** ✅ Already completed
    - Already supports `behavior_definition` (using `checkBehaviorDefinition`).
    - Already supports `metadata_extension` (using `checkMetadataExtension`).

## Phase 2: Missing Specific Handlers (Structure & Package)
Implement specific update handlers that are currently missing.

- [x] **Create `handleUpdateStructure.ts`** ✅ Completed
    - Implemented `updateStructure` method in `structure/low/handleUpdateStructure.ts`.
    - Low-level handler: single method call to `CrudClient.updateStructure`.

- [x] **Create `handleUpdatePackage.ts`** ✅ Completed
    - Implemented `updatePackage` method in `package/low/handleUpdatePackage.ts`.
    - Low-level handler: single method call to `CrudClient.updatePackage`.
    - Requires `superPackage` parameter.

## Phase 3: Behavior Definition (BDEF) Handlers
Implement full CRUD support for Behavior Definitions.

- [x] **Create `handleCreateBehaviorDefinition.ts`** ✅ Completed in v1.1.8
    - Implemented `createBehaviorDefinition` with support for Managed, Unmanaged, Abstract, and Projection types.
- [x] **Create `handleUpdateBehaviorDefinition.ts`** ✅ Completed in v1.1.8
    - Implemented `updateBehaviorDefinition` with lock handling and activation support.
- [ ] **Create `handleActivateBehaviorDefinition.ts`** (Optional/Specific)
    - Implement `activateBehaviorDefinition` if generic activation is insufficient.
    - Note: Generic `ActivateObject` handler may be sufficient for BDEF activation.

## Phase 4: Metadata Extension (MDE) Handlers
Implement full CRUD support for Metadata Extensions.

- [x] **Create `handleCreateMetadataExtension.ts`** ✅ Completed in v1.1.8
    - Implemented `createMetadataExtension` with automatic activation support.
- [x] **Create `handleUpdateMetadataExtension.ts`** ✅ Completed in v1.1.8
    - Implemented `updateMetadataExtension` with lock handling and activation support.
- [ ] **Create `handleActivateMetadataExtension.ts`** (Optional/Specific)
    - Implement `activateMetadataExtension` if generic activation is insufficient.
    - Note: Generic `ActivateObject` handler may be sufficient for DDLX activation.

## Phase 5: Utilities
Add missing utility handlers.

- [x] **Create `handleGetInactiveObjects.ts`** ✅ Completed in v1.1.8
    - Implemented `getInactiveObjects` to list objects waiting for activation.
