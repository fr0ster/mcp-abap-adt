# Spec: MCP prompts for the common ABAP work

Goal: `docs/superpowers/2026-11-18-mcp-prompts-goal.md` — it binds this spec. PR #362,
branch `feat/mcp-prompts`, from the 24.0.0 release.

Every fact below carries its ground: **Measured** (read from the installed SDK or from a
committed fixture, by running a query over it), **Code** (read in the source at
`8a9ed531`), **Inference** (reasoned, to be confirmed by the implementation's tests).

## 1. What the code and the SDK give us

### 1.1 The SDK

- **Measured.** `@modelcontextprotocol/sdk` 1.32.1 is installed (`package.json`: `^1.32.0`),
  with zod 4.6.7. `McpServer.registerPrompt(name, { title?, description?, argsSchema? }, cb)`
  registers a prompt; `completable(schema, complete)` (`server/completable.js`) wraps an
  argument's schema with a completer `(value, context?: { arguments?: Record<string,string> })`.
  A completable argument turns on the `completions` capability and the `completion/complete`
  handler; the completer receives the other arguments already filled (`context.arguments`).
- **Measured.** The first registered prompt sets the `prompts` capability with
  `listChanged: true` and the `prompts/list` / `prompts/get` handlers. `prompts/list` lists
  every enabled prompt with its arguments (`name`, `description`, `required` from the zod
  field's optionality). `prompts/get` parses the arguments with the prompt's zod schema and
  refuses a failed parse as `McpError(InvalidParams, "Invalid arguments for prompt …")`; the
  callback answers `GetPromptResult` (`description?`, `messages[]` of `{ role, content }`).
- **Measured.** MCP prompt arguments are strings (`PromptArgumentSchema`: `name`,
  `description?`, `required?`; `prompts/get` takes `arguments: Record<string,string>`).
- **Measured.** `registerPrompt` throws `Prompt <name> is already registered` on a second
  registration of a name. `Server.registerCapabilities` throws after the transport is
  connected, so every prompt is registered before `connect`, as every tool is.
- **Measured.** `RegisteredPrompt` has `enable()`, `disable()`, `update()`, `remove()`; a
  completion result is cut at 100 values (`hasMore`).
- **Code.** No prompt, resource or completion is registered anywhere in the repository today.

Nothing the design needs is missing from 1.32.1; no SDK upgrade and no new dependency.

### 1.2 How a tool reaches a listing

- **Code.** A tool is a `ToolDefinition` (`src/lib/handlers/interfaces.ts`): `name`,
  `description`, `inputSchema` (zod object), `available_in?`, `variants?` (per kind: its
  `description`, `inputSchema`, `members?`) and `members?` (set only by the deny-list
  narrowing). `defineTool` pairs it with its handler into a `HandlerEntry`; handler groups
  (`BaseHandlerGroup`) hand out entries; a `CompositeHandlersRegistry` holds the groups.
- **Code.** The binary fixes its tool set (`src/lib/toolSet.ts`): `fullToolSet` (core),
  `fullReadOnlyToolSet` (core-ro), `compactToolSetOf` (compact), `compactReadOnlyToolSetOf`
  (compact-ro), each on stdio, Streamable HTTP and SSE — twelve binaries
  (`src/lib/config/binaries.ts`). `restrictedStart` builds the registry with the denied
  actions already applied (`withoutDenied`).
- **Code.** The kind is fixed at construction: `BaseMcpServer` reads `systemType` (else
  `SAP_SYSTEM_TYPE` once) in its constructor; `statedSystemType()` is "the one place the
  listing, the calls and the connections it builds read it".
- **Code.** `BaseMcpServer.registerHandlers` lists each entry through `listedTool(definition,
  environment)` (`src/lib/listedTool.ts`): left out when the kind's ADT type table does not
  serve its need (`servedDefinition`, `src/lib/variantToolSet.ts`) or its `available_in`
  leaves the environment out; else listed with that variant's description, schema and
  members. With no kind stated nothing is filtered: the definition as it is (the on-premise
  one). On Streamable HTTP every listed schema also declares `state_handle`
  (`stateHandleArgument`, `withStateHandle`).
- **Code.** The plain registration (`CompositeHandlersRegistry.registerAllTools`,
  `BaseHandlerGroup.registerHandlers`) applies the same `listedTool` on the kind the group's
  context states, never the environment.
- **Code.** A registry that is not a `CompositeHandlersRegistry` registers its own tools
  (`registerAllTools(this.trackingRegistrations())`); `BaseMcpServer` sees no entries of it.

### 1.3 The deny list

- **Code.** `--deny-actions` entries name a tool (`DeleteClass`), a prefix (`Delete*`), or a
  value of a compact tool's dispatching argument (`HandlerDelete.CLASS`,
  `HandlerSystem.where_used`), or a prefix of one (`src/lib/access/deniedActions.ts`).
- **Code.** `withoutDenied` applies them once, at registration: a denied tool is not in its
  group; a compact tool with a denied value is rebuilt from what is left (`NARROWINGS`,
  `src/lib/access/narrowing.ts`) — its variants' `inputSchema` and `members` hold only the
  values left; a tool with nothing left is left out.
- **Code.** For the object-type tools (`HandlerCreate`, `HandlerGet`, `HandlerUpdate`,
  `HandlerDelete`, `HandlerActivate`, `HandlerCheckRun`, `HandlerLock`, `HandlerUnlock`, …)
  the narrowed definition carries `members` per variant. `HandlerSystem`'s narrowed
  definition carries a description and a schema, and **no `members`**
  (`handlerSystemDefinitionFor`): its actions left are readable only from its zod schema.

So a prompt built from the **registered, listed** definitions inherits the deny list, the
kind and the read-only cut with no rule of its own.

### 1.4 What each binary serves, per kind

**Measured** from `tests/fixtures/tools/listed-schemas.json` (every tool as `tools/list`
answers it, per `<kind> <binary>`):

| Binary family | onprem | cloud | legacy |
|---|---|---|---|
| core (`mcp-abap-adt`, `-http`, `-sse`) | 267–269 tools | 252–254 | 3–5: background runs, leftover sessions |
| core-ro | 72–74 | 69–71 | 3–5: the same |
| compact | 37–39 | 37–39 | 4–6: background runs, batch, leftover sessions |
| compact-ro | 20–21 | 20–21 | 4–5: the same |

- **Measured.** On `legacy` no binary lists any tool that works on an ABAP object: every
  object tool declares `available_in: ['onprem', 'cloud']`, and `legacy` is "declared by no
  tool" (`SapEnvironment`, Code). So no prompt of this spec is listed on `legacy`.
- **Measured.** The transports differ only by the session tools (stdio: leftover sessions;
  Streamable HTTP: the long session) — none of them is a prompt's tool.

**Measured** — which (operation, object type) each family serves. `F` core, `R` core-ro
(full set: the tool `<Operation><Type>`, e.g. `CreateClass`), `C` compact, `c` compact-ro
(compact: the type in the listed `object_type` enum of `HandlerCreate`, `HandlerGet`,
`HandlerUpdate`, `HandlerDelete`, `HandlerActivate`, `HandlerCheckRun`), `onprem/cloud`:

| type | create | get | update | delete | activate | check |
|---|---|---|---|---|---|---|
| PACKAGE | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | --C-/--C- | F-Cc/F-Cc |
| DOMAIN | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| DATA_ELEMENT | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| TRANSPORT | F-C-/F-C- | FRCc/FRCc | — | — | — | — |
| TABLE | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| STRUCTURE | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| TABLE_TYPE | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| DDL | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| SERVICE_DEFINITION | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | — |
| SERVICE_BINDING | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | — |
| CLASS | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| UNIT_TEST | F---/F--- | --Cc/--Cc ¹ | F-C-/F-C- | F-C-/F-C- | — | — |
| CDS_UNIT_TEST | F---/F--- | --Cc/--Cc ¹ | F-C-/F-C- | F-C-/F-C- | — | — |
| LOCAL_TEST_CLASS | — | F-Cc/F-Cc | F-C-/F-C- | F-C-/F-C- | — | — |
| LOCAL_TYPES | — | F-Cc/F-Cc | F-C-/F-C- | F-C-/F-C- | — | — |
| LOCAL_DEFINITIONS | — | F-Cc/F-Cc | F-C-/F-C- | F-C-/F-C- | — | — |
| LOCAL_MACROS | — | F-Cc/F-Cc | F-C-/F-C- | F-C-/F-C- | — | — |
| PROGRAM | F-C-/---- | FRCc/FRCc | F-C-/---- | F-C-/---- | F-C-/---- | F-Cc/F-Cc |
| INCLUDE | F-C-/---- | FRCc/FRCc | F-C-/---- | F-C-/---- | F-C-/---- | — |
| INTERFACE | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| FUNCTION_GROUP | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| FUNCTION_MODULE | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| BEHAVIOR_DEFINITION | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |
| BEHAVIOR_IMPLEMENTATION | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | --C-/--C- | — |
| METADATA_EXTENSION | F-C-/F-C- | FRCc/FRCc | F-C-/F-C- | F-C-/F-C- | F-C-/F-C- | F-Cc/F-Cc |

¹ compact `HandlerGet` `UNIT_TEST` / `CDS_UNIT_TEST` read a unit-test **run's result** by
`run_id` (Code: `READ_TOKENS`), not an object by its name; the full set's counterpart is
`GetUnitTestResult`. They are not `get` types of a prompt (§2.2).

Read off the table (**Measured**):

- core-ro serves `get` alone of the six operations: no `Check*` tool, and no `GetLocal*`.
- compact-ro serves `get` and `check` (`HandlerCheckRun`).
- Cloud drops `PROGRAM` and `INCLUDE` from every write operation in both families; reads and
  checks of a program stay.
- The full set activates no `PACKAGE` and no `BEHAVIOR_IMPLEMENTATION` by a per-type tool
  (only through `ActivateObjects`); compact activates both.
- The full set serves object types compact does not (`CreateMessageClass`,
  `CreateFunctionInclude`, `GetEnhancementSpot`, `GetTransaction`, …).

### 1.5 The operations differ in shape between the families

- **Code.** Full set `UpdateClass` "Locks, updates, unlocks, and optionally activates" — one
  call. `CreateClass` creates the class shell alone; its source is `UpdateClass`'s job.
- **Code.** Compact `HandlerUpdate` is one write request **under `lock_handle`** (required);
  the lock comes from `HandlerLock` and ends with `HandlerUnlock`. For `LOCAL_TEST_CLASS`,
  `LOCAL_TYPES`, `LOCAL_DEFINITIONS`, `LOCAL_MACROS`, `UNIT_TEST`, `CDS_UNIT_TEST`,
  `BEHAVIOR_IMPLEMENTATION` the lock handle is the class's (`compactUpdateDescription`).
  Compact `HandlerDelete` of a class include or `UNIT_TEST` writes the include empty under the
  class's `lock_handle` (`DELETE_TOKENS`).
- **Code.** Over Streamable HTTP a compact write under a lock takes the lock's `state_handle`
  as an argument of every call under it (`compactLockDescription`, `compactUpdateDescription`).
- **Code.** Compact tools name each member's arguments in their descriptions through private
  token tables (`CREATE_TOKENS`, `READ_TOKENS`, `UPDATE_TOKENS`, `DELETE_TOKENS`, and
  `objectNamed` for lock, unlock, check), e.g. `CLASS(class_name*, package_name*)`, `*`
  marking a required argument. The per-member argument lists are typed tables
  (`COMPACT_CREATE_TAKES`, `COMPACT_READ_TAKES`, …, `src/lib/compact/compactSchemas.ts`).
- **Code.** The name argument differs per tool and type: compact `HandlerCreate` `CLASS` takes
  `class_name`, `HandlerActivate` / `HandlerCheckRun` / `HandlerLock` take `object_name`,
  `BEHAVIOR_DEFINITION` is `name` on create and update but `behavior_definition_name` on get
  and delete; full `UpdateFunctionModule` requires `function_group_name` before
  `function_module_name`. No rule derives the name argument; a table does (§5.3).

### 1.6 The exporter

- **Code.** `HandlerExporter` (`src/lib/handlers/HandlerExporter.ts`) builds the full set's
  groups (readonly, high, system, search, runtime runs, data) for an embedder.
  `createRegistry()` hands a `CompositeHandlersRegistry` to a `BaseMcpServer` /
  `EmbeddableMcpServer`, which registers it through `registerHandlers`.
  `registerOnServer(server, provider)` registers the tools on the embedder's own `McpServer`
  through `registerAllToolsOnCall`.

## 2. The operation set

### 2.1 The prompts

Six prompts, one per operation; each binary lists those it can serve (§4). The name is the
operation (open question Q1 on a prefix).

| Prompt | Arguments (all strings) | Description (functional; `<tools>` generated, §3.4) |
|---|---|---|
| `create` | `object_type` required, completed · `name` required · `package_name` optional · `description` optional · `transport_request` optional | Creates an ABAP object of `object_type` named `name` in `package_name`: asks the model to call `<tools>`. |
| `get` | `object_type` required, completed · `name` required | Reads an ABAP object of `object_type` named `name`: asks the model to call `<tools>`. |
| `update` | `object_type` required, completed · `name` required · `change` optional · `transport_request` optional | Changes an ABAP object of `object_type` named `name` as `change` says: asks the model to read it and write it with `<tools>`. |
| `delete` | `object_type` required, completed · `name` required · `transport_request` optional | Deletes an ABAP object of `object_type` named `name`: asks the model to call `<tools>`. |
| `activate` | `object_type` required, completed · `name` required | Activates an ABAP object of `object_type` named `name`: asks the model to call `<tools>`. |
| `check` | `object_type` required, completed · `name` required | Runs a syntax check of an ABAP object of `object_type` named `name`: asks the model to call `<tools>`. |

Argument descriptions (static, functional, naming nothing concrete — the repository's
description rule, `CLAUDE.md` "What we write names nothing concrete"):

- `object_type` — "The object's type; the values are the types this server serves for the
  operation."
- `name` — "The object's name (for a function module, as the type's arguments state)."
  For `get` `TRANSPORT`: the request number.
- `package_name` — "The package the object is created in."
- `description` — "The object's short description."
- `transport_request` — "The transport request the change is recorded in, not a task."
- `change` — "What to change, in words; the model writes the new content."

### 2.2 The object types

The user-facing vocabulary is the compact type names (`CompactObjectType`,
`src/lib/compact/compactObjectTypes.ts`) — one vocabulary for both families, since compact
already names every type the six operations share. Per operation:

- `create`: the compact `HandlerCreate` members **without `TRANSPORT`** (a request has a
  description and no name; transports are Q5), plus the full set's `UNIT_TEST`,
  `CDS_UNIT_TEST`, where the binary serves them.
- `get`: the `HandlerGet` members without `UNIT_TEST` and `CDS_UNIT_TEST` (run results, §1.4
  note ¹); `TRANSPORT` stays (`name` is the request number).
- `update`, `delete`, `activate`, `check`: the members of the compact tool, and the full
  set's types of the table in §1.4.
- `RUNTIME_PROFILE` and `RUNTIME_DUMP` are in no operation (their CRUD matrix row is empty,
  `COMPACT_CRUD_MATRIX`).

The full-set-only types (message class, function include, …) are Q6.

## 3. The mapping: operation × binary → tools

### 3.1 Families

A prompt's instruction comes from one of two **rows** per (operation, type): the full row
(per-type tools) or the compact row (`Handler*` tools). A binary uses the full row when its
tools are registered, else the compact row (an embedder registering both families gets the
full row, the one-call workflows). Neither registered: the type is not served.

### 3.2 Table

| Operation | core (`mcp-abap-adt`, `-http`, `-sse`) | core-ro | compact (`-compact`, `-compact-http`, `-compact-sse`) | compact-ro | legacy (all) |
|---|---|---|---|---|---|
| create | `Create<Type>` (`CreateClass`, …): name → type's name argument, `package_name`, `description`, `transport_request` | — | `HandlerCreate`: `object_type`, the member's name argument, `package_name`, `description`, `transport_request` | — | — |
| get | `Get<Type>`: name → name argument | `Get<Type>` (no `GetLocal*`) | `HandlerGet`: `object_type`, the member's name argument | `HandlerGet` | — |
| update | `Get<Type>` to read, `Update<Type>` to write: name, `source_code` (or the type's content argument), `transport_request` | — | `HandlerGet` to read; `HandlerLock` → `HandlerUpdate` (`lock_handle`, content argument, `transport_request`) → `HandlerUnlock` | — | — |
| delete | `Delete<Type>`: name, `transport_request` | — | `HandlerDelete`: `object_type`, name, `transport_request`; a class include or `UNIT_TEST` inside `HandlerLock` / `HandlerUnlock` of its class | — | — |
| activate | `Activate<Type>`: name | — | `HandlerActivate`: `object_type`, `object_name` | — | — |
| check | `Check<Type>`: name | — | `HandlerCheckRun`: `object_type`, `object_name` | `HandlerCheckRun` | — |

On cloud every family drops the `PROGRAM` / `INCLUDE` writes (§1.4). On Streamable HTTP the
compact update and the compact delete of a class include carry the lock's `state_handle`
(§3.5). On `legacy` nothing is listed (§1.4).

### 3.3 The rows are typed tables, the words come from the definitions

A row holds only what no definition states: the tool name(s) and which of the tool's
arguments the prompt's `name` (and `package_name`, …) fills. Everything else is read from the
**registered, listed** definition at registration time: whether the tool is listed, its
members on the kind, its required arguments and their descriptions, and (compact) the
member's argument token.

- Full rows: `FULL_ROWS[operation][type] = { tool, name }`, `tool` a tool name literal and
  `name` typed as a key of that tool's input (`keyof z.input<typeof TOOL_DEFINITION.inputSchema>`
  of the handler module the group already imports) — a wrong key is a compile error.
- Compact rows: per operation the tool (`HandlerCreate`, …) and per member the name key, typed
  against the member's entry in `COMPACT_<OP>_TAKES` — a key the member does not take is a
  compile error.
- The read step of `update`: `READ_AS`, typed `Partial<Record<UpdateType, ReadType>>` — the
  type itself, but `UNIT_TEST` and `CDS_UNIT_TEST`, whose content (`test_class_source`) is the
  class's local test classes, read as `LOCAL_TEST_CLASS` (Inference from the update tokens; the
  plan confirms it against `UpdateUnitTest` / `UpdateCdsUnitTest` before any code). The full
  set has no `GetUnitTest`, so without it those two would leave full `update`.
