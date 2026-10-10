# Debugger tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A model debugs ABAP and AMDP through the server. It can set breakpoints, catch a program at one, read the stack, variables and memory, step, and release the program. This works both when the model starts the program and when someone else does. It ships for every transport: stdio, SSE, Streamable HTTP (through a pool of instances), and compact.

**Architecture:**
- **The state lives in the server instance.** Each `BaseMcpServer` instance lazily owns one debugger instance: a `DebugSession` (ABAP), an `AmdpSession`, an opaque handle (`debug_session`) and the SAP ids (`terminalId`/`ideId`), which go into the constructor.
- **Handlers reach it through `HandlerContext.debugger`.** The starting tools return the handle, and every other session tool requires it.
- **Who keeps the instance between calls depends on the transport.**
  - stdio: the process. A restarted process recovers only the ids.
  - SSE: the SSE session, one instance per GET connection, disposed when it closes.
  - Streamable HTTP: `InstancePool` in `server/src`. Per request it takes the instance named by `debug_session` (owner checked) or a new one, keeps it while `holdsState()` and disposes it otherwise.

**Tech Stack:**
- TypeScript 6, Jest 30 + ts-jest, fast-xml-parser 5.
- `@mcp-abap-adt/adt-clients` 27.0.0: `AbapDebugger`, `AmdpDebugger`, `MemorySnapshots`, `AdtExecutor`, `getSystemInformation`.
- `@mcp-abap-adt/adt-strategies` 0.8.1: `analyseDebuggeeEnd`, `analyseException`, `readExceptionSubType`.
- `@mcp-abap-adt/interfaces-adt` 13.2.0.

**Spec:** `docs/superpowers/specs/2026-10-10-debugger-tools-design.md` (decisions D1–D14).

## Global Constraints

- **State lives in the instance, never in a module global.** One debugger instance per `BaseMcpServer` instance (D1). One process may hold several server instances, so module-level state is forbidden.
- **Handle.** `debug_session` is 32 upper-case hex characters from `crypto.randomBytes(16)`. The starting tools return it: `DebugStartListener`, `DebugTakeOverListener`, `AmdpDebugStart` and compact `HandlerDebugStart`. Every session tool takes it as a required argument. A handle that is not this instance's is answered `debug session is not available`. Memory snapshot tools take none.
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
  - A JSON-RPC batch carrying `debug_session` is refused.
  - The owner is the destination plus the SAP user.
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
3. **A foreign or stale handle.** Another instance's handle, a handle after `DebugStop`, and garbage all get `debug session is not available`, and nothing is sent to SAP. *Pinned in Task 7.*
4. **Breakpoint answers reordered and with refusals.** Matching is by content. A refusal that is ambiguous within its kind is re-asked one by one with `validationOnly`. *Pinned in Task 4.*
5. **Two requests at once for one pooled instance, and shutdown with instances in the pool.** The second request waits for the first (one transport at a time). Shutdown disposes every pooled instance and reports what failed. *Pinned in Task 9.*

---

## File structure

