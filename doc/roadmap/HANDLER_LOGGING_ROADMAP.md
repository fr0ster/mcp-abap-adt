# Roadmap: Handler Logging via ILogger

## Goals
- Use a single logging interface (`ILogger` from `@mcp-abap-adt/logger` / `@mcp-abap-adt/interfaces`) across all handlers.
- At server startup: inject a logger (or no-op). Default flow stays lightweight; when needed, enable richer logging with levels/prefixes.
- In tests: use a dedicated handler logger with handler/object tags to show step-by-step flow (validate/create/lock/update/unlock/activate) and failure points.
- Logging must be opt-in: enable handler logs only with `DEBUG_HANDLERS=true`, test logs only with `DEBUG_TESTS=true`/`DEBUG_ADT_TESTS=true`; broker/provider/connector logs only when their dedicated env flags (e.g., `DEBUG_BROKER`, `DEBUG_PROVIDER`, `DEBUG_CONNECTORS`) are set.

## Tasks
- [x] Create a handler logger factory (e.g., `createHandlerLogger(category: string): ILogger`) that:
  - Reads level from env (e.g., `HANDLER_LOG_LEVEL`, default `info`);
  - Returns no-op when level is `silent` or `HANDLER_LOG_SILENT=true`;
  - Adds category prefix (handler name) and optional subcategory (connection/auth/adt).
- [x] Migrate class low-level handlers to `ILogger` via `getHandlerLogger` with `DEBUG_HANDLERS` toggle (no-op by default).
- [ ] Next up: align class high-level handlers with `ILogger` opt-in (replace ad-hoc `handlerLogger` usage), keep default silent when `DEBUG_HANDLERS` is not set.
- [ ] Add broker/provider/connector loggers gated by their env flags (`DEBUG_BROKER`, `DEBUG_PROVIDER`, `DEBUG_CONNECTORS`), mirroring test/handler toggles.
- [ ] Refactor remaining handlers (high/low) to use injected `ILogger` instead of direct `console`/global loggers:
  - Inject via parameter/context or factory when creating `CrudClient`/`AbapConnection`;
  - Keep no-op by default to avoid overhead.
- [ ] Test logging:
  - Add `createTestHandlerLogger(handlerName, objectName)` with tags (handler, object, step);
  - Log key steps (validate/create/lock/update/unlock/activate) and errors;
  - Env switches: `TEST_HANDLER_LOG_LEVEL` and optional `TEST_HANDLER_LOG_FILE` for file sink.
- [ ] Docs:
  - How to enable server logging: `HANDLER_LOG_LEVEL=debug`, `HANDLER_LOG_FILE=/tmp/...`;
  - How to enable test logging: `TEST_HANDLER_LOG_LEVEL=debug`, sample output.
- [ ] Optional: Add color/prefix markers per category and compact format for grep.