- The compact lock target of an update or include delete: `LOCKED_AS`, typed
  `Record<UpdateMember-not-in-LockMember, LockMember>` (each class include, `UNIT_TEST`,
  `CDS_UNIT_TEST` → `CLASS`, locked by `class_name`); a type `HandlerLock` serves is locked as
  itself. The compiler requires an entry for every member `HandlerLock` does not serve.
- The member tokens of §1.5 move out of `compactDescriptions.ts` into exported accessors
  (`createToken(member)`, …) that the descriptions themselves use, so the prompt quotes the
  description's own words — one source.

### 3.4 Prompt description

Generated once per binary: the static sentence of §2.1 with `<tools>` = the tools of the
rows the binary serves, deduplicated in row order: compact `HandlerCreate`; full the
per-type tools, listed (`CreateClass, CreateInterface, …`). No value of any argument is in a
description.

### 3.5 HTTP and the lock

Where the server declares `state_handle` on every tool (`stateHandleArgument`, the Streamable
HTTP binaries), a compact sequence under a lock says to send the `state_handle` `HandlerLock`
answers as the `state_handle` argument of `HandlerUpdate` / `HandlerDelete` and
`HandlerUnlock`. Full-set rows are one call each and carry nothing of it.

## 4. Visibility

Computed **once**, at registration, from the entries the server listed on its kind (the
`listedTool` result `registerHandlers` already computes), after the deny list:

1. **A type is served by an operation** when its row's tools are all listed and the type is
   in each compact tool's members on the kind (`variants[kind].members`; the narrowed
   `members` with no kind stated; the definition's own with neither). Compact `update`:
   `HandlerGet`, `HandlerUpdate`, `HandlerLock`, `HandlerUnlock` all serve it (the lock and
   unlock as `LOCKED_AS` names it, the get as `READ_AS` names it). Full `update`: the get
   tool of `READ_AS`'s type and `Update<Type>` listed.
2. **A prompt is listed** when its operation serves at least one type. Otherwise it is not
   registered at all (never registered-and-disabled: nothing in the binary can enable it
   later, since the tool set and the kind are fixed).
3. **The kind** is the server's one kind: a type the kind's table does not serve is in no
   member list and has no listed full tool, so it is neither completed nor accepted (cloud
   `create program`). No kind stated: the definitions as they are (the on-premise ones),
   as tools are listed then.
4. **The deny list** acts through the registered definitions: `CreateClass` or
   `HandlerCreate.CLASS` removes `class` from `create`; `HandlerLock.CLASS` removes `class`
   (and every class include) from compact `update`; `Create*` or `HandlerCreate` removes the
   `create` prompt. No prompt reads the deny entries itself.
5. **The read-only binaries** list only what their tools serve: core-ro `get`; compact-ro
   `get`, `check`.
