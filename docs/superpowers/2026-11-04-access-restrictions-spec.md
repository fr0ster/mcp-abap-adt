# Spec: access restrictions set when the server starts

Goal: `2026-11-04-access-restrictions-goal.md`. This spec decides what the goal left open.
Claims are marked **Measured** (read in the code at 23.1.0, or in a recorded run) or
**Inference** (not yet proven; the plan proves or drops it).

## 1. What the code shows

- **Start-time configuration has one machinery.** Each binary reads a `ParameterTable`
  (`src/lib/config/authParameters.ts`): every row in three forms, CLI beating environment
  beating YAML (`--conf`). The tables are `coreParameters` (stdio), `httpParameters` and
  `sseParameters` (`server-runtime/src/*/config/`), one per transport, each taking the binary's
  `ToolSet`; the `-ro` and compact binaries use the same table with their own set. Shared rows
  (`BATCH_KEEP_RAW_PARTS_ROW`, `SHUTDOWN_TIMEOUT_ROW`) sit in all three. A row's reader throws a
  `ParameterRefusal`, and the start ends `1` with `[MCP] <words>`. (Measured)
- **The `list` kind drops empty entries silently** (`splitList`: `a,,b` is `[a, b]`). It cannot
  hold rows that must refuse a stray separator. (Measured)
- **Every launcher builds its registry in one call**, `registryOf(toolSet, transport)`
  (`src/lib/toolSet.ts`), used by the stdio, http and sse launchers. (Measured)
- **There are two call paths.** A server instance wraps every entry in
  `BaseMcpServer.registerHandlers` (`runCall`). A plain registration of groups on an
  embedder's `McpServer` (`registerAllTools`, `HandlerExporter.registerOnServer`) wraps every
  entry in `BaseHandlerGroup.registerToolOnServer`. `HandlerExporter.getHandlerEntries()` hands
  out handlers wrapped in `inStatedScope`. Every handler runs inside one of these three
  wrappers. (Measured)
- **The listed schema is enforced before the handler.** The SDK parses the arguments with the
  zod object built from the listed schema. That object drops undeclared keys, and an `enum`
  becomes `z.enum`. So a value removed from an enum, or a property removed from a schema, never
  reaches the handler. (Measured: `schemaUtils.ts`)
- **The compact tools dispatch on one argument.** `object_type` for the CRUD and route tools,
  `action` for `HandlerBatch`, `HandlerDebugBatch` and `HandlerSession`, `operation` for the
  `HandlerDebug*` tools. Their members are already narrowed per system type through the
  variant projection (`variant-surface.json` `members`). (Measured)
- **Batch mode records calls.** While a batch is open, an admitted call runs its handler on a
  recorder, and its requests leave only at `BatchEnd`. A handler whose request needs an earlier
  answer cannot be recorded (`tools/batch-handlers.json`). (Measured)
- **The ADT clients do not expose an ETag in a read's value,** but a client built with the
  `wireItself` reading keeps the answer's status and headers. adt-clients' `AdtReadVersion` is
  `active | inactive | workingArea` and is sent verbatim as `?version=`; the probes used
  `workspace`. Whether `workingArea` answers as `workspace` does for a second user is not
  known. (Measured: adt-clients 42.1.0 source; the equivalence is Inference)
- **The listed-schema fixture** (`tests/fixtures/tools/listed-schemas.json`) exists on the
  static-types branch, not on `main`. `main` has the surface fixtures
  (`tests/fixtures/tools/surface.json`, `variant-surface.json`, the http and stdio/sse ones).
  (Measured)

## 2. The settings

Every setting is a row of its own, in every binary's table (all twelve binaries), in the three
forms. None has a default. Each is a `custom` row with its own reader, so an empty entry is
refused rather than dropped.

- **Absent is no restriction.** A row given in no form restricts nothing, and the server starts
  as today. Only a value that is there and cannot be parsed stops the start.
- **Stops the start:** a malformed entry (§2.1, §2.2), and denied tables beside allowed tables.
  Nothing else about these rows does.

