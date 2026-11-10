# Spec: the business-data tools are opt-in

Goal: `2026-11-10-data-tools-opt-in-goal.md`. This spec says what is built and where, for
24.0.0. Every claim carries a label: **Code** (read in the source, `file:line` at
`d5a29d08`), **Measured** (a run or a fetch), or **Inference**.

## 0. The source

- SAP API Policy FAQ, version 1.3, June 2026, question 33, "How does the policy apply to
  ADT-based access and developer tooling?" (Measured: the PDF was fetched and its text
  extracted, 2026-11-10). It reads: "ADT APIs are not intended for programmatic reading of
  application tables or export of business data, SQL execution against SAP backend
  systems, business data integration or runtime orchestration, agentic AI workflows
  operating on business data, or substitution for business APIs."
- The FAQ's preamble says it "is provided for informational purposes only and does not
  constitute … a binding commitment of any kind" (Measured, same fetch).
- URL: https://d.dam.sap.com/x/UL9AiqH/SAP_API_Policy_FAQ_v1.3_June.pdf

## 1. What the code shows

### The two tools and their compact form

- **`GetSqlQuery`** runs the `SELECT` it is given through `utils.getSqlQuery`, which is the
  `/sap/bc/adt/datapreview/freestyle` document (Code,
  `src/handlers/system/readonly/handleGetSqlQuery.ts:18-21, 42-57, 82-85`). It is registered
  in `SystemHandlersGroup` (Code, `src/lib/handlers/groups/SystemHandlersGroup.ts:158`).
- **`GetTableContents`** reads `SELECT * FROM <table>` through the same freestyle
  preview (Code, `src/handlers/table/readonly/handleGetTableContents.ts:20-27, 66-80`). It is
  registered in `ReadOnlyHandlersGroup` (Code,
  `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts:209`).
- **`HandlerGetData`** is the compact sets' one tool over both reads: it takes
  `sql_query` or `object_name` and calls the two entries (Code,
  `compact-readonly-entries/src/handlers/handleHandlerGetData.ts:13-56`). It is registered
  in `compactReadOnlyEntries()` (Code, `compact-readonly-entries/src/group.ts:108`). No
  route of `HandlerGet` reads data (Code, grep over `compactReadRoutes.ts` and
  `compactPartRoutes.ts`).
- **Scope consequence.** "Both tools off in compact" means `HandlerGetData` off, since the
  compact sets list neither `GetSqlQuery` nor `GetTableContents` by name (Code, above).
  This spec treats the three names as one class, the data tools.

### How a tool reaches a listing today

- **Four tool sets, three transports.** A `ToolSet` builds its groups with
  `groups(context, transport)` (Code, `src/lib/toolSet.ts:122`). `registryOf(toolSet,
  transport)` is what every launcher serves (Code, `src/lib/toolSet.ts:129-136`;
  `server-runtime/src/stdio/launcher.ts:860`, `http/launcher.ts:171`,
  `sse/launcher.ts:169`).
- **The sets.**
  - `fullToolSet` (Code, `toolSet.ts:266-313`) and `fullReadOnlyToolSet` (Code,
    `toolSet.ts:322-361`). Both contain `ReadOnlyHandlersGroup` and `SystemHandlersGroup`:
    the full set through `expositionGroups(['readonly', 'high', 'debug'], …)` (Code,
    `src/lib/handlers/registry/expositionRegistry.ts:57-61`), the read-only set directly
    (Code, `toolSet.ts:348-352`).
  - `compactToolSetOf(halves)` (Code, `toolSet.ts:386-428`) and
    `compactReadOnlyToolSetOf(readOnly)` (Code, `toolSet.ts:437-475`). Both carry
    `compactReadOnlyEntries` through `CompactHandlersGroup`.
  - The six compact binaries build their set in their own launcher (Code,
    `compact/src/launcher.ts:29`, `compact-http/src/launcher.ts:22`,
    `compact-sse/src/launcher.ts:22`, `compact-ro/src/launcher.ts:31`,
    `compact-http-ro/src/launcher.ts:31`, `compact-sse-ro/src/launcher.ts:30`).
