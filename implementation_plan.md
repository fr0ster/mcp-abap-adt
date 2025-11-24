# Refactor: Move Read Handlers to src/readers

## Status: Planned (Not Started)

## Goal
Move all read-only handlers from their current categorized subdirectories in `src/handlers/` to a new directory `src/readers/` to further improve project organization by separating read operations from write operations.

## Current State
As of v1.1.8, all handlers have been reorganized into categorized subdirectories:
- `bdef/`, `class/`, `common/`, `data_element/`, `ddlx/`, `domain/`, `enhancement/`, `function/`, `include/`, `interface/`, `package/`, `program/`, `search/`, `structure/`, `system/`, `table/`, `transport/`, `view/`

## Identified Read Handlers
The following files would be moved from their current subdirectories to `src/readers/`:
- `system/handleDescribeByList.ts`
- `system/handleGetAbapAST.ts`
- `system/handleGetAbapSemanticAnalysis.ts`
- `system/handleGetAbapSystemSymbols.ts`
- `system/handleGetAllTypes.ts`
- `bdef/handleGetBdef.ts`
- `class/handleGetClass.ts`
- `data_element/handleGetDataElement.ts`
- `domain/handleGetDomain.ts`
- `enhancement/handleGetEnhancementImpl.ts`
- `enhancement/handleGetEnhancementSpot.ts`
- `enhancement/handleGetEnhancements.ts`
- `function/handleGetFunction.ts`
- `function/handleGetFunctionGroup.ts`
- `include/handleGetInclude.ts`
- `include/handleGetIncludesList.ts`
- `interface/handleGetInterface.ts`
- `system/handleGetObjectInfo.ts`
- `system/handleGetObjectNodeFromCache.ts`
- `system/handleGetObjectStructure.ts`
- `search/handleGetObjectsByType.ts`
- `search/handleGetObjectsList.ts`
- `package/handleGetPackage.ts`
- `program/handleGetProgFullCode.ts`
- `program/handleGetProgram.ts`
- `system/handleGetSession.ts`
- `system/handleGetSqlQuery.ts`
- `structure/handleGetStructure.ts`
- `table/handleGetTable.ts`
- `table/handleGetTableContents.ts`
- `system/handleGetTransaction.ts`
- `transport/handleGetTransport.ts`
- `system/handleGetTypeInfo.ts`
- `view/handleGetView.ts`
- `system/handleGetWhereUsed.ts`
- `search/handleSearchObject.ts`
- `system/handleGetInactiveObjects.ts`

## Steps
1. Create `src/readers` directory.
2. Move the identified files from their current subdirectories in `src/handlers/` to `src/readers/`.
3. Update imports in moved files to reflect new location (import paths will need adjustment).
4. Update `src/index.ts` to import these handlers from `./readers/...` instead of `./handlers/.../...`.
5. Update `src/lib/toolsRegistry.ts` to import `TOOL_DEFINITION` from new locations.
6. Verify build and tests.

## Verification
- Run `npm run build` to ensure all imports are resolved correctly.
- Run `npm test` to ensure all tests pass.
- Verify that `npm run docs:tools` still generates correct documentation.