| Setting | CLI | Environment | YAML |
|---|---|---|---|
| Denied actions | `--deny-actions` | `MCP_DENY_ACTIONS` | `restrictions.deny-actions` |
| Allowed packages | `--allowed-packages` | `MCP_ALLOWED_PACKAGES` | `restrictions.allowed-packages` |
| Allowed requests | `--allowed-requests` | `MCP_ALLOWED_REQUESTS` | `restrictions.allowed-requests` |
| Denied tables | `--denied-tables` | `MCP_DENIED_TABLES` | `restrictions.denied-tables` |
| Allowed tables | `--allowed-tables` | `MCP_ALLOWED_TABLES` | `restrictions.allowed-tables` |

- **Lists.** CLI and environment: entries separated by `,`, each trimmed. YAML: a sequence of
  strings, or one such string. An empty entry or a stray separator inside a value that is there
  is malformed. A form given with nothing at all (`MCP_DENY_ACTIONS=`, an empty YAML sequence)
  is absent, as an unset variable is today.
- **Where each transport takes them.** At start, from the same table as every other parameter.
  The http and sse binaries take them as start parameters of the process; no request header
  carries a restriction, and nothing is read per request. A restriction is the process's: every
  instance of a pooled http server gets the same one.
- **The file form is the config file.** A long list goes in the YAML file of `--conf`. No row
  takes a list file of its own, so no list file can be missing (see Questions). `--conf` keeps
  its behaviour of today, which this change does not touch: a missing file gets the template and
  the start ends `0`; an unreadable or invalid one stops the start.
- **Every binary accepts every row.** A row that touches nothing in that binary (a request
  list where no tool names a request) changes nothing, so one configuration fits every binary.

### 2.1 Denied actions: grammar

- `Tool`: the tool. `DeleteClass`.
- `Tool.value`: one value of the tool's dispatching argument (§1, Appendix C).
  `HandlerDelete.CLASS`, `HandlerBatch.end`.
- `Tool.prefix*`: every value of the dispatching argument that starts with `prefix`.
  `HandlerDebugSession.get*`.
- `Prefix*`: every tool whose name starts with `Prefix`. `Delete*`. The full set splits its
  actions into tools, so this is the full set's form of ARC-1's action glob (see Questions).
- Malformed, stopping the start: an empty entry; a tool part that is empty or holds anything
  but ASCII letters and digits; a value part that holds anything but ASCII letters, digits and
  `_`; `*` anywhere but at the end; `*` alone; `*.value` (a wildcard over tools with an action);
  more than one `.`.
- Tool names and values match exactly, case included.
- **An entry that matches nothing in this binary is ignored** (the goal). The start writes one
  line on stderr naming such entries, and goes on.

### 2.2 Packages, requests and tables: grammar

- Packages: an exact name (`ZFOO`, `$TMP`) or a prefix (`Z*`), nothing else. Characters: ASCII
  letters, digits, `_`, `/`, `$`; `*` only at the end. Entries are upper-cased at start.
- **No subtree form.** ARC-1's `ZFOO/**` needs the package tree from SAP, and the checks read
  only the arguments. An entry ending in `/**` is malformed, and its refusal says the subtree
  form is not offered.
- Requests: an exact number or a prefix. Characters: ASCII letters and digits; `*` only at the
  end. Upper-cased at start.
- Tables: an exact name or a prefix, packages' characters. Upper-cased at start.
- **Denied tables and allowed tables together stop the start.** The goal offers one or the
  other.

## 3. The checks, and where they run

### 3.1 Denied actions: at registration

- `registryOf` takes the denied actions. It wraps each group so that `getHandlers()` leaves out
  a denied tool, and narrows a compact tool's dispatching argument to the values not denied.
  A compact tool left with no value is left out.
- The narrowing goes through the projection the variant already applies, so the description,
  the schema and the search members agree. (Inference that the projection takes a member set
  from outside; the plan proves it on `HandlerDelete` first.)
- No call checks a deny list. A denied action cannot pass the SDK's parse of the listed schema
  (§1).
- **Batch.** A batch item is a call of another registered tool. A denied tool or value is not
  registered, so no batch can record it. Nothing else is needed.
- An embedder that registers groups itself can apply the same: lib exports the parser and the
  group wrapper (`withoutDenied(groups, denied)`).

### 3.2 Packages, requests and tables: the strategy

One interface, given by the host, decides every call-time check:

    interface IAccessChecks {
      check(call: AccessCall): Promise<AccessVerdict>;
    }

- **`AccessCall`** is what the arguments say, as given: the tool, the value of its dispatching
  argument when it has one, the packages named (`{ argument, value }`), the requests named and
  the tables named. Nothing in it is read from SAP, and the strategy is given no connection.
