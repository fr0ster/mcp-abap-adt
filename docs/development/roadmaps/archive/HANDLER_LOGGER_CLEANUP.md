# Handler Logger Cleanup Roadmap

**Archived:** 2024-12-19

## Status
✅ **COMPLETED** - All handlers have been updated to use `logger` from `HandlerContext` instead of the old `handlerLogger` approach.

## Files Requiring Logger Cleanup (30 files) - ✅ ALL COMPLETED

### MetadataExtension (DDLX) Handlers (10 files) - ✅
- [x] `src/handlers/ddlx/low/handleActivateMetadataExtension.ts`
- [x] `src/handlers/ddlx/low/handleUpdateMetadataExtension.ts`
- [x] `src/handlers/ddlx/low/handleCreateMetadataExtension.ts`
- [x] `src/handlers/ddlx/low/handleValidateMetadataExtension.ts`
- [x] `src/handlers/ddlx/low/handleUnlockMetadataExtension.ts`
- [x] `src/handlers/ddlx/low/handleLockMetadataExtension.ts`
- [x] `src/handlers/ddlx/low/handleDeleteMetadataExtension.ts`
- [x] `src/handlers/ddlx/low/handleCheckMetadataExtension.ts`
- [x] `src/handlers/ddlx/high/handleUpdateMetadataExtension.ts`
- [x] `src/handlers/ddlx/high/handleCreateMetadataExtension.ts`

### Common Handlers (6 files) - ✅
- [x] `src/handlers/common/low/handleUnlockObject.ts`
- [x] `src/handlers/common/low/handleLockObject.ts`
- [x] `src/handlers/common/low/handleValidateObject.ts`
- [x] `src/handlers/common/low/handleCheckObject.ts`
- [x] `src/handlers/common/low/handleDeleteObject.ts`
- [x] `src/handlers/common/low/handleActivateObject.ts`

### Transport Handlers (3 files) - ✅
- [x] `src/handlers/transport/low/handleCreateTransport.ts`
- [x] `src/handlers/transport/high/handleCreateTransport.ts`
- [x] `src/handlers/transport/readonly/handleGetTransport.ts`

### Search Read-only Handlers (2 files) - ✅
- [x] `src/handlers/search/readonly/handleGetObjectsList.ts`
- [x] `src/handlers/search/readonly/handleGetObjectsByType.ts`

### System Read-only Handlers (11 files) - ✅
- [x] `src/handlers/system/readonly/handleGetObjectStructure.ts`
- [x] `src/handlers/system/readonly/handleGetAllTypes.ts`
- [x] `src/handlers/system/readonly/handleGetInactiveObjects.ts`
- [x] `src/handlers/system/readonly/handleGetSession.ts`
- [x] `src/handlers/system/readonly/handleGetTransaction.ts`
- [x] `src/handlers/system/readonly/handleGetWhereUsed.ts`
- [x] `src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts`
- [x] `src/handlers/system/readonly/handleGetAbapAST.ts`
- [x] `src/handlers/system/readonly/handleGetSqlQuery.ts`
- [x] `src/handlers/system/readonly/handleDescribeByList.ts`
- [x] `src/handlers/system/readonly/handleGetObjectNodeFromCache.ts`

## Required Changes

For each file:
1. Remove imports: `getHandlerLogger`, `noopLogger`, `baseLogger` (if only used for handlerLogger)
2. Remove `getHandlerLogger` calls
3. Replace all `handlerLogger.*` calls with `logger.*` (logger comes from `context`)
4. Ensure `const { connection, logger } = context;` is present at function start

## Example

**Before:**
```typescript
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
import { logger as baseLogger } from '../../../lib/utils';

export async function handleX(context: HandlerContext, args: XArgs) {
  const { connection } = context;
  const handlerLogger = getHandlerLogger(
    'handleX',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  
  handlerLogger.info('Starting...');
}
```

**After:**
```typescript
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export async function handleX(context: HandlerContext, args: XArgs) {
  const { connection, logger } = context;
  
  logger.info('Starting...');
}
```