6. **A type the binary does not serve, named anyway.** `prompts/get` with an `object_type`
   outside the operation's served set (unknown, unserved on the kind, or denied) is refused
   with `McpError(InvalidParams, words)` and no instruction:
   `<operation>: object_type "<value>" is not served by this server; it serves <list>.` The
   list is the served types, lowercase. The check reads the same served set the completion
   reads.
7. **`object_type` in any case.** The value is matched without regard to case (`class`,
   `CLASS`); the instruction names the canonical upper-case member.

`HandlerSystem` actions (`where_used`, `search_object`, …) carry no `members` when narrowed
(§1.3), so any prompt routed through one needs that fixed first — it is in Q4, not in the six.

## 5. The instruction text

### 5.1 Shape

`prompts/get` answers one user message of text:

```
<Operation> the <TYPE> <name>.
<numbered steps, one per tool call>
<for compact: "<TYPE> takes <member token>; * marks a required argument.">
<for full: "Still to fill before the call: <arg> (<its description>), …" — the tool's
 required arguments the prompt does not fill; omitted when none>
<when given: "The change: <change>">
```

Every value the user gave goes in as a JSON string literal (`JSON.stringify`), so a quote or
a line break in it stays unambiguous. Steps name a tool, then its arguments as
`argument: value`; an argument the model fills from an earlier step says which. The words
are functional: what to call, with what.

