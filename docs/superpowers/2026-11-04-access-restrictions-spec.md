# Spec: access restrictions set when the server starts

Goal: `2026-11-04-access-restrictions-goal.md`. This spec decides what the goal left open.
Claims are marked **Measured** (read in the code at 23.1.0, or in a recorded run) or
**Inference** (not yet proven; the plan proves or drops it). A decision the owner left to the
controller is marked **controller's call**.

## 1. What the code shows

- **Start-time configuration has one machinery.** Each binary reads a `ParameterTable`
  (`src/lib/config/authParameters.ts`): every row in three forms, CLI beating environment
  beating YAML (`--conf`). The tables are `coreParameters` (stdio), `httpParameters` and
  `sseParameters` (`server-runtime/src/*/config/`), one per transport, each taking the binary's
  `ToolSet`; the `-ro` and compact binaries use the same table with their own set. Shared rows
  (`BATCH_KEEP_RAW_PARTS_ROW`, `SHUTDOWN_TIMEOUT_ROW`) sit in all three. A row's reader throws a
  `ParameterRefusal`, and the start ends `1` with `[MCP] <words>`. (Measured)
- **The launchers write their start lines through `deps.stderr`**, each prefixed `[MCP]`
  (`server-runtime/src/{stdio,http,sse}/launcher.ts`). (Measured)
- **The `list` kind drops empty entries silently** (`splitList`: `a,,b` is `[a, b]`). It cannot
  hold rows that must refuse a stray separator. (Measured)
- **Every launcher builds its registry in one call**, `registryOf(toolSet, transport)`
  (`src/lib/toolSet.ts`), a `CompositeHandlersRegistry` of the set's groups. (Measured)
- **A handler reaches a call by five paths.** (Measured)
  1. `BaseMcpServer.registerHandlers` with a `CompositeHandlersRegistry`: every entry wrapped
     in `runCall`, its arguments parsed by the SDK against the listed schema
     (`src/embeddable/BaseMcpServer.ts`, from line 1363).
  2. A plain registration of groups on an embedder's `McpServer` (`registerAllTools`,
     `HandlerExporter.registerOnServer`): every entry wrapped in
     `BaseHandlerGroup.registerToolOnServer`, arguments parsed by the SDK.
  3. `CompositeHandlersRegistry.registerTool(server, name, definition, handler)`
     (`CompositeHandlersRegistry.ts:139`): the definition and handler are the embedder's own,
     registered through the holding group's `registerOneTool`, so through path 2's wrapper,
     with the embedder's definition as the listed schema. A name no group's `getHandlers()`
     holds is refused (`REGISTER_TOOL_UNHELD_WORDS`).
  4. A registry that is not a `CompositeHandlersRegistry` given to `BaseMcpServer`
     (`BaseMcpServer.ts:1731`): it registers its own tools on a proxy
     (`trackingRegistrations`), which sees a name, a config and an opaque callback, and tracks
     the call; no handler group and no tool definition of ours is involved.
  5. `HandlerExporter.getHandlerEntries()`: raw entries, each handler wrapped in
     `inStatedScope` (`wrapEntry`); the embedder calls the handler itself, on the connection
     it gives, with arguments no SDK parsed.
- **The listed schema is enforced before the handler on paths 1 and 2.** The SDK parses the
  arguments with the zod object built from the listed schema. That object drops undeclared
  keys, and an `enum` becomes `z.enum`. So a value removed from an enum, or a property removed
  from a schema, never reaches the handler. (Measured: `schemaUtils.ts`)