- **The existing per-dimension gate.** The transport already decides which groups a set
  serves. The leftover-session groups are added on stdio only (Code, `toolSet.ts:298-313,
  354-356, 419-421, 467-469`, `servesLeftoverSessions`). The long-session group is added on
  Streamable HTTP only (Code, `servesLongSession`, same blocks). That is the mechanism the
  new gate joins.
- **The per-entry gates.**
  - `listedTool` drops an entry the declared variant's ADT type table does not serve
    (`TOOL_NEEDS`), or whose `available_in` leaves the environment out (Code,
    `src/lib/listedTool.ts:75-104`; `src/lib/variantToolSet.ts:404-418`). The two data
    tools are in `TOOLS_WITHOUT_NEED`, so the table does not gate them (Code,
    `variantToolSet.ts:333, 361`). All three declare `available_in: ['onprem', 'cloud']`
    (Code, the three `TOOL_DEFINITION`s).
  - The background-run tools are left out where no store is held (Code,
    `src/embeddable/BaseMcpServer.ts:1498`).
  - `ReadOnlyHandlersGroup` withholds a copy of a tool another group serves
    (`overridingToolNames`, `IReadOnlyDedupStrategy`; Code,
    `ReadOnlyHandlersGroup.ts:185-204`).
  - No deny list exists, and no exposition filter exists in the binaries (Code: grep for
    deny, exclude, withheld and filter over `src/lib`). `--exposition` is gone and refused
    (Code, `toolSet.ts:42-44`).
- **Three registration paths read `group.getHandlers()`:**
  - `BaseMcpServer.registerHandlers` (Code, `BaseMcpServer.ts:1458-1521`);
  - `CompositeHandlersRegistry.registerGroups` (Code,
    `src/lib/handlers/registry/CompositeHandlersRegistry.ts:96-126`);
  - `BaseHandlerGroup.registerOneTool` (Code, `src/lib/handlers/base/BaseHandlerGroup.ts:93-115`).

  A group that does not hand out an entry is therefore absent on all three (Inference from
  that code).
- **The fixed-set rule written into the code.** The comments say: "The binary
  fixes the tool set … never by a flag" (Code, `toolSet.ts:10`, `toolSet.ts:101`,
  `server-runtime/src/stdio/launcher.ts:291, 859`). The help says: "serves one fixed tool
  set; the binary chooses it, not a flag" (Code, `toolSet.ts:234`). This change makes the
  data tools the one exception. The words change with it (§5).

### How the binaries take configuration

- **Every binary has a parameter table.** It is read by `readParameters`: "CLI beats env
  beats YAML; a row set nowhere takes its default" (Code,
  `src/lib/config/authParameters.ts:373-395`; `readRow`, `:353-371`).
  - A `flag` row reads `true` or `false` from any form. `--x` alone is `true`, and
    `--x=false` is `false`. Anything else is refused with `Invalid <form> … Must be true or
    false` (Code, `authParameters.ts:280-293, 325-345`).
  - The model the task names is the `--unsafe` row (Code,
    `server-runtime/src/stdio/config/coreParameters.ts:84-92`), read as
    `flagValue(values.unsafe) ?? false` (Code, `:484`). That row is stdio's alone.
  - A row every binary reads is lib's shared `BATCH_KEEP_RAW_PARTS_ROW` (Code,
    `authParameters.ts:683-704`). It appears in the stdio, HTTP and SSE tables (Code,
    `coreParameters.ts:332`, `http/config/httpParameters.ts:128`,
    `sse/config/sseParameters.ts:125`) and is read into `IServerConfig.batchKeepRawParts`
    (Code, `src/lib/config/IServerConfig.ts:64-69`; `coreParameters.ts:469`,
    `httpParameters.ts:179`, `sseParameters.ts:176`).