### 5.2 Worked examples

Placeholders `<…>` stand for the user's values.

**core, stdio, onprem — `/create class <name> package_name=<pkg>`**

```
Create the CLASS "<name>".
1. Call CreateClass with class_name: "<name>", package_name: "<pkg>".
```

**core, cloud — `/update class <name> change=<words>`**

```
Update the CLASS "<name>".
1. Read it: call GetClass with class_name: "<name>".
2. Write it: call UpdateClass with class_name: "<name>", source_code: the whole new source.
The change: "<words>"
```

**core — `/get function_module <name>`** (a required argument the prompt does not fill)

```
Get the FUNCTION_MODULE "<name>".
1. Call GetFunctionModule with function_module_name: "<name>".
Still to fill before the call: function_group_name (<its description in the schema>).
```

**compact, stdio — `/create class <name> package_name=<pkg>`**

```
Create the CLASS "<name>".
1. Call HandlerCreate with object_type: "CLASS", class_name: "<name>", package_name: "<pkg>".
CLASS takes CLASS(class_name*, package_name*); * marks a required argument.
```

**compact, Streamable HTTP — `/update class <name> change=<words>`**

```
Update the CLASS "<name>".
1. Read it: call HandlerGet with object_type: "CLASS", class_name: "<name>".
2. Lock it: call HandlerLock with object_type: "CLASS", object_name: "<name>"; keep the
   lock_handle and the state_handle it answers.
3. Write it: call HandlerUpdate with object_type: "CLASS", class_name: "<name>",
   lock_handle: from step 2, source_code: the whole new source, state_handle: from step 2.
4. Unlock it: call HandlerUnlock with object_type: "CLASS", object_name: "<name>",
   lock_handle: from step 2, state_handle: from step 2 — after step 3, whatever it answered.
CLASS takes CLASS(class_name*, source_code*, transport_request); * marks a required argument.
The change: "<words>"
```

