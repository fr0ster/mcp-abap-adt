# Handler Sets Management

## Overview

**The binary fixes the tool set** (19.0.0). There is no `--exposition` and no compact `ro` / `rw`:
you choose the tools by the package you install. Four kinds of binary, each on stdio, Streamable
HTTP and SSE, each `-ro` binary a package of its own:

| Kind | stdio | Streamable HTTP | SSE | Tools |
|---|---|---|---|---|
| core | `mcp-abap-adt` (`@mcp-abap-adt/core`) | `mcp-abap-adt-http` (`@mcp-abap-adt/http`) | `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`) | readonly (with system and search), high, debug, background runs, batch mode; on stdio the leftover-session list and logoff |
| core-ro | `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`) | `mcp-abap-adt-http-ro` (`@mcp-abap-adt/http-ro`) | `mcp-abap-adt-sse-ro` (`@mcp-abap-adt/sse-ro`) | readonly (with system and search), batch mode; on stdio the leftover-session list and logoff |
| compact | `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`) | `mcp-abap-adt-compact-http` (`@mcp-abap-adt/compact-http`) | `mcp-abap-adt-compact-sse` (`@mcp-abap-adt/compact-sse`) | the compact readonly and modify tools, the compact debugger, background runs, `HandlerBatch`; on stdio the leftover-session list and logoff |
| compact-ro | `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`) | `mcp-abap-adt-compact-http-ro` (`@mcp-abap-adt/compact-http-ro`) | `mcp-abap-adt-compact-sse-ro` (`@mcp-abap-adt/compact-sse-ro`) | the compact tools that change nothing, `HandlerBatch`; on stdio the leftover-session list and logoff |