- **A compact tool has one dispatching argument, but two of them name their target in other
  forms too** (Measured: a sweep of every handler in `compact-modify/src/handlers/` and
  `compact-readonly-entries/src/handlers/` for an argument other than the dispatching one that
  names an object's type):
  - `HandlerActivate` (`compact-modify/src/handlers/handleHandlerActivate.ts`) dispatches
    `objects[]` first (line 76), then `object_adt_type` (line 92), and `object_type` only when
    neither is given. `objects[].type` and `object_adt_type` are free strings in the listed
    schema (`compactSchemas.ts`, `activateProperties`), read at the handler's boundary by
    `acceptedCodeOf` (`src/lib/adtTypeCode.ts`), which takes a code of `ACTIVATION_CODES` in
    either case, a main type, a search name or a friendly name (`TYPE_NAMES`: `class`,
    `func`, …). So `{ objects: [{ name: "ZCLASS", type: "CLAS/OC" }] }` activates a class
    whatever `object_type`'s enum holds.
  - `HandlerGet` (`compact-readonly-entries/src/handlers/handleHandlerGet.ts:47-82`): the
    parts `object_structure` and `node_structure` read an object by `object_adt_type` (a free
    string, read by `tableTypeOf`: any code of the variant's ADT type table) and
    `object_name`, without `object_type`. `virtual_folders` lists the repository by search
    pattern and facets and reads no object.
  - Every other compact tool with a dispatching argument names its target only through it.
- **Only `object_type` / `target_type` is projected per variant.** (Measured)
  - `object_type` (eleven tools) and `target_type` (`HandlerProfileRun`): stated per variant
    through `byVariant` (`src/lib/variantDefinition.ts`), each variant's members, enum and
    description built by a builder that takes the variant (`compactDescriptions.ts`: twelve
    builders, each `(variant: ProjectionVariant) => string`). `variant-surface.json` records
    `members` for these only.
  - `action` (`HandlerBatch`, `HandlerDebugBatch`, `HandlerSession`) and `operation`
    (`HandlerDebugSession`, `HandlerDebugStep`, `HandlerDebugBreakpoints`,
    `HandlerDebugMaintain`): fixed enums written in the handlers' definitions
    (`src/lib/compact/batch/handleHandlerBatch.ts:46`,
    `src/lib/compact/longSession/handleHandlerSession.ts:23`, `src/lib/compact/debug/*.ts`),
    with descriptions written as fixed text that names every value.
  - `servedDefinition` (`src/lib/variantToolSet.ts:425-441`) picks the variant's stated
    definition; it takes no member set from outside.
  - So narrowing any of them by a deny list needs a builder that takes the remaining members
    (§3.1).
- **Batch mode records calls.** While a batch is open, an admitted call runs its handler on a
  recorder, and its requests leave only at `BatchEnd`. A handler whose request needs an earlier
  answer cannot be recorded (`tools/batch-handlers.json`). Inside the call's turn, the system
  lookup (`systemBeforeTool`) sends on the real connection before the batch branch decides to
  record. (Measured)
- **The ADT clients do not expose an ETag in a read's value,** but a client built with the
  `wireItself` reading keeps the answer's status and headers. adt-clients' `AdtReadVersion` is
  `active | inactive | workingArea` and is sent verbatim as `?version=`; the probes used
  `workspace`. Whether `workingArea` answers as `workspace` does for a second user is not
  known. (Measured: adt-clients 42.1.0 source; the equivalence is Inference)
- **A package's super package is in its metadata document**: `GetPackage` reads it with one
  request (`readPackageMetadata`) and its description names the super-package among the
  document's fields. (Measured; the element the reader takes is measured in plan step 1)
- **The listed-schema fixture** (`tests/fixtures/tools/listed-schemas.json`) exists on the
  static-types branch (PR #346), which this change builds on (§8). (Measured)

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
- **No list file of its own.** A long list goes in the YAML file of `--conf`. `--conf` keeps its
  behaviour of today, which this change does not touch: a missing file gets the template and
  the start ends `0`; an unreadable or invalid one stops the start.
- **Every binary accepts every row.** A row that touches nothing in that binary (a request
  list where no tool names a request) changes nothing, so one configuration fits every binary.

### 2.1 Denied actions: grammar

- `Tool`: the tool. `DeleteClass`.
- `Tool.value`: one value of the tool's dispatching argument: `object_type` (HandlerActivate,
  HandlerCheckRun, HandlerCreate, HandlerDelete, HandlerDeletionCheck, HandlerGet, HandlerLock,
  HandlerUnlock, HandlerUpdate, HandlerValidate, HandlerWhereUsed), `target_type`
  (HandlerProfileRun), `action` (HandlerBatch, HandlerDebugBatch, HandlerSession), `operation`
  (HandlerDebugSession, HandlerDebugStep, HandlerDebugBreakpoints, HandlerDebugMaintain), and
  `sql`, HandlerGetData's `sql_query` mode. On any other tool, full set included, `Tool.value`
  matches nothing and is ignored (named in the start line).
  `HandlerDelete.CLASS`, `HandlerBatch.end`, `HandlerGetData.sql`.
- `Tool.CODE`: on `HandlerActivate` and `HandlerGet`, a value may also be an ADT type code, a
  value of its own: the codes of the tool's code arguments (`objects[].type` and
  `object_adt_type` on HandlerActivate, `object_adt_type` on HandlerGet). `HandlerActivate.CLAS/OC`,
  `HandlerGet.DDLS/DF`. A code is written as the ADT tables write it, upper case, `/` included
  (`ENHO/XHH`; `AUTH` has none). The `/` collides with no separator: entries are split on `,`,
  the tool from the value on the first `.`, and no tool name or code holds either. In YAML it
  is a plain scalar (`- HandlerActivate.CLAS/OC`), with no quoting needed. An entry's value is
  looked up among the tool's names and among its codes; names hold no `/` and no code is also a
  name, so a whole value names one or the other.
- `Tool.prefix*`: every value of the dispatching argument that starts with `prefix`, and, on
  HandlerActivate and HandlerGet, every code that does. `HandlerDebugSession.get*`;
  `HandlerActivate.CLAS*` names `CLASS` and `CLAS/OC` both.
- `Prefix*`: every tool whose name starts with `Prefix`. `Delete*`.
- Malformed, stopping the start: an empty entry; a tool part that is empty or holds anything
  but ASCII letters and digits; a value part that holds anything but ASCII letters, digits,
  `_` and `/`; `*` anywhere but at the end; `*` alone; `*.value` (a wildcard over tools with an action);
  more than one `.`.
- Tool names and values match exactly, case included.
- **An entry that matches nothing in this binary is ignored** (the goal), and the start line
  names it (§2.3).
- **Activation inside a write is not an action.** The 24 full-set tools that take an `activate`
  argument (8 `Create*`, 16 `Update*`; Measured from `surface.json`) keep it whatever is denied:
  denying `Activate*` closes only the activation tools. No `Tool.activate` form exists. The docs
  say so.

### 2.2 Packages, requests and tables: grammar

- Packages: an exact name (`ZFOO`, `$TMP`), a prefix (`Z*`), or a subtree (`ZFOO/**`: `ZFOO`
  and every package below it). Characters: ASCII letters, digits, `_`, `/`, `$`; `*` only as
  the last character of a prefix, or as the `/**` that ends a subtree. A namespaced subtree is
  `/ABC/ZFOO/**`. Malformed: `*` elsewhere, `**` without the `/` before it, a prefix with a
  subtree (`Z*/**`), `/**` alone. Entries are upper-cased at start.
- **Which strategy reads a subtree.** A subtree entry is matched only by the tree strategy
  (§3.3). **Controller's call:** a launcher gives the tree strategy when at least one
  allowed-packages entry is a subtree, and the simple strategy otherwise. **Controller's call:**
  the simple strategy given a subtree entry refuses it as malformed for that strategy, so an
  embedder's start that builds it stops; a launcher never does this, by the rule above.
- Requests: an exact number or a prefix. Characters: ASCII letters and digits; `*` only at the
  end. Upper-cased at start. **A task is matched as given**: an entry for a request does not
  cover its tasks; the administrator lists every number, or a prefix, they want. The docs say
  so in one line.
- Tables: an exact name or a prefix, packages' characters without the subtree form. Upper-cased
  at start.
- **Denied tables and allowed tables together stop the start.**

### 2.3 The start line

The launcher writes one line through `deps.stderr` (§1) after the table is read, once per
process (a pooled http server writes it once, not per instance):

- nothing configured: `[MCP] Access restrictions: none`;
- else one clause per configured row, with its count, the strategy, and the deny entries that
  match nothing in this binary; the strategy is named only for the tree strategy,
  `(package tree read)`, and the simple strategy's packages clause carries no strategy words:
  `[MCP] Access restrictions: deny-actions 4 (matching nothing here: DebugStep), allowed-packages 3 (package tree read), allowed-requests 2`.

The line names counts, not entries, except the unmatched deny entries. The entries hold no
secret (tool, package, request and table names), but a list can run to hundreds and is already
in the administrator's own configuration; the count and the strategy confirm what was read. An
unmatched deny entry is named because that is how a mistyped name shows. No value from SAP and
no credential is in the line.

## 3. The checks, and where they run

### 3.1 Denied actions: at registration

- `registryOf` takes the denied actions. It wraps each group (`withoutDenied(groups, denied)`)
  so that `getHandlers()` leaves out a denied tool, and narrows a compact tool's dispatching
  argument to the values not denied.
- **When a compact tool is left out.** A `Tool` entry removes the tool outright. Otherwise a
  compact tool stays registered while any callable form remains, and is left out only when
  every value of every form it takes is denied:
  - HandlerActivate: every name of `object_type` and every code of `objects[].type` /
    `object_adt_type`. Names alone exhausted: the tool stays, its codes callable; codes alone
    exhausted: the tool stays, its names callable.
  - HandlerGet: its names of `object_type` and its codes of `object_adt_type` (the address
    parts) are deniable; `virtual_folders` and the activation-run parts take neither and are
    no deniable value, so they always remain, and only a `HandlerGet` entry removes the tool.
    Names alone or codes alone exhausted: the tool stays with what remains.
  - HandlerGetData: `sql` is its own mode. Denying `HandlerGetData.sql` keeps the table read;
    the table read is not a deniable value of its own, so only a `HandlerGetData` entry removes
    the tool.
  - Every other compact tool: every value of its one dispatching argument.
- **Narrowing rebuilds the definition from the remaining values**, so its enum, its description
  and its search members name no denied value. That needs a builder taking a member set
  (§1, Measured that none takes one today):
  - the twelve `object_type` / `target_type` builders of `compactDescriptions.ts` take the
    remaining members instead of the variant (the variant's members minus the denied ones);
    `HandlerActivate`'s and `HandlerGet`'s also take the codes left, so a denied code is
    named nowhere in the definition (below);
  - **controller's call:** eight new builders, for the tools whose values are fixed today:
    `HandlerBatch`, `HandlerDebugBatch`, `HandlerSession`, `HandlerDebugSession`,
    `HandlerDebugStep`, `HandlerDebugBreakpoints`, `HandlerDebugMaintain` (each value's
    sentence in the description and in the dispatching property's description), and
    `HandlerGetData`, whose `object_name` description names `sql_query`;
  - so twenty builders in all. The definition with nothing denied is byte-identical to today's
    (§7).
- **A denied value is exactly that value.** Denying a value removes it, and only it, from its
  tool's schema: other values stay, even when they reach the same ADT endpoint (the checks are
  formal). Denying `HandlerActivate.CLASS` leaves `BEHAVIOR_IMPLEMENTATION`, and leaves the
  code `CLAS/OC`; a code is denied by naming it.
- **A denied code is not in the code arguments.** HandlerActivate's `objects[].type` and
  `object_adt_type`, and HandlerGet's `object_adt_type`, are free strings today (§1). When at
  least one code of the tool is denied, they become an `enum` of the codes the variant serves
  there less the denied ones (HandlerActivate: `ACTIVATION_CODES`; HandlerGet: the variant's
  ADT type table codes, `TABLE_CODES`), so the SDK's parse refuses a denied code, with no
  per-call check (§1). A denied name changes neither argument, and a denied code changes no
  `object_type`.
  - Denying `HandlerActivate.CLAS/OC` removes it from `objects[].type` and `object_adt_type`;
    `CLASS` and `BEHAVIOR_IMPLEMENTATION` stay in `object_type`.
  - Denying `HandlerGet.CLAS/OC` removes it from `object_adt_type`, which only the address
    parts (`object_structure`, `node_structure`) read; `part` keeps its values, and `CLASS`
    stays in `object_type`.
  - **Spellings while a code is denied.** The enum holds the codes as the ADT tables write
    them, upper case. The other spellings the handlers take today (`acceptedCodeOf`,
    `tableTypeOf`: lower case, a main type, a search or friendly name such as `class`) are
    refused in those arguments while a code of that tool is denied: an enum cannot hold them,
    and a pattern would be a regex over the input. Without a denied code the arguments stay
    free strings, as today. The docs say so.
  - The full set's `ActivateObjects` (`objects[].type`) has no values; it is denied as a tool.
- **`HandlerGetData.sql`** is an action: denying it removes `sql_query` from the listed schema
  at registration, and the description no longer names it; the read of a named table stays.
- No call checks a deny list. On paths 1 and 2 a denied value cannot pass the SDK's parse of the
  listed schema (§1).
- **Batch.** A batch item is a call of another registered tool. A denied tool or value is not
  registered, so no batch can record it.
- **Paths 3 to 5** (§1). **Controller's call:** the deny guarantee covers the registered, parsed
  paths. On path 3 a denied tool cannot be registered (no wrapped group holds it, so
  `registerTool` refuses it, Measured from the code), but the definition is the embedder's,
  so a denied value is in its schema if the embedder put it there. On path 4 the registry's
  tools are its own. On path 5 the exporter applies the same list itself (below), and the
  arguments are the embedder's to parse.
- **`HandlerExporter` takes the denied actions.** It builds its groups privately
  (`HandlerExporter.ts`, constructor), so an embedder cannot hand it wrapped groups. Its
  options take `deniedActions`, of the same parsed type the server's table produces (lib
  exports the parser). The exporter applies `withoutDenied` to its groups once, in its
  constructor, so `getHandlerEntries()`, `registerOnServer()`, `createRegistry()` and the tool
  names it lists all start from the same narrowed groups. The exporter builds full-set groups
  only (`HandlerExporter.ts`, Measured), whose tools take `Tool` entries alone (§2.1): a
  `Tool.value` entry matches nothing there, is ignored, and leaves every definition as it is.
  Enum narrowing happens on the compact sets, through `registryOf`.
  Handlers an embedder takes into its own hands are its own. The docs state it.

### 3.2 Packages, requests and tables: the strategy

One interface, given by the host, decides every call-time check:

    interface IAccessChecks {
      check(call: AccessCall, sap: IPackageReader): Promise<AccessVerdict>;
    }

    interface IPackageReader {
      /** The package's super package as its metadata document names it; undefined at the top.
       *  Rejects when SAP does not answer the package. */
      superPackageOf(packageName: string): Promise<string | undefined>;
    }

- **`AccessCall`** is what the arguments say, as given: the tool, the value of its dispatching
  argument when it has one, the packages named (`{ argument, value }`), the requests named,
  the tables named, and whether the call is a **package create** (below).
- **A package create** is a call whose handler creates the package `package_name` under
  `super_package`: `CreatePackage` (`src/handlers/package/high/handleCreatePackage.ts`, which
  requires `super_package` and sends it as the new package's `superPackage`) and
  `HandlerCreate` with `object_type: 'PACKAGE'` (routed to the same create,
  `compactWriteRoutes.ts:46`). These two only; the set is fixed by a test. Every other call
  naming both arguments is not one: `CheckPackage` declares `super_package` and never uses it
  (`handleCheckPackage.ts:36-48`, Measured), so trusting it would let
  `{ package_name: "ZOUTSIDE", super_package: "ZALLOWED" }` pass `ZALLOWED/**`.
- **`IPackageReader`** is the one means a strategy has to read SAP. The wrapper creates it per
  checked call, holding no connection. Its first read takes the call's connection (and, on
  path 1, its turn in the main flow) exactly as the wrapper would next, and the wrapper then
  goes on with what the reader took; a strategy that reads nothing takes nothing before its
  verdict. Each read is one metadata read of one package on that connection, with the call's
  signal. Nothing read is kept beyond the call.
- **`AccessVerdict`** is `{ allowed: true }` or `{ allowed: false, code, argument? }`. The code
  is one of a closed set (§3.4).
- **Two shipped strategies** in lib, both applying the configured lists (§3.3):
  `listedAccessChecks(lists)` (the simple one) and `packageTreeAccessChecks(lists)` (the tree
  one). An embedder gives its own. No strategy acts on a draft (§5).
- **No strategy, no check.** A launcher gives a strategy only when at least one call-time row
  is configured. Without one, no wrapper builds an `AccessCall` and nothing changes.
- **Where it is given.** `BaseMcpServer` (so every launcher and `EmbeddableMcpServer`) and
  `HandlerExporter` take an optional `accessChecks`. The launcher creates one per process and
  gives it to every instance. A shipped strategy holds no state.
- **Where it is called, from the code**, once per call, never inside a handler:
  - path 1: in `runCall`, after the SDK parsed the arguments and before `getConnection`;
  - paths 2 and 3: in `registerToolOnServer`, with the argument refusals that already come
    before `callContext()`; the reader's first read asks `callContext()`, and the call goes on
    with that context;
  - path 5: in `wrapEntry`, before the original handler; the reader reads on the connection the
    embedder gave the call. The arguments are as the embedder passed them; the `AccessCall`
    takes only string values of the checked properties;
  - path 4: not called (**controller's call**; the registry's tools are its own).
- **Which tools are checked.** The wrapper builds the `AccessCall` from tables derived at
  registration from the listed schema (§4, §6). A tool that names nothing checked is not called
  with the strategy.
- **Batch.** A recorded call is checked when it is recorded, which is its handler's start. The
  simple strategy reads nothing. The tree strategy's reads go on the real connection inside the
  call's turn, before the batch branch, as the system lookup does (§1); they are not recorded
  and take no number (Inference; the plan proves it in step 1, and if a read there cannot be
  sent, the reader rejects while a batch is open and the tree strategy refuses as in §3.3). A
  refused call takes no number.

### 3.3 What the shipped strategies decide

Both:

- A package named in a checked argument (§4) runs only when it matches an allowed-packages
  entry. A request likewise against the allowed requests. When both lists are configured, each
  name is checked against its own list.
- A table named by a data tool (§6) runs only when it matches no denied entry, or only when it
  matches an allowed entry.
- An argument not given, or given as an empty or blank string, is not checked; the call runs,
  and SAP may refuse it.
- Values are compared upper-cased and trimmed, the way the handlers send them.

The simple strategy matches exact names and prefixes, reads nothing, and refuses a subtree
entry when built (§2.2).

The tree strategy matches exact names and prefixes first, without reading. Only when none
matches and a subtree entry `X/**` exists does it read:

- the package is `X`: it matches;
- else its parent is read through `superPackageOf`, with one exception: for a package create
  (§3.2) the parent of the new `package_name` is the call's `super_package`, since the new
  package cannot be read yet; `super_package` is itself checked as a named package, by the
  same walk. For every other call the call's `super_package` is never taken as anyone's
  parent; it is checked only as a package it names. The walk goes up until it meets `X`
  (match) or the top (`undefined`: no match, `package_not_allowed`). A package that does not
  exist yet outside a create (a `CheckPackage` of a new name) cannot be read, so it passes only
  an exact or prefix entry;
- a read that rejects, or a package met twice on the walk, refuses the call
  `package_tree_unreadable`. The call is refused, never let through, when the tree cannot be
  read.

### 3.4 How a refusal reaches the model

- As the server's own refusal, the way `batch_not_recordable` reaches it: an `isError` answer
  with an `error` code and fixed words. New `ServerRefusalCode`s:
  - `package_not_allowed`: "<argument> names a package outside the allowed packages: <value>";
  - `package_tree_unreadable`: "the package tree above <value> could not be read, so <argument>
    is not checked against the allowed packages";
  - `request_not_allowed`: the same as `package_not_allowed`, for a request;
  - `table_not_allowed`: "the data of <value> is not readable through this server".
- The words quote only the call's own arguments. No SAP text is invented or quoted; why a read
  failed is not in the words.
- A refused call runs no handler, sends nothing of its own, and takes no batch number. Under
  the tree strategy, the reads the check made are the only requests sent.

## 4. Package and request arguments

- **Found from the tool definitions, not from handler code.** At registration the wrapper reads
  the top-level properties of each tool's listed input schema (after the static-types change:
  the zod shape's keys). A property named in one of two fixed tables is a checked argument:
  - names a package: `package_name`, `super_package`;
  - names a request: `transport_request`, `transport_number`, `target_number`.
- **Only the tools the binary's `-ro` twin does not serve are checked** (full set against
  core-ro, compact against compact-ro). A read that names a package or a request (`GetPackage`,
  `GetTransport`, compact `HandlerGet`) is not checked.