On stdio and SSE step 2 keeps the `lock_handle` alone, and no step carries `state_handle`.

**compact — `/delete local_types <class>`** (a class include: under the class's lock)

```
Delete the LOCAL_TYPES of "<class>".
1. Lock the class: call HandlerLock with object_type: "CLASS", object_name: "<class>"; keep
   the lock_handle it answers.
2. Call HandlerDelete with object_type: "LOCAL_TYPES", class_name: "<class>",
   lock_handle: from step 1.
3. Unlock the class: call HandlerUnlock with object_type: "CLASS", object_name: "<class>",
   lock_handle: from step 1 — after step 2, whatever it answered.
LOCAL_TYPES takes LOCAL_TYPES(class_name*, lock_handle*, transport_request); * marks a
required argument.
```

**core-ro — `/get program <name>`**: `1. Call GetProgram with program_name: "<name>".`
**compact-ro — `/check class <name>`**: `1. Call HandlerCheckRun with object_type: "CLASS",
object_name: "<name>".`

### 5.3 Where each piece of the text comes from

| Piece | Source |
|---|---|
| tool name | the row (§3.3), confirmed listed; the read step's from `READ_AS` |
| the name argument's key | the row, typed against the tool's input |
| `package_name`, `description`, `transport_request` | passed when the tool's listed schema has that property; otherwise dropped, and the type's token (compact) or still-to-fill list (full) shows what the tool takes |
| the content argument of an update (`source_code`, `ddl_code`, `test_class_code`, …) | the row: full per tool, compact the member's update token |
| compact member token | the exported token accessor the description uses (§3.3) |
| full "still to fill" | the listed schema's required properties minus those filled, each with its description |
| lock steps, `state_handle` | compact rows with `LOCKED_AS`; the server's `stateHandleArgument` |

## 6. Completion

- `object_type` is `completable(z.string(), …)`: the served types of the operation (§4.1),
  **lowercase** (`class`, `data_element`), in the tool's member order, filtered by a
  case-insensitive prefix of what the user typed (plain `startsWith`, no regex). At most 25
  types per operation, under the SDK's cut of 100.
- No other argument has a closed set among the six prompts. `name` is not completed (object
  names from the SAP system are out of scope, goal).
- Per binary and kind (**Measured**: the listed-schemas fixture counted under §2.2), served
  types per operation:

  | Binary family, kind | create | get | update | delete | activate | check |
  |---|---|---|---|---|---|---|
  | core, onprem | 20 | 23 | 24 | 24 | 16 | 14 |
  | core, cloud | 18 | 23 | 22 | 22 | 14 | 14 |
  | core-ro, onprem / cloud | — | 19 | — | — | — | — |
  | compact, onprem | 18 | 23 | 24 | 24 | 18 | 14 |
  | compact, cloud | 16 | 23 | 22 | 22 | 16 | 14 |
  | compact-ro, onprem / cloud | — | 23 | — | — | — | 14 |
  | any, legacy | — | — | — | — | — | — |

  `update` counts assume the read step of §3.3 (`READ_AS`). The fixture (§9) states each list
  exactly.

## 7. Where prompts are registered

- **`BaseMcpServer.registerHandlers`** (composite branch): after the tool loop, from the same
  `listedTool` results and the same kind, it builds the prompt set and registers each prompt
  on its `McpServer`. This covers every binary (stdio `StdioServer`, SSE `SessionServer`,
  Streamable HTTP `PerRequestServer` — each calls `registerHandlers` before it connects:
  stdio right before `connect`, SSE in `init`, HTTP in the per-request constructor; Code)
  and `EmbeddableMcpServer`, and the exporter's `createRegistry()` handed to either.
  - An HTTP per-request instance registers the prompts again, as it does its tools; the
    prompt set is a pure function of (listed entries, kind, `stateHandleArgument`), so it may
    be computed once per registry and reused (Inference: the plan measures whether it matters).
  - The non-composite branch (a registry registering its own tools) gets no prompts: the
    server sees no entries of it (Code).
- **A plain registration on an SDK `McpServer`** (`registerAllTools`, `registerHandlers` of a
  group, `HandlerExporter.registerOnServer`): **opt-in** — one exported function, from the
  registry's groups and the kind they state (the rule `registerAllTools` already applies),
  e.g. `registerAbapPrompts(server, registry)`. `registerAllTools` itself registers no
  prompt, so an embedder's server gets no prompt names it did not ask for (they would collide
  with its own: `registerPrompt` throws on a duplicate name). Q3.