- **`AccessVerdict`** is `{ allowed: true }` or `{ allowed: false, code, argument? }`. The code
  is one of a closed set (§3.4).
- **The shipped strategy**, `restrictedAccess(config)` in lib, applies the configured lists. An
  embedder gives its own. No strategy acts on a draft (§5).
- **No strategy, no check.** A launcher gives a strategy only when at least one call-time row
  is configured. Without one, no wrapper builds an `AccessCall` and nothing changes.
- **Where it is given.** `BaseMcpServer` (so every launcher and `EmbeddableMcpServer`) and
  `HandlerExporter` take an optional `accessChecks`. The launcher creates one per process and
  gives it to every instance. The strategy holds no state.
- **Where it is called: once, in each of the three wrappers (§1)**, after the arguments are
  parsed and before the call's connection is taken, so a refused call opens nothing and sends
  nothing. Not in any handler. The
  handler then runs whole, or not at all. Nothing is checked between its steps.
- **Which tools are checked.** The wrapper builds the `AccessCall` from tables derived at
  registration (§4, §6). A tool that names nothing checked is not called with the strategy.
- **Batch.** A recorded call is checked when it is recorded, which is its handler's start. The
  check reads nothing, so it fits the batch's rule that no request needs another's answer. A
  refused call takes no number.

### 3.3 What the shipped strategy decides

- A package named in a checked argument (§4) runs only when it matches an allowed-packages
  entry. A request likewise against the allowed requests. When both lists are configured, each
  name is checked against its own list.
- A table named by a data tool (§6) runs only when it matches no denied entry, or only when it
  matches an allowed entry.
- An argument not given, or given as an empty or blank string, is not checked; the call runs,
  and SAP may refuse it. Nothing is asked of SAP about a package or a request, and nothing is
  checked for existence.
- Values are compared upper-cased and trimmed, the way the handlers send them.

### 3.4 How a refusal reaches the model

- As the server's own refusal, the way `batch_not_recordable` reaches it: an `isError` answer
  with an `error` code and fixed words. New `ServerRefusalCode`s:
  - `package_not_allowed`: "<argument> names a package outside the allowed packages: <value>";
  - `request_not_allowed`: the same for a request;
  - `table_not_allowed`: "the data of <value> is not readable through this server".
- The words quote only the call's own arguments. No SAP text is invented.
- A refused call sends nothing and takes no batch number.

## 4. Package and request arguments

- **Found from the tool definitions, not from handler code.** At registration the wrapper reads
  the top-level properties of each tool's listed input schema (after the static-types change:
  the zod shape's keys). A property named in one of two fixed tables is a checked argument:
  - names a package: `package_name`, `super_package`;
  - names a request: `transport_request`, `transport_number`, `target_number`.
- **Only tools that change something are checked**: those the binary's `-ro` twin does not
  serve (full set against core-ro, compact against compact-ro). A read that names a package or a
  request (`GetPackage`, `GetTransport`, compact `HandlerGet`) is not checked. (See Questions.)
- **Names that look alike and are not checked**, held by a test: `package_type`,
  `transport_layer`, `transport_type`, `task_type`, `include_subpackages`, `include_tasks`,
  `packages`, `package_names`.
- **Counts** (Measured, onprem and cloud variants together):
  - full set: 88 tools that change something name a package or a request — 25 a package, 86 a
    request. 19 tools that change something name neither: the 17 `Activate*`,
    `CreateTransport` and `UpdateServiceBinding`. They are not checked by these lists.
  - compact: 6 tools — `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerLock`,
    `HandlerTransportMoveObjects`, `HandlerTransportSortAndCompress`.
  - The full list is Appendix B.
- **A move.** No tool moves an object to another package (no checked argument does). A whole
  document written by compact `HandlerUpdate` (`PACKAGE`, `DOMAIN`, `DATA_ELEMENT`,
  `FUNCTION_GROUP`) may carry a package inside its text; the text is not analysed (the checks
  are formal).
- **A create of a package** names two packages, the new one (`package_name`) and its parent
  (`super_package`); both are checked.
- **A test fixes the derived table** against Appendix B, so a tool that gains or loses such an
  argument shows in a reviewed diff.

## 5. The draft tool