## Handler Coverage (ILogger usage)
- [x] `class/low/handleValidateClass` — uses `getHandlerLogger('handleValidateClass', logger)`
- [ ] behavior_definition/high `handleCreateBehaviorDefinition`, `handleUpdateBehaviorDefinition`
- [ ] behavior_definition/low `handleValidateBehaviorDefinition`, `handleCreateBehaviorDefinition`, `handleCheckBehaviorDefinition`, `handleLockBehaviorDefinition`, `handleUpdateBehaviorDefinition`, `handleUnlockBehaviorDefinition`, `handleActivateBehaviorDefinition`, `handleDeleteBehaviorDefinition`
- [ ] behavior_implementation/high `handleCreateBehaviorImplementation`, `handleUpdateBehaviorImplementation`
- [ ] behavior_implementation/low `handleValidateBehaviorImplementation`, `handleCreateBehaviorImplementation`, `handleLockBehaviorImplementation`, `handleUpdateBehaviorImplementation`
- [ ] class/high `handleCreateClass`, `handleUpdateClass`
- [x] class/low `handleCreateClass` — uses `getHandlerLogger` with DEBUG_HANDLERS switch
- [x] class/low `handleCreateClass`, `handleUpdateClass`, `handleLockClass`, `handleUnlockClass`, `handleCheckClass`, `handleActivateClass`, `handleDeleteClass`, `handleRunClassUnitTests`, `handleGetClassUnitTestStatus`, `handleGetClassUnitTestResult`, `handleUpdateClassTestClasses`, `handleLockClassTestClasses`, `handleUnlockClassTestClasses`, `handleActivateClassTestClasses` — all use `getHandlerLogger` gated by `DEBUG_HANDLERS`
- [ ] data_element/high `handleCreateDataElement`, `handleUpdateDataElement`
- [ ] data_element/low `handleValidateDataElement`, `handleCreateDataElement`, `handleCheckDataElement`, `handleLockDataElement`, `handleUpdateDataElement`, `handleUnlockDataElement`, `handleActivateDataElement`, `handleDeleteDataElement`
- [ ] ddlx/high `handleCreateMetadataExtension`, `handleUpdateMetadataExtension`
- [ ] ddlx/low `handleValidateMetadataExtension`, `handleCreateMetadataExtension`, `handleCheckMetadataExtension`, `handleLockMetadataExtension`, `handleUpdateMetadataExtension`, `handleUnlockMetadataExtension`, `handleActivateMetadataExtension`, `handleDeleteMetadataExtension`
- [ ] domain/high `handleCreateDomain`, `handleUpdateDomain`
- [ ] domain/low `handleValidateDomain`, `handleCreateDomain`, `handleCheckDomain`, `handleLockDomain`, `handleUpdateDomain`, `handleUnlockDomain`, `handleActivateDomain`, `handleDeleteDomain`
- [ ] function/high `handleCreateFunctionGroup`, `handleUpdateFunctionGroup`, `handleCreateFunctionModule`, `handleUpdateFunctionModule`
- [ ] function/low `handleValidateFunctionGroup`, `handleCreateFunctionGroup`, `handleCheckFunctionGroup`, `handleLockFunctionGroup`, `handleUpdateFunctionGroup`, `handleUnlockFunctionGroup`, `handleActivateFunctionGroup`, `handleDeleteFunctionGroup`, `handleValidateFunctionModule`, `handleCreateFunctionModule`, `handleCheckFunctionModule`, `handleLockFunctionModule`, `handleUpdateFunctionModule`, `handleUnlockFunctionModule`, `handleActivateFunctionModule`, `handleDeleteFunctionModule`
- [ ] include/readonly `handleGetInclude`, `handleGetIncludesList`
- [ ] interface/high `handleCreateInterface`, `handleUpdateInterface`
- [ ] interface/low `handleValidateInterface`, `handleCreateInterface`, `handleCheckInterface`, `handleLockInterface`, `handleUpdateInterface`, `handleUnlockInterface`, `handleActivateInterface`, `handleDeleteInterface`
- [ ] package/high `handleCreatePackage`
- [ ] package/low `handleValidatePackage`, `handleCreatePackage`, `handleCheckPackage`, `handleLockPackage`, `handleUpdatePackage`, `handleUnlockPackage`, `handleDeletePackage`
- [ ] program/high `handleCreateProgram`, `handleUpdateProgram`
- [ ] program/low `handleValidateProgram`, `handleCreateProgram`, `handleCheckProgram`, `handleLockProgram`, `handleUpdateProgram`, `handleUnlockProgram`, `handleActivateProgram`, `handleDeleteProgram`, `handleGetProgFullCode`
- [ ] search/readonly `handleSearchObject`, `handleGetObjectsList`, `handleGetObjectsByType`, `handleDescribeByList`
- [ ] service_definition/high `handleCreateServiceDefinition`, `handleUpdateServiceDefinition`
- [ ] service_definition/readonly `handleGetServiceDefinition`
- [ ] structure/high `handleCreateStructure`, `handleUpdateStructure`
- [ ] structure/low `handleValidateStructure`, `handleCreateStructure`, `handleCheckStructure`, `handleLockStructure`, `handleUpdateStructure`, `handleUnlockStructure`, `handleActivateStructure`, `handleDeleteStructure`
- [ ] system/readonly `handleGetSession`, `handleGetInactiveObjects`, `handleGetAbapAST`, `handleGetAbapSemanticAnalysis`, `handleGetAbapSystemSymbols`, `handleGetTypeInfo`, `handleGetTransaction`, `handleGetObjectInfo`, `handleGetObjectStructure`, `handleDescribeByList` (overlaps search), `handleGetSqlQuery`, `handleGetWhereUsed`, `handleGetAbapTypes` (GetAdtTypes)
- [ ] table/high `handleCreateTable`, `handleUpdateTable`
- [ ] table/low `handleValidateTable`, `handleCreateTable`, `handleCheckTable`, `handleLockTable`, `handleUpdateTable`, `handleUnlockTable`, `handleActivateTable`, `handleDeleteTable`
- [ ] table/readonly `handleGetTable`, `handleGetTableContents`
- [ ] transport/high `handleCreateTransport`
- [ ] transport/low `handleCreateTransport`
- [ ] view/high `handleCreateView`, `handleUpdateView`
- [ ] view/low `handleValidateView`, `handleCreateView`, `handleCheckView`, `handleLockView`, `handleUpdateView`, `handleUnlockView`, `handleActivateView`, `handleDeleteView`
- [ ] view/readonly `handleGetView`
- [ ] common/low `handleValidateObject`, `handleLockObject`, `handleUnlockObject`, `handleActivateObject`, `handleCheckObject`, `handleDeleteObject`