- **The exporter**: `createRegistry()` → through `BaseMcpServer`, as above; `registerOnServer`
  → the opt-in function, given the exporter's registry. Nothing in `HandlerExporter` changes
  but documentation. Q3.
- **Code placement**: `src/lib/prompts/` in `@mcp-abap-adt/lib` (lib holds the full-set
  handler modules, the compact schemas, tokens, `TAKES` and members, so every type the rows
  need is importable without a new package edge); exported as `@mcp-abap-adt/lib/prompts`
  (`tools/check-exports.js` follows).

## 8. Static types and the code rules

- The rows are typed tables; the prompt module takes listed definitions as their contract
  types (`ToolDefinition`, `VariantToolDefinition`), never `unknown` narrowed by hand. The
  required-argument list of a full tool comes from zod's own JSON schema of the listed schema
  (`z.toJSONSchema`, zod 4, no new dependency) — Inference: the plan confirms its typing needs
  no cast; if it does, the plan names another typed read before any code.
- No cast, `any`, `!`, `ts-ignore`, regex, timeout, retry or polling. `prompts/get` sends
  nothing to SAP and takes no connection.
- Operations, families and members are literal unions; the `operation → rows` map is a
  `Record` over the union, so a seventh operation without rows does not compile.

## 9. Tests

The runner is the one `master` uses when implementation starts (Jest at `8a9ed531`; PR #361
moves the rest to `node:test`).

1. **Listed prompts fixture** — `tests/fixtures/tools/listed-prompts.json`, as
   `listed-schemas.json` is made: every prompt each of the twelve binaries lists, per kind
   (`onprem`, `cloud`, `legacy`, and none stated), read as a client reads it
   (`prompts/list` over the transports `servedTools.ts` already drives), each distinct value
   once with every `<kind> <binary>` that lists it; plus the `object_type` completion of every
   prompt per listing (`completion/complete` with an empty value). Written with
   `WRITE_LISTED_PROMPTS=1`, refused under CI.
2. **Generated text** — per family and kind, one `prompts/get` per (operation, served type)
   on the stdio binary, and the HTTP compact binary for `update` / class-include `delete`;
   texts compared with a fixture (`prompt-texts.json`), each one asserting the tool names it
   cites are listed by that binary on that kind.
3. **Refusals** — unknown type, a type the kind drops (cloud `create program`), a denied type,
   a missing required argument: each refused with its words and no message; `CLASS` and
   `class` both accepted.
4. **Deny list** — `CreateClass`, `HandlerCreate.CLASS`, `HandlerLock.CLASS` (compact update
   and class-include delete lose their types), `Create*`, `HandlerCreate`: listing,
   completion and refusal follow, with nothing read from the deny entries by the prompt module.
5. **Rows complete** — every member of every compact tool of an operation, and every full
   `<Operation><Type>` tool a binary lists for a §2.2 type, has a row (a new type without a
   row fails); every row's tool is in its set's registry.
6. **No request** — `prompts/get` and `completion/complete` against the ADT stand-in
   (`adtStandIn`) send zero requests and take no connection.
7. **Descriptions** — the prompts' and arguments' descriptions join
   `toolDescriptionsCarryNoLiterals.test.ts`; the prompt descriptions name only listed tools.
8. **Typecheck** — a `__typechecks__` file: a row with a key its tool does not take, and a
   missing `LOCKED_AS` entry, fail to compile (`@ts-expect-error`).
