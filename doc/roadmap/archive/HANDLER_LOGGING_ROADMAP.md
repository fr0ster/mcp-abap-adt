# Roadmap: Handler Logging via ILogger

## Goals
- Єдиний інтерфейс логування (`ILogger` з `@mcp-abap-adt/logger` / `@mcp-abap-adt/interfaces`) для всіх хендлерів.
- На старті серверу: інжектуємо логер або no-op. За замовчуванням мінімальний шум; при потребі вмикаємо розширений лог з рівнями/префіксами.
- У тестах: окремий логер з тегами (handler/object/step) для прозорого флоу (validate/create/lock/update/unlock/activate) і точок падіння.
- Опція за замовчуванням — мовчання: `DEBUG_HANDLERS=true` для хендлерів, `DEBUG_TESTS=true`/`DEBUG_ADT_TESTS=true` для тестів; окремі прапорці для брокера/провайдера/конектора.

## Tasks
- [x] Фабрика `getHandlerLogger` (рівень з env, `HANDLER_LOG_SILENT=true` → no-op, префікс категорії).
- [x] Класи: low/high на `getHandlerLogger` (opt-in через `DEBUG_HANDLERS`).
- [x] В’юхи: low/high на `getHandlerLogger` (opt-in через `DEBUG_HANDLERS`).
- [ ] Додати логери для брокера/провайдера/конектора (`DEBUG_BROKER`, `DEBUG_PROVIDER`, `DEBUG_CONNECTORS`).
- [ ] Узгодити решту хендлерів (behavior, data_element, table, program тощо) на `ILogger`; інжект через контекст/фабрику, no-op без прапорця.
- [ ] Тестове логування: `createTestHandlerLogger` з тегами, перемикачі `TEST_HANDLER_LOG_LEVEL`/`TEST_HANDLER_LOG_FILE`.
- [ ] Документація: як увімкнути серверне і тестове логування, приклади виводу.
- [ ] Опція: компактні кольорові префікси для grep.