- **HTTP and SSE.** The task's premise that HTTP and SSE take configuration from headers
  and request parameters only holds for the destination and credentials, not for
  server-level settings. Each request's `x-sap-*` headers carry the system and the
  credentials (Code, `server-runtime/src/http/launcher.ts:3, 66-90`;
  `StreamableHttpServer.ts:174-178, 278-297`; `SseServer.ts:131-139`). The listener's own
  settings come from its start parameters, by the same table and the same precedence (Code,
  `httpParameters.ts:116-191`; `sseParameters.ts:113-176`).
  - The system type is the precedent for a setting that changes the tool list. It is
    stated by `--system-type`, `SAP_SYSTEM_TYPE` or YAML, and "no request header states it"
    (Code, `http/launcher.ts:159-170`).
  - The registry is built once, at the launch, and every pooled instance serves it (Code,
    `http/launcher.ts:171`; `sse/launcher.ts:169`).
  - So the flag reaches HTTP and SSE as a start parameter, a shared row, exactly as
    `--batch-keep-raw-parts` does. No header and no request parameter states it.
- **The help is generated from the table** (Code, `authParameters.ts:511-560`,
  `parametersHelp` and `generateHelp`). So a new row reaches every binary's `--help`.
  stdio's hand-written ENVIRONMENT section lists some variables by hand (Code,
  `stdio/launcher.ts:110-120`).

### What a client sees for a tool a set does not serve

- An entry `listedTool` drops is not registered on the SDK server (Code,
  `BaseMcpServer.ts:1508-1521`; `CompositeHandlersRegistry.ts:110`;
  `BaseHandlerGroup.ts:100-106`). The same holds for the background-run tools without a
  store (Code, `BaseMcpServer.ts:1498`) and for the leftover-session tools on HTTP and SSE
  (Code, `toolSet.ts:298-303`).
- `tools/list` does not carry such a tool, and `tools/call` of its name is answered by the
  SDK with `McpError` `InvalidParams` "Tool <name> not found" (Code,
  `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js:147`, SDK 1.32.1).
- Absent, not present-and-refusing, is how every gated tool behaves today. The data tools
  off follow the same rule (Code, above).

## 2. The flag

- **Name:** `--enable-data-tools`, `MCP_ENABLE_DATA_TOOLS`, YAML `enable-data-tools`. The `--enable-…` form follows `--http-enable-dns-protection` /
  `MCP_HTTP_ENABLE_DNS_PROTECTION` (Code, `httpParameters.ts:98-106`).
- **The row.** One shared `Parameter` in `src/lib/config/authParameters.ts`, beside
  `BATCH_KEEP_RAW_PARTS_ROW` (`:683-704`), with constants for its three names in the same
  form (`…_CLI`, `…_ENV`, `…_YAML`). It is exported through `src/lib/config/index.ts` as
  that row is (`:22`).
  - `kind: 'flag'`, `default: false`.
  - A section of its own: `DATA TOOLS`.
  - Help words: "Serves the tools that read business data:
    GetSqlQuery and GetTableContents (compact: HandlerGetData). Off by default. SAP API
    Policy FAQ v1.3 (June 2026), Q33, says ADT APIs are not intended for reading
    application tables, exporting business data or running SQL against SAP systems.
    Whether to turn this on is the customer's decision."
- **In every binary's table.** The row goes into `coreParameters` (rows at
  `coreParameters.ts:325-334`), `httpParameters` (`httpParameters.ts:122-130`) and
  `sseParameters` (`sseParameters.ts:119-127`). The binary packages take these tables with
  their own set, so all twelve binaries get it (Code, `coreParameters.ts:312-318`;
  `httpParameters.ts:109-115`).
- **Read into the config.** `IServerConfig` gains `enableDataTools?: boolean`, beside
  `batchKeepRawParts` (`IServerConfig.ts:64-69`). `readCoreConfig` (`coreParameters.ts:462-496`),
  `readHttpConfig` (`httpParameters.ts:174-190`) and `readSseConfig` (`sseParameters.ts:171-…`)
  each read it as `values.enableDataTools === true`, the batch row's form.