- **Names that look alike and are not checked**, held by a test: `package_type`,
  `transport_layer`, `transport_type`, `task_type`, `include_subpackages`, `include_tasks`,
  `packages`, `package_names`.
- **Counts** (Measured from `surface.json` and `variant-surface.json`, onprem and cloud
  together):
  - full set: 88 tools the core-ro twin does not serve name a package or a request — 25 a
    package, 86 a request. Of the 88, 86 change something (Appendix A) and two change nothing
    but are not in core-ro: `CheckPackage` and `ValidateServiceBinding`; the rule checks them
    too. The other 19 tools that change something name neither — the 17 `Activate*`,
    `CreateTransport` and `UpdateServiceBinding` — and are not checked by these lists.
    86 + 19 = 105, Appendix A's count.
  - compact: 6 tools — `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerLock`,
    `HandlerTransportMoveObjects`, `HandlerTransportSortAndCompress`.
  - The full list is Appendix B.
- **A move.** No tool moves an object to another package (no checked argument does). A whole
  document written by compact `HandlerUpdate` (`PACKAGE`, `DOMAIN`, `DATA_ELEMENT`,
  `FUNCTION_GROUP`) may carry a package inside its text; the text is not analysed (the checks
  are formal).
- **A create of a package** names two packages, the new one (`package_name`) and its parent
  (`super_package`); both are checked, and the tree strategy takes the new package's parent
  from the call, for a package create only (§3.2, §3.3).
