# Tool inventory — rows

One row per **(tool, group)** pair, produced entirely by `scripts/list-tools.ts` and
`scripts/tool-provenance.ts`. Both scripts are committed alongside this document; re-run
them to check any cell below. Neither contacts SAP.

```bash
npx tsx scripts/list-tools.ts > /tmp/tools.json 2>/tmp/list-tools.stderr
npx tsx scripts/tool-provenance.ts > /tmp/provenance.json
```

This document holds only the four columns a script can fill: tool, group, implementation
files, visible in, current inputs. The other eight columns (output, transformation, error
decision, guarantees, the proposed projection, etc.) are Task 1b's — they require reading
each handler and are intentionally absent, not blank, from this document.

## Totals

- **362 rows**, one per (tool, group) pair — reproduced by `scripts/list-tools.ts`.
- **362 distinct names** — no tool name is registered by more than one group.
- **348 rows placed by provenance tiers 1–2** (an exported `TOOL_DEFINITION`, or a
  zero-argument `build*` factory called directly) — reproduced by
  `scripts/tool-provenance.ts`.
- **14 rows placed by tier 3** — the high-level `Activate*` renames, resolved by hand from
  `HighLevelHandlersGroup.ts` (see below).
- **27 rows from `src/handlers/common/high/objectVersionTools.ts`** — the
  `buildObjectVersionTools()` factory, one row per (Versions, VersionSource, VersionDiff)
  triple across the nine versioned types.

These four numbers match the plan (`task-1a-brief.md`) exactly, reproduced on `main` on
2026-09-09. No disagreement to record for the totals themselves — see **Findings** below for
two places where the run *does* disagree with the brief's prose.

## Six-mode matrix

`HandlerSet` is `'readonly' | 'high' | 'low' | 'compact'`
(`src/lib/config/IServerConfig.ts:22`). `validateExposition`
(`src/lib/config/validateExposition.ts`) rejects exactly two combinations — `compact` with
anything else, and `high` together with `low` — which leaves six combinations the CLI
launcher (`src/server/launcher.ts:203-241`) actually accepts. Reproduced by the second half
of `scripts/list-tools.ts` (the `EXPOSITIONS` loop), which mirrors the launcher: overriding
groups (`high`/`low`/`compact`) built first, their tool names fed into
`ReadOnlyHandlersGroup`'s dedup strategy, `SystemHandlersGroup` added only alongside
`readonly`, `SearchHandlersGroup` always added.

| exposition | tools | composition |
|---|---|---|
| `readonly` | 68 | readonly 34/34 + system 30 + search 4 |
| `high` | 160 | high 156 + search 4 |
| `low` | 120 | low 116 + search 4 |
| `readonly,high` *(default)* | 206 | readonly 16/34 + system 30 + high 156 + search 4 |
| `readonly,low` | 184 | readonly 34/34 + system 30 + low 116 + search 4 |
| `compact` | 26 | compact 22 + search 4 |

All six numbers reproduce the brief exactly. Under `readonly,high`, eighteen of the
thirty-four read-only tools are **suppressed by the dedup strategy** (a `Get<X>` counterpart
is exposed by `high`), not absent from the group — the same tool would be visible again under
`readonly,low`. Under standalone `high`, `low` and `compact`, the read-only group is never
constructed at all, so all thirty-four read-only tools and all thirty system tools are simply
absent, for a different reason. `search` is the only group present in every one of the six
modes (`GetObjectsByType`, `GetObjectsList`, and two more — see the table).

No row is visible in **zero** of the six modes; that would have been a finding (a row nobody
can reach through the CLI) but did not occur on this run.

## Findings

### From Step 1 — the three edges named in the brief

- **Empty exposition.** `validateExposition([])` does not throw (no `compact`, no
  `high`+`low` present), and in `launcher.ts:204`,
  `config.exposition || ['readonly', 'high']` does **not** fall back when
  `config.exposition` is `[]`, because an empty array is truthy in JavaScript — the `||`
  keeps the left side. An empty exposition therefore survives and starts a server exposing
  only the four `search` tools. Confirmed by reading `launcher.ts` and
  `validateExposition.ts` directly. Note: `ServerConfigManager.parseExposition()`
  (`src/lib/config/ServerConfigManager.ts:131`) already defaults an empty CLI-parsed
  exposition to `['readonly', 'high']` before it reaches `IServerConfig`, so this edge is
  reachable only through a config path that sets `exposition: []` directly (e.g. a config
  file or programmatic construction), not through normal CLI parsing.
- **CLI help advertises a rejected combination.** `ServerConfigManager.getHandlerSetsDescription()`
  (`src/lib/config/ServerConfigManager.ts:239-245`) prints
  `--exposition=readonly,high,low (all handlers)` as a usage example. `validateExposition`
  rejects `high` together with `low` unconditionally, so this example throws if run
  verbatim. The help text is wrong; recorded here, not corrected, per the brief's scope for
  this task.
- **`EmbeddableMcpServer` follows different rules than the CLI launcher**
  (`src/server/EmbeddableMcpServer.ts`). Its exposition vocabulary additionally accepts
  `'system'` and `'search'` as explicit opt-ins (lines 53-60), and it never calls
  `validateExposition` — so it accepts combinations (e.g. `high`+`low`) the CLI launcher
  rejects. The matrix above describes the CLI launcher only; `EmbeddableMcpServer`'s
  combinations are not enumerated here, per the brief.

  **Correction to the brief's claim about `readOnlyDedupStrategy`:** the brief states that
  "its `readOnlyDedupStrategy` may be omitted, in which case `overridingToolNames` stays
  empty and nothing is suppressed." Reading `createDefaultRegistry`
  (`EmbeddableMcpServer.ts:165-224`) shows this is not the current behaviour:
  `readOnlyDedupStrategy: IReadOnlyDedupStrategy = new ReadVsGetDedupStrategy()` is a
  parameter *default*, which JavaScript/TypeScript applies whenever the argument is
  `undefined` — which is exactly what `options.readOnlyDedupStrategy` is when the caller
  omits it. So an omitted `readOnlyDedupStrategy` still resolves to a live
  `ReadVsGetDedupStrategy` instance, and `if (readOnlyDedupStrategy)` (line 198) is truthy,
  and suppression still runs. The only way to reach the "nothing suppressed" state the brief
  describes is to pass `readOnlyDedupStrategy: null` **explicitly** — a literal `null`
  bypasses the default parameter, where an omitted property (which evaluates to `undefined`)
  does not. This is a disagreement with the brief's prose, not with any of its numbers; noted
  per the task instruction that a run disagreeing with the plan is right and the disagreement
  belongs here.

### Names a group registers that the provenance tiers could not place

None, once tier 3 (the fourteen `Activate*` high-level renames) is added by hand. Empty, as
the brief expected.

### Files with a `TOOL_DEFINITION` whose tools no group registers

**Not empty — this disagrees with the brief, which expected this list to be empty on `main`
today.** `scripts/tool-provenance.ts` resolves 353 distinct names via tiers 1–2 (from
scanning every `.ts` file under `src/handlers`), but only 348 of those names are among the
362 tools actually registered by a group. The other five are real `TOOL_DEFINITION` exports
that no `HandlerGroup` references:

| name | file |
|---|---|
| `CheckObjectLow` | `src/handlers/common/low/handleCheckObject.ts` |
| `DeleteObjectLow` | `src/handlers/common/low/handleDeleteObject.ts` |
| `LockObjectLow` | `src/handlers/common/low/handleLockObject.ts` |
| `UnlockObjectLow` | `src/handlers/common/low/handleUnlockObject.ts` |
| `ValidateObjectLow` | `src/handlers/common/low/handleValidateObject.ts` |

Confirmed by reading `src/lib/handlers/groups/LowLevelHandlersGroup.ts`: the imports and
handler-entry blocks for all five are present but **commented out**
(`LowLevelHandlersGroup.ts:5-9, 142-146, ~300-333`) — these are dead, deliberately disabled
handlers, not an enumeration gap. They contribute no rows to the table below since no group
registers them; `grep -rl 'TOOL_DEFINITION' src/handlers --include='*.ts' | wc -l` still
reports 327 files (matching the brief), because the file count was never meant as a bound on
the 362 — see the brief's own caveat about that number.

### The file-count sanity check