- **No other form.** There is no header, no request parameter, no tool argument and no
  `.env` key. The destination's `.env` feeds the process environment only for
  `SAP_CONNECTION_TYPE` and `SAP_SYSTEM_TYPE` (Code, CHANGELOG `[24.0.0]`, "A destination's
  `.env` no longer feeds the process environment"). So a destination file cannot turn it
  on (Inference from that rule; a unit test proves it, §8).

## 3. The gate: a data group, chosen like the transport's groups

- **The entries move into groups of their own.**
  - `DataHandlersGroup` (new, `src/lib/handlers/groups/DataHandlersGroup.ts`, exported from
    `groups/index.ts`) registers `GetSqlQuery` and `GetTableContents`. They leave
    `SystemHandlersGroup.ts:158` and `ReadOnlyHandlersGroup.ts:209`.
  - `compactDataEntries` (new, in `compact-readonly-entries/src/group.ts`, exported from
    `index.ts:14` beside `compactReadOnlyEntries`) builds `HandlerGetData`, which leaves
    `group.ts:108`. It stays in the read-only half's package, so the compact module-graph
    split is unchanged (Inference; `compactCapabilitySplit.test.ts` checks it).
  - The definitions and handlers stay where they are. `READ_DEFINITIONS` and the exports of
    `@mcp-abap-adt/lib/handlers/read` keep both (Code, `src/lib/handlers/readDefinitions.ts:77-78`;
    `read.ts:69, 80`).
- **The choice is a typed input of the set.** `ToolSet.groups(context, transport, served)`
  and `registryOf(toolSet, transport, served)` take a required `served:
  ServedTools`, defined in `toolSet.ts` as `{ readonly dataTools: boolean }`.
  - Required, so the compiler finds every caller: the three launchers, the docs
    generator, `scripts/list-tools.ts` and the tests.
  - Each set adds its data group only when `served.dataTools` is `true`, in the
    `servesLeftoverSessions` form:
    - `fullToolSet` and `fullReadOnlyToolSet` place `DataHandlersGroup` right after
      `SystemHandlersGroup`;
    - the compact sets place the data builder right after the read-only builder in
      `CompactHandlersGroup`.
  - `CompactHalves` (`toolSet.ts:365-370`) gains `data`. `compactReadOnlyToolSetOf` takes
    `{ readOnly, data }` instead of one builder. The six compact launchers pass
    `compactDataEntries`.
- **The launchers pass the config.** Each launcher passes `{ dataTools:
  config.enableDataTools === true }`: stdio at `launcher.ts:860`, HTTP at `:171`, SSE at
  `:169`.
- **`streamableHttpSurface`** (`toolSet.ts:168-197`) also takes `served`. It only compares
  `http` against `stdio`, and the flag adds the same names to both (Inference), so the docs
  pass it on.
- **Why not a third reason in `listedTool`.** That would thread the flag through three
  registration paths and the docs generator. It would also run beside the group choice the
  sets already make, a parallel mechanism the goal rules out. The group choice reaches all
  three paths through `getHandlers()` (§1).
- **What else follows unchanged.** The long-tool, batch and tool-search tables keep their
  three rows (`src/lib/longTools.ts:34-46`, `tools/batch-handlers.json:343-351, 601`,
  `tools/long-handlers.json:63-138`, `tools/tool-search.json`). A row for a tool that is
  not registered is read by nothing (Code: each is looked up by the registered tool's name,
  `BaseMcpServer.ts:1492-1507`). Background runs of a data tool cannot start where the tool
  is absent. Batch mode records only a registered tool's call (Inference from the runCall
  wrapper, `BaseMcpServer.ts:1522-…`).
- **Order.** With the flag on, `tools/list` carries the data tools at the data group's
  place, not where they were. The tool order inside a set changes; the set's contents do
  not (§8).

## 4. The embeddable API

The data tools are off for embedders too: an embedder serves them only by stating so.

- `EmbeddableMcpServer`'s `exposition` (`src/embeddable/EmbeddableMcpServer.ts:153`)
  gains `'data'`, which is not in the default `['readonly', 'high']` (`:323`).
  `createDefaultRegistry` (`:334-382`) adds `DataHandlersGroup` for it.