The draft is not a restriction. A read tool answers the facts; the model calls it when it
wants to know and decides what to do. No setting, limit or check of the server's acts on a
draft, and no other tool reads it.

- **Name and place.** `GetObjectDraft`, in the system set: every full binary, core-ro included
  (it changes nothing), on every transport. Compact: a part of `HandlerGet`, `part: 'draft'`,
  so it is in compact and compact-ro without a new tool. On premise and ABAP cloud; not on the
  legacy variant until measured there.
- **Arguments.** As `GetObjectVersions` names an object: `object_type*`, `object_name*`,
  `function_group_name` (a function module's group). `object_type` lists only the types §5.1
  admits, per variant. Compact: `HandlerGet`'s `object_type` and its name arguments, the
  `draft` part offered for the same types.
- **What it sends.** Three reads of the object at `version` `active`, `inactive` and the
  caller's working version, each answer's ETag taken through a client built with the
  `wireItself` reading (§1). The three depend on nothing, so the tool is recordable in batch
  mode (an entry in `tools/batch-handlers.json`) and is not a long tool.
- **The answer:**
  - `draft`: `none` (`active` ETag = `inactive` ETag), `own` (`inactive` ≠ `active` and working
    = `inactive`), `other` (working = `active` ≠ `inactive`), or `undetermined` (the three fit
    none of these);
  - `changed_at`: for `own` and `other`, the `inactive` ETag's first 14 digits as a UTC time
    (ISO 8601), the draft's last write;
  - `age_seconds`: for `other` and `own`, now (UTC, the server's clock) minus `changed_at`;
  - `etags`: the three ETags as SAP sent them, with `detail: 'full'` (`terse` leaves them out).
- **Failures.** A read that fails answers as the tool's reads answer today: SAP's status and
  message (a `404` for an object that does not exist). An ETag missing, or not led by 14
  digits, answers `draft: 'undetermined'` with what came.
- **The clock.** The age uses the server's clock against SAP's ETag time. Both systems measured
  an offset of 0 s; the description and the docs say a skewed server clock skews the age.
  Nothing is kept between calls.
- **Locks.** Another user's lock is not visible before locking (Measured); the tool says
  nothing about locks, and its description says so.

### 5.1 Which types have versions to compare

- **Source-based types (Measured for programs and classes, on premise and cloud):** the three
  versions of the main source answer the 14-digit ETag shape. The plan measures the others the
  tool would offer before they are listed: interface, include, function module, CDS view,
  behavior definition, behavior implementation, metadata extension, service definition, table
  and structure (their source form).
- **Metadata-only types** (domain, data element, function group, package, table type, message
  class, service binding). Measured in code: the server sends `version` on the metadata reads
  of domain, data element and function group (23.0.0), and a class's metadata answered its
  inactive document to `inactive` and to `workingArea` (adt-clients' `readQuery`, on premise,
  2026-11-01). So `?version=` is accepted on those metadata reads. Not measured: whether their
  ETags tell the three versions apart. The one metadata ETag seen, a class's on the cloud trial,
  had another shape (40 digits, two timestamps). The plan measures each such type with two
  users; a type is offered only where the three ETags tell `none`, `own` and `other` apart, and
  the docs list the types not offered.
- **The working version's name.** The probes sent `version=workspace`; adt-clients sends
  `workingArea` verbatim. The plan's first step measures whether `workingArea` answers as
  `workspace` did for a second user. If not, `interfaces-adt` and `adt-clients` add `workspace`
  in a minor, published first.

## 6. Table data

- **Tools that name a table whose rows they answer** (Measured): `GetTableContents`
  (`table_name`) and compact `HandlerGetData` (`object_name`). Both are in every binary,
  `-ro` included.
- **Not covered:** `GetSqlQuery` and `HandlerGetData` `sql_query` are free SQL, allowed or not by
  the deny list (see Questions for `sql_query`). `AmdpDebugGetTable` and `HandlerDebugMaintain`
  `getDataPreview` read a debuggee's table variable, not a table by name; the deny list governs
  the debugger. A tool that names a table for its definition (`GetTable`, `CreateTable`) reads
  no rows.

## 7. Tests

- **Unit, per check and per refusal:** each grammar form and each malformed form of each row,
  in each of CLI, environment and YAML; both table lists together;
  a denied tool absent from `tools/list`; a denied value absent from the enum, the description
  and the search members; a tool with every value denied absent; an unmatched entry ignored
  with its stderr line; each form left absent (no row, an empty variable) restricting nothing;
  each refusal code, its words, and that nothing was sent and no connection was taken (a
  recording connection); an argument not given passing; a refused call in batch mode taking no
  number.
- **The draft tool, unit:** each answer from recorded ETag triples (`none`, `own`, `other`,
  `undetermined`), a failed read, a missing ETag, the age against a fixed clock, `terse` and
  `full`, the three reads recorded in one batch.
- **Nothing configured.** The listed-schema fixture and the surface fixtures stay
  byte-identical, and no wrapper calls a strategy. A test runs every tool with no strategy and
  compares the requests sent with today's.
- **The derived table** (Appendix B) is fixed by a test (§4). The new tool and part enter the
  surface fixtures as reviewed additions; nothing else in them moves.
- **Live** (the repository's integration conventions: `tests/test-config.yaml`, skipped with
  the reason where the system or the second user is not configured):
  - the draft tool, on premise: two users (a second session file named in the test config;
    each user writes only through its own connection), `none`, `own` and `other`, for every
    type offered;
  - the draft tool, ABAP cloud trial: one user, `none` and `own`;
  - packages and requests: one hard-mode run on premise proving an allowed create runs and a
    refused one sends nothing. They read no SAP, so the rest is unit.

## 8. Docs and semver

- **Docs:** a new `docs/user-guide/ACCESS_RESTRICTIONS.md` (every setting, the grammar, what is
  checked and what is not); the tool lists (`AVAILABLE_TOOLS*.md`, generated) and a section on
  `GetObjectDraft` (its answer, the types offered, the server clock, first writer wins);
  `CLI_OPTIONS.md`, `docs/configuration/YAML_CONFIG.md`, `src/lib/config/README.md`;
  `BATCH_MODE.md` (a refused call in a batch; the draft tool recordable);
  `HANDLERS_MANAGEMENT.md` and the embeddable docs (`accessChecks`, `withoutDenied`);
  `README.md`; `SECURITY.md` (the checks are formal: SAP's authorization remains the
  boundary); `CHANGELOG.md`.
- **Semver: a minor** of the eighteen packages, versioned together. Everything is additive: new
  rows, an optional option, new exported types, new refusal codes that appear only when
  configured, one new read tool and one new `HandlerGet` part. With nothing configured no
  existing answer changes. No migration note.
- **Other packages.** None, unless the plan's first measurement finds that `workingArea` is not
  the caller's working version for another user's draft. Then `interfaces-adt` and
  `adt-clients` add a `workspace` version in a minor, published first.

## 9. Order inside the PR

1. Measure: `workingArea` against `workspace` with two users on premise; the ETag through
   `wireItself`; the versions of every type the draft tool would offer (§5.1); the projection
   taking a member set.
2. The rows and their readers.
3. The deny list at registration.
4. The interface, the wrappers, the refusals, the shipped strategy.
5. The draft tool and its `HandlerGet` part.
6. Docs, then the live runs.

## Questions for the owner

1. **Do the lists check reads that name a package or a request?** The goal says "a call that
   names a package". `GetPackage`, `GetPackageContents`, `GetPackageTree`, `GetTransport`,
   `ReadTransportObjects`, `ReadTransportActionLog` and compact `HandlerGet` / `HandlerValidate`
   name one and change nothing. Recommendation: no; the lists apply to the tools the binary's
   `-ro` twin does not serve (§4). That rule is mechanical, and it also checks `CheckPackage`
   and `ValidateServiceBinding`, which change nothing but are not in core-ro.
2. **A task number in the requests list.** `AddTransportObject`, `RemoveTransportObject`,
   `MoveTransportObjects` and `SortAndCompressTransportTask` name a task, not a request. With no
   call to SAP the server cannot find the task's request. Recommendation: match the number as
   given, so an exact entry for a request does not cover its tasks; a prefix entry covers both;
   the docs say to list tasks or use a prefix.
3. **Tool-name prefixes (`Delete*`).** ARC-1 refuses wildcards across tools. The full set has no
   actions: deleting is 27 tools. Recommendation: allow `Prefix*` over tool names (§2.1); refuse
   only `*` alone and `*.value`.
4. **`HandlerGetData` with `sql_query`.** It is free SQL inside a tool that also reads a named
   table, so the deny list cannot take it away without the table read. Recommendation: treat the
   mode as an action, `HandlerGetData.sql`, which removes `sql_query` from the listed schema at
   registration.
5. **Order with the static-types change.** It rewrites both registration wrappers and turns the
   schemas into zod (24.0.0). Recommendation: build this on top of it after it merges, and
   release it as 24.1.0.
6. **A list file of its own.** The goal speaks of a list file that may not exist. No row here
   takes one: a long list goes in the `--conf` YAML file, whose missing-file behaviour (the
   template written, the start ending `0`) predates this change. Recommendation: keep it so. If
   a row should also take a file path (ARC-1's `./deny-actions.json`), a missing file would
   restrict nothing and a file that is there but cannot be parsed would stop the start.

## Appendix A. Tools that change something

Full set, 105 (onprem and cloud together; the onprem-only ones marked ¹):

- **Create, 25:** CreateBehaviorDefinition, CreateBehaviorImplementation, CreateCdsUnitTest,
  CreateClass, CreateDataElement, CreateDdl, CreateDomain, CreateFunctionGroup,
  CreateFunctionGroupUnitTest, CreateFunctionInclude, CreateFunctionModule, CreateInclude¹,
  CreateInterface, CreateMessageClass, CreateMessageClassMessage, CreateMetadataExtension,
  CreatePackage, CreateProgram¹, CreateProgramUnitTest¹, CreateServiceBinding,
  CreateServiceDefinition, CreateStructure, CreateTable, CreateTableType, CreateUnitTest.
- **Update, 30:** UpdateBehaviorDefinition, UpdateBehaviorImplementation, UpdateCdsUnitTest,
  UpdateClass, UpdateDataElement, UpdateDdl, UpdateDomain, UpdateFunctionGroup,
  UpdateFunctionGroupUnitTest, UpdateFunctionInclude, UpdateFunctionModule, UpdateInclude¹,
  UpdateIncludeMetadata¹, UpdateInterface, UpdateLocalDefinitions, UpdateLocalMacros,
  UpdateLocalTestClass, UpdateLocalTypes, UpdateMessageClass, UpdateMessageClassMessage,
  UpdateMetadataExtension, UpdatePackage, UpdateProgram¹, UpdateProgramUnitTest¹,
  UpdateServiceBinding, UpdateServiceDefinition, UpdateStructure, UpdateTable, UpdateTableType,
  UpdateUnitTest.
- **Delete, 27:** DeleteBehaviorDefinition, DeleteBehaviorImplementation, DeleteCdsUnitTest,
  DeleteClass, DeleteDataElement, DeleteDdl, DeleteDomain, DeleteFunctionGroup,
  DeleteFunctionInclude, DeleteFunctionModule, DeleteInclude¹, DeleteInterface,
  DeleteLocalDefinitions, DeleteLocalMacros, DeleteLocalTestClass, DeleteLocalTypes,
  DeleteMessageClass, DeleteMessageClassMessage, DeleteMetadataExtension, DeletePackage,
  DeleteProgram¹, DeleteServiceBinding, DeleteServiceDefinition, DeleteStructure, DeleteTable,
  DeleteTableType, DeleteUnitTest.
- **Activate, 17:** ActivateBehaviorDefinition, ActivateClass, ActivateDataElement,
  ActivateDdl, ActivateDomain, ActivateFunctionGroup, ActivateFunctionModule, ActivateInclude¹,
  ActivateInterface, ActivateMetadataExtension, ActivateObjects, ActivateProgram¹,
  ActivateServiceBinding, ActivateServiceDefinition, ActivateStructure, ActivateTable,
  ActivateTableType.
- **Transport, 6:** AddTransportObject, CreateTransport, CreateTransportTask,
  MoveTransportObjects, RemoveTransportObject, SortAndCompressTransportTask.

Compact, 7: HandlerCreate (19 object types, `TRANSPORT` among them), HandlerUpdate (24),
HandlerDelete (24), HandlerActivate (18), HandlerTransportCreate, HandlerTransportMoveObjects,
HandlerTransportSortAndCompress.

Not counted as changes to objects (the deny list governs them): the `Check*`, `Run*UnitTest`,
`RunAbapUnit`, `RunCdsUnitTest`, `RuntimeRun*`, `RuntimeCreateProfilerTraceParameters`, the
debugger, background-run, batch, lock and session tools.

## Appendix B. Checked arguments

Tools the `-ro` twin does not serve, by the arguments they declare (Measured, 23.1.0):

- **`transport_request` only, 58:** UpdateTableType, DeleteDomain, DeleteTableType,
  UpdateMessageClass, DeleteMessageClass, CreateMessageClassMessage, UpdateMessageClassMessage,
  DeleteMessageClassMessage, DeleteDataElement, UpdateTable, DeleteTable, UpdateStructure,
  DeleteStructure, UpdateDdl, DeleteDdl, UpdateServiceDefinition, DeleteServiceDefinition,
  DeleteServiceBinding, UpdateClass, DeleteClass, CreateUnitTest, UpdateUnitTest,
  DeleteUnitTest, UpdateCdsUnitTest, DeleteCdsUnitTest, CreateProgramUnitTest,
  UpdateProgramUnitTest, CreateFunctionGroupUnitTest, UpdateFunctionGroupUnitTest,
  UpdateLocalTestClass, DeleteLocalTestClass, UpdateLocalTypes, DeleteLocalTypes,
  UpdateLocalDefinitions, DeleteLocalDefinitions, UpdateLocalMacros, DeleteLocalMacros,
  UpdateInclude, UpdateIncludeMetadata, DeleteInclude, UpdateProgram, DeleteProgram,
  UpdateInterface, DeleteInterface, UpdateFunctionGroup, DeleteFunctionGroup,
  CreateFunctionModule, UpdateFunctionModule, DeleteFunctionModule, CreateFunctionInclude,
  UpdateFunctionInclude, DeleteFunctionInclude, UpdateBehaviorDefinition,
  DeleteBehaviorDefinition, UpdateBehaviorImplementation, DeleteBehaviorImplementation,
  UpdateMetadataExtension, DeleteMetadataExtension.
- **`package_name` and `transport_request`, 22:** UpdatePackage, DeletePackage, CreateDomain,
  CreateTableType, UpdateDomain, CreateMessageClass, CreateDataElement, UpdateDataElement,
  CreateTable, CreateStructure, CreateDdl, CreateServiceDefinition, CreateServiceBinding,
  CreateClass, CreateCdsUnitTest, CreateInclude, CreateProgram, CreateInterface,
  CreateFunctionGroup, CreateBehaviorDefinition, CreateBehaviorImplementation,
  CreateMetadataExtension.
- **`package_name`, `super_package` and `transport_request`, 1:** CreatePackage.
- **`package_name` and `super_package`, 1:** CheckPackage.
- **`package_name`, 1:** ValidateServiceBinding.
- **`transport_number`, 4:** CreateTransportTask (a request), AddTransportObject,
  RemoveTransportObject, SortAndCompressTransportTask (a task).
- **`transport_number` and `target_number`, 1:** MoveTransportObjects (tasks).
- **Compact:** HandlerCreate (`package_name`, `super_package`, `transport_request`),
  HandlerUpdate (`package_name`, `transport_request`), HandlerDelete (`package_name`,
  `transport_request`), HandlerLock (`super_package`), HandlerTransportMoveObjects
  (`transport_number`, `target_number`), HandlerTransportSortAndCompress (`transport_number`).

Not checked, since the `-ro` twin serves them: GetPackage, GetPackageContents, GetPackageTree,
GetTransport, ReadTransportObjects, ReadTransportActionLog; compact HandlerGet, HandlerValidate.

## Appendix C. Dispatching arguments of the compact tools

- `object_type`: HandlerActivate, HandlerCheckRun, HandlerCreate, HandlerDelete,
  HandlerDeletionCheck, HandlerGet, HandlerLock, HandlerUnlock, HandlerUpdate, HandlerValidate,
  HandlerWhereUsed.
- `action`: HandlerBatch, HandlerDebugBatch, HandlerSession.
- `operation`: HandlerDebugSession, HandlerDebugStep, HandlerDebugBreakpoints,
  HandlerDebugMaintain.
- `target_type`: HandlerProfileRun.
- `sql`: HandlerGetData's `sql_query` mode, as a pseudo-value that removes the argument, if
  Question 4 is taken.
- Every other tool, full set included, takes `Tool` only; `Tool.value` on it matches nothing
  and is ignored.