## Handler Coverage (ILogger usage, opt-in via DEBUG_HANDLERS unless noted)
- [x] `class/low/handleValidateClass` — uses `getHandlerLogger('handleValidateClass', logger)`
- [x] behavior_definition/high `handleCreateBehaviorDefinition`, `handleUpdateBehaviorDefinition` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] behavior_definition/low `handleValidateBehaviorDefinition`, `handleCreateBehaviorDefinition`, `handleCheckBehaviorDefinition`, `handleLockBehaviorDefinition`, `handleUpdateBehaviorDefinition`, `handleUnlockBehaviorDefinition`, `handleActivateBehaviorDefinition`, `handleDeleteBehaviorDefinition` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] behavior_implementation/high `handleCreateBehaviorImplementation`, `handleUpdateBehaviorImplementation` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] behavior_implementation/low `handleValidateBehaviorImplementation`, `handleCreateBehaviorImplementation`, `handleLockBehaviorImplementation` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] class/high `handleCreateClass`, `handleUpdateClass` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] class/low `handleCreateClass` — uses `getHandlerLogger` with DEBUG_HANDLERS switch
- [x] class/low `handleCreateClass`, `handleUpdateClass`, `handleLockClass`, `handleUnlockClass`, `handleCheckClass`, `handleActivateClass`, `handleDeleteClass`, `handleRunClassUnitTests`, `handleGetClassUnitTestStatus`, `handleGetClassUnitTestResult`, `handleUpdateClassTestClasses`, `handleLockClassTestClasses`, `handleUnlockClassTestClasses`, `handleActivateClassTestClasses` — all use `getHandlerLogger` gated by `DEBUG_HANDLERS`
- [x] data_element/high `handleCreateDataElement`, `handleUpdateDataElement` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] data_element/low `handleValidateDataElement`, `handleCreateDataElement`, `handleCheckDataElement`, `handleLockDataElement`, `handleUpdateDataElement`, `handleUnlockDataElement`, `handleActivateDataElement`, `handleDeleteDataElement` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] ddlx/high `handleCreateMetadataExtension`, `handleUpdateMetadataExtension` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] ddlx/low `handleValidateMetadataExtension`, `handleCreateMetadataExtension`, `handleCheckMetadataExtension`, `handleLockMetadataExtension`, `handleUpdateMetadataExtension`, `handleUnlockMetadataExtension`, `handleActivateMetadataExtension`, `handleDeleteMetadataExtension` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] domain/high `handleCreateDomain`, `handleUpdateDomain` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] domain/low `handleValidateDomain`, `handleCreateDomain`, `handleCheckDomain`, `handleLockDomain`, `handleUpdateDomain`, `handleUnlockDomain`, `handleActivateDomain`, `handleDeleteDomain` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] function/high `handleCreateFunctionGroup`, `handleUpdateFunctionGroup`, `handleCreateFunctionModule`, `handleUpdateFunctionModule` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] function/low `handleValidateFunctionGroup`, `handleCreateFunctionGroup`, `handleCheckFunctionGroup`, `handleLockFunctionGroup`, `handleUnlockFunctionGroup`, `handleActivateFunctionGroup`, `handleDeleteFunctionGroup`, `handleValidateFunctionModule`, `handleCreateFunctionModule`, `handleCheckFunctionModule`, `handleLockFunctionModule`, `handleUpdateFunctionModule`, `handleUnlockFunctionModule`, `handleActivateFunctionModule`, `handleDeleteFunctionModule` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] include/readonly `handleGetInclude`, `handleGetIncludesList` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] interface/high `handleCreateInterface`, `handleUpdateInterface` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] interface/low `handleValidateInterface`, `handleCreateInterface`, `handleCheckInterface`, `handleLockInterface`, `handleUpdateInterface`, `handleUnlockInterface`, `handleActivateInterface`, `handleDeleteInterface` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] package/high `handleCreatePackage` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] package/low `handleValidatePackage`, `handleCreatePackage`, `handleCheckPackage`, `handleLockPackage`, `handleUpdatePackage`, `handleUnlockPackage`, `handleDeletePackage` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] program/high `handleCreateProgram`, `handleUpdateProgram` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] program/low `handleValidateProgram`, `handleCreateProgram`, `handleCheckProgram`, `handleLockProgram`, `handleUpdateProgram`, `handleUnlockProgram`, `handleActivateProgram`, `handleDeleteProgram`, `handleGetProgFullCode` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] search/readonly `handleSearchObject`, `handleGetObjectsList`, `handleGetObjectsByType`, `handleDescribeByList`
- [x] service_definition/high `handleCreateServiceDefinition`, `handleUpdateServiceDefinition` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] service_definition/readonly `handleGetServiceDefinition` — uses `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] structure/high `handleCreateStructure`, `handleUpdateStructure` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS; connector logging via DEBUG_CONNECTORS)
- [x] structure/low `handleValidateStructure`, `handleCreateStructure`, `handleCheckStructure`, `handleLockStructure`, `handleUpdateStructure`, `handleUnlockStructure`, `handleActivateStructure`, `handleDeleteStructure` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] system/readonly `handleGetSession`, `handleGetInactiveObjects`, `handleGetAbapAST`, `handleGetAbapSemanticAnalysis`, `handleGetAbapSystemSymbols`, `handleGetTypeInfo`, `handleGetTransaction`, `handleGetObjectInfo`, `handleGetObjectStructure`, `handleDescribeByList` (overlaps search), `handleGetSqlQuery`, `handleGetWhereUsed`, `handleGetAbapTypes` (GetAdtTypes) — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] table/high `handleCreateTable`, `handleUpdateTable` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS; connector logging via DEBUG_CONNECTORS)
- [x] table/low `handleValidateTable`, `handleCreateTable`, `handleCheckTable`, `handleLockTable`, `handleUpdateTable`, `handleUnlockTable`, `handleActivateTable`, `handleDeleteTable` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] table/readonly `handleGetTableContents` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS); `handleGetTable` has no logging (n/a)
- [x] transport/high `handleCreateTransport` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] transport/low `handleCreateTransport` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] view/high `handleCreateView`, `handleUpdateView` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] view/low `handleValidateView`, `handleCreateView`, `handleCheckView`, `handleLockView`, `handleUpdateView`, `handleUnlockView`, `handleActivateView`, `handleDeleteView` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] view/readonly `handleGetView` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)
- [x] common/low `handleValidateObject`, `handleLockObject`, `handleUnlockObject`, `handleActivateObject`, `handleCheckObject`, `handleDeleteObject` — refactored to `getHandlerLogger` (opt-in via DEBUG_HANDLERS)

## System/readonly migration checklist (done)
- [x] handleGetSession
- [x] handleGetInactiveObjects
- [x] handleGetAbapAST
- [x] handleGetAbapSemanticAnalysis
- [x] handleGetAbapSystemSymbols
- [x] handleGetTypeInfo
- [x] handleGetTransaction
- [x] handleGetObjectInfo
- [x] handleGetObjectStructure
- [x] handleDescribeByList
- [x] handleGetSqlQuery
- [x] handleGetWhereUsed
- [x] handleGetAbapTypes / handleGetAllTypes
## Latest test run (integration/view)
- Status: PASS. Suites: 2/2. Tests: 2/2.
- Notes: `ViewLowHandlers` skipped when no config/test case; `ViewHighHandlers` passed.
