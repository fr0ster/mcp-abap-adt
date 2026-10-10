# Debugger tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A model debugs ABAP and AMDP through the server. It can set breakpoints, catch a program at one, read the stack, variables and memory, step, and release the program. This works both when the model starts the program and when someone else does. It ships for every transport: stdio, SSE, Streamable HTTP (through a pool of instances), and compact.

**Architecture:**
- **The state lives in the server instance.** Each `BaseMcpServer` owns an `InstanceState`: the generic handle (`state_handle`) and the verdict «holds state», over every stateful part. The debugger is its first part, a `DebugSession` (ABAP) and an `AmdpSession`; the SAP ids (`terminalId`/`ideId`) go into `DebugSession`'s constructor.
- **Handlers reach it through `HandlerContext.state` and `HandlerContext.debugger`.** The starting tools return the handle, and every other session tool requires it.
- **Who keeps the instance between calls depends on the transport.**
  - stdio: the process. A restarted process recovers only the ids.
  - SSE: the SSE session, one instance per GET connection, disposed when it closes.
  - Streamable HTTP: `InstancePool` in `server/src`. Per request it takes the instance named by `state_handle` (owner checked) or a new one, keeps it while `holdsState()` and disposes it otherwise.

**Tech Stack:**
- TypeScript 6, Jest 30 + ts-jest, fast-xml-parser 5.
- `@mcp-abap-adt/adt-clients` 27.0.0: `AbapDebugger`, `AmdpDebugger`, `MemorySnapshots`, `AdtExecutor`, `getSystemInformation`.
- `@mcp-abap-adt/adt-strategies` 0.8.1: `analyseDebuggeeEnd`, `analyseException`, `readExceptionSubType`.
- `@mcp-abap-adt/interfaces-adt` 13.2.0.

**Spec:** `docs/superpowers/specs/2026-10-10-debugger-tools-design.md` (decisions D1–D14).

## Global Constraints

- **State lives in the instance, never in a module global.** One debugger instance per `BaseMcpServer` instance (D1). One process may hold several server instances, so module-level state is forbidden.
- **Handle.** `state_handle` belongs to the instance and is generic: locks will use it too. It is 32 upper-case hex characters from `crypto.randomBytes(16)`, and after a complete stop it is invalidated for good. The starting tools return it: `DebugStartListener`, `DebugTakeOverListener`, `AmdpDebugStart` and compact `HandlerDebugStart`. Every session tool takes it as a required argument. A handle that is not this instance's, or one whose state is gone, is answered `state is not available`. Memory snapshot tools take none.
- **Ids.** `terminalId`/`ideId` go into `DebugSession`'s constructor and are never tool arguments. Sources, first match wins:
  1. header `x-sap-debug-terminal-id` / `x-sap-debug-ide-id`;
  2. destination `.env` `SAP_DEBUG_TERMINAL_ID` / `SAP_DEBUG_IDE_ID`;
  3. the process environment;
  4. random, 32 upper-case hex.

  Each source replaces only its own id. Ids are not validated. The starting tools and `DebugListSessions` answer them.
- **No timeouts and no TTL (D4, D10).** Nothing ends on the server's clock. Bounded waits *inside one call* end nothing:
  - the listener's long poll: `holdSeconds: 60`, and 3 s for the first poll of a start;
  - `DebugWait` / `AmdpDebugWait` / `HandlerDebugWait`: `hold_seconds` ≤ 30, default 10;
  - waiting for the AMDP `SYNC_BREAKPOINTS` event inside one call: ≤ 30 s.
- **One debuggee at a time (D5).** While a stop exists the listener does not poll.
- **Every state change is serialised per session.** Each change is fenced by a generation number, and every await is followed by an ownership recheck.
- **Errors.**
  - A listener conflict is a tool error carrying SAP's message: at the start, the start tool fails; later, the next `Wait` fails and the listener is not restarted.
  - A debuggee's end (`debuggeeEnded`, `terminateDebuggee`) is the end of a stop, not an error.
  - A cleanup that fails is reported and never claimed as a success.