`grep -rl 'TOOL_DEFINITION' src/handlers --include='*.ts' | wc -l` → **327**, matching the
brief. This is not a bound on the 362 (factories push the tool count above the file count;
the five dead handlers above push it below, and the two effects don't cancel) — used here
only to corroborate the dead-handler finding above.

## Table

362 rows. `*` after a property name in "current inputs" marks it required
(`inputSchema.required`). "visible in" lists only the six CLI-launcher expositions that
include this (tool, group) row; a tool visible under a different group's row (e.g. a
`readonly` row suppressed by dedup while its `high` sibling is exposed) is listed on that
sibling's own row, not here.

| tool | group | implementation files | visible in | current inputs |
|---|---|---|---|---|
| ActivateBehaviorDefinition | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/behavior_definition/low/handleActivateBehaviorDefinition.ts` | high, readonly,high | name*, session_id, session_state |
| ActivateBehaviorDefinitionLow | low | `src/handlers/behavior_definition/low/handleActivateBehaviorDefinition.ts` | low, readonly,low | name*, session_id, session_state |
| ActivateClass | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/class/low/handleActivateClass.ts` | high, readonly,high | class_name*, session_id, session_state |
| ActivateClassLow | low | `src/handlers/class/low/handleActivateClass.ts` | low, readonly,low | class_name*, session_id, session_state |
| ActivateClassTestClassesLow | low | `src/handlers/class/low/handleActivateClassTestClasses.ts` | low, readonly,low | class_name*, test_class_name, session_id, session_state |
| ActivateDataElement | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/data_element/low/handleActivateDataElement.ts` | high, readonly,high | data_element_name*, session_id, session_state |
| ActivateDataElementLow | low | `src/handlers/data_element/low/handleActivateDataElement.ts` | low, readonly,low | data_element_name*, session_id, session_state |
| ActivateDdl | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/ddl/low/handleActivateDdl.ts` | high, readonly,high | ddl_name*, session_id, session_state |
| ActivateDdlLow | low | `src/handlers/ddl/low/handleActivateDdl.ts` | low, readonly,low | ddl_name*, session_id, session_state |
| ActivateDomain | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/domain/low/handleActivateDomain.ts` | high, readonly,high | domain_name*, session_id, session_state |
| ActivateDomainLow | low | `src/handlers/domain/low/handleActivateDomain.ts` | low, readonly,low | domain_name*, session_id, session_state |
| ActivateFunctionGroup | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/function/low/handleActivateFunctionGroup.ts` | high, readonly,high | function_group_name*, session_id, session_state |
| ActivateFunctionGroupLow | low | `src/handlers/function/low/handleActivateFunctionGroup.ts` | low, readonly,low | function_group_name*, session_id, session_state |
| ActivateFunctionModule | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/function/low/handleActivateFunctionModule.ts` | high, readonly,high | function_module_name*, function_group_name*, session_id, session_state |
| ActivateFunctionModuleLow | low | `src/handlers/function/low/handleActivateFunctionModule.ts` | low, readonly,low | function_module_name*, function_group_name*, session_id, session_state |
| ActivateInterface | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/interface/low/handleActivateInterface.ts` | high, readonly,high | interface_name*, session_id, session_state |
| ActivateInterfaceLow | low | `src/handlers/interface/low/handleActivateInterface.ts` | low, readonly,low | interface_name*, session_id, session_state |
| ActivateMetadataExtension | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/ddlx/low/handleActivateMetadataExtension.ts` | high, readonly,high | name*, session_id, session_state |
| ActivateMetadataExtensionLow | low | `src/handlers/ddlx/low/handleActivateMetadataExtension.ts` | low, readonly,low | name*, session_id, session_state |
| ActivateObjectLow | low | `src/handlers/common/low/handleActivateObject.ts` | low, readonly,low | objects*, preaudit |
| ActivateObjects | high | `src/handlers/common/high/handleActivateObjects.ts` | high, readonly,high | objects*, preaudit |
| ActivateProgram | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/program/low/handleActivateProgram.ts` | high, readonly,high | program_name*, session_id, session_state |
| ActivateProgramLow | low | `src/handlers/program/low/handleActivateProgram.ts` | low, readonly,low | program_name*, session_id, session_state |
| ActivateServiceBinding | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/service_binding/low/handleActivateServiceBinding.ts` | high, readonly,high | name*, session_id, session_state |
| ActivateServiceBindingLow | low | `src/handlers/service_binding/low/handleActivateServiceBinding.ts` | low, readonly,low | name*, session_id, session_state |
| ActivateServiceDefinition | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/service_definition/low/handleActivateServiceDefinition.ts` | high, readonly,high | name*, session_id, session_state |
| ActivateServiceDefinitionLow | low | `src/handlers/service_definition/low/handleActivateServiceDefinition.ts` | low, readonly,low | name*, session_id, session_state |
| ActivateStructure | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/structure/low/handleActivateStructure.ts` | high, readonly,high | structure_name*, session_id, session_state |
| ActivateStructureLow | low | `src/handlers/structure/low/handleActivateStructure.ts` | low, readonly,low | structure_name*, session_id, session_state |
| ActivateTable | high | `src/lib/handlers/groups/HighLevelHandlersGroup.ts`, `src/handlers/table/low/handleActivateTable.ts` | high, readonly,high | table_name*, session_id, session_state |
| ActivateTableLow | low | `src/handlers/table/low/handleActivateTable.ts` | low, readonly,low | table_name*, session_id, session_state |
| CheckBdefLow | low | `src/handlers/behavior_definition/low/handleCheckBehaviorDefinition.ts` | low, readonly,low | name*, session_id, session_state |
| CheckBehaviorDefinition | high | `src/handlers/behavior_definition/high/handleCheckBehaviorDefinition.ts` | high, readonly,high | name* |
| CheckClass | high | `src/handlers/class/high/handleCheckClass.ts` | high, readonly,high | class_name*, version, source_code |
| CheckClassLow | low | `src/handlers/class/low/handleCheckClass.ts` | low, readonly,low | class_name*, version, source_code, session_id, session_state |
| CheckDataElement | high | `src/handlers/data_element/high/handleCheckDataElement.ts` | high, readonly,high | data_element_name* |
| CheckDataElementLow | low | `src/handlers/data_element/low/handleCheckDataElement.ts` | low, readonly,low | data_element_name*, session_id, session_state |
| CheckDdl | high | `src/handlers/ddl/high/handleCheckDdl.ts` | high, readonly,high | ddl_name*, version, ddl_source |
| CheckDdlLow | low | `src/handlers/ddl/low/handleCheckDdl.ts` | low, readonly,low | ddl_name*, ddl_source, version, session_id, session_state |
| CheckDomain | high | `src/handlers/domain/high/handleCheckDomain.ts` | high, readonly,high | domain_name* |
| CheckDomainLow | low | `src/handlers/domain/low/handleCheckDomain.ts` | low, readonly,low | domain_name*, session_id, session_state |
| CheckFunctionGroup | high | `src/handlers/function/high/handleCheckFunctionGroup.ts` | high, readonly,high | function_group_name* |
| CheckFunctionGroupLow | low | `src/handlers/function/low/handleCheckFunctionGroup.ts` | low, readonly,low | function_group_name*, session_id, session_state |
| CheckFunctionModule | high | `src/handlers/function/high/handleCheckFunctionModule.ts` | high, readonly,high | function_group_name*, function_module_name*, version |
| CheckFunctionModuleLow | low | `src/handlers/function/low/handleCheckFunctionModule.ts` | low, readonly,low | function_group_name*, function_module_name*, version, session_id, session_state |
| CheckInterface | high | `src/handlers/interface/high/handleCheckInterface.ts` | high, readonly,high | interface_name* |
| CheckInterfaceLow | low | `src/handlers/interface/low/handleCheckInterface.ts` | low, readonly,low | interface_name*, session_id, session_state |
| CheckMetadataExtension | high | `src/handlers/ddlx/high/handleCheckMetadataExtension.ts` | high, readonly,high | name* |
| CheckMetadataExtensionLow | low | `src/handlers/ddlx/low/handleCheckMetadataExtension.ts` | low, readonly,low | name*, session_id, session_state |
| CheckPackage | high | `src/handlers/package/high/handleCheckPackage.ts` | high, readonly,high | package_name*, super_package* |
| CheckPackageLow | low | `src/handlers/package/low/handleCheckPackage.ts` | low, readonly,low | package_name*, super_package*, session_id, session_state |
| CheckProgram | high | `src/handlers/program/high/handleCheckProgram.ts` | high, readonly,high | program_name* |
| CheckProgramLow | low | `src/handlers/program/low/handleCheckProgram.ts` | low, readonly,low | program_name*, session_id, session_state |
| CheckStructure | high | `src/handlers/structure/high/handleCheckStructure.ts` | high, readonly,high | structure_name*, version, ddl_code |
| CheckStructureLow | low | `src/handlers/structure/low/handleCheckStructure.ts` | low, readonly,low | structure_name*, ddl_code, version, session_id, session_state |
| CheckTable | high | `src/handlers/table/high/handleCheckTable.ts` | high, readonly,high | table_name*, version, ddl_code |
| CheckTableLow | low | `src/handlers/table/low/handleCheckTable.ts` | low, readonly,low | table_name*, ddl_code, version, reporter, session_id, session_state |
| CreateBehaviorDefinition | high | `src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts` | high, readonly,high | name*, description, package_name*, transport_request, root_entity*, implementation_type*, activate, master_language |
| CreateBehaviorDefinitionLow | low | `src/handlers/behavior_definition/low/handleCreateBehaviorDefinition.ts` | low, readonly,low | name*, description*, package_name*, transport_request, root_entity*, implementation_type*, session_id, session_state |
| CreateBehaviorImplementation | high | `src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts` | high, readonly,high | class_name*, behavior_definition*, description, package_name*, transport_request |
| CreateBehaviorImplementationLow | low | `src/handlers/behavior_implementation/low/handleCreateBehaviorImplementation.ts` | low, readonly,low | class_name*, behavior_definition*, description*, package_name*, transport_request, implementation_code, session_id, session_state |
| CreateCdsUnitTest | high | `src/handlers/unit_test/high/handleCreateCdsUnitTest.ts` | high, readonly,high | class_name*, package_name*, cds_view_name*, description, transport_request |
| CreateClass | high | `src/handlers/class/high/handleCreateClass.ts` | high, readonly,high | class_name*, description, package_name*, transport_request, superclass, final, abstract, create_protected, master_language |
| CreateClassLow | low | `src/handlers/class/low/handleCreateClass.ts` | low, readonly,low | class_name*, description*, package_name*, transport_request, superclass, final, abstract, create_protected, session_id, session_state |
| CreateDataElement | high | `src/handlers/data_element/high/handleCreateDataElement.ts` | high, readonly,high | data_element_name*, description, package_name*, transport_request, data_type, length, decimals, short_label, medium_label, long_label, heading_label, type_kind, type_name, search_help, search_help_parameter, set_get_parameter, master_language |
| CreateDataElementLow | low | `src/handlers/data_element/low/handleCreateDataElement.ts` | low, readonly,low | data_element_name*, description*, package_name*, transport_request, data_type, type_kind, type_name, length, decimals, session_id, session_state |
| CreateDdl | high | `src/handlers/ddl/high/handleCreateDdl.ts` | high, readonly,high | ddl_name*, package_name*, transport_request, description, master_language |
| CreateDdlLow | low | `src/handlers/ddl/low/handleCreateDdl.ts` | low, readonly,low | ddl_name*, description*, package_name*, transport_request, application, session_id, session_state |
| CreateDomain | high | `src/handlers/domain/high/handleCreateDomain.ts` | high, readonly,high | domain_name*, description, package_name, transport_request, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, activate, fixed_values, master_language |
| CreateDomainLow | low | `src/handlers/domain/low/handleCreateDomain.ts` | low, readonly,low | domain_name*, description*, package_name*, transport_request, session_id, session_state |
| CreateFunctionGroup | high | `src/handlers/function/high/handleCreateFunctionGroup.ts` | high, readonly,high | function_group_name*, description, package_name*, transport_request, activate, master_language |
| CreateFunctionGroupLow | low | `src/handlers/function/low/handleCreateFunctionGroup.ts` | low, readonly,low | function_group_name*, description*, package_name*, transport_request, session_id, session_state |
| CreateFunctionInclude | high | `src/handlers/function_include/high/handleCreateFunctionInclude.ts` | high, readonly,high | function_group_name*, include_name*, description, transport_request |
| CreateFunctionModule | high | `src/handlers/function/high/handleCreateFunctionModule.ts` | high, readonly,high | function_group_name*, function_module_name*, description, transport_request |
| CreateFunctionModuleLow | low | `src/handlers/function/low/handleCreateFunctionModule.ts` | low, readonly,low | function_module_name*, function_group_name*, description*, package_name*, transport_request, session_id, session_state |
| CreateInterface | high | `src/handlers/interface/high/handleCreateInterface.ts` | high, readonly,high | interface_name*, description, package_name*, transport_request, master_language |
| CreateInterfaceLow | low | `src/handlers/interface/low/handleCreateInterface.ts` | low, readonly,low | interface_name*, description*, package_name*, transport_request, session_id, session_state |
| CreateMessageClass | high | `src/handlers/message_class/high/handleCreateMessageClass.ts` | high, readonly,high | message_class_name*, description, package_name*, transport_request, master_language |
| CreateMessageClassMessage | high | `src/handlers/message_class/high/handleCreateMessageClassMessage.ts` | high, readonly,high | message_class_name*, msgno*, msgtext*, self_explanatory, description, transport_request |
| CreateMetadataExtension | high | `src/handlers/ddlx/high/handleCreateMetadataExtension.ts` | high, readonly,high | name*, description, package_name*, transport_request, activate, master_language |
| CreateMetadataExtensionLow | low | `src/handlers/ddlx/low/handleCreateMetadataExtension.ts` | low, readonly,low | name*, description*, package_name*, transport_request, master_language, session_id, session_state |
| CreatePackage | high | `src/handlers/package/high/handleCreatePackage.ts` | high, readonly,high | (none) |
| CreatePackageLow | low | `src/handlers/package/low/handleCreatePackage.ts` | low, readonly,low | package_name*, super_package*, description*, package_type, software_component, transport_layer, transport_request, record_changes, application_component, session_id, session_state |
| CreateProgram | high | `src/handlers/program/high/handleCreateProgram.ts` | high, readonly,high | program_name*, description, package_name*, transport_request, program_type, application, master_language |
| CreateProgramLow | low | `src/handlers/program/low/handleCreateProgram.ts` | low, readonly,low | program_name*, description*, package_name*, transport_request, program_type, application, session_id, session_state |
| CreateServiceBinding | high | `src/handlers/service_binding/high/handleCreateServiceBinding.ts` | high, readonly,high | service_binding_name*, service_definition_name*, package_name*, description, binding_variant, service_name, service_version, transport_request, activate, response_format, master_language |
| CreateServiceDefinition | high | `src/handlers/service_definition/high/handleCreateServiceDefinition.ts` | high, readonly,high | service_definition_name*, description, package_name*, transport_request, source_code, activate, master_language |
| CreateStructure | high | `src/handlers/structure/high/handleCreateStructure.ts` | high, readonly,high | structure_name*, description, package_name*, transport_request, fields*, includes, activate, master_language |
| CreateStructureLow | low | `src/handlers/structure/low/handleCreateStructure.ts` | low, readonly,low | structure_name*, description*, package_name*, transport_request, structure_type, application, session_id, session_state |
| CreateTable | high | `src/handlers/table/high/handleCreateTable.ts` | high, readonly,high | table_name*, description, package_name*, transport_request, master_language |
| CreateTableLow | low | `src/handlers/table/low/handleCreateTable.ts` | low, readonly,low | table_name*, package_name*, transport_request, session_id, session_state |
| CreateTransport | high | `src/handlers/transport/high/handleCreateTransport.ts` | high, readonly,high | transport_type, description*, target_system, owner |
| CreateTransportLow | low | `src/handlers/transport/low/handleCreateTransport.ts` | low, readonly,low | description*, transport_type |
| CreateUnitTest | high | `src/handlers/unit_test/high/handleCreateUnitTest.ts` | high, readonly,high | tests*, title, context, scope, risk_level, duration |
| DeleteBehaviorDefinition | high | `src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts` | high, readonly,high | behavior_definition_name*, transport_request |
| DeleteBehaviorDefinitionLow | low | `src/handlers/behavior_definition/low/handleDeleteBehaviorDefinition.ts` | low, readonly,low | name*, transport_request |
| DeleteBehaviorImplementation | high | `src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts` | high, readonly,high | behavior_implementation_name*, transport_request |
| DeleteCdsUnitTest | high | `src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts` | high, readonly,high | class_name*, transport_request |
| DeleteClass | high | `src/handlers/class/high/handleDeleteClass.ts` | high, readonly,high | class_name*, transport_request |
| DeleteClassLow | low | `src/handlers/class/low/handleDeleteClass.ts` | low, readonly,low | class_name*, transport_request |
| DeleteDataElement | high | `src/handlers/data_element/high/handleDeleteDataElement.ts` | high, readonly,high | data_element_name*, transport_request |
| DeleteDataElementLow | low | `src/handlers/data_element/low/handleDeleteDataElement.ts` | low, readonly,low | data_element_name*, transport_request |
| DeleteDdl | high | `src/handlers/ddl/high/handleDeleteDdl.ts` | high, readonly,high | ddl_name*, transport_request |
| DeleteDdlLow | low | `src/handlers/ddl/low/handleDeleteDdl.ts` | low, readonly,low | ddl_name*, transport_request |
| DeleteDomain | high | `src/handlers/domain/high/handleDeleteDomain.ts` | high, readonly,high | domain_name*, transport_request |
| DeleteDomainLow | low | `src/handlers/domain/low/handleDeleteDomain.ts` | low, readonly,low | domain_name*, transport_request |
| DeleteFunctionGroup | high | `src/handlers/function_group/high/handleDeleteFunctionGroup.ts` | high, readonly,high | function_group_name*, transport_request |
| DeleteFunctionGroupLow | low | `src/handlers/function/low/handleDeleteFunctionGroup.ts` | low, readonly,low | function_group_name*, transport_request |
| DeleteFunctionInclude | high | `src/handlers/function_include/high/handleDeleteFunctionInclude.ts` | high, readonly,high | function_group_name*, include_name*, transport_request |
| DeleteFunctionModule | high | `src/handlers/function_module/high/handleDeleteFunctionModule.ts` | high, readonly,high | function_module_name*, function_group_name*, transport_request |
| DeleteFunctionModuleLow | low | `src/handlers/function/low/handleDeleteFunctionModule.ts` | low, readonly,low | function_module_name*, function_group_name*, transport_request |
| DeleteInterface | high | `src/handlers/interface/high/handleDeleteInterface.ts` | high, readonly,high | interface_name*, transport_request |
| DeleteInterfaceLow | low | `src/handlers/interface/low/handleDeleteInterface.ts` | low, readonly,low | interface_name*, transport_request |
| DeleteLocalDefinitions | high | `src/handlers/class/high/handleDeleteLocalDefinitions.ts` | high, readonly,high | class_name*, transport_request, activate_on_delete |
| DeleteLocalMacros | high | `src/handlers/class/high/handleDeleteLocalMacros.ts` | high, readonly,high | class_name*, transport_request, activate_on_delete |
| DeleteLocalTestClass | high | `src/handlers/class/high/handleDeleteLocalTestClass.ts` | high, readonly,high | class_name*, transport_request, activate_on_delete |
| DeleteLocalTypes | high | `src/handlers/class/high/handleDeleteLocalTypes.ts` | high, readonly,high | class_name*, transport_request, activate_on_delete |
| DeleteMessageClass | high | `src/handlers/message_class/high/handleDeleteMessageClass.ts` | high, readonly,high | message_class_name*, transport_request |
| DeleteMessageClassMessage | high | `src/handlers/message_class/high/handleDeleteMessageClassMessage.ts` | high, readonly,high | message_class_name*, msgno*, transport_request |
| DeleteMetadataExtension | high | `src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts` | high, readonly,high | metadata_extension_name*, transport_request |
| DeleteMetadataExtensionLow | low | `src/handlers/ddlx/low/handleDeleteMetadataExtension.ts` | low, readonly,low | name*, transport_request |
| DeletePackageLow | low | `src/handlers/package/low/handleDeletePackage.ts` | low, readonly,low | package_name*, transport_request, force_new_connection, connection_config |
| DeleteProgram | high | `src/handlers/program/high/handleDeleteProgram.ts` | high, readonly,high | program_name*, transport_request |
| DeleteProgramLow | low | `src/handlers/program/low/handleDeleteProgram.ts` | low, readonly,low | program_name*, transport_request |
| DeleteServiceBinding | high | `src/handlers/service_binding/high/handleDeleteServiceBinding.ts` | high, readonly,high | service_binding_name*, transport_request, response_format |
| DeleteServiceDefinition | high | `src/handlers/service_definition/high/handleDeleteServiceDefinition.ts` | high, readonly,high | service_definition_name*, transport_request |
| DeleteStructure | high | `src/handlers/structure/high/handleDeleteStructure.ts` | high, readonly,high | structure_name*, transport_request |
| DeleteStructureLow | low | `src/handlers/structure/low/handleDeleteStructure.ts` | low, readonly,low | structure_name*, transport_request |
| DeleteTable | high | `src/handlers/table/high/handleDeleteTable.ts` | high, readonly,high | table_name*, transport_request |
| DeleteTableLow | low | `src/handlers/table/low/handleDeleteTable.ts` | low, readonly,low | table_name*, transport_request |
| DeleteUnitTest | high | `src/handlers/unit_test/high/handleDeleteUnitTest.ts` | high, readonly,high | run_id* |
| DescribeByList | system | `src/handlers/system/readonly/handleDescribeByList.ts` | readonly, readonly,high, readonly,low | objects* |
| GetAbapAST | system | `src/handlers/system/readonly/handleGetAbapAST.ts` | readonly, readonly,high, readonly,low | code* |
| GetAbapSemanticAnalysis | system | `src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts` | readonly, readonly,high, readonly,low | code* |
| GetAbapSystemSymbols | system | `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts` | readonly, readonly,high, readonly,low | code* |
| GetAdtTypes | system | `src/handlers/system/readonly/handleGetAllTypes.ts` | readonly, readonly,high, readonly,low | validate_type |
| GetBehaviorDefinition | high | `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts` | high, readonly,high | behavior_definition_name*, version |
| GetBehaviorDefinitionVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetBehaviorDefinitionVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | behavior_definition_name* |
| GetBehaviorDefinitionVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetBehaviorImplementation | high | `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts` | high, readonly,high | behavior_implementation_name*, version |
| GetCdsUnitTest | high | `src/handlers/unit_test/high/handleGetCdsUnitTest.ts` | high, readonly,high | run_id* |
| GetCdsUnitTestResult | high | `src/handlers/unit_test/high/handleGetCdsUnitTestResult.ts` | high, readonly,high | run_id*, with_navigation_uris, format |
| GetCdsUnitTestStatus | high | `src/handlers/unit_test/high/handleGetCdsUnitTestStatus.ts` | high, readonly,high | run_id*, with_long_polling |
| GetClass | high | `src/handlers/class/high/handleGetClass.ts` | high, readonly,high | class_name*, version |
| GetClassUnitTestResultLow | low | `src/handlers/class/low/handleGetClassUnitTestResult.ts` | low, readonly,low | run_id*, with_navigation_uris, format, session_id, session_state |
| GetClassUnitTestStatusLow | low | `src/handlers/class/low/handleGetClassUnitTestStatus.ts` | low, readonly,low | run_id*, with_long_polling, session_id, session_state |
| GetClassVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetClassVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | class_name* |
| GetClassVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetDataElement | high | `src/handlers/data_element/high/handleGetDataElement.ts` | high, readonly,high | data_element_name*, version |
| GetDdl | high | `src/handlers/ddl/high/handleGetDdl.ts` | high, readonly,high | ddl_name*, version |
| GetDdlVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetDdlVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | ddl_name* |
| GetDdlVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetDomain | high | `src/handlers/domain/high/handleGetDomain.ts` | high, readonly,high | domain_name*, version |
| GetEnhancementImpl | readonly | `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts` | readonly, readonly,high, readonly,low | enhancement_spot*, enhancement_name* |
| GetEnhancements | readonly | `src/handlers/enhancement/readonly/handleGetEnhancements.ts` | readonly, readonly,high, readonly,low | object_name*, object_type* |
| GetEnhancementSpot | readonly | `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts` | readonly, readonly,high, readonly,low | enhancement_spot* |
| GetFunctionGroup | high | `src/handlers/function_group/high/handleGetFunctionGroup.ts` | high, readonly,high | function_group_name*, version |
| GetFunctionModule | high | `src/handlers/function_module/high/handleGetFunctionModule.ts` | high, readonly,high | function_module_name*, function_group_name*, version |
| GetFunctionModuleVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetFunctionModuleVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | function_module_name*, function_group_name* |
| GetFunctionModuleVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetInactiveObjects | system | `src/handlers/system/readonly/handleGetInactiveObjects.ts` | readonly, readonly,high, readonly,low | (none) |
| GetInclude | readonly | `src/handlers/include/readonly/handleGetInclude.ts` | readonly, readonly,high, readonly,low | (none) |
| GetIncludesList | readonly | `src/handlers/include/readonly/handleGetIncludesList.ts` | readonly, readonly,high, readonly,low | object_name*, object_type*, detailed, timeout |
| GetInterface | high | `src/handlers/interface/high/handleGetInterface.ts` | high, readonly,high | interface_name*, version |
| GetInterfaceVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetInterfaceVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | interface_name* |
| GetInterfaceVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetLocalDefinitions | high | `src/handlers/class/high/handleGetLocalDefinitions.ts` | high, readonly,high | class_name*, version |
| GetLocalMacros | high | `src/handlers/class/high/handleGetLocalMacros.ts` | high, readonly,high | class_name*, version |
| GetLocalTestClass | high | `src/handlers/class/high/handleGetLocalTestClass.ts` | high, readonly,high | class_name*, version |
| GetLocalTypes | high | `src/handlers/class/high/handleGetLocalTypes.ts` | high, readonly,high | class_name*, version |
| GetMessageClass | high | `src/handlers/message_class/high/handleGetMessageClass.ts` | high, readonly,high | message_class_name* |
| GetMessageClassMessage | high | `src/handlers/message_class/high/handleGetMessageClassMessage.ts` | high, readonly,high | message_class_name*, msgno* |
| GetMetadataExtension | high | `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts` | high, readonly,high | metadata_extension_name*, version |
| GetMetadataExtensionVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetMetadataExtensionVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | metadata_extension_name* |
| GetMetadataExtensionVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetNodeStructureLow | system | `src/handlers/system/low/handleGetNodeStructure.ts` | readonly, readonly,high, readonly,low | parent_type*, parent_name*, node_id, with_short_descriptions, session_id, session_state |
| GetObjectInfo | system | `src/handlers/system/readonly/handleGetObjectInfo.ts` | readonly, readonly,high, readonly,low | parent_type*, parent_name*, maxDepth, enrich |
| GetObjectNodeFromCache | system | `src/handlers/system/readonly/handleGetObjectNodeFromCache.ts` | readonly, readonly,high, readonly,low | object_type*, object_name*, tech_name* |
| GetObjectsByType | search | `src/handlers/search/readonly/handleGetObjectsByType.ts` | readonly, high, low, readonly,high, readonly,low, compact | parent_name*, parent_tech_name*, parent_type*, node_id*, format, with_short_descriptions |
| GetObjectsList | search | `src/handlers/search/readonly/handleGetObjectsList.ts` | readonly, high, low, readonly,high, readonly,low, compact | parent_name*, parent_tech_name*, parent_type*, with_short_descriptions |
| GetObjectStructure | system | `src/handlers/system/readonly/handleGetObjectStructure.ts` | readonly, readonly,high, readonly,low | objecttype*, objectname* |
| GetObjectStructureLow | system | `src/handlers/system/low/handleGetObjectStructure.ts` | readonly, readonly,high, readonly,low | object_type*, object_name*, session_id, session_state |
| GetObjectVersionDiff | readonly | `src/handlers/common/readonly/handleGetObjectVersionDiff.ts` | readonly, readonly,high, readonly,low | object_type*, content_uri_from*, content_uri_to* |
| GetObjectVersions | readonly | `src/handlers/common/readonly/handleGetObjectVersions.ts` | readonly, readonly,high, readonly,low | object_type*, object_name*, function_group_name |
| GetObjectVersionSource | readonly | `src/handlers/common/readonly/handleGetObjectVersionSource.ts` | readonly, readonly,high, readonly,low | object_type*, content_uri* |
| GetPackage | high | `src/handlers/package/high/handleGetPackage.ts` | high, readonly,high | package_name*, version |
| GetPackageContents | readonly | `src/handlers/package/readonly/handleGetPackageContents.ts` | readonly, readonly,high, readonly,low | (none) |
| GetPackageTree | system | `src/handlers/system/high/handleGetPackageTree.ts` | readonly, readonly,high, readonly,low | package_name*, include_subpackages, max_depth, include_descriptions, debug |
| GetProgram | high | `src/handlers/program/high/handleGetProgram.ts` | high, readonly,high | program_name*, version |
| GetProgramVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetProgramVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | program_name* |
| GetProgramVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetServiceBinding | high | `src/handlers/service_binding/high/handleGetServiceBinding.ts` | high, readonly,high | service_binding_name*, response_format |
| GetServiceDefinition | high | `src/handlers/service_definition/high/handleGetServiceDefinition.ts` | high, readonly,high | service_definition_name*, version |
| GetSession | system | `src/handlers/system/readonly/handleGetSession.ts` | readonly, readonly,high, readonly,low | force_new |
| GetSqlQuery | system | `src/handlers/system/readonly/handleGetSqlQuery.ts` | readonly, readonly,high, readonly,low | sql_query*, row_number |
| GetStructure | high | `src/handlers/structure/high/handleGetStructure.ts` | high, readonly,high | structure_name*, version |
| GetStructuresList | readonly | `src/handlers/structure/readonly/handleGetStructuresList.ts` | readonly, readonly,high, readonly,low | structure_name*, version, include_extensions, timeout |
| GetStructureVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetStructureVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | structure_name* |
| GetStructureVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetTable | high | `src/handlers/table/high/handleGetTable.ts` | high, readonly,high | table_name*, version |
| GetTableContents | readonly | `src/handlers/table/readonly/handleGetTableContents.ts` | readonly, readonly,high, readonly,low | (none) |
| GetTableVersionDiff | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri_from*, content_uri_to* |
| GetTableVersions | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | table_name* |
| GetTableVersionSource | high | `src/handlers/common/high/objectVersionTools.ts` | high, readonly,high | content_uri* |
| GetTransaction | system | `src/handlers/system/readonly/handleGetTransaction.ts` | readonly, readonly,high, readonly,low | transaction_name* |
| GetTransport | readonly | `src/handlers/transport/readonly/handleGetTransport.ts` | readonly, readonly,high, readonly,low | transport_number*, include_objects, include_tasks |
| GetTypeInfo | system | `src/handlers/system/readonly/handleGetTypeInfo.ts` | readonly, readonly,high, readonly,low | type_name*, include_structure_fallback |
| GetUnitTest | high | `src/handlers/unit_test/high/handleGetUnitTest.ts` | high, readonly,high | run_id* |
| GetUnitTestResult | high | `src/handlers/unit_test/high/handleGetUnitTestResult.ts` | high, readonly,high | run_id*, with_navigation_uris, format |
| GetUnitTestStatus | high | `src/handlers/unit_test/high/handleGetUnitTestStatus.ts` | high, readonly,high | run_id*, with_long_polling |
| GetVirtualFoldersLow | system | `src/handlers/system/low/handleGetVirtualFolders.ts` | readonly, readonly,high, readonly,low | object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions |
| GetWhereUsed | system | `src/handlers/system/readonly/handleGetWhereUsed.ts` | readonly, readonly,high, readonly,low | object_name*, object_type*, enable_all_types, enable_only_types, disable_types |
| HandlerActivate | compact | `src/handlers/compact/high/handleHandlerActivate.ts` | compact | object_type, object_name, object_adt_type, objects, preaudit |
| HandlerCdsUnitTestResult | compact | `src/handlers/compact/high/handleHandlerCdsUnitTestResult.ts` | compact | run_id*, with_navigation_uris, format |
| HandlerCdsUnitTestStatus | compact | `src/handlers/compact/high/handleHandlerCdsUnitTestStatus.ts` | compact | run_id*, with_long_polling |
| HandlerCheckRun | compact | `src/handlers/compact/high/handleHandlerCheckRun.ts` | compact | object_type*, object_name*, version, session_id, session_state |
| HandlerCreate | compact | `src/handlers/compact/high/handleHandlerCreate.ts` | compact | object_type*, class_name, program_name, domain_name, function_module_name, function_group_name, package_name, ddl_name, description, transport_request, activate, program_type, application, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, table_name, structure_name, data_element_name, interface_name, service_definition_name, service_binding_name, name, root_entity, implementation_type, behavior_definition, cds_view_name, fields, tests |
| HandlerDelete | compact | `src/handlers/compact/high/handleHandlerDelete.ts` | compact | object_type*, class_name, program_name, domain_name, function_module_name, function_group_name, ddl_name, transport_request, table_name, structure_name, data_element_name, interface_name, service_definition_name, service_binding_name, behavior_definition_name, behavior_implementation_name, metadata_extension_name, run_id |
| HandlerDumpList | compact | `src/handlers/compact/high/handleHandlerDumpList.ts` | compact | user, top, from, to |
| HandlerDumpView | compact | `src/handlers/compact/high/handleHandlerDumpView.ts` | compact | dump_id*, view |
| HandlerGet | compact | `src/handlers/compact/high/handleHandlerGet.ts` | compact | object_type*, package_name, class_name, interface_name, program_name, domain_name, data_element_name, table_name, structure_name, ddl_name, function_module_name, function_group_name, behavior_definition_name, behavior_implementation_name, metadata_extension_name, service_definition_name, service_binding_name, run_id, response_format, version |
| HandlerLock | compact | `src/handlers/compact/high/handleHandlerLock.ts` | compact | object_type*, object_name*, super_package, session_id, session_state |
| HandlerProfileList | compact | `src/handlers/compact/high/handleHandlerProfileList.ts` | compact | (none) |
| HandlerProfileRun | compact | `src/handlers/compact/high/handleHandlerProfileRun.ts` | compact | target_type*, class_name, program_name, description, all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing |
| HandlerProfileView | compact | `src/handlers/compact/high/handleHandlerProfileView.ts` | compact | trace_id_or_uri*, view*, with_system_events, id, with_details, auto_drill_down_threshold |
| HandlerServiceBindingListTypes | compact | `src/handlers/compact/high/handleHandlerServiceBindingListTypes.ts` | compact | response_format |
| HandlerServiceBindingValidate | compact | `src/handlers/compact/high/handleHandlerServiceBindingValidate.ts` | compact | service_binding_name*, service_definition_name*, service_binding_version, package_name, description |
| HandlerTransportCreate | compact | `src/handlers/compact/high/handleHandlerTransportCreate.ts` | compact | transport_type, description*, target_system, owner |
| HandlerUnitTestResult | compact | `src/handlers/compact/high/handleHandlerUnitTestResult.ts` | compact | run_id*, with_navigation_uris, format |
| HandlerUnitTestRun | compact | `src/handlers/compact/high/handleHandlerUnitTestRun.ts` | compact | tests*, title, context, scope, risk_level, duration |
| HandlerUnitTestStatus | compact | `src/handlers/compact/high/handleHandlerUnitTestStatus.ts` | compact | run_id*, with_long_polling |
| HandlerUnlock | compact | `src/handlers/compact/high/handleHandlerUnlock.ts` | compact | object_type*, object_name*, lock_handle*, session_id*, session_state |
| HandlerUpdate | compact | `src/handlers/compact/high/handleHandlerUpdate.ts` | compact | object_type*, class_name, program_name, domain_name, function_module_name, function_group_name, package_name, ddl_name, source_code, ddl_source, transport_request, activate, description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, table_name, structure_name, data_element_name, interface_name, service_definition_name, service_binding_name, service_name, name, behavior_definition, ddl_code, implementation_code, test_class_source, test_class_code, local_types_code, definitions_code, macros_code, run_id, binding_variant, desired_publication_state |
| HandlerValidate | compact | `src/handlers/compact/high/handleHandlerValidate.ts` | compact | object_type*, object_name*, package_name, description, behavior_definition, root_entity, implementation_type, service_definition_name, service_binding_version, session_id, session_state |
| ListFunctionGroupIncludes | readonly | `src/handlers/function_include/readonly/handleListFunctionGroupIncludes.ts` | readonly, readonly,high, readonly,low | function_group_name* |
| ListFunctionModules | readonly | `src/handlers/function_include/readonly/handleListFunctionModules.ts` | readonly, readonly,high, readonly,low | function_group_name* |
| ListServiceBindingTypes | high | `src/handlers/service_binding/high/handleListServiceBindingTypes.ts` | high, readonly,high | response_format |
| ListTransports | readonly | `src/handlers/transport/readonly/handleListTransports.ts` | readonly, readonly,high, readonly,low | user, modifiable_only |
| LockBehaviorDefinitionLow | low | `src/handlers/behavior_definition/low/handleLockBehaviorDefinition.ts` | low, readonly,low | name*, session_id, session_state |
| LockBehaviorImplementationLow | low | `src/handlers/behavior_implementation/low/handleLockBehaviorImplementation.ts` | low, readonly,low | class_name*, session_id, session_state |
| LockClassLow | low | `src/handlers/class/low/handleLockClass.ts` | low, readonly,low | class_name* |
| LockClassTestClassesLow | low | `src/handlers/class/low/handleLockClassTestClasses.ts` | low, readonly,low | class_name*, session_id, session_state |
| LockDataElementLow | low | `src/handlers/data_element/low/handleLockDataElement.ts` | low, readonly,low | data_element_name*, session_id, session_state |
| LockDdlLow | low | `src/handlers/ddl/low/handleLockDdl.ts` | low, readonly,low | ddl_name*, session_id, session_state |
| LockDomainLow | low | `src/handlers/domain/low/handleLockDomain.ts` | low, readonly,low | domain_name*, session_id, session_state |
| LockFunctionGroupLow | low | `src/handlers/function/low/handleLockFunctionGroup.ts` | low, readonly,low | function_group_name*, session_id, session_state |
| LockFunctionModuleLow | low | `src/handlers/function/low/handleLockFunctionModule.ts` | low, readonly,low | function_module_name*, function_group_name*, session_id, session_state |
| LockInterfaceLow | low | `src/handlers/interface/low/handleLockInterface.ts` | low, readonly,low | interface_name*, session_id, session_state |
| LockMetadataExtensionLow | low | `src/handlers/ddlx/low/handleLockMetadataExtension.ts` | low, readonly,low | name*, session_id, session_state |
| LockPackageLow | low | `src/handlers/package/low/handleLockPackage.ts` | low, readonly,low | package_name*, super_package*, session_id, session_state |
| LockProgramLow | low | `src/handlers/program/low/handleLockProgram.ts` | low, readonly,low | program_name*, session_id, session_state |
| LockStructureLow | low | `src/handlers/structure/low/handleLockStructure.ts` | low, readonly,low | structure_name*, session_id, session_state |
| LockTableLow | low | `src/handlers/table/low/handleLockTable.ts` | low, readonly,low | table_name*, session_id, session_state |
| ReadBehaviorDefinition | readonly | `src/handlers/behavior_definition/readonly/handleReadBehaviorDefinition.ts` | readonly, readonly,low | behavior_definition_name*, version |
| ReadBehaviorImplementation | readonly | `src/handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.ts` | readonly, readonly,low | behavior_implementation_name*, version |
| ReadClass | readonly | `src/handlers/class/readonly/handleReadClass.ts` | readonly, readonly,low | class_name*, version |
| ReadDataElement | readonly | `src/handlers/data_element/readonly/handleReadDataElement.ts` | readonly, readonly,low | data_element_name*, version |
| ReadDdl | readonly | `src/handlers/ddl/readonly/handleReadDdl.ts` | readonly, readonly,low | ddl_name*, version |
| ReadDomain | readonly | `src/handlers/domain/readonly/handleReadDomain.ts` | readonly, readonly,low | domain_name*, version |
| ReadFunctionGroup | readonly | `src/handlers/function_group/readonly/handleReadFunctionGroup.ts` | readonly, readonly,low | function_group_name*, version |
| ReadFunctionInclude | readonly | `src/handlers/function_include/readonly/handleReadFunctionInclude.ts` | readonly, readonly,high, readonly,low | function_group_name*, include_name*, version |
| ReadFunctionModule | readonly | `src/handlers/function_module/readonly/handleReadFunctionModule.ts` | readonly, readonly,low | function_module_name*, function_group_name*, version |
| ReadInterface | readonly | `src/handlers/interface/readonly/handleReadInterface.ts` | readonly, readonly,low | interface_name*, version |
| ReadMessageClass | readonly | `src/handlers/message_class/readonly/handleReadMessageClass.ts` | readonly, readonly,low | message_class_name* |
| ReadMessageClassMessage | readonly | `src/handlers/message_class/readonly/handleReadMessageClassMessage.ts` | readonly, readonly,low | message_class_name*, msgno* |
| ReadMetadataExtension | readonly | `src/handlers/metadata_extension/readonly/handleReadMetadataExtension.ts` | readonly, readonly,low | metadata_extension_name*, version |
| ReadPackage | readonly | `src/handlers/package/readonly/handleReadPackage.ts` | readonly, readonly,low | package_name*, version |
| ReadProgram | readonly | `src/handlers/program/readonly/handleReadProgram.ts` | readonly, readonly,low | program_name*, version |
| ReadServiceBinding | readonly | `src/handlers/service_binding/readonly/handleReadServiceBinding.ts` | readonly, readonly,low | service_binding_name* |
| ReadServiceDefinition | readonly | `src/handlers/service_definition/readonly/handleReadServiceDefinition.ts` | readonly, readonly,low | service_definition_name*, version |
| ReadStructure | readonly | `src/handlers/structure/readonly/handleReadStructure.ts` | readonly, readonly,low | structure_name*, version |
| ReadTable | readonly | `src/handlers/table/readonly/handleReadTable.ts` | readonly, readonly,low | table_name*, version |
| RunClassUnitTestsLow | low | `src/handlers/class/low/handleRunClassUnitTests.ts` | low, readonly,low | tests*, title, context, scope, risk_level, duration, session_id, session_state |
| RuntimeAnalyzeProfilerTrace | system | `src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts` | readonly, readonly,high, readonly,low | trace_id_or_uri*, view, top, with_system_events |
| RuntimeCreateProfilerTraceParameters | system | `src/handlers/system/readonly/handleRuntimeCreateProfilerTraceParameters.ts` | readonly, readonly,high, readonly,low | description*, all_misc_abap_statements, all_procedural_units, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing |
| RuntimeGetDumpById | system | `src/handlers/system/readonly/handleRuntimeGetDumpById.ts` | readonly, readonly,high, readonly,low | dump_id*, view, response_mode |
| RuntimeGetGatewayErrorLog | system | `src/handlers/system/readonly/handleRuntimeGetGatewayErrorLog.ts` | readonly, readonly,high, readonly,low | error_url, user, max_results, from, to |
| RuntimeGetProfilerTraceData | system | `src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts` | readonly, readonly,high, readonly,low | trace_id_or_uri*, view*, with_system_events, id, with_details, auto_drill_down_threshold |
| RuntimeListFeeds | system | `src/handlers/system/readonly/handleRuntimeListFeeds.ts` | readonly, readonly,high, readonly,low | feed_type, user, max_results, from, to |
| RuntimeListProfilerTraceFiles | system | `src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts` | readonly, readonly,high, readonly,low | (none) |
| RuntimeListSystemMessages | system | `src/handlers/system/readonly/handleRuntimeListSystemMessages.ts` | readonly, readonly,high, readonly,low | user, max_results, from, to |
| RuntimeRunClass | system | `src/handlers/system/readonly/handleRuntimeRunClass.ts` | readonly, readonly,high, readonly,low | class_name*, profile, description, all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing, max_trace_attempts, trace_retry_delay_ms, trace_lookup_uris |
| RuntimeRunClassWithProfiling | system | `src/handlers/system/readonly/handleRuntimeRunClassWithProfiling.ts` | readonly, readonly,high, readonly,low | class_name*, description, all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing, max_trace_attempts, trace_retry_delay_ms, trace_lookup_uris |
| RuntimeRunProgram | system | `src/handlers/system/readonly/handleRuntimeRunProgram.ts` | readonly, readonly,high, readonly,low | program_name*, profile, description, all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing |
| RuntimeRunProgramWithProfiling | system | `src/handlers/system/readonly/handleRuntimeRunProgramWithProfiling.ts` | readonly, readonly,high, readonly,low | program_name*, description, all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing |
| RunUnitTest | high | `src/handlers/unit_test/high/handleRunUnitTest.ts` | high, readonly,high | tests*, title, context, scope, risk_level, duration |
| SearchObject | search | `src/handlers/search/readonly/handleSearchObject.ts` | readonly, high, low, readonly,high, readonly,low, compact | object_name*, object_type, maxResults |
| SearchSource | search | `src/handlers/system/readonly/handleSearchSource.ts` | readonly, high, low, readonly,high, readonly,low, compact | (none) |
| UnlockBehaviorDefinitionLow | low | `src/handlers/behavior_definition/low/handleUnlockBehaviorDefinition.ts` | low, readonly,low | name*, lock_handle*, session_id*, session_state |
| UnlockClassLow | low | `src/handlers/class/low/handleUnlockClass.ts` | low, readonly,low | class_name*, lock_handle* |
| UnlockClassTestClassesLow | low | `src/handlers/class/low/handleUnlockClassTestClasses.ts` | low, readonly,low | class_name*, lock_handle*, session_id, session_state |
| UnlockDataElementLow | low | `src/handlers/data_element/low/handleUnlockDataElement.ts` | low, readonly,low | data_element_name*, lock_handle*, session_id*, session_state |
| UnlockDdlLow | low | `src/handlers/ddl/low/handleUnlockDdl.ts` | low, readonly,low | ddl_name*, lock_handle*, session_id*, session_state |
| UnlockDomainLow | low | `src/handlers/domain/low/handleUnlockDomain.ts` | low, readonly,low | domain_name*, lock_handle*, session_id*, session_state |
| UnlockFunctionGroupLow | low | `src/handlers/function/low/handleUnlockFunctionGroup.ts` | low, readonly,low | function_group_name*, lock_handle*, session_id*, session_state |
| UnlockFunctionModuleLow | low | `src/handlers/function/low/handleUnlockFunctionModule.ts` | low, readonly,low | function_module_name*, function_group_name*, lock_handle*, session_id*, session_state |
| UnlockInterfaceLow | low | `src/handlers/interface/low/handleUnlockInterface.ts` | low, readonly,low | interface_name*, lock_handle*, session_id*, session_state |
| UnlockMetadataExtensionLow | low | `src/handlers/ddlx/low/handleUnlockMetadataExtension.ts` | low, readonly,low | name*, lock_handle*, session_id*, session_state |
| UnlockPackageLow | low | `src/handlers/package/low/handleUnlockPackage.ts` | low, readonly,low | package_name*, super_package*, lock_handle*, session_id*, session_state |
| UnlockProgramLow | low | `src/handlers/program/low/handleUnlockProgram.ts` | low, readonly,low | program_name*, lock_handle*, session_id*, session_state |
| UnlockStructureLow | low | `src/handlers/structure/low/handleUnlockStructure.ts` | low, readonly,low | structure_name*, lock_handle*, session_id*, session_state |
| UnlockTableLow | low | `src/handlers/table/low/handleUnlockTable.ts` | low, readonly,low | table_name*, lock_handle*, session_id*, session_state |
| UpdateBehaviorDefinition | high | `src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts` | high, readonly,high | name*, source_code*, transport_request, lock_handle, activate |
| UpdateBehaviorDefinitionLow | low | `src/handlers/behavior_definition/low/handleUpdateBehaviorDefinition.ts` | low, readonly,low | name*, source_code*, lock_handle*, transport_request, session_id, session_state |
| UpdateBehaviorImplementation | high | `src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts` | high, readonly,high | class_name*, behavior_definition*, implementation_code*, transport_request, activate |
| UpdateCdsUnitTest | high | `src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts` | high, readonly,high | class_name*, test_class_source*, transport_request |
| UpdateClass | high | `src/handlers/class/high/handleUpdateClass.ts` | high, readonly,high | class_name*, source_code*, transport_request, activate |
| UpdateClassLow | low | `src/handlers/class/low/handleUpdateClass.ts` | low, readonly,low | class_name*, source_code*, lock_handle* |
| UpdateClassTestClassesLow | low | `src/handlers/class/low/handleUpdateClassTestClasses.ts` | low, readonly,low | class_name*, test_class_source*, lock_handle*, session_id, session_state |
| UpdateDataElement | high | `src/handlers/data_element/high/handleUpdateDataElement.ts` | high, readonly,high | data_element_name*, description, package_name*, transport_request, type_kind, type_name, data_type, length, decimals, field_label_short, field_label_medium, field_label_long, field_label_heading, search_help, search_help_parameter, set_get_parameter, activate |
| UpdateDataElementLow | low | `src/handlers/data_element/low/handleUpdateDataElement.ts` | low, readonly,low | data_element_name*, properties*, lock_handle*, session_id, session_state |
| UpdateDdl | high | `src/handlers/ddl/high/handleUpdateDdl.ts` | high, readonly,high | ddl_name*, ddl_source*, transport_request, activate |
| UpdateDdlLow | low | `src/handlers/ddl/low/handleUpdateDdl.ts` | low, readonly,low | ddl_name*, ddl_source*, lock_handle*, session_id, session_state |
| UpdateDomain | high | `src/handlers/domain/high/handleUpdateDomain.ts` | high, readonly,high | domain_name*, description, package_name*, transport_request, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, activate, fixed_values |
| UpdateDomainLow | low | `src/handlers/domain/low/handleUpdateDomain.ts` | low, readonly,low | domain_name*, properties*, lock_handle*, session_id, session_state |
| UpdateFunctionGroup | high | `src/handlers/function/high/handleUpdateFunctionGroup.ts` | high, readonly,high | function_group_name*, description*, transport_request |
| UpdateFunctionInclude | high | `src/handlers/function_include/high/handleUpdateFunctionInclude.ts` | high, readonly,high | function_group_name*, include_name*, source_code*, transport_request, activate |
| UpdateFunctionModule | high | `src/handlers/function/high/handleUpdateFunctionModule.ts` | high, readonly,high | function_group_name*, function_module_name*, source_code*, transport_request, activate |
| UpdateFunctionModuleLow | low | `src/handlers/function/low/handleUpdateFunctionModule.ts` | low, readonly,low | function_module_name*, function_group_name*, source_code*, transport_request, lock_handle*, session_id, session_state |
| UpdateInterface | high | `src/handlers/interface/high/handleUpdateInterface.ts` | high, readonly,high | interface_name*, source_code*, transport_request, activate |
| UpdateInterfaceLow | low | `src/handlers/interface/low/handleUpdateInterface.ts` | low, readonly,low | interface_name*, source_code*, lock_handle*, session_id, session_state |
| UpdateLocalDefinitions | high | `src/handlers/class/high/handleUpdateLocalDefinitions.ts` | high, readonly,high | class_name*, definitions_code*, transport_request, activate_on_update |
| UpdateLocalMacros | high | `src/handlers/class/high/handleUpdateLocalMacros.ts` | high, readonly,high | class_name*, macros_code*, transport_request, activate_on_update |
| UpdateLocalTestClass | high | `src/handlers/class/high/handleUpdateLocalTestClass.ts` | high, readonly,high | class_name*, test_class_code*, transport_request, activate_on_update |
| UpdateLocalTypes | high | `src/handlers/class/high/handleUpdateLocalTypes.ts` | high, readonly,high | class_name*, local_types_code*, transport_request, activate_on_update |
| UpdateMessageClass | high | `src/handlers/message_class/high/handleUpdateMessageClass.ts` | high, readonly,high | message_class_name*, description*, transport_request |
| UpdateMessageClassMessage | high | `src/handlers/message_class/high/handleUpdateMessageClassMessage.ts` | high, readonly,high | message_class_name*, msgno*, msgtext*, self_explanatory, description, transport_request |
| UpdateMetadataExtension | high | `src/handlers/ddlx/high/handleUpdateMetadataExtension.ts` | high, readonly,high | name*, source_code*, lock_handle, transport_request, activate |
| UpdateMetadataExtensionLow | low | `src/handlers/ddlx/low/handleUpdateMetadataExtension.ts` | low, readonly,low | name*, source_code*, lock_handle*, session_id, session_state |
| UpdatePackageLow | low | `src/handlers/package/low/handleUpdatePackage.ts` | low, readonly,low | package_name*, super_package*, updated_description*, lock_handle*, session_id, session_state |
| UpdateProgram | high | `src/handlers/program/high/handleUpdateProgram.ts` | high, readonly,high | program_name*, source_code*, transport_request, activate |
| UpdateProgramLow | low | `src/handlers/program/low/handleUpdateProgram.ts` | low, readonly,low | program_name*, source_code*, lock_handle*, session_id, session_state |
| UpdateServiceBinding | high | `src/handlers/service_binding/high/handleUpdateServiceBinding.ts` | high, readonly,high | service_binding_name*, desired_publication_state*, binding_variant*, service_name*, service_version, response_format |
| UpdateServiceDefinition | high | `src/handlers/service_definition/high/handleUpdateServiceDefinition.ts` | high, readonly,high | service_definition_name*, source_code*, transport_request, activate |
| UpdateStructure | high | `src/handlers/structure/high/handleUpdateStructure.ts` | high, readonly,high | structure_name*, ddl_code*, transport_request, activate |
| UpdateStructureLow | low | `src/handlers/structure/low/handleUpdateStructure.ts` | low, readonly,low | structure_name*, ddl_code*, lock_handle*, session_id, session_state |
| UpdateTable | high | `src/handlers/table/high/handleUpdateTable.ts` | high, readonly,high | table_name*, ddl_code*, transport_request, activate |
| UpdateTableLow | low | `src/handlers/table/low/handleUpdateTable.ts` | low, readonly,low | table_name*, ddl_code*, lock_handle*, transport_request, session_id, session_state |
| UpdateUnitTest | high | `src/handlers/unit_test/high/handleUpdateUnitTest.ts` | high, readonly,high | run_id* |
| ValidateBehaviorDefinitionLow | low | `src/handlers/behavior_definition/low/handleValidateBehaviorDefinition.ts` | low, readonly,low | name*, root_entity*, implementation_type*, package_name*, description*, session_id, session_state |
| ValidateBehaviorImplementationLow | low | `src/handlers/behavior_implementation/low/handleValidateBehaviorImplementation.ts` | low, readonly,low | class_name*, behavior_definition*, package_name*, description*, session_id, session_state |
| ValidateClassLow | low | `src/handlers/class/low/handleValidateClass.ts` | low, readonly,low | class_name*, package_name*, description*, superclass, session_id, session_state |
| ValidateDataElementLow | low | `src/handlers/data_element/low/handleValidateDataElement.ts` | low, readonly,low | data_element_name*, package_name*, description*, session_id, session_state |
| ValidateDdlLow | low | `src/handlers/ddl/low/handleValidateDdl.ts` | low, readonly,low | ddl_name*, package_name*, description*, session_id, session_state |
| ValidateDomainLow | low | `src/handlers/domain/low/handleValidateDomain.ts` | low, readonly,low | domain_name*, description*, package_name*, session_id, session_state |
| ValidateFunctionGroupLow | low | `src/handlers/function/low/handleValidateFunctionGroup.ts` | low, readonly,low | function_group_name*, package_name, description, session_id, session_state |
| ValidateFunctionModuleLow | low | `src/handlers/function/low/handleValidateFunctionModule.ts` | low, readonly,low | function_group_name*, function_module_name*, description, session_id, session_state |
| ValidateInterfaceLow | low | `src/handlers/interface/low/handleValidateInterface.ts` | low, readonly,low | interface_name*, package_name*, description*, session_id, session_state |
| ValidateMetadataExtensionLow | low | `src/handlers/ddlx/low/handleValidateMetadataExtension.ts` | low, readonly,low | name*, description*, package_name*, session_id, session_state |
| ValidatePackageLow | low | `src/handlers/package/low/handleValidatePackage.ts` | low, readonly,low | package_name*, super_package*, session_id, session_state |
| ValidateProgramLow | low | `src/handlers/program/low/handleValidateProgram.ts` | low, readonly,low | program_name*, package_name*, description*, session_id, session_state |
| ValidateServiceBinding | high | `src/handlers/service_binding/high/handleValidateServiceBinding.ts` | high, readonly,high | service_binding_name*, description, service_definition_name*, package_name, service_binding_version |
| ValidateStructureLow | low | `src/handlers/structure/low/handleValidateStructure.ts` | low, readonly,low | structure_name*, package_name*, description*, session_id, session_state |
| ValidateTableLow | low | `src/handlers/table/low/handleValidateTable.ts` | low, readonly,low | table_name*, package_name*, description*, session_id, session_state |