- `expositionGroups` (`expositionRegistry.ts:39-87`) adds the group for `'data'`.
  `HandlerSet` (`src/lib/config/IServerConfig.ts:29`) gains the word.
- `HandlerExporter` (`src/lib/handlers/HandlerExporter.ts:60-110, 202-240`) gains
  `includeData?: boolean`, read as `=== true` (off unless stated). This differs from its
  `include…` siblings, which are read as `!== false` (Code, `:220, 230`), and the doc
  comment says why.
- An embedder that constructs `ReadOnlyHandlersGroup` or `SystemHandlersGroup` directly
  loses the tool its group carried and adds `DataHandlersGroup`. This is breaking for
  embedders, and the MIGRATION note tells them what to state: `exposition: [..., 'data']`,
  `includeData: true`, or `DataHandlersGroup` / `compactDataEntries` with the new
  `groups` / `registryOf` argument.

## 5. Words, help and docs

- **The code's own words.** Rewrite the comments and help that say the set is fixed "never
  by a flag" to say that the binary fixes the set, and one flag adds the data tools (Code
  sites: `toolSet.ts:10-44, 101, 234`; `stdio/launcher.ts:291, 859`).
  - `toolsSection` (`toolSet.ts:225-245`) gains a line, in every set's help, naming the
    data tools, the flag and FAQ Q33.
  - stdio's hand-written ENVIRONMENT list (`stdio/launcher.ts:113-120`) gains the
    variable.
- **README.**
  - "Features" names `GetTableContents` (`README.md:274`) and `GetSqlQuery` (`:294`): mark
    both opt-in, with the flag.
  - "Command-Line Options" (`:496`) gets a paragraph: off by default in every binary; the
    flag in its three forms; FAQ Q33 quoted with its URL; "whether to enable it is the
    customer's decision".
  - The same paragraph names the other tools that can reach business data (§7). They are
    served as before; their review is a separate task.
- **User docs.**
  - `docs/user-guide/CLI_OPTIONS.md` gets a row in the shared table (near `:50`).
  - `docs/configuration/YAML_CONFIG.md` gets the key (near `:41`).
  - `docs/user-guide/HANDLERS_MANAGEMENT.md:85` marks `HandlerGetData` opt-in.
  - `docs/user-guide/BATCH_MODE.md:514, 520, 577` gets a note that the rows apply where the
    flag is on.
  - `docs/deployment/DOCKER.md` gets the environment variable for a container.
- **Tool pages.** `tools/generate-tools-docs.js` builds `AVAILABLE_TOOLS*.md` from the
  built sets (`:300-305, 479-483`). It builds them with `{ dataTools: true }` and marks the
  three tools "opt-in: `--enable-data-tools`". Pages that silently lose them would hide the
  flag (Inference).
- **Registry manifests.** The twelve `server*.json` files list environment variables (Code,
  `server.json:20-52`; `server-http.json:62-68`). Each gains `MCP_ENABLE_DATA_TOOLS`. Whether
  a manifest must list every variable is not checked here (Inference).
- **CHANGELOG** `## [24.0.0]` gets two items, each with its **Migrating:** line:
  - "Changed — breaking for a caller of `GetSqlQuery`, `GetTableContents` and compact
    `HandlerGetData`: off by default". It gives the flag, FAQ Q33 and the customer's
    decision.
  - "Changed — breaking for an embedder of the handler groups". It covers `ToolSet.groups`
    and `registryOf`, `ServedTools`, `DataHandlersGroup`, `compactDataEntries`, the
    `CompactHalves.data` and `compactReadOnlyToolSetOf` signature, `exposition: 'data'` and
    `includeData`.