- **A test fixes the derived table** against Appendix B, so a tool that gains or loses such an
  argument shows in a reviewed diff.

## 5. The draft tool

The draft is not a restriction. A read tool answers the facts; the model calls it when it
wants to know and decides what to do. No setting, limit or check of the server's acts on a
draft, and no other tool reads it.

- **Always registered.** In all twelve binaries, configured or not, core-ro included (it
  changes nothing): `GetObjectDraft` in the full sets; in the compact sets a part of
  `HandlerGet`, `part: 'draft'`, so compact and compact-ro have it without a new tool. Like
  every tool, it is listed on the variant the system states by the variant rules
  (`listedTool`); on premise and ABAP cloud it is listed. On the legacy variant it is registered but not listed, as `GetObjectVersions` is not: the
  legacy variant is not changed by this work (the owner's decision); what legacy serves is
  measured first and narrowed afterwards, as its own task.
- **Arguments.** As `GetObjectVersions` names an object: `object_type*`, `object_name*`,
  `function_group_name` (a function module's group). `object_type` lists only the types §5.1
  admits, per variant. Compact: `HandlerGet`'s `object_type` and its name arguments, the
  `draft` part offered only for the admitted types already in `HandlerGet`'s `object_type`
  enum, which is not widened; an admitted type outside that enum (a message class, say) is
  served by `GetObjectDraft` alone, and the docs say so.
- **What it sends.** Three reads of each source part at `version` `active`, `inactive` and the
  caller's working version, each answer's ETag taken through a client built with the
  `wireItself` reading (§1). The reads depend on nothing, and it is not a long tool.
- **Multi-part objects. Controller's call:** plan step 1 measures whether an unactivated change
  in a class include (local types, local definitions, test classes, macros) or a function
  group include moves the main source's inactive ETag. If it does, the tool reads the main
  source only. If not, the tool reads every source part of the object and answers per part;
  the per-part answer's shape is then the owner's to decide, before the tool is built.
- **Batch. Controller's call:** plan step 1 measures whether an ADT `$batch` response part keeps
  the ETag header. If it does, the tool is recordable (an entry in `tools/batch-handlers.json`).
  If not, it is not recordable: no batch entry, and in batch mode it is refused
  `batch_not_recordable` like every tool without one.
- **The answer** (per part when §5's multi-part rule reads every part):
  - `draft`: `none` (`active` ETag = `inactive` ETag), `own` (`inactive` ≠ `active` and working
    = `inactive`), `other` (working = `active` ≠ `inactive`), or `undetermined` (the three fit
    none of these);
  - `changed_at`: for `own` and `other`, the `inactive` ETag's first 14 digits as a UTC time
    (ISO 8601), the draft's last write; `null` for `none` and `undetermined`;
  - `age_seconds`: for `own` and `other`, now (UTC, the server's clock) minus `changed_at`, in
    whole seconds (the floor; the ETag timestamp has second precision);
    `null` for `none` and `undetermined`;
  - `etags`: `active`, `inactive` and `workspace`, each the ETag of that version's answer as
    read, `null` when that answer carried none.
  - No `detail` argument, on `GetObjectDraft` or on `HandlerGet` `part: 'draft'`: the answer
    always carries these fields, the same on both.
- **Failures.** A read that fails answers as the tool's reads answer today: SAP's status and
  message (a `404` for an object that does not exist). An ETag missing, or not led by 14
  digits, answers `draft: 'undetermined'` with what came (that version's ETag `null` when
  missing).
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
  inactive document to `inactive` and to `workingArea` (adt-clients' `readQuery`, on premise).
  So `?version=` is accepted on those metadata reads. Not measured: whether their ETags tell
  the three versions apart. The one metadata ETag seen, a class's on the cloud trial, had
  another shape (40 digits, two timestamps). The plan measures each such type with two users;
  a type is offered only where the three ETags tell `none`, `own` and `other` apart, and the
  docs list the types not offered.
- **The working version's name.** The probes sent `version=workspace`; adt-clients sends
  `workingArea` verbatim. The plan's first step measures whether `workingArea` answers as
  `workspace` did for a second user. If not, `interfaces-adt` and `adt-clients` add `workspace`
  in a minor, published first.

## 6. Table data

- **Tools that name a table whose rows they answer** (Measured): `GetTableContents`
  (`table_name`) and compact `HandlerGetData` (`object_name`). Both are in every binary,
  `-ro` included.
- **Not covered:** `GetSqlQuery` and `HandlerGetData`'s `sql_query` are free SQL, allowed or not
  by the deny list (`GetSqlQuery`, `HandlerGetData.sql`, §3.1). `AmdpDebugGetTable` and
  `HandlerDebugMaintain` `getDataPreview` read a debuggee's table variable, not a table by name;
  the deny list governs the debugger. A tool that names a table for its definition (`GetTable`,
  `CreateTable`) reads no rows.

## 7. Tests

- **Unit, per check and per refusal:** each grammar form and each malformed form of each row,
  in each of CLI, environment and YAML; both table lists together; the start line for nothing
  configured, for each row, and with an unmatched entry; a denied tool absent from
  `tools/list`; a denied value absent from the enum, the description and the search members,
  for each of the twenty builders; a denied value removing only itself
  (`HandlerActivate.CLASS` denied: `CLASS` gone, `BEHAVIOR_IMPLEMENTATION` listed and
  `CLAS/OC` still taken in `objects[].type` and `object_adt_type`); a denied code removing only
  itself (`HandlerActivate.CLAS/OC` denied: `CLAS/OC` refused in both code arguments in every
  spelling, `CLASS` and `BEHAVIOR_IMPLEMENTATION` still in `object_type`; the same for
  `HandlerGet.CLAS/OC` and `object_adt_type`); a code entry in each of CLI, environment and
  YAML; a prefix covering names and codes; `HandlerGetData.sql` alone removing `sql_query` and
  its mention, the table read still listed and callable; HandlerActivate with every name denied
  (the tool listed, a code callable), with every code denied (the tool listed, a name callable)
  and with both (the tool absent); a single-argument tool with every value denied absent;
  `HandlerExporter` given a denied tool and a `Tool.value` entry: the tool absent from
  `getHandlerEntries()` and from a server it registers on, the `Tool.value` entry ignored and
  every exported definition unchanged (enum narrowing is tested on the compact registry, the
  cases above); each form left absent (no row, an empty variable)
  restricting nothing; each refusal code, its words, and that no handler ran and nothing of the
  call's own was sent (a recording connection); an argument not given passing; a refused call in
  batch mode taking no number; path 3 refusing a denied tool.
- **The strategies, unit:** the simple one refusing a subtree entry; the tree one matching
  without a read on an exact or prefix entry, walking up through a recording reader, taking a
  package create's parent from the call and reading it for every other call (`CheckPackage`
  with a `super_package` inside a subtree and a `package_name` outside it refused), refusing on
  a rejected read and on a cycle; no
  connection taken when the strategy reads nothing; the launcher choosing the strategy by the
  presence of a subtree entry.
- **The draft tool, unit:** each answer from recorded ETag triples (`none`, `own`, `other`,
  `undetermined`), `changed_at` and `age_seconds` `null` for `none` and for `undetermined`, a
  failed read, a missing ETag (`undetermined`, that ETag `null`), the age against a fixed
  clock, the same
  fields on `GetObjectDraft` and `HandlerGet` `part: 'draft'`, per part when the multi-part rule applies, and in batch mode as plan step 1 decides
  (recorded in one batch, or refused `batch_not_recordable`).
- **Nothing configured.** Every fixture — the listed-schema fixture and the surface fixtures —
  is byte-identical to today's except two reviewed additions: the `GetObjectDraft` tool and
  `HandlerGet`'s `part: 'draft'` (its enum value and the description's mention of it). Nothing
  else in them moves, and no wrapper calls a strategy. A test runs every tool with no strategy
  and compares the requests sent with today's.
- **The derived table** (Appendix B) is fixed by a test (§4).
- **Live** (the repository's integration conventions: `tests/test-config.yaml`, skipped with
  the reason where the system or the second user is not configured):
  - the draft tool, on premise: two users (a second session file named in the test config;
    each user writes only through its own connection), `none`, `own` and `other`, for every
    type offered;
  - the draft tool, ABAP cloud trial: one user, `none` and `own`;
  - packages and requests: one run on premise proving an allowed create runs and a refused one
    sends nothing; one run of the tree strategy proving a package below a subtree entry is
    allowed and one outside it refused.

## 8. Docs and semver

- **Docs:** a new `docs/user-guide/ACCESS_RESTRICTIONS.md` (every setting, the grammar, the
  start line, what is checked and what is not: reads are not checked; a task is matched as
  given; denying `Activate*` closes only the activation tools, not a write's `activate`;
  each entry denies exactly what it names, and an administrator who wants a whole object kind
  out denies every value that names it; an ADT code is a value of its own: denying a name
  leaves its code, and `HandlerActivate.CLAS/OC` closes the code; while a code is denied, the
  code arguments take codes as written in upper case only; the
  paths an embedder takes into its own hands are its own); the tool lists
  (`AVAILABLE_TOOLS*.md`, generated) and a section on `GetObjectDraft` (its answer, the types
  offered, the server clock, first writer wins); `CLI_OPTIONS.md`,
  `docs/configuration/YAML_CONFIG.md`, `src/lib/config/README.md`; `BATCH_MODE.md` (a refused
  call in a batch; the draft tool recordable or not, as measured); `HANDLERS_MANAGEMENT.md` and
  the embeddable docs (`accessChecks`, the two shipped strategies, `IPackageReader`,
  `withoutDenied`, `HandlerExporter`'s `deniedActions`, paths 3 to 5); `README.md`; `SECURITY.md` (the checks are formal: SAP's
  authorization remains the boundary); `CHANGELOG.md`.
- **Order and semver.** Built on top of the static-types change (PR #346) after it merges, and
  released as **24.1.0**, a minor of the eighteen packages, versioned together. Everything is
  additive: new rows, an optional option, new exported types and strategies, new refusal codes
  that appear only when configured, one new read tool and one new `HandlerGet` part. With
  nothing configured no existing answer changes. No migration note.
- **Other packages.** None, unless the plan's first measurement finds that `workingArea` is not
  the caller's working version for another user's draft. Then `interfaces-adt` and
  `adt-clients` add a `workspace` version in a minor, published first.

## 9. Order inside the PR

1. Measure: `workingArea` against `workspace` with two users on premise; the ETag through
   `wireItself`; the versions of every type the draft tool would offer (§5.1); whether an
   include's change moves the main source's inactive ETag (§5); whether a `$batch` response
   part keeps the ETag header (§5); the super-package element of a package's metadata and a
   package read on the real connection while a batch is open (§3.2).
2. The rows, their readers and the start line.
3. The deny list at registration, with the twenty builders.
4. The interface, the reader, the wrappers, the refusals, the two shipped strategies.
5. The draft tool and its `HandlerGet` part.
6. Docs, then the live runs.

## Questions for the owner

None open.

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

Of these, 86 name a package or a request (Appendix B) and 19 name neither (§4).

Compact, 7: HandlerCreate (19 object types, `TRANSPORT` among them), HandlerUpdate (24),
HandlerDelete (24), HandlerActivate (18), HandlerTransportCreate, HandlerTransportMoveObjects,
HandlerTransportSortAndCompress.

Not counted as changes to objects (the deny list governs them): the `Check*`, `Run*UnitTest`,
`RunAbapUnit`, `RunCdsUnitTest`, `RuntimeRun*`, `RuntimeCreateProfilerTraceParameters`, the
debugger, background-run, batch, lock and session tools.

## Appendix B. Checked arguments

Tools the `-ro` twin does not serve, by the arguments they declare (Measured, 23.1.0). Full set,
88: 86 that change something and two that change nothing (marked ²).

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
- **`package_name` and `super_package`, 1:** CheckPackage².
- **`package_name`, 1:** ValidateServiceBinding².
- **`transport_number`, 4:** CreateTransportTask (a request), AddTransportObject,
  RemoveTransportObject, SortAndCompressTransportTask (a task).
- **`transport_number` and `target_number`, 1:** MoveTransportObjects (tasks).
- **Compact, 6:** HandlerCreate (`package_name`, `super_package`, `transport_request`),
  HandlerUpdate (`package_name`, `transport_request`), HandlerDelete (`package_name`,
  `transport_request`), HandlerLock (`super_package`), HandlerTransportMoveObjects
  (`transport_number`, `target_number`), HandlerTransportSortAndCompress (`transport_number`).

² Changes nothing, but is not in core-ro, so the `-ro` rule checks it.

Not checked, since the `-ro` twin serves them: GetPackage, GetPackageContents, GetPackageTree,
GetTransport, ReadTransportObjects, ReadTransportActionLog; compact HandlerGet, HandlerValidate.