No `-ro` binary carries a debugger or a background run, no binary a resume of a leftover session
(a stdio server takes up the one leftover session of its destination at its start), and no http or
sse binary any leftover-session tool: one such server holds the sessions of many users,
so it writes no runtime session file. A
write binary keeps every readonly tool: writing needs reading (in core a `Read<X>` gives way to
the high group's `Get<X>` of the same object, see the dedup below).

Batch mode is in every binary, on every transport: the full binaries, `-ro` ones included, serve
`BatchBegin`, `BatchEnd` and `BatchAnswers`; the compact ones serve it as one tool, `HandlerBatch`
(`action: 'begin' | 'end' | 'answers'`). Every other tool's description ends with one sentence
saying whether a call of it is recorded in batch mode, for which arguments, or refused — see
[Batch Mode](BATCH_MODE.md).

Tool counts (on-premise, measured by the tests), stdio / http and sse: core 254 / 252; core-ro
71 / 69 (each with the 3 batch tools); compact 37 / 35 (27 + 4 debugger verbs + 3 background-run +
`HandlerBatch`, + the 2 leftover-session tools, list and logoff, on stdio); compact-ro 19 / 17
(16 + `HandlerBatch`, + the leftover-session list and logoff on stdio).

## Handler Sets

### Available Sets

1. **readonly** - Read-only operations (safe, recommended for production)
   - Programs, classes, functions (read)
   - Tables and structures (schema only)
   - Search operations
   - Package and interface queries
   - Type information

2. **high** - High-level write operations
   - Object creation
   - Object modification through ADT
   - Package creation, update (`UpdatePackage`) and deletion (`DeletePackage`)
   - Transport operations

3. **low** - gone from `mcp-abap-adt`, `-http` and `-sse` in 19.0.0. `--exposition=…,low`
   stops the start, as every `--exposition` does, with this sentence: *"the low set is gone from mcp-abap-adt / -http / -sse; use
   mcp-abap-adt-compact (or -compact-http / -compact-sse)"*. Its single-step operations —
   lock, a write under the lock you hold, unlock, check, validate, activate, the node and
   object structure reads — are compact's: see [MIGRATION-19.0](../MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries)
   for the tool-by-tool table.

4. **compact** - Compact facade operations — served by their own commands, `mcp-abap-adt-compact`
   (`@mcp-abap-adt/compact`, every tool below and four debugger verbs: `HandlerDebugStart`,
   `HandlerDebugWait`, `HandlerDebugView`, `HandlerDebugStep`) and `mcp-abap-adt-compact-ro`
   (`@mcp-abap-adt/compact-ro`, the 16 that change nothing: no create, update, delete,
   activate, lock, unlock, unit-test run or profiler run, and no debugger verb).
   - `HandlerValidate`
   - `HandlerActivate`
   - `HandlerLock`
   - `HandlerUnlock`
   - `HandlerCheckRun`
   - `HandlerUnitTestRun`, `HandlerUnitTestStatus`, `HandlerUnitTestResult`
   - `HandlerCdsUnitTestStatus`, `HandlerCdsUnitTestResult`
   - `HandlerProfileRun`, `HandlerProfileList`, `HandlerProfileView`
   - `HandlerDumpList`, `HandlerDumpView`
   - `HandlerServiceBindingListTypes`, `HandlerServiceBindingValidate`
   - `HandlerTransportCreate`, `HandlerTransportSortAndCompress`, `HandlerTransportMoveObjects`
   - `HandlerCreate`
   - `HandlerGet`
   - `HandlerSearch`, `HandlerWhereUsed`, `HandlerGetData`
   - `HandlerUpdate`
   - `HandlerDelete`
   - Contract:
     - CRUD via `HandlerCreate|Get|Update|Delete` + required `object_type`
     - `HandlerGet` also takes `part` — `source` (the default), `metadata`,
       `urls`, or `contents`. `metadata` routes to the reader that returns the object's metadata
       document, which sixteen object types have; `urls` answers the service,
       `$metadata` and browser preview URLs and exists for a service binding
       alone; `contents` lists a package's members, one line each. A part an object type does not offer is refused by name and the
       refusal says which parts it does offer — never substituted with another.
     - Lifecycle via `HandlerValidate|Activate|Lock|Unlock|CheckRun`
     - Runtime/tests/service-binding/transport via dedicated compact handlers
   - Source of truth for compact route coverage:
     - `src/handlers/compact/high/compactMatrix.ts`
     - the compact facade is its own package now: its page is generated by
       `@mcp-abap-adt/compact` (`compact/docs/AVAILABLE_TOOLS.md`)
   - Current action coverage:
     - `UNIT_TEST`: `run`, `status`, `result`
     - `CDS_UNIT_TEST`: `status`, `result`
     - `SERVICE_BINDING`: `list_types`, `validate`
     - `TRANSPORT`: `create_transport`, and read through `HandlerGet` (the objects of a request or task, each with its `position`)
     - `CLASS` / `PROGRAM`: `runProfiling`
     - `RUNTIME_PROFILE`: `viewProfiles`, `viewProfile`
     - `RUNTIME_DUMP`: `viewDumps`, `viewDump`

5. **debug** - The debugger: always in `mcp-abap-adt`, `-http` and `-sse`; in no `-ro` binary
   - ABAP: `DebugStartListener`, `DebugTakeOverListener`, `DebugWait`, `DebugStop`,
     breakpoints, stack, variables, watchpoints, steps, termination, settings, memory
   - AMDP: `AmdpDebugStart`, `AmdpDebugWait`, `AmdpDebugStep`, `AmdpDebugGetTable`,
     `AmdpDebugSetBreakpoints`, `AmdpDebugCancel`, `AmdpDebugStop`
   - Memory snapshots: `MemorySnapshotList`, `MemorySnapshotGet`, `MemorySnapshotDelta`
   - In user mode a breakpoint or a listener catches **every request of the request
     user** (the connected SAP user unless another is named). Install a `-ro` binary where
     that must not be possible.
   - Sessions, handles, the SAP ids and what ends a session: [Debugger](DEBUGGER.md)

6. **search** - In every core and core-ro binary
   - Object search
   - Code search

7. **system** - In every core and core-ro binary, beside the read-only group
   - Where-used analysis (GetWhereUsed)
   - Type information (GetTypeInfo)
   - Object info (GetObjectInfo)
   - ABAP AST and semantic analysis
   - System symbols
   - Session management
   - SQL queries
   - Inactive objects
   - Transactions
   - Class and program runs (`RuntimeRunClass`, `RuntimeRunProgram`), and beside them their
     background runs: `GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`
     ([Background runs](README.md#background-runs-of-a-class-or-a-program)) — those three in
     the core binaries only. `mcp-abap-adt-ro` keeps `RuntimeRunClass` and `RuntimeRunProgram`
     (they are system tools: "read-only" means the user cannot change code, and running it is
     allowed, as in SAP) without `background` — it keeps no background run, so the parameter is
     not in their schema and is not read. Compact serves `HandlerBackgroundRunGet`,
     `HandlerBackgroundRunList` and `HandlerBackgroundRunDiscard` beside `HandlerProfileRun`, in
     the compact write binaries

8. **leftover sessions** - In every stdio binary (compact too), in no http or sse one
   - `ListLeftoverSessions` and `LogoffLeftoverSession` in every stdio binary (the `-ro` ones
     included: a logoff is a system action, not a data change). Compact:
     `HandlerLeftoverSessionList`, `HandlerLeftoverSessionLogoff`
   - The SAP sessions a killed server process left open, listed or logged off by the user; they
     act only on the caller's own sessions. No tool resumes one: a stdio server takes up the one
     leftover session of its destination at its start
   - [Leftover SAP sessions](README.md#leftover-sap-sessions-of-a-killed-process)

## Usage

Install the package whose binary serves the tools you want; the binary takes no flag for it.

```bash
# readonly, high, debug, background runs (and the leftover sessions on stdio)
npm install -g @mcp-abap-adt/core
mcp-abap-adt --env-path=.env --system-type=<onprem|cloud>

# the readonly tools alone (with system and search)
npm install -g @mcp-abap-adt/core-ro
mcp-abap-adt-ro --env-path=.env --system-type=<onprem|cloud>

# the compact tools; and those that change nothing
npm install -g @mcp-abap-adt/compact @mcp-abap-adt/compact-ro
mcp-abap-adt-compact --env-path=.env --system-type=<onprem|cloud>
mcp-abap-adt-compact-ro --env-path=.env --system-type=<onprem|cloud>
```

#### `--exposition` is gone

`--exposition` (either spelling) and the config file's `exposition` stop the start, before
anything is read, with one sentence per word, naming the binary of the same transport that serves
what the word asked for (here as stdio names them; `-http` / `-sse` name their own):

| Word | The sentence |
|---|---|
| `readonly` | `--exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by` `` `mcp-abap-adt-ro` (`@mcp-abap-adt/core-ro`) `` |
| `high` | `…; the high tools are served, beside the readonly ones, by` `` `mcp-abap-adt` (`@mcp-abap-adt/core`) `` |
| `debug` (core family) | `…; the debugger is always served by` `` `mcp-abap-adt` (`@mcp-abap-adt/core`) ``, `and by no -ro binary` |
| `debug` (compact family) | `…; the compact debugger is always served by` `` `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`) ``, `and by no -ro binary` |
| `ro` | `…; the compact tools that change nothing are served by` `` `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`) `` |
| `rw` | `…; all compact tools are served by` `` `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`) `` |
| `compact` | `…; the compact tools are served by` `` `mcp-abap-adt-compact` (…) ``, `those that change nothing by` `` `mcp-abap-adt-compact-ro` (…) `` |
| `low` (core family) | `the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)` (verbatim) |
| `low` (compact family) | `…; the low set is gone from mcp-abap-adt / -http / -sse, and this binary serves its analogue, the compact tools` |
| anything else, or none | `…;` `` `mcp-abap-adt` (…) `` `serves readonly, high and debug,` `` `mcp-abap-adt-ro` (…) `` `the readonly tools alone` (compact: the compact pair) |

With several words, the one asking for the most answers: `low`, `compact`, `high`, `rw`, `debug`,
`readonly`, `ro`, in that order (`--exposition=readonly,high` names the write binary). From the
config file the form is `exposition (config file)`.

The binaries duplicate no tool: the full ones carry no low tool and no compact `Handler*` tool,
the compact ones none of the full set's high tools; only read-only reads may appear in both
(pinned by `src/__tests__/unit/toolSet.test.ts`).

#### Readonly / high-level dedup

In the core binaries, where `readonly` and `high` are both served, `Read<X>` readonly handlers duplicate the corresponding `Get<X>` from the high-level group (e.g. `ReadFunctionModule` vs `GetFunctionModule`). The launcher hides the readonly `Read<X>` variants there so that only one tool per operation is visible to the client; the `-ro` binaries serve the `Read<X>` variants.

`EmbeddableMcpServer` applies the same dedup by default, so embedders see one tool per operation just like the launcher. Consumers that need both variants can opt out by passing `new NoDedupStrategy()` as `readOnlyDedupStrategy`. See [EmbeddableMcpServer dedup strategies](#embeddablemcpserver-dedup-strategies) below.

**The same tool in two groups.** A few tools are a copy in both `readonly` and `high` — the same name, schema and handler, because the operation only reads (today: `GetUnitTestResult`). The rule:

- `readonly` alone (the `-ro` binaries) → the tool comes from `readonly`.
- `readonly` + `high` (the core binaries) → the tool appears **once**, from `high`.

`ReadOnlyHandlersGroup` enforces this itself, whatever dedup strategy is passed — a strategy decides about differently named pairs, and one server cannot register two tools under one name. The launcher, `EmbeddableMcpServer` and `HandlerExporter` all hand the group the names of the exposed high tools.

### Config File

A config file (`--conf`) states no tools: its `exposition` key stops the start with the sentence
of its word, as the flag does. Remove it, and install the binary you want instead.

## Generating Handler Documentation

### Generate Full List

```bash
npm run docs:tools
```

This generates:
- `docs/user-guide/AVAILABLE_TOOLS.md` (with the Debug group, which `mcp-abap-adt`, `-http` and `-sse` serve)
- `docs/user-guide/AVAILABLE_TOOLS_READONLY.md` (exactly what `mcp-abap-adt-ro`, `-http-ro` and `-sse-ro` serve, from `fullReadOnlyToolSet`)
- `docs/user-guide/AVAILABLE_TOOLS_HIGH.md`
- `compact/docs/AVAILABLE_TOOLS.md` (generated by the compact package)

With:
- All available handlers
- Parameters and types
- Usage examples
- Category grouping

## Manual Inspection

List handlers by set:

```bash
# ReadOnly handlers
ls -la src/handlers/*/readonly/

# High-level handlers  
ls -la src/handlers/*/high/

# Debug handlers
ls -la src/handlers/debugger/debug/
```

## Handler Set Details

### ReadOnly Handlers Location

```
src/handlers/
├── class/readonly/
├── function/readonly/
├── package/readonly/
├── program/readonly/
├── system/readonly/
├── table/readonly/
└── transport/readonly/
```

### High-Level Handlers Location

```
src/handlers/
├── class/high/
├── function/high/
├── package/high/
├── program/high/
└── transport/high/
```

### What stays under `low/`

`src/handlers/*/low/` holds no registered tool since 19.0.0. What is left there is
implementation: the single-object activations and checks the high tools delegate to, the
writes under a held lock behind compact's `HandlerUpdate` with `lock_handle`, and the
`common/low` dispatchers behind compact's lifecycle tools.

### Debug Handlers Location

```
src/handlers/
└── debugger/debug/    # ABAP, AMDP and memory snapshot tools
```

They are thin over `src/lib/debugger/` (the debug sessions) and `src/lib/state/`
(the instance state that holds them between tool calls and mints the
`state_handle`), published as `@mcp-abap-adt/lib/debugger` and
`@mcp-abap-adt/lib/state`. The compact verbs live in `src/lib/compact/debug/`, served by
the compact tool set of `@mcp-abap-adt/lib/tool-set` on every transport.

## Security Recommendations

1. **Production**: install a `-ro` binary (`mcp-abap-adt-ro`, `mcp-abap-adt-compact-ro`, or
   their `-http` / `-sse` siblings): no high tool, no debugger, no background run. They keep the
   system group's `RuntimeRunClass` and `RuntimeRunProgram`, which run code on the system
2. **Development**: `mcp-abap-adt` (readonly, high and the debugger)
3. **Single-step work** (lock, write under the lock, unlock): the compact command — and
   keep a lock short: releasing what `HandlerLock` took is the caller's job
4. **Debugging**: the debugger is in every core and compact write binary. A breakpoint
   catches every request of the request user, and a `state_handle` gives whoever holds it that debug session — see [Debugger](DEBUGGER.md) and [Security](../../SECURITY.md)

## Implementation

Handler sets are a `ToolSet` (`@mcp-abap-adt/lib/tool-set`, [src/lib/toolSet.ts](../../src/lib/toolSet.ts)),
the one input of each binary's launcher (`main({ toolSet, program, version })`):

- `fullToolSet` — `mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse`. Its groups
  (`expositionGroups(['readonly', 'high', 'debug'])`, [src/lib/handlers/registry/expositionRegistry.ts](../../src/lib/handlers/registry/expositionRegistry.ts)):
  the non-readonly groups first (`high`, `debug`), so their tool names feed the readonly
  dedup; then `readonly` with `SystemHandlersGroup` and the background-run tools; then search
  and, on stdio, every leftover-session tool. A set's `groups(context, transport)` builds the
  leftover-session group for `'stdio'` only.
- `fullReadOnlyToolSet` — `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro`: `readonly`, `system`,
  search, and on stdio the leftover-session list and logoff.
- `compactToolSetOf({ readOnly, modify })` — `mcp-abap-adt-compact`, `-compact-http`,
  `-compact-sse`, with the two halves' entry builders: both halves, the four `HandlerDebug*`
  verbs, the background-run tools, on stdio every leftover-session tool; no search.
- `compactReadOnlyToolSetOf(readOnly)` — `mcp-abap-adt-compact-ro`, `-compact-http-ro`,
  `-compact-sse-ro`: the read-only half (`@mcp-abap-adt/compact-readonly-entries`), on stdio the
  leftover-session list and logoff.

Each set's `expositionRemoved(transport)` is the removed `--exposition` of its launcher's table,
its `toolsHelp(transport)` the TOOLS section of `--help`, and `backgroundRuns` whether the launcher
hands the server a background-run store.

```typescript
import { fullReadOnlyToolSet, registryOf } from '@mcp-abap-adt/lib/tool-set';

const registry = registryOf(fullReadOnlyToolSet); // a CompositeHandlersRegistry
```

## Adding New Handlers

To add handlers to a specific set:

1. Create handler file in appropriate directory:
   - `src/handlers/<domain>/readonly/` for read operations
   - `src/handlers/<domain>/high/` for safe writes

2. Export `TOOL_DEFINITION`:
   ```typescript
   export const TOOL_DEFINITION = {
     name: 'my_handler',
     description: 'Handler description',
     inputSchema: { /* zod schema */ }
   } as const;
   ```

3. Export handler function:
   ```typescript
   export async function handleMyOperation(args: any, context: HandlerContext) {
     // implementation
   }
   ```

4. Register in appropriate group:
   - `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts`
   - `src/lib/handlers/groups/HighLevelHandlersGroup.ts`

5. Regenerate docs:
   ```bash
   npm run docs:tools
   ```

## EmbeddableMcpServer dedup strategies

`EmbeddableMcpServer` exposes an optional `readOnlyDedupStrategy` option to let consumers decide how readonly handlers are deduped against other groups (e.g. HighLevel, LowLevel, Compact) when multiple are exposed at the same time.

```ts
import {
  EmbeddableMcpServer,
  ReadVsGetDedupStrategy,
} from '@mcp-abap-adt/lib/embeddable';

const server = new EmbeddableMcpServer({
  connection,
  exposition: ['readonly', 'high'],
  // Default already applies ReadVsGetDedupStrategy — hides ReadFunctionModule
  // when GetFunctionModule is exposed, etc. Pass it explicitly to be explicit,
  // or pass `new NoDedupStrategy()` to expose both variants.
  readOnlyDedupStrategy: new ReadVsGetDedupStrategy(),
});
```

**Shipped implementations** (importable from `@mcp-abap-adt/lib/handlers` or `@mcp-abap-adt/lib/embeddable`):

| Strategy | Behavior |
|---|---|
| `NoDedupStrategy` | Never excludes anything — readonly group is exposed as-is (opt-out). A tool with the same *name* as one of an exposed group is still exposed once, from that group (see [Readonly / high-level dedup](#readonly--high-level-dedup)). |
| `ReadVsGetDedupStrategy` (default) | Hides a `Read<X>` entry when a corresponding `Get<X>` is contributed by another group. |

**Custom strategies**: implement `IReadOnlyDedupStrategy` for role-based or domain-specific rules:

```ts
import type {
  HandlerEntry,
  IReadOnlyDedupStrategy,
} from '@mcp-abap-adt/lib/handlers';

class RoleAwareDedup implements IReadOnlyDedupStrategy {
  constructor(private readonly role: 'viewer' | 'editor') {}
  shouldExclude(entry: HandlerEntry, overriding: ReadonlySet<string>): boolean {
    if (this.role === 'viewer') return false; // expose readonly as-is
    // editor: dedup against whatever other groups contribute
    const n = entry.toolDefinition.name;
    return n.startsWith('Read') && overriding.has('Get' + n.slice(4));
  }
}
```

The default (`ReadVsGetDedupStrategy`) gives embedders the same single-tool-per-operation view as the launcher. Consumers that relied on both `Read<X>` and `Get<X>` being exposed must pass `new NoDedupStrategy()` to keep that behavior.