- **MIGRATION.** `docs/MIGRATION-24.0.md` is the 24.0.0 note and is not released (Measured:
  no `v24*` tag; the CHANGELOG dates `[24.0.0]` 2026-11-10). It gains a section "Callers of
  `GetSqlQuery`, `GetTableContents` and `HandlerGetData`: off unless enabled". The section
  covers:
  - start every binary that must serve them with the flag in any of its three forms;
  - on HTTP and SSE it is a start parameter of the server, not a header;
  - a client of a server started without it gets "Tool … not found";
  - embedders: `exposition: [..., 'data']`, `includeData: true`, or `DataHandlersGroup`
    and the new `groups`/`registryOf` argument;
  - FAQ Q33 and the customer's decision.

  No released MIGRATION file is touched.

## 6. Callers that name the tools, and what each needs

Each is Code (grep at `d5a29d08`) unless marked.

- **Through a tool set**, so each needs `served` and must state the flag:
  - `src/__tests__/helpers/servedEntries.ts:31-33`, used by the pin harness and by the
    live files' soft mode (`integration/helpers/live.ts:67, 201-232`): build with
    `{ dataTools: true }`, so the pins and the live cases keep reaching the data tools;
  - `src/__tests__/unit/descriptions/catalog.ts:36-46`: the retrieval queries require the
    data tools (`descriptions/queries.ts:90, 96`), and `toolSearchTable.test.ts:45` wants a
    search entry for every served tool and none for an unserved one. Catalog with
    `{ dataTools: true }`;
  - `descriptions/variantSearchMeta.test.ts:37`;
  - `backgroundRuns/surface.test.ts:50-55, 397, 437`;
  - `unit/toolSurface.test.ts`, `toolSet/compactSurface.test.ts`,
    `toolSet/transportSurface.test.ts`, `toolSet/variantSurface.test.ts`,
    `toolSet/listedSchemas.test.ts`, and the coverage keys
    (`coverage/coverageKeys.ts:61`, `coverageLedger.test.ts`, `hardModeBinaries.test.ts`):
    their fixtures (`tests/fixtures/tools/surface.json`, `variant-surface.json`,
    `http-surface.json`, `stdio-sse-surface.json`, `listed-schemas.json`,
    `coverage-ledger.json`) were captured with the tools served. They stay one set of
    fixtures, the flag-on surface; no flag-off fixture is captured. The off surface is
    asserted as the on surface minus exactly the three names (§8). Only the order and the
    group a tool sits in change; the review checks the regenerated fixtures for that
    alone;
  - `scripts/list-tools.ts:9-41, 98-103`: builds groups and sets directly.
- **Through the groups directly**, so each adds `DataHandlersGroup` or `compactDataEntries`:
  - `unit/longTools/harness.ts:17-34, 71-86` and `longTools/background.test.ts:181`;
  - `unit/backgroundRuns/longReads.test.ts`, `unit/pins/backgroundRuns.pins.test.ts`;
  - `helpers/batchEntryCases.ts:200-201, 416-417` (Inference: through the served entries;
    to be confirmed when the code is written).
- **Through the handler directly**, unaffected:
  - `unit/readonlySingleCall.test.ts:58-60, 150-151, 314-330`;
  - `unit/sqlPreview.test.ts`;
  - `compact-readonly-entries/src/__tests__/compactSearchData.test.ts:24-34, 160-182`;
  - `background-runs-memory/src/__tests__/InMemoryBackgroundRuns.test.ts:80` (a tool name
    as data).
- **Name tables**, unaffected: `unit/sources/batchHandlers.test.ts:86-94`,
  `unit/detailSurface.test.ts:226-227`, `readVersion/readsStateTheirVersion.test.ts:240-269`,
  `coverage/coverage-debt.json`, `descriptions/heldOutQueries.json`.
- **Live cases, to keep running with the flag on**, run later, when the live run is approved:
  - `integration/readOnly/system/SqlQueryHandlers.test.ts` and `TableContentsHandlers.test.ts`.
    In soft mode they call the handler through `LambdaTester` (Code,
    `SqlQueryHandlers.test.ts:16-20`).
  - `integration/coverage/backgroundRuns.live.test.ts`.
  - The cases come from `tests/test-config.yaml.template:2072-2123` (`get_table_contents`,
    `get_sql_query`).
  - In hard mode the launched binaries need the flag:
    - stdio: `destinationArgs` (`integration/helpers/testers/hardMode.ts:801-830`);
    - Streamable HTTP: `startHttp` (`:680-686`), where the flag goes in the argument list.
  - A hard-mode run against a server already running at `http_url` (`hardMode.ts:156-157`)
    depends on how that server was started. The integration README says so.
  - The template needs no new key (Inference: the flag is the launched binary's argument,
    not a test setting).