- **`debug` is opt-in (D8).** It is served on stdio, SSE and Streamable HTTP. `HandlerExporter` includes it only with `includeDebug: true`.
- **Streamable HTTP pool.**
  - The pool takes an instance once per request, which is one stateless MCP session.
  - One transport at a time per instance (a lease); a second request for the same handle waits.
  - A JSON-RPC batch carrying `state_handle` is refused.
  - The owner is the destination for a destination request, and url, client and login (or the token's user) for an `x-sap-*` request; a request with no identity cannot create state.
  - The pool indexes instances by owner, so one ABAP and one AMDP session per owner, and the listing of an owner's sessions, hold across the pool.
  - Shutdown order: stop admission, drain the leases, dispose every pooled instance, report failures, then settle the providers.
- **Descriptions** describe the function, never its use: no other tool's name, no workflow, no list of answer fields. They name nothing concrete.
  - Every tool that sets breakpoints or starts a listener says, as a fact, that it catches every request of the connected SAP user. The take-over tools say they displace another debugger of that user.
- **Answers** carry the most precise information there is. At a stop that is the object address (type, name, unit of code, line in the object's source) **and** SAP's technical place (program, include, include line, event).
  - Every tool takes `detail: terse|full|raw` (`DETAIL_PROPERTY`). `terse` shortens by count (top 5 frames), never by precision. `full` is the parsed document, and `raw` is SAP's document.
- **`available_in: ['onprem', 'cloud']`** on every new tool.
- **No hard-coded system ids.** Integration tests read every system-specific value (package, transport, user) from the test config. Plans, comments and fixtures name no system id, user or transport.
- **Releases.** The agent never publishes. "Release" means a tag and a push, and only on the user's word.
- **Integration runs.** No IDE may be debugging the same SAP user. Full output goes to a log file (`tee`), with `timeout 1800`.

## Review Focus

1. **A start that is refused.** Under `refuse`, an IDE listening for the user makes the start tool fail. Nothing stays armed: no listener connection stays open and no run starts. *Pinned in Task 4.*
2. **Stop during a long poll, during an attach, or during a stack read.** No stop is resurrected, no connection leaks, and no poll follows the stop. *Pinned in Tasks 4–5.*
3. **A foreign or stale handle.** Another instance's handle, a handle after `DebugStop`, and garbage all get `state is not available`, and nothing is sent to SAP. *Pinned in Tasks 7 and 10.*
4. **Breakpoint answers reordered and with refusals.** Matching is by content. A refusal that is ambiguous within its kind is re-asked one by one with `validationOnly`. *Pinned in Task 4.*
5. **Two requests at once for one pooled instance, and shutdown with instances in the pool.** The second request waits for the first (one transport at a time). Shutdown disposes every pooled instance and reports what failed. *Pinned in Task 9.*

---

## File structure

**Create (lib):**
- `src/lib/state/InstanceState.ts`, `src/lib/state/index.ts` — the instance's state and handle, generic; published as `@mcp-abap-adt/lib/state`.
- `src/lib/debugger/ids.ts` — ids, the handle, the stated overrides.
- `src/lib/debugger/objectUri.ts` — source URI from `{object_type, object_name, include?, parent_name?}`, and its inverse `addressOf(uri)`.
- `src/lib/debugger/readings.ts` — ABAP debugger documents → readings; terse projections.
- `src/lib/debugger/amdpReadings.ts`, `src/lib/debugger/memoryReadings.ts`.
- `src/lib/debugger/serial.ts` — `Serial`, the per-session async mutex.
- `src/lib/debugger/DebugSession.ts` — the ABAP state machine.
- `src/lib/debugger/AmdpSession.ts` — the AMDP state machine.
- `src/lib/debugger/ports.ts` — the live ports: connections, debuggers, request user, run.
- `src/lib/debugger/DebuggerInstance.ts` — both sessions as one part of the instance state: `holdsState()`, `dispose()`, `describe()`, `observe()`.
- `src/lib/debugger/access.ts` — `requireDebugger(context, args, mode)`.
- `src/lib/debugger/answer.ts` — `debugAnswer`, `debugStateAnswer`.
- `src/lib/debugger/schemas.ts` — shared schema fragments and warnings.
- `src/lib/debugger/index.ts` — barrel, published as `@mcp-abap-adt/lib/debugger`.
- `src/handlers/debugger/debug/*.ts` — 30 tools.
- `src/lib/handlers/groups/DebugHandlersGroup.ts`.

**Create (server):**
- `server/src/InstancePool.ts` — the Streamable HTTP pool: lease, owner check, keep/dispose, shutdown.

**Create (compact):**
- `compact/src/debug/group.ts`.
- `compact/src/debug/handleHandlerDebug{Start,Wait,View,Step}.ts`.

**Modify:**
- Context and server instance:
  - `src/handlers/interfaces.ts` (`HandlerContext.debugger?`);
  - `src/embeddable/BaseMcpServer.ts` (lazy debugger instance, context, `dispose()`).
- Request scope and destination context:
  - `src/lib/requestContext.ts`;
  - `src/lib/auth/IAuthBrokerFactory.ts:14`;
  - `src/lib/auth/destinationStores.ts:71-88`;
  - `src/lib/requestSystemResolution.ts:146`.
- Exposition config:
  - `src/lib/config/IServerConfig.ts:30`;
  - `src/lib/config/ServerConfigManager.ts:213-226`, with its help text;
  - `src/lib/config/yamlConfig.ts:385-390`.
- Server and compact launchers:
  - `server/src/launcher.ts:210-225,519-560,613-676` and the help text near l.165;
  - `server/src/StreamableHttpServer.ts:164-240,429` (the pool), `server/src/SseServer.ts:388-389` (dispose on close);
  - `compact/src/launcher.ts`.
- Handler wiring:
  - `src/lib/handlers/HandlerExporter.ts`;
  - `src/lib/handlers/groups/index.ts`;
  - `scripts/list-tools.ts`;
  - `package.json` (`exports["./debugger"]`, `typesVersions`).
- Test ratchets and fixtures:
  - `tests/fixtures/tools/surface.json`;
  - `compact/tests/fixtures/surface.json`;
  - `compact/src/__tests__/compactSurface.test.ts`;
  - `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`.
- Test config templates:
  - `tests/test-config.yaml.template`;
  - `docs/development/tests/test-config.yaml.template`.
- Docs (Task 17), and `SECURITY.md` (new, repository root): the server is never more secure than its host and network.

---

### Task 1: Recorded answers into the server's corpus

The server's corpus is `tests/fixtures/adt` (`src/lib/adtCorpus.ts:16`). It has no debugger cases. The adt-clients repository has them, already sanitised (`SAPUSER01`, `SID`, `sap.example.local`).

**Files:**
- Create: `tests/fixtures/adt/debugger-*.{json,body.xml}`, `tests/fixtures/adt/memory-snapshot-list--*.{json,body.xml}`
- Test: `src/__tests__/unit/debugger/corpus.test.ts`

**Interfaces:**
- Produces: corpus names used in Tasks 3–4. Every case is under `debugger-run-to-line--*`, `debugger-conversation--*`, `debugger-kinds-and-exception--*`, `debugger-message-and-objects--*`, `debugger-terminate--01-terminate-debuggee` or `memory-snapshot-list--0{1,2}-*`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/debugger/corpus.test.ts
import { corpusBody, corpusCases, corpusSidecar } from '../../../lib/adtCorpus';

describe('the debugger answers recorded on a system', () => {
  it.each([
    'debugger-run-to-line',
    'debugger-conversation',
    'debugger-kinds-and-exception',
    'debugger-message-and-objects',
    'debugger-terminate',
    'memory-snapshot-list',
  ])('%s is in the corpus', (prefix) => {
    expect(corpusCases(prefix).length).toBeGreaterThan(0);
  });

  it('the listener answer names the debuggee', () => {
    expect(corpusSidecar('debugger-run-to-line--02-listen').response.status).toBe(200);
    expect(corpusBody('debugger-run-to-line--02-listen')).toContain('<DEBUGGEE_ID>');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/__tests__/unit/debugger/corpus.test.ts`
Expected: FAIL. `corpusCases` returns `[]`, or `corpusSidecar` throws ENOENT.

- [ ] **Step 3: Copy the cases**

```bash
SRC=/home/okyslytsia/prj/mcp-abap-adt-clients/corpus/adt
cp "$SRC"/debugger-*.json "$SRC"/debugger-*.body.xml tests/fixtures/adt/
cp "$SRC"/memory-snapshot-list--*.json "$SRC"/memory-snapshot-list--*.body.xml tests/fixtures/adt/
grep -lE '<the system id>|<the user>' tests/fixtures/adt/debugger-* tests/fixtures/adt/memory-* || echo clean   # fill in the real values locally
```

Expected: `clean`. If any file matches, replace the value with the placeholder used in the same file (`SAPUSER01`, `SID`) before going on.

- [ ] **Step 4: Run it and see it pass**

Run: `npx jest src/__tests__/unit/debugger/corpus.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/adt/debugger-* tests/fixtures/adt/memory-snapshot-list--* src/__tests__/unit/debugger/corpus.test.ts
git commit -m "test(debugger): recorded debugger answers in the server's corpus"
```

---

### Task 2: Ids, the handle, and the address of a line

**Files:**
- Create: `src/lib/debugger/ids.ts`, `src/lib/debugger/objectUri.ts`
- Modify:
  - `src/lib/requestContext.ts` (`RequestContext`, `requestContextFromHeaders`)
  - `src/lib/auth/IAuthBrokerFactory.ts:14` (`DestinationSystemContext`)
  - `src/lib/auth/destinationStores.ts:71-88` (`readDestinationSystemContext`)
  - `src/lib/requestSystemResolution.ts:146` (`withDestinationSystemContext`, which merges the two new keys)
- Test: `src/__tests__/unit/debugger/ids.test.ts`, `src/__tests__/unit/debugger/objectUri.test.ts`

**Interfaces:**
- Produces:

```ts
// ids.ts
export interface DebuggerIds { terminalId: string; ideId: string }
export function newDebuggerId(): string;                       // 32 upper-case hex
export function statedDebuggerIds(env?: NodeJS.ProcessEnv): Partial<DebuggerIds>; // headers → destination .env → env
export function resolveDebuggerIds(env?: NodeJS.ProcessEnv): DebuggerIds & { stated: boolean }; // stated, else random
// objectUri.ts
export interface BreakpointTarget { object_type: string; object_name: string; include?: string; parent_name?: string }
export const BREAKPOINT_OBJECT_TYPES: readonly ['CLAS', 'PROG', 'INCL', 'FUNC'];
export function sourceUriOf(target: BreakpointTarget): string;
export function lineUriOf(target: BreakpointTarget, line: number): string;
export interface ObjectAddress { object_type: string; object_name: string; include?: string; parent_name?: string; line?: number }
export function addressOf(uri: string): ObjectAddress | undefined;  // inverse of lineUriOf, for answers
// requestContext.ts additions
interface RequestContext { debugTerminalId?: string; debugIdeId?: string }
// IAuthBrokerFactory.ts additions
interface DestinationSystemContext { debugTerminalId?: string; debugIdeId?: string }
```

`stated` is `true` when either id came from configuration. Only stated ids can have a predecessor to reconcile with (D12); random ones cannot.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/ids.test.ts
import { newDebuggerId, resolveDebuggerIds, statedDebuggerIds } from '../../../lib/debugger/ids';
import { requestContextFromHeaders, runWithRequestContext } from '../../../lib/requestContext';

describe('debugger ids', () => {
  it('generates 32 upper-case hex characters, different each time', () => {
    const a = newDebuggerId();
    expect(a).toMatch(/^[0-9A-F]{32}$/);
    expect(newDebuggerId()).not.toBe(a);
  });
  it('takes each id from the environment on its own', () => {
    expect(statedDebuggerIds({ SAP_DEBUG_IDE_ID: 'IDE1' })).toEqual({ ideId: 'IDE1' });
    expect(statedDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' })).toEqual({ terminalId: 'T1' });
    expect(statedDebuggerIds({})).toEqual({});
  });
  it('a header wins over the environment, only for its own id', () => {
    runWithRequestContext(requestContextFromHeaders({ 'x-sap-debug-ide-id': 'FROMHEADER' }), () => {
      expect(statedDebuggerIds({ SAP_DEBUG_IDE_ID: 'FROMENV', SAP_DEBUG_TERMINAL_ID: 'T' }))
        .toEqual({ ideId: 'FROMHEADER', terminalId: 'T' });
    });
  });
  it('resolves: stated where given, random elsewhere, and says whether any was stated', () => {
    const r = resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' });
    expect(r.terminalId).toBe('T1');
    expect(r.ideId).toMatch(/^[0-9A-F]{32}$/);
    expect(r.stated).toBe(true);
    expect(resolveDebuggerIds({}).stated).toBe(false);
  });
});
```

```ts
// src/__tests__/unit/debugger/objectUri.test.ts
import { addressOf, lineUriOf, sourceUriOf } from '../../../lib/debugger/objectUri';

describe('the source a line names', () => {
  it('a class main source, as the recorded breakpoint answer names it', () => {
    expect(lineUriOf({ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE' }, 32))
      .toBe('/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32');
  });
  it('a class include, a program, an include, a function module', () => {
    expect(sourceUriOf({ object_type: 'CLAS', object_name: 'ZCL_A', include: 'testclasses' })).toBe('/sap/bc/adt/oo/classes/zcl_a/includes/testclasses');
    expect(sourceUriOf({ object_type: 'PROG', object_name: 'ZP' })).toBe('/sap/bc/adt/programs/programs/zp/source/main');
    expect(sourceUriOf({ object_type: 'INCL', object_name: 'ZI' })).toBe('/sap/bc/adt/programs/includes/zi/source/main');
    expect(sourceUriOf({ object_type: 'FUNC', object_name: 'Z_FM', parent_name: 'ZFG' })).toBe('/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main');
  });
  it('long type forms and namespaces', () => {
    expect(sourceUriOf({ object_type: 'CLAS/OC', object_name: 'ZCL_A' })).toBe('/sap/bc/adt/oo/classes/zcl_a/source/main');
    expect(sourceUriOf({ object_type: 'PROG/I', object_name: 'ZI' })).toBe('/sap/bc/adt/programs/includes/zi/source/main');
    expect(sourceUriOf({ object_type: 'CLAS', object_name: '/NS/CL_A' })).toBe('/sap/bc/adt/oo/classes/%2Fns%2Fcl_a/source/main');   // encodeURIComponent writes upper-case hex
  });
  it('refuses what holds no breakpoint, and a function module without its group', () => {
    expect(() => sourceUriOf({ object_type: 'TABL', object_name: 'T' })).toThrow(/CLAS, PROG, INCL, FUNC/);
    expect(() => sourceUriOf({ object_type: 'FUNC', object_name: 'Z_FM' })).toThrow(/parent_name/);
  });
  it('reads an address back from a stack frame URI', () => {
    expect(addressOf('/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32,0'))
      .toEqual({ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 });
    expect(addressOf('/sap/bc/adt/oo/classes/cl_oo_adt_res_classrun/source/main#type=CLAS%2FOM;name=EXECUTE_CLAS;start=105'))
      .toEqual({ object_type: 'CLAS', object_name: 'CL_OO_ADT_RES_CLASSRUN', line: 105 });
    expect(addressOf('/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main#start=7'))
      .toEqual({ object_type: 'FUNC', object_name: 'Z_FM', parent_name: 'ZFG', line: 7 });
    expect(addressOf('/sap/bc/adt/oo/classes/zcl_a/includes/testclasses#start=3'))
      .toEqual({ object_type: 'CLAS', object_name: 'ZCL_A', include: 'testclasses', line: 3 });
    expect(addressOf('')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/ids.test.ts src/__tests__/unit/debugger/objectUri.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement**

```ts
// src/lib/debugger/ids.ts
/**
 * The debugger's SAP ids. Generated unless stated: two instances of one user
 * with the same ids would share one listener's catches without a conflict
 * (the same `ideId` never conflicts — measured). A user who wants otherwise
 * states them — a header, the destination, the environment; what a shared id
 * brings is theirs. Not validated: SAP judges them.
 */
import { randomBytes } from 'node:crypto';
import { getRequestContext } from '../requestContext';

export interface DebuggerIds { terminalId: string; ideId: string }

export function newDebuggerId(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

export function statedDebuggerIds(env: NodeJS.ProcessEnv = process.env): Partial<DebuggerIds> {
  const scope = getRequestContext();
  const terminalId = scope?.debugTerminalId || env.SAP_DEBUG_TERMINAL_ID?.trim() || undefined;
  const ideId = scope?.debugIdeId || env.SAP_DEBUG_IDE_ID?.trim() || undefined;
  return { ...(terminalId ? { terminalId } : {}), ...(ideId ? { ideId } : {}) };
}

export function resolveDebuggerIds(env: NodeJS.ProcessEnv = process.env): DebuggerIds & { stated: boolean } {
  const stated = statedDebuggerIds(env);
  return {
    terminalId: stated.terminalId ?? newDebuggerId(),
    ideId: stated.ideId ?? newDebuggerId(),
    stated: stated.terminalId !== undefined || stated.ideId !== undefined,
  };
}
```

Request scope: add these two fields to `RequestContext`, with doc comments in the style of `responsible`:

```ts
  debugTerminalId?: string;
  debugIdeId?: string;
```

In `requestContextFromHeaders`, read the two headers the same way `responsible` is read:

```ts
  const debugTerminalId = headerValue(headers, 'x-sap-debug-terminal-id');
  const debugIdeId = headerValue(headers, 'x-sap-debug-ide-id');
  // …
    ...(debugTerminalId ? { debugTerminalId } : {}),
    ...(debugIdeId ? { debugIdeId } : {}),
```

Then:
- `DestinationSystemContext` gets the same two optional fields.
- `readDestinationSystemContext` reads `SAP_DEBUG_TERMINAL_ID` into `debugTerminalId` and `SAP_DEBUG_IDE_ID` into `debugIdeId`, the way it reads `SAP_RESPONSIBLE`.
- `withDestinationSystemContext` merges both keys exactly as it merges `masterSystem`: a key the scope already carries wins, and the destination fills in the rest.

```ts
// src/lib/debugger/objectUri.ts
/**
 * The source a line breakpoint names, from what a model knows — a type and a
 * name — and back. adt-clients does not export its URI builders, so the four
 * kinds that hold executable ABAP are spelled here as ADT spells them.
 */
export const BREAKPOINT_OBJECT_TYPES = ['CLAS', 'PROG', 'INCL', 'FUNC'] as const;
type Kind = (typeof BREAKPOINT_OBJECT_TYPES)[number];

export interface BreakpointTarget { object_type: string; object_name: string; include?: string; parent_name?: string }
export interface ObjectAddress { object_type: string; object_name: string; include?: string; parent_name?: string; line?: number }

const ALIASES: Record<string, Kind> = {
  CLAS: 'CLAS', 'CLAS/OC': 'CLAS', PROG: 'PROG', 'PROG/P': 'PROG',
  INCL: 'INCL', 'PROG/I': 'INCL', FUNC: 'FUNC', 'FUGR/FF': 'FUNC',
};
const seg = (name: string) => encodeURIComponent(name.trim().toLowerCase());
const unseg = (s: string) => decodeURIComponent(s).toUpperCase();

export function sourceUriOf(target: BreakpointTarget): string {
  const kind = ALIASES[target.object_type.trim().toUpperCase()];
  const name = seg(target.object_name);
  switch (kind) {
    case 'CLAS':
      return target.include && target.include.toLowerCase() !== 'main'
        ? `/sap/bc/adt/oo/classes/${name}/includes/${seg(target.include)}`
        : `/sap/bc/adt/oo/classes/${name}/source/main`;
    case 'PROG': return `/sap/bc/adt/programs/programs/${name}/source/main`;
    case 'INCL': return `/sap/bc/adt/programs/includes/${name}/source/main`;
    case 'FUNC':
      if (!target.parent_name) throw new Error('a function module needs parent_name (its function group)');
      return `/sap/bc/adt/functions/groups/${seg(target.parent_name)}/fmodules/${name}/source/main`;
    default:
      throw new Error(`object_type ${target.object_type} holds no breakpoint; one of ${BREAKPOINT_OBJECT_TYPES.join(', ')}`);
  }
}

export function lineUriOf(target: BreakpointTarget, line: number): string {
  return `${sourceUriOf(target)}#start=${line}`;
}

export function addressOf(uri: string): ObjectAddress | undefined {
  if (!uri) return undefined;
  const [path, fragment = ''] = uri.split('#');
  const start = /(?:^|[;,&])start=(\d+)/.exec(fragment)?.[1];
  const line = start ? { line: Number(start) } : {};
  let m = /^\/sap\/bc\/adt\/oo\/classes\/([^/]+)\/(?:source\/main|includes\/([^/]+))$/.exec(path);
  if (m) return { object_type: 'CLAS', object_name: unseg(m[1]), ...(m[2] ? { include: decodeURIComponent(m[2]) } : {}), ...line };
  m = /^\/sap\/bc\/adt\/programs\/(programs|includes)\/([^/]+)\/source\/main$/.exec(path);
  if (m) return { object_type: m[1] === 'programs' ? 'PROG' : 'INCL', object_name: unseg(m[2]), ...line };
  m = /^\/sap\/bc\/adt\/functions\/groups\/([^/]+)\/fmodules\/([^/]+)\/source\/main$/.exec(path);
  if (m) return { object_type: 'FUNC', object_name: unseg(m[2]), parent_name: unseg(m[1]), ...line };
  return undefined;
}
```

- [ ] **Step 4: Run them and see them pass, with the request-context tests**

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/requestContext`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debugger/ids.ts src/lib/debugger/objectUri.ts src/lib/requestContext.ts src/lib/auth/IAuthBrokerFactory.ts src/lib/auth/destinationStores.ts src/lib/requestSystemResolution.ts src/__tests__/unit/debugger/
git commit -m "feat(debugger): SAP ids with stated overrides; a line's source URI and its inverse"
```

---

### Task 3: Readings of the ABAP debugger's documents

**Files:**
- Create: `src/lib/debugger/readings.ts`
- Test: `src/__tests__/unit/debugger/readings.test.ts`

**Interfaces:**
- Produces (all pure):

```ts
export interface DebuggeeReading { debuggeeId: string; user: string; program: string; include: string; line: number; uri: string; objectType: string; objectName: string; instance: string; kind: string; }
export interface AttachReading { debugSessionId: string; isSteppingPossible: boolean; isTerminationPossible: boolean; reachedBreakpoints: string[]; }
export interface FrameReading { position: number; program: string; include: string; line: number; eventType: string; event: string; uri: string; systemProgram: boolean; }
export interface StackReading { cursor: number; frames: FrameReading[]; }
export interface VariableReading { id: string; name: string; type: string; metaType: string; value: string; tableLines: number; }
export interface VariablesReading { variables: VariableReading[]; children: Array<{ parent: string; child: string; label: string }>; }
export interface BreakpointReading { id?: string; kind: string; uri?: string; exceptionClass?: string; statement?: string; msgId?: string; msgNo?: string; msgTy?: string; condition?: string; error?: string; }
export type DebuggeeEnd = 'debuggeeEnded' | 'terminateDebuggee';

export function readDebuggee(xml: string): DebuggeeReading | undefined;   // empty body → undefined
export function readAttach(xml: string): AttachReading;
export function readStack(xml: string): StackReading;
export function readVariables(xml: string): VariablesReading;
export function readBreakpoints(xml: string): BreakpointReading[];
export function readDebuggeeEnd(body: string): DebuggeeEnd | undefined;
export function breakpointKey(b: BreakpointReading | IDebuggerBreakpoint): string;
export interface PlaceReading { address?: ObjectAddress; unit: string; program: string; include: string; include_line: number }
export function placeOf(frame: FrameReading): PlaceReading;   // object address + SAP's technical place
export function terseStop(debuggee: DebuggeeReading, stack: StackReading): { at: PlaceReading; frames: PlaceReading[] };   // top 5 frames, each as precise
export function terseVariables(r: VariablesReading): Array<{ name: string; type: string; value: string; rows?: number }>;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/debugger/readings.test.ts
import { corpusBody } from '../../../lib/adtCorpus';
import {
  breakpointKey, readAttach, readBreakpoints, readDebuggee, readDebuggeeEnd,
  readStack, readVariables, terseStop, terseVariables,
} from '../../../lib/debugger/readings';

describe('readings of the debugger documents (recorded answers)', () => {
  it('the listener catch names the debuggee and its server', () => {
    const d = readDebuggee(corpusBody('debugger-run-to-line--02-listen'));
    expect(d).toMatchObject({
      debuggeeId: '194B2024D1671FE1B0DDF891EDADF59C',
      user: 'SAPUSER01',
      include: 'ZCL_CV_DBG_MEASURE============CM002',
      line: 9,
      instance: 'appserver_SYS_00',
      objectType: 'CLAS/OC',
    });
  });

  it('an empty listener answer is no catch', () => {
    expect(readDebuggee('')).toBeUndefined();
  });

  it('the attach says whether stepping is possible', () => {
    const a = readAttach(corpusBody('debugger-run-to-line--03-attach'));
    expect(a.isSteppingPossible).toBe(true);
    expect(a.reachedBreakpoints).toHaveLength(1);
  });

  it('the stack, top frame first', () => {
    const s = readStack(corpusBody('debugger-run-to-line--04-stack'));
    expect(s.frames[0]).toMatchObject({ position: 12, line: 32, event: 'IF_OO_ADT_CLASSRUN~MAIN' });
    expect(s.frames.length).toBeGreaterThan(5);
  });

  it('variables with values; children with their parents', () => {
    const v = readVariables(corpusBody('debugger-run-to-line--07-variables-at-write'));
    expect(v.variables[0]).toMatchObject({ name: 'LV_COUNTER', type: 'I', value: '241' });
    const root = readVariables(corpusBody('debugger-conversation--07-children-root'));
    expect(root.children.map((c) => c.child)).toEqual(['ME', '@PARAMETERS', '@LOCALS']);
  });

  it('breakpoints: placed with ids, refused with the message, in the answer order', () => {
    const b = readBreakpoints(corpusBody('debugger-conversation--01-breakpoints-set'));
    expect(b[0]).toMatchObject({ kind: 'line', error: 'Cannot create a breakpoint at this position' });
    expect(b[1].id).toMatch(/^KIND=0\./);
    expect(b[1].uri).toBe('/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32');
  });

  it('matches a placed breakpoint to the request by content', () => {
    const placed = readBreakpoints(corpusBody('debugger-kinds-and-exception--04-kind-message-with-condition'))[0];
    expect(breakpointKey(placed)).toBe(
      breakpointKey({ kind: 'message', msgId: 'ZCV', msgNo: '777', msgTy: 'S' }),
    );
    const exc = readBreakpoints(corpusBody('debugger-kinds-and-exception--12-exception-bp-set'))[0];
    expect(breakpointKey(exc)).toBe(breakpointKey({ kind: 'exception', exceptionClass: 'CX_SY_ZERODIVIDE' }));
  });

  it('the end of a debuggee is read from the exception subtype', () => {
    expect(readDebuggeeEnd(corpusBody('debugger-terminate--01-terminate-debuggee'))).toBe('terminateDebuggee');
    expect(readDebuggeeEnd(corpusBody('debugger-run-to-line--05-stepruntoline'))).toBeUndefined();
  });

  it('terse: where the stop stands — the object address AND the technical place — and five frames as precise', () => {
    const t = terseStop(
      readDebuggee(corpusBody('debugger-run-to-line--02-listen'))!,
      readStack(corpusBody('debugger-run-to-line--04-stack')),
    );
    expect(t.at).toEqual({
      address: { object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 },
      unit: 'IF_OO_ADT_CLASSRUN~MAIN',
      program: 'ZCL_CV_DBG_MEASURE============CP',
      include: 'ZCL_CV_DBG_MEASURE============CM002',
      include_line: 32,
    });
    expect(t.frames).toHaveLength(5);
    expect(t.frames[1].address).toEqual({ object_type: 'CLAS', object_name: 'CL_OO_ADT_RES_CLASSRUN', line: 105 });
  });

  it('terse variables: name, type, value', () => {
    expect(terseVariables(readVariables(corpusBody('debugger-run-to-line--07-variables-at-write')))).toEqual([
      { name: 'LV_COUNTER', type: 'I', value: '241' },
    ]);
  });
});
```

Both places are kept, as SAP gives them. The frame's `adtcore:uri` start is the line in the object's source, which is what a model reads and what a breakpoint takes. The frame's `line` attribute, beside its program and include, is SAP's technical place, which analysis wants. `terseStop` shortens by count only, never by precision.

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/__tests__/unit/debugger/readings.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement**

```ts
// src/lib/debugger/readings.ts
/**
 * What a model reads of the ABAP debugger's documents. adt-clients answers
 * the documents as they came; refining them is the server's (the layer
 * split). Every reading is checked against a recorded answer.
 */
import { readExceptionSubType } from '@mcp-abap-adt/adt-strategies';
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';
import { addressOf, type ObjectAddress } from './objectUri';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) =>
    ['STPDA_DEBUGGEE', 'STPDA_ADT_VARIABLE', 'STPDA_ADT_VARIABLE_HIERARCHY',
     'stackEntry', 'breakpoint'].includes(name),
});

type Node = Record<string, any>;
const parse = (xml: string): Node => (xml?.trim() ? parser.parse(xml) : {});
const text = (v: unknown): string => (v === undefined || v === null || typeof v === 'object' ? '' : String(v));
const num = (v: unknown): number => Number(text(v).trim() || 0);
const bool = (v: unknown): boolean => text(v) === 'true';

export interface DebuggeeReading { debuggeeId: string; user: string; program: string; include: string; line: number; uri: string; objectType: string; objectName: string; instance: string; kind: string; }
export interface AttachReading { debugSessionId: string; isSteppingPossible: boolean; isTerminationPossible: boolean; reachedBreakpoints: string[]; }
export interface FrameReading { position: number; program: string; include: string; line: number; eventType: string; event: string; uri: string; systemProgram: boolean; }
export interface StackReading { cursor: number; frames: FrameReading[]; }
export interface VariableReading { id: string; name: string; type: string; metaType: string; value: string; tableLines: number; }
export interface VariablesReading { variables: VariableReading[]; children: Array<{ parent: string; child: string; label: string }>; }
export interface BreakpointReading { id?: string; kind: string; uri?: string; exceptionClass?: string; statement?: string; msgId?: string; msgNo?: string; msgTy?: string; condition?: string; error?: string; }
export type DebuggeeEnd = 'debuggeeEnded' | 'terminateDebuggee';

export function readDebuggee(xml: string): DebuggeeReading | undefined {
  const row = parse(xml)?.abap?.values?.DATA?.STPDA_DEBUGGEE?.[0];
  if (!row) return undefined;
  return {
    debuggeeId: text(row.DEBUGGEE_ID), user: text(row.DEBUGGEE_USER),
    program: text(row.PRG_CURR), include: text(row.INCL_CURR), line: num(row.LINE_CURR),
    uri: text(row.URI), objectType: text(row.TYPE), objectName: text(row.NAME),
    instance: text(row.INSTANCE_NAME), kind: text(row.DBGEE_KIND),
  };
}

export function readAttach(xml: string): AttachReading {
  const a = parse(xml)?.attach ?? {};
  const reached = a.reachedBreakpoints?.breakpoint ?? [];
  return {
    debugSessionId: text(a.debugSessionId),
    isSteppingPossible: bool(a.isSteppingPossible),
    isTerminationPossible: bool(a.isTerminationPossible),
    reachedBreakpoints: reached.map((b: Node) => text(b.id)),
  };
}

export function readStack(xml: string): StackReading {
  const s = parse(xml)?.stack ?? {};
  const frames: FrameReading[] = (s.stackEntry ?? []).map((e: Node) => ({
    position: num(e.stackPosition), program: text(e.programName), include: text(e.includeName),
    line: num(e.line), eventType: text(e.eventType), event: text(e.eventName),
    uri: text(e.uri), systemProgram: bool(e.systemProgram),
  }));
  return { cursor: num(s.debugCursorStackIndex), frames };
}

export function readVariables(xml: string): VariablesReading {
  const data = parse(xml)?.abap?.values?.DATA ?? {};
  const rows: Node[] = data.VARIABLES?.STPDA_ADT_VARIABLE ?? data.STPDA_ADT_VARIABLE ?? [];
  const links: Node[] = data.HIERARCHIES?.STPDA_ADT_VARIABLE_HIERARCHY ?? [];
  return {
    variables: rows.map((r) => ({
      id: text(r.ID), name: text(r.NAME), type: text(r.DECLARED_TYPE_NAME),
      metaType: text(r.META_TYPE), value: text(r.VALUE).trimEnd(), tableLines: num(r.TABLE_LINES),
    })),
    children: links.map((l) => ({ parent: text(l.PARENT_ID), child: text(l.CHILD_ID), label: text(l.CHILD_NAME) })),
  };
}

export function readBreakpoints(xml: string): BreakpointReading[] {
  return (parse(xml)?.breakpoints?.breakpoint ?? []).map((b: Node) => {
    const r: BreakpointReading = { kind: text(b.kind) };
    for (const k of ['id', 'uri', 'exceptionClass', 'statement', 'msgId', 'msgNo', 'msgTy', 'condition'] as const) {
      const v = text(b[k]);
      if (v) r[k] = v;
    }
    const error = text(b.errorMessage);
    if (error) r.error = error;
    return r;
  });
}

/** The content a breakpoint is matched by — never its position (the answer reorders). */
export function breakpointKey(b: BreakpointReading | IDebuggerBreakpoint): string {
  const x = b as BreakpointReading;
  switch (x.kind) {
    case 'line': return `line|${x.uri ?? ''}`;
    case 'exception': return `exception|${(x.exceptionClass ?? '').toUpperCase()}`;
    case 'statement': return `statement|${(x.statement ?? '').toUpperCase()}`;
    case 'message': return `message|${x.msgId}|${x.msgNo}|${x.msgTy}`.toUpperCase();
    default: return `${x.kind}|`;
  }
}

const ENDS = new Set<DebuggeeEnd>(['debuggeeEnded', 'terminateDebuggee']);
export function readDebuggeeEnd(body: string): DebuggeeEnd | undefined {
  const sub = readExceptionSubType(body);
  return sub && ENDS.has(sub as DebuggeeEnd) ? (sub as DebuggeeEnd) : undefined;
}

export interface PlaceReading { address?: ObjectAddress; unit: string; program: string; include: string; include_line: number }

export function placeOf(frame: FrameReading): PlaceReading {
  const address = addressOf(frame.uri);
  return {
    ...(address ? { address } : {}),
    unit: frame.event, program: frame.program, include: frame.include, include_line: frame.line,
  };
}

export function terseStop(debuggee: DebuggeeReading, stack: StackReading) {
  const top = stack.frames[0];
  const at: PlaceReading = top
    ? placeOf(top)
    : { ...(addressOf(debuggee.uri) ? { address: addressOf(debuggee.uri) } : {}), unit: '', program: debuggee.program, include: debuggee.include, include_line: debuggee.line };
  return { at, frames: stack.frames.slice(0, 5).map(placeOf) };
}

export function terseVariables(r: VariablesReading) {
  return r.variables.map((v) => ({
    name: v.name, type: v.type, value: v.value,
    ...(v.metaType === 'table' ? { rows: v.tableLines } : {}),
  }));
}
```

Do not guess the signature of `readExceptionSubType`. Check it first with `grep -n "readExceptionSubType" node_modules/@mcp-abap-adt/adt-strategies/dist/refusals/read.d.ts`. If it takes `unknown` and returns `string | undefined`, the code above stands. If it differs, adapt the call and keep the test as it is.

- [ ] **Step 4: Run it and see it pass**

Run: `npx jest src/__tests__/unit/debugger/readings.test.ts`
Expected: PASS. If a path into the parsed tree is wrong, print `JSON.stringify(parse(body), null, 1)` in a scratch test, fix the path, and delete the scratch.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debugger/readings.ts src/__tests__/unit/debugger/readings.test.ts
git commit -m "feat(debugger): readings of the ABAP debugger documents, checked against recorded answers"
```

---

### Task 4: `DebugSession` — listener, catch, attach, steps, breakpoints

**Files:**
- Create: `src/lib/debugger/serial.ts`, `src/lib/debugger/DebugSession.ts`
- Test: `src/__tests__/unit/debugger/fakes.ts`, `src/__tests__/unit/debugger/DebugSession.test.ts`

**Interfaces:**
- Consumes:
  - `readings.ts` (Task 3);
  - `DebuggerIds` (Task 2);
  - from `@mcp-abap-adt/adt-clients`: `AbapDebugger`, `abapDebuggerDocuments`, `IDebuggerListenerConflict`;
  - from `@mcp-abap-adt/adt-strategies`: `analyseDebuggeeEnd`;
  - from `@mcp-abap-adt/interfaces-adt`: `IDebuggerBreakpoint`, `IDebuggerIdentity`, `IDebuggerStepMethod`, `IDebuggerStepToLineMethod`, `IAdtResponse`.
- Produces:

```ts
// serial.ts
export class Serial { run<T>(work: () => Promise<T>): Promise<T> }
// DebugSession.ts
export const LISTEN_HOLD_SECONDS = 60;
export const FIRST_POLL_HOLD_SECONDS = 3;   // measured: a 3 s poll answers empty in ~3.1 s
export const WAIT_MAX_SECONDS = 30;
export type Debugger = AbapDebugger<typeof abapDebuggerDocuments>;
export interface RunTarget { kind: 'class' | 'program'; name: string }
export type RunOutcome = { ok: true; output: string } | { ok: false; message: string };
export interface DebugSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;          // own stateful session
  closeConnection(connection: IAbapConnection): Promise<void>;
  abapDebugger(connection: IAbapConnection, onConflict: IDebuggerListenerConflict): Debugger;
  requestUser(origin: O): Promise<string>;
  run(connection: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface StopView {
  debuggee: DebuggeeReading; attach: AttachReading; stack: StackReading; stackError?: string;
  raw: { debuggee: string; attach: string; stack: string };
}
export type EndReason = 'debuggee_ended' | 'terminated' | 'run_finished' | 'attach_refused';
export type DebugState =
  | { state: 'idle' } | { state: 'listening' }
  | { state: 'stopped'; stop: StopView }
  | { state: 'ended'; reason: EndReason; run?: RunOutcome; message?: string };
export interface DebugView<T> { value: T; raw: string }
export interface BreakpointsAnswer { placed: BreakpointReading[]; refused: Array<{ requested: IDebuggerBreakpoint; error: string }> }
export class DebugListenerError extends Error {}   // a conflict, or a listener that failed
export class DebugStateError extends Error {}      // nothing to act on / already running
export class DebugRequestError extends Error {}    // SAP refused a request
export class DebugCleanupError extends Error {}    // Task 5
export class DebugSession<O = unknown> {
  constructor(ports: DebugSessionPorts<O>, ids: DebuggerIds & { stated?: boolean });
  readonly ids: DebuggerIds & { stated?: boolean };
  bind(origin: O): this;
  /** Arms the given breakpoints, listens (a short first poll decides), then runs; a refused start undoes what it armed. */
  start(mode: IDebuggerListenerConflict, options?: { breakpoints?: IDebuggerBreakpoint[]; run?: RunTarget }): Promise<DebugState & { breakpoints?: BreakpointsAnswer }>;
  /** Called after every state change — the instance state uses it to learn that nothing is held any more. */
  observe(onChange: () => void): void;
  wait(holdSeconds?: number): Promise<DebugState>;
  setBreakpoints(list: IDebuggerBreakpoint[]): Promise<DebugView<BreakpointsAnswer>>;
  deleteBreakpoint(id: string): Promise<void>;
  listBreakpoints(): BreakpointReading[];
  getStack(): Promise<DebugView<StopView>>;
  setStackPosition(position: number): Promise<DebugView<StopView>>;
  getVariables(names: string[]): Promise<DebugView<VariablesReading>>;
  getChildVariables(parents: string[]): Promise<DebugView<VariablesReading>>;
  setVariable(name: string, value: string): Promise<DebugView<VariablesReading>>;
  step(method: IDebuggerStepMethod): Promise<DebugState>;
  stepToLine(method: IDebuggerStepToLineMethod, uri: string): Promise<DebugState>;
  terminate(): Promise<DebugState>;
  createWatchpoint(name: string, condition?: string): Promise<DebugView<string>>;
  listWatchpoints(): Promise<DebugView<string>>;
  deleteWatchpoint(id: string): Promise<void>;
  getMemorySizes(): Promise<DebugView<string>>;
  createMemorySnapshot(): Promise<DebugView<string>>;
  // Task 5: stop(), holdsState(), describe(), the background run, reconciliation
}
```

**How concurrency is handled.**
- Every state-changing member runs through one `Serial`: start, poll results, attach, steps, breakpoints and (in Task 5) stop.
- The listener's long poll runs *outside* it. Its result is handed back through `serial.run`, and a stale result is dropped by checking `generation` and listener identity.
- `wait()` is not serialised: it only waits for a notification and reads.
- Every connection is closed at most once (a `WeakSet`).

- [ ] **Step 1: Write the fakes**

```ts
// src/__tests__/unit/debugger/fakes.ts
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody } from '../../../lib/adtCorpus';
import type { Debugger, DebugSessionPorts, RunOutcome } from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';

export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Advance microtasks until `cond` holds — a poll is created only after the awaits before it. */
export async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !cond(); i++) await jest.advanceTimersByTimeAsync(0);
  if (!cond()) throw new Error('condition never held');
}

export const IDS = { terminalId: 'T'.repeat(32), ideId: 'I'.repeat(32) };
export const LISTEN_CATCH = () => okResponse(corpusBody('debugger-run-to-line--02-listen'));
export const LISTEN_NOTHING = () => okResponse('');
export const CONFLICT = () => refusedResponse('Another debugger is already listening (SY 530)');
/** The default strategies' shapes: `done` answers nothing (adt-clients `nothing`). */
export const DONE = () => okResponse(undefined);

export function fakeWorld() {
  const polls: Array<ReturnType<typeof deferred<any>> & { hold?: number }> = [];
  const opened: IAbapConnection[] = [];
  const closed: IAbapConnection[] = [];
  const calls: string[] = [];
  const run = deferred<RunOutcome>();
  const stepAnswers: any[] = [];
  const attachAnswers: Array<() => Promise<any>> = [];
  let validationAnswers: Array<() => any> = [];
  /** Members put here replace the fake's on every debugger, cached ones included. */
  const override: Record<string, any> = {};
  const make = (): Debugger => new Proxy(
    {
      listen: (_i: unknown, o: any) => { calls.push(`listen:${o?.holdSeconds}`); const d = deferred<any>(); polls.push(Object.assign(d, { hold: o?.holdSeconds })); return d.promise; },
      stopListener: async () => { calls.push('stopListener'); return DONE(); },
      attach: async (_u: string, id: string, o: any) => { calls.push(`attach:${id}:${o?.server}`); return (attachAnswers.shift() ?? (async () => okResponse(corpusBody('debugger-run-to-line--03-attach'))))(); },
      getStack: async () => { calls.push('getStack'); return okResponse(corpusBody('debugger-run-to-line--04-stack')); },
      getVariables: async () => { calls.push('getVariables'); return okResponse(corpusBody('debugger-run-to-line--07-variables-at-write')); },
      getChildVariables: async () => { calls.push('getChildVariables'); return okResponse(corpusBody('debugger-conversation--07-children-root')); },
      step: async (m: string, o: any) => { calls.push(`step:${m}:${o?.analyse ? 'analysed' : 'plain'}`); return stepAnswers.shift() ?? okResponse(corpusBody('debugger-run-to-line--05-stepruntoline')); },
      stepToLine: async (m: string, uri: string) => { calls.push(`stepToLine:${m}:${uri}`); return stepAnswers.shift() ?? okResponse(corpusBody('debugger-run-to-line--05-stepruntoline')); },
      terminateDebuggee: async (o: any) => { calls.push(`terminate:${o?.analyse ? 'analysed' : 'plain'}`); return DONE(); },
      setBreakpoints: async (_i: unknown, list: any[], o: any) => {
        if (o?.validationOnly) { calls.push(`validate:${list.length}`); return (validationAnswers.shift() ?? (() => okResponse('')))(); }
        calls.push(`setBreakpoints:${list.length}`); return okResponse(corpusBody('debugger-conversation--01-breakpoints-set'));
      },
      deleteBreakpoint: async (_i: unknown, id: string) => { calls.push(`deleteBreakpoint:${id}`); return DONE(); },
      setStackPosition: async (p: number) => { calls.push(`setStackPosition:${p}`); return DONE(); },
      setVariableValue: async (n: string) => { calls.push(`setVariableValue:${n}`); return okResponse(corpusBody('debugger-run-to-line--07-variables-at-write')); },
      createWatchpoint: async () => okResponse('<dbg:watchpoints xmlns:dbg="x"/>'),
      listWatchpoints: async () => okResponse('<dbg:watchpoints xmlns:dbg="x"/>'),
      deleteWatchpoint: async () => DONE(),
      getMemorySizes: async () => okResponse('<dbg:memorySizes xmlns:dbg="x"/>'),
      createMemorySnapshot: async () => okResponse('<dbg:action xmlns:dbg="x"/>'),
    } as Record<string, any>,
    { get: (target, key: string) => override[key] ?? target[key] },
  ) as unknown as Debugger;
  const ports: DebugSessionPorts<string> = {
    openConnection: async () => { const c = { id: opened.length } as unknown as IAbapConnection; opened.push(c); return c; },
    closeConnection: async (c) => { closed.push(c); },
    abapDebugger: () => make(),
    requestUser: async () => 'SAPUSER01',
    run: async () => run.promise,
  };
  return { ports, polls, opened, closed, calls, run, stepAnswers, attachAnswers, override,
    setValidationAnswers: (a: Array<() => any>) => { validationAnswers = a; } };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/__tests__/unit/debugger/DebugSession.test.ts
import { corpusBody } from '../../../lib/adtCorpus';
import {
  DebugListenerError, DebugSession, DebugStateError, FIRST_POLL_HOLD_SECONDS, LISTEN_HOLD_SECONDS,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import { CONFLICT, deferred, fakeWorld, IDS, LISTEN_CATCH, LISTEN_NOTHING, until } from './fakes';

describe('DebugSession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function listening(world = fakeWorld()) {
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse');
    await until(() => world.polls.length === 1);
    expect(world.polls[0].hold).toBe(FIRST_POLL_HOLD_SECONDS);
    world.polls[0].resolve(LISTEN_NOTHING());
    await expect(started).resolves.toEqual({ state: 'listening' });
    await until(() => world.polls.length === 2);
    expect(world.polls[1].hold).toBe(LISTEN_HOLD_SECONDS);
    return { session, world };
  }
  async function stopped() {
    const { session, world } = await listening();
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    return { session, world };
  }

  it('the first poll is short and decides the start; then the long poll stands', async () => {
    await listening();
  });

  it('a conflict on the first poll fails the start: nothing stays armed, nothing runs', async () => {
    const world = fakeWorld();
    const ran = jest.spyOn(world.ports, 'run');
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', { run: { kind: 'class', name: 'ZCL_X' } });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    expect(world.closed).toEqual(world.opened);
    expect(ran).not.toHaveBeenCalled();
    expect((await session.wait(0)).state).toBe('idle');
  });

  it('a refused start undoes the breakpoints it armed', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', { breakpoints: [{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' }] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:KIND=0.'))).toBe(true);
    expect(session.listBreakpoints()).toEqual([]);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('an attach that throws after arming fails the start and undoes the breakpoints', async () => {
    const world = fakeWorld();
    world.attachAnswers.push(async () => { throw new Error('socket hang up'); });
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse', { breakpoints: [{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' }] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    await expect(started).rejects.toThrow(/socket hang up/);
    expect(session.listBreakpoints()).toEqual([]);
  });

  it('a rollback step that throws does not skip the next', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const realClose = world.ports.closeConnection;
    world.ports.closeConnection = async (c) => { if (world.closed.length === 0) { world.closed.push(c); throw new Error('close failed'); } return realClose(c); };
    const started = session.start('refuse', { breakpoints: [{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' }] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(true);
  });

  it('a debuggee caught on the first poll is attached at once', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    await expect(started).resolves.toMatchObject({ state: 'stopped' });
    expect(world.polls).toHaveLength(1);
  });

  it('caught → attached on a new connection routed to the debuggee server; the listener stands', async () => {
    const { session, world } = await stopped();
    expect(world.calls).toContain('attach:194B2024D1671FE1B0DDF891EDADF59C:appserver_SYS_00');
    expect((await session.wait(0)).state).toBe('stopped');
    expect(world.polls).toHaveLength(2);
  });

  it('a later conflict fails the next wait once; the listener is not restarted', async () => {
    const { session, world } = await listening();
    world.polls[1].resolve(CONFLICT());
    await until(() => world.closed.length === 1);
    await expect(session.wait(0)).rejects.toThrow(/SY 530/);
    expect((await session.wait(0)).state).toBe('idle');
    expect(world.polls).toHaveLength(2);
  });

  it('a second start is refused', async () => {
    const { session } = await listening();
    await expect(session.start('refuse')).rejects.toThrow(DebugStateError);
  });

  it('wait returns on a catch, before its hold ends, and holds at most 30 s', async () => {
    const { session, world } = await listening();
    const w1 = session.wait(30);
    world.polls[1].resolve(LISTEN_CATCH());
    await expect(w1).resolves.toMatchObject({ state: 'stopped' });
    const { session: s2 } = await listening();
    const w2 = s2.wait(600);
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(w2).resolves.toEqual({ state: 'listening' });
  });

  it('a refused attach is reported as ended and the listener polls again', async () => {
    const world = fakeWorld();
    world.attachAnswers.push(async () => refusedResponse('Debuggee already attached'));
    const { session } = await listening(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.polls.length === 3);
    expect(await session.wait(0)).toMatchObject({ state: 'ended', reason: 'attach_refused', message: 'Debuggee already attached' });
    expect(world.closed).toHaveLength(1); // the attach connection
  });

  it('an attach that throws is a listener failure, not a silent stop', async () => {
    const world = fakeWorld();
    world.attachAnswers.push(async () => { throw new Error('socket hang up'); });
    const { session } = await listening(world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.closed.length === 2);
    await expect(session.wait(0)).rejects.toThrow(/socket hang up/);
  });

  it('a step that stays rereads the stack; a refused step keeps the stop', async () => {
    const { session, world } = await stopped();
    expect((await session.step('stepOver')).state).toBe('stopped');
    expect(world.calls.filter((c) => c === 'getStack')).toHaveLength(2);
    world.stepAnswers.push(refusedResponse('Parameter uri could not be found'));
    await expect(session.stepToLine('stepRunToLine', '/x#start=1')).rejects.toThrow(/uri could not be found/);
    expect((await session.wait(0)).state).toBe('stopped');
  });

  it('debuggeeEnded ends the stop, not as an error, and the listener polls again', async () => {
    const { session, world } = await stopped();
    world.stepAnswers.push(okResponse(corpusBody('debugger-terminate--01-terminate-debuggee').replace('terminateDebuggee', 'debuggeeEnded')));
    await expect(session.step('stepContinue')).resolves.toEqual({ state: 'ended', reason: 'debuggee_ended' });
    await until(() => world.polls.length === 3);
  });

  it('terminate, answered with nothing by the default strategy, ends as terminated', async () => {
    const { session, world } = await stopped();
    await expect(session.terminate()).resolves.toEqual({ state: 'ended', reason: 'terminated' });
    expect(world.calls).toContain('terminate:analysed');
  });

  it('stop tools without a stop are refused and send nothing', async () => {
    const { session, world } = await listening();
    const before = world.calls.length;
    await expect(session.getStack()).rejects.toThrow(/no debuggee is stopped/);
    await expect(session.step('stepOver')).rejects.toThrow(DebugStateError);
    expect(world.calls.length).toBe(before);
  });

  it('breakpoints: placed kept by id, a refusal matched by content', async () => {
    const { session } = await listening();
    const a = await session.setBreakpoints([
      { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' },
      { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=1' },
    ]);
    expect(a.value.placed).toHaveLength(1);
    expect(a.value.refused).toEqual([{ requested: { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=1' }, error: 'Cannot create a breakpoint at this position' }]);
    expect(session.listBreakpoints()).toHaveLength(1);
  });

  it('refusals ambiguous within a kind are asked one by one with validationOnly', async () => {
    const world = fakeWorld();
    const { session } = await listening(world);
    const refusal = (msg: string) => () => okResponse(`<dbg:breakpoints xmlns:dbg="x"><breakpoint kind="line" errorMessage="${msg}"/></dbg:breakpoints>`);
    world.setValidationAnswers([refusal('first'), refusal('second')]);
    // two line refusals with the one placed answer of the recorded file → 3 requested, 1 placed, 2 unmatched
    const a = await session.setBreakpoints([
      { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' },
      { kind: 'line', uri: '/x#start=1' },
      { kind: 'line', uri: '/x#start=2' },
    ]);
    expect(a.value.refused.map((r) => r.error)).toEqual(['first', 'second']);
    expect(world.calls).toContain('validate:1');
  });
});
```

In the last test, the recorded answer holds one refusal for two unmatched line requests. That is ambiguous, so both are asked again with `validationOnly`. This is review focus 4.

- [ ] **Step 3: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/DebugSession.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 4: Implement**

```ts
// src/lib/debugger/serial.ts
/** One change at a time per session; a failed change does not block the next. */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
```

```ts
// src/lib/debugger/DebugSession.ts
/**
 * The ABAP debugger's state between tool calls — one per server instance.
 *
 * What it needs was measured (2026-10-10, on premise and on the cloud): a
 * breakpoint stops a program only while a listener poll is open; an
 * unattached debuggee resumes by itself after ~30 s; after an attach only the
 * attaching ABAP session works the stop. So a long poll stands while nothing
 * is stopped, a catch is attached at once on a connection of its own, and
 * that connection serves the stop. One debuggee at a time. Nothing ends on a
 * timer of ours. Every change goes through one Serial; the long poll runs
 * outside it and its answer is dropped when the generation moved on.
 */
import type { AbapDebugger, abapDebuggerDocuments, IDebuggerListenerConflict } from '@mcp-abap-adt/adt-clients';
import { analyseDebuggeeEnd } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtResponse, IDebuggerBreakpoint, IDebuggerIdentity, IDebuggerStepMethod, IDebuggerStepToLineMethod,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { DebuggerIds } from './ids';
import {
  type AttachReading, type BreakpointReading, breakpointKey, type DebuggeeReading, readAttach,
  readBreakpoints, readDebuggee, readDebuggeeEnd, readStack, readVariables, type StackReading, type VariablesReading,
} from './readings';
import { Serial } from './serial';

export const LISTEN_HOLD_SECONDS = 60;
export const FIRST_POLL_HOLD_SECONDS = 3;
export const WAIT_MAX_SECONDS = 30;

export type Debugger = AbapDebugger<typeof abapDebuggerDocuments>;
export interface RunTarget { kind: 'class' | 'program'; name: string }
export type RunOutcome = { ok: true; output: string } | { ok: false; message: string };
export interface DebugSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(connection: IAbapConnection): Promise<void>;
  abapDebugger(connection: IAbapConnection, onConflict: IDebuggerListenerConflict): Debugger;
  requestUser(origin: O): Promise<string>;
  run(connection: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface StopView {
  debuggee: DebuggeeReading; attach: AttachReading; stack: StackReading; stackError?: string;
  raw: { debuggee: string; attach: string; stack: string };
}
export type EndReason = 'debuggee_ended' | 'terminated' | 'run_finished' | 'attach_refused';
export type DebugState =
  | { state: 'idle' } | { state: 'listening' }
  | { state: 'stopped'; stop: StopView }
  | { state: 'ended'; reason: EndReason; run?: RunOutcome; message?: string };
export interface DebugView<T> { value: T; raw: string }
export interface BreakpointsAnswer { placed: BreakpointReading[]; refused: Array<{ requested: IDebuggerBreakpoint; error: string }> }

export class DebugListenerError extends Error {}
export class DebugStateError extends Error {}
export class DebugRequestError extends Error {}
export class DebugCleanupError extends Error {}

interface Listener { connection: IAbapConnection; debugger: Debugger }
interface Stop { connection: IAbapConnection; debugger: Debugger; view: StopView }

const valueOf = (a: IAdtResponse<unknown>): string => (a.ok ? String(a.getResult().value ?? '') : '');
const messageOf = (a: IAdtResponse<unknown>): string => (a.ok ? '' : a.getError().message);
const thrown = (e: unknown) => (e instanceof Error ? e.message : String(e));
const asFailure = (e: unknown) => ({ ok: false as const, getError: () => ({ origin: 'connection', message: thrown(e) }) }) as unknown as IAdtResponse<string>;

export class DebugSession<O = unknown> {
  protected readonly serial = new Serial();
  protected origin?: O;
  protected user?: string;
  protected mode: IDebuggerListenerConflict = 'refuse';
  protected control?: Listener;
  protected readonly armed = new Map<string, BreakpointReading>();
  protected listener?: Listener;
  protected current?: Stop;
  protected failure?: string;
  protected generation = 0;
  protected readonly notices: DebugState[] = [];
  private readonly waiters = new Set<() => void>();
  private readonly closedConnections = new WeakSet<object>();

  constructor(protected readonly ports: DebugSessionPorts<O>, readonly ids: DebuggerIds & { stated?: boolean }) {}

  bind(origin: O): this { this.origin = origin; return this; }

  // --- plumbing -------------------------------------------------------------
  protected requireOrigin(): O {
    if (this.origin === undefined) throw new DebugStateError('the debugger has no connection yet');
    return this.origin;
  }
  protected async identity(): Promise<IDebuggerIdentity> {
    this.user ??= (await this.ports.requestUser(this.requireOrigin())).toUpperCase();
    return { requestUser: this.user, terminalId: this.ids.terminalId, ideId: this.ids.ideId };
  }
  protected async open(): Promise<IAbapConnection> { return this.ports.openConnection(this.requireOrigin()); }
  /**
   * Closes once. The connector's `disconnect()` never throws by contract (it
   * dispatches the logoff and returns); a port that does throw leaves the
   * connection unmarked, so a later cleanup tries again.
   */
  protected async close(connection: IAbapConnection | undefined): Promise<void> {
    if (!connection || this.closedConnections.has(connection)) return;
    await this.ports.closeConnection(connection);
    this.closedConnections.add(connection);
  }
  protected async controlDebugger(): Promise<Debugger> {
    if (!this.control) {
      const connection = await this.open();
      this.control = { connection, debugger: this.ports.abapDebugger(connection, this.mode) };
    }
    return this.control.debugger;
  }
  private changed?: () => void;
  observe(onChange: () => void): void { this.changed = onChange; }
  protected notify(): void { for (const w of [...this.waiters]) w(); this.changed?.(); }

  /** Every change goes through here: one at a time, and observers hear of it afterwards — whatever it did. */
  protected mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.serial.run(async () => {
      try { return await work(); } finally { this.notify(); }
    });
  }
  private owns(listener: Listener, generation: number): boolean {
    return this.listener === listener && this.generation === generation;
  }

  // --- breakpoints ------------------------------------------------------------
  setBreakpoints(list: IDebuggerBreakpoint[]): Promise<DebugView<BreakpointsAnswer>> {
    return this.mutate(() => this.armLocked(list));
  }

  /** Inside the serial. */
  private async armLocked(list: IDebuggerBreakpoint[]): Promise<DebugView<BreakpointsAnswer>> {
    {
      const identity = await this.identity();
      const dbg = await this.controlDebugger();
      const answer = await dbg.setBreakpoints(identity, list);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      const raw = valueOf(answer);
      const rows = readBreakpoints(raw);
      const placed = rows.filter((r) => r.id);
      for (const p of placed) this.armed.set(p.id!, p);   // recorded at once: whatever happens next, they can be undone
      const placedKeys = new Set(placed.map(breakpointKey));
      const unmatched = list.filter((b) => !placedKeys.has(breakpointKey(b)));
      const errors = rows.filter((r) => r.error);
      const refused: BreakpointsAnswer['refused'] = [];
      for (const kind of new Set(unmatched.map((b) => b.kind))) {
        const asked = unmatched.filter((b) => b.kind === kind);
        const said = errors.filter((e) => e.kind === kind);
        if (asked.length === 1 && said.length === 1) {
          refused.push({ requested: asked[0], error: said[0].error! });
          continue;
        }
        for (const requested of asked) { // ambiguous within the kind: ask each on its own
          const one = await dbg.setBreakpoints(identity, [requested], { validationOnly: true }).catch(asFailure);
          const error = one.ok ? readBreakpoints(valueOf(one)).find((r) => r.error)?.error : `the reason could not be read: ${messageOf(one)}`;
          refused.push({ requested, error: error ?? 'refused without a reason' });
        }
      }
      return { value: { placed, refused }, raw };
    }
  }

  deleteBreakpoint(id: string): Promise<void> {
    return this.mutate(async () => {
      const answer = await (await this.controlDebugger()).deleteBreakpoint(await this.identity(), id);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      this.armed.delete(id);
    });
  }

  listBreakpoints(): BreakpointReading[] { return [...this.armed.values()]; }

  // --- listener -----------------------------------------------------------------
  start(mode: IDebuggerListenerConflict, options: { breakpoints?: IDebuggerBreakpoint[]; run?: RunTarget } = {}): Promise<DebugState & { breakpoints?: BreakpointsAnswer }> {
    return this.mutate(async () => {
      if (this.listener || this.current) throw new DebugStateError('a listener is already running for this debug session');
      const identity = await this.identity();
      this.mode = mode;
      this.failure = undefined;
      await this.beforeFirstListen(identity);               // Task 5: reconciliation
      const before = new Set(this.armed.keys());
      const placedHere = () => [...this.armed.values()].filter((b) => !before.has(b.id!));
      let armed: DebugView<BreakpointsAnswer> | undefined;
      try {
        armed = options.breakpoints?.length ? await this.armLocked(options.breakpoints) : undefined;
        const connection = await this.open();
        const listener: Listener = { connection, debugger: this.ports.abapDebugger(connection, mode) };
        const generation = ++this.generation;
        this.listener = listener;
        const first = await this.poll(listener, identity, FIRST_POLL_HOLD_SECONDS);
        if (!first.ok) throw new DebugListenerError(messageOf(first));
        const caught = readDebuggee(valueOf(first));
        if (caught) await this.attachTo(caught, valueOf(first), generation);
        if (!this.current && this.owns(listener, generation)) void this.loop(listener, generation);
        if (options.run && this.owns(listener, generation)) this.startRun(options.run, generation); // Task 5
        // Inside the protected part: an attach that failed is reported here (report() throws its failure).
        return { ...this.report(), ...(armed ? { breakpoints: armed.value } : {}) };
      } catch (error) {
        // A refused or failed start leaves nothing it armed. Each undo runs whatever the other did.
        await this.dropListener().catch(() => undefined);
        await this.undoArmed(identity, placedHere()).catch(() => undefined);
        throw error;
      }
    });
  }

  /** A refused start leaves nothing armed: what it placed is deleted; what cannot be stays for DebugStop. */
  private async undoArmed(identity: IDebuggerIdentity, placed: BreakpointReading[]): Promise<void> {
    const control = this.control?.debugger;
    for (const p of placed) {
      const deleted = control ? await control.deleteBreakpoint(identity, p.id!).catch(asFailure) : undefined;
      if (deleted?.ok) this.armed.delete(p.id!);
    }
    if (this.armed.size === 0 && this.control) { await this.close(this.control.connection); this.control = undefined; }
  }

  private poll(listener: Listener, identity: IDebuggerIdentity, holdSeconds: number): Promise<IAdtResponse<string>> {
    return listener.debugger.listen(identity, { holdSeconds }).catch(asFailure);
  }

  private async loop(listener: Listener, generation: number): Promise<void> {
    const identity = await this.identity();
    for (;;) {
      if (!this.owns(listener, generation) || this.current) return;
      const answer = await this.poll(listener, identity, LISTEN_HOLD_SECONDS);
      const goOn = await this.mutate(() => this.onPoll(listener, generation, answer));
      if (!goOn) return;
    }
  }

  private async onPoll(listener: Listener, generation: number, answer: IAdtResponse<string>): Promise<boolean> {
    if (!this.owns(listener, generation)) return false;
    if (!answer.ok) {
      this.failure = messageOf(answer);
      await this.dropListener();
      this.notify();
      return false;
    }
    const raw = valueOf(answer);
    const debuggee = readDebuggee(raw);
    if (!debuggee) return true;
    const attached = await this.attachTo(debuggee, raw, generation);
    this.notify();
    return !attached && this.owns(listener, generation);
  }

  /** Runs inside the serial. True when a stop now exists. */
  private async attachTo(debuggee: DebuggeeReading, rawDebuggee: string, generation: number): Promise<boolean> {
    let connection: IAbapConnection | undefined;
    try {
      const identity = await this.identity();
      connection = await this.open();
      const dbg = this.ports.abapDebugger(connection, this.mode);
      const attached = await dbg.attach(identity.requestUser, debuggee.debuggeeId, debuggee.instance ? { server: debuggee.instance } : {});
      if (!attached.ok) {
        this.notices.push({ state: 'ended', reason: 'attach_refused', message: messageOf(attached) });
        await this.close(connection);
        return false;
      }
      if (generation !== this.generation) {
        await dbg.step('stepContinue', { analyse: analyseDebuggeeEnd }).catch(() => undefined);
        await this.close(connection);
        return false;
      }
      const stack = await dbg.getStack();
      this.current = {
        connection, debugger: dbg,
        view: {
          debuggee, attach: readAttach(valueOf(attached)),
          stack: stack.ok ? readStack(valueOf(stack)) : { cursor: 0, frames: [] },
          ...(stack.ok ? {} : { stackError: messageOf(stack) }),
          raw: { debuggee: rawDebuggee, attach: valueOf(attached), stack: valueOf(stack) },
        },
      };
      return true;
    } catch (error) {
      await this.close(connection);
      this.failure = thrown(error);
      await this.dropListener();
      return false;
    }
  }

  protected async dropListener(): Promise<void> {
    const listener = this.listener;
    this.listener = undefined;
    this.generation++;
    await this.close(listener?.connection);
  }

  // --- waiting ----------------------------------------------------------------
  async wait(holdSeconds = 10): Promise<DebugState> {
    const ms = Math.min(Math.max(holdSeconds, 0), WAIT_MAX_SECONDS) * 1000;
    const ready = () => this.failure !== undefined || this.notices.length > 0 || !!this.current || !this.listener;
    if (!ready() && ms > 0) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); this.waiters.delete(done); resolve(); };
        const timer = setTimeout(done, ms);
        this.waiters.add(done);
      });
    }
    return this.report();
  }

  protected report(): DebugState {
    if (this.failure !== undefined) {
      const message = this.failure;
      this.failure = undefined;
      this.changed?.();                      // consuming it may leave nothing held
      throw new DebugListenerError(message);
    }
    const notice = this.notices.shift();
    if (notice) { this.changed?.(); return notice; }
    if (this.current) return { state: 'stopped', stop: this.current.view };
    return this.listener ? { state: 'listening' } : { state: 'idle' };
  }

  // --- the stop -------------------------------------------------------------------
  protected requireStop(): Stop {
    if (!this.current) throw new DebugStateError('no debuggee is stopped in this debug session');
    return this.current;
  }

  /** Inside the serial: the stop ended; resume the listener. */
  protected async releaseStop(stop: Stop): Promise<void> {
    if (this.current !== stop) return;
    this.current = undefined;
    await this.close(stop.connection);
    const listener = this.listener;
    if (listener && this.failure === undefined) void this.loop(listener, this.generation);
  }

  private async afterMove(stop: Stop, answer: IAdtResponse<unknown>): Promise<DebugState> {
    if (!answer.ok) throw new DebugRequestError(messageOf(answer));
    const end = readDebuggeeEnd(valueOf(answer));
    if (end) {
      await this.releaseStop(stop);
      return { state: 'ended', reason: end === 'terminateDebuggee' ? 'terminated' : 'debuggee_ended' };
    }
    const stack = await stop.debugger.getStack();
    stop.view = {
      ...stop.view,
      stack: stack.ok ? readStack(valueOf(stack)) : stop.view.stack,
      ...(stack.ok ? { stackError: undefined } : { stackError: messageOf(stack) }),
      raw: { ...stop.view.raw, stack: valueOf(stack) },
    };
    return { state: 'stopped', stop: stop.view };
  }

  step(method: IDebuggerStepMethod): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      return this.afterMove(stop, await stop.debugger.step(method, { analyse: analyseDebuggeeEnd }));
    });
  }

  stepToLine(method: IDebuggerStepToLineMethod, uri: string): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      return this.afterMove(stop, await stop.debugger.stepToLine(method, uri, { analyse: analyseDebuggeeEnd }));
    });
  }

  /** The default strategy answers nothing for `done`: success is the end itself. */
  terminate(): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const answer = await stop.debugger.terminateDebuggee({ analyse: analyseDebuggeeEnd });
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      await this.releaseStop(stop);
      return { state: 'ended', reason: 'terminated' };
    });
  }

  getStack(): Promise<DebugView<StopView>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const stack = await stop.debugger.getStack();
      if (!stack.ok) throw new DebugRequestError(messageOf(stack));
      stop.view = { ...stop.view, stack: readStack(valueOf(stack)), stackError: undefined, raw: { ...stop.view.raw, stack: valueOf(stack) } };
      return { value: stop.view, raw: valueOf(stack) };
    });
  }

  setStackPosition(position: number): Promise<DebugView<StopView>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const moved = await stop.debugger.setStackPosition(position);
      if (!moved.ok) throw new DebugRequestError(messageOf(moved));
      const stack = await stop.debugger.getStack();
      if (!stack.ok) throw new DebugRequestError(messageOf(stack));
      stop.view = { ...stop.view, stack: readStack(valueOf(stack)), raw: { ...stop.view.raw, stack: valueOf(stack) } };
      return { value: stop.view, raw: valueOf(stack) };
    });
  }

  private variables(call: (d: Debugger) => Promise<IAdtResponse<string>>): Promise<DebugView<VariablesReading>> {
    return this.mutate(async () => {
      const answer = await call(this.requireStop().debugger);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      return { value: readVariables(valueOf(answer)), raw: valueOf(answer) };
    });
  }
  getVariables(names: string[]) { return this.variables((d) => d.getVariables(names.map((n) => n.toUpperCase()))); }
  getChildVariables(parents: string[]) { return this.variables((d) => d.getChildVariables(parents.map((n) => n.toUpperCase()))); }
  setVariable(name: string, value: string) { return this.variables((d) => d.setVariableValue(name.toUpperCase(), value)); }

  private document(call: (d: Debugger) => Promise<IAdtResponse<unknown>>): Promise<DebugView<string>> {
    return this.mutate(async () => {
      const answer = await call(this.requireStop().debugger);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      return { value: valueOf(answer), raw: valueOf(answer) };
    });
  }
  createWatchpoint(name: string, condition?: string) { return this.document((d) => d.createWatchpoint(name.toUpperCase(), condition ? { condition } : {})); }
  listWatchpoints() { return this.document((d) => d.listWatchpoints()); }
  async deleteWatchpoint(id: string) { await this.document((d) => d.deleteWatchpoint(id)); }
  getMemorySizes() { return this.document((d) => d.getMemorySizes()); }
  createMemorySnapshot() { return this.document((d) => d.createMemorySnapshot()); }

  // --- Task 5 ----------------------------------------------------------------
  protected async beforeFirstListen(_identity: IDebuggerIdentity): Promise<void> {}
  protected startRun(_run: RunTarget, _generation: number): void {}
}
```

- [ ] **Step 5: Run them and see them pass**

Run: `npx jest src/__tests__/unit/debugger/DebugSession.test.ts`
Expected: PASS. If a test hangs, a poll or a call was awaited before it existed. Use `until(...)`; never add real delays.

- [ ] **Step 6: Commit**

```bash
git add src/lib/debugger/serial.ts src/lib/debugger/DebugSession.ts src/__tests__/unit/debugger/
git commit -m "feat(debugger): DebugSession — short first poll, auto-attach, serialised changes, conflict as error"
```

---

### Task 5: `DebugSession` — stop, background run, reconciliation, `holdsState`, `describe`

**Files:**
- Modify: `src/lib/debugger/DebugSession.ts` (replace the bodies of the two Task 5 hooks in place — they are plain methods of this class, no `override`; add `stop`, `holdsState`, `describe`)
- Test: `src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts`

**Interfaces:**
- Produces:

```ts
  stop(): Promise<void>;          // throws DebugCleanupError listing what could not be undone; idempotent
  failures(): string[];           // what the last stop could not undo
  holdsState(): boolean;          // listener | stop | armed breakpoints | unreported notice | pending run | failure | failed cleanup
  describe(): { kind: 'abap'; state: 'idle' | 'listening' | 'stopped'; breakpoints: number; terminal_id: string; ide_id: string };
```

**Reconciliation (D12).** With stated ids, the first start stops a predecessor's listener under those ids (`stopListener`). A predecessor's breakpoints cannot be listed: SAP offers no listing. Whether an empty POST under the same ids removes them is measured in Task 13, and the spec is updated with what that shows.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts
import { DebugCleanupError, DebugSession } from '../../../lib/debugger/DebugSession';
import { refusedResponse } from '../../helpers/fakeClient';
import { deferred, fakeWorld, IDS, LISTEN_CATCH, LISTEN_NOTHING, until } from './fakes';

describe('DebugSession lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function started(run?: { kind: 'class' | 'program'; name: string }, ids: any = IDS, world = fakeWorld()) {
    const session = new DebugSession(world.ports, ids).bind('origin');
    const s = session.start('refuse', run ? { run } : {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    return { session, world };
  }

  it('a background run starts only after the first poll, and ends as ended with its output', async () => {
    const { session, world } = await started({ kind: 'class', name: 'ZCL_X' });
    world.run.resolve({ ok: true, output: 'total 6' });
    await until(() => session.holdsState() && world.closed.length === 1);
    expect(await session.wait(0)).toEqual({ state: 'ended', reason: 'run_finished', run: { ok: true, output: 'total 6' } });
  });

  it('stop releases the debuggee, deletes breakpoints, stops the listener, closes every connection once', async () => {
    const { session, world } = await started();
    await session.setBreakpoints([{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' }]);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    await session.stop();
    expect(world.calls).toContain('step:stepContinue:analysed');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:KIND=0.'))).toBe(true);
    expect(world.calls).toContain('stopListener');
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    expect(world.closed.length).toBe(world.opened.length);
    expect(session.holdsState()).toBe(false);
    expect((await session.wait(0)).state).toBe('idle');
  });

  it('stop during an attach waits for it and leaves no stop behind (no resurrection)', async () => {
    const world = fakeWorld();
    const attach = deferred<any>();
    world.attachAnswers.push(() => attach.promise);
    const { session } = await started(undefined, IDS, world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.some((c) => c.startsWith('attach:')));
    const stopping = session.stop();
    attach.resolve((await import('../../helpers/fakeClient')).okResponse('<dbg:attach xmlns:dbg="x"/>'));
    await stopping;
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a catch arriving after stop is not attached and no poll follows', async () => {
    const { session, world } = await started();
    const stopping = session.stop();
    world.polls[1].resolve(LISTEN_CATCH());
    await stopping;
    await jest.advanceTimersByTimeAsync(0);
    expect(world.calls.some((c) => c.startsWith('attach:'))).toBe(false);
    expect(world.polls).toHaveLength(2);
  });

  it('a run finishing after stop reports nothing and its connection closes once', async () => {
    const { session, world } = await started({ kind: 'class', name: 'ZCL_X' });
    await session.stop();
    world.run.resolve({ ok: true, output: 'late' });
    await jest.advanceTimersByTimeAsync(0);
    expect((await session.wait(0)).state).toBe('idle');
    expect(world.closed.length).toBe(new Set(world.closed).size);
  });

  it('a cleanup that fails is reported, and what failed stays to retry', async () => {
    const world = fakeWorld();
    const { session } = await started(undefined, IDS, world);
    await session.setBreakpoints([{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' }]);
    world.override.deleteBreakpoint = async () => refusedResponse('not authorised');
    await expect(session.stop()).rejects.toThrow(DebugCleanupError);
    expect(session.listBreakpoints()).toHaveLength(1);
    expect(session.holdsState()).toBe(true);
    delete world.override.deleteBreakpoint;
    await expect(session.stop()).resolves.toBeUndefined();   // the retry undoes what was left
    expect(session.holdsState()).toBe(false);
  });

  it('a release that fails keeps the stop for a retry', async () => {
    const world = fakeWorld();
    const { session } = await started(undefined, IDS, world);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    world.override.step = async () => refusedResponse('work process busy');
    await expect(session.stop()).rejects.toThrow(/work process busy/);
    expect((await session.wait(0)).state).toBe('stopped');
    delete world.override.step;
    await session.stop();
    expect(session.holdsState()).toBe(false);
  });

  it('stated ids: the first start stops a predecessor listener under those ids', async () => {
    const world = fakeWorld();
    await started(undefined, { ...IDS, stated: true }, world);
    expect(world.calls.indexOf('stopListener')).toBeLessThan(world.calls.findIndex((c) => c.startsWith('listen:')));
  });

  it('describe says what is held, with the ids', async () => {
    const { session } = await started();
    expect(session.describe()).toEqual({ kind: 'abap', state: 'listening', breakpoints: 0, terminal_id: IDS.terminalId, ide_id: IDS.ideId });
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts`
Expected: FAIL. `stop`, `holdsState` and `describe` are missing, and no run happens.

- [ ] **Step 3: Implement — add these fields and members, and replace the two hooks**

```ts
  private run?: { generation: number; connection?: IAbapConnection };
  private reconciled = false;
  private cleanupFailures: string[] = [];

  protected async beforeFirstListen(identity: IDebuggerIdentity): Promise<void> {
    if (!this.ids.stated || this.reconciled) return;
    this.reconciled = true;
    // A predecessor under these ids may have left a listener (D12); its absence is no failure.
    await (await this.controlDebugger()).stopListener(identity).catch(() => undefined);
  }

  protected startRun(target: RunTarget, generation: number): void {
    this.run = { generation };
    void (async () => {
      let connection: IAbapConnection | undefined;
      let outcome: RunOutcome;
      try {
        connection = await this.open();
        if (this.run?.generation !== generation) return;
        this.run.connection = connection;
        outcome = await this.ports.run(connection, target);
      } catch (error) {
        outcome = { ok: false, message: thrown(error) };
      } finally {
        await this.close(connection);
      }
      if (this.run?.generation !== generation) return;
      this.run = undefined;
      this.notices.push({ state: 'ended', reason: 'run_finished', run: outcome });
      this.notify();
    })();
  }

  /** Everything off — DebugStop, dispose, shutdown. Required, not best effort. */
  stop(): Promise<void> {
    return this.mutate(async () => {
      this.generation++;
      const failures: string[] = [];
      const stop = this.current;
      if (stop) {
        const released = await stop.debugger.step('stepContinue', { analyse: analyseDebuggeeEnd }).catch(asFailure);
        if (released.ok) {
          this.current = undefined;
          await this.close(stop.connection);
        } else {
          failures.push(`release the debuggee: ${messageOf(released)}`);   // kept: a later stop retries
        }
      }
      if (this.armed.size > 0 || this.listener) {
        try {
          const identity = await this.identity();
          const control = await this.controlDebugger();
          for (const id of [...this.armed.keys()]) {
            const deleted = await control.deleteBreakpoint(identity, id).catch(asFailure);
            if (deleted.ok) this.armed.delete(id);
            else failures.push(`breakpoint ${id}: ${messageOf(deleted)}`);
          }
          if (this.listener) {
            const stopped = await control.stopListener(identity).catch(asFailure);
            if (stopped.ok) {
              const listener = this.listener;
              this.listener = undefined;
              await this.close(listener.connection);
            } else {
              failures.push(`listener: ${messageOf(stopped)}`);           // kept: a later stop retries
            }
          }
        } catch (error) {
          failures.push(thrown(error));
        }
      }
      if (!failures.length) {
        await this.close(this.control?.connection);
        this.control = undefined;
      }
      await this.close(this.run?.connection);
      this.run = undefined;
      this.failure = undefined;
      this.notices.length = 0;
      this.cleanupFailures = failures;
      this.notify();   // also tells the instance state (observe) that this part may hold nothing now
      if (failures.length) throw new DebugCleanupError(failures.join('; '));
    });
  }

  holdsState(): boolean {
    return !!this.listener || !!this.current || this.armed.size > 0 || this.notices.length > 0
      || !!this.run || this.failure !== undefined || this.cleanupFailures.length > 0;
  }

  failures(): string[] { return [...this.cleanupFailures]; }

  describe() {
    return {
      kind: 'abap' as const,
      state: this.current ? ('stopped' as const) : this.listener ? ('listening' as const) : ('idle' as const),
      breakpoints: this.armed.size,
      terminal_id: this.ids.terminalId,
      ide_id: this.ids.ideId,
    };
  }
```

`control` is `protected`, so the class compiles. The run test checks `world.closed.length === 1`: the run's connection closes before the notice is pushed.

- [ ] **Step 4: Run the whole folder and see it pass**

Run: `npx jest src/__tests__/unit/debugger/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debugger/DebugSession.ts src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts
git commit -m "feat(debugger): stop reports what it could not undo; run owned by its generation; reconciliation with stated ids"
```

---

### Task 6: `AmdpSession` and the AMDP and memory readings

**Files:**
- Create: `src/lib/debugger/amdpReadings.ts`, `src/lib/debugger/memoryReadings.ts`, `src/lib/debugger/AmdpSession.ts`
- Test: `src/__tests__/unit/debugger/amdpReadings.test.ts`, `src/__tests__/unit/debugger/memoryReadings.test.ts`, `src/__tests__/unit/debugger/AmdpSession.test.ts`

**Interfaces:**
- Consumes:
  - `Serial` (Task 4);
  - `DebugListenerError`, `DebugStateError`, `DebugRequestError`, `DebugCleanupError`, `RunTarget`, `RunOutcome`, `DebugView`, `WAIT_MAX_SECONDS` (Task 4);
  - `lineUriOf` (Task 2);
  - `AmdpDebugger` and `amdpDebuggerDocuments` from adt-clients. Their `started` and `command` results are the whole wire, headers included.
- Produces:

```ts
// amdpReadings.ts — the shapes the adt-clients AMDP integration test reads (measured
// on premise and on the cloud, 2026-10-09); Task 13 records answers, Task 14 checks these
export interface AmdpEvent { kind: string; requestId: string; debuggeeId: string; line?: number; variables: Array<{ name: string; value: string }>; states: string[]; body: string }
export function readAmdpEvents(xml: string): AmdpEvent[];
export function locationId(wire: { headers?: Record<string, unknown> }): string;   // last path segment of Location
export function readAmdpStart(wire: { headers?: Record<string, unknown>; data?: unknown }): { mainId: string; hanaSession: string };
export function readAmdpPreview(xml: string): { rows: Array<Record<string, string>>; columns: string[] };
export function terseAmdpEvent(e: AmdpEvent): { kind: string; line?: number; variables: Array<{ name: string; value: string }> };
// memoryReadings.ts
export function readXmlDocument(xml: string): unknown;
export function readSnapshotList(xml: string): Array<{ id: string; user: string; timestamp: string; size: number; programName: string; fileName: string }>;
// AmdpSession.ts
export type AmdpDebuggerT = AmdpDebugger<typeof amdpDebuggerDocuments>;
export interface AmdpSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(c: IAbapConnection): Promise<void>;
  amdpDebugger(c: IAbapConnection): AmdpDebuggerT;
  requestUser(origin: O): Promise<string>;
  run(c: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface AmdpBreakpoint { class_name: string; line: number }
export type AmdpState =
  | { state: 'idle' } | { state: 'waiting' }
  | { state: 'event'; events: AmdpEvent[] }
  | { state: 'ended'; reason: 'run_finished'; run: RunOutcome };
export class AmdpSession<O = unknown> {
  constructor(ports: AmdpSessionPorts<O>);
  bind(origin: O): this;
  start(options: { stopExisting: boolean; breakpoints: AmdpBreakpoint[]; run?: RunTarget }): Promise<{ mainId: string; breakpoints: string[] }>;
  setBreakpoints(list: AmdpBreakpoint[]): Promise<DebugView<string[]>>;   // waits for its SYNC_BREAKPOINTS (≤ 30 s inside the call)
  wait(holdSeconds?: number): Promise<AmdpState>;
  step(step: 'over' | 'continue'): Promise<DebugView<string>>;
  getTable(variable: string, query?: string): Promise<DebugView<{ rows: Array<Record<string, string>>; columns: string[] }>>;
  cancel(): Promise<void>;
  stop(): Promise<void>;
  holdsState(): boolean;                       // open | closing | unread events | pending run | failure | failed cleanup
  pending(): boolean;                          // closing, its last event batch not yet arrived
  failures(): string[];                        // what a cleanup could not undo
  describe(): { kind: 'amdp'; state: 'idle' | 'waiting' | 'stopped' | 'closing'; debuggee?: string };
  observe(onChange: () => void): void;         // called after every state change
  startRun(target: RunTarget): void;
}
```

**The AMDP rules taken from the measured protocol:**
- Events are read on one session and commands go on another. The events are read in the background, so a model's wait is bounded by its own hold, not by the server's 200 s poll.
- A breakpoint sync is answered at once with a request id in `Location`. Its outcome arrives later as a `SYNC_BREAKPOINTS` event carrying that request id. `start` runs the program only after that event.
- `ON_BREAK` names the stopped debuggee.
  - A `step` makes the debuggee moving, so the debuggee id is cleared until the next `ON_BREAK`.
  - `ON_EXECUTION_END` clears it as well.
- **Stopping.** A stop never releases a suspended debuggee, so `stop()` first sends an empty breakpoint sync, then deletes the known debuggee, then sends `stop`.
  - Closing a connection does not cancel a request that is still in flight, so `stop()` does not wait for the event poll.
  - The read loop's next batch is its last. In that turn it releases a break the batch carries and closes both connections.
  - Until then `holdsState()` is true (`closing`).
  - A failure is kept for a retry and thrown as `DebugCleanupError`.
- **Sync confirmation.** `SYNC_BREAKPOINTS` events are correlated by request id, apart from the public event queue, so a concurrent `wait()` cannot take one away from the sync that is waiting for it.
- **Step and break race.** A step clears the debuggee only when no `ON_BREAK` arrived while the step was being answered.
- A failed event read is a terminal failure. The session is stopped (best effort) and closed. The next `wait` throws it once, and a new `start` is allowed after that.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/amdpReadings.test.ts
import { locationId, readAmdpEvents, readAmdpPreview, readAmdpStart } from '../../../lib/debugger/amdpReadings';

// Shapes as the adt-clients AMDP integration test reads them; Task 14 replaces
// these with recorded answers.
export const START = { headers: { location: '/sap/bc/adt/amdp/debugger/main/0123456789ABCDEF0123456789ABCDEF' },
  data: '<amdpdbg:startResponse xmlns:amdpdbg="x"><amdpdbg:property amdpdbg:key="HANA_SESSION_ID" amdpdbg:value="123"/></amdpdbg:startResponse>' };
export const SYNCED = (requestId: string) => `<amdpdbg:events xmlns:amdpdbg="x"><amdpdbg:mainResponse amdpdbg:kind="SYNC_BREAKPOINTS" amdpdbg:requestId="${requestId}"><amdpdbg:breakpoint amdpdbg:state="PENDING"/></amdpdbg:mainResponse></amdpdbg:events>`;
export const BREAK = '<amdpdbg:events xmlns:amdpdbg="x" xmlns:adtcore="y"><amdpdbg:mainResponse amdpdbg:kind="ON_BREAK" amdpdbg:requestId="R1" amdpdbg:debuggeeId="D1"><amdpdbg:abapPosition adtcore:uri="/sap/bc/adt/oo/classes/zcl_a/source/main#start=14"/><amdpdbg:variable amdpdbg:name="LV_I">1</amdpdbg:variable><amdpdbg:variable amdpdbg:name="LV_N" amdpdbg:isNullValue="true"/></amdpdbg:mainResponse></amdpdbg:events>';
export const END = '<amdpdbg:events xmlns:amdpdbg="x"><amdpdbg:mainResponse amdpdbg:kind="ON_EXECUTION_END" amdpdbg:requestId="R2" amdpdbg:debuggeeId="D1"/></amdpdbg:events>';

describe('AMDP readings', () => {
  it('the start names the session in Location and the HANA session in the body', () => {
    expect(readAmdpStart(START)).toEqual({ mainId: '0123456789ABCDEF0123456789ABCDEF', hanaSession: '123' });
    expect(locationId({ headers: { Location: '/x/y/ABCDEF0123456789ABCDEF0123456789' } })).toBe('ABCDEF0123456789ABCDEF0123456789');
  });
  it('an ON_BREAK: kind, line, debuggee, variables (NULL for a null)', () => {
    const [e] = readAmdpEvents(BREAK);
    expect(e).toMatchObject({ kind: 'ON_BREAK', debuggeeId: 'D1', line: 14 });
    expect(e.variables).toEqual([{ name: 'LV_I', value: '1' }, { name: 'LV_N', value: 'NULL' }]);
  });
  it('a SYNC_BREAKPOINTS carries its request id and the states', () => {
    expect(readAmdpEvents(SYNCED('Q1'))[0]).toMatchObject({ kind: 'SYNC_BREAKPOINTS', requestId: 'Q1', states: ['PENDING'] });
  });
  it('a data preview becomes rows', () => {
    const xml = '<dataPreview:tableData xmlns:dataPreview="z"><dataPreview:columns><dataPreview:metadata dataPreview:name="N"/><dataPreview:dataSet><dataPreview:data>1</dataPreview:data><dataPreview:data>2</dataPreview:data></dataPreview:dataSet></dataPreview:columns><dataPreview:columns><dataPreview:metadata dataPreview:name="SQUARE"/><dataPreview:dataSet><dataPreview:data>1</dataPreview:data><dataPreview:data>4</dataPreview:data></dataPreview:dataSet></dataPreview:columns></dataPreview:tableData>';
    expect(readAmdpPreview(xml)).toEqual({ columns: ['N', 'SQUARE'], rows: [{ N: '1', SQUARE: '1' }, { N: '2', SQUARE: '4' }] });
  });
});
```

```ts
// src/__tests__/unit/debugger/memoryReadings.test.ts
import { corpusBody } from '../../../lib/adtCorpus';
import { readSnapshotList, readXmlDocument } from '../../../lib/debugger/memoryReadings';

it('lists the recorded snapshots of a user; none for a user with none', () => {
  const list = readSnapshotList(corpusBody('memory-snapshot-list--01-list-of-the-user'));
  expect(list[0]).toMatchObject({ id: '0CC47A1E68C11FE1B1827ADCF9D455CB', user: 'SAPUSER01', size: 168015 });
  expect(readSnapshotList(corpusBody('memory-snapshot-list--02-list-of-a-user-with-none'))).toEqual([]);
});
it('any document parses, its namespaces dropped', () => {
  expect(readXmlDocument('<a:x xmlns:a="u"><a:y>1</a:y></a:x>')).toEqual({ x: { y: '1' } });
});
```

```ts
// src/__tests__/unit/debugger/AmdpSession.test.ts
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebugCleanupError } from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import { BREAK, END, START, SYNCED } from './amdpReadings.test';
import { deferred, until } from './fakes';

function world() {
  const reads: Array<ReturnType<typeof deferred<any>>> = [];
  const calls: string[] = [];
  const closed: unknown[] = [];
  const run = deferred<any>();
  let syncN = 0;
  const dbg = {
    start: async (u: string, o: any) => { calls.push(`start:${u}:${o.stopExisting}`); return okResponse(START); },
    getEvents: () => { const d = deferred<any>(); reads.push(d); return d.promise; },
    syncBreakpoints: async (_m: string, b: any[]) => { calls.push(`sync:${b.length}`); return okResponse({ headers: { location: `/x/Q${++syncN}` } }); },
    step: async (_m: string, d: string, s: string) => { calls.push(`step:${d}:${s}`); return okResponse({ headers: {} }); },
    deleteDebuggee: async (_m: string, d: string) => { calls.push(`delete:${d}`); return okResponse({}); },
    stop: async () => { calls.push('stop'); return okResponse({}); },
    getDataPreview: async (o: any) => { calls.push(`preview:${o.variableName}:${o.debuggeeId}`); return okResponse('<dataPreview:tableData xmlns:dataPreview="z"/>'); },
  };
  let opened = 0;
  const session = new AmdpSession({
    openConnection: async () => ({ n: opened++ }) as any,
    closeConnection: async (c) => { closed.push(c); },
    amdpDebugger: () => dbg as any,
    requestUser: async () => 'SAPUSER01',
    run: async () => { calls.push('run'); return run.promise; },
  }).bind('origin');
  /** The request id the next sync will be answered with. */
  const nextSync = () => `Q${syncN + 1}`;
  return { session, reads, calls, closed, dbg, run, nextSync };
}

describe('AmdpSession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function started(w = world(), withRun = false) {
    const s = w.session.start({ stopExisting: true, breakpoints: [{ class_name: 'ZCL_A', line: 14 }], ...(withRun ? { run: { kind: 'class', name: 'ZCL_A' } } : {}) });
    await until(() => w.reads.length === 1);
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    await s;
    await until(() => w.reads.length === 2);
    return w;
  }

  it('the run starts only after the SYNC_BREAKPOINTS of its sync arrived', async () => {
    const w = world();
    const s = w.session.start({ stopExisting: true, breakpoints: [{ class_name: 'ZCL_A', line: 14 }], run: { kind: 'class', name: 'ZCL_A' } });
    await until(() => w.reads.length === 1);
    expect(w.calls).not.toContain('run');
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    await expect(s).resolves.toMatchObject({ mainId: '0123456789ABCDEF0123456789ABCDEF', breakpoints: ['PENDING'] });
    await until(() => w.calls.includes('run'));
  });

  it('an ON_BREAK arrives through wait; a step addresses its debuggee, then the debuggee is moving', async () => {
    const w = await started();
    const waiting = w.session.wait(30);
    w.reads[1].resolve(okResponse(BREAK));
    await expect(waiting).resolves.toMatchObject({ state: 'event', events: [{ kind: 'ON_BREAK', line: 14 }] });
    await w.session.step('continue');
    expect(w.calls).toContain('step:D1:continue');
    await expect(w.session.step('over')).rejects.toThrow(/no AMDP debuggee is stopped/);
  });

  it('ON_EXECUTION_END clears the debuggee', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    w.reads[2].resolve(okResponse(END));
    await until(() => w.reads.length === 4);
    await expect(w.session.getTable('LT_ROWS')).rejects.toThrow(/no AMDP debuggee/);
  });

  it('stop releases a suspended debuggee before the stop, returns without waiting for the poll, and the last batch closes everything', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    await w.session.stop();                                  // returns while reads[2] is still open
    expect(w.calls.indexOf('delete:D1')).toBeGreaterThan(-1);
    expect(w.calls.indexOf('delete:D1')).toBeLessThan(w.calls.indexOf('stop'));
    expect(w.session.holdsState()).toBe(true);               // closing
    w.reads[2].resolve(okResponse(BREAK.replace('D1', 'D2')));
    await until(() => w.closed.length === 2);
    expect(w.calls).toContain('delete:D2');
    expect(w.session.holdsState()).toBe(false);
  });

  it('a break that arrives while a step is answered is not lost', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const real = w.dbg.step;
    w.dbg.step = async (...a: any[]) => { w.reads[2].resolve(okResponse(BREAK.replace('D1', 'D3'))); await until(() => w.reads.length === 4); return real(...(a as [any, any, any])); };
    await w.session.step('continue');
    await expect(w.session.getTable('LT_ROWS')).resolves.toBeDefined();   // D3 is stopped
  });

  it('a wait does not take the sync confirmation away from the start', async () => {
    const w = world();
    const s = w.session.start({ stopExisting: true, breakpoints: [{ class_name: 'ZCL_A', line: 14 }] });
    await until(() => w.reads.length === 1);
    const waiting = w.session.wait(30);
    w.reads[0].resolve(okResponse(SYNCED('Q1')));
    await expect(s).resolves.toMatchObject({ breakpoints: ['PENDING'] });
    await jest.advanceTimersByTimeAsync(30_000);
    expect((await waiting).state).toBe('waiting');
  });

  it('a failed event read fails the next wait once, closes the session, and allows a new start', async () => {
    const w = await started();
    w.reads[1].resolve(refusedResponse('session gone'));
    await until(() => w.closed.length === 2);
    await expect(w.session.wait(0)).rejects.toThrow(/session gone/);
    expect((await w.session.wait(0)).state).toBe('idle');
    const before = w.reads.length;
    const expected = w.nextSync();                   // the failure path's stop sent no sync; ask the fake, never count by hand
    const s = w.session.start({ stopExisting: true, breakpoints: [{ class_name: 'ZCL_A', line: 14 }] });
    await until(() => w.reads.length === before + 1);
    w.reads[before].resolve(okResponse(SYNCED(expected)));
    await expect(s).resolves.toMatchObject({ mainId: '0123456789ABCDEF0123456789ABCDEF' });
  });

  it('a breakpoint clear that fails survives the last batch and is retried by the next stop', async () => {
    const w = await started();
    const realSync = w.dbg.syncBreakpoints;
    let refusedClears = 0;
    w.dbg.syncBreakpoints = async (m: string, b: any[]) => (b.length === 0 ? (refusedClears++, refusedResponse('clear refused')) : realSync(m, b));
    await expect(w.session.stop()).rejects.toThrow(/clear refused/);
    expect(refusedClears).toBe(1);
    w.reads[1].resolve(okResponse('<amdpdbg:events xmlns:amdpdbg="x"/>'));   // the last batch arrives
    await until(() => refusedClears === 2);                   // its own attempt failed too
    await until(() => !w.session.pending());
    expect(w.session.holdsState()).toBe(true);                // not closed: the clear is still owed
    expect(w.closed).toHaveLength(0);
    w.dbg.syncBreakpoints = realSync;
    await w.session.stop();
    expect(w.session.holdsState()).toBe(false);
    expect(w.closed).toHaveLength(2);
  });

  it('a release that fails in the last batch is retried by the next stop', async () => {
    const w = await started();
    await w.session.stop();
    const realDelete = w.dbg.deleteDebuggee;
    let refusedDeletes = 0;
    w.dbg.deleteDebuggee = async () => (refusedDeletes++, refusedResponse('busy'));
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => refusedDeletes === 1);                  // the last batch's release was attempted and failed
    await until(() => !w.session.pending());
    expect(w.session.failures()).toEqual(['release debuggee D1: busy']);
    expect(w.closed).toHaveLength(0);
    w.dbg.deleteDebuggee = realDelete;
    await w.session.stop();
    expect(w.calls).toContain('delete:D1');
    expect(w.session.holdsState()).toBe(false);
    expect(w.closed).toHaveLength(2);
  });

  it('a cleanup that fails is reported', async () => {
    const w = await started();
    w.dbg.stop = async () => refusedResponse('not stopped');
    await expect(w.session.stop()).rejects.toThrow(DebugCleanupError);
    expect(w.session.holdsState()).toBe(true);               // kept for a retry
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/amdpReadings.test.ts src/__tests__/unit/debugger/memoryReadings.test.ts src/__tests__/unit/debugger/AmdpSession.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement the readings**

```ts
// src/lib/debugger/amdpReadings.ts
/**
 * AMDP debugger documents, in the shapes the adt-clients AMDP integration
 * test reads (measured on premise and on the cloud, 2026-10-09).
 */
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true,
  parseTagValue: false, parseAttributeValue: false, trimValues: false,
  isArray: (n) => ['mainResponse', 'variable', 'columns', 'data', 'breakpoint'].includes(n),
});
const text = (v: unknown): string =>
  v === undefined || v === null ? '' : typeof v === 'object' ? String((v as Record<string, unknown>)['#text'] ?? '') : String(v);

export interface AmdpEvent { kind: string; requestId: string; debuggeeId: string; line?: number; variables: Array<{ name: string; value: string }>; states: string[]; body: string }

export function readAmdpEvents(xml: string): AmdpEvent[] {
  if (!xml?.trim()) return [];
  const doc = parser.parse(xml);
  const rows: any[] = (doc.events ?? doc).mainResponse ?? [];
  const bodies = [...xml.matchAll(/<(?:\w+:)?mainResponse\b[\s\S]*?(?:\/>|<\/(?:\w+:)?mainResponse>)/g)].map((m) => m[0]);
  return rows.map((r, i) => {
    const start = /#start=(\d+)/.exec(text(r.abapPosition?.uri))?.[1];
    return {
      kind: text(r.kind), requestId: text(r.requestId), debuggeeId: text(r.debuggeeId),
      ...(start ? { line: Number(start) } : {}),
      variables: (r.variable ?? []).map((v: any) => ({ name: text(v.name), value: text(v.isNullValue) === 'true' ? 'NULL' : text(v) })),
      states: (r.breakpoint ?? []).map((b: any) => text(b.state)),
      body: bodies[i] ?? '',
    };
  });
}

export function locationId(wire: { headers?: Record<string, unknown> }): string {
  const location = String(wire.headers?.location ?? wire.headers?.Location ?? '');
  return /\/([^/?]+)\/?(?:\?.*)?$/.exec(location)?.[1] ?? '';
}

export function readAmdpStart(wire: { headers?: Record<string, unknown>; data?: unknown }): { mainId: string; hanaSession: string } {
  const body = String(wire.data ?? '');
  const property = /<[^>]*HANA_SESSION_ID[^>]*>/.exec(body)?.[0] ?? '';
  return { mainId: locationId(wire), hanaSession: /\bvalue="([^"]*)"/.exec(property)?.[1] ?? '' };
}

export function readAmdpPreview(xml: string): { rows: Array<Record<string, string>>; columns: string[] } {
  const columns: any[] = parser.parse(xml ?? '').tableData?.columns ?? [];
  const names = columns.map((c) => text(c.metadata?.name));
  const values = columns.map((c) => (c.dataSet?.data ?? []).map(text));
  const count = Math.max(0, ...values.map((v) => v.length));
  const rows = Array.from({ length: count }, (_, i) => Object.fromEntries(names.map((n, j) => [n, values[j][i] ?? ''])));
  return { columns: names, rows };
}

export function terseAmdpEvent(e: AmdpEvent) {
  return { kind: e.kind, ...(e.line !== undefined ? { line: e.line } : {}), variables: e.variables };
}
```

```ts
// src/lib/debugger/memoryReadings.ts
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, parseTagValue: false, isArray: (n) => n === 'snapshot' });

/** Any document, its namespaces dropped — `full` for an answer without a reading of its own. */
export function readXmlDocument(xml: string): unknown {
  return xml?.trim() ? parser.parse(xml) : {};
}

export function readSnapshotList(xml: string) {
  const list: any[] = (readXmlDocument(xml) as any)?.snapshotsList?.snapshots?.snapshot ?? [];
  return list.map((s) => ({
    id: String(s.id ?? ''), user: String(s.user ?? ''), timestamp: String(s.timestamp ?? ''),
    size: Number(s.size ?? 0), programName: String(s.programName ?? ''), fileName: String(s.fileName ?? ''),
  }));
}
```

`readXmlDocument('<a:x xmlns:a="u"><a:y>1</a:y></a:x>')` gives `{ x: { y: '1' } }` only if fast-xml-parser drops the `xmlns:a` attribute when `removeNSPrefix` is set. If it keeps it, add `ignoreDeclaration: true` and filter keys starting with `xmlns`. Do not loosen the test.

- [ ] **Step 4: Implement `AmdpSession`**

```ts
// src/lib/debugger/AmdpSession.ts
/**
 * The AMDP debugger's state — one per server instance, one AMDP session at a
 * time. Events on one session, commands on another (measured); events are read
 * in the background so a wait is bounded by its own hold. A sync is answered
 * with a request id and confirmed by its SYNC_BREAKPOINTS event, correlated
 * apart from the public event queue; a run starts only after that. A stop never
 * releases a suspended debuggee (measured), so stop() deletes it first. Closing
 * a connection does not cancel a request in flight (the connector dispatches
 * its logoff and returns), so stop() does not wait for the event poll: the read
 * loop, when its last batch arrives, releases a break it carries and closes both
 * connections. Nothing ends on a timer of ours.
 */
import { randomUUID } from 'node:crypto';
import type { AmdpDebugger, amdpDebuggerDocuments } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { type AmdpEvent, locationId, readAmdpEvents, readAmdpPreview, readAmdpStart } from './amdpReadings';
import {
  DebugCleanupError, DebugListenerError, DebugRequestError, DebugStateError, type DebugView,
  type RunOutcome, type RunTarget, WAIT_MAX_SECONDS,
} from './DebugSession';
import { lineUriOf } from './objectUri';
import { Serial } from './serial';

export type AmdpDebuggerT = AmdpDebugger<typeof amdpDebuggerDocuments>;
export interface AmdpSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(c: IAbapConnection): Promise<void>;
  amdpDebugger(c: IAbapConnection): AmdpDebuggerT;
  requestUser(origin: O): Promise<string>;
  run(c: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface AmdpBreakpoint { class_name: string; line: number }
export type AmdpState =
  | { state: 'idle' } | { state: 'waiting' }
  | { state: 'event'; events: AmdpEvent[] }
  | { state: 'ended'; reason: 'run_finished'; run: RunOutcome };

interface Open {
  events: IAbapConnection; commands: IAbapConnection;
  onEvents: AmdpDebuggerT; onCommands: AmdpDebuggerT;
  mainId: string; hanaSession: string;
  stopping: boolean;           // stop() was sent; the read loop finishes the cleanup
  released: Set<string>;       // debuggees already deleted
  unreleased: Set<string>;     // debuggees whose deletion failed: kept, with the command session, for a retry
  cleared: boolean;            // the empty breakpoint sync was answered ok
  stopped: boolean;            // the stop request was answered ok
  readDone: boolean;           // the read loop has returned
}

const thrown = (e: unknown) => (e instanceof Error ? e.message : String(e));
const failed = (e: unknown) => ({ ok: false as const, getError: () => ({ message: thrown(e) }) }) as any;

export class AmdpSession<O = unknown> {
  private readonly serial = new Serial();
  private origin?: O;
  private open?: Open;
  private closing?: Open;                       // stopped, its read loop not yet finished
  private debuggeeId?: string;
  private breaks = 0;                           // counts ON_BREAK, to tell a stop that came during a step
  private queue: AmdpEvent[] = [];
  private readonly syncs = new Map<string, AmdpEvent>();   // SYNC_BREAKPOINTS by request id, apart from the queue
  private notices: AmdpState[] = [];
  private failure?: string;
  private cleanupFailures: string[] = [];
  private runGeneration?: number;
  private generation = 0;
  private readonly waiters = new Set<() => void>();
  private changed?: () => void;

  constructor(private readonly ports: AmdpSessionPorts<O>) {}
  bind(origin: O): this { this.origin = origin; return this; }
  observe(onChange: () => void): void { this.changed = onChange; }

  private requireOrigin(): O {
    if (this.origin === undefined) throw new DebugStateError('the debugger has no connection yet');
    return this.origin;
  }
  private requireOpen(): Open {
    if (!this.open) throw new DebugStateError('no AMDP debug session is running');
    return this.open;
  }
  private requireDebuggee(): string {
    if (!this.debuggeeId) throw new DebugStateError('no AMDP debuggee is stopped');
    return this.debuggeeId;
  }
  private notify(): void { for (const w of [...this.waiters]) w(); this.changed?.(); }

  /** Every change goes through here: one at a time, and observers hear of it afterwards — whatever it did. */
  private mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.serial.run(async () => {
      try { return await work(); } finally { this.notify(); }
    });
  }

  start(options: { stopExisting: boolean; breakpoints: AmdpBreakpoint[]; run?: RunTarget }) {
    return this.mutate(async () => {
      if (this.open || this.closing) throw new DebugStateError('an AMDP debug session is already running for this debug session');
      const origin = this.requireOrigin();
      const user = (await this.ports.requestUser(origin)).toUpperCase();
      const events = await this.ports.openConnection(origin);
      const commands = await this.ports.openConnection(origin);
      const onEvents = this.ports.amdpDebugger(events);
      const onCommands = this.ports.amdpDebugger(commands);
      const started = await onEvents.start(user, { stopExisting: options.stopExisting });
      if (!started.ok) {
        await this.ports.closeConnection(events);
        await this.ports.closeConnection(commands);
        throw new DebugListenerError(started.getError().message);
      }
      const { mainId, hanaSession } = readAmdpStart(started.getResult().value as any);
      const open: Open = { events, commands, onEvents, onCommands, mainId, hanaSession, stopping: false, released: new Set(), unreleased: new Set(), cleared: false, stopped: false, readDone: false };
      this.open = open;
      this.failure = undefined;
      this.generation++;
      void this.readLoop(open);
      const states = await this.sync(open, options.breakpoints);
      if (options.run) this.startRun(options.run);
      return { mainId, breakpoints: states };
    });
  }

  /** Sends a sync and waits, inside this call, for its own SYNC_BREAKPOINTS. */
  private async sync(open: Open, list: AmdpBreakpoint[]): Promise<string[]> {
    const breakpoints = list.map((b) => ({ clientId: randomUUID(), uri: lineUriOf({ object_type: 'CLAS', object_name: b.class_name }, b.line) }));
    const answer = await open.onCommands.syncBreakpoints(open.mainId, breakpoints);
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    const requestId = locationId(answer.getResult().value as any);
    const settled = () => this.syncs.has(requestId) || this.open !== open || this.failure !== undefined;
    if (!settled()) {
      await new Promise<void>((resolve) => {
        const done = () => { if (!settled()) return; clearTimeout(t); this.waiters.delete(done); resolve(); };
        const t = setTimeout(() => { this.waiters.delete(done); resolve(); }, WAIT_MAX_SECONDS * 1000);
        this.waiters.add(done);
      });
    }
    const event = this.syncs.get(requestId);
    this.syncs.delete(requestId);
    if (!event) throw new DebugRequestError('the breakpoints were sent but the system did not confirm them within this call; nothing was run');
    return event.states;
  }

  private async readLoop(open: Open): Promise<void> {
    for (;;) {
      const answer = await open.onEvents.getEvents(open.mainId).catch(failed);
      const events = answer.ok ? readAmdpEvents(String(answer.getResult().value ?? '')) : [];
      if (open.stopping || this.open !== open) {
        open.readDone = true;
        await this.serial.run(() => this.finishClosing(open, events));   // stop() was sent: this was the last batch
        this.notify();
        return;
      }
      if (!answer.ok) {
        // The event session failed: the AMDP session ends — through the same retained cleanup as a stop.
        open.readDone = true;
        this.failure = answer.getError().message;
        await this.serial.run(async () => {
          if (this.debuggeeId) open.unreleased.add(this.debuggeeId);
          this.open = undefined;
          this.closing = open;
          this.debuggeeId = undefined;
          await this.finishClosing(open, events);
        });
        this.notify();
        return;
      }
      for (const e of events) {
        if (e.kind === 'SYNC_BREAKPOINTS') { this.syncs.set(e.requestId, e); continue; }
        if (e.kind === 'ON_BREAK') { this.debuggeeId = e.debuggeeId; this.breaks++; }
        if (e.kind === 'ON_EXECUTION_END' && e.debuggeeId === this.debuggeeId) this.debuggeeId = undefined;
        this.queue.push(e);
      }
      this.notify();
    }
  }

  /**
   * Inside the serial: release every break known to be suspended — the last
   * batch's and any kept from a failed attempt — stop the session if that was
   * not answered yet, and close both sessions only when nothing is left. What
   * fails stays in `closing` for the next stop().
   */
  private async finishClosing(open: Open, lastBatch: AmdpEvent[]): Promise<void> {
    for (const e of lastBatch) if (e.kind === 'ON_BREAK' && !open.released.has(e.debuggeeId)) open.unreleased.add(e.debuggeeId);
    const failures: string[] = [];
    if (!open.cleared) {
      const cleared = await open.onCommands.syncBreakpoints(open.mainId, []).catch(failed);
      if (cleared.ok) open.cleared = true;
      else failures.push(`clear breakpoints: ${cleared.getError().message}`);
    }
    for (const id of [...open.unreleased]) {
      const a = await open.onCommands.deleteDebuggee(open.mainId, id).catch(failed);
      if (a.ok) { open.unreleased.delete(id); open.released.add(id); }
      else failures.push(`release debuggee ${id}: ${a.getError().message}`);
    }
    if (!open.stopped) {
      const stopped = await open.onCommands.stop(open.mainId).catch(failed);
      if (stopped.ok) open.stopped = true;
      else failures.push(`stop: ${stopped.getError().message}`);
    }
    this.cleanupFailures = failures;
    if (failures.length || !open.readDone) return;     // kept: retried by stop(), or finished by the read loop
    await this.ports.closeConnection(open.events);
    await this.ports.closeConnection(open.commands);
    if (this.closing === open) this.closing = undefined;
  }

  setBreakpoints(list: AmdpBreakpoint[]): Promise<DebugView<string[]>> {
    return this.mutate(async () => {
      const states = await this.sync(this.requireOpen(), list);
      return { value: states, raw: JSON.stringify(states) };
    });
  }

  async wait(holdSeconds = 10): Promise<AmdpState> {
    const ms = Math.min(Math.max(holdSeconds, 0), WAIT_MAX_SECONDS) * 1000;
    const ready = () => this.failure !== undefined || this.queue.length > 0 || this.notices.length > 0 || !this.open;
    if (!ready() && ms > 0) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(t); this.waiters.delete(done); resolve(); };
        const t = setTimeout(done, ms);
        this.waiters.add(done);
      });
    }
    if (this.failure !== undefined) { const m = this.failure; this.failure = undefined; this.notify(); throw new DebugListenerError(m); }
    if (this.queue.length) { const events = this.queue.splice(0); this.notify(); return { state: 'event', events }; }
    const notice = this.notices.shift();
    if (notice) { this.notify(); return notice; }
    return this.open ? { state: 'waiting' } : { state: 'idle' };
  }

  step(step: 'over' | 'continue'): Promise<DebugView<string>> {
    return this.mutate(async () => {
      const open = this.requireOpen();
      const debuggee = this.requireDebuggee();
      const breaksBefore = this.breaks;
      const answer = await open.onCommands.step(open.mainId, debuggee, step);
      if (!answer.ok) throw new DebugRequestError(answer.getError().message);
      // Moving until the next ON_BREAK — unless one already arrived while the step was answered.
      if (this.breaks === breaksBefore) this.debuggeeId = undefined;
      return { value: 'moving', raw: '' };
    });
  }

  getTable(variable: string, query?: string) {
    return this.mutate(async () => {
      const open = this.requireOpen();
      const answer = await open.onCommands.getDataPreview({
        sessionId: open.hanaSession, debuggerId: open.mainId, debuggeeId: this.requireDebuggee(),
        variableName: variable.toUpperCase(), rowNumber: 100, ...(query ? { query } : {}),
      });
      if (!answer.ok) throw new DebugRequestError(answer.getError().message);
      const raw = String(answer.getResult().value ?? '');
      return { value: readAmdpPreview(raw), raw };
    });
  }

  cancel(): Promise<void> {
    return this.mutate(async () => {
      const open = this.requireOpen();
      const debuggee = this.requireDebuggee();
      const answer = await open.onCommands.deleteDebuggee(open.mainId, debuggee);
      if (!answer.ok) throw new DebugRequestError(answer.getError().message);
      open.released.add(debuggee);
      this.debuggeeId = undefined;
    });
  }

  /**
   * Releases a suspended debuggee, empties the breakpoints, stops the session.
   * A second call retries what a first left (`closing`). The connections close
   * when the read loop's last batch has arrived and nothing is left to undo.
   */
  stop(): Promise<void> {
    return this.mutate(async () => {
      const failures: string[] = [];
      const open = this.open;
      if (open) {
        if (this.debuggeeId && !open.released.has(this.debuggeeId)) open.unreleased.add(this.debuggeeId);
        open.stopping = true;
        this.closing = open;
        this.open = undefined;
        this.debuggeeId = undefined;
      }
      const closing = this.closing;
      if (closing) {
        await this.finishClosing(closing, []);
        failures.push(...this.cleanupFailures);
      }
      this.cleanupFailures = failures;
      this.runGeneration = undefined;
      this.queue = [];
      this.notices = [];
      this.failure = undefined;
      if (failures.length) throw new DebugCleanupError(failures.join('; '));
    });
  }

  startRun(target: RunTarget): void {
    const generation = this.generation;
    this.runGeneration = generation;
    const origin = this.requireOrigin();
    void (async () => {
      let c: IAbapConnection | undefined;
      let run: RunOutcome;
      try { c = await this.ports.openConnection(origin); run = await this.ports.run(c, target); }
      catch (e) { run = { ok: false, message: thrown(e) }; }
      finally { if (c) await this.ports.closeConnection(c); }
      if (this.runGeneration !== generation) return;
      this.runGeneration = undefined;
      this.notices.push({ state: 'ended', reason: 'run_finished', run });
      this.notify();
    })();
  }

  holdsState(): boolean {
    return !!this.open || !!this.closing || this.queue.length > 0 || this.notices.length > 0
      || this.runGeneration !== undefined || this.failure !== undefined || this.cleanupFailures.length > 0;
  }

  /** Still finishing on its own: stopped, the last event batch not yet arrived. */
  pending(): boolean { return !!this.closing && !this.closing.readDone; }
  failures(): string[] { return [...this.cleanupFailures]; }

  describe() {
    return {
      kind: 'amdp' as const,
      state: this.debuggeeId ? ('stopped' as const) : this.open ? ('waiting' as const) : this.closing ? ('closing' as const) : ('idle' as const),
      ...(this.debuggeeId ? { debuggee: this.debuggeeId } : {}),
    };
  }
}
```

`stop()` never waits for the event poll. Closing a connection does not cancel a request in flight: the connector's `disconnect()` dispatches the logoff and returns (`AbstractAbapConnection.js:366-396`), and `HttpTransport.close()` is empty. So a wait there could last as long as the server holds the poll. The read loop owns the end instead: its next batch is the last one, and in that turn it releases a break the batch carries and closes both connections. Until then `holdsState()` stays true (`closing`), and the instance state hears the change through `observe`. Whether SAP ends an open event poll when the session is stopped is measured in Task 14.

- [ ] **Step 5: Run them and see them pass**

Run: `npx jest src/__tests__/unit/debugger/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/debugger/amdpReadings.ts src/lib/debugger/memoryReadings.ts src/lib/debugger/AmdpSession.ts src/__tests__/unit/debugger/
git commit -m "feat(debugger): AmdpSession — run after its sync is confirmed, debuggee tracked by events, stop releases first"
```

---

### Task 7: State in the server instance — `InstanceState`, the debugger as one of its parts, access, answers

The instance's handle and its "holds state" verdict are generic (spec D1, D9). `InstanceState` in `src/lib/state/` owns them. The debugger is its first part; locks will be the next. The pool (Task 9) knows only `InstanceState`, never the debugger.

**Files:**
- Create:
  - `src/lib/state/InstanceState.ts`, `src/lib/state/index.ts`
  - `src/lib/debugger/ports.ts`
  - `src/lib/debugger/DebuggerInstance.ts`
  - `src/lib/debugger/access.ts`
  - `src/lib/debugger/answer.ts`
  - `src/lib/debugger/schemas.ts`
  - `src/lib/debugger/index.ts`
- Modify:
  - `src/handlers/interfaces.ts:8` (`HandlerContext`)
  - `src/embeddable/BaseMcpServer.ts` (state, the context at l.257-261, `stateHandle`/`holdsState`/`dispose`)
  - `package.json` (exports and typesVersions: `./debugger`, `./state`)
- Test:
  - `src/__tests__/unit/state/InstanceState.test.ts`
  - `src/__tests__/unit/debugger/ports.test.ts`
  - `src/__tests__/unit/debugger/access.test.ts`
  - `src/__tests__/unit/debugger/answer.test.ts`
  - `src/__tests__/unit/debugger/baseMcpServerState.test.ts`

**Interfaces:**
- Produces:

```ts
// src/lib/state/InstanceState.ts
export interface StateDescription { kind: string; [field: string]: unknown }
/** pending: cleanup is still finishing on its own (an AMDP session waits for its last event batch). failures: what a cleanup could not undo, kept for a retry. */
export interface StatePart { holdsState(): boolean; pending(): boolean; failures(): string[]; dispose(): Promise<void>; describe(): StateDescription[]; observe(onChange: () => void): void }
/** What the host lends an instance for one request (Task 9); stdio and SSE lend none. */
export interface StateHost {
  /** The request's owner, or null when the request carries no identity to keep state under. */
  readonly owner: string | null;
  /** Atomically reserves the owner's slot of a kind for this handle; answers the holder's handle when another instance holds it. */
  reserve(kind: string, handle: string): string | undefined;
  /** Every state the owner holds in the pool, this instance's included. */
  peers(): Array<{ state_handle: string; states: StateDescription[] }>;
}
export class StateUnavailableError extends Error {}   // 'state is not available'
export class InstanceState {
  get handle(): string;                    // 32 upper-case hex; a new one after rotate()
  host?: StateHost;                        // set by the host per request
  attach(part: StatePart): void;
  holdsState(): boolean;
  describe(): { state_handle: string; states: StateDescription[] };
  /** For a state-creating call: refuses without an identity; reserves the kind (refusing with the holder's handle). */
  admit(kind: string): void;
  /** For a call on existing state: the handle must be this one and something must be held. */
  check(handle: unknown): void;
  /** A complete stop was asked: the handle is invalidated for good when nothing is held — now, or when an asynchronous part finishes. */
  endWhenEmpty(): void;
  kindsHeld(): string[];                   // the kinds the parts describe as held
  pending(): boolean;                      // some part is still finishing a cleanup on its own
  failures(): string[];                    // what the parts could not undo
  onEmpty(listener: () => void): void;     // fires once per transition from holding to empty
  onChange(listener: () => void): () => void;   // every change; answers its unsubscribe
  settled(): Promise<void>;                // holds nothing, or nothing is finishing on its own
  /** For a host letting the instance go: dispose, settle, once more what is left, settle; answers what is still held. */
  shutdown(): Promise<string[]>;
  dispose(): Promise<void>;                // every part; throws an aggregate of what failed; reconciles afterwards
}
// handlers/interfaces.ts
export interface HandlerContext { connection: IAbapConnection; logger?: ILogger; state?: InstanceState; debugger?: () => DebuggerInstance }
// DebuggerInstance.ts — a StatePart
export class DebuggerInstance implements StatePart {
  constructor(sessions: { abap: DebugSession<HandlerContext>; amdp: AmdpSession<HandlerContext> });
  readonly abap: DebugSession<HandlerContext>; readonly amdp: AmdpSession<HandlerContext>;
  holdsState(): boolean; describe(): StateDescription[]; observe(cb: () => void): void;
  stop(): Promise<void>; dispose(): Promise<void>;
}
export function createDebuggerInstance(ids?: DebuggerIds & { stated: boolean }): DebuggerInstance;
// access.ts
export function requireDebugger(context: HandlerContext, args: unknown, mode: { create: 'abap' | 'amdp' } | 'use'): DebuggerInstance;
// ports.ts, answer.ts, schemas.ts — as below (STATE_HANDLE_PROPERTY replaces any debugger-specific handle)
// BaseMcpServer
readonly state: InstanceState;
get stateHandle(): string;  holdsState(): boolean;  dispose(): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/state/InstanceState.test.ts
import { InstanceState, StateUnavailableError } from '../../../lib/state/InstanceState';

const part = () => {
  let held = false; let cb: () => void = () => {};
  return {
    set: (v: boolean) => { held = v; cb(); },
    p: { holdsState: () => held, pending: () => false, failures: () => [], dispose: async () => { held = false; }, describe: () => (held ? [{ kind: 'abap' }] : []), observe: (f: () => void) => { cb = f; } },
  };
};

describe('InstanceState', () => {
  it('a 32-hex handle; holds what its parts hold', () => {
    const s = new InstanceState(); const a = part(); s.attach(a.p);
    expect(s.handle).toMatch(/^[0-9A-F]{32}$/);
    expect(s.holdsState()).toBe(false);
    a.set(true);
    expect(s.holdsState()).toBe(true);
    expect(s.describe()).toEqual({ state_handle: s.handle, states: [{ kind: 'abap' }] });
  });
  it('check: this handle and something held; otherwise not available — the same answer', () => {
    const s = new InstanceState(); const a = part(); s.attach(a.p); a.set(true);
    expect(() => s.check(s.handle)).not.toThrow();
    for (const h of [undefined, 42, 'F'.repeat(32)]) expect(() => s.check(h)).toThrow(StateUnavailableError);
    a.set(false);
    expect(() => s.check(s.handle)).toThrow('state is not available');
  });
  it('endWhenEmpty invalidates the old handle at once when nothing is held', () => {
    const s = new InstanceState(); const a = part(); s.attach(a.p);
    const old = s.handle; s.endWhenEmpty();
    expect(s.handle).not.toBe(old);
    a.set(true); expect(() => s.check(old)).toThrow(StateUnavailableError);
  });
  it('endWhenEmpty while a part still finishes: the old handle serves until it empties, then never again', () => {
    const s = new InstanceState(); const a = part(); s.attach(a.p); a.set(true);
    const old = s.handle; s.endWhenEmpty();
    expect(() => s.check(old)).not.toThrow();       // a retry of the stop may still use it
    a.set(false);                                   // the asynchronous part finished
    expect(s.handle).not.toBe(old);
    a.set(true); expect(() => s.check(old)).toThrow(StateUnavailableError);
  });
  it('attach samples a part already holding; dispose that empties it fires onEmpty', async () => {
    const s = new InstanceState(); const a = part(); a.set(true);
    s.attach(a.p);
    const seen = jest.fn(); s.onEmpty(seen);
    await s.dispose();
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it('admit: refuses without an identity; refuses with the holder handle when another instance holds the kind', () => {
    const s = new InstanceState();
    s.host = { owner: null, reserve: () => undefined, peers: () => [] };
    expect(() => s.admit('abap')).toThrow(/no identity/);
    s.host = { owner: 'O', reserve: () => 'OTHERHANDLE', peers: () => [] };
    expect(() => s.admit('abap')).toThrow(/OTHERHANDLE/);
    s.host = { owner: 'O', reserve: () => undefined, peers: () => [] };
    expect(() => s.admit('abap')).not.toThrow();
  });
  it('shutdown waits for a part still finishing after its disposal threw, retries once, answers what is left', async () => {
    const s = new InstanceState();
    let held = true; let finishing = false; let failures: string[] = []; let disposals = 0; let tell = () => {};
    s.attach({
      holdsState: () => held, pending: () => finishing, failures: () => failures, describe: () => [], observe: (f) => { tell = f; },
      dispose: async () => { disposals++; if (disposals === 1) { finishing = true; throw new Error('clear refused'); } },
    });
    let answer: string[] | undefined;
    const shutting = s.shutdown().then((a) => { answer = a; });
    await new Promise((r) => setImmediate(r));
    expect(answer).toBeUndefined();                 // waiting for the part to settle
    finishing = false; failures = ['release debuggee D1: busy']; tell();
    await shutting;
    expect(disposals).toBe(2);
    expect(answer).toEqual(['release debuggee D1: busy']);
  });

  it('onEmpty fires when the last part stops holding', () => {
    const s = new InstanceState(); const a = part(); s.attach(a.p);
    const seen = jest.fn(); s.onEmpty(seen);
    a.set(true); expect(seen).not.toHaveBeenCalled();
    a.set(false); expect(seen).toHaveBeenCalledTimes(1);
  });
});
```

```ts
// src/__tests__/unit/debugger/access.test.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { InstanceState, StateUnavailableError } from '../../../lib/state/InstanceState';

const fake = (holds: boolean) => ({ holdsState: () => holds, pending: () => false, failures: () => [], bind() { return this; }, describe: () => ({ kind: 'abap' }), stop: async () => {}, observe: () => {}, ids: { terminalId: 'T', ideId: 'I' } }) as any;
function ctx(holds: boolean) {
  const state = new InstanceState();
  const dbg = new DebuggerInstance({ abap: fake(holds), amdp: fake(false) });
  state.attach(dbg);
  return { context: { connection: {} as any, state, debugger: () => dbg }, state, dbg };
}

describe('requireDebugger', () => {
  it('create admits the kind and gives the debugger', () => {
    const { context, dbg } = ctx(false);
    expect(requireDebugger(context, {}, { create: 'abap' })).toBe(dbg);
  });
  it('use wants this instance handle with state held', () => {
    const { context, state, dbg } = ctx(true);
    expect(requireDebugger(context, { state_handle: state.handle }, 'use')).toBe(dbg);
    expect(() => requireDebugger(context, { state_handle: 'F'.repeat(32) }, 'use')).toThrow(StateUnavailableError);
  });
  it('a server instance without state or debugger refuses plainly', () => {
    expect(() => requireDebugger({ connection: {} as any }, {}, { create: 'abap' })).toThrow(/debugging is not served/);
  });
});
```


```ts
// src/__tests__/unit/debugger/ports.test.ts
import { requestUserOf } from '../../../lib/debugger/ports';
import { runWithRequestContext } from '../../../lib/requestContext';
import { recordingConnection } from '../../helpers/recordingConnection';

describe('the request user', () => {
  it('is the user systeminformation names', async () => {
    const conn = recordingConnection([{ status: 200, data: JSON.stringify({ userName: 'cb9980000001' }) }]);
    await expect(requestUserOf(conn as any)).resolves.toBe('CB9980000001');
  });
  it('falls back to the login — the scope login before the process login — never the responsible', async () => {
    const conn = recordingConnection([{ status: 404, data: '' }]);
    process.env.SAP_USERNAME = 'processlogin';
    process.env.SAP_RESPONSIBLE = 'SOMEONEELSE';
    try {
      await expect(requestUserOf(conn as any)).resolves.toBe('PROCESSLOGIN');
      await runWithRequestContext({ login: 'scopelogin' }, async () => {
        await expect(requestUserOf(conn as any)).resolves.toBe('SCOPELOGIN');
      });
    } finally { delete process.env.SAP_USERNAME; delete process.env.SAP_RESPONSIBLE; }
  });
});
```

```ts
// src/__tests__/unit/debugger/answer.test.ts
import { debugAnswer, debugStateAnswer } from '../../../lib/debugger/answer';
import { DebugListenerError } from '../../../lib/debugger/DebugSession';

describe('debug answers', () => {
  const view = { value: { a: 1, b: 2 }, raw: '<x/>' };
  it('terse by default; full parses; raw is the document', async () => {
    expect(JSON.parse((await debugAnswer({}, async () => view, (v) => ({ a: v.a }))).content[0].text)).toEqual({ a: 1 });
    expect(JSON.parse((await debugAnswer({ detail: 'full' }, async () => view, () => 0)).content[0].text)).toEqual({ a: 1, b: 2 });
    expect(JSON.parse((await debugAnswer({ detail: 'full' }, async () => view, () => 0, (v) => ({ parsed: v.b }))).content[0].text)).toEqual({ parsed: 2 });
    expect((await debugAnswer({ detail: 'raw' }, async () => view, () => 0)).content[0].text).toBe('<x/>');
  });
  it("a conflict is a tool error with SAP's message", async () => {
    const r = await debugStateAnswer({}, async () => { throw new DebugListenerError('Another debugger … SY 530'); });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
  });
  it('the handle survives every detail: merged under terse and full, a block of its own under raw', async () => {
    const view = { value: { state: 'listening' }, raw: '<x/>' };
    for (const detail of ['terse', 'full']) {
      const r = await debugAnswer({ detail }, async () => view, (v) => v, (v) => v, () => ({ state_handle: 'H' }));
      expect(JSON.parse(r.content[0].text)).toMatchObject({ state_handle: 'H' });
    }
    const raw = await debugAnswer({ detail: 'raw' }, async () => view, (v) => v, (v) => v, () => ({ state_handle: 'H' }));
    expect(raw.content[0].text).toBe('<x/>');
    expect(JSON.parse(raw.content[1].text)).toEqual({ state_handle: 'H' });
  });
  it('extra fields (handle, ids) join a state', async () => {
    const r = await debugStateAnswer({}, async () => ({ state: 'listening' }), () => ({ state_handle: 'H' }));
    expect(JSON.parse(r.content[0].text)).toEqual({ state: 'listening', state_handle: 'H' });
  });
});
```

```ts
// src/__tests__/unit/debugger/baseMcpServerState.test.ts
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { MockAbapConnection } from '../../../embeddable/MockAbapConnection';

const make = () => new EmbeddableMcpServer({ connection: new MockAbapConnection() as any, exposition: ['readonly'] } as any);

describe('the server instance owns its state', () => {
  it('two instances, two handles; nothing held at first; dispose with nothing held resolves', async () => {
    const a = make(); const b = make();
    expect(a.stateHandle).not.toBe(b.stateHandle);
    expect(a.holdsState()).toBe(false);
    await expect(a.dispose()).resolves.toBeUndefined();
  });
  it('the debugger is created once, on first use, and attached to the state', () => {
    const a = make();
    const d1 = (a as any).debuggerFor();
    expect((a as any).debuggerFor()).toBe(d1);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/state/ src/__tests__/unit/debugger/access.test.ts src/__tests__/unit/debugger/answer.test.ts src/__tests__/unit/debugger/ports.test.ts src/__tests__/unit/debugger/baseMcpServerState.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement `InstanceState`**

```ts
// src/lib/state/InstanceState.ts
/**
 * The state an MCP server instance holds between tool calls, and its handle.
 *
 * Generic on purpose: the host keeps instances by this handle (MCP SEP-2567 —
 * no protocol session; state named by an explicit handle), whatever the state
 * is. The debugger is one part; locks will be another. Nothing expires here.
 */
import { randomBytes } from 'node:crypto';

export interface StateDescription { kind: string; [field: string]: unknown }
/** pending: cleanup is still finishing on its own (an AMDP session waits for its last event batch). failures: what a cleanup could not undo, kept for a retry. */
export interface StatePart { holdsState(): boolean; pending(): boolean; failures(): string[]; dispose(): Promise<void>; describe(): StateDescription[]; observe(onChange: () => void): void }
export interface StateHost {
  readonly owner: string | null;
  reserve(kind: string, handle: string): string | undefined;
  peers(): Array<{ state_handle: string; states: StateDescription[] }>;
}
export class StateUnavailableError extends Error {
  constructor() { super('state is not available'); }
}

const newHandle = () => randomBytes(16).toString('hex').toUpperCase();

export class InstanceState {
  private current = newHandle();
  private readonly parts: StatePart[] = [];
  private readonly emptyListeners: Array<() => void> = [];
  private wasHolding = false;
  private endRequested = false;
  host?: StateHost;

  get handle(): string { return this.current; }

  attach(part: StatePart): void {
    this.parts.push(part);
    part.observe(() => this.changed());
    this.changed();                                  // sample a part that already holds
  }

  holdsState(): boolean { return this.parts.some((p) => p.holdsState()); }
  pending(): boolean { return this.parts.some((p) => p.pending()); }
  failures(): string[] { return this.parts.flatMap((p) => p.failures()); }
  kindsHeld(): string[] { return [...new Set(this.parts.flatMap((p) => p.describe().map((d) => d.kind)))]; }
  describe() { return { state_handle: this.current, states: this.parts.flatMap((p) => p.describe()) }; }

  admit(kind: string): void {
    if (!this.host) return;                          // stdio, SSE: one instance per session
    if (this.host.owner === null) throw new Error('this request carries no identity to keep state under');
    const holder = this.host.reserve(kind, this.current);
    if (holder && holder !== this.current) throw new Error(`a ${kind} debug session is already open: state_handle ${holder}`);
  }

  check(handle: unknown): void {
    if (typeof handle !== 'string' || handle !== this.current || !this.holdsState()) throw new StateUnavailableError();
  }

  endWhenEmpty(): void {
    this.endRequested = true;
    this.changed();
  }

  onEmpty(listener: () => void): void { this.emptyListeners.push(listener); }

  private readonly changeListeners = new Set<() => void>();
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Every transition goes through here; state is updated before anyone is told. */
  private changed(): void {
    const holding = this.holdsState();
    const emptied = this.wasHolding && !holding;
    this.wasHolding = holding;
    if (!holding && this.endRequested) {
      this.endRequested = false;
      this.current = newHandle();                    // the old handle is invalid for good
    }
    if (emptied) for (const l of this.emptyListeners) l();
    for (const l of [...this.changeListeners]) l();
  }

  async dispose(): Promise<void> {
    const results = await Promise.allSettled(this.parts.map((p) => p.dispose()));
    this.changed();
    const failures = results.flatMap((r) => (r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
    if (failures.length) throw new Error(failures.join('; '));
  }

  settled(): Promise<void> {
    const done = () => !this.holdsState() || !this.pending();
    if (done()) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.onChange(() => { if (done()) { off(); resolve(); } });
    });
  }

  /**
   * What every host does before it lets an instance go (stdio at exit, SSE
   * when a session closes, the pool at shutdown): dispose; wait until settled —
   * a disposal that threw may still have cleanup finishing on its own; once
   * more what is still held; settle; answer what is left. No timer: an AMDP
   * session settles when its last event batch arrives (measured in Task 14).
   */
  async shutdown(): Promise<string[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.dispose().catch(() => undefined);
      await this.settled();
      if (!this.holdsState()) return [];
    }
    return [this.failures().join('; ') || 'state is still held'];
  }
}
```

`src/lib/state/index.ts` re-exports it. Add a `./state` export to `package.json` the same way as `./debugger`.

- [ ] **Step 4: Implement the debugger side**

```ts
// src/lib/debugger/ports.ts
import { AbapDebugger, AdtExecutor, AmdpDebugger, getSystemInformation, type IDebuggerListenerConflict } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import { closeQuietly, openFreshConnection } from '../packageSessions';
import { getRequestContext } from '../requestContext';
import { ourClassExecutor, ourProgramExecutor } from '../strategies/resultSets';
import type { AmdpSessionPorts } from './AmdpSession';
import type { DebugSessionPorts, RunOutcome, RunTarget } from './DebugSession';

/** The user whose requests are caught: what the system says, else the login — never the responsible. */
export async function requestUserOf(connection: IAbapConnection): Promise<string> {
  const info = await getSystemInformation(connection);
  const user = info?.userName || getRequestContext()?.login || process.env.SAP_USERNAME;
  if (!user) throw new Error('the ABAP user of this connection is unknown: the system names none and no login is configured');
  return user.trim().toUpperCase();
}

async function openStateful(context: HandlerContext): Promise<IAbapConnection> {
  const connection = await openFreshConnection(context.connection, context.logger);
  (connection as { setSessionType?: (t: 'stateful' | 'stateless') => void }).setSessionType?.('stateful');
  return connection;
}

async function run(connection: IAbapConnection, target: RunTarget): Promise<RunOutcome> {
  const executor = new AdtExecutor(connection);
  const answer = target.kind === 'class'
    ? await executor.getClassExecutor(ourClassExecutor).run({ className: target.name }, { analyse: analyseException })
    : await executor.getProgramExecutor(ourProgramExecutor).run({ programName: target.name }, { analyse: analyseException });
  return answer.ok ? { ok: true, output: String(answer.getResult().value ?? '') } : { ok: false, message: answer.getError().message };
}

export function liveDebugPorts(): DebugSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: (c) => closeQuietly(c, undefined, 'debugger connection'),
    abapDebugger: (c, onConflict: IDebuggerListenerConflict) => new AbapDebugger(c, undefined, undefined, { onConflict }),
    requestUser: (context) => requestUserOf(context.connection),
    run,
  };
}

export function liveAmdpPorts(): AmdpSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: (c) => closeQuietly(c, undefined, 'AMDP debugger connection'),
    amdpDebugger: (c) => new AmdpDebugger(c),
    requestUser: (context) => requestUserOf(context.connection),
    run,
  };
}
```


Check the `run({…}, {analyse})` shape against `handleRuntimeRunClass.ts:146-156` / `handleRuntimeRunProgram.ts:107-119`, and the root exports with `grep -n "AbapDebugger\|AdtExecutor\|getSystemInformation\|AmdpDebugger" node_modules/@mcp-abap-adt/adt-clients/dist/index.d.ts`. Import anything missing from `/runtime` or `/core`. If `getSystemInformation` throws on a 404 instead of answering `null`, map only the not-found case to `null`; let authentication and network failures through. `closeQuietly` is right here: the connector's `disconnect()` never throws by contract, so there is no close failure to report.

```ts
// src/lib/debugger/DebuggerInstance.ts
import type { HandlerContext } from '../../handlers/interfaces';
import type { StateDescription, StatePart } from '../state/InstanceState';
import { AmdpSession } from './AmdpSession';
import { DebugCleanupError, DebugSession } from './DebugSession';
import { type DebuggerIds, resolveDebuggerIds } from './ids';
import { liveAmdpPorts, liveDebugPorts } from './ports';

/** One server instance's debugger — a part of its state: both kinds, the SAP ids. */
export class DebuggerInstance implements StatePart {
  readonly abap: DebugSession<HandlerContext>;
  readonly amdp: AmdpSession<HandlerContext>;
  constructor(sessions: { abap: DebugSession<HandlerContext>; amdp: AmdpSession<HandlerContext> }) {
    this.abap = sessions.abap;
    this.amdp = sessions.amdp;
  }
  holdsState(): boolean { return this.abap.holdsState() || this.amdp.holdsState(); }
  pending(): boolean { return this.amdp.pending(); }
  failures(): string[] { return [...this.abap.failures(), ...this.amdp.failures()]; }
  observe(onChange: () => void): void { this.abap.observe(onChange); this.amdp.observe(onChange); }
  describe(): StateDescription[] {
    const ids = { terminal_id: this.abap.ids.terminalId, ide_id: this.abap.ids.ideId };
    return [
      ...(this.abap.holdsState() ? [{ ...this.abap.describe(), ...ids }] : []),
      ...(this.amdp.holdsState() ? [this.amdp.describe()] : []),
    ];
  }
  async stop(): Promise<void> {
    const results = await Promise.allSettled([this.abap.stop(), this.amdp.stop()]);
    const failures = results.flatMap((r) => (r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
    if (failures.length) throw new DebugCleanupError(failures.join('; '));
  }
  dispose(): Promise<void> { return this.stop(); }
}

export function createDebuggerInstance(ids: DebuggerIds & { stated: boolean } = resolveDebuggerIds()): DebuggerInstance {
  return new DebuggerInstance({ abap: new DebugSession(liveDebugPorts(), ids), amdp: new AmdpSession(liveAmdpPorts()) });
}
```

```ts
// src/lib/debugger/access.ts
import type { HandlerContext } from '../../handlers/interfaces';
import type { DebuggerInstance } from './DebuggerInstance';

/** create: a starting tool — the kind is admitted (identity, per-owner slot); use: the handle must be this instance's with state held. */
export function requireDebugger(context: HandlerContext, args: unknown, mode: { create: 'abap' | 'amdp' } | 'use'): DebuggerInstance {
  if (!context.state || !context.debugger) throw new Error('debugging is not served by this server');
  if (mode === 'use') context.state.check((args as { state_handle?: unknown } | undefined)?.state_handle);
  else context.state.admit(mode.create);
  const instance = context.debugger();
  instance.abap.bind(context);
  instance.amdp.bind(context);
  return instance;
}
```

```ts
// src/lib/debugger/answer.ts
import type { McpResult } from '../answer';
import { detailOf } from '../strategies/detail';
import { return_error } from '../utils';
import type { DebugState, DebugView } from './DebugSession';
import { terseStop } from './readings';

const asText = (value: unknown) => ({ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) });

/**
 * terse / full / raw of one reading. `extraOf` — the handle and the SAP ids a
 * start answers — joins every detail: merged into terse and full, and as a
 * block of its own beside SAP's document under raw, so no detail loses it.
 */
export async function debugAnswer<T>(
  args: unknown,
  work: () => Promise<DebugView<T>>,
  terse: (v: T) => unknown,
  full: (v: T) => unknown = (v) => v,
  extraOf: () => Record<string, unknown> = () => ({}),
): Promise<McpResult> {
  try {
    const view = await work();
    const extra = extraOf();
    const detail = detailOf(args);
    if (detail === 'raw') {
      return { isError: false, content: [asText(view.raw), ...(Object.keys(extra).length ? [asText(extra)] : [])] };
    }
    const projected = detail === 'full' ? full(view.value) : terse(view.value);
    const merged = Object.keys(extra).length && projected && typeof projected === 'object' && !Array.isArray(projected)
      ? { ...(projected as Record<string, unknown>), ...extra }
      : Object.keys(extra).length ? { value: projected, ...extra } : projected;
    return { isError: false, content: [asText(merged)] };
  } catch (error) {
    return return_error(error) as McpResult;
  }
}

export async function debugStateAnswer(args: unknown, work: () => Promise<DebugState>, extraOf: () => Record<string, unknown> = () => ({})): Promise<McpResult> {
  return debugAnswer(
    args,
    async () => {
      const state = await work();
      const raw = state.state === 'stopped' ? [state.stop.raw.debuggee, state.stop.raw.attach, state.stop.raw.stack].join('\n') : JSON.stringify(state);
      return { value: state, raw };
    },
    (s) => (s.state === 'stopped' ? { state: 'stopped', ...terseStop(s.stop.debuggee, s.stop.stack), ...(s.stop.stackError ? { stack_error: s.stop.stackError } : {}) } : s),
    (s) => s,
    extraOf,
  );
}
```


`schemas.ts`, complete. Every description states only the function:

```ts
// src/lib/debugger/schemas.ts
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import type { AmdpBreakpoint } from './AmdpSession';
import type { RunTarget } from './DebugSession';
import { type BreakpointTarget, lineUriOf } from './objectUri';

export const USER_MODE_SENTENCE = 'Catches every request of the connected SAP user, not only programs run by this server.';
export const TAKE_OVER_SENTENCE = 'Displaces another debugger listening for the same user.';

export const STATE_HANDLE_PROPERTY = {
  state_handle: { type: 'string', description: 'Opaque handle identifying the server-held state this operation works on.' },
} as const;

export const HOLD_SECONDS_PROPERTY = {
  hold_seconds: { type: 'number', default: 10, description: 'Longest wait for a change, at most 30 seconds.' },
} as const;

const LINE_PROPERTIES = {
  object_type: { type: 'string', description: 'For a line: CLAS, PROG, INCL or FUNC.' },
  object_name: { type: 'string', description: 'For a line: the object holding it.' },
  line: { type: 'number', description: 'For a line: the line in the object source.' },
  include: { type: 'string', description: 'For a class: definitions, implementations, macros or testclasses; the main source when omitted.' },
  parent_name: { type: 'string', description: 'For a function module: its function group.' },
} as const;
export const LINE_TARGET_PROPERTIES = LINE_PROPERTIES;

export const BREAKPOINTS_PROPERTY = {
  breakpoints: {
    type: 'array',
    description: 'Breakpoints: a line, an exception class, an ABAP statement or a message; each with an optional condition.',
    items: {
      type: 'object',
      properties: {
        ...LINE_PROPERTIES,
        exception_class: { type: 'string', description: 'Stops where an exception of this class is raised.' },
        statement: { type: 'string', description: 'Stops at every ABAP statement of this keyword.' },
        message: {
          type: 'object',
          description: 'Stops where this message is sent: message class, number, type.',
          properties: { id: { type: 'string' }, number: { type: 'string' }, type: { type: 'string' } },
        },
        condition: { type: 'string', description: 'Stops only when this ABAP condition holds.' },
      },
    },
  },
} as const;

export const AMDP_BREAKPOINTS_PROPERTY = {
  breakpoints: {
    type: 'array',
    description: 'Lines in SQLScript methods of a class.',
    items: {
      type: 'object',
      properties: { class_name: { type: 'string' }, line: { type: 'number', description: 'Line in the class source.' } },
      required: ['class_name', 'line'],
    },
  },
} as const;

export const RUN_PROPERTY = {
  run: {
    type: 'object',
    description: 'A class (as a console application) or a report started in the background once listening; its outcome is reported as the end of the session.',
    properties: { kind: { type: 'string', enum: ['class', 'program'] }, name: { type: 'string' } },
    required: ['kind', 'name'],
  },
} as const;

export function breakpointsFromArgs(raw: unknown): IDebuggerBreakpoint[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('breakpoints: give at least one');
  return raw.map((b: any, i) => {
    const condition = b?.condition ? { condition: String(b.condition) } : {};
    if (b?.exception_class) return { kind: 'exception', exceptionClass: String(b.exception_class).toUpperCase(), ...condition };
    if (b?.statement) return { kind: 'statement', statement: String(b.statement).toUpperCase(), ...condition };
    if (b?.message) return { kind: 'message', msgId: String(b.message.id).toUpperCase(), msgNo: String(b.message.number), msgTy: String(b.message.type).toUpperCase(), ...condition };
    if (b?.object_type && b?.object_name && Number.isInteger(b?.line)) return { kind: 'line', uri: lineUriOf(b as BreakpointTarget, b.line), ...condition };
    throw new Error(`breakpoints[${i}]: a line needs object_type, object_name and line; or exception_class, statement or message`);
  });
}

export function amdpBreakpointsFromArgs(raw: unknown): AmdpBreakpoint[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('breakpoints: give at least one');
  return raw.map((b: any, i) => {
    if (!b?.class_name || !Number.isInteger(b?.line)) throw new Error(`breakpoints[${i}]: class_name and line`);
    return { class_name: String(b.class_name), line: Number(b.line) };
  });
}

export function runFromArgs(raw: unknown): RunTarget | undefined {
  if (!raw) return undefined;
  const r = raw as { kind?: string; name?: string };
  if ((r.kind !== 'class' && r.kind !== 'program') || !r.name) throw new Error('run: kind (class or program) and name');
  return { kind: r.kind, name: r.name.trim().toUpperCase() };
}
```


```ts
// src/lib/debugger/index.ts
export * from './access';
export * from './AmdpSession';
export * from './amdpReadings';
export * from './answer';
export * from './DebuggerInstance';
export * from './DebugSession';
export * from './ids';
export * from './memoryReadings';
export * from './objectUri';
export * from './ports';
export * from './readings';
export * from './schemas';
export * from './serial';
```

- [ ] **Step 5: Wire the server instance**

`src/handlers/interfaces.ts`: add `state?: InstanceState` and `debugger?: () => DebuggerInstance` to `HandlerContext` (type imports from `../lib/state/InstanceState` and `../lib/debugger/DebuggerInstance`).

`src/embeddable/BaseMcpServer.ts`:

```ts
  /** What this instance holds between tool calls, and its handle (MCP SEP-2567). */
  readonly state = new InstanceState();
  private debuggerInstance?: DebuggerInstance;

  /** Created on first use inside a call's scope, so stated ids are read there; attached to the state. */
  protected debuggerFor(): DebuggerInstance {
    if (!this.debuggerInstance) {
      this.debuggerInstance = createDebuggerInstance();
      this.state.attach(this.debuggerInstance);
    }
    return this.debuggerInstance;
  }
  get stateHandle(): string { return this.state.handle; }
  holdsState(): boolean { return this.state.holdsState(); }
  /** Undoes what the instance holds; awaited by every host before it lets the instance go. */
  dispose(): Promise<void> { return this.state.dispose(); }
  /** Dispose, settle, once more, settle — what a host awaits before letting the instance go; what is left. */
  shutdownState(): Promise<string[]> { return this.state.shutdown(); }

  private readonly inFlight = new Set<Promise<unknown>>();
  /** Resolves when every tool handler of this instance has settled — a host releases the instance only then. */
  async idle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight]);
  }
```

Where the context is built (l.257-261), add `state: this.state, debugger: () => this.debuggerFor()`. In the same `wrappedHandler`, track the whole call from its entry — before `await this.getConnection()` and the context's resolution — so `idle()` cannot miss a call that is still acquiring its connection:

```ts
          const wrappedHandler = (args: unknown) => {
            const call = (async () => { /* the existing body, unchanged */ })();
            this.inFlight.add(call);
            void call.finally(() => this.inFlight.delete(call));
            return call;
          };
```

Add to `baseMcpServerState.test.ts`, through a connected `InMemoryTransport` pair from the SDK:
- `idle()` stays pending while a tool handler awaits a gate, and resolves after it opens;
- `idle()` stays pending while a call is still acquiring its connection: a subclass whose `getConnection()` awaits a gate.

`package.json`: add the `./debugger` and `./state` exports after `./compact-shared` (`types`/`import`/`require` → `./dist/lib/<dir>/index.{d.ts,js}`), and both under `typesVersions["*"]`.

Add both subpaths to the places that resolve lib's subpaths, so the server and compact packages and the tests reach them the way they reach `@mcp-abap-adt/lib/handlers`:
- the jest `moduleNameMapper` in the root `package.json`: `"^@mcp-abap-adt/lib/debugger$": "<rootDir>/src/lib/debugger/index.ts"` and `"^@mcp-abap-adt/lib/state$": "<rootDir>/src/lib/state/index.ts"`;
- the jest `moduleNameMapper` in `server/package.json` (its own config, l.95-104; the server's tests run from `server/` with `npx jest`): `"^@mcp-abap-adt/lib/debugger$": "<rootDir>/../src/lib/debugger/index.ts"` and `"^@mcp-abap-adt/lib/state$": "<rootDir>/../src/lib/state/index.ts"`;
- `paths` in `server/tsconfig.json` and `compact/tsconfig.json`: `"@mcp-abap-adt/lib/debugger": ["../dist/lib/debugger/index.d.ts"]` and `"@mcp-abap-adt/lib/state": ["../dist/lib/state/index.d.ts"]`.

- [ ] **Step 6: Run the folders, the type check and the build**

Run: `npx jest src/__tests__/unit/state/ src/__tests__/unit/debugger/ && npm run test:check && npm run build`
Expected: PASS, no type errors, clean build.

- [ ] **Step 7: Commit**

```bash
git add src/lib/state/ src/lib/debugger/ src/handlers/interfaces.ts src/embeddable/BaseMcpServer.ts package.json src/__tests__/unit/
git commit -m "feat(state): the server instance owns its state and handle; the debugger is its first part"
```

---

### Task 8: The `debug` exposition set; disposal on stdio and SSE

**Files:**
- Create: `src/lib/handlers/groups/DebugHandlersGroup.ts` (its `getHandlers()` returns `[]` for now; Tasks 10–12 fill it)
- Modify:
  - `src/lib/handlers/groups/index.ts`
  - `src/lib/config/IServerConfig.ts:30`
  - `src/lib/config/ServerConfigManager.ts:213-226` and its help text
  - `src/lib/config/yamlConfig.ts:385-390`
  - `src/lib/handlers/HandlerExporter.ts` (`includeDebug`, default `false`)
  - `scripts/list-tools.ts`
  - `server/src/launcher.ts:519-560` (the group), `:613-620` (stdio shutdown) and the help text near l.165
  - `server/src/SseServer.ts:388-389` (dispose on close) and its `stop()`
- Test: `src/__tests__/unit/debugger/exposition.test.ts`, `server/src/__tests__/sseDispose.test.ts`

**Interfaces:**
- Produces:
  - `type HandlerSet = 'readonly' | 'high' | 'low' | 'compact' | 'debug'`;
  - `DebugHandlersGroup` (`groupName = 'DebugHandlers'`);
  - `HandlerExporterOptions.includeDebug?: boolean`.
- Consumes: `BaseMcpServer.dispose()` (Task 7).

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/exposition.test.ts
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';

describe('the debug set', () => {
  it('is a handler set of its own', () => {
    expect(new DebugHandlersGroup({ connection: undefined } as any).getName()).toBe('DebugHandlers');
  });
  it('HandlerExporter leaves it out unless asked, and gives it when asked', () => {
    const names = (o: any) => new HandlerExporter(o).getHandlerEntries().map((e) => e.toolDefinition.name);
    expect(names({}).some((n: string) => /^(Debug|AmdpDebug|MemorySnapshot)/.test(n))).toBe(false);
    // the group is filled in Tasks 10-12; this assertion is tightened there to the tool names
    expect(() => names({ includeDebug: true })).not.toThrow();
  });
});
```

Add a `--exposition=readonly,debug` case beside the existing exposition parser tests. Find them with `grep -rln "parseExposition\|--exposition" src/__tests__/unit` and copy their setup. Expected: `['readonly', 'debug']`.

```ts
// server/src/__tests__/sseDispose.test.ts — the SSE session's instance is disposed when the connection closes
```

`SseServer` builds its `SessionServer` in a private method. Look at how the existing SSE tests drive it: `ls server/src/__tests__ | grep -i sse`. Using the same harness, open a GET, spy on `BaseMcpServer.prototype.shutdownState` (resolve it by hand), close the response, and expect it called once. Then check that `stop()` is still pending until that promise resolves, and that a non-empty answer makes `stop()` reject with it. If no SSE harness exists, put the close handling and `stop()`'s collection in a small exported class (`SessionClosings`: `track(id, server)`, `drain(): Promise<string[]>`) used by `SseServer`, and unit-test it with fake servers whose `shutdownState` you resolve by hand.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/exposition.test.ts && (cd server && npx jest src/__tests__/sseDispose.test.ts)`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/handlers/groups/DebugHandlersGroup.ts
import { BaseHandlerGroup } from '../base/BaseHandlerGroup';
import type { HandlerEntry } from '../interfaces';

/**
 * The debugger tools — opt-in (`--exposition=…,debug`): a breakpoint catches
 * every request of the connected SAP user. Their state lives in the server
 * instance (`HandlerContext.debugger`).
 */
export class DebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'DebugHandlers';
  getHandlers(): HandlerEntry[] {
    return [];
  }
}
```

Config and exporter:
- Export the group from `groups/index.ts`.
- `HandlerSet` gains `'debug'`.
- `parseExposition` lets `'debug'` through, and so does the YAML whitelist.
- The help text lists `debug — the debugger tools; opt-in`.
- `HandlerExporter` gains `includeDebug?: boolean`, with the doc comment «Debugger tools (default false): opt-in; they catch every request of the SAP user». After the search group, it adds the debug group when `options?.includeDebug === true`.
- `scripts/list-tools.ts` gains `debug: new DebugHandlersGroup(ctx)`.

`server/src/launcher.ts`:

```ts
  if (exposition.includes('debug')) {
    overridingGroups.push(new DebugHandlersGroup(baseContext));
  }
```

Add this beside the `high`/`low` pushes (l.528-533). `DebugHandlersGroup` is imported from `@mcp-abap-adt/lib/handlers` like the other groups (l.26); export it from `src/lib/handlers/index.ts` through `groups/index.ts`. Add `statefulGroups?: (context: HandlerContext) => IHandlerGroup[]` to `LauncherOptions` for compact (Task 13), and push those groups the same way.

stdio shutdown (l.613-620): `servers: [{ close: async () => { const left = await server.shutdownState(); if (left.length) throw new Error(`state cleanup failed: ${left.join('; ')}`); } }]`, where `server` is the `StdioServer` (a `BaseMcpServer`). `installShutdown` reports a rejected close and exits with 1. A disposal that threw while AMDP cleanup was still finishing is waited for, retried once, and only then reported (`InstanceState.shutdown`).

`server/src/SseServer.ts`, where the connection closes (l.388-389):

```ts
      this.sessions.delete(sessionId);
      // The session's instance is owned until its state is gone: it settles on its own (an AMDP
      // session when its last event batch arrives); stop() waits for it.
      const closing = server.shutdownState().then((left) => {
        if (left.length) this.logger.error?.(`[SSE CLOSE] state cleanup for session ${sessionId} left: ${left.join('; ')}`);
        return left.map((l) => `${sessionId}: ${l}`);
      });
      this.closingSessions.add(closing);
      void closing.finally(() => this.closingSessions.delete(closing));
```

with `private readonly closingSessions = new Set<Promise<string[]>>();` on `SseServer`.

`SseServer.stop()` additionally disposes every open session's server before it resolves:

```ts
    const pending = [...this.closingSessions];
    for (const [id, entry] of this.sessions) {
      pending.push(entry.server.shutdownState().then((left) => left.map((l) => `${id}: ${l}`)));
    }
    this.sessions.clear();
    const failures = (await Promise.all(pending)).flat();
    if (failures.length) throw new Error(`state cleanup failed: ${failures.join('; ')}`);
```

Add that after the listener stops, keeping the existing body. The launcher's SSE `installShutdown` (l.643-649) already awaits `server.stop()`.

- [ ] **Step 4: Run them and see them pass; run the ratchets (the group is still empty)**

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts && (cd server && npx jest)`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/handlers/ src/lib/config/ scripts/list-tools.ts server/src/ src/__tests__/unit/debugger/exposition.test.ts
git commit -m "feat(debugger): opt-in debug set; stdio disposes at shutdown, SSE when its session closes"
```

---

### Task 9: `InstancePool` — Streamable HTTP keeps the instance that holds state

The pool is the host's one mechanism for continuity (spec D9). It knows `stateHandle`, `holdsState()`, `dispose()` and `InstanceState`, and nothing about debugging.

**Files:**
- Create: `server/src/InstancePool.ts`
- Modify: `server/src/StreamableHttpServer.ts` (l.164-240: resolve the destination and owner, then take the server from the pool; `stop()`: pool shutdown)
- Test: `server/src/__tests__/InstancePool.test.ts`, `server/src/__tests__/streamableHttpPool.test.ts`

**Interfaces:**
- Consumes: `InstanceState`, `StateHost`, `StateDescription` (Task 7).
- Produces:

```ts
export interface Poolable { readonly state: InstanceState; readonly stateHandle: string; holdsState(): boolean; dispose(): Promise<void> }
export class BatchWithHandleError extends Error {}
export class PoolClosedError extends Error {}
export function handleOf(body: unknown): string | undefined;   // single tools/call only; a batch carrying one is refused
export class InstancePool<T extends Poolable> {
  serve(request: { handle?: string; owner: string | null }, create: () => T, work: (instance: T) => Promise<void>): Promise<void>;
  size(): number;
  shutdown(): Promise<string[]>;   // stop admission, drain the leases, dispose every held instance; what failed
}
```

**What `serve` does, once per request (one stateless MCP session):**
1. It takes the held instance the handle names when the owner matches; otherwise it creates a new one. Both an unknown handle and another owner's handle get a new instance, and the tool on it answers `state is not available`.
2. It lends the instance a `StateHost` for this owner, whose `owner`, `reserve` and `peers` come from the pool's owner index.
3. It runs `work` under the instance's lease, one transport at a time. A queued request revalidates the entry when its turn comes; if the instance left the pool meanwhile, it gets a new one.
4. Afterwards it keeps the instance under its current handle if it holds state; otherwise it disposes it and releases its reservations.

An instance that stops holding state asynchronously (`onEmpty`) is evicted and disposed by the pool, without waiting for a request. A disposal failure is kept and reported by `shutdown()`.

**Owner** (D9, D15). A handle is no key, so the owner is proven by the request's own credentials:
- **destination request:** `dest:<destination>`;
- **`x-sap-*` basic request:** `basic:` + HMAC-SHA256 of `<url>|<client>|<login>|<password>`, keyed by `this.ownerSecret = randomBytes(32)`, generated when the server starts and never stored or logged;
- **`x-sap-*` token request:** `user:` + `<url>|<client>|<SAP user>`, where the SAP user is what `getSystemInformation` answers on a connection built from this request's token. SAP verifies the token; the unverified claim is never used. `ownerOf` caches the user by SHA-256 of the token in a `Map` on the server object, with no timer. A refreshed token of the same user resolves to the same owner;
- **neither**, or a token SAP refuses: `null`, and a state-creating call refuses (`InstanceState.admit`).

- [ ] **Step 1: Write the failing pool tests**

```ts
// server/src/__tests__/InstancePool.test.ts
import { InstanceState } from '@mcp-abap-adt/lib/state';
import { BatchWithHandleError, handleOf, InstancePool, PoolClosedError } from '../InstancePool';

/** A poolable whose one part we drive by hand. */
class Fake {
  readonly state = new InstanceState();
  held = false;
  disposed = 0;
  failDispose = false;
  finishLater = false;        // dispose resolves while the part still holds (AMDP closing)
  notifyInDispose = false;    // the part tells the state synchronously from inside dispose
  finishing = false;          // the part's cleanup is still running on its own
  lateFailures: string[] = [];
  throwWhileFinishing = false; // dispose throws, while its cleanup goes on finishing (AMDP: a refused clear, the last batch pending)
  private notify: () => void = () => {};
  constructor(readonly n: number) {
    this.state.attach({
      holdsState: () => this.held,
      pending: () => this.finishing,
      failures: () => this.lateFailures,
      dispose: async () => {
        this.disposed++;
        if (this.throwWhileFinishing) { this.throwWhileFinishing = false; this.finishing = true; throw new Error('clear refused'); }
        if (this.failDispose) throw new Error('listener still up');
        if (this.lateFailures.length) return;                       // a retry that cannot undo it either: still held, not finishing
        if (this.finishLater) { this.finishLater = false; this.finishing = true; return; }
        this.held = false;
        if (this.notifyInDispose) this.notify();
      },
      describe: () => (this.held ? [{ kind: 'abap' }] : []),
      observe: (f) => { this.notify = f; },
    });
  }
  set(v: boolean) { this.held = v; if (!v) this.finishing = false; this.notify(); }
  /** The cleanup finished on its own but could not undo everything. */
  failLate(message: string) { this.finishing = false; this.lateFailures = [message]; this.notify(); }
  get stateHandle() { return this.state.handle; }
  holdsState() { return this.state.holdsState(); }
  dispose() { return this.state.dispose(); }
}

let n = 0;
const create = () => new Fake(++n);
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
const tick = () => new Promise((r) => setImmediate(r));

describe('handleOf', () => {
  it('reads state_handle from a single tools/call only; refuses a batch carrying one', () => {
    expect(handleOf({ method: 'tools/call', params: { arguments: { state_handle: 'H' } } })).toBe('H');
    expect(handleOf({ method: 'tools/list' })).toBeUndefined();
    expect(() => handleOf([{ method: 'tools/call', params: { arguments: { state_handle: 'H' } } }])).toThrow(BatchWithHandleError);
    expect(handleOf([{ method: 'tools/list' }])).toBeUndefined();
  });
});

describe('InstancePool', () => {
  async function holding(pool: InstancePool<Fake>, owner = 'A') {
    let inst!: Fake;
    await pool.serve({ owner }, create, async (i) => { inst = i; i.set(true); });
    return inst;
  }

  it('keeps an instance that holds state under its handle; the next request with it gets the same instance', async () => {
    const pool = new InstancePool<Fake>();
    const first = await holding(pool);
    let second!: Fake;
    await pool.serve({ handle: first.stateHandle, owner: 'A' }, create, async (i) => { second = i; });
    expect(second).toBe(first);
  });

  it('disposes an instance that holds nothing', async () => {
    const pool = new InstancePool<Fake>();
    let i0!: Fake;
    await pool.serve({ owner: 'A' }, create, async (i) => { i0 = i; });
    expect(pool.size()).toBe(0);
    expect(i0.disposed).toBe(1);
  });

  it('another owner, or an unknown handle, gets a fresh instance', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    for (const req of [{ handle: held.stateHandle, owner: 'B' }, { handle: 'NOPE', owner: 'A' }]) {
      let got!: Fake;
      await pool.serve(req, create, async (i) => { got = i; });
      expect(got).not.toBe(held);
    }
  });

  it('serves one instance one request at a time; a queued request whose instance left the pool gets a new one', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const g = gate();
    const order: string[] = [];
    let second!: Fake;
    const a = pool.serve({ handle: held.stateHandle, owner: 'A' }, create, async (i) => { order.push('a-in'); await g.p; i.set(false); order.push('a-out'); });
    const b = pool.serve({ handle: held.stateHandle, owner: 'A' }, create, async (i) => { order.push('b-in'); second = i; });
    await tick();
    expect(order).toEqual(['a-in']);
    g.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['a-in', 'a-out', 'b-in']);
    expect(second).not.toBe(held);          // `a` emptied it: it left the pool before `b`'s turn
  });

  it('an instance that empties on its own is evicted and disposed without a request', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.set(false);
    await tick();
    expect(pool.size()).toBe(0);
    expect(held.disposed).toBe(1);
  });

  it('the per-owner slot: a second start of the kind is told the holder; peers lists the owner states', async () => {
    const pool = new InstancePool<Fake>();
    let firstHandle = '';
    await pool.serve({ owner: 'A' }, create, async (i) => { i.state.admit('abap'); i.set(true); firstHandle = i.stateHandle; });
    await pool.serve({ owner: 'A' }, create, async (i) => {
      expect(() => i.state.admit('abap')).toThrow(firstHandle);
      expect(i.state.host!.peers().map((p) => p.state_handle)).toContain(firstHandle);
    });
    await pool.serve({ owner: 'B' }, create, async (i) => { expect(() => i.state.admit('abap')).not.toThrow(); });
  });

  it('a reservation in progress holds the slot: a concurrent start of the owner is told the holder', async () => {
    const pool = new InstancePool<Fake>();
    const g = gate();
    let firstHandle = '';
    const first = pool.serve({ owner: 'A' }, create, async (i) => { i.state.admit('abap'); firstHandle = i.stateHandle; await g.p; i.set(true); });
    await tick();
    await pool.serve({ owner: 'A' }, create, async (i) => { expect(() => i.state.admit('abap')).toThrow(firstHandle); });
    g.open();
    await first;
  });

  it('a failed start releases its slot', async () => {
    const pool = new InstancePool<Fake>();
    await pool.serve({ owner: 'A' }, create, async (i) => { i.state.admit('abap'); /* nothing held: the start failed */ });
    await pool.serve({ owner: 'A' }, create, async (i) => { expect(() => i.state.admit('abap')).not.toThrow(); });
  });

  it('an instance emptied during its own request is disposed once, after the request', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    let disposedDuringWork = -1;
    await pool.serve({ handle: held.stateHandle, owner: 'A' }, create, async (i) => { i.set(false); await tick(); disposedDuringWork = i.disposed; });
    expect(disposedDuringWork).toBe(0);
    expect(held.disposed).toBe(1);
    expect(pool.size()).toBe(0);
  });

  it('a disposal that fails keeps the instance; shutdown retries and reports what still failed', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.failDispose = true;
    held.set(false);                                  // empties: eviction runs and fails
    await tick();
    expect(pool.size()).toBe(1);                      // kept for a retry
    held.failDispose = false;
    expect(await pool.shutdown()).toEqual([]);        // the retry succeeded
    expect(pool.size()).toBe(0);
  });

  it('a fresh instance whose disposal fails is retained and retried at shutdown', async () => {
    const pool = new InstancePool<Fake>();
    let fresh!: Fake;
    await pool.serve({ owner: 'A' }, () => { fresh = create(); fresh.failDispose = true; return fresh; }, async () => {});
    expect(fresh.disposed).toBe(1);
    fresh.failDispose = false;
    expect(await pool.shutdown()).toEqual([]);
    expect(fresh.disposed).toBe(2);
  });

  it('a disposal that leaves state finishing keeps ownership; shutdown waits for it to empty', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.finishLater = true;                          // dispose resolves, the part empties later
    let done = false;
    const shutting = pool.shutdown().then((f) => { done = true; return f; });
    await tick();
    expect(done).toBe(false);
    held.set(false);                                  // the last batch arrived
    expect(await shutting).toEqual([]);
  });

  it('a cleanup that fails after its disposal returned is retried once and reported; shutdown ends', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.finishLater = true;
    const shutting = pool.shutdown();
    await tick();
    held.failLate('release debuggee D1: busy');     // the last batch arrived; its release failed
    expect(await shutting).toEqual([`${held.stateHandle}: release debuggee D1: busy`]);
    expect(held.disposed).toBe(2);                   // retried once
  });

  it('a disposal that throws while its cleanup is still finishing: shutdown waits for it, then reports only what is left', async () => {
    const pool = new InstancePool<Fake>();
    const a = await holding(pool);
    const b = await holding(pool, 'B');
    a.throwWhileFinishing = true;
    b.throwWhileFinishing = true;
    let done = false;
    const shutting = pool.shutdown().then((f) => { done = true; return f; });
    await tick();
    expect(done).toBe(false);                        // both still finishing
    a.set(false);                                    // a's last batch closed everything
    b.failLate('release debuggee D1: busy');         // b's did not
    expect(await shutting).toEqual([`${b.stateHandle}: release debuggee D1: busy`]);
  });

  it('a request that leaves nothing behind leaves no entry in the pool', async () => {
    const pool = new InstancePool<Fake>();
    await pool.serve({ owner: 'A' }, create, async () => {});
    expect((pool as any).busy.size).toBe(0);
    expect((pool as any).retained.size).toBe(0);
    expect(pool.size()).toBe(0);
  });

  it('a part that empties synchronously inside dispose re-enters the eviction harmlessly: disposed once', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.notifyInDispose = true;   // dispose empties the part and tells the state at once → onEmpty → evict() again
    expect(await pool.shutdown()).toEqual([]);
    expect(held.disposed).toBe(1);
  });

  it('shutdown stops admission, waits for an active lease, disposes held instances and reports failures', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.failDispose = true;
    const g = gate();
    let leaseDone = false;
    const active = pool.serve({ handle: held.stateHandle, owner: 'A' }, create, async () => { await g.p; leaseDone = true; });
    await tick();
    const shutting = pool.shutdown();
    await tick();
    expect(leaseDone).toBe(false);          // still waiting for the lease
    g.open();
    await active;
    expect(await shutting).toEqual([`${held.stateHandle}: listener still up`]);
    await expect(pool.serve({ owner: 'A' }, create, async () => {})).rejects.toThrow(PoolClosedError);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/__tests__/InstancePool.test.ts`
Expected: FAIL, "Cannot find module".

The server imports lib only through its published subpaths (`server/tsconfig.json` `rootDir` is `server/src`). The `@mcp-abap-adt/lib/state` path and jest mapping were added in Task 7. Run `npm run build` before these tests so `dist` holds the state module.

- [ ] **Step 3: Implement the pool**

```ts
// server/src/InstancePool.ts
/**
 * Streamable HTTP keeps the MCP instance that holds state between calls.
 *
 * The transport is stateless — every request is an MCP session of its own —
 * and state lives in an instance (measured for the debugger: a continuous
 * poll, an attach within seconds, the attaching ABAP session; over RFC nothing
 * carries that session to another connection). So per request the host takes
 * an instance once: the one the request's `state_handle` names, when the owner
 * matches, or a new one. One request at a time per instance (the SDK binds one
 * transport). Slots hold the per-owner limit; a reservation in progress counts.
 * An instance that holds nothing is disposed once, after its work; a disposal
 * that fails keeps the instance for a retry. Nothing expires on a clock.
 */
import type { InstanceState, StateDescription, StateHost } from '@mcp-abap-adt/lib/state';

export interface Poolable { readonly state: InstanceState; readonly stateHandle: string; holdsState(): boolean; dispose(): Promise<void> }
export class BatchWithHandleError extends Error { constructor() { super('a JSON-RPC batch cannot carry state_handle'); } }
export class PoolClosedError extends Error { constructor() { super('the server is shutting down'); } }

export function handleOf(body: unknown): string | undefined {
  const one = (m: any): string | undefined =>
    m?.method === 'tools/call' && typeof m?.params?.arguments?.state_handle === 'string' ? m.params.arguments.state_handle : undefined;
  if (Array.isArray(body)) {
    if (body.some((m) => one(m) !== undefined)) throw new BatchWithHandleError();
    return undefined;
  }
  return one(body);
}

interface Held<T> { instance: T; owner: string; tail: Promise<unknown> }
interface Slot<T> { instance: T; pending: boolean }

export class InstancePool<T extends Poolable> {
  private readonly held = new Map<T, Held<T>>();
  private readonly slots = new Map<string, Slot<T>>();          // `${owner}|${kind}`
  private readonly busy = new Map<T, number>();                 // requests working on an instance
  private readonly subscribed = new WeakSet<object>();
  private readonly evicting = new Map<T, Promise<void>>();
  private readonly failed = new Map<T, string>();               // disposal failed: the message
  private readonly retained = new Set<T>();                     // disposal failed or still finishing: owned for shutdown
  private readonly active = new Set<Promise<unknown>>();
  private admitting = true;

  size(): number { return this.held.size; }

  private byHandle(handle: string): Held<T> | undefined {
    for (const entry of this.held.values()) if (entry.instance.stateHandle === handle) return entry;
    return undefined;
  }

  private hostFor(owner: string | null, instance: T): StateHost {
    return {
      owner,
      reserve: (kind) => {
        if (owner === null) return undefined;
        const key = `${owner}|${kind}`;
        const slot = this.slots.get(key);
        const occupied = slot && slot.instance !== instance && (slot.pending || slot.instance.state.kindsHeld().includes(kind));
        if (occupied) return slot.instance.stateHandle;
        this.slots.set(key, { instance, pending: true });
        return undefined;
      },
      peers: () => {
        const mine: Array<{ state_handle: string; states: StateDescription[] }> = [];
        for (const e of this.held.values()) if (e.owner === owner) mine.push(e.instance.state.describe());
        if (!this.held.has(instance) && instance.holdsState()) mine.push(instance.state.describe());
        return mine;
      },
    };
  }

  async serve(request: { handle?: string; owner: string | null }, create: () => T, work: (instance: T) => Promise<void>): Promise<void> {
    if (!this.admitting) throw new PoolClosedError();
    const run = this.route(request, create, work);
    this.active.add(run);
    try { await run; } finally { this.active.delete(run); }
  }

  private route(request: { handle?: string; owner: string | null }, create: () => T, work: (instance: T) => Promise<void>): Promise<void> {
    const entry = request.handle ? this.byHandle(request.handle) : undefined;
    if (!entry || entry.owner !== request.owner) return this.run(create(), request.owner, work);
    const turn = entry.tail.then(() =>
      // Revalidate: the instance may have left the pool, or be leaving it, while this request waited.
      this.held.get(entry.instance) === entry && !this.evicting.has(entry.instance)
        ? this.run(entry.instance, request.owner, work)
        : this.run(create(), request.owner, work),
    );
    entry.tail = turn.catch(() => undefined);
    return turn;
  }

  private async run(instance: T, owner: string | null, work: (instance: T) => Promise<void>): Promise<void> {
    if (!this.subscribed.has(instance)) {
      this.subscribed.add(instance);
      instance.state.onEmpty(() => { if (!this.busy.get(instance)) void this.evict(instance); });
    }
    instance.state.host = this.hostFor(owner, instance);
    this.busy.set(instance, (this.busy.get(instance) ?? 0) + 1);
    try { await work(instance); } finally {
      const left = (this.busy.get(instance) ?? 1) - 1;
      if (left > 0) this.busy.set(instance, left);
      else this.busy.delete(instance);              // no entry stays for an instance nobody works on
      await this.settle(instance, owner);
    }
  }

  /** After a request: slots of kinds not held are released; what holds state is kept; the rest is disposed. */
  private async settle(instance: T, owner: string | null): Promise<void> {
    const kinds = instance.state.kindsHeld();
    for (const [key, slot] of this.slots) {
      if (slot.instance !== instance) continue;
      slot.pending = false;
      if (!kinds.includes(key.slice(key.lastIndexOf('|') + 1))) this.slots.delete(key);
    }
    if (instance.holdsState() && owner !== null) {
      if (!this.held.has(instance)) this.held.set(instance, { instance, owner, tail: Promise.resolve() });
      return;
    }
    if (!this.busy.get(instance)) await this.evict(instance);
  }

  /**
   * Once at a time per instance: dispose it. It leaves the pool only when it
   * holds nothing afterwards — an AMDP stop finishes when its last event batch
   * arrives, and `onEmpty` calls this again then. A disposal that fails keeps
   * the instance, fresh or held, for a retry. The guard is set before disposing,
   * so a part that empties synchronously inside dispose() re-enters harmlessly.
   */
  private evict(instance: T): Promise<void> {
    const running = this.evicting.get(instance);
    if (running) return running;
    let done!: () => void;
    const eviction = new Promise<void>((resolve) => { done = resolve; });
    this.evicting.set(instance, eviction);
    void (async () => {
      try {
        await instance.dispose();
        this.failed.delete(instance);
        if (!instance.holdsState()) {
          this.held.delete(instance);
          this.retained.delete(instance);
          for (const [key, slot] of this.slots) if (slot.instance === instance) this.slots.delete(key);
        } else {
          this.retained.add(instance);                       // still finishing: owned until it empties
        }
      } catch (e) {
        this.failed.set(instance, `${instance.stateHandle}: ${e instanceof Error ? e.message : String(e)}`);
        this.retained.add(instance);                         // fresh or held: kept for a retry
      } finally {
        this.evicting.delete(instance);
        done();
      }
    })();
    return eviction;
  }

  /** Settled: holds nothing, or nothing is finishing on its own any more. The subscription ends with it. */
  private settled(instance: T): Promise<void> {
    const done = () => !instance.holdsState() || !instance.state.pending();
    if (done()) return Promise.resolve();
    return new Promise((resolve) => {
      const off = instance.state.onChange(() => { if (done()) { off(); resolve(); } });
    });
  }

  /**
   * Stop admission; let running requests and disposals finish; dispose what is
   * held or retained; wait until each has settled (an AMDP session finishes
   * when its last event batch arrives — measured in Task 14); retry once what
   * still holds after a late failure; report what is still left.
   */
  async shutdown(): Promise<string[]> {
    this.admitting = false;
    await Promise.allSettled([...this.active]);
    await Promise.allSettled([...this.evicting.values()]);
    const owned = [...new Set<T>([...this.held.keys(), ...this.retained])];
    for (const instance of owned) await this.evict(instance);
    // Every instance settles first — a disposal that threw may still have cleanup finishing on its own.
    await Promise.allSettled(owned.map((i) => this.settled(i)));
    for (const instance of owned) {
      if (!instance.holdsState()) { this.failed.delete(instance); continue; }
      this.failed.delete(instance);
      await this.evict(instance);                    // what is still held after settling: once more
      await this.settled(instance);
      if (instance.holdsState() && !this.failed.has(instance)) {
        this.failed.set(instance, `${instance.stateHandle}: ${instance.state.failures().join('; ') || 'state is still held'}`);
      }
    }
    return [...this.failed.values()];
  }
}
```

An instance with state but a `null` owner is never kept. It cannot get state anyway, because `admit` refuses.

- [ ] **Step 4: Run them and see them pass**

Run: `cd server && npx jest src/__tests__/InstancePool.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the pool in `StreamableHttpServer`**

Rework the request handler (l.164-240) in this order:
1. Pick the destination as today (Priority 1–4). This block moves above the pool.
2. Read the handle with `handleOf(req.body)`, answering a `BatchWithHandleError` with 400.
3. Compute the owner with a private `async ownerOf(headers, destination)`, as described above. It is unit-tested on its own (`server/src/__tests__/ownerOf.test.ts`):
   - the same login with another password is another owner;
   - two tokens for which SAP answers the same user are one owner;
   - a token whose payload claims a user SAP does not answer gives no owner;
   - nothing is logged.
   Use a fake `getSystemInformation` injected through a constructor option.
4. Run the rest through the pool:

```ts
        await this.pool.serve({ handle, owner }, () => this.createPerRequestServer(), async (server) => {
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: this.enableJsonResponse });
          let transportClosed: Promise<void> | undefined;
          const closeTransport = () => (transportClosed ??= transport.close().catch(() => undefined));
          const disconnected = new Promise<void>((resolve) => res.once('close', () => { void closeTransport(); resolve(); }));
          try {
            // the existing connection-context block, on `server`: the request's own credentials, every time
            await server.connect(transport);
            const dispatch = runWithRequestContext(requestContextFromHeaders(req.headers), () => transport.handleRequest(req, res, req.body));
            // JSON mode answers when the handler has; SSE mode when the stream ends. A client that
            // disconnects first must not hold the lease on a dispatch that waits for a handler.
            await Promise.race([dispatch.catch(() => undefined), disconnected]);
          } finally {
            await closeTransport();
            // The instance goes back only when its tool handlers have settled: they do not consume
            // the transport's abort signal (a debugger wait finishes its own bounded hold).
            await server.idle();
          }
        });
```

Here `this.pool = new InstancePool<PerRequestServer>()`, and `PerRequestServer` exposes `state`, `stateHandle`, `holdsState()`, `dispose()` and `idle()` from `BaseMcpServer` (Task 7).

The SDK aborts a handler's signal when its transport closes. The background listener is not a request handler and does not consume those signals (checked: `protocol.js:252-268`), so a transport close after a response does not touch it.

`stop()`:

```ts
  async stop(): Promise<void> {
    const failures = await this.pool.shutdown();
    // (the existing listener close)
    if (failures.length) throw new Error(`state cleanup failed: ${failures.join('; ')}`);
  }
```

- [ ] **Step 6: The real-transport test**

```ts
// server/src/__tests__/streamableHttpPool.test.ts
```

Start a `StreamableHttpServer` on port 0. Its `CompositeHandlersRegistry` holds a test group with tools that touch only the instance state, with no SAP call:
- `PoolProbeHold`: creates state. It attaches a test part whose `held` it sets to true, and answers `{ state_handle }`.
- `PoolProbeEcho(state_handle)`: `context.state.check(args.state_handle)`, then answers its handle.
- `PoolProbeGate(state_handle)`: like Echo, but awaits a gate the test opens.
- `PoolProbeRelease(state_handle)`: sets `held` false.

Over real HTTP, open a new SDK `StreamableHTTPClientTransport` client per call, so every request is its own MCP session. Run it in both `enableJsonResponse: true` and `false`:
1. Hold, then Echo with the handle: the same handle comes back.
2. Echo with another handle: `state is not available`.
3. Gate, then Echo at once: Echo answers only after the test opens the gate. This proves the lease order.
4. Release, then Echo with the old handle: not available, and the pool size is 0.
5. **A client that disconnects during a held request.** Gate, then abort the client's request (`AbortController` on its fetch) while the gate is closed. The server's transport is closed at once (spy on `close`). A second Echo with the handle waits until the test opens the gate, because the lease lasts until the handler settled. This runs in both JSON and SSE modes.
6. Hold, then `server.stop()`: the instance was disposed.

Run: `cd server && npx jest src/__tests__/streamableHttpPool.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/InstancePool.ts server/src/StreamableHttpServer.ts server/src/__tests__/
git commit -m "feat(server): one pool keeps the MCP instance that holds state — lease, owner index, eviction, shutdown"
```

---

### Task 10: Core ABAP debugger tools

**Files:**
- Create: `src/handlers/debugger/debug/handleDebug*.ts`, one file per tool in the table below (20 files)
- Modify: `src/lib/handlers/groups/DebugHandlersGroup.ts`, `tests/fixtures/tools/surface.json`, `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts:131-139` (`includeDebug: true`), `src/__tests__/unit/debugger/exposition.test.ts` (tighten the `includeDebug: true` assertion to the tool names)
- Test: `src/__tests__/unit/debugger/handlers.test.ts`

**Interfaces:**
- Consumes:
  - from Task 7: `requireDebugger(context, args, {create:'abap'} | 'use')`, `debugAnswer`, `debugStateAnswer`, `STATE_HANDLE_PROPERTY` and the schema constants and parsers, `InstanceState`;
  - from Task 3: `terseStop`, `terseVariables`;
  - from Task 6: `readXmlDocument`;
  - from Task 2: `lineUriOf`;
  - `DETAIL_PROPERTY`.
- Produces: the tool names of spec §2, and `DebugListSessions`.

**The shape of every handler.** One complete file:

```ts
// src/handlers/debugger/debug/handleDebugGetStack.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseStop } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetStack',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Call stack of the stopped debuggee, each frame as an object address and as its technical place. Needs a stopped debuggee.',
  inputSchema: { type: 'object', properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY }, required: ['state_handle'] },
} as const;

export async function handleDebugGetStack(context: HandlerContext, args: { state_handle?: string; detail?: string }) {
  return debugAnswer(args, async () => requireDebugger(context, args, 'use').abap.getStack(), (stop) => terseStop(stop.debuggee, stop.stack));
}
```

`requireDebugger` is called inside the work, so a refusal comes back as a tool error.

**Rules for every tool in the table:**
- The description starts with `[debug] ` and states the function only. It has no list of answer fields and names no other tool.
- `available_in: ['onprem', 'cloud'] as const`.
- `...DETAIL_PROPERTY` is spread into the properties.
- Every tool except the two starts and `DebugListSessions` spreads `...STATE_HANDLE_PROPERTY` and lists `'state_handle'` in `required`.
- In the Body column, `U` is `requireDebugger(context, args, 'use')`.

**The two starts:**

```ts
// handleDebugStartListener.ts (DebugTakeOverListener: the same with 'takeOver' and its own description)
export async function handleDebugStartListener(context: HandlerContext, args: any) {
  return debugStateAnswer(args, async () => {
    const d = requireDebugger(context, args, { create: 'abap' });
    const started = await d.abap.start('refuse', {
      ...(args.breakpoints ? { breakpoints: breakpointsFromArgs(args.breakpoints) } : {}),
      run: runFromArgs(args.run),
    });
    return started;
  }, () => ({ state_handle: context.state!.handle, terminal_id: context.debugger!().abap.ids.terminalId, ide_id: context.debugger!().abap.ids.ideId }));
}
```

To make that work, change `debugStateAnswer`'s third parameter (Task 7) from a fixed object to `extra: () => Record<string, unknown> = () => ({})`, evaluated after the work. Update its test to `() => ({ state_handle: 'H' })`. `breakpoints` in the answer comes from `start`; the terse projection shows `placed` and `refused` as `DebugSetBreakpoints` does.

| Tool | Properties besides detail | Description after `[debug] ` | Body |
|---|---|---|---|
| `DebugStartListener` | `...BREAKPOINTS_PROPERTY`, `...RUN_PROPERTY` | `Opens a debug session of the connected SAP user: arms breakpoints, listens for a debuggee and attaches the first one caught; refused while another debugger listens for that user. ${USER_MODE_SENTENCE}` | (above) |
| `DebugTakeOverListener` | same | `Opens a debug session of the connected SAP user like a listener start, taking the user's debugging over. ${TAKE_OVER_SENTENCE} ${USER_MODE_SENTENCE}` | (above, `'takeOver'`) |
| `DebugWait` | `...STATE_HANDLE_PROPERTY`, `...HOLD_SECONDS_PROPERTY` | `State of a debug session after waiting up to hold_seconds; a debugger that took the user over is an error carrying the system's message.` | `debugStateAnswer(args, async () => U.abap.wait(Number(args.hold_seconds ?? 10)))` |
| `DebugSetBreakpoints` | `...STATE_HANDLE_PROPERTY`, `...BREAKPOINTS_PROPERTY` | `Adds breakpoints to a debug session — line, exception class, ABAP statement or message, with an optional condition — and reports which the system refused and why. ${USER_MODE_SENTENCE}` | `debugAnswer(args, async () => U.abap.setBreakpoints(breakpointsFromArgs(args.breakpoints)), (v) => ({ placed: v.placed.map((p) => ({ id: p.id, kind: p.kind, ...(p.uri ? { uri: p.uri } : {}) })), refused: v.refused }))` |
| `DebugDeleteBreakpoint` | `...STATE_HANDLE_PROPERTY`, `breakpoint_id: {type:'string', description:'Breakpoint id.'}` | `Removes one breakpoint of a debug session.` | `debugAnswer(args, async () => { await U.abap.deleteBreakpoint(String(args.breakpoint_id)); return { value: { deleted: args.breakpoint_id }, raw: '' }; }, (v) => v)` |
| `DebugListBreakpoints` | `...STATE_HANDLE_PROPERTY` | `Breakpoints a debug session armed.` | `debugAnswer(args, async () => { const l = U.abap.listBreakpoints(); return { value: l, raw: JSON.stringify(l) }; }, (v) => v)` |
| `DebugGetStack` | (above) | (above) | (above) |
| `DebugSetStackPosition` | `...STATE_HANDLE_PROPERTY`, `position: {type:'number', description:'Frame position.'}` | `Selects the stack frame variables are read in; what runs next does not change. Needs a stopped debuggee.` | `debugAnswer(args, async () => U.abap.setStackPosition(Number(args.position)), (s) => terseStop(s.debuggee, s.stack))` |
| `DebugGetVariables` | `...STATE_HANDLE_PROPERTY`, `names: {type:'array', items:{type:'string'}, description:'Variables by name; a path reads a component or a table row.'}`, `parents: {type:'array', items:{type:'string'}, description:'Instead of names: members of these scopes, objects or tables.'}` | `Variables of the stopped debuggee, by name or as members of a parent. Needs a stopped debuggee.` | `debugAnswer(args, async () => { const a = U.abap; return Array.isArray(args.names) && args.names.length ? a.getVariables(args.names.map(String)) : a.getChildVariables(Array.isArray(args.parents) && args.parents.length ? args.parents.map(String) : ['@ROOT']); }, (v) => (v.variables.length ? terseVariables(v) : v.children.map((c) => ({ id: c.child, label: c.label }))))` |
| `DebugSetVariable` | `...STATE_HANDLE_PROPERTY`, `name: {type:'string'}`, `value: {type:'string', description:'New value; converted to the type by the system.'}` | `Sets a variable of the stopped debuggee. Needs a stopped debuggee.` | `debugAnswer(args, async () => U.abap.setVariable(String(args.name), String(args.value)), terseVariables)` |
| `DebugStep` | `...STATE_HANDLE_PROPERTY`, `action: {type:'string', enum:['into','over','return','continue']}` | `Moves the stopped debuggee into a call, over it, out of the current one, or on to the next stop.` | named constant below |
| `DebugStepToLine` | `...STATE_HANDLE_PROPERTY`, `mode: {type:'string', enum:['run','jump'], description:'run executes up to the line; jump moves there without executing what lies between.'}`, `...LINE_TARGET_PROPERTIES` | `Runs or jumps the stopped debuggee to a line.` | `debugStateAnswer(args, async () => U.abap.stepToLine(args.mode === 'jump' ? 'stepJumpToLine' : 'stepRunToLine', lineUriOf(args, Number(args.line))))` |
| `DebugTerminate` | `...STATE_HANDLE_PROPERTY` | `Ends the stopped debuggee where it stands; the program does not run on.` | `debugStateAnswer(args, async () => U.abap.terminate())` |
| `DebugCreateWatchpoint` | `...STATE_HANDLE_PROPERTY`, `name: {type:'string'}`, `condition: {type:'string'}` | `Watches a variable of the stopped debuggee: it stops when the variable changes, optionally under a condition.` | `debugAnswer(args, async () => U.abap.createWatchpoint(String(args.name), args.condition ? String(args.condition) : undefined), readXmlDocument, readXmlDocument)` |
| `DebugListWatchpoints` | `...STATE_HANDLE_PROPERTY` | `Watchpoints of the stopped debuggee.` | `debugAnswer(args, async () => U.abap.listWatchpoints(), readXmlDocument, readXmlDocument)` |
| `DebugDeleteWatchpoint` | `...STATE_HANDLE_PROPERTY`, `watchpoint_id: {type:'string'}` | `Removes a watchpoint.` | `debugAnswer(args, async () => { await U.abap.deleteWatchpoint(String(args.watchpoint_id)); return { value: { deleted: args.watchpoint_id }, raw: '' }; }, (v) => v)` |
| `DebugGetMemorySizes` | `...STATE_HANDLE_PROPERTY` | `Memory the stopped debuggee uses. Needs a stopped debuggee.` | `debugAnswer(args, async () => U.abap.getMemorySizes(), readXmlDocument, readXmlDocument)` |
| `DebugCreateMemorySnapshot` | `...STATE_HANDLE_PROPERTY` | `Writes a memory snapshot of the stopped debuggee and answers the file written.` | `debugAnswer(args, async () => U.abap.createMemorySnapshot(), readXmlDocument, readXmlDocument)` |
| `DebugStop` | `...STATE_HANDLE_PROPERTY` | `Ends a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening and closes the connections; what could not be undone stays for another stop.` | `debugAnswer(args, async () => { const d = requireDebugger(context, args, 'use'); context.state!.endWhenEmpty(); await d.stop(); return { value: { state: 'stopped' }, raw: '' }; }, (v) => v)` |
| `DebugListSessions` | none | `Debug sessions this server holds for the caller.` | `debugAnswer(args, async () => { if (!context.state) throw new Error('debugging is not served by this server'); const l = context.state.host?.peers() ?? (context.state.holdsState() ? [context.state.describe()] : []); return { value: l, raw: JSON.stringify(l) }; }, (v) => v)` |

Write `U` out in each file as `requireDebugger(context, args, 'use')`, inside the work.

`DebugStep`:

```ts
const STEPS = { into: 'stepInto', over: 'stepOver', return: 'stepReturn', continue: 'stepContinue' } as const;
export async function handleDebugStep(context: HandlerContext, args: { state_handle?: string; action?: string; detail?: string }) {
  return debugStateAnswer(args, async () => {
    const method = STEPS[String(args.action) as keyof typeof STEPS];
    if (!method) throw new Error('action: into, over, return or continue');
    return requireDebugger(context, args, 'use').abap.step(method);
  });
}
```

- [ ] **Step 1: Write the failing handler test**

```ts
// src/__tests__/unit/debugger/handlers.test.ts
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugSession } from '../../../lib/debugger/DebugSession';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { InstanceState } from '../../../lib/state/InstanceState';
import { handleDebugGetStack } from '../../../handlers/debugger/debug/handleDebugGetStack';
import { handleDebugSetBreakpoints } from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugStop } from '../../../handlers/debugger/debug/handleDebugStop';
import { handleDebugWait } from '../../../handlers/debugger/debug/handleDebugWait';
import { okResponse } from '../../helpers/fakeClient';
import { CONFLICT, fakeWorld, IDS, LISTEN_CATCH, LISTEN_NOTHING, until } from './fakes';

const json = (r: any) => JSON.parse(r.content[0].text);

function install() {
  const world = fakeWorld();
  const state = new InstanceState();
  const dbg = new DebuggerInstance({ abap: new DebugSession(world.ports as any, IDS), amdp: new AmdpSession({} as any) });
  state.attach(dbg);
  const context = { connection: {} as any, logger: undefined, state, debugger: () => dbg };
  return { world, state, context };
}

async function startedListening(world: ReturnType<typeof fakeWorld>, context: any) {
  const started = handleDebugStartListener(context, {});
  await until(() => world.polls.length === 1);
  world.polls[0].resolve(LISTEN_NOTHING());
  return json(await started);
}

describe('debugger handlers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('the group serves the 20 ABAP tools', () => {
    const names = new DebugHandlersGroup({} as any).getHandlers().map((e) => e.toolDefinition.name);
    for (const n of ['DebugStartListener', 'DebugTakeOverListener', 'DebugWait', 'DebugSetBreakpoints', 'DebugDeleteBreakpoint',
      'DebugListBreakpoints', 'DebugGetStack', 'DebugSetStackPosition', 'DebugGetVariables', 'DebugSetVariable', 'DebugStep',
      'DebugStepToLine', 'DebugTerminate', 'DebugCreateWatchpoint', 'DebugListWatchpoints', 'DebugDeleteWatchpoint',
      'DebugGetMemorySizes', 'DebugCreateMemorySnapshot', 'DebugStop', 'DebugListSessions']) expect(names).toContain(n);
  });

  it('start answers the state handle and the SAP ids; wait with it answers the stop, as precise', async () => {
    const { world, state, context } = install();
    expect(await startedListening(world, context)).toEqual({ state: 'listening', state_handle: state.handle, terminal_id: IDS.terminalId, ide_id: IDS.ideId });
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    const waited = json(await handleDebugWait(context as any, { state_handle: state.handle, hold_seconds: 0 }));
    expect(waited.state).toBe('stopped');
    expect(waited.at.address).toEqual({ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 });
    expect(waited.at.include).toBe('ZCL_CV_DBG_MEASURE============CM002');
    expect(waited.frames).toHaveLength(5);
    expect((await handleDebugGetStack(context as any, { state_handle: state.handle, detail: 'raw' })).content[0].text).toContain('<dbg:stack');
  });

  it('every detail of the start answers the state handle', async () => {
    for (const detail of ['terse', 'full', 'raw']) {
      const { world, state, context } = install();
      const started = handleDebugStartListener(context as any, { detail });
      await until(() => world.polls.length === 1);
      world.polls[0].resolve(LISTEN_NOTHING());
      const r: any = await started;
      expect(r.content.map((c: any) => c.text).join('\n')).toContain(state.handle);
    }
  });

  it("a line breakpoint's URI is built from type, name and line", async () => {
    const { world, state, context } = install();
    await startedListening(world, context);
    const seen: any[] = [];
    world.override.setBreakpoints = async (_i: unknown, l: any[]) => { seen.push(l); return okResponse('<dbg:breakpoints xmlns:dbg="x"/>'); };
    await handleDebugSetBreakpoints(context as any, { state_handle: state.handle, breakpoints: [{ object_type: 'CLAS', object_name: 'ZCL_A', line: 7 }] });
    expect(seen[0]).toEqual([{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_a/source/main#start=7' }]);
  });

  it('a foreign handle is not available and nothing is sent', async () => {
    const { world, context } = install();
    const before = world.calls.length;
    const r: any = await handleDebugGetStack(context as any, { state_handle: 'F'.repeat(32) });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('state is not available');
    expect(world.calls.length).toBe(before);
  });

  it('after a complete stop the old handle is not available, for good', async () => {
    const { world, state, context } = install();
    const { state_handle: old } = await startedListening(world, context);
    await handleDebugStop(context as any, { state_handle: old });
    expect(state.handle).not.toBe(old);
    const r: any = await handleDebugWait(context as any, { state_handle: old, hold_seconds: 0 });
    expect(r.content[0].text).toContain('state is not available');
  });

  it('a conflict at the start is a tool error, and the breakpoints it armed are gone', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, { breakpoints: [{ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 }] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    const r: any = await started;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
    expect(context.state.holdsState()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/__tests__/unit/debugger/handlers.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Write the 20 handlers and register them in `DebugHandlersGroup`, the way `SystemHandlersGroup` does**

```ts
{ toolDefinition: DebugGetStack_Tool, handler: (args: any) => handleDebugGetStack(this.context, args) },
```

`this.context` is read when the handler is called, so it carries `state` and `debugger`.

- [ ] **Step 4: Ratchets**

- `toolDescriptionsCarryNoLiterals.test.ts`: add `includeDebug: true` to the exporter options. `TAKES_NO_PARAMETERS` stays unchanged, because every tool has `detail`.
- `tests/fixtures/tools/surface.json`: the `debug` rows from `npx tsx scripts/list-tools.ts`.
- `exposition.test.ts`: `expect(names({ includeDebug: true })).toContain('DebugStartListener')`.

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/debugger/ src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit/
git commit -m "feat(debugger): core ABAP debugger tools behind state_handle"
```

---

### Task 11: Memory snapshot tools

**Files:**
- Create: `src/handlers/debugger/debug/handleMemorySnapshotList.ts`, `handleMemorySnapshotGet.ts`, `handleMemorySnapshotDelta.ts`
- Modify: `DebugHandlersGroup.ts`, `tests/fixtures/tools/surface.json`
- Test: `src/__tests__/unit/debugger/memoryHandlers.test.ts`

Snapshots belong to the system, not to a debug session, so these tools take no `state_handle`. They use `MemorySnapshots` from adt-clients on `context.connection`.

```ts
// src/handlers/debugger/debug/handleMemorySnapshotGet.ts
import { MemorySnapshots } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const SNAPSHOT_VIEW_PROPERTIES = {
  view: { type: 'string', enum: ['header', 'overview', 'ranking', 'children', 'references'], default: 'overview', description: 'header: the snapshot; overview: memory by kind; ranking: the largest objects; children: what an object holds; references: what holds an object.' },
  key: { type: 'string', description: 'Object key, for children and references.' },
  max_objects: { type: 'number', default: 50, description: 'Objects in a ranking, children or references answer.' },
} as const;

export const TOOL_DEFINITION = {
  name: 'MemorySnapshotGet',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] One memory snapshot in a view: header, memory by kind, largest objects, an object\'s children or its referrers. Needs the memory snapshot authorization.',
  inputSchema: { type: 'object', properties: { snapshot_id: { type: 'string', description: 'Snapshot id.' }, ...SNAPSHOT_VIEW_PROPERTIES, ...DETAIL_PROPERTY }, required: ['snapshot_id'] },
} as const;

export function requireKey(args: { key?: string; view?: string }): string {
  if (!args.key) throw new Error(`view ${args.view}: give key`);
  return String(args.key);
}

export async function handleMemorySnapshotGet(context: HandlerContext, args: { snapshot_id: string; view?: string; key?: string; max_objects?: number; detail?: string }) {
  const snapshots = new MemorySnapshots(context.connection, context.logger);
  const id = String(args.snapshot_id);
  const max = Number(args.max_objects ?? 50);
  const opts = { analyse: analyseException };
  return debugAnswer(args, async () => {
    const answer = await (() => {
      switch (args.view ?? 'overview') {
        case 'header': return snapshots.getById(id, opts);
        case 'overview': return snapshots.getOverview(id, opts);
        case 'ranking': return snapshots.getRankingList(id, { ...opts, maxNumberOfObjects: max });
        case 'children': return snapshots.getChildren(id, requireKey(args), { ...opts, maxNumberOfObjects: max });
        case 'references': return snapshots.getReferences(id, requireKey(args), { ...opts, maxNumberOfReferences: max });
        default: throw new Error('view: header, overview, ranking, children or references');
      }
    })();
    if (!answer.ok) throw new Error(answer.getError().message);
    const raw = String(answer.getResult().value ?? '');
    return { value: raw, raw };
  }, readXmlDocument, readXmlDocument);
}
```

`MemorySnapshotDelta(from_id*, to_id*, view: overview|ranking|children|references, key?, max_objects?)` uses the same switch over the `getDelta*` members, with no `header`. Description: `[debug] Two memory snapshots compared in a view: memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization.`

`MemorySnapshotList(user?)`:
- Description: `[debug] Memory snapshots the system lists. Empty without the memory snapshot authorization.`
- Body: call `list({ analyse: analyseException, ...(args.user ? { user: args.user.toUpperCase() } : {}) })`. The terse answer drops `fileName`. An empty list is answered as `{ snapshots: [], authorization: 'an empty list is also the answer without the memory snapshot authorization' }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/debugger/memoryHandlers.test.ts
import { corpusBody } from '../../../lib/adtCorpus';
import { handleMemorySnapshotGet } from '../../../handlers/debugger/debug/handleMemorySnapshotGet';
import { handleMemorySnapshotList } from '../../../handlers/debugger/debug/handleMemorySnapshotList';
import { recordingConnection } from '../../helpers/recordingConnection';

const ctx = (conn: any) => ({ connection: conn, logger: undefined }) as any;

describe('memory snapshot tools', () => {
  it('lists the recorded snapshots', async () => {
    const r: any = await handleMemorySnapshotList(ctx(recordingConnection([{ status: 200, data: corpusBody('memory-snapshot-list--01-list-of-the-user') }])), {});
    expect(JSON.parse(r.content[0].text)[0]).toMatchObject({ id: '0CC47A1E68C11FE1B1827ADCF9D455CB' });
  });
  it('an empty list says the authorization may be missing', async () => {
    const r: any = await handleMemorySnapshotList(ctx(recordingConnection([{ status: 200, data: corpusBody('memory-snapshot-list--02-list-of-a-user-with-none') }])), {});
    expect(r.content[0].text).toMatch(/authorization/);
  });
  it('ranking sends the required limit', async () => {
    const conn = recordingConnection([{ status: 200, data: '<mi:rankingList xmlns:mi="x"/>' }]);
    await handleMemorySnapshotGet(ctx(conn), { snapshot_id: 'S1', view: 'ranking' });
    expect(JSON.stringify(conn.requests[0])).toContain('maxNumberOfObjects=50');
  });
  it('children without a key is an error that sends nothing', async () => {
    const conn = recordingConnection([]);
    const r: any = await handleMemorySnapshotGet(ctx(conn), { snapshot_id: 'S1', view: 'children' });
    expect(r.isError).toBe(true);
    expect(conn.requests).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and see it fail; write the three handlers; register them; add the surface rows; run it and see it pass**

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/debugger/debug/handleMemorySnapshot*.ts src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit/debugger/memoryHandlers.test.ts
git commit -m "feat(debugger): memory snapshot list, views and deltas"
```

---

### Task 12: AMDP debugger tools

**Files:**
- Create: `src/handlers/debugger/debug/handleAmdpDebug{Start,SetBreakpoints,Wait,Step,GetTable,Cancel,Stop}.ts`
- Modify: `DebugHandlersGroup.ts`, `tests/fixtures/tools/surface.json`
- Test: `src/__tests__/unit/debugger/amdpHandlers.test.ts`

Rules for every tool in the table: the description starts with `[debug] ` and states only the function. `...DETAIL_PROPERTY` is spread, `available_in: ['onprem','cloud']`, every tool except `AmdpDebugStart` requires `state_handle`, and `requireDebugger` is called inside the work.

| Tool | Properties besides detail | Description after `[debug] ` | Body |
|---|---|---|---|
| `AmdpDebugStart` | `stop_existing: {type:'boolean', default:false, description:'Ends an AMDP debug session of this user left behind.'}`, `...AMDP_BREAKPOINTS_PROPERTY` (required), `...RUN_PROPERTY` | `Opens an AMDP debug session of the connected SAP user with breakpoints on lines in SQLScript methods; a background run, when given, starts once the system confirmed the breakpoints. ${USER_MODE_SENTENCE}` | `debugAnswer(args, async () => { const d = requireDebugger(context, args, { create: 'amdp' }); const r = await d.amdp.start({ stopExisting: args.stop_existing === true, breakpoints: amdpBreakpointsFromArgs(args.breakpoints), run: runFromArgs(args.run) }); return { value: r, raw: JSON.stringify(r) }; }, (v) => v, (v) => v, () => ({ state_handle: context.state!.handle }))` |
| `AmdpDebugSetBreakpoints` | `...STATE_HANDLE_PROPERTY`, `...AMDP_BREAKPOINTS_PROPERTY` | `Replaces the AMDP breakpoints of a debug session, as confirmed by the system. ${USER_MODE_SENTENCE}` | `debugAnswer(args, () => requireDebugger(context, args, 'use').amdp.setBreakpoints(amdpBreakpointsFromArgs(args.breakpoints)), (v) => ({ breakpoints: v }))` |
| `AmdpDebugWait` | `...STATE_HANDLE_PROPERTY`, `...HOLD_SECONDS_PROPERTY` | `AMDP events of a debug session after waiting up to hold_seconds.` | `debugAnswer(args, async () => { const s = await requireDebugger(context, args, 'use').amdp.wait(Number(args.hold_seconds ?? 10)); return { value: s, raw: s.state === 'event' ? s.events.map((e) => e.body).join('\n') : JSON.stringify(s) }; }, (s) => (s.state === 'event' ? { state: 'event', events: s.events.map(terseAmdpEvent) } : s))` |
| `AmdpDebugStep` | `...STATE_HANDLE_PROPERTY`, `action: {type:'string', enum:['over','continue']}` | `Steps the stopped AMDP debuggee over a statement or on to the next stop.` | `debugAnswer(args, () => requireDebugger(context, args, 'use').amdp.step(args.action === 'over' ? 'over' : 'continue'), (v) => ({ state: v }))` |
| `AmdpDebugGetTable` | `...STATE_HANDLE_PROPERTY`, `variable: {type:'string'}`, `query: {type:'string', description:'A SELECT over the variable.'}` | `Rows of a table variable at the AMDP stop, up to 100; optionally through a SELECT over it.` | `debugAnswer(args, () => requireDebugger(context, args, 'use').amdp.getTable(String(args.variable), args.query ? String(args.query) : undefined), (v) => v.rows)` |
| `AmdpDebugCancel` | `...STATE_HANDLE_PROPERTY` | `Cancels the stopped AMDP debuggee's execution.` | `debugAnswer(args, async () => { await requireDebugger(context, args, 'use').amdp.cancel(); return { value: 'cancelled', raw: '' }; }, (v) => v)` |
| `AmdpDebugStop` | `...STATE_HANDLE_PROPERTY` | `Ends the AMDP part of a debug session, releasing a suspended debuggee first; what could not be undone is reported and stays for another stop.` | `debugAnswer(args, async () => { await requireDebugger(context, args, 'use').amdp.stop(); return { value: { state: 'idle' }, raw: '' }; }, (v) => v)` |

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/debugger/amdpHandlers.test.ts
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { InstanceState } from '../../../lib/state/InstanceState';
import { handleAmdpDebugStep } from '../../../handlers/debugger/debug/handleAmdpDebugStep';

it('the group serves the seven AMDP tools', () => {
  const names = new DebugHandlersGroup({} as any).getHandlers().map((e) => e.toolDefinition.name);
  for (const n of ['AmdpDebugStart', 'AmdpDebugSetBreakpoints', 'AmdpDebugWait', 'AmdpDebugStep', 'AmdpDebugGetTable', 'AmdpDebugCancel', 'AmdpDebugStop']) expect(names).toContain(n);
});

it('a step without a session is not available', async () => {
  const state = new InstanceState();
  const instance = new DebuggerInstance({ abap: { holdsState: () => false, pending: () => false, failures: () => [], bind() { return this; }, observe() {}, describe: () => ({}), ids: {} } as any, amdp: new AmdpSession({} as any) });
  state.attach(instance);
  const r: any = await handleAmdpDebugStep({ connection: {}, state, debugger: () => instance } as any, { state_handle: state.handle, action: 'over' });
  expect(r.isError).toBe(true);
  expect(r.content[0].text).toContain('state is not available');
});
```

- [ ] **Step 2: Run it and see it fail; write the seven; register them; add the surface rows; run it and see it pass**

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS. The group now holds 30 tools.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/debugger/debug/handleAmdpDebug*.ts src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit/debugger/amdpHandlers.test.ts
git commit -m "feat(debugger): AMDP debugger tools"
```

---

### Task 13: Compact — four verb tools behind `--exposition=…,debug`

**Files:**
- Create: `compact/src/debug/group.ts`, `compact/src/debug/handleHandlerDebug{Start,Wait,View,Step}.ts`
- Modify:
  - `compact/src/launcher.ts` (accept `debug` beside `ro`/`rw`; pass `statefulGroups`; correct the stale 13/22 counts in its help and error strings to 16/25);
  - `compact/src/__tests__/compactSurface.test.ts`;
  - `compact/tests/fixtures/surface.json`;
  - `compact/src/__tests__/compactExposition.test.ts`.
- Test: `compact/src/__tests__/compactDebug.test.ts`

**Interfaces:**
- Consumes from `@mcp-abap-adt/lib/debugger`:
  - `requireDebugger`;
  - `debugAnswer`, `debugStateAnswer`;
  - `breakpointsFromArgs`, `amdpBreakpointsFromArgs`, `runFromArgs`;
  - `BREAKPOINTS_PROPERTY`, `RUN_PROPERTY`, `HOLD_SECONDS_PROPERTY`, `STATE_HANDLE_PROPERTY`, `LINE_TARGET_PROPERTIES`;
  - `USER_MODE_SENTENCE`, `TAKE_OVER_SENTENCE`;
  - `terseStop`, `terseVariables`, `terseAmdpEvent`, `readXmlDocument`, `lineUriOf`, `addressOf`.

  It also needs `DETAIL_PROPERTY`. Re-export it from `@mcp-abap-adt/lib/compact-shared` if it is not there yet.
- Produces:
  - `compactDebugEntries(getContext: () => HandlerContext): HandlerEntry[]` (4 entries);
  - `class CompactDebugHandlersGroup` (`groupName = 'CompactDebugHandlers'`);
  - `parseCompactDebug(argv: readonly string[]): boolean`;
  - `parseCompactExposition` that accepts a comma list of `ro|rw|debug` (the last of `ro`/`rw` wins, default `rw`).

**Tools.** One debug session per instance holds either ABAP or AMDP, never both at once in compact (spec D14). The kind is fixed by `HandlerDebugStart`, and the other three take it from the instance: AMDP when `instance.amdp.holdsState()`, else ABAP.

| Tool | Parameters | Description | Body |
|---|---|---|---|
| `HandlerDebugStart` | `kind*: abap\|amdp`, `breakpoints*` (abap: `BREAKPOINTS_PROPERTY` items; amdp: `{object_name, line}`), `take_over?`, `run?`, `detail` | `Debugger start. kind: abap (line, exception, statement or message breakpoints) or amdp (lines in SQLScript methods). Arms the breakpoints, listens (abap) or opens an AMDP session, and optionally runs a class or report in the background. take_over: abap — ${TAKE_OVER_SENTENCE}; amdp — ends an AMDP session of this user left behind. ${USER_MODE_SENTENCE}` | abap: as the ABAP listener start with `take_over ? 'takeOver' : 'refuse'` (`requireDebugger(context, args, {create:'abap'})`). amdp: as the AMDP start, mapping `{object_name, line}` to `{class_name, line}` (`{create:'amdp'}`). Refused when the instance already holds the other kind. |
| `HandlerDebugWait` | `state_handle*`, `hold_seconds?`, `detail` | `State of a debug session after waiting up to hold_seconds; for AMDP, its events.` | AMDP: as `AmdpDebugWait`; else as `DebugWait`. |
| `HandlerDebugView` | `state_handle*`, `what*: stack\|variables\|memory\|table`, `names?`, `detail` | `The stopped debuggee: stack, variables (by name, or the scopes), memory, or an AMDP table variable's rows.` | `stack` → `abap.getStack` + `terseStop`; `variables` → `getVariables(names)` or `getChildVariables(['@ROOT'])`; `memory` → `getMemorySizes` + `readXmlDocument`; `table` → `amdp.getTable(names[0])`. |
| `HandlerDebugStep` | `state_handle*`, `action*: into\|over\|return\|continue\|run_to_line\|jump_to_line\|terminate\|stop`, `line?`, `object_type?`, `object_name?`, `include?`, `parent_name?`, `detail` | `Moves the stopped debuggee (into, over, return, continue, run or jump to a line), ends it where it stands, or ends the debug session.` | AMDP: `over`/`continue` → `amdp.step`, `terminate` → `cancel`, `stop` → `context.state.endWhenEmpty()` then `instance.stop()`. ABAP: the four steps → `step`; `run_to_line`/`jump_to_line` → `stepToLine(lineUriOf(target, line))`, where `target` is the given object or, when none is given, `addressOf(top frame uri)` — refused if that is undefined; `terminate` → `terminate`; `stop` → `context.state.endWhenEmpty()` then `instance.stop()`. |

`compact/src/launcher.ts`:

```ts
export type CompactExposition = 'ro' | 'rw';
// the existing scan of --exposition=x / --exposition x (last flag wins) returns the comma list
export function parseCompactExposition(argv: readonly string[]): CompactExposition {
  const values = expositionValues(argv);
  if (!values) return 'rw';
  let base: CompactExposition | undefined;
  for (const v of values) {
    if (v === 'ro' || v === 'rw') base = v;
    else if (v !== 'debug') throw new Error(`--exposition: ${v} is not one of ro, rw, debug`);
  }
  return base ?? 'rw';
}
export function parseCompactDebug(argv: readonly string[]): boolean {
  return expositionValues(argv)?.includes('debug') ?? false;
}
```

Keep the existing `/no value/` message. `main()` passes `statefulGroups: (context) => (parseCompactDebug(argv) ? [new CompactDebugHandlersGroup(context)] : [])` to the core launcher (Task 8).

- [ ] **Step 1: Write the failing tests**

```ts
// compact/src/__tests__/compactDebug.test.ts
import { compactDebugEntries } from '../debug/group';
import { parseCompactDebug, parseCompactExposition } from '../launcher';

describe('compact debug', () => {
  const entries = compactDebugEntries(() => ({}) as never);
  it('four verb tools', () => {
    expect(entries.map((e) => e.toolDefinition.name).sort()).toEqual(['HandlerDebugStart', 'HandlerDebugStep', 'HandlerDebugView', 'HandlerDebugWait']);
  });
  it('--exposition takes debug beside ro or rw', () => {
    expect(parseCompactExposition(['--exposition=ro,debug'])).toBe('ro');
    expect(parseCompactDebug(['--exposition=ro,debug'])).toBe(true);
    expect(parseCompactExposition(['--exposition=debug'])).toBe('rw');
    expect(parseCompactDebug(['--exposition=rw'])).toBe(false);
    expect(parseCompactDebug([])).toBe(false);
    expect(() => parseCompactExposition(['--exposition=high'])).toThrow();
  });
  it('the start describes user mode and taking over as facts', () => {
    const start = entries.find((e) => e.toolDefinition.name === 'HandlerDebugStart')!;
    expect(start.toolDefinition.description).toMatch(/every request of the connected SAP user/);
    expect(start.toolDefinition.description).toMatch(/Displaces another debugger/);
  });
  it('every session verb requires state_handle', () => {
    for (const e of entries.filter((x) => x.toolDefinition.name !== 'HandlerDebugStart')) {
      expect((e.toolDefinition.inputSchema as any).required).toContain('state_handle');
    }
  });
});
```

In `compactSurface.test.ts`:
- add `...compactDebugEntries(context)` to `current`;
- change both counts to 29;
- change the header comment to «the same 29 tools — 25, plus the four debug verbs served with `--exposition=…,debug`».

Append the four rows to `compact/tests/fixtures/surface.json`.

- [ ] **Step 2: Run them and see them fail; implement; run them and see them pass, with the capability split unchanged at 16/9**

Run: `npx jest compact/src/__tests__/ && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add compact/
git commit -m "feat(compact): HandlerDebugStart/Wait/View/Step behind --exposition=…,debug"
```

---

### Task 14: Integration on premise and on the cloud; recorded AMDP and memory answers; the breakpoint-set measurement

This is a gate with the user (CLAUDE.md, memory). Before any run, check the token's `exp` locally (cloud) and report it. Ask whether the connection is up and whether no IDE is debugging the same user. Run nothing until they confirm. Take every system-specific value (package, transport, user) from the test config, never from this plan.

**Files:**
- Create: `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`
- Modify:
  - `tests/test-config.yaml.template` and `docs/development/tests/test-config.yaml.template` (section `debugger_handlers`)
  - `tests/fixtures/adt/` (the recorded AMDP and memory answers)

Template section:

```yaml
debugger_handlers:
  test_cases:
    - name: "debugger_chain"
      enabled: true
      available_in: ["onprem", "cloud"]
      description: "ABAP chain, conflict, AMDP chain, memory, breakpoint-set semantics — on probe classes the test creates and deletes"
      params:
        probe_class: "ZMCP_DBG_PROBE"
        amdp_probe_class: "ZMCP_DBG_AMDP"
        amdp_probe_ddl: "ZMCP_DBG_AMDP_TF"
        keep_probe: false
```

The test follows `readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts`: `LambdaTester('debugger_handlers', 'debugger_chain', 'debugger')`. Its `beforeAll` creates and activates the probes with the high-level handlers, in the config's default package and transport. Every case builds a fresh `InstanceState` with a `createDebuggerInstance()` attached, and a context `{ connection, logger, state, debugger: () => instance }`. `afterEach` calls `state.dispose()`. Cases:

1. **ABAP chain.**
   - `DebugStartListener` with the marked line as a breakpoint and `run: {kind:'class', name: probe}`.
   - `DebugWait(30)` until `stopped`. The address must be the marked line.
   - `DebugGetStack`, then `DebugGetVariables(['LV_COUNTER'])`.
   - `DebugStep over`, then `DebugStepToLine run` (marked + 2), then `DebugStep continue` → `ended`.
   - `DebugWait` → `ended` with `run_finished` and the probe's output.
   - `DebugStop`, which reports nothing failed.
2. **Conflict.** A second instance with different ids starts `refuse` while the first listens. It rejects with SAP's conflict message, and nothing of it stays armed.
3. **Stated ids, reconciliation (D12).** Instance A runs with stated ids and is dropped without `stop()`, the way a killed process leaves things. Instance B gets the same stated ids. B's first start stops A's listener and succeeds, without a conflict.
4. **Breakpoint-set semantics (measurement, spec D12).**
   - Instance A arms a line breakpoint under stated ids. Instance B, with the same ids, POSTs an *empty* breakpoint set.
   - Run the probe with a listener under those ids. If it is not caught, the empty set removed A's breakpoint.
   - Record the outcome in the test output. Also record whether an IDE-like listener's breakpoints under other ids survived: arm one under other ids first.
   - Report the result to the user. Spec D12 is updated only with their word.
5. **Memory.** At a stop: `DebugGetMemorySizes`, `DebugCreateMemorySnapshot`, then `MemorySnapshotList`, asserting `isError: false` only. Listing needs `S_MEM_SNAP`; an empty list is valid.
6. **Does SAP end an open AMDP event poll when the session is stopped?** `AmdpSession.stop()` relies on it to finish its cleanup (Task 6).
   - After `AmdpDebugStop`, assert that the read loop's last turn ran (`holdsState()` false) within the case. Use the test's own `getTimeout`, which bounds the test, not the server.
   - If it does not end, report it to the user before going on: the stop design needs another way to end the poll, such as a short hold on the event read, decided with them.
7. **AMDP chain.** The AMDP probe is the class plus table function from the adt-clients AMDP test, created by the test.
   - `AmdpDebugStart(stop_existing: true, breakpoints, run)` answers states after `SYNC_BREAKPOINTS`.
   - `AmdpDebugWait` until `ON_BREAK`, then `AmdpDebugGetTable` on the table variable.
   - `AmdpDebugStep continue`, then `AmdpDebugWait` until `ON_EXECUTION_END`.
   - `AmdpDebugStop`.
8. **Hard mode, once per transport,** through `tester.invokeToolOrHandler` with `integration_hard_mode.enabled: true`:
   - stdio with `--exposition=readonly,high,debug`: the ABAP chain;
   - Streamable HTTP: the ABAP chain over separate requests, carrying `state_handle`. This proves the pool on a real system. If the hard-mode harness cannot start the HTTP server, extend `src/__tests__/integration/helpers/testers/hardMode.ts` with an HTTP mode that launches `server/dist/launcher.js --transport=http` on a free port and connects with `StreamableHTTPClientTransport`.

- [ ] **Step 1: Ask the user (see the gate above).**

- [ ] **Step 2: Write the test and the template section; run soft mode on premise, recording the wire**

```bash
DEBUG_HTTP_WIRE=true DEBUG_HTTP_BODY_CHARS=Infinity MCP_TEST_CONFIG=<the on-premise test config> \
  timeout 1800 npx jest --testPathPatterns=integration/debugger --runInBand --forceExit 2>&1 | tee <scratchpad>/debugger-onprem.log
```

Expected: PASS. If it fails, read the log; do not rerun blindly.

- [ ] **Step 3: Record answers.** From the log, save these as corpus cases in the sidecar shape of `tests/fixtures/adt/debugger-run-to-line--02-listen.json`:
- one memory-sizes answer and one `createMemorySnapshot` answer, as `debugger-memory--0N-*`;
- the AMDP start, an events batch with `SYNC_BREAKPOINTS`, one with `ON_BREAK`, one with `ON_EXECUTION_END`, and a data preview, as `amdp-debugger--0N-*`.

Sanitise them: `SAPUSER01`, `SID`, `sap.example.local`, the placeholder transport prefix. Then run `grep -rlE '<the system id>|<the user>' tests/fixtures/adt/amdp-* tests/fixtures/adt/debugger-memory-*`, filling in the real values locally. It must print nothing.

- [ ] **Step 4: The same on the cloud (its test config), including hard mode over Streamable HTTP and stdio.**

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/integration/debugger/ src/__tests__/integration/helpers/ tests/test-config.yaml.template docs/development/tests/test-config.yaml.template tests/fixtures/adt/amdp-debugger--* tests/fixtures/adt/debugger-memory--*
git commit -m "test(debugger): integration on premise and on the cloud, every transport; recorded AMDP and memory answers"
```

---

### Task 15: Reconciling a predecessor's breakpoints — only if Task 14 measured it possible

Spec D12: a restarted process with stated ids removes a predecessor's breakpoints, but only if Task 14 case 4 showed both of these:
- an empty breakpoint set posted under the same ids removes them;
- breakpoints under other ids survive.

If the measurement showed otherwise, this task is replaced by a documentation step. Spec D12 and `DEBUGGER.md` then say that a predecessor's breakpoints survive a restart, and how to clear them in an IDE. The user's word is needed either way, because the result changes the spec.

**Files (if possible):**
- Modify: `src/lib/debugger/DebugSession.ts` (`beforeFirstListen`)
- Test: `src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts`

**Interfaces:**
- `beforeFirstListen` additionally posts the empty set (`setBreakpoints(identity, [])`).
- Its outcome is answered by the start in `reconciled: { listener: 'stopped' | 'none', breakpoints: 'cleared' | 'kept' }`.

- [ ] **Step 1: Write the failing test.** With stated ids, the first start calls `stopListener` and then `setBreakpoints` with `[]` before its first poll. With random ids it calls neither.
- [ ] **Step 2: Run it and see it fail; implement; run it and see it pass**

Run: `npx jest src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts`

- [ ] **Step 3: A debuggee still held under these ids is reported, not released.** The start answers `reconciled.debuggee: <id>` when its first poll catches one at once with stated ids. Releasing it stays an explicit `DebugTerminate` or `DebugStep continue`.
- [ ] **Step 4: Commit**

```bash
git add src/lib/debugger/DebugSession.ts src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts
git commit -m "feat(debugger): a restart with stated ids clears what its predecessor armed"
```

---

### Task 16: Readings of the recorded AMDP and memory answers

**Files:**
- Modify:
  - `src/lib/debugger/amdpReadings.ts` (its stack too: spec §3 wants `ON_BREAK` with the stack);
  - `src/lib/debugger/memoryReadings.ts`;
  - the memory and watchpoint handlers (their terse projection);
  - `compact/src/debug/handleHandlerDebugView.ts`.
- Test: `src/__tests__/unit/debugger/amdpReadings.test.ts`, `src/__tests__/unit/debugger/memoryReadings.test.ts`

**Interfaces:**
- Produces:
  - `readMemorySizes(xml)` and `terseMemorySizes`. Name the fields after the elements of the recorded answer, and keep at most three in terse (spec §3).
  - `AmdpEvent.stack?: Array<…>`, with its shape taken from the recorded `ON_BREAK`.

- [ ] **Step 1: Write a failing test per recorded answer.** Use `corpusBody('amdp-debugger--0N-…')` / `corpusBody('debugger-memory--0N-…')` and assert values that are in the file. Move `amdpReadings.test.ts` from its inline shapes to the recorded cases, keeping the inline ones only where no recording covers a case.
- [ ] **Step 2: Run them and see them fail; fix the readings where the recording differs from the test-derived shape; add `readMemorySizes` and the AMDP stack; run them and see them pass.**

Run: `npx jest src/__tests__/unit/debugger/`

- [ ] **Step 3: Terse projections.** Use the new readings in `DebugGetMemorySizes`, `HandlerDebugView memory` and `MemorySnapshotGet overview`. `full` stays the parsed document, and `raw` stays the document.
- [ ] **Step 4: Commit**

```bash
git add src/lib/debugger/ src/handlers/debugger/ compact/src/debug/ src/__tests__/unit/debugger/
git commit -m "feat(debugger): readings of the recorded AMDP events (stack included) and memory answers"
```

---

### Task 17: Docs and the release preparation

**Files:**
- Create: `docs/user-guide/DEBUGGER.md`
- Modify:
  - `README.md`: Features (a debugger bullet) and the `debug` set.
  - `docs/user-guide/HANDLERS_MANAGEMENT.md`: Available Sets, Command Line, Handler Set Details.
  - `docs/user-guide/CLI_OPTIONS.md`: the `--exposition` values; env `SAP_DEBUG_TERMINAL_ID` and `SAP_DEBUG_IDE_ID`.
  - `docs/user-guide/CLIENT_CONFIGURATION.md`: the headers table (`x-sap-debug-terminal-id`, `x-sap-debug-ide-id`) and the env section.
  - `server/src/launcher.ts`: the help text near l.165-183.
  - `tools/generate-tools-docs.js`: also scan `src/handlers/debugger/debug/*.ts`, as a "Debug" section. Then regenerate `docs/user-guide/AVAILABLE_TOOLS*.md` (`npm run docs:tools`).
  - `compact/README.md` and `compact/docs/AVAILABLE_TOOLS.md`.
  - `CHANGELOG.md` and the compact packages' CHANGELOGs.
  - The versions and the registry metadata, as `releaseMetadata.test.ts` demands. The version is decided with the user: new tools mean a minor, unless #287 lands first and makes it a major.
- Delete: the spec and this plan, after the merge (CLAUDE.md, "Plans and Specs").

`DEBUGGER.md` covers:
- the debug session and its handle;
- the SAP ids and their overrides, and when sharing an id makes sense (the user's choice, D1);
- what keeps the live state on each transport (stdio process, SSE session, Streamable HTTP pool), and the measured reasons (D11, D13);
- auto-attach, and one debuggee at a time;
- no timeouts: what ends a session;
- that a breakpoint catches every request of the user; taking over another debugger;
- conflicts as errors;
- restarting with stated ids (D12) and what the breakpoint-set measurement showed;
- memory snapshots and `S_MEM_SNAP`;
- AMDP: a run starts after its sync is confirmed, and stop releases a suspended debuggee first.

It names nothing concrete; examples use placeholders.

- [ ] **Step 1: Write the docs; run `npm run docs:tools`; then run:**

`npx jest src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts src/__tests__/unit/releaseMetadata.test.ts src/__tests__/unit/binSmoke.test.ts`
Expected: PASS.

- [ ] **Step 2: Full unit suite, lint, build, lockfile**

Run: `npm run lint:check 2>&1 | tail -5; npm test 2>&1 | tee <scratchpad>/debugger-unit.log | tail -15; npm run build; grep -n '"link": true' package-lock.json`
Expected: no lint errors, all suites pass, a clean build, and no `"link": true` outside the workspace siblings.

- [ ] **Step 3: Commit and push to PR #290; hand over to the user**

```bash
git add -A docs README.md CHANGELOG.md compact tools server package.json package-lock.json server.json server-compact.json
git commit -m "docs(debugger): debugger guide, the debug set, transports"
git push
```

Ask for review of #290. After the merge, the release is a tag and a push, on the user's word. The user publishes the packages in dependency order (lib before compact, because compact needs `@mcp-abap-adt/lib/debugger`) and both registry entries. Then verify an installed copy in an isolated `--prefix`.

---

## Self-review

**Spec coverage:**

| Decision | Task |
|---|---|
| D1 (state in the instance, generic `state_handle`, invalidated after a complete stop) | 7, 10 |
| D2 (both scenarios) | 4, 5 (the run) |
| D3 (auto-attach) | 4 |
| D4 (no timeouts) | everywhere; only bounded waits inside a call |
| D5 (one debuggee at a time) | 4 |
| D6 (refuse / take over) | 10, 13 |
| D7 (compact verbs) | 13 |
| D8 (opt-in set) | 8 |
| D9 (one pool mechanism, owner index, lease) | 9 |
| D10 (no TTL; list, stop, limit) | 7, 9, 10 |
| D11 (measured needs) | 4, 6 |
| D12 (stdio restores the ids; reconciliation) | 5 (listener); 14 (measurement); 15 (breakpoints, if measured possible) |
| D13 (HTTP carries a session, RFC does not; pool) | 9 |
| D14 (owner, kinds, limit) | 7, 9, 13 |
| §2 core tools | 10–12 |
| §3 addressing and answers | 2, 3, 7, 16 |
| Descriptions (function only) | 7 (schemas), 10–13, ratchet test |
| §4 tests | 1–13 unit; 9 real HTTP; 14 integration and hard mode per transport |
| Release | 17 |

**Codex reviews, where each finding went:**

| Review | Findings | Where handled |
|---|---|---|
| First | 1 | the server imports only published lib subpaths, Tasks 7–9 |
| | 2 | a short first poll, awaited |
| | 3–7 | `Serial`, generation checks, captured stops |
| | 8 | `terminate()` |
| | 9 | the run belongs to its generation |
| | 10 | failures are kept and retried |
| | 11–14 | AMDP |
| | 15 | the login, never the responsible |
| | 16 | the instance owns the state |
| | 17 | Tasks 13 and 16 |
| | 18 | Task 14 |
| | 19 | `validationOnly` re-ask |
| | 20 | `until()` |
| | 21 | `debugAnswer(full)` |
| | 22 | system values come from the config |
| Second | lease, batch, owner, list, connections, dispose, one handle, limit, compact, restart, HTTP tests | Tasks 7, 9, 10, 13, 14 |
| Final | 1 | no `override` |
| | 2 | AMDP stop does not wait for the poll; the read loop finishes; measured in 14 |
| | 3, 5, 10 | failed cleanup is kept, retried and reported |
| | 4 | closed only after success; `disconnect()` never throws |
| | 6 | the owner rules of D9 |
| | 7 | owner index, slots, `peers` |
| | 8 | a lease revalidates its entry |
| | 9 | transport close in `finally`, after the response |
| | 11 | `endWhenEmpty` |
| | 12 | a start rolls back what it armed |
| | 13 | Task 15 |
| | 14, 17 | the `override` proxy; reads indexed relative; gated tests |
| | 15 | sync correlated apart; the step–break race |
| | 16 | descriptions |

| Fourth (on `3f12c5eb`) | 1 (empty-state notifications) | `InstanceState.attach` samples the part, `dispose` reconciles, `changed` updates before telling; sessions notify after every change (`mutate`) and when `report()` consumes |
| | 2 (reservations) | a pending reservation holds the slot; slots are released per kind after each request |
| | 3 (eviction vs leases) | one `onEmpty` subscription per instance; eviction waits for the instance's requests; one disposal at a time |
| | 4 (failed or unfinished disposal) | a failed instance stays held for a retry; `shutdown` drains disposals and retries them |
| | 5 (asynchronous AMDP end) | `InstanceState.endWhenEmpty`: the handle is invalidated when the last part empties, synchronously or later |
| | 6 (final-batch cleanup) | `unreleased` and `stopped` are kept on `closing`; `stop()` retries; an event-read failure goes through the same path; the breakpoint clear is checked |
| | 7 (raw start answers) | `debugAnswer(…, extraOf)`: under raw, the handle is a block of its own beside SAP's document |
| | 8 (disconnect during dispatch) | dispatch races the disconnect; the transport closes at once; `BaseMcpServer.idle()` holds the lease until the handlers settle; tested in JSON and SSE modes |
| | 9 (exceptions after arming) | placements are recorded at once; the whole start after arming rolls back |
| | 10 (server jest mapping) | `server/package.json` gains `/state` and `/debugger`; server tests run from `server/` |
| | 11 (descriptions) | `DebugStop` and `DebugListSessions` no longer list their answer |

| Fifth (on `92f1d0da`) | 1 (disposal ≠ completion) | an instance leaves the pool only when it holds nothing after disposal; shutdown waits for what is still finishing |
| | 2 (fresh disposal failure) | `retained` holds fresh and held instances alike; shutdown retries them |
| | 3 (breakpoint clear) | `Open.cleared`; retried in `finishClosing` until it succeeds |
| | 4 (attach exception in start) | `report()` inside the protected part; each rollback step runs on its own |
| | 5 (`idle()` before connection) | the wrapper is tracked from its entry |
| | 6 (re-entry before the guard) | the eviction promise is registered before `dispose()` |

| Sixth (on `bc99e2d3`) | 1 (late cleanup failure invisible to shutdown) | `StatePart.pending()`/`failures()`; shutdown waits until settled, retries once what still holds, reports it |
| | 2 (`busy` retained every instance) | the entry is deleted at zero |
| | 3 (AMDP restart test ids) | the fake answers `nextSync()`; the test never counts ids by hand |
| | 4 (retry tests without failure) | the tests wait for the failed attempt before restoring, then check retry and closure |
| | (subscriptions) | `onChange` answers its unsubscribe; `settled()` unsubscribes |

| Seventh (on `9218a035`) | shutdown after a disposal that threw | every owned instance settles before the retry; the failure recorded by the throw is replaced by what is left after settling and one retry |

| Eighth (on `ee01ff32`) | stdio and SSE finished before AMDP cleanup settled | `InstanceState.shutdown()` — dispose, settle, once more, settle, answer what is left — used by stdio at exit, by SSE when a session closes (owned until it settles; `stop()` waits) and available to every host |
| | `%2f` vs `%2F` | the assertion takes `encodeURIComponent`'s upper-case hex |
| | `MemorySnapshotList` description | no answer fields |

**Placeholders.** The only `<…>` tokens are in run commands, where local config and scratchpad values go. They are deliberately not written down: plans name no system.

**Type consistency.**
- `InstanceState`: `handle`, `holdsState`, `describe`, `admit`, `check`, `endWhenEmpty`, `onEmpty`, `dispose`, `host`.
- `StateHost`: `owner`, `reserve`, `peers`.
- `DebuggerInstance` (a `StatePart`): `abap`, `amdp`, `stop`, `dispose`, `describe`, `observe`.
- `DebugSession`: `start(mode, {breakpoints, run})`, `wait`, `stop`, `holdsState`, `describe`, `observe`, `ids`.
- `AmdpSession`: `start({stopExisting, breakpoints, run})`, `setBreakpoints`, `startRun`, `observe`.
- `requireDebugger(context, args, {create} | 'use')`.
- `debugAnswer(args, work, terse, full?, extraOf?)` and `debugStateAnswer(args, work, extraOf?)`.
- `InstancePool.serve({handle, owner}, create, work)` and `shutdown()`.