9. **Plain registration** — the opt-in function on an SDK `McpServer` lists what
   `BaseMcpServer` lists for the same groups and kind; `registerAllTools` alone lists none.

**Live tests: none.** A prompt sends nothing to SAP and builds text from definitions the
listing tests already pin per binary and kind; the tool calls a model then makes are the
tools' own, each covered by its live tests (CLAUDE.md, "Every handler: unit + integration").
What a live run could add — that a client shows the prompt — is the client's, not ours.

## 10. Documentation

- `README.md`: a "Prompts" section — the six, their arguments, one example per family.
- `docs/user-guide/PROMPTS.md` (new): the prompt page — per binary and kind, the prompts and
  their `object_type` values, rendered from `listed-prompts.json` by
  `tools/generate-tools-docs.js` beside the tool pages; how a client shows them; the refusal.
- `docs/user-guide/AVAILABLE_TOOLS*.md`: a line pointing each operation's tools to its prompt
  (generated).
- `docs/user-guide/ACCESS_RESTRICTIONS.md` and `HANDLERS_MANAGEMENT.md`: a denied tool or
  value removes its prompt types, and the prompt with none left.
- `docs/user-guide/CLIENT_CONFIGURATION.md`: where clients show MCP prompts.
- `docs/architecture/HANDLER_EXPORTER.md`, `TOOLS_ARCHITECTURE.md`, `src/lib/handlers/README.md`:
  the prompt module, its registration paths, the opt-in function.
- `docs/README.md`: the new page in the index.
- `CHANGELOG.md`: a new minor (24.1.0, unless the release carries other work) — "Added: MCP
  prompts". No migration note: nothing existing changes for a consumer (an embedder's
  `BaseMcpServer` now lists prompts; Q3 covers whether that needs an option).
- `CLAUDE.md` is the controller's, with the owner's approval of the text; the plan names the
  lines it would add (the prompt rows, where they live).

## 11. Open questions for the owner

1. **Prompt names.** `create` / `get` / … or prefixed `abap-create`? Clients namespace
   prompts by server (a slash command usually reads `/<server>:create`), and the operation
   names match the goal's examples. **Recommendation: plain operation names.**
2. **`update` and the source.** A prompt argument is one string typed in a client's dialog,
   which suits a sentence, not a whole source. **Recommendation: `change` (what to change, in
   words), optional; the model reads the object and writes the new content, as §5.2 shows.**
   Alternative: a `source_code` argument passed verbatim.
3. **Embedders.** `BaseMcpServer` (and so `EmbeddableMcpServer` and the exporter's
   `createRegistry()`) lists prompts from this release, and a plain registration gets them
   only by the opt-in function. **Recommendation: as specified, plus a `prompts: false` option
   on `BaseMcpServer` for an embedder that registers prompts of its own names.** Alternative:
   opt-in everywhere but the twelve binaries' runtimes.
4. **More operations.** Candidates, each with what it costs:
   - unit-test run (`RunUnitTest`, `RunProgramUnitTest`, … / `HandlerUnitTestRun`, whose
     target is an object, not an `object_type`): a row shape of its own;
   - where-used and object search (`GetWhereUsed`, `SearchObject` / `HandlerSystem`
     `where_used`, `search_object`): needs the narrowed `HandlerSystem` to carry its actions
     left as `members` (§1.3), which also changes its search `_meta` — a listed-schemas fixture
     change;
   - validate and deletion check (compact only: `HandlerValidate`, `HandlerDeletionCheck`).
   **Recommendation: the six now; unit-test run and where-used next, each its own change.**
5. **Transports and the debugger.** Transports (create a request, list, read) are a request's
   work, not an object's, and the debugger is a conversation of many calls at a stopped
   program. **Recommendation: no prompt for either now; transports first if wanted, as a
   `transport` prompt with an `action` argument completed from the served actions.**
6. **Full-set-only types** (message class, function include, enhancement, transaction):
   **Recommendation: not in the vocabulary now; compact's names are the one vocabulary, and a
   full-only type is added with its row when asked for.**
7. **`object_type` values as completed.** **Recommendation: lowercase (`class`,
   `data_element`), as the goal's examples write them; any case accepted.** Alternative:
   upper case, as the tools take them.
8. **`get` part.** `GetClass` and `HandlerGet` take `part` (source, metadata, …), with
   different value sets per family. **Recommendation: no `part` argument now — the tool's
   default part (source) — and the model asks for metadata by the tool when the user does.**

## 12. Out of scope

Completing object names from the SAP system; prompts for work no registered tool serves; any
change of a tool's behaviour, schema or description (the token accessors of §3.3 move the
same strings, and the description texts stay byte for byte — the listed-schemas fixture
proves it).