- **Docs** that name the tools: `README.md:274, 294`, `docs/user-guide/AVAILABLE_TOOLS.md`,
  `AVAILABLE_TOOLS_READONLY.md`, `BATCH_MODE.md`, `HANDLERS_MANAGEMENT.md`, and
  `docs/MIGRATION-24.0.md:464` (the long tools). `docs/MIGRATION-19.0.md:186-188` is
  released and stays as it is.

## 7. Other tools that can reach business data (not in scope)

These stay as they are in 24.0.0; deciding on them is a separate, later task. The README
names them (§5). Each is labelled.

| Tool (compact form) | File | What it reads |
|---|---|---|
| `AmdpDebugGetTable` (`HandlerDebugMaintain` `amdp getDataPreview`) | `src/handlers/debugger/debug/handleAmdpDebugGetTable.ts:11-40`; `src/lib/compact/debug/handleHandlerDebugMaintain.ts:24-37` | The rows of a table variable at an AMDP stop, optionally through a `SELECT` over it, via `/sap/bc/adt/datapreview/amdpdebugger` (Code; endpoint Measured by grep in `node_modules/@mcp-abap-adt/adt-clients/dist/runtime/debugger/amdpDataPreview.js`) |
| `DebugGetVariables` (`HandlerDebugMaintain` `getVariables`, `getChildVariables`) | `handleDebugGetVariables.ts:14-50` | Variable values of the stopped debuggee, table rows included ("a path reads a component or a table row", Code, `handleHandlerDebugMaintain.ts:30`) |
| `DebugSetVariable` (`setVariableValue`) | `handleDebugSetVariable.ts:16` | Writes a variable value at runtime (Code) |
| `MemorySnapshotList`, `MemorySnapshotGet`, `MemorySnapshotDelta`, `DebugCreateMemorySnapshot` | `src/handlers/debugger/debug/handleMemorySnapshot*.ts` | Memory snapshot views: kinds, objects, children, referrers (Code). Whether values are included is not checked (Inference: probably not) |
| `RuntimeGetDumpById` (`HandlerDumpView`) | `src/handlers/system/readonly/handleRuntimeGetDumpById.ts:15-16` | The parsed short dump (Code). A dump carries variable contents (Inference from ST22's known content; not measured) |
| `RuntimeGetGatewayErrorLog` | `handleRuntimeGetGatewayErrorLog.ts:11-12` | Gateway error detail with `errorContext` (Code). Payload data in it is possible (Inference) |
| `RuntimeGetProfilerTraceData` (`HandlerProfileView`) | `handleRuntimeGetProfilerTraceData.ts:16-17` | Trace statements and DB accesses (Code). Whether values appear is not checked (Inference) |
| `RuntimeRunClass`, `RuntimeRunProgram` (`HandlerProfileRun`, `HandlerUnitTestRun`) | `src/handlers/system/high/handleRuntimeRun*.ts` | Run any class or report and return its output, which can be data it selected (Code for the run; Inference for the data). Not in any `-ro` set (Code, `toolSet.ts:33-35`) |

`GetServiceBindingPreviewUrl` answers URLs only, and the other readers read repository
metadata (Code, descriptions). They are not listed.

## 8. Tests

Unit tests only. Each one is proven load-bearing: break the rule, watch the test fail,
revert, and note the mutation in the PR. The test files are placed the way the repository
places new tests at the time of the code (Jest or node:test, `tools/node-test-files.json`).

- **Precedence**, for each of the three tables (`CORE_PARAMETERS`, `HTTP_PARAMETERS`, and
  the SSE table) through `readCoreConfig`, `readHttpConfig` and `readSseConfig`:
  - nothing given → `false`;
  - each form alone → `true`;
  - CLI `--enable-data-tools=false` with `MCP_ENABLE_DATA_TOOLS=true` → `false`;
  - environment `false` with YAML `true` → `false`;
  - CLI `true` with environment `false` → `true`;
  - a value that is not a flag (`yes`, a YAML list) in each form → refused with the form's
    name;
  - the row is in every binary's `--help` and YAML template.

  Mutations: drop the row from one table; reorder `readRow`'s sources; default the row to
  `true`.
- **Not from a destination file.** A stdio start whose destination `.env` holds
  `MCP_ENABLE_DATA_TOOLS=true` serves no data tool. Mutation: let the env file feed it.
- **Tool sets, flag on and off.** For each of the four sets × three transports:
  - the names served with `{ dataTools: true }`, minus the names served with
    `{ dataTools: false }`, are exactly `GetSqlQuery` and `GetTableContents` (full sets) or
    `HandlerGetData` (compact);
  - with `false`, none of the three appears;
  - with `true`, the names equal the one fixture set (flag on); the flag-off surface is
    asserted against that fixture minus exactly the three names, not against a fixture of
    its own.

  Mutations: always add the data group; never add it; leave one tool in its old group.
- **All three registration paths.** For one set with the flag off:
  - `tools/list` from a `BaseMcpServer` instance, `CompositeHandlersRegistry` registered on
    an SDK server, and a group's own `registerHandlers` carry none of the names;
  - `tools/call` of each name is answered "Tool … not found".

  Mutation: re-add an entry to `ReadOnlyHandlersGroup`.
- **The launchers pass the config.** stdio, HTTP and SSE, each started in-process with
  and without the flag, list the tools accordingly. Mutation: pass `{ dataTools: false }`
  in one launcher.
- **Embeddable.**
  - `EmbeddableMcpServer`'s default exposition lists none, and with `'data'` lists both;
  - `HandlerExporter` without `includeData` hands out none, and with `includeData: true`
    hands out both.

  Mutation: read `includeData` as `!== false`.
- **Help words.** Every binary's help carries the FAQ Q33 citation and the
  customer's-decision sentence once.

## 9. Acceptance

- The rows and the gate in §2–§4 are built, with no cast, no `any`, no suppression and no
  regular expression in production code. The repository's static-types gate passes.
- `npm run build`, the lint, `test:check` and the unit run pass. The §8 mutations are
  recorded.
- The fixtures change only in order and group placement under the flag-on surface. The
  flag-off surface is the flag-on one minus the three names.
- The README, the CLI and YAML docs, the tool pages, the CHANGELOG `[24.0.0]` items and the
  MIGRATION-24.0 section are written as in §5.
- The live cases in §6 run with the flag on, when the live run is approved, and pass.

## 10. Decisions

- Off by default in every tool set (full, read-only, compact, compact read-only) and on
  every transport (stdio, Streamable HTTP, SSE).
- One flag, `--enable-data-tools` / `MCP_ENABLE_DATA_TOOLS` / YAML `enable-data-tools`,
  read CLI over environment over YAML (§2). On HTTP and SSE it is a start parameter, a
  shared row like `--batch-keep-raw-parts`, with no header form (§1, §2).
- The flag's help and the README cite FAQ Q33 and leave the decision to the customer; a
  MIGRATION-24.0 section and CHANGELOG `[24.0.0]` items carry the change (§5).
- The gate is a data group chosen by a required `served` argument of `ToolSet.groups` and
  `registryOf` (§3), not a filter in `listedTool`.
- Off for embedders too: `exposition: 'data'` and `includeData: true` (read as `=== true`)
  turn it on, and the MIGRATION note tells embedders (§4).
- Only `GetSqlQuery`, `GetTableContents` and `HandlerGetData` are gated. The other tools that
  can reach business data (§7) are a separate, later task; the README names them.
- One set of fixtures, captured with the flag on; the off surface is asserted as the on
  surface minus exactly the three names (§6, §8).
- The tool pages list the data tools marked opt-in (§5).
