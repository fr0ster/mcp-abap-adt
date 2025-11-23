# Refactor: Move Read Handlers to src/readers

## Goal
Move all read-only handlers from `src/handlers` to a new directory `src/readers` to improve project organization.

## Identified Read Handlers
The following files will be moved:
- `handleDescribeByList.ts`
- `handleGetAbapAST.ts`
- `handleGetAbapSemanticAnalysis.ts`
- `handleGetAbapSystemSymbols.ts`
- `handleGetAllTypes.ts`
- `handleGetBdef.ts`
- `handleGetClass.ts`
- `handleGetDataElement.ts`
- `handleGetDomain.ts`
- `handleGetEnhancementImpl.ts`
- `handleGetEnhancementSpot.ts`
- `handleGetEnhancements.ts`
- `handleGetFunction.ts`
- `handleGetFunctionGroup.ts`
- `handleGetInclude.ts`
- `handleGetIncludesList.ts`
- `handleGetInterface.ts`
- `handleGetObjectInfo.ts`
- `handleGetObjectNodeFromCache.ts`
- `handleGetObjectStructure.ts`
- `handleGetObjectsByType.ts`
- `handleGetObjectsList.ts`
- `handleGetPackage.ts`
- `handleGetProgFullCode.ts`
- `handleGetProgram.ts`
- `handleGetSession.ts`
- `handleGetSqlQuery.ts`
- `handleGetStructure.ts`
- `handleGetTable.ts`
- `handleGetTableContents.ts`
- `handleGetTransaction.ts`
- `handleGetTransport.ts`
- `handleGetTypeInfo.ts`
- `handleGetView.ts`
- `handleGetWhereUsed.ts`
- `handleSearchObject.ts`

## Steps
1.  Create `src/readers` directory.
2.  Move the identified files from `src/handlers` to `src/readers`.
3.  Verify imports in moved files (likely no changes needed as depth is same).
4.  Update `src/index.ts` to import these handlers from `./readers/...` instead of `./handlers/...`.
5.  Verify build.

## Verification
- Run `npm run build` to ensure all imports are resolved correctly.
