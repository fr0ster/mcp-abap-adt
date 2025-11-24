# Roadmap: Implementing Missing Handlers

This roadmap outlines the steps to achieve full coverage of `CrudClient` methods in the MCP server handlers.

## Phase 1: Update Generic Handlers
Extend existing generic handlers to support new object types (`behavior_definition`, `metadata_extension`) and missing functionality.

- [ ] **Update `handleLockObject.ts`**
    - Add support for `behavior_definition` (using `lockBehaviorDefinition`).
    - Add support for `metadata_extension` (using `lockMetadataExtension`).
    - Investigate and add support for `package` (using `lockPackage` - requires `superPackage` handling).

- [ ] **Update `handleDeleteObject.ts`**
    - Add support for `behavior_definition` (using `deleteBehaviorDefinition`).
    - Add support for `metadata_extension` (using `deleteMetadataExtension`).

- [ ] **Update `handleValidateObject.ts`**
    - Add support for `behavior_definition` (using `validateBehaviorDefinition`).
    - Add support for `metadata_extension` (using `validateMetadataExtension`).

- [ ] **Update `handleCheckObject.ts`**
    - Add support for `behavior_definition` (using `checkBehaviorDefinition`).
    - Add support for `metadata_extension` (using `checkMetadataExtension`).

## Phase 2: Missing Specific Handlers (Structure & Package)
Implement specific update handlers that are currently missing.

- [ ] **Create `handleUpdateStructure.ts`**
    - Implement `updateStructure` method.

- [ ] **Create `handleUpdatePackage.ts`**
    - Implement `updatePackage` method.

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