**Create (lib):**
- `src/lib/debugger/ids.ts` — ids, the handle, the stated overrides.
- `src/lib/debugger/objectUri.ts` — source URI from `{object_type, object_name, include?, parent_name?}`, and its inverse `addressOf(uri)`.
- `src/lib/debugger/readings.ts` — ABAP debugger documents → readings; terse projections.
- `src/lib/debugger/amdpReadings.ts`, `src/lib/debugger/memoryReadings.ts`.
- `src/lib/debugger/serial.ts` — `Serial`, the per-session async mutex.
- `src/lib/debugger/DebugSession.ts` — the ABAP state machine.
- `src/lib/debugger/AmdpSession.ts` — the AMDP state machine.
- `src/lib/debugger/ports.ts` — the live ports: connections, debuggers, request user, run.
- `src/lib/debugger/DebuggerInstance.ts` — handle + ids + both sessions + `holdsState()` + `dispose()` + `describe()`.
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
- Docs (Task 15).

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
    expect(sourceUriOf({ object_type: 'CLAS', object_name: '/NS/CL_A' })).toBe('/sap/bc/adt/oo/classes/%2fns%2fcl_a/source/main');
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
  start(mode: IDebuggerListenerConflict, run?: RunTarget): Promise<DebugState>;
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
  const make = (): Debugger =>
    ({
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
    }) as unknown as Debugger;
  const ports: DebugSessionPorts<string> = {
    openConnection: async () => { const c = { id: opened.length } as unknown as IAbapConnection; opened.push(c); return c; },
    closeConnection: async (c) => { closed.push(c); },
    abapDebugger: () => make(),
    requestUser: async () => 'SAPUSER01',
    run: async () => run.promise,
  };
  return { ports, polls, opened, closed, calls, run, stepAnswers, attachAnswers,
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
    const started = session.start('refuse', { kind: 'class', name: 'ZCL_X' });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    expect(world.closed).toEqual(world.opened);
    expect(ran).not.toHaveBeenCalled();
    expect((await session.wait(0)).state).toBe('idle');
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
  protected async close(connection: IAbapConnection | undefined): Promise<void> {
    if (!connection || this.closedConnections.has(connection)) return;
    this.closedConnections.add(connection);
    await this.ports.closeConnection(connection);
  }
  protected async controlDebugger(): Promise<Debugger> {
    if (!this.control) {
      const connection = await this.open();
      this.control = { connection, debugger: this.ports.abapDebugger(connection, this.mode) };
    }
    return this.control.debugger;
  }
  protected notify(): void { for (const w of [...this.waiters]) w(); }
  private owns(listener: Listener, generation: number): boolean {
    return this.listener === listener && this.generation === generation;
  }

  // --- breakpoints ------------------------------------------------------------
  setBreakpoints(list: IDebuggerBreakpoint[]): Promise<DebugView<BreakpointsAnswer>> {
    return this.serial.run(async () => {
      const identity = await this.identity();
      const dbg = await this.controlDebugger();
      const answer = await dbg.setBreakpoints(identity, list);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      const raw = valueOf(answer);
      const rows = readBreakpoints(raw);
      const placed = rows.filter((r) => r.id);
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
          const one = await dbg.setBreakpoints(identity, [requested], { validationOnly: true });
          const error = one.ok ? readBreakpoints(valueOf(one)).find((r) => r.error)?.error : messageOf(one);
          refused.push({ requested, error: error ?? 'refused without a reason' });
        }
      }
      for (const p of placed) this.armed.set(p.id!, p);
      return { value: { placed, refused }, raw };
    });
  }

  deleteBreakpoint(id: string): Promise<void> {
    return this.serial.run(async () => {
      const answer = await (await this.controlDebugger()).deleteBreakpoint(await this.identity(), id);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      this.armed.delete(id);
    });
  }

  listBreakpoints(): BreakpointReading[] { return [...this.armed.values()]; }

  // --- listener -----------------------------------------------------------------
  start(mode: IDebuggerListenerConflict, run?: RunTarget): Promise<DebugState> {
    return this.serial.run(async () => {
      if (this.listener || this.current) throw new DebugStateError('a listener is already running for this debug session');
      const identity = await this.identity();
      this.mode = mode;
      this.failure = undefined;
      await this.beforeFirstListen(identity);               // Task 5: reconciliation
      const connection = await this.open();
      const listener: Listener = { connection, debugger: this.ports.abapDebugger(connection, mode) };
      const generation = ++this.generation;
      this.listener = listener;
      const first = await this.poll(listener, identity, FIRST_POLL_HOLD_SECONDS);
      if (!first.ok) {
        await this.dropListener();
        throw new DebugListenerError(messageOf(first));
      }
      const caught = readDebuggee(valueOf(first));
      if (caught) await this.attachTo(caught, valueOf(first), generation);
      if (!this.current && this.owns(listener, generation)) void this.loop(listener, generation);
      if (run && this.owns(listener, generation)) this.startRun(run, generation); // Task 5
      return this.report();
    });
  }

  private poll(listener: Listener, identity: IDebuggerIdentity, holdSeconds: number): Promise<IAdtResponse<string>> {
    return listener.debugger.listen(identity, { holdSeconds }).catch(asFailure);
  }

  private async loop(listener: Listener, generation: number): Promise<void> {
    const identity = await this.identity();
    for (;;) {
      if (!this.owns(listener, generation) || this.current) return;
      const answer = await this.poll(listener, identity, LISTEN_HOLD_SECONDS);
      const goOn = await this.serial.run(() => this.onPoll(listener, generation, answer));
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
      throw new DebugListenerError(message);
    }
    const notice = this.notices.shift();
    if (notice) return notice;
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
    return this.serial.run(async () => {
      const stop = this.requireStop();
      return this.afterMove(stop, await stop.debugger.step(method, { analyse: analyseDebuggeeEnd }));
    });
  }

  stepToLine(method: IDebuggerStepToLineMethod, uri: string): Promise<DebugState> {
    return this.serial.run(async () => {
      const stop = this.requireStop();
      return this.afterMove(stop, await stop.debugger.stepToLine(method, uri, { analyse: analyseDebuggeeEnd }));
    });
  }

  /** The default strategy answers nothing for `done`: success is the end itself. */
  terminate(): Promise<DebugState> {
    return this.serial.run(async () => {
      const stop = this.requireStop();
      const answer = await stop.debugger.terminateDebuggee({ analyse: analyseDebuggeeEnd });
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      await this.releaseStop(stop);
      return { state: 'ended', reason: 'terminated' };
    });
  }

  getStack(): Promise<DebugView<StopView>> {
    return this.serial.run(async () => {
      const stop = this.requireStop();
      const stack = await stop.debugger.getStack();
      if (!stack.ok) throw new DebugRequestError(messageOf(stack));
      stop.view = { ...stop.view, stack: readStack(valueOf(stack)), stackError: undefined, raw: { ...stop.view.raw, stack: valueOf(stack) } };
      return { value: stop.view, raw: valueOf(stack) };
    });
  }

  setStackPosition(position: number): Promise<DebugView<StopView>> {
    return this.serial.run(async () => {
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
    return this.serial.run(async () => {
      const answer = await call(this.requireStop().debugger);
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      return { value: readVariables(valueOf(answer)), raw: valueOf(answer) };
    });
  }
  getVariables(names: string[]) { return this.variables((d) => d.getVariables(names.map((n) => n.toUpperCase()))); }
  getChildVariables(parents: string[]) { return this.variables((d) => d.getChildVariables(parents.map((n) => n.toUpperCase()))); }
  setVariable(name: string, value: string) { return this.variables((d) => d.setVariableValue(name.toUpperCase(), value)); }

  private document(call: (d: Debugger) => Promise<IAdtResponse<unknown>>): Promise<DebugView<string>> {
    return this.serial.run(async () => {
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
- Modify: `src/lib/debugger/DebugSession.ts` (replace the two Task 5 hooks; add `stop`, `holdsState`, `describe`)
- Test: `src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts`

**Interfaces:**
- Produces:

```ts
  stop(): Promise<void>;          // throws DebugCleanupError listing what could not be undone; idempotent
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
    const s = session.start('refuse', run);
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
    const dbg = world.ports.abapDebugger;
    world.ports.abapDebugger = (c, m) => Object.assign(dbg(c, m), { deleteBreakpoint: async () => refusedResponse('not authorised') }) as any;
    await expect(session.stop()).rejects.toThrow(DebugCleanupError);
    expect(session.listBreakpoints()).toHaveLength(1);
    expect(session.holdsState()).toBe(true);
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

  protected override async beforeFirstListen(identity: IDebuggerIdentity): Promise<void> {
    if (!this.ids.stated || this.reconciled) return;
    this.reconciled = true;
    // A predecessor under these ids may have left a listener (D12); its absence is no failure.
    await (await this.controlDebugger()).stopListener(identity).catch(() => undefined);
  }

  protected override startRun(target: RunTarget, generation: number): void {
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
    return this.serial.run(async () => {
      this.generation++;
      const failures: string[] = [];
      const stop = this.current;
      this.current = undefined;
      if (stop) {
        const released = await stop.debugger.step('stepContinue', { analyse: analyseDebuggeeEnd }).catch(asFailure);
        if (!released.ok) failures.push(`release the debuggee: ${messageOf(released)}`);
        await this.close(stop.connection);
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
            if (!stopped.ok) failures.push(`listener: ${messageOf(stopped)}`);
          }
        } catch (error) {
          failures.push(thrown(error));
        }
      }
      const listener = this.listener;
      this.listener = undefined;
      await this.close(listener?.connection);
      await this.close(this.control?.connection);
      this.control = undefined;
      await this.close(this.run?.connection);
      this.run = undefined;
      this.failure = undefined;
      this.notices.length = 0;
      this.cleanupFailures = failures;
      this.notify();
      if (failures.length) throw new DebugCleanupError(failures.join('; '));
    });
  }

  holdsState(): boolean {
    return !!this.listener || !!this.current || this.armed.size > 0 || this.notices.length > 0
      || !!this.run || this.failure !== undefined || this.cleanupFailures.length > 0;
  }

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
  holdsState(): boolean;
  describe(): { kind: 'amdp'; state: 'idle' | 'waiting' | 'stopped'; debuggee?: string };
}
```

**The AMDP rules taken from the measured protocol:**
- Events are read on one session and commands go on another. The events are read in the background, so a model's wait is bounded by its own hold, not by the server's 200 s poll.
- A breakpoint sync is answered at once with a request id in `Location`. Its outcome arrives later as a `SYNC_BREAKPOINTS` event carrying that request id. `start` runs the program only after that event.
- `ON_BREAK` names the stopped debuggee.
  - A `step` makes the debuggee moving, so the debuggee id is cleared until the next `ON_BREAK`.
  - `ON_EXECUTION_END` clears it as well.
- A stop never releases a suspended debuggee. So `stop()` sends an empty breakpoint sync first, deletes the known debuggee, then sends `stop`. After that it closes the event connection, which aborts the poll. It deletes a debuggee that the last batch of events named, and only then closes the command connection. Failures are collected and thrown as `DebugCleanupError`.
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
  return { session, reads, calls, closed, dbg, run };
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

  it('stop releases a suspended debuggee before the stop; a break in the last batch is deleted too', async () => {
    const w = await started();
    w.reads[1].resolve(okResponse(BREAK));
    await until(() => w.reads.length === 3);
    const stopping = w.session.stop();
    await until(() => w.calls.includes('stop'));
    w.reads[2].resolve(okResponse(BREAK.replace('D1', 'D2')));
    await stopping;
    expect(w.calls.indexOf('delete:D1')).toBeGreaterThan(-1);
    expect(w.calls.indexOf('delete:D1')).toBeLessThan(w.calls.indexOf('stop'));
    expect(w.calls).toContain('delete:D2');
    expect(w.closed).toHaveLength(2);
    expect(w.session.holdsState()).toBe(false);
  });

  it('a failed event read fails the next wait once, closes the session, and allows a new start', async () => {
    const w = await started();
    w.reads[1].resolve(refusedResponse('session gone'));
    await until(() => w.closed.length === 2);
    await expect(w.session.wait(0)).rejects.toThrow(/session gone/);
    expect((await w.session.wait(0)).state).toBe('idle');
    await started(w);
  });

  it('a cleanup that fails is reported', async () => {
    const w = await started();
    w.dbg.stop = async () => refusedResponse('not stopped');
    const stopping = w.session.stop();
    w.reads[1].resolve(okResponse('<amdpdbg:events xmlns:amdpdbg="x"/>'));
    await expect(stopping).rejects.toThrow(DebugCleanupError);
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
 * The AMDP debugger's state — one per server instance (D1), one AMDP session
 * at a time. Events on one session, commands on another (measured); events are
 * read in the background so a wait is bounded by its own hold. A sync is
 * answered with a request id and confirmed by its SYNC_BREAKPOINTS event; a
 * run starts only after that. A stop never releases a suspended debuggee
 * (measured), so stop() deletes it first. Nothing ends on a timer of ours.
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
  mainId: string; hanaSession: string; generation: number;
  reading?: Promise<void>; lastBatch: AmdpEvent[];
}

const thrown = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class AmdpSession<O = unknown> {
  private readonly serial = new Serial();
  private origin?: O;
  private open?: Open;
  private generation = 0;
  private debuggeeId?: string;
  private queue: AmdpEvent[] = [];
  private notices: AmdpState[] = [];
  private failure?: string;
  private runGeneration?: number;
  private readonly waiters = new Set<() => void>();

  constructor(private readonly ports: AmdpSessionPorts<O>) {}
  bind(origin: O): this { this.origin = origin; return this; }

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
  private notify(): void { for (const w of [...this.waiters]) w(); }

  start(options: { stopExisting: boolean; breakpoints: AmdpBreakpoint[]; run?: RunTarget }) {
    return this.serial.run(async () => {
      if (this.open) throw new DebugStateError('an AMDP debug session is already running for this debug session');
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
      const open: Open = { events, commands, onEvents, onCommands, mainId, hanaSession, generation: ++this.generation, lastBatch: [] };
      this.open = open;
      this.failure = undefined;
      open.reading = this.readLoop(open);
      const states = await this.sync(open, options.breakpoints);
      if (options.run) this.startRun(options.run);
      return { mainId, breakpoints: states };
    });
  }

  /** Sends a sync and waits, inside this call, for its SYNC_BREAKPOINTS. */
  private async sync(open: Open, list: AmdpBreakpoint[]): Promise<string[]> {
    const breakpoints = list.map((b) => ({ clientId: randomUUID(), uri: lineUriOf({ object_type: 'CLAS', object_name: b.class_name }, b.line) }));
    const answer = await open.onCommands.syncBreakpoints(open.mainId, breakpoints);
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    const requestId = locationId(answer.getResult().value as any);
    const deadline = WAIT_MAX_SECONDS * 1000;
    const found = () => this.queue.find((e) => e.kind === 'SYNC_BREAKPOINTS' && e.requestId === requestId);
    if (!found()) {
      await new Promise<void>((resolve) => {
        const done = () => { if (!found() && this.open === open && this.failure === undefined) return; clearTimeout(t); this.waiters.delete(done); resolve(); };
        const t = setTimeout(() => { this.waiters.delete(done); resolve(); }, deadline);
        this.waiters.add(done);
      });
    }
    const event = found();
    if (!event) throw new DebugRequestError('the breakpoints were sent but their outcome did not arrive within this call; nothing was run');
    this.queue = this.queue.filter((e) => e !== event);
    return event.states;
  }

  private async readLoop(open: Open): Promise<void> {
    while (this.open === open && open.generation === this.generation) {
      let answer: any;
      try { answer = await open.onEvents.getEvents(open.mainId); }
      catch (e) { answer = { ok: false, getError: () => ({ message: thrown(e) }) }; }
      const events = answer.ok ? readAmdpEvents(String(answer.getResult().value ?? '')) : [];
      open.lastBatch = events;
      if (this.open !== open) return;  // stop() owns the rest
      if (!answer.ok) {
        this.failure = answer.getError().message;
        this.open = undefined;
        this.debuggeeId = undefined;
        await open.onCommands.stop(open.mainId).catch(() => undefined);
        await this.ports.closeConnection(open.events);
        await this.ports.closeConnection(open.commands);
        this.notify();
        return;
      }
      for (const e of events) {
        if (e.kind === 'ON_BREAK') this.debuggeeId = e.debuggeeId;
        if (e.kind === 'ON_EXECUTION_END' && e.debuggeeId === this.debuggeeId) this.debuggeeId = undefined;
      }
      if (events.length) { this.queue.push(...events); this.notify(); }
    }
  }

  setBreakpoints(list: AmdpBreakpoint[]): Promise<DebugView<string[]>> {
    return this.serial.run(async () => {
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
    if (this.failure !== undefined) { const m = this.failure; this.failure = undefined; throw new DebugListenerError(m); }
    if (this.queue.length) return { state: 'event', events: this.queue.splice(0) };
    const notice = this.notices.shift();
    if (notice) return notice;
    return this.open ? { state: 'waiting' } : { state: 'idle' };
  }

  step(step: 'over' | 'continue'): Promise<DebugView<string>> {
    return this.serial.run(async () => {
      const open = this.requireOpen();
      const debuggee = this.requireDebuggee();
      const answer = await open.onCommands.step(open.mainId, debuggee, step);
      if (!answer.ok) throw new DebugRequestError(answer.getError().message);
      this.debuggeeId = undefined; // moving until the next ON_BREAK
      return { value: 'moving', raw: '' };
    });
  }

  getTable(variable: string, query?: string) {
    return this.serial.run(async () => {
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
    return this.serial.run(async () => {
      const open = this.requireOpen();
      const answer = await open.onCommands.deleteDebuggee(open.mainId, this.requireDebuggee());
      if (!answer.ok) throw new DebugRequestError(answer.getError().message);
      this.debuggeeId = undefined;
    });
  }

  stop(): Promise<void> {
    return this.serial.run(async () => {
      const open = this.open;
      this.open = undefined;
      this.generation++;
      this.runGeneration = undefined;
      const failures: string[] = [];
      if (open) {
        const deleted = new Set<string>();
        const del = async (id: string) => {
          if (deleted.has(id)) return;
          deleted.add(id);
          const a = await open.onCommands.deleteDebuggee(open.mainId, id).catch((e) => ({ ok: false, getError: () => ({ message: thrown(e) }) }) as any);
          if (!a.ok) failures.push(`release debuggee ${id}: ${a.getError().message}`);
        };
        await open.onCommands.syncBreakpoints(open.mainId, []).catch(() => undefined);
        if (this.debuggeeId) await del(this.debuggeeId);
        const stopped = await open.onCommands.stop(open.mainId).catch((e) => ({ ok: false, getError: () => ({ message: thrown(e) }) }) as any);
        if (!stopped.ok) failures.push(`stop: ${stopped.getError().message}`);
        await this.ports.closeConnection(open.events);          // aborts the event poll
        await open.reading?.catch(() => undefined);
        for (const e of open.lastBatch) if (e.kind === 'ON_BREAK') await del(e.debuggeeId);
        await this.ports.closeConnection(open.commands);
      }
      this.debuggeeId = undefined;
      this.queue = [];
      this.notices = [];
      this.failure = undefined;
      this.notify();
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
    return !!this.open || this.queue.length > 0 || this.notices.length > 0 || this.runGeneration !== undefined || this.failure !== undefined;
  }

  describe() {
    return {
      kind: 'amdp' as const,
      state: this.debuggeeId ? ('stopped' as const) : this.open ? ('waiting' as const) : ('idle' as const),
      ...(this.debuggeeId ? { debuggee: this.debuggeeId } : {}),
    };
  }
}
```

In the "stop releases …" test, the last event poll (`reads[2]`) is resolved only after `stop` was sent. So `stop()` must wait for `open.reading` to see that batch before it deletes `D2`. In the fake, closing the event connection does not abort the read; the test resolves it by hand. In production, closing the connection aborts the read, and `reading` resolves with the failure path. That path is skipped because `this.open !== open`.

- [ ] **Step 5: Run them and see them pass**

Run: `npx jest src/__tests__/unit/debugger/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/debugger/amdpReadings.ts src/lib/debugger/memoryReadings.ts src/lib/debugger/AmdpSession.ts src/__tests__/unit/debugger/
git commit -m "feat(debugger): AmdpSession — run after its sync is confirmed, debuggee tracked by events, stop releases first"
```

---

### Task 7: The debugger in the server instance — ports, `DebuggerInstance`, access, answers

**Files:**
- Create:
  - `src/lib/debugger/ports.ts`
  - `src/lib/debugger/DebuggerInstance.ts`
  - `src/lib/debugger/access.ts`
  - `src/lib/debugger/answer.ts`
  - `src/lib/debugger/schemas.ts`
  - `src/lib/debugger/index.ts`
- Modify:
  - `src/handlers/interfaces.ts:8` (`HandlerContext`)
  - `src/embeddable/BaseMcpServer.ts` (constructor fields, the context built at l.257-261, new `dispose`/`holdsState`/`debugHandle`)
  - `package.json` (`exports["./debugger"]`, `typesVersions["*"].debugger`)
- Test:
  - `src/__tests__/unit/debugger/ports.test.ts`
  - `src/__tests__/unit/debugger/access.test.ts`
  - `src/__tests__/unit/debugger/answer.test.ts`
  - `src/__tests__/unit/debugger/baseMcpServerDebugger.test.ts`

**Interfaces:**
- Produces:

```ts
// handlers/interfaces.ts
export interface HandlerContext { connection: IAbapConnection; logger?: ILogger; debugger?: () => DebuggerInstance }
// ports.ts
export async function requestUserOf(connection: IAbapConnection): Promise<string>;   // systeminformation → login; never the responsible
export function liveDebugPorts(): DebugSessionPorts<HandlerContext>;
export function liveAmdpPorts(): AmdpSessionPorts<HandlerContext>;
// DebuggerInstance.ts
export class DebuggerInstance {
  constructor(sessions: { abap: DebugSession<HandlerContext>; amdp: AmdpSession<HandlerContext> }, handle?: string);
  readonly handle: string;             // 32 upper-case hex
  readonly abap: DebugSession<HandlerContext>;
  readonly amdp: AmdpSession<HandlerContext>;
  holdsState(): boolean;               // abap || amdp
  describe(): Array<{ debug_session: string; terminal_id: string; ide_id: string } & ({ kind: 'abap'; state: string; breakpoints: number } | { kind: 'amdp'; state: string; debuggee?: string })>;
  stop(): Promise<void>;               // both kinds; DebugCleanupError aggregating both
  dispose(): Promise<void>;            // = stop()
}
export function createDebuggerInstance(ids?: DebuggerIds & { stated: boolean }): DebuggerInstance;  // live ports; ids resolved in the caller's scope
// access.ts
export class DebugSessionUnavailableError extends Error {}   // message: 'debug session is not available'
export function requireDebugger(context: HandlerContext, args: unknown, mode: 'create' | 'use'): DebuggerInstance;
// answer.ts
export async function debugAnswer<T>(args: unknown, work: () => Promise<DebugView<T>>, terse: (v: T) => unknown, full?: (v: T) => unknown): Promise<McpResult>;
export async function debugStateAnswer(args: unknown, work: () => Promise<DebugState>, extra?: Record<string, unknown>): Promise<McpResult>;
// schemas.ts
export const DEBUG_SESSION_PROPERTY, HOLD_SECONDS_PROPERTY, BREAKPOINTS_PROPERTY, AMDP_BREAKPOINTS_PROPERTY, RUN_PROPERTY;
export const USER_MODE_SENTENCE: string;   // a fact of the function
export const TAKE_OVER_SENTENCE: string;
export function breakpointsFromArgs(raw: unknown): IDebuggerBreakpoint[];
export function amdpBreakpointsFromArgs(raw: unknown): AmdpBreakpoint[];
export function runFromArgs(raw: unknown): RunTarget | undefined;
// BaseMcpServer
get debugHandle(): string | undefined;   // set once the instance has a debugger
holdsState(): boolean;
dispose(): Promise<void>;                // awaited; stops both kinds; throws DebugCleanupError
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/access.test.ts
import { DebugSessionUnavailableError, requireDebugger } from '../../../lib/debugger/access';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';

const fakeSession = (holds: boolean) => ({ holdsState: () => holds, bind() { return this; }, describe: () => ({}), stop: async () => {} }) as any;
const context = (inst: DebuggerInstance) => ({ connection: {} as any, debugger: () => inst });

describe('requireDebugger', () => {
  it('create mode gives the instance, whatever the arguments', () => {
    const inst = new DebuggerInstance({ abap: fakeSession(false), amdp: fakeSession(false) });
    expect(requireDebugger(context(inst), {}, 'create')).toBe(inst);
  });
  it('use mode wants this instance handle and held state', () => {
    const inst = new DebuggerInstance({ abap: fakeSession(true), amdp: fakeSession(false) });
    expect(requireDebugger(context(inst), { debug_session: inst.handle }, 'use')).toBe(inst);
  });
  it.each([
    ['missing', {}],
    ['foreign', { debug_session: 'F'.repeat(32) }],
    ['garbage', { debug_session: 42 }],
  ])('a %s handle is not available, the same answer for all', (_n, args) => {
    const inst = new DebuggerInstance({ abap: fakeSession(true), amdp: fakeSession(false) });
    expect(() => requireDebugger(context(inst), args, 'use')).toThrow(DebugSessionUnavailableError);
    expect(() => requireDebugger(context(inst), args, 'use')).toThrow('debug session is not available');
  });
  it('a handle whose session holds nothing any more is not available', () => {
    const inst = new DebuggerInstance({ abap: fakeSession(false), amdp: fakeSession(false) });
    expect(() => requireDebugger(context(inst), { debug_session: inst.handle }, 'use')).toThrow(DebugSessionUnavailableError);
  });
  it('a server instance without a debugger refuses plainly', () => {
    expect(() => requireDebugger({ connection: {} as any }, {}, 'create')).toThrow(/debugging is not served/);
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
  it('extra fields (handle, ids) join a state', async () => {
    const r = await debugStateAnswer({}, async () => ({ state: 'listening' }), { debug_session: 'H' });
    expect(JSON.parse(r.content[0].text)).toEqual({ state: 'listening', debug_session: 'H' });
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

Before you write `requestUserOf`, read `node_modules/@mcp-abap-adt/adt-clients/dist/utils/systemInfo.js`. If `getSystemInformation` throws on a 404 instead of answering `null`, map only the not-found case to `null`. An authentication or network failure must propagate (review finding 15). Keep the tests unchanged.

```ts
// src/__tests__/unit/debugger/baseMcpServerDebugger.test.ts
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { MockAbapConnection } from '../../../embeddable/MockAbapConnection';

describe('the server instance owns its debugger', () => {
  it('two instances, two debuggers with different handles; neither holds state at first', () => {
    const a = new EmbeddableMcpServer({ connection: new MockAbapConnection() as any, exposition: ['readonly'] } as any);
    const b = new EmbeddableMcpServer({ connection: new MockAbapConnection() as any, exposition: ['readonly'] } as any);
    expect(a.holdsState()).toBe(false);
    expect(a.debugHandle).toBeUndefined();
    const ia = (a as any).debuggerFor();
    const ib = (b as any).debuggerFor();
    expect(ia.handle).not.toBe(ib.handle);
    expect(a.debugHandle).toBe(ia.handle);
  });
  it('dispose with nothing held resolves', async () => {
    const a = new EmbeddableMcpServer({ connection: new MockAbapConnection() as any, exposition: ['readonly'] } as any);
    await expect(a.dispose()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/access.test.ts src/__tests__/unit/debugger/answer.test.ts src/__tests__/unit/debugger/ports.test.ts src/__tests__/unit/debugger/baseMcpServerDebugger.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement `ports.ts`**

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

Check the `run({…}, {analyse})` shape against `handleRuntimeRunClass.ts:146-156` and `handleRuntimeRunProgram.ts:107-119`, and copy what those use. Check the root exports with `grep -n "AbapDebugger\|AdtExecutor\|getSystemInformation\|AmdpDebugger" node_modules/@mcp-abap-adt/adt-clients/dist/index.d.ts`. Import anything missing from `/runtime` or `/core`.

- [ ] **Step 4: Implement `DebuggerInstance.ts`, `access.ts`, `answer.ts`, `schemas.ts`, `index.ts`**

```ts
// src/lib/debugger/DebuggerInstance.ts
import type { HandlerContext } from '../../handlers/interfaces';
import { AmdpSession } from './AmdpSession';
import { DebugCleanupError, DebugSession } from './DebugSession';
import { type DebuggerIds, newDebuggerId, resolveDebuggerIds } from './ids';
import { liveAmdpPorts, liveDebugPorts } from './ports';

/** One server instance's debugger: its handle, its SAP ids, both kinds. */
export class DebuggerInstance {
  readonly handle: string;
  readonly abap: DebugSession<HandlerContext>;
  readonly amdp: AmdpSession<HandlerContext>;
  constructor(sessions: { abap: DebugSession<HandlerContext>; amdp: AmdpSession<HandlerContext> }, handle = newDebuggerId()) {
    this.abap = sessions.abap;
    this.amdp = sessions.amdp;
    this.handle = handle;
  }
  holdsState(): boolean { return this.abap.holdsState() || this.amdp.holdsState(); }
  describe() {
    const ids = { debug_session: this.handle, terminal_id: this.abap.ids.terminalId, ide_id: this.abap.ids.ideId };
    return [
      ...(this.abap.holdsState() ? [{ ...ids, ...this.abap.describe() }] : []),
      ...(this.amdp.holdsState() ? [{ ...ids, ...this.amdp.describe() }] : []),
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

`DebugSession.ids` is declared `readonly ids` in Task 4, and it is public, so `describe()` can read it.

```ts
// src/lib/debugger/access.ts
import type { HandlerContext } from '../../handlers/interfaces';
import type { DebuggerInstance } from './DebuggerInstance';

export class DebugSessionUnavailableError extends Error {
  constructor() { super('debug session is not available'); }
}

/** create: the starting tools; use: every tool on an existing session — the handle must be this instance's and hold something. */
export function requireDebugger(context: HandlerContext, args: unknown, mode: 'create' | 'use'): DebuggerInstance {
  if (!context.debugger) throw new Error('debugging is not served by this server');
  const instance = context.debugger();
  if (mode === 'use') {
    const handle = (args as { debug_session?: unknown } | undefined)?.debug_session;
    if (typeof handle !== 'string' || handle !== instance.handle || !instance.holdsState()) throw new DebugSessionUnavailableError();
  }
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

const text = (value: unknown): McpResult => ({
  isError: false,
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

export async function debugAnswer<T>(args: unknown, work: () => Promise<DebugView<T>>, terse: (v: T) => unknown, full: (v: T) => unknown = (v) => v): Promise<McpResult> {
  try {
    const view = await work();
    const detail = detailOf(args);
    if (detail === 'raw') return text(view.raw);
    return text(detail === 'full' ? full(view.value) : terse(view.value));
  } catch (error) {
    return return_error(error) as McpResult;
  }
}

export async function debugStateAnswer(args: unknown, work: () => Promise<DebugState>, extra: Record<string, unknown> = {}): Promise<McpResult> {
  return debugAnswer(args, async () => {
    const state = await work();
    const raw = state.state === 'stopped' ? [state.stop.raw.debuggee, state.stop.raw.attach, state.stop.raw.stack].join('\n') : JSON.stringify(state);
    return { value: state, raw };
  },
  (s) => ({ ...(s.state === 'stopped' ? { state: 'stopped', ...terseStop(s.stop.debuggee, s.stop.stack), ...(s.stop.stackError ? { stack_error: s.stop.stackError } : {}) } : s), ...extra }),
  (s) => ({ ...s, ...extra }));
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

export const DEBUG_SESSION_PROPERTY = {
  debug_session: { type: 'string', description: 'The debug session the start answered.' },
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

In `src/handlers/interfaces.ts`, import `type DebuggerInstance` from `'../lib/debugger/DebuggerInstance'` and add `debugger?: () => DebuggerInstance` to `HandlerContext`, with the doc comment «This server instance's debugger, created on first use».

In `src/embeddable/BaseMcpServer.ts`:

```ts
  private debuggerInstance?: DebuggerInstance;

  /** This instance's debugger, created on first use inside a call's scope (so stated ids are read there). */
  protected debuggerFor(): DebuggerInstance {
    this.debuggerInstance ??= createDebuggerInstance();
    return this.debuggerInstance;
  }
  get debugHandle(): string | undefined { return this.debuggerInstance?.handle; }
  holdsState(): boolean { return this.debuggerInstance?.holdsState() ?? false; }
  /** Stops what this instance's debugger holds; awaited by every host before it lets the instance go. */
  async dispose(): Promise<void> {
    const instance = this.debuggerInstance;
    if (!instance) return;
    await instance.dispose();
    if (!instance.holdsState()) this.debuggerInstance = undefined;
  }
```

Where the context is built (l.257-261), add `debugger: () => this.debuggerFor()`. The context is built outside `withDestinationSystemContext`, but `debuggerFor` runs when a handler calls it, inside the scope. So the destination's stated ids are seen.

`package.json`: add the `./debugger` export after `./compact-shared` (`types`/`import`/`require` → `./dist/lib/debugger/index.{d.ts,js}`), and `"debugger": ["dist/lib/debugger/index.d.ts"]` under `typesVersions["*"]`.

- [ ] **Step 6: Run the folder, the type check and the build**

Run: `npx jest src/__tests__/unit/debugger/ && npm run test:check && npm run build`
Expected: PASS, no type errors, clean build.

- [ ] **Step 7: Commit**

```bash
git add src/lib/debugger/ src/handlers/interfaces.ts src/embeddable/BaseMcpServer.ts package.json src/__tests__/unit/debugger/
git commit -m "feat(debugger): the server instance owns its debugger — handle, ids, both kinds, dispose"
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
  it('HandlerExporter leaves it out unless asked', () => {
    const names = (o: any) => new HandlerExporter(o).getHandlerEntries().map((e) => e.toolDefinition.name);
    expect(names({}).some((n: string) => /^(Debug|AmdpDebug|MemorySnapshot)/.test(n))).toBe(false);
  });
});
```

Add a `--exposition=readonly,debug` case beside the existing exposition parser tests. Find them with `grep -rln "parseExposition\|--exposition" src/__tests__/unit` and copy their setup. Expected: `['readonly', 'debug']`.

```ts
// server/src/__tests__/sseDispose.test.ts — the SSE session's instance is disposed when the connection closes
```

`SseServer` builds its `SessionServer` in a private method. Look at how the existing SSE tests drive it: `ls server/src/__tests__ | grep -i sse`. Using the same harness, open a GET, spy on `BaseMcpServer.prototype.dispose`, close the response, and expect `dispose` to have been called once. If no SSE harness exists, export a small `disposeOnClose(res, server)` helper from `SseServer.ts`, use it at l.388, and unit-test the helper with a fake `res` (an `EventEmitter`) and a fake server `{ dispose: jest.fn().mockResolvedValue(undefined) }`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/exposition.test.ts server/src/__tests__/sseDispose.test.ts`
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

Add this beside the `high`/`low` pushes (l.528-533). Add `statefulGroups?: (context: HandlerContext) => IHandlerGroup[]` to `LauncherOptions` for compact (Task 13), and push those groups the same way.

stdio shutdown (l.613-620): `servers: [{ close: () => server.dispose() }]`, where `server` is the `StdioServer` (a `BaseMcpServer`). `installShutdown` already reports a rejected close and exits with 1.

`server/src/SseServer.ts`, where the connection closes (l.388-389):

```ts
      this.sessions.delete(sessionId);
      void server.dispose().catch((error) =>
        this.logger.error?.(`[SSE CLOSE] debugger cleanup for session ${sessionId} failed: ${error instanceof Error ? error.message : String(error)}`),
      );
```

`SseServer.stop()` additionally disposes every open session's server before it resolves:

```ts
    const failures: string[] = [];
    for (const [id, entry] of this.sessions) {
      await entry.server.dispose().catch((e) => failures.push(`${id}: ${e instanceof Error ? e.message : String(e)}`));
    }
    this.sessions.clear();
    if (failures.length) throw new Error(`debugger cleanup failed: ${failures.join('; ')}`);
```

Add that after the listener stops, keeping the existing body. The launcher's SSE `installShutdown` (l.643-649) already awaits `server.stop()`.

- [ ] **Step 4: Run them and see them pass; run the ratchets (the group is still empty)**

Run: `npx jest src/__tests__/unit/debugger/ server/src/__tests__/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/handlers/ src/lib/config/ scripts/list-tools.ts server/src/ src/__tests__/unit/debugger/exposition.test.ts
git commit -m "feat(debugger): opt-in debug set; stdio disposes at shutdown, SSE when its session closes"
```

---

### Task 9: `InstancePool` — Streamable HTTP keeps the instance that holds state

**Files:**
- Create: `server/src/InstancePool.ts`
- Modify: `server/src/StreamableHttpServer.ts` (l.164-240: take the server from the pool; `stop()`: pool shutdown)
- Test: `server/src/__tests__/InstancePool.test.ts`, `server/src/__tests__/streamableHttpPool.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Poolable { readonly debugHandle: string | undefined; holdsState(): boolean; dispose(): Promise<void> }
export class BatchWithHandleError extends Error {}
export class PoolClosedError extends Error {}
/** The `debug_session` a single `tools/call` carries; a batch carrying one is refused. */
export function handleOf(body: unknown): string | undefined;
export class InstancePool<T extends Poolable> {
  /**
   * Once per request (= one stateless MCP session): the held instance the
   * handle names when its owner matches, else a new one; `work` runs with it
   * leased (one at a time per instance); afterwards it is kept while it holds
   * state, and disposed otherwise.
   */
  serve(request: { handle?: string; owner: string }, create: () => T, work: (instance: T) => Promise<void>): Promise<void>;
  size(): number;
  /** Stop admission, wait for the leases, dispose every held instance; resolves with what failed. */
  shutdown(): Promise<string[]>;
}
```

**Owner** (D14, our HTTP): `dest:<destination>` for a destination request. For an `x-sap-*` request, a SHA-256 of `<x-sap-url>|<x-sap-client>|<x-sap-login or the token's user claim>`. An unknown handle and a handle of another owner both get a fresh instance, and on it the tool answers `debug session is not available`. The two cases look identical.

- [ ] **Step 1: Write the failing pool tests**

```ts
// server/src/__tests__/InstancePool.test.ts
import { BatchWithHandleError, handleOf, InstancePool, PoolClosedError } from '../InstancePool';

class Fake {
  debugHandle: string | undefined;
  held = false;
  disposed = 0;
  constructor(readonly n: number) {}
  holdsState() { return this.held; }
  async dispose() { this.disposed++; this.held = false; }
}

describe('handleOf', () => {
  it('reads debug_session from a single tools/call only', () => {
    expect(handleOf({ method: 'tools/call', params: { arguments: { debug_session: 'H' } } })).toBe('H');
    expect(handleOf({ method: 'tools/list' })).toBeUndefined();
    expect(handleOf({ method: 'tools/call', params: { arguments: {} } })).toBeUndefined();
  });
  it('refuses a batch carrying a handle', () => {
    expect(() => handleOf([{ method: 'tools/call', params: { arguments: { debug_session: 'H' } } }])).toThrow(BatchWithHandleError);
    expect(handleOf([{ method: 'tools/list' }])).toBeUndefined();
  });
});

describe('InstancePool', () => {
  let n = 0;
  const create = () => new Fake(++n);

  it('a request without a handle gets a new instance; kept when it holds state, under its handle', async () => {
    const pool = new InstancePool<Fake>();
    let first!: Fake;
    await pool.serve({ owner: 'A' }, create, async (i) => { first = i; i.debugHandle = 'H1'; i.held = true; });
    expect(pool.size()).toBe(1);
    let second!: Fake;
    await pool.serve({ handle: 'H1', owner: 'A' }, create, async (i) => { second = i; });
    expect(second).toBe(first);
  });

  it('an instance that holds nothing is disposed, not kept', async () => {
    const pool = new InstancePool<Fake>();
    let i0!: Fake;
    await pool.serve({ owner: 'A' }, create, async (i) => { i0 = i; });
    expect(pool.size()).toBe(0);
    expect(i0.disposed).toBe(1);
  });

  it('a held instance that stops holding state leaves the pool', async () => {
    const pool = new InstancePool<Fake>();
    await pool.serve({ owner: 'A' }, create, async (i) => { i.debugHandle = 'H1'; i.held = true; });
    await pool.serve({ handle: 'H1', owner: 'A' }, create, async (i) => { i.held = false; });
    expect(pool.size()).toBe(0);
  });

  it('another owner with the handle gets a fresh instance, the same as an unknown handle', async () => {
    const pool = new InstancePool<Fake>();
    let held!: Fake;
    await pool.serve({ owner: 'A' }, create, async (i) => { held = i; i.debugHandle = 'H1'; i.held = true; });
    let other!: Fake;
    await pool.serve({ handle: 'H1', owner: 'B' }, create, async (i) => { other = i; });
    expect(other).not.toBe(held);
    let unknown!: Fake;
    await pool.serve({ handle: 'NOPE', owner: 'A' }, create, async (i) => { unknown = i; });
    expect(unknown).not.toBe(held);
  });

  it('two requests for one instance are served one after the other (one transport at a time)', async () => {
    const pool = new InstancePool<Fake>();
    await pool.serve({ owner: 'A' }, create, async (i) => { i.debugHandle = 'H1'; i.held = true; });
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const a = pool.serve({ handle: 'H1', owner: 'A' }, create, async () => { order.push('a-in'); await gate; order.push('a-out'); });
    const b = pool.serve({ handle: 'H1', owner: 'A' }, create, async () => { order.push('b-in'); });
    await new Promise((r) => setImmediate(r));
    expect(order).toEqual(['a-in']);
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(['a-in', 'a-out', 'b-in']);
  });

  it('shutdown stops admission, waits for leases, disposes every held instance and reports failures', async () => {
    const pool = new InstancePool<Fake>();
    let held!: Fake;
    await pool.serve({ owner: 'A' }, create, async (i) => { held = i; i.debugHandle = 'H1'; i.held = true; });
    held.dispose = async () => { throw new Error('listener still up'); };
    const failures = await pool.shutdown();
    expect(failures).toEqual(['H1: listener still up']);
    await expect(pool.serve({ owner: 'A' }, create, async () => {})).rejects.toThrow(PoolClosedError);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest server/src/__tests__/InstancePool.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement the pool**

```ts
// server/src/InstancePool.ts
/**
 * Streamable HTTP keeps the MCP instance that holds state between calls.
 *
 * The transport is stateless — every request is an MCP session of its own —
 * and the state a debugger needs lives in an instance (measured: a continuous
 * poll, an attach within seconds, the attaching ABAP session; over RFC nothing
 * carries that session to another connection). So per request the host takes
 * an instance once: the one the request's `debug_session` names, when the
 * owner matches, or a new one. One transport at a time per instance (the SDK
 * binds one), so requests for one instance are leased in turn. An instance
 * that holds nothing is disposed; nothing expires on a clock.
 */
export interface Poolable { readonly debugHandle: string | undefined; holdsState(): boolean; dispose(): Promise<void> }
export class BatchWithHandleError extends Error {
  constructor() { super('a JSON-RPC batch cannot carry debug_session'); }
}
export class PoolClosedError extends Error {
  constructor() { super('the server is shutting down'); }
}

export function handleOf(body: unknown): string | undefined {
  const one = (m: any): string | undefined =>
    m?.method === 'tools/call' && typeof m?.params?.arguments?.debug_session === 'string' ? m.params.arguments.debug_session : undefined;
  if (Array.isArray(body)) {
    if (body.some((m) => one(m) !== undefined)) throw new BatchWithHandleError();
    return undefined;
  }
  return one(body);
}

interface Held<T> { instance: T; owner: string; tail: Promise<unknown> }

export class InstancePool<T extends Poolable> {
  private readonly held = new Map<string, Held<T>>();
  private readonly active = new Set<Promise<unknown>>();
  private admitting = true;

  size(): number { return this.held.size; }

  async serve(request: { handle?: string; owner: string }, create: () => T, work: (instance: T) => Promise<void>): Promise<void> {
    if (!this.admitting) throw new PoolClosedError();
    const entry = request.handle ? this.held.get(request.handle) : undefined;
    const run = entry && entry.owner === request.owner
      ? this.leased(entry, work)
      : this.fresh(request.owner, create(), work);
    this.active.add(run);
    try { await run; } finally { this.active.delete(run); }
  }

  private leased(entry: Held<T>, work: (instance: T) => Promise<void>): Promise<void> {
    const turn = entry.tail.then(async () => {
      try { await work(entry.instance); } finally { await this.settle(entry.instance, entry.owner); }
    });
    entry.tail = turn.catch(() => undefined);
    return turn;
  }

  private async fresh(owner: string, instance: T, work: (instance: T) => Promise<void>): Promise<void> {
    try { await work(instance); } finally { await this.settle(instance, owner); }
  }

  /** After a request: keep what holds state under its handle, dispose the rest. */
  private async settle(instance: T, owner: string): Promise<void> {
    const handle = instance.debugHandle;
    if (instance.holdsState() && handle) {
      const existing = this.held.get(handle);
      if (!existing) this.held.set(handle, { instance, owner, tail: Promise.resolve() });
      return;
    }
    if (handle && this.held.get(handle)?.instance === instance) this.held.delete(handle);
    await instance.dispose().catch(() => undefined);
  }

  async shutdown(): Promise<string[]> {
    this.admitting = false;
    await Promise.allSettled([...this.active]);
    const failures: string[] = [];
    for (const [handle, entry] of this.held) {
      await entry.instance.dispose().catch((e) => failures.push(`${handle}: ${e instanceof Error ? e.message : String(e)}`));
    }
    this.held.clear();
    return failures;
  }
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest server/src/__tests__/InstancePool.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the pool in `StreamableHttpServer`**

In the request handler (l.164-240), keep the destination and header resolution exactly as it is, but run the per-request part through the pool:

```ts
        let handle: string | undefined;
        try { handle = handleOf(req.body); }
        catch (error) { res.status(400).send(error instanceof Error ? error.message : String(error)); return; }
        const owner = ownerOf(req.headers, destination);
        await this.pool.serve({ handle, owner }, () => this.createPerRequestServer(), async (server) => {
          // (the existing setConnectionContext… / connectPublic block, on `server`)
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: this.enableJsonResponse });
          const closed = new Promise<void>((resolve) => res.on('close', () => resolve()));
          await server.connect(transport);
          await runWithRequestContext(requestContextFromHeaders(req.headers), () => transport.handleRequest(req, res, req.body));
          await closed;              // the lease ends when the response is done…
          await transport.close();   // …and the instance is free for the next transport
        });
```

Here:
- `this.pool = new InstancePool<PerRequestServerLike>()`;
- `PerRequestServer` exposes `debugHandle`, `holdsState()` and `dispose()` from `BaseMcpServer`;
- `ownerOf(headers, destination)` is a small private function: `destination ? \`dest:${destination}\` : sha256(\`${url}|${client}|${login ?? tokenUser(jwt)}\`)`, where `tokenUser` decodes the JWT payload without verifying it. That is only a key; SAP authenticates the token itself;
- `destination` must be resolved before `serve`, so move the destination-picking block (Priority 1–4) above the `serve` call. The connection-context calls (`setConnectionContextFromHeadersPublic`, `firstConnect.run(...)`) move inside `work`, so a pooled instance gets the request's own credentials again.

`stop()`:

```ts
  async stop(): Promise<void> {
    const failures = await this.pool.shutdown();
    // (the existing listener close)
    if (failures.length) throw new Error(`debugger cleanup failed: ${failures.join('; ')}`);
  }
```

- [ ] **Step 6: The real-transport test**

```ts
// server/src/__tests__/streamableHttpPool.test.ts
```

Start a `StreamableHttpServer` on port 0 with a `CompositeHandlersRegistry` that holds one test group. Its group must have two tools whose handlers use only the debugger instance (`requireDebugger(context, args, 'create'|'use')`), with no SAP call:
- `PoolProbeStart`: answers `{ debug_session: instance.handle }`, and sets a flag on the instance so `holdsState()` is true. A test-only subclass of `DebuggerInstance` with a `held` flag is enough.
- `PoolProbeEcho`: answers the handle it was served with.

Then, over real HTTP with the SDK's `StreamableHTTPClientTransport` (a new client per call, so every request is its own MCP session):
1. Call Start, then Echo with the handle. The same handle comes back, so the request reached the pooled instance.
2. Echo with another handle answers `debug session is not available`.
3. Two Echo calls at once both succeed; the lease served them in turn.
4. `server.stop()` disposes the held instance.

Run: `npx jest server/src/__tests__/streamableHttpPool.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/InstancePool.ts server/src/StreamableHttpServer.ts server/src/__tests__/
git commit -m "feat(server): Streamable HTTP keeps the MCP instance that holds state — pool, lease, owner, shutdown"
```

---

### Task 10: Core ABAP debugger tools

**Files:**
- Create: `src/handlers/debugger/debug/handleDebug*.ts` — 20 files, one per tool in the table below.
- Modify:
  - `src/lib/handlers/groups/DebugHandlersGroup.ts`;
  - `tests/fixtures/tools/surface.json`;
  - `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts:131-139` (`includeDebug: true`).
- Test: `src/__tests__/unit/debugger/handlers.test.ts`

**Interfaces:**
- Consumes:
  - `requireDebugger`, `DebugSessionUnavailableError` (Task 7);
  - `debugAnswer`, `debugStateAnswer` (Task 7);
  - the `schemas.ts` constants and parsers (Task 7);
  - `terseStop`, `placeOf`, `terseVariables` (Task 3);
  - `readXmlDocument` (Task 6);
  - `lineUriOf` (Task 2);
  - `DETAIL_PROPERTY` from `src/lib/strategies/detail`.
- Produces: the tool names of spec §2 plus `DebugListSessions`.

**Every handler has this shape.** Here is one complete file:

```ts
// src/handlers/debugger/debug/handleDebugGetStack.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseStop } from '../../../lib/debugger/readings';
import { DEBUG_SESSION_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetStack',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Call stack of the stopped debuggee: each frame as an object address and as its technical place. Needs a stopped debuggee.',
  inputSchema: { type: 'object', properties: { ...DEBUG_SESSION_PROPERTY, ...DETAIL_PROPERTY }, required: ['debug_session'] },
} as const;

export async function handleDebugGetStack(context: HandlerContext, args: { debug_session?: string; detail?: string }) {
  return debugAnswer(args, () => requireDebugger(context, args, 'use').abap.getStack(), (stop) => terseStop(stop.debuggee, stop.stack));
}
```

Rules for every tool in the table:
- the description starts with `[debug] `;
- `properties` always spread `...DETAIL_PROPERTY`;
- `available_in: ['onprem', 'cloud'] as const`;
- a session tool spreads `...DEBUG_SESSION_PROPERTY` and lists `'debug_session'` in `required`;
- in the body, `D('use')` stands for `requireDebugger(context, args, 'use')` and `D('create')` for `requireDebugger(context, args, 'create')`.

| Tool | Properties besides detail | Description after `[debug] ` | Body |
|---|---|---|---|
| `DebugStartListener` | `...BREAKPOINTS_PROPERTY` (optional here), `...RUN_PROPERTY` | `Starts a debug session: arms the given breakpoints, then listens for a debuggee of the connected SAP user and attaches the first one caught. Refused while another debugger listens for that user. ${USER_MODE_SENTENCE} Answers the session, its SAP ids and its state.` | `const d = D('create'); return debugStateAnswer(args, async () => { if (args.breakpoints) await d.abap.setBreakpoints(breakpointsFromArgs(args.breakpoints)); return d.abap.start('refuse', runFromArgs(args.run)); }, { debug_session: d.handle, terminal_id: d.abap.ids.terminalId, ide_id: d.abap.ids.ideId })` |
| `DebugTakeOverListener` | same | `Starts a debug session like the listener start, taking the user's debugging over. ${TAKE_OVER_SENTENCE} ${USER_MODE_SENTENCE} Answers the session, its SAP ids and its state.` | same with `'takeOver'` |
| `DebugWait` | `...DEBUG_SESSION_PROPERTY`, `...HOLD_SECONDS_PROPERTY` | `State of a debug session after waiting up to hold_seconds: listening, stopped (where the debuggee stands) or ended (how it ended; a background run with its output). A debugger that took the user over is an error carrying the system's message.` | `debugStateAnswer(args, () => D('use').abap.wait(Number(args.hold_seconds ?? 10)))` |
| `DebugSetBreakpoints` | `...DEBUG_SESSION_PROPERTY`, `...BREAKPOINTS_PROPERTY` | `Adds breakpoints to a debug session: line, exception class, ABAP statement or message, each with an optional condition. Answers which were placed and which were refused, with the reason. ${USER_MODE_SENTENCE}` | `debugAnswer(args, () => D('use').abap.setBreakpoints(breakpointsFromArgs(args.breakpoints)), (v) => ({ placed: v.placed.map((p) => ({ id: p.id, kind: p.kind, ...(p.uri ? { uri: p.uri } : {}) })), refused: v.refused }))` |
| `DebugDeleteBreakpoint` | `...DEBUG_SESSION_PROPERTY`, `breakpoint_id: {type:'string', description:'Breakpoint id.'}` | `Removes one breakpoint of a debug session by its id.` | `debugAnswer(args, async () => { await D('use').abap.deleteBreakpoint(String(args.breakpoint_id)); return { value: { deleted: args.breakpoint_id }, raw: '' }; }, (v) => v)` |
| `DebugListBreakpoints` | `...DEBUG_SESSION_PROPERTY` | `Breakpoints a debug session armed, with their ids.` | `debugAnswer(args, async () => { const l = D('use').abap.listBreakpoints(); return { value: l, raw: JSON.stringify(l) }; }, (v) => v)` |
| `DebugGetStack` | (above) | (above) | (above) |
| `DebugSetStackPosition` | `...DEBUG_SESSION_PROPERTY`, `position: {type:'number', description:'Frame position.'}` | `Selects the stack frame variables are read in; what runs next does not change. Needs a stopped debuggee.` | `debugAnswer(args, () => D('use').abap.setStackPosition(Number(args.position)), (s) => terseStop(s.debuggee, s.stack))` |
| `DebugGetVariables` | `...DEBUG_SESSION_PROPERTY`, `names: {type:'array', items:{type:'string'}, description:'Variables by name; a path reads a component or a table row.'}`, `parents: {type:'array', items:{type:'string'}, description:'Instead of names, members of these: scopes, locals, parameters, an object, a table.'}` | `Variables of the stopped debuggee, by name or as members of a parent; each with name, type and value. Needs a stopped debuggee.` | `const a = D('use').abap; return debugAnswer(args, () => (Array.isArray(args.names) && args.names.length ? a.getVariables(args.names.map(String)) : a.getChildVariables(Array.isArray(args.parents) && args.parents.length ? args.parents.map(String) : ['@ROOT'])), (v) => (v.variables.length ? terseVariables(v) : v.children.map((c) => ({ id: c.child, label: c.label }))))` |
| `DebugSetVariable` | `...DEBUG_SESSION_PROPERTY`, `name: {type:'string'}`, `value: {type:'string', description:'New value; converted to the type by the system.'}` | `Sets a variable of the stopped debuggee. Needs a stopped debuggee.` | `debugAnswer(args, () => D('use').abap.setVariable(String(args.name), String(args.value)), terseVariables)` |
| `DebugStep` | `...DEBUG_SESSION_PROPERTY`, `action: {type:'string', enum:['into','over','return','continue']}` | `Moves the stopped debuggee into a call, over it, out of the current one, or on to the next stop; answers where it stands or how it ended.` | see the named constant below |
| `DebugStepToLine` | `...DEBUG_SESSION_PROPERTY`, `mode: {type:'string', enum:['run','jump'], description:'run executes up to the line; jump moves there without executing what lies between.'}`, `...LINE_TARGET_PROPERTIES` | `Runs or jumps the stopped debuggee to a line; answers where it stands or how it ended.` | `debugStateAnswer(args, () => D('use').abap.stepToLine(args.mode === 'jump' ? 'stepJumpToLine' : 'stepRunToLine', lineUriOf(args, Number(args.line))))` |
| `DebugTerminate` | `...DEBUG_SESSION_PROPERTY` | `Ends the stopped debuggee where it stands; the program does not run on.` | `debugStateAnswer(args, () => D('use').abap.terminate())` |
| `DebugCreateWatchpoint` | `...DEBUG_SESSION_PROPERTY`, `name: {type:'string'}`, `condition: {type:'string'}` | `Watches a variable of the stopped debuggee; it stops when the variable changes, optionally under a condition.` | `debugAnswer(args, () => D('use').abap.createWatchpoint(String(args.name), args.condition ? String(args.condition) : undefined), readXmlDocument, readXmlDocument)` |
| `DebugListWatchpoints` | `...DEBUG_SESSION_PROPERTY` | `Watchpoints of the stopped debuggee.` | `debugAnswer(args, () => D('use').abap.listWatchpoints(), readXmlDocument, readXmlDocument)` |
| `DebugDeleteWatchpoint` | `...DEBUG_SESSION_PROPERTY`, `watchpoint_id: {type:'string'}` | `Removes a watchpoint by its id.` | `debugAnswer(args, async () => { await D('use').abap.deleteWatchpoint(String(args.watchpoint_id)); return { value: { deleted: args.watchpoint_id }, raw: '' }; }, (v) => v)` |
| `DebugGetMemorySizes` | `...DEBUG_SESSION_PROPERTY` | `Memory the stopped debuggee uses. Needs a stopped debuggee.` | `debugAnswer(args, () => D('use').abap.getMemorySizes(), readXmlDocument, readXmlDocument)` |
| `DebugCreateMemorySnapshot` | `...DEBUG_SESSION_PROPERTY` | `Writes a memory snapshot of the stopped debuggee; answers the file written.` | `debugAnswer(args, () => D('use').abap.createMemorySnapshot(), readXmlDocument, readXmlDocument)` |
| `DebugStop` | `...DEBUG_SESSION_PROPERTY` | `Ends a debug session: releases a stopped debuggee, removes its breakpoints, stops listening for both ABAP and AMDP, closes its connections. What could not be undone is reported.` | `debugAnswer(args, async () => { await D('use').stop(); return { value: { state: 'idle' }, raw: '' }; }, (v) => v)` |
| `DebugListSessions` | none (only detail) | `Debug sessions this server holds for the caller: session, kind, state and SAP ids.` | `debugAnswer(args, async () => { const d = D('create'); const l = d.describe(); return { value: l, raw: JSON.stringify(l) }; }, (v) => v)` |

`DebugStep`:

```ts
const STEPS = { into: 'stepInto', over: 'stepOver', return: 'stepReturn', continue: 'stepContinue' } as const;
export async function handleDebugStep(context: HandlerContext, args: { debug_session?: string; action?: string; detail?: string }) {
  return debugStateAnswer(args, async () => {
    const method = STEPS[String(args.action) as keyof typeof STEPS];
    if (!method) throw new Error('action: into, over, return or continue');
    return requireDebugger(context, args, 'use').abap.step(method);
  });
}
```

`DebugStartListener` and `DebugTakeOverListener` call `requireDebugger` **outside** the `debugStateAnswer` work. A failure there, which only happens when the server does not serve debugging, must still come back as a tool error. So wrap the whole body in `try { … } catch (e) { return return_error(e); }`.

`DebugListSessions` exists for the server; within one instance it lists that instance only. Under the HTTP pool, a fresh instance answers `[]`. Listing across the pool is the pool's job and is a follow-up (spec D10).

- [ ] **Step 1: Write the failing handler test**

```ts
// src/__tests__/unit/debugger/handlers.test.ts
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugSession } from '../../../lib/debugger/DebugSession';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { handleDebugGetStack } from '../../../handlers/debugger/debug/handleDebugGetStack';
import { handleDebugSetBreakpoints } from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugWait } from '../../../handlers/debugger/debug/handleDebugWait';
import { okResponse } from '../../helpers/fakeClient';
import { CONFLICT, fakeWorld, IDS, LISTEN_CATCH, LISTEN_NOTHING, until } from './fakes';

const json = (r: any) => JSON.parse(r.content[0].text);

function install() {
  const world = fakeWorld();
  const instance = new DebuggerInstance({ abap: new DebugSession(world.ports as any, IDS), amdp: new AmdpSession({} as any) });
  const context = { connection: {} as any, logger: undefined, debugger: () => instance };
  return { world, instance, context };
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

  it('start answers the session handle and the SAP ids; wait with it answers the stop, as precise', async () => {
    const { world, instance, context } = install();
    const started = handleDebugStartListener(context as any, {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    expect(json(await started)).toEqual({ state: 'listening', debug_session: instance.handle, terminal_id: IDS.terminalId, ide_id: IDS.ideId });
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    const waited = json(await handleDebugWait(context as any, { debug_session: instance.handle, hold_seconds: 0 }));
    expect(waited.state).toBe('stopped');
    expect(waited.at.address).toEqual({ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE', line: 32 });
    expect(waited.at.include).toBe('ZCL_CV_DBG_MEASURE============CM002');
    expect(waited.frames).toHaveLength(5);
    expect((await handleDebugGetStack(context as any, { debug_session: instance.handle, detail: 'raw' })).content[0].text).toContain('<dbg:stack');
  });

  it("a line breakpoint's URI is built from type, name and line", async () => {
    const { world, instance, context } = install();
    const started = handleDebugStartListener(context as any, {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await started;
    const seen: any[] = [];
    const real = world.ports.abapDebugger;
    world.ports.abapDebugger = (c, m) => Object.assign(real(c, m), { setBreakpoints: async (_i: unknown, l: any[]) => { seen.push(l); return okResponse('<dbg:breakpoints xmlns:dbg="x"/>'); } }) as any;
    (instance.abap as any).control = undefined; // the control connection is rebuilt with the spy
    await handleDebugSetBreakpoints(context as any, { debug_session: instance.handle, breakpoints: [{ object_type: 'CLAS', object_name: 'ZCL_A', line: 7 }] });
    expect(seen[0]).toEqual([{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_a/source/main#start=7' }]);
  });

  it('a foreign handle is not available and nothing is sent', async () => {
    const { world, context } = install();
    const before = world.calls.length;
    const r: any = await handleDebugGetStack(context as any, { debug_session: 'F'.repeat(32) });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('debug session is not available');
    expect(world.calls.length).toBe(before);
  });

  it('a conflict at the start is a tool error', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    const r: any = await started;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
  });
});
```

The `(instance.abap as any).control = undefined` line only works because `control` is `protected`. If that line feels wrong, give the fake world's `abapDebugger` a hook instead: `world.override = { setBreakpoints }`, merged into every debugger it makes. Change `fakes.ts` accordingly; it is test code.

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/__tests__/unit/debugger/handlers.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Write the 20 handlers and register them in `DebugHandlersGroup`**

Register each the way `SystemHandlersGroup` does:

```ts
{ toolDefinition: DebugGetStack_Tool, handler: (args: any) => handleDebugGetStack(this.context, args) },
```

`this.context` is read when the handler is called, so it carries `debugger`.

- [ ] **Step 4: Ratchets**

- `toolDescriptionsCarryNoLiterals.test.ts`: add `includeDebug: true` to the exporter options. `TAKES_NO_PARAMETERS` stays unchanged, because every tool has `detail`. Check by running it.
- `tests/fixtures/tools/surface.json`: generate the `debug` rows with `npx tsx scripts/list-tools.ts` and paste them in.

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/debugger/ src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit/
git commit -m "feat(debugger): core ABAP debugger tools behind debug_session"
```

---

### Task 11: Memory snapshot tools

**Files:**
- Create: `src/handlers/debugger/debug/handleMemorySnapshotList.ts`, `handleMemorySnapshotGet.ts`, `handleMemorySnapshotDelta.ts`
- Modify: `DebugHandlersGroup.ts`, `tests/fixtures/tools/surface.json`
- Test: `src/__tests__/unit/debugger/memoryHandlers.test.ts`

Snapshots belong to the system, not to a debug session, so these tools take no `debug_session`. They use `MemorySnapshots` from adt-clients on `context.connection`.

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
- Description: `[debug] Memory snapshots the system lists: id, user, time, size, program. Empty without the memory snapshot authorization.`
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

Rules for every tool in the table: the description starts with `[debug] `, `...DETAIL_PROPERTY` is spread, `available_in: ['onprem','cloud']`, and every tool except `AmdpDebugStart` requires `debug_session`.

| Tool | Properties besides detail | Description after `[debug] ` | Body |
|---|---|---|---|
| `AmdpDebugStart` | `stop_existing: {type:'boolean', default:false, description:'Ends an AMDP debug session of this user left behind.'}`, `...AMDP_BREAKPOINTS_PROPERTY` (required), `...RUN_PROPERTY` | `Starts an AMDP debug session of the connected SAP user with lines in SQLScript methods; the background run, when given, starts once the system confirmed the breakpoints. ${USER_MODE_SENTENCE} Answers the session and the breakpoints' states.` | `const d = D('create'); return debugAnswer(args, async () => { const r = await d.amdp.start({ stopExisting: args.stop_existing === true, breakpoints: amdpBreakpointsFromArgs(args.breakpoints), run: runFromArgs(args.run) }); return { value: { debug_session: d.handle, ...r }, raw: JSON.stringify(r) }; }, (v) => v)` |
| `AmdpDebugSetBreakpoints` | `...DEBUG_SESSION_PROPERTY`, `...AMDP_BREAKPOINTS_PROPERTY` | `Replaces the AMDP breakpoints of a debug session; answers their states once the system confirmed them.` | `debugAnswer(args, () => D('use').amdp.setBreakpoints(amdpBreakpointsFromArgs(args.breakpoints)), (v) => ({ breakpoints: v }))` |
| `AmdpDebugWait` | `...DEBUG_SESSION_PROPERTY`, `...HOLD_SECONDS_PROPERTY` | `Next AMDP events of a debug session after waiting up to hold_seconds: a stop with its line and variables, the end of an execution, a warning; or the end of the background run with its output.` | `debugAnswer(args, async () => { const s = await D('use').amdp.wait(Number(args.hold_seconds ?? 10)); return { value: s, raw: s.state === 'event' ? s.events.map((e) => e.body).join('\n') : JSON.stringify(s) }; }, (s) => (s.state === 'event' ? { state: 'event', events: s.events.map(terseAmdpEvent) } : s))` |
| `AmdpDebugStep` | `...DEBUG_SESSION_PROPERTY`, `action: {type:'string', enum:['over','continue']}` | `Steps the stopped AMDP debuggee over a statement or on to the next stop.` | `debugAnswer(args, () => D('use').amdp.step(args.action === 'over' ? 'over' : 'continue'), (v) => ({ state: v }))` |
| `AmdpDebugGetTable` | `...DEBUG_SESSION_PROPERTY`, `variable: {type:'string'}`, `query: {type:'string', description:'A SELECT over the variable.'}` | `Rows of a table variable at the AMDP stop, up to 100; optionally through a SELECT over it.` | `debugAnswer(args, () => D('use').amdp.getTable(String(args.variable), args.query ? String(args.query) : undefined), (v) => v.rows)` |
| `AmdpDebugCancel` | `...DEBUG_SESSION_PROPERTY` | `Cancels the stopped AMDP debuggee's execution.` | `debugAnswer(args, async () => { await D('use').amdp.cancel(); return { value: 'cancelled', raw: '' }; }, (v) => v)` |
| `AmdpDebugStop` | `...DEBUG_SESSION_PROPERTY` | `Ends the AMDP part of a debug session; a suspended debuggee is released first. What could not be undone is reported.` | `debugAnswer(args, async () => { await D('use').amdp.stop(); return { value: { state: 'idle' }, raw: '' }; }, (v) => v)` |

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/debugger/amdpHandlers.test.ts
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { DebuggerInstance } from '../../../lib/debugger/DebuggerInstance';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { handleAmdpDebugStep } from '../../../handlers/debugger/debug/handleAmdpDebugStep';

it('the group serves the seven AMDP tools', () => {
  const names = new DebugHandlersGroup({} as any).getHandlers().map((e) => e.toolDefinition.name);
  for (const n of ['AmdpDebugStart', 'AmdpDebugSetBreakpoints', 'AmdpDebugWait', 'AmdpDebugStep', 'AmdpDebugGetTable', 'AmdpDebugCancel', 'AmdpDebugStop']) expect(names).toContain(n);
});

it('a step without a session is not available', async () => {
  const instance = new DebuggerInstance({ abap: { holdsState: () => false, bind() { return this; } } as any, amdp: new AmdpSession({} as any) });
  const r: any = await handleAmdpDebugStep({ connection: {}, debugger: () => instance } as any, { debug_session: instance.handle, action: 'over' });
  expect(r.isError).toBe(true);
  expect(r.content[0].text).toContain('debug session is not available');
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
  - `BREAKPOINTS_PROPERTY`, `RUN_PROPERTY`, `HOLD_SECONDS_PROPERTY`, `DEBUG_SESSION_PROPERTY`, `LINE_TARGET_PROPERTIES`;
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
| `HandlerDebugStart` | `kind*: abap\|amdp`, `breakpoints*` (abap: `BREAKPOINTS_PROPERTY` items; amdp: `{object_name, line}`), `take_over?`, `run?`, `detail` | `Debugger start. kind: abap (line, exception, statement or message breakpoints) or amdp (lines in SQLScript methods). Arms the breakpoints, starts listening (abap) or an AMDP session, and optionally runs a class or report in the background. take_over: abap — ${TAKE_OVER_SENTENCE}; amdp — ends an AMDP session of this user left behind. ${USER_MODE_SENTENCE} Answers the debug session, its SAP ids and its state.` | abap: like `DebugStartListener` with `take_over ? 'takeOver' : 'refuse'`. amdp: like `AmdpDebugStart`, mapping `{object_name, line}` to `{class_name, line}`. Refused when the instance already holds the other kind. |
| `HandlerDebugWait` | `debug_session*`, `hold_seconds?`, `detail` | `State of a debug session after waiting up to hold_seconds: listening, stopped (where it stands), ended; for AMDP the next events.` | AMDP: as `AmdpDebugWait`; else as `DebugWait`. |
| `HandlerDebugView` | `debug_session*`, `what*: stack\|variables\|memory\|table`, `names?`, `detail` | `The stopped debuggee: stack, variables (by name, or the scopes), memory, or an AMDP table variable's rows.` | `stack` → `abap.getStack` + `terseStop`; `variables` → `getVariables(names)` or `getChildVariables(['@ROOT'])`; `memory` → `getMemorySizes` + `readXmlDocument`; `table` → `amdp.getTable(names[0])`. |
| `HandlerDebugStep` | `debug_session*`, `action*: into\|over\|return\|continue\|run_to_line\|jump_to_line\|terminate\|stop`, `line?`, `object_type?`, `object_name?`, `include?`, `parent_name?`, `detail` | `Moves the stopped debuggee (into, over, return, continue, run or jump to a line), ends it where it stands, or ends the debug session; answers where it stands or how it ended.` | AMDP: `over`/`continue` → `amdp.step`, `terminate` → `cancel`, `stop` → `instance.stop()`. ABAP: the four steps → `step`; `run_to_line`/`jump_to_line` → `stepToLine(lineUriOf(target, line))`, where `target` is the given object or, when none is given, `addressOf(top frame uri)` — refused if that is undefined; `terminate` → `terminate`; `stop` → `instance.stop()`. |

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
  it('every session verb requires debug_session', () => {
    for (const e of entries.filter((x) => x.toolDefinition.name !== 'HandlerDebugStart')) {
      expect((e.toolDefinition.inputSchema as any).required).toContain('debug_session');
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

The test follows `readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts`: `LambdaTester('debugger_handlers', 'debugger_chain', 'debugger')`. Its `beforeAll` creates and activates the probes with the high-level handlers, in the config's default package and transport. Every case builds a fresh `DebuggerInstance` (`createDebuggerInstance()`) and a context `{ connection, logger, debugger: () => instance }`, and `afterEach` calls `instance.dispose()`. Cases:

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
6. **AMDP chain.** The AMDP probe is the class plus table function from the adt-clients AMDP test, created by the test.
   - `AmdpDebugStart(stop_existing: true, breakpoints, run)` answers states after `SYNC_BREAKPOINTS`.
   - `AmdpDebugWait` until `ON_BREAK`, then `AmdpDebugGetTable` on the table variable.
   - `AmdpDebugStep continue`, then `AmdpDebugWait` until `ON_EXECUTION_END`.
   - `AmdpDebugStop`.
7. **Hard mode, once per transport,** through `tester.invokeToolOrHandler` with `integration_hard_mode.enabled: true`:
   - stdio with `--exposition=readonly,high,debug`: the ABAP chain;
   - Streamable HTTP: the ABAP chain over separate requests, carrying `debug_session`. This proves the pool on a real system. If the hard-mode harness cannot start the HTTP server, extend `src/__tests__/integration/helpers/testers/hardMode.ts` with an HTTP mode that launches `server/dist/launcher.js --transport=http` on a free port and connects with `StreamableHTTPClientTransport`.

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

### Task 15: Readings of the recorded AMDP and memory answers

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

### Task 16: Docs and the release preparation

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
| D1 (state in the instance, explicit handle) | 7 |
| D2 (both scenarios) | 4, 5 (the run) |
| D3 (auto-attach) | 4 |
| D4 (no timeouts) | everywhere; only bounded waits inside a call |
| D5 (one debuggee at a time) | 4 |
| D6 (refuse / take over) | 10, 13 |
| D7 (compact verbs) | 13 |
| D8 (opt-in set) | 8 |
| D9 (host pool) | 9 |
| D10 (no TTL; list, stop, limit) | 5, 7, 10 |
| D11 (measured needs) | 4, 6 |
| D12 (stdio restores the ids; reconciliation) | 5, plus the measurement in 14 |
| D13 (HTTP carries a session, RFC does not; pool) | 9 |
| D14 (owner, kinds, limit) | 7, 9, 13 |
| §2 core tools | 10–12 |
| §3 addressing and answers | 2, 3, 7, 15 |
| Descriptions (function only) | 7 (schemas), 10–13, ratchet test |
| §4 tests | 1–13 unit, 14 integration and hard mode per transport |
| Release | 16 |

**Codex's first review, each finding and where it went:**

| Finding | Where it is handled |
|---|---|
| 1 (lib import into core) | the server imports only `BaseMcpServer.dispose()` |
| 2 (first-poll race) | a short first poll, awaited; the run starts after it |
| 3–7 (races) | `Serial`, generation checks, captured stops |
| 8 (terminate answers `done`) | `terminate()` releases on success; the fake returns `DONE()` |
| 9 (run outliving stop) | the run is owned by its generation; close-once |
| 10 (cleanup failures) | `DebugCleanupError`; failed ids stay |
| 11–14 (AMDP) | the failed state, drain on stop, debuggee cleared, run after the sync |
| 15 (request user) | the login, never the responsible; auth and network errors pass through |
| 16 (shared globals) | the instance owns the state |
| 17 (AMDP stack, compact routing) | Task 15; compact keeps one kind per instance |
| 18 (integration) | the run in `AmdpDebugStart`; hard mode per transport |
| 19 (refusal matching) | re-asked with `validationOnly` |
| 20 (vacuous tests) | `until()`; both sides asserted |
| 21 (full vs raw) | `debugAnswer(full)` |
| 22 (names in fixtures and plans) | system ids from config; fixtures sanitised |

**Codex's second review:**

| Finding | Where it is handled |
|---|---|
| lease | the pool's tail |
| batch | `handleOf` |
| owner | `ownerOf` |
| list across the pool | listed as a follow-up in Task 10 |
| connections across transport close | the instance keeps them; the transport is per request |
| awaited dispose and shutdown order | Tasks 8–9 |
| one handle for both kinds | `DebuggerInstance` |
| atomic limit | one instance holds one of each kind; a second start is refused |
| compact schemas | Task 13 |
| restart-breakpoint promise | measured in Task 14 before the spec says more |
| HTTP lifecycle tests | Task 9, Step 6, and Task 14 |

**Placeholders:** the only `<…>` tokens are in run commands, where the local config, scratchpad and system values go. They are deliberately not written down (CLAUDE.md: plans name no system).

**Type consistency.** The following names are used the same way across tasks:
- `DebugSession`: `start`, `wait`, `stop`, `holdsState`, `describe`, `ids`;
- `AmdpSession`: `start({stopExisting, breakpoints, run})`, `setBreakpoints`, `startRun`;
- `DebuggerInstance`: `handle`, `abap`, `amdp`, `stop`, `dispose`, `describe`;
- `requireDebugger(context, args, 'create' | 'use')`;
- `debugAnswer(args, work, terse, full?)`, `debugStateAnswer(args, work, extra?)`;
- `InstancePool.serve({handle, owner}, create, work)`, `shutdown()`.
