# Debugger tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A model debugs ABAP and AMDP through the server. It can set breakpoints, catch a program at one, read the stack, variables and memory, step, and release the program. This works both when the model starts the program and when someone else does.

**Architecture:**
- One `DebugSession` (ABAP) and one `AmdpSession` per server process live in `src/lib/debugger/`. They own every connection, the background listener, the current stop, the 5-minute idle timer and the background run.
- Thin handlers in `src/handlers/debugger/` form the opt-in exposition set `debug`. Four compact verb tools in `compact/src/debug/` use the same sessions.
- Readings for the model parse SAP's documents with `fast-xml-parser`. They are tested against recorded answers in `tests/fixtures/adt`.

**Tech Stack:**
- TypeScript 6, Jest 30 + ts-jest, fast-xml-parser 5.
- `@mcp-abap-adt/adt-clients` 27.0.0: `AbapDebugger`, `AmdpDebugger`, `MemorySnapshots`, `AdtExecutor`, `getSystemInformation`.
- `@mcp-abap-adt/adt-strategies` 0.8.1: `analyseDebuggeeEnd`, `analyseException`, `readExceptionSubType`.
- `@mcp-abap-adt/interfaces-adt` 13.2.0: `IDebuggerIdentity`, `IDebuggerBreakpoint`, `IAmdpBreakpoint`.

**Spec:** `docs/superpowers/specs/2026-10-10-debugger-tools-design.md`

## Global Constraints

- One MCP server = one user session (D1). The debugger state lives in the process. Tool arguments carry no session handles, and there is no per-user registry.
- `debug` is opt-in (D8). Neither `readonly` nor `high` carries it, and `HandlerExporter` leaves it out unless asked (`includeDebug: true`).
- The `debug` set and the compact debug tools are served over **stdio only** until #287 gives HTTP one instance per MCP session. Asking for them over `sse` or `http` refuses at startup.
- The idle timeout is **5 minutes** (`IDLE_MS = 300_000`). On expiry the server sends `stepContinue` with `analyseDebuggeeEnd`, closes the stop's connection and resumes the listener (D4).
- One debuggee at a time (D5). While a stop exists the listener does not poll.
- The listener polls with `holdSeconds: 60`. `DebugWait` / `HandlerDebugWait` take `hold_seconds` ≤ 30 (default 10).
- The identity is `{requestUser, terminalId, ideId}`, one per server instance. Ids are 32 upper-case hex characters from `crypto.randomBytes(16)` and are never derived from the URL or the user.
  - Overrides: header `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` → destination `.env` `SAP_DEBUG_TERMINAL_ID` / `SAP_DEBUG_IDE_ID` → process env → random.
  - Each override replaces only its own id. We do not validate the values.
- A listener conflict is a tool error carrying SAP's message: at the start, the start tool fails; later, the next `Wait` fails and the listener is not restarted. A debuggee's end (`debuggeeEnded`, `terminateDebuggee`) is not an error.
- Every tool takes `detail: terse|full|raw` (`DETAIL_PROPERTY`, default `terse`).
  - `terse` for a stop: program, include, line and the top 5 frames.
  - `terse` for variables: `{name, type, value}`.
- Descriptions name nothing concrete (CLAUDE.md): no object, package, transport or SID.
  - Every tool that sets breakpoints or starts a listener says that user-mode debugging catches every request of that SAP user. The two that start a listener also say that taking over displaces another debugger, such as an IDE.
- `available_in: ['onprem', 'cloud']` on every new tool. Legacy is not measured.
- The agent never publishes. "Release" means a tag and a push, and only on the user's word. The user publishes.
- An IDE debugging the same SAP user must be closed during integration runs.
- Integration output goes to a log file in full (`tee`), with `timeout 1800`.

## Review Focus

1. **A start that is refused.** `refuse` while an IDE listens means the start tool fails, and nothing stays armed: no listener connection is left open and no run is started. *Test: Task 4 "a conflict at the start …".*
2. **A stop in the middle of a long poll.** `DebugStop` / shutdown while `listen` is outstanding must not hang, and must not attach to a debuggee caught after the stop. *Test: Task 5 "a catch that arrives after DebugStop is not attached".*
3. **Stop-dependent tools with no stop.** `DebugGetStack`, `DebugStep` and the others, called while only listening, answer an error naming the state ("no debuggee is stopped") and send nothing to SAP. *Test: Task 4 "stop tools without a stop …".*
4. **A breakpoint answer in a different order from the request, with refusals in it.** Placed and refused are matched by content (uri, exception class, statement, message key), never by position. *Test: Task 3, fixture `debugger-conversation--01-breakpoints-set`.*
5. **The debug set over HTTP.** `--exposition=readonly,debug --transport=http` exits with a message naming stdio, instead of serving tools that lose their state between calls. *Test: Task 7 "debug over http refuses at startup".*

---

## File structure

**Create (lib):**
- `src/lib/debugger/ids.ts`: generates the ids and reads the overrides.
- `src/lib/debugger/objectUri.ts`: builds a source URI from `{object_type, object_name, include?, parent_name?}` plus a line.
- `src/lib/debugger/readings.ts`: parses the ABAP debugger documents into model readings, with terse projections.
- `src/lib/debugger/amdpReadings.ts`: parses AMDP events and the data preview.
- `src/lib/debugger/memoryReadings.ts`: parses the memory sizes and snapshot views.
- `src/lib/debugger/DebugSession.ts`: the ABAP state machine.
- `src/lib/debugger/AmdpSession.ts`: the AMDP state machine.
- `src/lib/debugger/ports.ts`: the live ports (connections, debuggers, identity, run).
- `src/lib/debugger/instance.ts`: the per-process sessions, `shutdownDebugger`, and test replacement.
- `src/lib/debugger/answer.ts`: `debugAnswer`, which picks the detail and turns an error into a tool error.
- `src/lib/debugger/schemas.ts`: shared JSON-schema fragments (breakpoint, detail, hold_seconds).
- `src/lib/debugger/index.ts`: the barrel, published as `@mcp-abap-adt/lib/debugger`.
- `src/handlers/debugger/debug/handleDebug*.ts`: 19 core ABAP tools.
- `src/handlers/debugger/debug/handleMemorySnapshot*.ts`: 3 tools.
- `src/handlers/debugger/debug/handleAmdpDebug*.ts`: 7 tools.
- `src/lib/handlers/groups/DebugHandlersGroup.ts`.

**Create (compact):**
- `compact/src/debug/group.ts`: `compactDebugEntries`, `CompactDebugHandlersGroup`.
- `compact/src/debug/handleHandlerDebug{Start,Wait,View,Step}.ts`.

**Create (tests):**
- `src/__tests__/unit/debugger/*.test.ts`.
- `compact/src/__tests__/compactDebug.test.ts`.
- `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`.
- Fixtures: `tests/fixtures/adt/debugger-*`, `memory-snapshot-list--*`.

**Modify:**
- Config and requests: `src/lib/config/IServerConfig.ts:30`, `src/lib/config/ServerConfigManager.ts:213-226` (and the help near l.236), `src/lib/config/validateExposition.ts`, `src/lib/requestContext.ts`, `src/lib/auth/IAuthBrokerFactory.ts:14`, `src/lib/auth/destinationStores.ts:71-88`, `src/lib/requestSystemResolution.ts:146`.
- Wiring: `server/src/launcher.ts:210-225,519-560,613-620`, `src/lib/handlers/HandlerExporter.ts`, `src/lib/handlers/groups/index.ts`, `scripts/list-tools.ts`, `package.json` (exports and typesVersions `./debugger`).
- Compact: `compact/src/launcher.ts`.
- Test ratchets: `tests/fixtures/tools/surface.json`, `compact/tests/fixtures/surface.json`, `compact/src/__tests__/compactSurface.test.ts`, `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`.
- Templates: `tests/test-config.yaml.template` and `docs/development/tests/test-config.yaml.template`.
- Docs (README, `docs/user-guide/*`, `compact/README.md`, `compact/docs/AVAILABLE_TOOLS.md`, CHANGELOGs, `tools/generate-tools-docs.js`) and the release metadata.

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
grep -lE 'e19|E19|okyslytsia|OKYSLYTSIA|MCPDEV' tests/fixtures/adt/debugger-* tests/fixtures/adt/memory-* || echo clean
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

### Task 2: Identity ids and the source URI of a line

**Files:**
- Create: `src/lib/debugger/ids.ts`, `src/lib/debugger/objectUri.ts`
- Modify: `src/lib/requestContext.ts` (`RequestContext`, `requestContextFromHeaders`), `src/lib/auth/IAuthBrokerFactory.ts:14`, `src/lib/auth/destinationStores.ts:71-88`, `src/lib/requestSystemResolution.ts:146` (`withDestinationSystemContext` merge)
- Test: `src/__tests__/unit/debugger/ids.test.ts`, `src/__tests__/unit/debugger/objectUri.test.ts`

**Interfaces:**
- Produces:
  - `newDebuggerId(): string`: 32 upper-case hex characters.
  - `statedDebuggerIds(env?: NodeJS.ProcessEnv): { terminalId?: string; ideId?: string }`: the request scope (headers, then the destination `.env`) first, then `env` (default `process.env`).
  - `RequestContext.debugTerminalId?: string`, `RequestContext.debugIdeId?: string`.
  - `DestinationSystemContext.debugTerminalId?`, `DestinationSystemContext.debugIdeId?`.
  - `type BreakpointTarget = { object_type: string; object_name: string; include?: string; parent_name?: string }`.
  - `sourceUriOf(target: BreakpointTarget): string`.
  - `lineUriOf(target: BreakpointTarget, line: number): string`, which gives `${sourceUriOf(target)}#start=${line}`.
  - `BREAKPOINT_OBJECT_TYPES = ['CLAS', 'PROG', 'INCL', 'FUNC'] as const`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/ids.test.ts
import { newDebuggerId, statedDebuggerIds } from '../../../lib/debugger/ids';
import { runWithRequestContext, requestContextFromHeaders } from '../../../lib/requestContext';

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

  it('a header wins over the environment, and only for its own id', () => {
    const ctx = requestContextFromHeaders({ 'x-sap-debug-ide-id': 'FROMHEADER' });
    runWithRequestContext(ctx, () => {
      expect(
        statedDebuggerIds({ SAP_DEBUG_IDE_ID: 'FROMENV', SAP_DEBUG_TERMINAL_ID: 'T' }),
      ).toEqual({ ideId: 'FROMHEADER', terminalId: 'T' });
    });
  });
});
```

```ts
// src/__tests__/unit/debugger/objectUri.test.ts
import { lineUriOf, sourceUriOf } from '../../../lib/debugger/objectUri';

describe('the source URI a line breakpoint names', () => {
  it('a class main source, as the recorded breakpoint answer names it', () => {
    expect(lineUriOf({ object_type: 'CLAS', object_name: 'ZCL_CV_DBG_MEASURE' }, 32)).toBe(
      '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32',
    );
  });
  it('a class include', () => {
    expect(sourceUriOf({ object_type: 'CLAS', object_name: 'ZCL_A', include: 'testclasses' })).toBe(
      '/sap/bc/adt/oo/classes/zcl_a/includes/testclasses',
    );
  });
  it('a program, an include, a function module', () => {
    expect(sourceUriOf({ object_type: 'PROG', object_name: 'ZP' })).toBe('/sap/bc/adt/programs/programs/zp/source/main');
    expect(sourceUriOf({ object_type: 'INCL', object_name: 'ZI' })).toBe('/sap/bc/adt/programs/includes/zi/source/main');
    expect(sourceUriOf({ object_type: 'FUNC', object_name: 'Z_FM', parent_name: 'ZFG' })).toBe(
      '/sap/bc/adt/functions/groups/zfg/fmodules/z_fm/source/main',
    );
  });
  it('accepts the long type forms', () => {
    expect(sourceUriOf({ object_type: 'CLAS/OC', object_name: 'ZCL_A' })).toBe('/sap/bc/adt/oo/classes/zcl_a/source/main');
    expect(sourceUriOf({ object_type: 'PROG/P', object_name: 'ZP' })).toBe('/sap/bc/adt/programs/programs/zp/source/main');
    expect(sourceUriOf({ object_type: 'PROG/I', object_name: 'ZI' })).toBe('/sap/bc/adt/programs/includes/zi/source/main');
    expect(sourceUriOf({ object_type: 'FUGR/FF', object_name: 'Z_FM', parent_name: 'ZFG' })).toContain('/fmodules/z_fm/');
  });
  it('percent-encodes a namespace', () => {
    expect(sourceUriOf({ object_type: 'CLAS', object_name: '/NS/CL_A' })).toBe('/sap/bc/adt/oo/classes/%2fns%2fcl_a/source/main');
  });
  it('refuses what holds no breakpoint, and a function module without its group', () => {
    expect(() => sourceUriOf({ object_type: 'TABL', object_name: 'T' })).toThrow(/CLAS, PROG, INCL, FUNC/);
    expect(() => sourceUriOf({ object_type: 'FUNC', object_name: 'Z_FM' })).toThrow(/parent_name/);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/ids.test.ts src/__tests__/unit/debugger/objectUri.test.ts`
Expected: FAIL with "Cannot find module '../../../lib/debugger/ids'".

- [ ] **Step 3: Implement**

```ts
// src/lib/debugger/ids.ts
/**
 * The debugger's ids for one server instance.
 *
 * Generated, never derived: two instances of one SAP user with the same ids
 * would share one listener's catches without a conflict (the same `ideId`
 * never conflicts — measured), so each instance gets its own. A user who wants
 * otherwise states them — a header, the destination, the environment — and
 * what a shared id brings is theirs. Not validated here: SAP judges them.
 */
import { randomBytes } from 'node:crypto';
import { getRequestContext } from '../requestContext';

export function newDebuggerId(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

export function statedDebuggerIds(
  env: NodeJS.ProcessEnv = process.env,
): { terminalId?: string; ideId?: string } {
  const scope = getRequestContext();
  const terminalId = scope?.debugTerminalId || env.SAP_DEBUG_TERMINAL_ID?.trim() || undefined;
  const ideId = scope?.debugIdeId || env.SAP_DEBUG_IDE_ID?.trim() || undefined;
  return { ...(terminalId ? { terminalId } : {}), ...(ideId ? { ideId } : {}) };
}
```

In `src/lib/requestContext.ts`, add these to `RequestContext`:

```ts
  /** `x-sap-debug-terminal-id`, or the destination's `SAP_DEBUG_TERMINAL_ID`. */
  debugTerminalId?: string;
  /** `x-sap-debug-ide-id`, or the destination's `SAP_DEBUG_IDE_ID`. */
  debugIdeId?: string;
```

In `requestContextFromHeaders`, beside `responsible`:

```ts
  const debugTerminalId = headerValue(headers, 'x-sap-debug-terminal-id');
  const debugIdeId = headerValue(headers, 'x-sap-debug-ide-id');
  return {
    masterLanguage: headerValue(headers, 'x-sap-language'),
    ...(responsible ? { responsible } : {}),
    ...(masterSystem ? { masterSystem } : {}),
    ...(debugTerminalId ? { debugTerminalId } : {}),
    ...(debugIdeId ? { debugIdeId } : {}),
  };
```

Then:
- In `src/lib/auth/IAuthBrokerFactory.ts:14`, add `debugTerminalId?: string; debugIdeId?: string;` to `DestinationSystemContext`.
- In `readDestinationSystemContext` (`src/lib/auth/destinationStores.ts:71-88`), pick `SAP_DEBUG_TERMINAL_ID` into `debugTerminalId` and `SAP_DEBUG_IDE_ID` into `debugIdeId`, the same way `SAP_RESPONSIBLE` is picked.
- In `withDestinationSystemContext` (`src/lib/requestSystemResolution.ts:146`), merge the two keys exactly as `masterSystem` is merged: the scope's value wins, and the destination fills a key the scope does not carry.

```ts
// src/lib/debugger/objectUri.ts
/**
 * The source a line breakpoint names, from what a model knows: a type and a
 * name. adt-clients does not export its URI builders, so the four kinds that
 * hold executable ABAP are built here, lower-cased and percent-encoded as ADT
 * spells them.
 */
export const BREAKPOINT_OBJECT_TYPES = ['CLAS', 'PROG', 'INCL', 'FUNC'] as const;

export interface BreakpointTarget {
  object_type: string;
  object_name: string;
  /** A class include: `definitions`, `implementations`, `macros`, `testclasses`. Omitted: the main source. */
  include?: string;
  /** The function group, for a function module. */
  parent_name?: string;
}

const ALIASES: Record<string, (typeof BREAKPOINT_OBJECT_TYPES)[number]> = {
  CLAS: 'CLAS', 'CLAS/OC': 'CLAS',
  PROG: 'PROG', 'PROG/P': 'PROG',
  INCL: 'INCL', 'PROG/I': 'INCL',
  FUNC: 'FUNC', 'FUGR/FF': 'FUNC',
};

const seg = (name: string) => encodeURIComponent(name.trim().toLowerCase());

export function sourceUriOf(target: BreakpointTarget): string {
  const kind = ALIASES[target.object_type.trim().toUpperCase()];
  const name = seg(target.object_name);
  switch (kind) {
    case 'CLAS':
      return target.include && target.include.toLowerCase() !== 'main'
        ? `/sap/bc/adt/oo/classes/${name}/includes/${seg(target.include)}`
        : `/sap/bc/adt/oo/classes/${name}/source/main`;
    case 'PROG':
      return `/sap/bc/adt/programs/programs/${name}/source/main`;
    case 'INCL':
      return `/sap/bc/adt/programs/includes/${name}/source/main`;
    case 'FUNC':
      if (!target.parent_name) {
        throw new Error('a function module breakpoint needs parent_name (its function group)');
      }
      return `/sap/bc/adt/functions/groups/${seg(target.parent_name)}/fmodules/${name}/source/main`;
    default:
      throw new Error(
        `object_type ${target.object_type} holds no breakpoint; one of ${BREAKPOINT_OBJECT_TYPES.join(', ')}`,
      );
  }
}

export function lineUriOf(target: BreakpointTarget, line: number): string {
  return `${sourceUriOf(target)}#start=${line}`;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/requestContext 2>&1 | tail -20`
Expected: PASS, and the existing request-context tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debugger/ids.ts src/lib/debugger/objectUri.ts src/lib/requestContext.ts src/lib/auth/IAuthBrokerFactory.ts src/lib/auth/destinationStores.ts src/lib/requestSystemResolution.ts src/__tests__/unit/debugger/
git commit -m "feat(debugger): instance ids with header/destination/env overrides; line URIs"
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
export function terseStop(debuggee: DebuggeeReading, stack: StackReading): { program: string; include: string; line: number; frames: Array<{ event: string; include: string; line: number }> };
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

  it('terse: a stop is where it stands and five frames', () => {
    const t = terseStop(
      readDebuggee(corpusBody('debugger-run-to-line--02-listen'))!,
      readStack(corpusBody('debugger-run-to-line--04-stack')),
    );
    expect(t.line).toBe(32);
    expect(t.frames).toHaveLength(5);
  });

  it('terse variables: name, type, value', () => {
    expect(terseVariables(readVariables(corpusBody('debugger-run-to-line--07-variables-at-write')))).toEqual([
      { name: 'LV_COUNTER', type: 'I', value: '241' },
    ]);
  });
});
```

`terseStop` takes its line from the top frame (32, the class-source line), not from `LINE_CURR` (9, the include line). A model reads the class source, so it needs the class-source line.

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

export function terseStop(debuggee: DebuggeeReading, stack: StackReading) {
  const top = stack.frames[0];
  return {
    program: top?.program ?? debuggee.program,
    include: top?.include ?? debuggee.include,
    line: top?.line ?? debuggee.line,
    frames: stack.frames.slice(0, 5).map((f) => ({ event: f.event, include: f.include, line: f.line })),
  };
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

### Task 4: `DebugSession`: listener, catch, attach, conflict, steps, idle timeout

**Files:**
- Create: `src/lib/debugger/DebugSession.ts`
- Test: `src/__tests__/unit/debugger/DebugSession.test.ts`, `src/__tests__/unit/debugger/fakes.ts`

**Interfaces:**
- Consumes: `readings.ts` (Task 3), `IDebuggerIdentity`, `IDebuggerBreakpoint`, `IDebuggerStepMethod`, and `IDebuggerStepToLineMethod` from `@mcp-abap-adt/interfaces-adt`; `AbapDebugger`, `abapDebuggerDocuments` and `IDebuggerListenerConflict` from `@mcp-abap-adt/adt-clients`; `analyseDebuggeeEnd` from `@mcp-abap-adt/adt-strategies`.
- Produces:

```ts
export const IDLE_MS = 300_000;
export const LISTEN_HOLD_SECONDS = 60;
export const CONFLICT_GRACE_MS = 2_000;
export const WAIT_MAX_SECONDS = 30;

export type Debugger = AbapDebugger<typeof abapDebuggerDocuments>;
export interface RunTarget { kind: 'class' | 'program'; name: string; }
export type RunOutcome = { ok: true; output: string } | { ok: false; message: string };
export interface DebugSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;          // stateful, own session
  closeConnection(connection: IAbapConnection): Promise<void>;
  abapDebugger(connection: IAbapConnection, onConflict: IDebuggerListenerConflict): Debugger;
  identity(origin: O): Promise<IDebuggerIdentity>;
  run(connection: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface StopView { debuggee: DebuggeeReading; attach: AttachReading; stack: StackReading; raw: { debuggee: string; attach: string; stack: string }; }
export type EndReason = 'debuggee_ended' | 'terminated' | 'idle_released' | 'run_finished';
export type DebugState =
  | { state: 'idle' }
  | { state: 'listening' }
  | { state: 'stopped'; stop: StopView }
  | { state: 'ended'; reason: EndReason; run?: RunOutcome };
export interface DebugView<T> { value: T; raw: string; }
export class DebugListenerError extends Error {}   // a conflict, or a listener that failed
export class DebugStateError extends Error {}      // no stop / already listening
export class DebugRequestError extends Error {}    // SAP refused a request at the stop

export class DebugSession<O = unknown> {
  constructor(ports: DebugSessionPorts<O>);
  bind(origin: O): this;
  start(mode: IDebuggerListenerConflict, run?: RunTarget): Promise<DebugState>;
  wait(holdSeconds?: number): Promise<DebugState>;
  setBreakpoints(list: IDebuggerBreakpoint[]): Promise<DebugView<{ placed: BreakpointReading[]; refused: Array<{ requested: IDebuggerBreakpoint; error: string }> }>>;
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
  stop(): Promise<void>;   // Task 5
}
```

- [ ] **Step 1: Write the fakes**

```ts
// src/__tests__/unit/debugger/fakes.ts
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody } from '../../../lib/adtCorpus';
import type { Debugger, DebugSessionPorts, RunOutcome } from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';

export function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

export const LISTEN_CATCH = () => okResponse(corpusBody('debugger-run-to-line--02-listen'));
export const LISTEN_NOTHING = () => okResponse('');
export const CONFLICT = () => refusedResponse('Another debugger is already listening (SY 530)');

/** A world of fake debuggers: every listen() hands out the next deferred poll. */
export function fakeWorld() {
  const polls: Array<ReturnType<typeof deferred<any>>> = [];
  const opened: IAbapConnection[] = [];
  const closed: IAbapConnection[] = [];
  const calls: string[] = [];
  const run = deferred<RunOutcome>();
  const stepAnswers: any[] = [];
  const make = (): Debugger =>
    ({
      listen: () => { calls.push('listen'); const d = deferred<any>(); polls.push(d); return d.promise; },
      stopListener: async () => { calls.push('stopListener'); return okResponse(undefined); },
      attach: async (_u: string, id: string, o: any) => { calls.push(`attach:${id}:${o?.server}`); return okResponse(corpusBody('debugger-run-to-line--03-attach')); },
      getStack: async () => { calls.push('getStack'); return okResponse(corpusBody('debugger-run-to-line--04-stack')); },
      getVariables: async () => { calls.push('getVariables'); return okResponse(corpusBody('debugger-run-to-line--07-variables-at-write')); },
      getChildVariables: async () => { calls.push('getChildVariables'); return okResponse(corpusBody('debugger-conversation--07-children-root')); },
      step: async (m: string, o: any) => { calls.push(`step:${m}:${o?.analyse ? 'analysed' : 'plain'}`); return stepAnswers.shift() ?? okResponse(corpusBody('debugger-run-to-line--05-stepruntoline')); },
      stepToLine: async (m: string, uri: string) => { calls.push(`stepToLine:${m}:${uri}`); return stepAnswers.shift() ?? okResponse(corpusBody('debugger-run-to-line--05-stepruntoline')); },
      terminateDebuggee: async () => { calls.push('terminate'); return okResponse(corpusBody('debugger-terminate--01-terminate-debuggee')); },
      setBreakpoints: async () => { calls.push('setBreakpoints'); return okResponse(corpusBody('debugger-conversation--01-breakpoints-set')); },
      deleteBreakpoint: async (_i: unknown, id: string) => { calls.push(`deleteBreakpoint:${id}`); return okResponse(undefined); },
      setStackPosition: async (p: number) => { calls.push(`setStackPosition:${p}`); return okResponse(undefined); },
      setVariableValue: async (n: string) => { calls.push(`setVariableValue:${n}`); return okResponse(corpusBody('debugger-run-to-line--07-variables-at-write')); },
      createWatchpoint: async () => okResponse('<watchpoints/>'),
      listWatchpoints: async () => okResponse('<watchpoints/>'),
      deleteWatchpoint: async () => okResponse(undefined),
      getMemorySizes: async () => okResponse('<memorySizes/>'),
      createMemorySnapshot: async () => okResponse('<action/>'),
    }) as unknown as Debugger;
  const ports: DebugSessionPorts<string> = {
    openConnection: async () => { const c = { id: opened.length } as unknown as IAbapConnection; opened.push(c); return c; },
    closeConnection: async (c) => { closed.push(c); },
    abapDebugger: () => make(),
    identity: async () => ({ requestUser: 'SAPUSER01', terminalId: 'T'.repeat(32), ideId: 'I'.repeat(32) }),
    run: async () => run.promise,
  };
  return { ports, polls, opened, closed, calls, run, stepAnswers };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/__tests__/unit/debugger/DebugSession.test.ts
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import { corpusBody } from '../../../lib/adtCorpus';
import {
  CONFLICT_GRACE_MS, DebugListenerError, DebugSession, DebugStateError, IDLE_MS,
} from '../../../lib/debugger/DebugSession';
import { CONFLICT, fakeWorld, LISTEN_CATCH, LISTEN_NOTHING } from './fakes';

const flush = () => jest.advanceTimersByTimeAsync(0);

describe('DebugSession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function listening(world = fakeWorld()) {
    const session = new DebugSession(world.ports).bind('origin');
    const started = session.start('refuse');
    await jest.advanceTimersByTimeAsync(CONFLICT_GRACE_MS);
    await expect(started).resolves.toEqual({ state: 'listening' });
    return { session, world };
  }

  async function stopped() {
    const { session, world } = await listening();
    world.polls[0].resolve(LISTEN_CATCH());
    await flush();
    return { session, world };
  }

  it('listening → caught → attached on a new connection to the debuggee server; the listener stands', async () => {
    const { session, world } = await stopped();
    const state = await session.wait(0);
    expect(state.state).toBe('stopped');
    expect(world.calls).toContain('attach:194B2024D1671FE1B0DDF891EDADF59C:appserver_SYS_00');
    expect(world.opened).toHaveLength(2);          // listener + stop
    expect(world.polls).toHaveLength(1);           // no poll while stopped
  });

  it('an empty poll polls again', async () => {
    const { world } = await listening();
    world.polls[0].resolve(LISTEN_NOTHING());
    await flush();
    expect(world.polls).toHaveLength(2);
  });

  it('a conflict at the start fails the start; nothing stays armed, nothing runs', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports).bind('origin');
    const ran = jest.spyOn(world.ports, 'run');
    const started = session.start('refuse', { kind: 'class', name: 'ZCL_X' });
    world.polls[0].resolve(CONFLICT());
    await expect(started).rejects.toThrow(DebugListenerError);
    await expect(started).rejects.toThrow(/SY 530/);
    expect(world.closed).toEqual(world.opened);
    expect(ran).not.toHaveBeenCalled();
    expect((await session.wait(0)).state).toBe('idle');
  });

  it('a conflict later fails the next wait once; the listener is not restarted', async () => {
    const { session, world } = await listening();
    world.polls[0].resolve(CONFLICT());
    await flush();
    await expect(session.wait(0)).rejects.toThrow(/SY 530/);
    expect(world.polls).toHaveLength(1);
    expect((await session.wait(0)).state).toBe('idle');
  });

  it('a second start while listening is refused', async () => {
    const { session } = await listening();
    await expect(session.start('refuse')).rejects.toThrow(DebugStateError);
  });

  it('wait returns when a catch arrives, before its hold ends', async () => {
    const { session, world } = await listening();
    const waiting = session.wait(30);
    world.polls[0].resolve(LISTEN_CATCH());
    await flush();
    await expect(waiting).resolves.toMatchObject({ state: 'stopped' });
  });

  it('wait holds at most 30 seconds', async () => {
    const { session } = await listening();
    const waiting = session.wait(600);
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(waiting).resolves.toEqual({ state: 'listening' });
  });

  it('5 minutes idle → stepContinue (analysed) → listening again, reported as ended', async () => {
    const { session, world } = await stopped();
    await jest.advanceTimersByTimeAsync(IDLE_MS);
    expect(world.calls).toContain('step:stepContinue:analysed');
    expect(world.closed).toContain(world.opened[1]);
    expect(world.polls).toHaveLength(2);
    expect(await session.wait(0)).toEqual({ state: 'ended', reason: 'idle_released' });
  });

  it('a tool call at the stop resets the idle timer', async () => {
    const { session, world } = await stopped();
    await jest.advanceTimersByTimeAsync(IDLE_MS - 1000);
    await session.getVariables(['LV_COUNTER']);
    await jest.advanceTimersByTimeAsync(2000);
    expect(world.calls).not.toContain('step:stepContinue:analysed');
  });

  it('debuggeeEnded ends the stop, not as an error', async () => {
    const { session, world } = await stopped();
    world.stepAnswers.push(okResponse(corpusBody('debugger-terminate--01-terminate-debuggee').replace('terminateDebuggee', 'debuggeeEnded')));
    await expect(session.step('stepContinue')).resolves.toEqual({ state: 'ended', reason: 'debuggee_ended' });
    expect(world.polls).toHaveLength(2);
  });

  it('a step that stays at a stop rereads the stack', async () => {
    const { session, world } = await stopped();
    const state = await session.step('stepOver');
    expect(state.state).toBe('stopped');
    expect(world.calls.filter((c) => c === 'getStack')).toHaveLength(2);
  });

  it('a refused step keeps the stop and is an error', async () => {
    const { session, world } = await stopped();
    world.stepAnswers.push(refusedResponse('Parameter uri could not be found'));
    await expect(session.stepToLine('stepRunToLine', '/x#start=1')).rejects.toThrow(/uri could not be found/);
    expect((await session.wait(0)).state).toBe('stopped');
  });

  it('terminate ends as terminated', async () => {
    const { session } = await stopped();
    await expect(session.terminate()).resolves.toEqual({ state: 'ended', reason: 'terminated' });
  });

  it('stop tools without a stop are refused and send nothing', async () => {
    const { session, world } = await listening();
    const before = world.calls.length;
    await expect(session.getStack()).rejects.toThrow(/no debuggee is stopped/);
    await expect(session.step('stepOver')).rejects.toThrow(DebugStateError);
    expect(world.calls.length).toBe(before);
  });

  it('no second attach while a stop exists', async () => {
    const { world } = await stopped();
    expect(world.calls.filter((c) => c.startsWith('attach:'))).toHaveLength(1);
  });

  it('breakpoints: placed kept by id, refused matched by content', async () => {
    const { session } = await listening();
    const answer = await session.setBreakpoints([
      { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' },
      { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=1' },
    ]);
    expect(answer.value.placed).toHaveLength(1);
    expect(answer.value.refused).toEqual([
      { requested: { kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=1' },
        error: 'Cannot create a breakpoint at this position' },
    ]);
    expect(session.listBreakpoints()).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/DebugSession.test.ts`
Expected: FAIL, "Cannot find module '../../../lib/debugger/DebugSession'".

- [ ] **Step 4: Implement**

```ts
// src/lib/debugger/DebugSession.ts
/**
 * The ABAP debugger's state between tool calls — one per server instance (D1).
 *
 * The library does every request; what lives here is the order and the
 * sessions: a listener on a stateful connection of its own, a new connection
 * per catch attached to the debuggee's server, one debuggee at a time (D5),
 * an idle timeout that lets a forgotten debuggee go (D4). A listener conflict
 * is the user's to resolve and reaches them as an error; a debuggee's end is
 * the end of a stop, not an error.
 */
import type { AbapDebugger, abapDebuggerDocuments, IDebuggerListenerConflict } from '@mcp-abap-adt/adt-clients';
import { analyseDebuggeeEnd } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtResponse, IDebuggerBreakpoint, IDebuggerIdentity, IDebuggerStepMethod, IDebuggerStepToLineMethod,
} from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type AttachReading, type BreakpointReading, breakpointKey, type DebuggeeReading,
  readAttach, readBreakpoints, readDebuggee, readDebuggeeEnd, readStack, readVariables,
  type StackReading, type VariablesReading,
} from './readings';

export const IDLE_MS = 300_000;
export const LISTEN_HOLD_SECONDS = 60;
export const CONFLICT_GRACE_MS = 2_000;
export const WAIT_MAX_SECONDS = 30;

export type Debugger = AbapDebugger<typeof abapDebuggerDocuments>;
export interface RunTarget { kind: 'class' | 'program'; name: string }
export type RunOutcome = { ok: true; output: string } | { ok: false; message: string };
export interface DebugSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(connection: IAbapConnection): Promise<void>;
  abapDebugger(connection: IAbapConnection, onConflict: IDebuggerListenerConflict): Debugger;
  identity(origin: O): Promise<IDebuggerIdentity>;
  run(connection: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export interface StopView {
  debuggee: DebuggeeReading; attach: AttachReading; stack: StackReading;
  raw: { debuggee: string; attach: string; stack: string };
}
export type EndReason = 'debuggee_ended' | 'terminated' | 'idle_released' | 'run_finished';
export type DebugState =
  | { state: 'idle' }
  | { state: 'listening' }
  | { state: 'stopped'; stop: StopView }
  | { state: 'ended'; reason: EndReason; run?: RunOutcome };
export interface DebugView<T> { value: T; raw: string }

export class DebugListenerError extends Error {}
export class DebugStateError extends Error {}
export class DebugRequestError extends Error {}

interface Listener { connection: IAbapConnection; debugger: Debugger; generation: number }
interface Stop { connection: IAbapConnection; debugger: Debugger; view: StopView; idle?: ReturnType<typeof setTimeout> }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const valueOf = (a: IAdtResponse<unknown>): string => (a.ok ? String(a.getResult().value ?? '') : '');
const failureOf = (error: unknown) =>
  ({ ok: false as const, getError: () => ({ origin: 'connection', message: error instanceof Error ? error.message : String(error) }) });

export class DebugSession<O = unknown> {
  private origin?: O;
  private identityValue?: IDebuggerIdentity;
  private mode: IDebuggerListenerConflict = 'refuse';
  private control?: { connection: IAbapConnection; debugger: Debugger };
  private readonly armed = new Map<string, BreakpointReading>();
  private listener?: Listener;
  private current?: Stop;
  private failure?: string;
  private generation = 0;
  private readonly notices: DebugState[] = [];
  private readonly waiters = new Set<() => void>();
  private running?: Promise<void>;
  private runConnection?: IAbapConnection;

  constructor(private readonly ports: DebugSessionPorts<O>) {}

  bind(origin: O): this { this.origin = origin; return this; }

  // --- identity and the control connection -----------------------------------

  private async identity(): Promise<IDebuggerIdentity> {
    this.identityValue ??= await this.ports.identity(this.requireOrigin());
    return this.identityValue;
  }
  private requireOrigin(): O {
    if (this.origin === undefined) throw new DebugStateError('the debugger has no connection yet');
    return this.origin;
  }
  private async controlDebugger(): Promise<Debugger> {
    if (!this.control) {
      const connection = await this.ports.openConnection(this.requireOrigin());
      this.control = { connection, debugger: this.ports.abapDebugger(connection, this.mode) };
    }
    return this.control.debugger;
  }

  // --- breakpoints ------------------------------------------------------------

  async setBreakpoints(list: IDebuggerBreakpoint[]) {
    const identity = await this.identity();
    const answer = await (await this.controlDebugger()).setBreakpoints(identity, list);
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    const raw = valueOf(answer);
    const rows = readBreakpoints(raw);
    const placed = rows.filter((r) => r.id);
    const errors = rows.filter((r) => r.error);
    const placedKeys = new Set(placed.map(breakpointKey));
    const refused = list
      .filter((b) => !placedKeys.has(breakpointKey(b)))
      .map((requested) => {
        const sameKind = errors.findIndex((e) => e.kind === requested.kind);
        const error = sameKind >= 0 ? errors.splice(sameKind, 1)[0].error! : 'refused';
        return { requested, error };
      });
    for (const p of placed) this.armed.set(p.id!, p);
    return { value: { placed, refused }, raw };
  }

  async deleteBreakpoint(id: string): Promise<void> {
    const answer = await (await this.controlDebugger()).deleteBreakpoint(await this.identity(), id);
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    this.armed.delete(id);
  }

  listBreakpoints(): BreakpointReading[] { return [...this.armed.values()]; }

  // --- listener ---------------------------------------------------------------

  async start(mode: IDebuggerListenerConflict, run?: RunTarget): Promise<DebugState> {
    if (this.listener || this.current) throw new DebugStateError('a listener is already running; DebugStop ends it');
    const identity = await this.identity();
    this.mode = mode;
    this.failure = undefined;
    const connection = await this.ports.openConnection(this.requireOrigin());
    const listener: Listener = { connection, debugger: this.ports.abapDebugger(connection, mode), generation: ++this.generation };
    this.listener = listener;
    const first = this.poll(listener, identity);
    const early = await Promise.race([first, sleep(CONFLICT_GRACE_MS).then(() => undefined)]);
    if (early && !early.ok) {
      await this.dropListener();
      throw new DebugListenerError(early.getError().message);
    }
    void this.loop(listener, identity, first);
    if (run) this.startRun(run);
    return this.report();
  }

  private poll(listener: Listener, identity: IDebuggerIdentity): Promise<IAdtResponse<string>> {
    return listener.debugger
      .listen(identity, { holdSeconds: LISTEN_HOLD_SECONDS })
      .catch((error: unknown) => failureOf(error) as unknown as IAdtResponse<string>);
  }

  private async loop(listener: Listener, identity: IDebuggerIdentity, pending: Promise<IAdtResponse<string>>): Promise<void> {
    let answer = await pending;
    for (;;) {
      if (listener.generation !== this.generation || this.listener !== listener) return;
      if (!answer.ok) {
        this.failure = answer.getError().message;
        await this.dropListener();
        this.notify();
        return;
      }
      const debuggee = readDebuggee(valueOf(answer));
      if (debuggee && (await this.attachTo(debuggee, valueOf(answer)))) {
        this.notify();
        return; // the listener stands while the debuggee is attached (D5)
      }
      answer = await this.poll(listener, identity);
    }
  }

  private async attachTo(debuggee: DebuggeeReading, rawDebuggee: string): Promise<boolean> {
    const generation = this.generation;
    const identity = await this.identity();
    const connection = await this.ports.openConnection(this.requireOrigin());
    const dbg = this.ports.abapDebugger(connection, this.mode);
    const attached = await dbg.attach(identity.requestUser, debuggee.debuggeeId, {
      ...(debuggee.instance ? { server: debuggee.instance } : {}),
    });
    if (!attached.ok || generation !== this.generation) {
      await this.ports.closeConnection(connection);
      return false;
    }
    const stack = await dbg.getStack();
    this.current = {
      connection, debugger: dbg,
      view: {
        debuggee, attach: readAttach(valueOf(attached)), stack: readStack(valueOf(stack)),
        raw: { debuggee: rawDebuggee, attach: valueOf(attached), stack: valueOf(stack) },
      },
    };
    this.touch();
    return true;
  }

  private resumeListening(): void {
    const listener = this.listener;
    if (!listener || this.failure) return;
    void this.identity().then((identity) => this.loop(listener, identity, this.poll(listener, identity)));
  }

  private async dropListener(): Promise<void> {
    const listener = this.listener;
    this.listener = undefined;
    this.generation++;
    if (listener) await this.ports.closeConnection(listener.connection);
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

  private report(): DebugState {
    if (this.failure !== undefined) {
      const message = this.failure;
      this.failure = undefined;
      throw new DebugListenerError(message);
    }
    const notice = this.notices.shift();
    if (notice) return notice;
    if (this.current) { this.touch(); return { state: 'stopped', stop: this.current.view }; }
    return this.listener ? { state: 'listening' } : { state: 'idle' };
  }

  private notify(): void { for (const w of [...this.waiters]) w(); }

  // --- the stop -----------------------------------------------------------------

  private requireStop(): Stop {
    if (!this.current) throw new DebugStateError('no debuggee is stopped; DebugWait answers when one is');
    this.touch();
    return this.current;
  }

  private touch(): void {
    const stop = this.current;
    if (!stop) return;
    if (stop.idle) clearTimeout(stop.idle);
    stop.idle = setTimeout(() => void this.releaseIdle(stop), IDLE_MS);
  }

  private async releaseIdle(stop: Stop): Promise<void> {
    if (this.current !== stop) return;
    await stop.debugger.step('stepContinue', { analyse: analyseDebuggeeEnd }).catch(() => undefined);
    await this.releaseStop();
    this.notices.push({ state: 'ended', reason: 'idle_released' });
    this.notify();
  }

  private async releaseStop(): Promise<void> {
    const stop = this.current;
    this.current = undefined;
    if (!stop) return;
    if (stop.idle) clearTimeout(stop.idle);
    await this.ports.closeConnection(stop.connection);
    this.resumeListening();
  }

  private async afterMove(answer: IAdtResponse<string>): Promise<DebugState> {
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    const end = readDebuggeeEnd(valueOf(answer));
    if (end) {
      await this.releaseStop();
      return { state: 'ended', reason: end === 'terminateDebuggee' ? 'terminated' : 'debuggee_ended' };
    }
    const stop = this.requireStop();
    const stack = await stop.debugger.getStack();
    stop.view = { ...stop.view, stack: readStack(valueOf(stack)), raw: { ...stop.view.raw, stack: valueOf(stack) } };
    return { state: 'stopped', stop: stop.view };
  }

  async step(method: IDebuggerStepMethod): Promise<DebugState> {
    const stop = this.requireStop();
    return this.afterMove(await stop.debugger.step(method, { analyse: analyseDebuggeeEnd }));
  }

  async stepToLine(method: IDebuggerStepToLineMethod, uri: string): Promise<DebugState> {
    const stop = this.requireStop();
    return this.afterMove(await stop.debugger.stepToLine(method, uri, { analyse: analyseDebuggeeEnd }));
  }

  async terminate(): Promise<DebugState> {
    const stop = this.requireStop();
    return this.afterMove((await stop.debugger.terminateDebuggee({ analyse: analyseDebuggeeEnd })) as IAdtResponse<string>);
  }

  async getStack(): Promise<DebugView<StopView>> {
    const stop = this.requireStop();
    const stack = await stop.debugger.getStack();
    if (!stack.ok) throw new DebugRequestError(stack.getError().message);
    stop.view = { ...stop.view, stack: readStack(valueOf(stack)), raw: { ...stop.view.raw, stack: valueOf(stack) } };
    return { value: stop.view, raw: valueOf(stack) };
  }

  async setStackPosition(position: number): Promise<DebugView<StopView>> {
    const stop = this.requireStop();
    const moved = await stop.debugger.setStackPosition(position);
    if (!moved.ok) throw new DebugRequestError(moved.getError().message);
    return this.getStack();
  }

  private async variables(call: Promise<IAdtResponse<string>>): Promise<DebugView<VariablesReading>> {
    const answer = await call;
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    return { value: readVariables(valueOf(answer)), raw: valueOf(answer) };
  }
  async getVariables(names: string[]) { return this.variables(this.requireStop().debugger.getVariables(names.map((n) => n.toUpperCase()))); }
  async getChildVariables(parents: string[]) { return this.variables(this.requireStop().debugger.getChildVariables(parents.map((n) => n.toUpperCase()))); }
  async setVariable(name: string, value: string) { return this.variables(this.requireStop().debugger.setVariableValue(name.toUpperCase(), value)); }

  private async document(call: Promise<IAdtResponse<string>>): Promise<DebugView<string>> {
    const answer = await call;
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    return { value: valueOf(answer), raw: valueOf(answer) };
  }
  async createWatchpoint(name: string, condition?: string) { return this.document(this.requireStop().debugger.createWatchpoint(name.toUpperCase(), condition ? { condition } : {})); }
  async listWatchpoints() { return this.document(this.requireStop().debugger.listWatchpoints()); }
  async deleteWatchpoint(id: string) { await this.document(this.requireStop().debugger.deleteWatchpoint(id) as Promise<IAdtResponse<string>>); }
  async getMemorySizes() { return this.document(this.requireStop().debugger.getMemorySizes()); }
  async createMemorySnapshot() { return this.document(this.requireStop().debugger.createMemorySnapshot()); }

  // --- the background run (Task 5) and stop (Task 5) ---------------------------

  private startRun(_target: RunTarget): void { /* Task 5 */ }
  async stop(): Promise<void> { /* Task 5 */ }
}
```

`deleteWatchpoint` answers `void` under the default strategy, and `document()` reads `''` from it.

- [ ] **Step 5: Run them and see them pass**

Run: `npx jest src/__tests__/unit/debugger/DebugSession.test.ts`
Expected: PASS (17 tests). If a fake-timer test hangs, the cause is almost always a missing `await flush()` after resolving a poll. Do not add real timeouts.

- [ ] **Step 6: Commit**

```bash
git add src/lib/debugger/DebugSession.ts src/__tests__/unit/debugger/DebugSession.test.ts src/__tests__/unit/debugger/fakes.ts
git commit -m "feat(debugger): DebugSession — listener, auto-attach, conflict as error, idle release"
```

---

### Task 5: `DebugSession`: background run, `stop()`, shutdown cleanup

**Files:**
- Modify: `src/lib/debugger/DebugSession.ts` (replace the two Task 5 stubs)
- Test: `src/__tests__/unit/debugger/DebugSessionRunStop.test.ts`

**Interfaces:**
- Consumes: Task 4's `DebugSession`, `fakeWorld`.
- Produces:
  - `startRun(target)`: private. When the run settles it pushes `{state:'ended', reason:'run_finished', run}`.
  - `stop(): Promise<void>` does the following in order:
    1. resolves the current stop with `stepContinue`;
    2. deletes every armed breakpoint (`deleteBreakpoint` per id);
    3. `stopListener` on the control connection;
    4. closes every connection;
    5. resets the identity, so the next start takes the overrides afresh.

  `stop()` is idempotent.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/DebugSessionRunStop.test.ts
import { CONFLICT_GRACE_MS, DebugSession } from '../../../lib/debugger/DebugSession';
import { fakeWorld, LISTEN_CATCH } from './fakes';

const flush = () => jest.advanceTimersByTimeAsync(0);

describe('DebugSession run and stop', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function started(run?: { kind: 'class' | 'program'; name: string }) {
    const world = fakeWorld();
    const session = new DebugSession(world.ports).bind('origin');
    const s = session.start('refuse', run);
    await jest.advanceTimersByTimeAsync(CONFLICT_GRACE_MS);
    await s;
    return { session, world };
  }

  it('a background run ends as ended with its output', async () => {
    const { session, world } = await started({ kind: 'class', name: 'ZCL_X' });
    world.run.resolve({ ok: true, output: 'total 6' });
    await flush();
    expect(await session.wait(0)).toEqual({ state: 'ended', reason: 'run_finished', run: { ok: true, output: 'total 6' } });
  });

  it('a failed run is reported, not thrown', async () => {
    const { session, world } = await started({ kind: 'program', name: 'ZP' });
    world.run.resolve({ ok: false, message: 'dump' });
    await flush();
    expect(await session.wait(0)).toMatchObject({ state: 'ended', run: { ok: false, message: 'dump' } });
  });

  it('the run goes on a connection of its own', async () => {
    const { world } = await started({ kind: 'class', name: 'ZCL_X' });
    await flush();
    expect(world.opened).toHaveLength(2); // the listener's and the run's; the control connection opens on first use
  });

  it('stop releases the debuggee, deletes breakpoints, stops the listener, closes everything', async () => {
    const { session, world } = await started();
    await session.setBreakpoints([{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_cv_dbg_measure/source/main#start=32' }]);
    world.polls[0].resolve(LISTEN_CATCH());
    await flush();
    await session.stop();
    expect(world.calls).toContain('step:stepContinue:analysed');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:KIND=0.'))).toBe(true);
    expect(world.calls).toContain('stopListener');
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    expect(session.listBreakpoints()).toEqual([]);
    expect((await session.wait(0)).state).toBe('idle');
  });

  it('a catch that arrives after DebugStop is not attached', async () => {
    const { session, world } = await started();
    const stopping = session.stop();
    world.polls[0].resolve(LISTEN_CATCH());
    await flush();
    await stopping;
    expect(world.calls.some((c) => c.startsWith('attach:'))).toBe(false);
  });

  it('stop twice is harmless', async () => {
    const { session } = await started();
    await session.stop();
    await expect(session.stop()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/DebugSessionRunStop.test.ts`
Expected: FAIL. No `run_finished` arrives, and `stop` does nothing.

- [ ] **Step 3: Implement (replace the stubs)**

```ts
  private startRun(target: RunTarget): void {
    const origin = this.requireOrigin();
    this.running = (async () => {
      const connection = await this.ports.openConnection(origin);
      this.runConnection = connection;
      let run: RunOutcome;
      try {
        run = await this.ports.run(connection, target);
      } catch (error) {
        run = { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
      this.runConnection = undefined;
      await this.ports.closeConnection(connection);
      this.notices.push({ state: 'ended', reason: 'run_finished', run });
      this.notify();
    })();
  }

  /** Everything off — DebugStop, and shutdown. Required, not best effort (spec §1). */
  async stop(): Promise<void> {
    this.generation++;                       // a poll still in flight attaches nothing
    const stop = this.current;
    if (stop) {
      await stop.debugger.step('stepContinue', { analyse: analyseDebuggeeEnd }).catch(() => undefined);
      this.current = undefined;
      if (stop.idle) clearTimeout(stop.idle);
      await this.ports.closeConnection(stop.connection);
    }
    if (this.identityValue && (this.armed.size > 0 || this.listener)) {
      const control = await this.controlDebugger().catch(() => undefined);
      for (const id of [...this.armed.keys()]) {
        await control?.deleteBreakpoint(this.identityValue, id).catch(() => undefined);
      }
      if (this.listener) await control?.stopListener(this.identityValue).catch(() => undefined);
    }
    this.armed.clear();
    const listener = this.listener;
    this.listener = undefined;
    if (listener) await this.ports.closeConnection(listener.connection);
    if (this.control) { await this.ports.closeConnection(this.control.connection); this.control = undefined; }
    if (this.runConnection) await this.ports.closeConnection(this.runConnection);
    this.failure = undefined;
    this.notices.length = 0;
    this.identityValue = undefined;
    this.notify();
  }
```

In `attachTo`, after the attach answers, the check `generation !== this.generation` already prevents attaching after `stop()`. Keep it.

- [ ] **Step 4: Run them and see them pass, then the whole debugger folder**

Run: `npx jest src/__tests__/unit/debugger/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debugger/DebugSession.ts src/__tests__/unit/debugger/DebugSessionRunStop.test.ts
git commit -m "feat(debugger): background run reported through Wait; stop cleans up everything"
```

---

### Task 6: `AmdpSession`, the live ports, the per-process instance and `debugAnswer`

**Files:**
- Create: `src/lib/debugger/amdpReadings.ts`, `src/lib/debugger/AmdpSession.ts`, `src/lib/debugger/ports.ts`, `src/lib/debugger/instance.ts`, `src/lib/debugger/answer.ts`, `src/lib/debugger/schemas.ts`, `src/lib/debugger/memoryReadings.ts`, `src/lib/debugger/index.ts`
- Modify: `package.json` (`exports["./debugger"]`, `typesVersions["*"].debugger`)
- Test: `src/__tests__/unit/debugger/AmdpSession.test.ts`, `src/__tests__/unit/debugger/answer.test.ts`, `src/__tests__/unit/debugger/ports.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:

```ts
// amdpReadings.ts — shapes as the adt-clients AMDP integration test reads them (no recorded answer yet; Task 12 records one)
export interface AmdpEvent { kind: string; requestId: string; debuggeeId: string; line?: number; variables: Array<{ name: string; value: string }>; body: string; }
export function readAmdpEvents(xml: string): AmdpEvent[];
export function readAmdpStart(wire: { headers?: Record<string, unknown>; data?: unknown }): { mainId: string; hanaSession: string };
export function readAmdpPreview(xml: string): { columns: Array<{ name: string; values: string[] }> };
export function terseAmdpEvent(e: AmdpEvent): { kind: string; line?: number; variables: Array<{ name: string; value: string }> };

// memoryReadings.ts — generic until Task 12 records answers
export function readXmlDocument(xml: string): unknown;   // fast-xml-parser, NS prefixes removed
export function readSnapshotList(xml: string): Array<{ id: string; user: string; timestamp: string; size: number; programName: string; fileName: string }>;

// AmdpSession.ts
export type AmdpDebugger_ = AmdpDebugger<typeof amdpDebuggerDocuments>;
export interface AmdpSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(c: IAbapConnection): Promise<void>;
  amdpDebugger(c: IAbapConnection): AmdpDebugger_;
  requestUser(origin: O): Promise<string>;
  run(c: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export type AmdpState =
  | { state: 'idle' } | { state: 'waiting' }
  | { state: 'event'; events: AmdpEvent[] }
  | { state: 'ended'; reason: 'run_finished'; run: RunOutcome };
export class AmdpSession<O = unknown> {
  constructor(ports: AmdpSessionPorts<O>);
  bind(origin: O): this;
  start(options: { stopExisting: boolean; run?: RunTarget }): Promise<{ mainId: string }>;
  setBreakpoints(list: Array<{ class_name: string; line: number }>): Promise<DebugView<string>>;
  wait(holdSeconds?: number): Promise<AmdpState>;
  step(step: 'over' | 'continue'): Promise<DebugView<string>>;
  getTable(variable: string, query?: string): Promise<DebugView<{ columns: Array<{ name: string; values: string[] }> }>>;
  cancel(): Promise<void>;
  stop(): Promise<void>;
}

// ports.ts
export function liveDebugPorts(): DebugSessionPorts<HandlerContext>;
export function liveAmdpPorts(): AmdpSessionPorts<HandlerContext>;
export async function requestUserOf(connection: IAbapConnection): Promise<string>;  // systeminformation → login → error

// instance.ts
export function debugSessionFor(context: HandlerContext): DebugSession<HandlerContext>;
export function amdpSessionFor(context: HandlerContext): AmdpSession<HandlerContext>;
export async function shutdownDebugger(): Promise<void>;
export function replaceDebuggerSessions(abap?: DebugSession<HandlerContext>, amdp?: AmdpSession<HandlerContext>): void;  // tests

// answer.ts
export async function debugAnswer<T>(args: unknown, work: () => Promise<DebugView<T>>, terse: (value: T) => unknown): Promise<McpResult>;
export async function debugStateAnswer(args: unknown, work: () => Promise<DebugState>): Promise<McpResult>;

// schemas.ts
export const HOLD_SECONDS_PROPERTY; export const BREAKPOINTS_PROPERTY; export const RUN_PROPERTY;
export function breakpointsFromArgs(raw: unknown): IDebuggerBreakpoint[];
export function runFromArgs(raw: unknown): RunTarget | undefined;
export const USER_MODE_WARNING: string;
export const TAKE_OVER_WARNING: string;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/answer.test.ts
import { debugAnswer, debugStateAnswer } from '../../../lib/debugger/answer';
import { DebugListenerError } from '../../../lib/debugger/DebugSession';

describe('debugAnswer', () => {
  const view = { value: { a: 1, b: 2 }, raw: '<x/>' };
  it('terse by default', async () => {
    const r = await debugAnswer({}, async () => view, (v) => ({ a: v.a }));
    expect(JSON.parse(r.content[0].text)).toEqual({ a: 1 });
  });
  it('full and raw', async () => {
    expect(JSON.parse((await debugAnswer({ detail: 'full' }, async () => view, () => 0)).content[0].text)).toEqual({ a: 1, b: 2 });
    expect((await debugAnswer({ detail: 'raw' }, async () => view, () => 0)).content[0].text).toBe('<x/>');
  });
  it("a conflict is a tool error carrying SAP's message", async () => {
    const r = await debugStateAnswer({}, async () => { throw new DebugListenerError('Another debugger … SY 530'); });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
  });
  it('a stop is terse by default: where it stands and five frames', async () => {
    const r = await debugStateAnswer({}, async () => ({ state: 'listening' }));
    expect(JSON.parse(r.content[0].text)).toEqual({ state: 'listening' });
  });
});
```

```ts
// src/__tests__/unit/debugger/AmdpSession.test.ts
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { readAmdpEvents, readAmdpStart } from '../../../lib/debugger/amdpReadings';
import { okResponse } from '../../helpers/fakeClient';
import { deferred } from './fakes';

// Shapes as the adt-clients AMDP integration test reads them (measured on
// premise 2026-10-09); replaced by recorded answers in Task 12.
const START = { headers: { location: '/sap/bc/adt/amdp/debugger/main/0123456789ABCDEF0123456789ABCDEF' },
  data: '<amdpdbg:startResponse xmlns:amdpdbg="x"><amdpdbg:property amdpdbg:key="HANA_SESSION_ID" amdpdbg:value="123"/></amdpdbg:startResponse>' };
const BREAK = '<amdpdbg:events xmlns:amdpdbg="x" xmlns:adtcore="y"><amdpdbg:mainResponse amdpdbg:kind="ON_BREAK" amdpdbg:requestId="R1" amdpdbg:debuggeeId="D1"><amdpdbg:abapPosition adtcore:uri="/sap/bc/adt/oo/classes/zcl_a/source/main#start=14"/><amdpdbg:variable amdpdbg:name="LV_I">1</amdpdbg:variable><amdpdbg:variable amdpdbg:name="LV_N" amdpdbg:isNullValue="true"/></amdpdbg:mainResponse></amdpdbg:events>';

describe('AMDP readings', () => {
  it('the start names the session in Location and the HANA session in the body', () => {
    expect(readAmdpStart(START)).toEqual({ mainId: '0123456789ABCDEF0123456789ABCDEF', hanaSession: '123' });
  });
  it('an ON_BREAK: its kind, line, debuggee and variables', () => {
    const [e] = readAmdpEvents(BREAK);
    expect(e).toMatchObject({ kind: 'ON_BREAK', debuggeeId: 'D1', line: 14 });
    expect(e.variables).toEqual([{ name: 'LV_I', value: '1' }, { name: 'LV_N', value: 'NULL' }]);
  });
});

describe('AmdpSession', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function world() {
    const reads: Array<ReturnType<typeof deferred<any>>> = [];
    const calls: string[] = [];
    const dbg = {
      start: async (u: string, o: any) => { calls.push(`start:${u}:${o.stopExisting}`); return okResponse(START); },
      getEvents: () => { const d = deferred<any>(); reads.push(d); return d.promise; },
      syncBreakpoints: async (_m: string, b: any[]) => { calls.push(`sync:${b.length}`); return okResponse({}); },
      step: async (_m: string, d: string, s: string) => { calls.push(`step:${d}:${s}`); return okResponse({}); },
      deleteDebuggee: async (_m: string, d: string) => { calls.push(`delete:${d}`); return okResponse({}); },
      stop: async () => { calls.push('stop'); return okResponse({}); },
      getDataPreview: async (o: any) => { calls.push(`preview:${o.variableName}:${o.debuggeeId}`); return okResponse('<dataPreview:tableData xmlns:dataPreview="z"><dataPreview:columns><dataPreview:metadata dataPreview:name="N"/><dataPreview:dataSet><dataPreview:data>1</dataPreview:data></dataPreview:dataSet></dataPreview:columns></dataPreview:tableData>'); },
    };
    const closed: unknown[] = [];
    const session = new AmdpSession({
      openConnection: async () => ({}) as any,
      closeConnection: async (c) => { closed.push(c); },
      amdpDebugger: () => dbg as any,
      requestUser: async () => 'SAPUSER01',
      run: async () => ({ ok: true, output: '' }),
    }).bind('origin');
    return { session, reads, calls, closed };
  }

  it('start → breakpoints → an ON_BREAK arrives through wait; steps address its debuggee', async () => {
    const { session, reads, calls } = world();
    await session.start({ stopExisting: true });
    expect(calls).toContain('start:SAPUSER01:true');
    await session.setBreakpoints([{ class_name: 'ZCL_A', line: 14 }]);
    expect(calls).toContain('sync:1');
    const waiting = session.wait(30);
    reads[0].resolve(okResponse(BREAK));
    await jest.advanceTimersByTimeAsync(0);
    const state = await waiting;
    expect(state).toMatchObject({ state: 'event', events: [{ kind: 'ON_BREAK', line: 14 }] });
    await session.step('continue');
    expect(calls).toContain('step:D1:continue');
  });

  it('stop releases a suspended debuggee first — a stop alone never does', async () => {
    const { session, reads, calls } = world();
    await session.start({ stopExisting: false });
    reads[0].resolve(okResponse(BREAK));
    await jest.advanceTimersByTimeAsync(0);
    await session.wait(0);
    await session.stop();
    expect(calls.indexOf('delete:D1')).toBeLessThan(calls.indexOf('stop'));
  });

  it('step without a debuggee is refused', async () => {
    const { session } = world();
    await session.start({ stopExisting: false });
    await expect(session.step('over')).rejects.toThrow(/no AMDP debuggee/);
  });
});
```

```ts
// src/__tests__/unit/debugger/ports.test.ts
import { requestUserOf } from '../../../lib/debugger/ports';
import { recordingConnection } from '../../helpers/recordingConnection';

describe('the request user', () => {
  it('is the user systeminformation names', async () => {
    const conn = recordingConnection([{ status: 200, data: JSON.stringify({ userName: 'cb9980000001' }) }]);
    await expect(requestUserOf(conn as any)).resolves.toBe('CB9980000001');
  });
  it('falls back to the login when the system names none', async () => {
    const conn = recordingConnection([{ status: 404, data: '' }]);
    process.env.SAP_USERNAME = 'sapuser01';
    try { await expect(requestUserOf(conn as any)).resolves.toBe('SAPUSER01'); }
    finally { delete process.env.SAP_USERNAME; }
  });
});
```

Before you write `requestUserOf`, check how `getSystemInformation` treats a 404 or a thrown error. Run `sed -n 1,80p node_modules/@mcp-abap-adt/adt-clients/dist/utils/systemInfo.js`. If it throws instead of answering `null`, wrap the call in `try/catch` and keep the test unchanged.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/answer.test.ts src/__tests__/unit/debugger/AmdpSession.test.ts src/__tests__/unit/debugger/ports.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement `answer.ts` and `schemas.ts`**

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

export async function debugAnswer<T>(args: unknown, work: () => Promise<DebugView<T>>, terse: (value: T) => unknown): Promise<McpResult> {
  try {
    const view = await work();
    const detail = detailOf(args);
    if (detail === 'raw') return text(view.raw);
    if (detail === 'full') return text(view.value);
    return text(terse(view.value));
  } catch (error) {
    return return_error(error) as McpResult;
  }
}

/** A state: terse gives where a stop stands and five frames; full the readings; raw SAP's documents. */
export async function debugStateAnswer(args: unknown, work: () => Promise<DebugState>): Promise<McpResult> {
  return debugAnswer(args, async () => {
    const state = await work();
    const raw = state.state === 'stopped' ? [state.stop.raw.debuggee, state.stop.raw.attach, state.stop.raw.stack].join('\n') : JSON.stringify(state);
    return { value: state, raw };
  }, (state) => (state.state === 'stopped' ? { state: 'stopped', ...terseStop(state.stop.debuggee, state.stop.stack) } : state));
}
```

Check `return_error`'s return type (`src/lib/utils.ts:229`) against `McpResult`. If it is already assignable, drop the cast.

```ts
// src/lib/debugger/schemas.ts
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import type { RunTarget } from './DebugSession';
import { type BreakpointTarget, lineUriOf } from './objectUri';

export const USER_MODE_WARNING =
  'User-mode debugging: a breakpoint stops every request of the connected SAP user — a browser session, a background run, another tool — not only a program this server runs.';
export const TAKE_OVER_WARNING =
  'Taking over displaces another debugger listening for the same user, such as an IDE; that debugger is told and stops catching.';

export const HOLD_SECONDS_PROPERTY = {
  hold_seconds: { type: 'number', description: 'How long to wait for a change, at most 30 seconds. Default 10.', default: 10 },
} as const;

export const BREAKPOINTS_PROPERTY = {
  breakpoints: {
    type: 'array',
    description: 'Breakpoints to add. Each is one of: a line ({object_type, object_name, line, include?, parent_name?}), an exception class ({exception_class}), an ABAP statement ({statement}), or a message ({message: {id, number, type}}); each takes an optional condition.',
    items: {
      type: 'object',
      properties: {
        object_type: { type: 'string', description: 'For a line: CLAS, PROG, INCL or FUNC.' },
        object_name: { type: 'string', description: 'For a line: the object holding it.' },
        line: { type: 'number', description: 'For a line: the line in the source the object shows.' },
        include: { type: 'string', description: 'For a class: definitions, implementations, macros or testclasses. Omitted: the main source.' },
        parent_name: { type: 'string', description: 'For a function module: its function group.' },
        exception_class: { type: 'string', description: 'Stops where an exception of this class is raised.' },
        statement: { type: 'string', description: 'Stops at every ABAP statement of this keyword.' },
        message: {
          type: 'object',
          properties: { id: { type: 'string' }, number: { type: 'string' }, type: { type: 'string' } },
          description: 'Stops where this message is sent: message class, number, type.',
        },
        condition: { type: 'string', description: 'Stops only when this ABAP condition holds.' },
      },
    },
  },
} as const;

export const RUN_PROPERTY = {
  run: {
    type: 'object',
    description: 'Optional: a class (run as a console application) or a report to start in the background once the listener is up. Its outcome arrives through the wait tool as ended.',
    properties: {
      kind: { type: 'string', enum: ['class', 'program'] },
      name: { type: 'string' },
    },
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
    if (b?.object_type && b?.object_name && Number.isInteger(b?.line)) {
      return { kind: 'line', uri: lineUriOf(b as BreakpointTarget, b.line), ...condition };
    }
    throw new Error(`breakpoints[${i}]: a line needs object_type, object_name and line; or give exception_class, statement or message`);
  });
}

export function runFromArgs(raw: unknown): RunTarget | undefined {
  if (!raw) return undefined;
  const r = raw as { kind?: string; name?: string };
  if ((r.kind !== 'class' && r.kind !== 'program') || !r.name) throw new Error('run: give kind (class or program) and name');
  return { kind: r.kind, name: r.name.trim().toUpperCase() };
}
```

- [ ] **Step 4: Implement `amdpReadings.ts`, `memoryReadings.ts`, `AmdpSession.ts`**

```ts
// src/lib/debugger/amdpReadings.ts
/**
 * AMDP debugger documents. No recorded answer exists yet: the shapes are the
 * ones the adt-clients AMDP integration test reads (measured on premise and
 * on the cloud, 2026-10-09). Task 12 records answers and checks these.
 */
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true,
  parseTagValue: false, parseAttributeValue: false, trimValues: false,
  isArray: (n) => ['mainResponse', 'variable', 'columns', 'data'].includes(n),
});
const text = (v: unknown) => (v === undefined || v === null || typeof v === 'object' ? (v as any)?.['#text'] ?? '' : String(v));

export interface AmdpEvent { kind: string; requestId: string; debuggeeId: string; line?: number; variables: Array<{ name: string; value: string }>; body: string }

export function readAmdpEvents(xml: string): AmdpEvent[] {
  if (!xml?.trim()) return [];
  const doc = parser.parse(xml);
  const root = doc.events ?? doc;
  const rows: any[] = root.mainResponse ?? [];
  const bodies = [...xml.matchAll(/<[\w-]*:?mainResponse\b[\s\S]*?<\/[\w-]*:?mainResponse>/g)].map((m) => m[0]);
  return rows.map((r, i) => {
    const uri = text(r.abapPosition?.uri);
    const line = /#start=(\d+)/.exec(uri)?.[1];
    return {
      kind: text(r.kind), requestId: text(r.requestId), debuggeeId: text(r.debuggeeId),
      ...(line ? { line: Number(line) } : {}),
      variables: (r.variable ?? []).map((v: any) => ({ name: text(v.name), value: text(v.isNullValue) === 'true' ? 'NULL' : text(v) })),
      body: bodies[i] ?? '',
    };
  });
}

export function readAmdpStart(wire: { headers?: Record<string, unknown>; data?: unknown }): { mainId: string; hanaSession: string } {
  const location = String(wire.headers?.location ?? wire.headers?.Location ?? '');
  const mainId = /\/main\/([^/?]+)/.exec(location)?.[1] ?? '';
  const body = String(wire.data ?? '');
  const hanaSession = /HANA_SESSION_ID[^>]*?value="([^"]*)"/.exec(body)?.[1] ?? /value="([^"]*)"[^>]*HANA_SESSION_ID/.exec(body)?.[1] ?? '';
  return { mainId, hanaSession };
}

export function readAmdpPreview(xml: string): { columns: Array<{ name: string; values: string[] }> } {
  const doc = parser.parse(xml ?? '');
  const columns: any[] = doc.tableData?.columns ?? [];
  return { columns: columns.map((c) => ({ name: text(c.metadata?.name), values: (c.dataSet?.data ?? []).map(text) })) };
}

export function terseAmdpEvent(e: AmdpEvent) {
  return { kind: e.kind, ...(e.line !== undefined ? { line: e.line } : {}), variables: e.variables };
}
```

```ts
// src/lib/debugger/memoryReadings.ts
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, parseTagValue: false, isArray: (n) => n === 'snapshot' });

/** Any memory document, its namespaces dropped — `full` for the views no recorded answer covers yet. */
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

Add a test in `src/__tests__/unit/debugger/memoryReadings.test.ts` that reads both recorded answers:

```ts
import { corpusBody } from '../../../lib/adtCorpus';
import { readSnapshotList } from '../../../lib/debugger/memoryReadings';
it('lists the snapshots of the user; none of a user with none', () => {
  const list = readSnapshotList(corpusBody('memory-snapshot-list--01-list-of-the-user'));
  expect(list[0]).toMatchObject({ id: '0CC47A1E68C11FE1B1827ADCF9D455CB', user: 'SAPUSER01', size: 168015 });
  expect(readSnapshotList(corpusBody('memory-snapshot-list--02-list-of-a-user-with-none'))).toEqual([]);
});
```

```ts
// src/lib/debugger/AmdpSession.ts
/**
 * The AMDP debugger's state — one per server instance, one AMDP session at a
 * time. Events are read on one session, commands go on another (measured);
 * the events are read in the background, so a model's wait is bounded by its
 * own hold, not the server's 200-second poll. A stop never releases a
 * suspended debuggee: `stop()` deletes it first.
 */
import { randomUUID } from 'node:crypto';
import type { AmdpDebugger, amdpDebuggerDocuments } from '@mcp-abap-adt/adt-clients';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { type AmdpEvent, readAmdpEvents, readAmdpPreview, readAmdpStart } from './amdpReadings';
import { DebugListenerError, DebugRequestError, DebugStateError, type DebugView, type RunOutcome, type RunTarget, WAIT_MAX_SECONDS } from './DebugSession';
import { lineUriOf } from './objectUri';

export type AmdpDebugger_ = AmdpDebugger<typeof amdpDebuggerDocuments>;
export interface AmdpSessionPorts<O = unknown> {
  openConnection(origin: O): Promise<IAbapConnection>;
  closeConnection(c: IAbapConnection): Promise<void>;
  amdpDebugger(c: IAbapConnection): AmdpDebugger_;
  requestUser(origin: O): Promise<string>;
  run(c: IAbapConnection, target: RunTarget): Promise<RunOutcome>;
}
export type AmdpState =
  | { state: 'idle' } | { state: 'waiting' }
  | { state: 'event'; events: AmdpEvent[] }
  | { state: 'ended'; reason: 'run_finished'; run: RunOutcome };

export class AmdpSession<O = unknown> {
  private origin?: O;
  private open?: { events: IAbapConnection; commands: IAbapConnection; onEvents: AmdpDebugger_; onCommands: AmdpDebugger_; mainId: string; hanaSession: string; generation: number };
  private generation = 0;
  private debuggeeId?: string;
  private queue: AmdpEvent[] = [];
  private notices: AmdpState[] = [];
  private failure?: string;
  private readonly waiters = new Set<() => void>();

  constructor(private readonly ports: AmdpSessionPorts<O>) {}
  bind(origin: O): this { this.origin = origin; return this; }

  private requireOrigin(): O {
    if (this.origin === undefined) throw new DebugStateError('the debugger has no connection yet');
    return this.origin;
  }
  private requireOpen() {
    if (!this.open) throw new DebugStateError('no AMDP debug session; AmdpDebugStart starts one');
    return this.open;
  }

  async start(options: { stopExisting: boolean; run?: RunTarget }): Promise<{ mainId: string }> {
    if (this.open) throw new DebugStateError('an AMDP debug session is already running; AmdpDebugStop ends it');
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
    this.open = { events, commands, onEvents, onCommands, mainId, hanaSession, generation: ++this.generation };
    this.failure = undefined;
    void this.readLoop(this.open);
    if (options.run) this.startRun(options.run);
    return { mainId };
  }

  private async readLoop(open: NonNullable<AmdpSession['open']>): Promise<void> {
    while (this.open === open && open.generation === this.generation) {
      const answer = await open.onEvents.getEvents(open.mainId).catch((e: unknown) => ({ ok: false as const, getError: () => ({ message: String(e) }) }) as any);
      if (this.open !== open) return;
      if (!answer.ok) { this.failure = answer.getError().message; this.notify(); return; }
      const events = readAmdpEvents(String(answer.getResult().value ?? ''));
      for (const e of events) if (e.kind === 'ON_BREAK') this.debuggeeId = e.debuggeeId;
      if (events.length) { this.queue.push(...events); this.notify(); }
    }
  }

  async setBreakpoints(list: Array<{ class_name: string; line: number }>): Promise<DebugView<string>> {
    const open = this.requireOpen();
    const breakpoints = list.map((b) => ({ clientId: randomUUID(), uri: lineUriOf({ object_type: 'CLAS', object_name: b.class_name }, b.line) }));
    const answer = await open.onCommands.syncBreakpoints(open.mainId, breakpoints);
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    return { value: `${breakpoints.length} sent; the outcome arrives as a SYNC_BREAKPOINTS event`, raw: JSON.stringify(breakpoints) };
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

  private requireDebuggee(): string {
    if (!this.debuggeeId) throw new DebugStateError('no AMDP debuggee is stopped; AmdpDebugWait answers ON_BREAK when one is');
    return this.debuggeeId;
  }

  async step(step: 'over' | 'continue'): Promise<DebugView<string>> {
    const open = this.requireOpen();
    const answer = await open.onCommands.step(open.mainId, this.requireDebuggee(), step);
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    return { value: 'sent; the next stop arrives as an event', raw: '' };
  }

  async getTable(variable: string, query?: string) {
    const open = this.requireOpen();
    const answer = await open.onCommands.getDataPreview({
      sessionId: open.hanaSession, debuggerId: open.mainId, debuggeeId: this.requireDebuggee(),
      variableName: variable.toUpperCase(), rowNumber: 100, ...(query ? { query } : {}),
    });
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    const raw = String(answer.getResult().value ?? '');
    return { value: readAmdpPreview(raw), raw };
  }

  async cancel(): Promise<void> {
    const open = this.requireOpen();
    const answer = await open.onCommands.deleteDebuggee(open.mainId, this.requireDebuggee());
    if (!answer.ok) throw new DebugRequestError(answer.getError().message);
    this.debuggeeId = undefined;
  }

  async stop(): Promise<void> {
    const open = this.open;
    this.open = undefined;
    this.generation++;
    if (open) {
      if (this.debuggeeId) await open.onCommands.deleteDebuggee(open.mainId, this.debuggeeId).catch(() => undefined);
      await open.onCommands.syncBreakpoints(open.mainId, []).catch(() => undefined);
      await open.onCommands.stop(open.mainId).catch(() => undefined);
      await this.ports.closeConnection(open.commands);
      await this.ports.closeConnection(open.events);
    }
    this.debuggeeId = undefined;
    this.queue = [];
    this.notices = [];
    this.failure = undefined;
    this.notify();
  }

  private startRun(target: RunTarget): void {
    const origin = this.requireOrigin();
    void (async () => {
      const c = await this.ports.openConnection(origin);
      let run: RunOutcome;
      try { run = await this.ports.run(c, target); } catch (e) { run = { ok: false, message: e instanceof Error ? e.message : String(e) }; }
      await this.ports.closeConnection(c);
      this.notices.push({ state: 'ended', reason: 'run_finished', run });
      this.notify();
    })();
  }

  private notify(): void { for (const w of [...this.waiters]) w(); }
}
```

- [ ] **Step 5: Implement `ports.ts`, `instance.ts`, `index.ts`, and the package export**

```ts
// src/lib/debugger/ports.ts
import {
  AbapDebugger, AdtExecutor, AmdpDebugger, getSystemInformation, type IDebuggerListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import { getEffectiveSystemContext } from '../systemContext';
import { closeQuietly, openFreshConnection } from '../packageSessions';
import { ourClassExecutor, ourProgramExecutor } from '../strategies/resultSets';
import type { AmdpSessionPorts } from './AmdpSession';
import type { DebugSessionPorts, RunOutcome, RunTarget } from './DebugSession';
import { newDebuggerId, statedDebuggerIds } from './ids';

/** The user whose requests are caught: what the system says, else the login. */
export async function requestUserOf(connection: IAbapConnection): Promise<string> {
  const info = await getSystemInformation(connection).catch(() => null);
  const user = info?.userName || process.env.SAP_USERNAME || getEffectiveSystemContext().responsible;
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
  return answer.ok
    ? { ok: true, output: String(answer.getResult().value ?? '') }
    : { ok: false, message: answer.getError().message };
}

export function liveDebugPorts(): DebugSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: (c) => closeQuietly(c, undefined, 'debugger connection'),
    abapDebugger: (c, onConflict: IDebuggerListenerConflict) => new AbapDebugger(c, undefined, undefined, { onConflict }),
    identity: async (context) => {
      const stated = statedDebuggerIds();
      return {
        requestUser: await requestUserOf(context.connection),
        terminalId: stated.terminalId ?? newDebuggerId(),
        ideId: stated.ideId ?? newDebuggerId(),
      };
    },
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

Two things to check before writing this:
- `ourClassExecutor.run` takes the `run({className}, {analyse})` shape that `handleRuntimeRunClass.ts:146-156` uses. Copy it from there exactly. If the executor's answer value is not a string, do what `terseClassRun` does with the output.
- `AbapDebugger` / `AmdpDebugger` / `AdtExecutor` / `getSystemInformation` are exported from the package root. Run `grep -n "AbapDebugger\|AdtExecutor\|getSystemInformation" node_modules/@mcp-abap-adt/adt-clients/dist/index.d.ts`. If one is missing, import it from `@mcp-abap-adt/adt-clients/runtime` (or `/core` for `getSystemInformation`).

```ts
// src/lib/debugger/instance.ts
/** The process's sessions (D1): stdio is one process, one user session. */
import type { HandlerContext } from '../../handlers/interfaces';
import { AmdpSession } from './AmdpSession';
import { DebugSession } from './DebugSession';
import { liveAmdpPorts, liveDebugPorts } from './ports';

let abap: DebugSession<HandlerContext> | undefined;
let amdp: AmdpSession<HandlerContext> | undefined;

export function debugSessionFor(context: HandlerContext): DebugSession<HandlerContext> {
  abap ??= new DebugSession(liveDebugPorts());
  return abap.bind(context);
}
export function amdpSessionFor(context: HandlerContext): AmdpSession<HandlerContext> {
  amdp ??= new AmdpSession(liveAmdpPorts());
  return amdp.bind(context);
}
export async function shutdownDebugger(): Promise<void> {
  await Promise.allSettled([abap?.stop(), amdp?.stop()]);
}
export function replaceDebuggerSessions(next?: DebugSession<HandlerContext>, nextAmdp?: AmdpSession<HandlerContext>): void {
  abap = next;
  amdp = nextAmdp;
}
```

```ts
// src/lib/debugger/index.ts
export * from './answer';
export * from './AmdpSession';
export * from './amdpReadings';
export * from './DebugSession';
export * from './ids';
export * from './instance';
export * from './memoryReadings';
export * from './objectUri';
export * from './readings';
export * from './schemas';
```

In `package.json`, add an `exports` entry after `"./compact-shared"`:

```json
    "./debugger": {
      "types": "./dist/lib/debugger/index.d.ts",
      "import": "./dist/lib/debugger/index.js",
      "require": "./dist/lib/debugger/index.js"
    }
```

Also add `"debugger": ["dist/lib/debugger/index.d.ts"]` under `typesVersions["*"]`.

- [ ] **Step 6: Run the unit folder and the type check**

Run: `npx jest src/__tests__/unit/debugger/ && npm run test:check && npm run build`
Expected: PASS, no type errors, and a clean build.

- [ ] **Step 7: Commit**

```bash
git add src/lib/debugger/ src/__tests__/unit/debugger/ package.json
git commit -m "feat(debugger): AMDP session, live ports, per-process instance, answers for the model"
```

---

### Task 7: The `debug` exposition set, stdio only, shutdown cleanup

**Files:**
- Create: `src/lib/handlers/groups/DebugHandlersGroup.ts` (with an empty `getHandlers()`; Tasks 8–10 fill it)
- Modify:
  - `src/lib/handlers/groups/index.ts`
  - `src/lib/config/IServerConfig.ts:30`
  - `src/lib/config/ServerConfigManager.ts:213-226` and its help text
  - `src/lib/config/yamlConfig.ts:385-390` (allow `debug`)
  - `server/src/launcher.ts:210-225` (`LauncherOptions.statefulGroups`), `:519-560`, `:613-620`, and the help near l.165
  - `src/lib/handlers/HandlerExporter.ts` (`includeDebug`, default `false`)
  - `scripts/list-tools.ts` (group `debug`)
- Test: `src/__tests__/unit/debugger/exposition.test.ts`

**Interfaces:**
- Produces:
  - `type HandlerSet = 'readonly' | 'high' | 'low' | 'compact' | 'debug'`.
  - `class DebugHandlersGroup extends BaseHandlerGroup` with `groupName = 'DebugHandlers'`.
  - `LauncherOptions.statefulGroups?: (context: HandlerContext) => IHandlerGroup[]`.
  - `export function refuseStatefulOverNonStdio(transport: string, groups: readonly IHandlerGroup[]): string | undefined`, in `server/src/launcher.ts`. It returns the refusal message, or `undefined`.
  - `HandlerExporterOptions.includeDebug?: boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/unit/debugger/exposition.test.ts
import { refuseStatefulOverNonStdio } from '../../../../server/src/launcher';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import { ArgumentsParser } from '../../../lib/config/ArgumentsParser';
import { ServerConfigManager } from '../../../lib/config/ServerConfigManager';

const ctx = { connection: undefined, logger: undefined } as any;

describe('the debug set', () => {
  it('is parsed from --exposition', () => {
    const argv = process.argv;
    process.argv = ['node', 'x', '--exposition=readonly,debug'];
    try {
      expect(new ServerConfigManager().getConfig().exposition).toEqual(['readonly', 'debug']);
    } finally { process.argv = argv; }
  });

  it('debug over http refuses at startup, naming stdio', () => {
    expect(refuseStatefulOverNonStdio('http', [new DebugHandlersGroup(ctx)])).toMatch(/stdio/);
    expect(refuseStatefulOverNonStdio('sse', [new DebugHandlersGroup(ctx)])).toMatch(/stdio/);
    expect(refuseStatefulOverNonStdio('stdio', [new DebugHandlersGroup(ctx)])).toBeUndefined();
    expect(refuseStatefulOverNonStdio('http', [])).toBeUndefined();
  });

  it('HandlerExporter leaves it out unless asked', () => {
    const names = (o: any) => new HandlerExporter(o).getHandlerEntries().map((e) => e.toolDefinition.name);
    expect(names({}).some((n: string) => n.startsWith('Debug'))).toBe(false);
  });
});
```

Before you write this test, check how `ServerConfigManager` reads argv and what it is named. Run `grep -n "class ServerConfigManager\|getConfig\|ArgumentsParser" src/lib/config/ServerConfigManager.ts | head`. Use the same entry point the existing exposition tests use (`grep -rln "parseExposition\|--exposition" src/__tests__/unit`), and copy their setup instead of the `process.argv` swap shown above if they differ.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/__tests__/unit/debugger/exposition.test.ts`
Expected: FAIL. The module is missing, or `debug` is filtered out.

- [ ] **Step 3: Implement**

```ts
// src/lib/handlers/groups/DebugHandlersGroup.ts
import type { HandlerEntry } from '../interfaces';
import { BaseHandlerGroup } from '../base/BaseHandlerGroup';

/**
 * The debugger tools — opt-in (`--exposition=…,debug`): user-mode breakpoints
 * catch every request of the SAP user. They keep state between calls, so they
 * are served only where one instance lives for the whole MCP session (stdio).
 */
export class DebugHandlersGroup extends BaseHandlerGroup {
  protected groupName = 'DebugHandlers';
  getHandlers(): HandlerEntry[] {
    return [];
  }
}
```

The remaining changes:
- `src/lib/handlers/groups/index.ts`: add `export { DebugHandlersGroup } from './DebugHandlersGroup';`.
- `IServerConfig.ts:30`: `export type HandlerSet = 'readonly' | 'high' | 'low' | 'compact' | 'debug';`
- `ServerConfigManager.parseExposition` filter: add `|| s === 'debug'`. In the help text, add `debug — the debugger tools; opt-in, stdio only` to the exposition list.
- `yamlConfig.ts:385-390`: whatever whitelist applies there gets `'debug'` too.
- `HandlerExporter`: add `includeDebug?: boolean` with the doc comment "Debugger tools (default false): opt-in, they catch every request of the SAP user". After the search group, add `if (options?.includeDebug === true) this.handlerGroups.push(new DebugHandlersGroup(dummyContext));`.

`server/src/launcher.ts`:

```ts
/** The stateful tool groups need one instance per MCP session: stdio until #287. */
export function refuseStatefulOverNonStdio(transport: string, groups: readonly IHandlerGroup[]): string | undefined {
  if (transport === 'stdio' || groups.length === 0) return undefined;
  return `The debugger tools keep state between tool calls and are served over stdio only; --transport=${transport} builds a server per request. Drop debug from the exposition, or run over stdio.`;
}
```

In `LauncherOptions` (l.210-225), add:

```ts
  /** Groups whose tools keep state between calls (the debugger): stdio only. */
  statefulGroups?: (context: HandlerContext) => IHandlerGroup[];
```

After `handlerGroups.push(...overridingGroups);` (l.553):

```ts
  const statefulGroups: IHandlerGroup[] = [
    ...(exposition.includes('debug') ? [new DebugHandlersGroup(baseContext)] : []),
    ...(options.statefulGroups?.(baseContext) ?? []),
  ];
  const refusal = refuseStatefulOverNonStdio(config.transport, statefulGroups);
  if (refusal) {
    deps.stderr(`[MCP] ${refusal}`);
    deps.exit(1);
    return;
  }
  handlerGroups.push(...statefulGroups);
```

In the stdio branch (l.613-620), change `servers: []` to `servers: [{ close: () => shutdownDebugger() }]` and import `shutdownDebugger` from `../../src/lib/debugger/instance`. Use the same relative import style as the launcher's other `src/lib` imports.

`scripts/list-tools.ts`: add `debug: new DebugHandlersGroup(ctx),` to `groups`.

- [ ] **Step 4: Run them and see them pass; run the ratchets**

Run: `npx jest src/__tests__/unit/debugger/exposition.test.ts src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS. The group is empty, so the surface does not change yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/handlers/groups/ src/lib/config/ server/src/launcher.ts src/lib/handlers/HandlerExporter.ts scripts/list-tools.ts src/__tests__/unit/debugger/exposition.test.ts
git commit -m "feat(debugger): opt-in exposition set debug, stdio only, cleanup on shutdown"
```

---

### Task 8: Core ABAP debugger tools

**Files:**
- Create the following in `src/handlers/debugger/debug/`:
  - `handleDebugSetBreakpoints.ts`, `handleDebugDeleteBreakpoint.ts`, `handleDebugListBreakpoints.ts`
  - `handleDebugStartListener.ts`, `handleDebugTakeOverListener.ts`, `handleDebugWait.ts`
  - `handleDebugGetStack.ts`, `handleDebugSetStackPosition.ts`, `handleDebugGetVariables.ts`, `handleDebugSetVariable.ts`
  - `handleDebugStep.ts`, `handleDebugStepToLine.ts`, `handleDebugTerminate.ts`
  - `handleDebugCreateWatchpoint.ts`, `handleDebugListWatchpoints.ts`, `handleDebugDeleteWatchpoint.ts`
  - `handleDebugGetMemorySizes.ts`, `handleDebugCreateMemorySnapshot.ts`, `handleDebugStop.ts`
- Modify: `src/lib/handlers/groups/DebugHandlersGroup.ts`, `tests/fixtures/tools/surface.json`, `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts:131-139` (`includeDebug: true`) and l.128 (`TAKES_NO_PARAMETERS`; see Step 4)
- Test: `src/__tests__/unit/debugger/handlers.test.ts`

**Interfaces:**
- Consumes: `debugSessionFor`, `replaceDebuggerSessions`, `debugAnswer`, `debugStateAnswer`, `breakpointsFromArgs`, `runFromArgs`, the schema constants, `lineUriOf`, `terseVariables`, `terseStop`, `DETAIL_PROPERTY`.
- Produces: tool names exactly as in spec §2.

Every handler has the shape below (a complete file):

```ts
// src/handlers/debugger/debug/handleDebugGetStack.ts
import { debugAnswer } from '../../../lib/debugger/answer';
import { debugSessionFor } from '../../../lib/debugger/instance';
import { terseStop } from '../../../lib/debugger/readings';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetStack',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] The call stack of the stopped debuggee: where it stands and the frames that led there. Requires a stop (DebugWait answers stopped).',
  inputSchema: { type: 'object', properties: { ...DETAIL_PROPERTY }, required: [] },
} as const;

export async function handleDebugGetStack(context: HandlerContext, args: { detail?: string }) {
  return debugAnswer(args, () => debugSessionFor(context).getStack(), (stop) => terseStop(stop.debuggee, stop.stack));
}
```

The other 18 files, written the same way: imports as above, plus whatever the row needs (`breakpointsFromArgs`, `runFromArgs`, `debugStateAnswer`, `lineUriOf`, `terseVariables`, the schema constants, `USER_MODE_WARNING`, `TAKE_OVER_WARNING`, `HOLD_SECONDS_PROPERTY`, `BREAKPOINTS_PROPERTY`, `RUN_PROPERTY`). Each description starts with `[debug] `. Every `properties` spreads `...DETAIL_PROPERTY`. Every tool has `available_in: ['onprem', 'cloud'] as const`.

| File | name | properties (besides detail) | required | description | body |
|---|---|---|---|---|---|
| handleDebugSetBreakpoints | DebugSetBreakpoints | `...BREAKPOINTS_PROPERTY` | `['breakpoints']` | `Adds breakpoints and answers which were placed and which were refused, with the reason. ${USER_MODE_WARNING}` | `debugAnswer(args, () => debugSessionFor(context).setBreakpoints(breakpointsFromArgs(args.breakpoints)), (v) => ({ placed: v.placed.map((p) => ({ id: p.id, kind: p.kind, ...(p.uri ? { uri: p.uri } : {}) })), refused: v.refused }))` |
| handleDebugDeleteBreakpoint | DebugDeleteBreakpoint | `breakpoint_id: {type:'string', description:'The id DebugSetBreakpoints or DebugListBreakpoints answered.'}` | `['breakpoint_id']` | `Removes one breakpoint by its id.` | `debugAnswer(args, async () => { await debugSessionFor(context).deleteBreakpoint(String(args.breakpoint_id)); return { value: 'deleted', raw: '' }; }, (v) => v)` |
| handleDebugListBreakpoints | DebugListBreakpoints | none | `[]` | `The breakpoints this server armed. The system lists none itself.` | `debugAnswer(args, async () => { const list = debugSessionFor(context).listBreakpoints(); return { value: list, raw: JSON.stringify(list) }; }, (v) => v)` |
| handleDebugStartListener | DebugStartListener | `...RUN_PROPERTY` | `[]` | `Starts listening for a debuggee of the connected SAP user, refusing if another debugger already listens for that user (that is an error carrying the system's message). A caught debuggee is attached at once; DebugWait reports it. Optional run starts a class or report in the background. ${USER_MODE_WARNING}` | `debugStateAnswer(args, () => debugSessionFor(context).start('refuse', runFromArgs(args.run)))` |
| handleDebugTakeOverListener | DebugTakeOverListener | `...RUN_PROPERTY` | `[]` | `Starts listening like DebugStartListener, displacing another debugger of the same user. ${TAKE_OVER_WARNING} ${USER_MODE_WARNING}` | `debugStateAnswer(args, () => debugSessionFor(context).start('takeOver', runFromArgs(args.run)))` |
| handleDebugWait | DebugWait | `...HOLD_SECONDS_PROPERTY` | `[]` | `Waits up to hold_seconds and answers the state: listening, stopped (where the debuggee stands), or ended (released, terminated, or the background run finished with its output). A debugger that took the user over is an error carrying the system's message; the listener is then not restarted.` | `debugStateAnswer(args, () => debugSessionFor(context).wait(Number(args.hold_seconds ?? 10)))` |
| handleDebugGetStack | (above) | | | | |
| handleDebugSetStackPosition | DebugSetStackPosition | `position: {type:'number', description:'The frame position DebugGetStack answered.'}` | `['position']` | `Selects the stack frame variables are read in. What runs next does not change.` | `debugAnswer(args, () => debugSessionFor(context).setStackPosition(Number(args.position)), (stop) => terseStop(stop.debuggee, stop.stack))` |
| handleDebugGetVariables | DebugGetVariables | `names: {type:'array', items:{type:'string'}, description:'Variables by name; a path reads a component or a row, such as a structure component or a table row by index.'}`, `parents: {type:'array', items:{type:'string'}, description:'Instead of names: expand these. @ROOT answers the scopes; @LOCALS, @PARAMETERS, an object reference or a table expand into their members.'}` | `[]` | `Reads variables at the stop: by name, or the children of a parent. Requires a stop.` | `debugAnswer(args, () => { const s = debugSessionFor(context); return Array.isArray(args.names) && args.names.length ? s.getVariables(args.names.map(String)) : s.getChildVariables(Array.isArray(args.parents) && args.parents.length ? args.parents.map(String) : ['@ROOT']); }, (v) => (v.variables.length ? terseVariables(v) : v.children.map((c) => ({ id: c.child, label: c.label }))))` |
| handleDebugSetVariable | DebugSetVariable | `name: {type:'string', description:'The variable.'}`, `value: {type:'string', description:'The new value; the system converts what does not fit the type.'}` | `['name','value']` | `Sets a variable's value at the stop. Requires a stop.` | `debugAnswer(args, () => debugSessionFor(context).setVariable(String(args.name), String(args.value)), terseVariables)` |
| handleDebugStep | DebugStep | `action: {type:'string', enum:['into','over','return','continue'], description:'into a call, over it, return from the current one, or continue to the next stop.'}` | `['action']` | `Moves the stopped debuggee and answers the new state: stopped where it now stands, or ended when it ran to its end.` | `debugStateAnswer(args, () => debugSessionFor(context).step(({ into: 'stepInto', over: 'stepOver', return: 'stepReturn', continue: 'stepContinue' } as const)[String(args.action) as 'into'] ?? (() => { throw new Error('action: into, over, return or continue'); })()))` |
| handleDebugStepToLine | DebugStepToLine | `mode: {type:'string', enum:['run','jump'], description:'run executes up to the line; jump moves there without executing what lies between.'}`, `object_type`, `object_name`, `include`, `parent_name` (descriptions copied from `BREAKPOINTS_PROPERTY.breakpoints.items.properties`), `line: {type:'number'}` | `['mode','object_type','object_name','line']` | `Runs or jumps the stopped debuggee to a line. Requires a stop.` | `debugStateAnswer(args, () => debugSessionFor(context).stepToLine(args.mode === 'jump' ? 'stepJumpToLine' : 'stepRunToLine', lineUriOf(args, Number(args.line))))` |
| handleDebugTerminate | DebugTerminate | none | `[]` | `Ends the stopped debuggee where it stands; the program does not run on.` | `debugStateAnswer(args, () => debugSessionFor(context).terminate())` |
| handleDebugCreateWatchpoint | DebugCreateWatchpoint | `name: {type:'string', description:'The variable to watch.'}`, `condition: {type:'string', description:'Optional: stop only when this holds.'}` | `['name']` | `Stops the debuggee when a variable changes. Requires a stop.` | `debugAnswer(args, () => debugSessionFor(context).createWatchpoint(String(args.name), args.condition ? String(args.condition) : undefined), readXmlDocument)` |
| handleDebugListWatchpoints | DebugListWatchpoints | none | `[]` | `The watchpoints at the stop.` | `debugAnswer(args, () => debugSessionFor(context).listWatchpoints(), readXmlDocument)` |
| handleDebugDeleteWatchpoint | DebugDeleteWatchpoint | `watchpoint_id: {type:'string'}` | `['watchpoint_id']` | `Removes a watchpoint by its id.` | `debugAnswer(args, async () => { await debugSessionFor(context).deleteWatchpoint(String(args.watchpoint_id)); return { value: 'deleted', raw: '' }; }, (v) => v)` |
| handleDebugGetMemorySizes | DebugGetMemorySizes | none | `[]` | `The stopped debuggee's memory: how much its objects take. Requires a stop.` | `debugAnswer(args, () => debugSessionFor(context).getMemorySizes(), readXmlDocument)` |
| handleDebugCreateMemorySnapshot | DebugCreateMemorySnapshot | none | `[]` | `Writes a memory snapshot of the stopped debuggee and answers the file it was written to. It appears in MemorySnapshotList later; listing needs the memory snapshot authorization, and without it the list is empty.` | `debugAnswer(args, () => debugSessionFor(context).createMemorySnapshot(), readXmlDocument)` |
| handleDebugStop | DebugStop | none | `[]` | `Turns debugging off: releases a stopped debuggee, deletes the breakpoints this server armed, stops the listener, closes its connections.` | `debugAnswer(args, async () => { await debugSessionFor(context).stop(); return { value: { state: 'idle' }, raw: '' }; }, (v) => v)` |

The rows that answer an SAP document under `terse` (memory, watchpoints) use `readXmlDocument` until Task 12 records those answers. Task 13 replaces them with terse projections.

Write `handleDebugStep`'s mapping as a named constant instead of the inline IIFE:

```ts
const STEPS = { into: 'stepInto', over: 'stepOver', return: 'stepReturn', continue: 'stepContinue' } as const;
export async function handleDebugStep(context: HandlerContext, args: { action?: string; detail?: string }) {
  return debugStateAnswer(args, async () => {
    const method = STEPS[String(args.action) as keyof typeof STEPS];
    if (!method) throw new Error('action: into, over, return or continue');
    return debugSessionFor(context).step(method);
  });
}
```

- [ ] **Step 1: Write the failing handler test**

```ts
// src/__tests__/unit/debugger/handlers.test.ts
import { CONFLICT_GRACE_MS, DebugSession } from '../../../lib/debugger/DebugSession';
import { replaceDebuggerSessions } from '../../../lib/debugger/instance';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { handleDebugSetBreakpoints } from '../../../handlers/debugger/debug/handleDebugSetBreakpoints';
import { handleDebugStartListener } from '../../../handlers/debugger/debug/handleDebugStartListener';
import { handleDebugWait } from '../../../handlers/debugger/debug/handleDebugWait';
import { handleDebugGetStack } from '../../../handlers/debugger/debug/handleDebugGetStack';
import { fakeWorld, LISTEN_CATCH, CONFLICT } from './fakes';

const ctx = { connection: {} as any, logger: undefined };
const json = (r: any) => JSON.parse(r.content[0].text);

describe('debugger handlers over the session', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.useRealTimers(); replaceDebuggerSessions(); });

  function install() {
    const world = fakeWorld();
    replaceDebuggerSessions(new DebugSession(world.ports as any));
    return world;
  }

  it('the group serves the 22 core tools of spec §2 (19 ABAP + 3 memory snapshot)', () => {
    const names = new DebugHandlersGroup(ctx as any).getHandlers().map((e) => e.toolDefinition.name);
    expect(names).toEqual(expect.arrayContaining([
      'DebugSetBreakpoints', 'DebugDeleteBreakpoint', 'DebugListBreakpoints', 'DebugStartListener',
      'DebugTakeOverListener', 'DebugWait', 'DebugGetStack', 'DebugSetStackPosition', 'DebugGetVariables',
      'DebugSetVariable', 'DebugStep', 'DebugStepToLine', 'DebugTerminate', 'DebugCreateWatchpoint',
      'DebugListWatchpoints', 'DebugDeleteWatchpoint', 'DebugGetMemorySizes', 'DebugCreateMemorySnapshot', 'DebugStop',
    ]));
  });

  it("a line breakpoint's URI is built from type, name and line", async () => {
    const world = install();
    const setSpy = jest.fn(async () => (await import('../../helpers/fakeClient')).okResponse('<dbg:breakpoints xmlns:dbg="x"/>'));
    world.ports.abapDebugger = () => ({ setBreakpoints: setSpy }) as any;
    await handleDebugSetBreakpoints(ctx as any, { breakpoints: [{ object_type: 'CLAS', object_name: 'ZCL_A', line: 7 }] });
    expect(setSpy).toHaveBeenCalledWith(expect.anything(), [{ kind: 'line', uri: '/sap/bc/adt/oo/classes/zcl_a/source/main#start=7' }]);
  });

  it('start → wait → stopped, terse', async () => {
    const world = install();
    const started = handleDebugStartListener(ctx as any, {});
    await jest.advanceTimersByTimeAsync(CONFLICT_GRACE_MS);
    expect(json(await started)).toEqual({ state: 'listening' });
    world.polls[0].resolve(LISTEN_CATCH());
    await jest.advanceTimersByTimeAsync(0);
    const waited = json(await handleDebugWait(ctx as any, { hold_seconds: 0 }));
    expect(waited).toMatchObject({ state: 'stopped', line: 32 });
    expect(waited.frames).toHaveLength(5);
    expect((await handleDebugGetStack(ctx as any, { detail: 'raw' })).content[0].text).toContain('<dbg:stack');
  });

  it('a conflict at the start is a tool error', async () => {
    const world = install();
    const started = handleDebugStartListener(ctx as any, {});
    world.polls[0].resolve(CONFLICT());
    const r: any = await started;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('SY 530');
  });

  it('a stop tool without a stop is a tool error', async () => {
    install();
    const r: any = await handleDebugGetStack(ctx as any, {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no debuggee is stopped/);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/__tests__/unit/debugger/handlers.test.ts`
Expected: FAIL, "Cannot find module '../../../handlers/debugger/debug/…'".

- [ ] **Step 3: Write the 19 handlers and register them**

Write the files from the table. In `DebugHandlersGroup.getHandlers()`, return one entry per tool, the way `SystemHandlersGroup` does:

```ts
{ toolDefinition: DebugGetStack_Tool, handler: (args: any) => handleDebugGetStack(this.context, args) },
```

The 3 memory snapshot tools of Task 9 join this same group.

- [ ] **Step 4: Ratchets**

In `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts:131-139`, add `includeDebug: true` to the `HandlerExporter` options. Then update `TAKES_NO_PARAMETERS` (l.128). With `DETAIL_PROPERTY` on every tool, none of the debug tools has empty `properties`, so the list stays as it is. Check this assumption by running the test.

Append one row per new tool to `tests/fixtures/tools/surface.json`: `{"group":"debug","name":"DebugGetStack","inputs":"detail","available_in":"cloud, onprem"}`. The `inputs` column lists properties in declaration order, `*` marking a required one. Generate the rows with `npx tsx scripts/list-tools.ts` and paste the `debug` rows rather than writing them by hand.

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/debugger/ src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit/
git commit -m "feat(debugger): core ABAP debugger tools"
```

---

### Task 9: Memory snapshot tools

**Files:**
- Create: `src/handlers/debugger/debug/handleMemorySnapshotList.ts`, `handleMemorySnapshotGet.ts`, `handleMemorySnapshotDelta.ts`
- Modify: `DebugHandlersGroup.ts`, `tests/fixtures/tools/surface.json`
- Test: `src/__tests__/unit/debugger/memoryHandlers.test.ts`

**Interfaces:**
- Consumes: `MemorySnapshots` from `@mcp-abap-adt/adt-clients` (no session state, so the handler context's connection is used directly), `readSnapshotList`, `readXmlDocument`, `debugAnswer`.
- Produces:
  - `MemorySnapshotList(user?, detail)`.
  - `MemorySnapshotGet(snapshot_id*, view: header|overview|ranking|children|references, key?, max_objects?, detail)`.
  - `MemorySnapshotDelta(from_id*, to_id*, view: overview|ranking|children|references, key?, max_objects?, detail)`.
  - `max_objects` defaults to 50 and is sent as `maxNumberOfObjects` / `maxNumberOfReferences` (both are required by SAP, measured).
  - `key` is the parent key for children and the object key for references. It is required for those two views.

```ts
// src/handlers/debugger/debug/handleMemorySnapshotGet.ts
import { MemorySnapshots } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { debugAnswer } from '../../../lib/debugger/answer';
import { readXmlDocument } from '../../../lib/debugger/memoryReadings';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const SNAPSHOT_VIEW_PROPERTIES = {
  view: { type: 'string', enum: ['header', 'overview', 'ranking', 'children', 'references'], default: 'overview', description: 'header: the snapshot itself; overview: memory by kind; ranking: the largest objects; children: what an object holds (key: its key); references: who holds an object (key: its key).' },
  key: { type: 'string', description: 'For children and references: the object key a ranking or children view answered.' },
  max_objects: { type: 'number', default: 50, description: 'How many objects a ranking, children or references view answers.' },
} as const;

export const TOOL_DEFINITION = {
  name: 'MemorySnapshotGet',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] One memory snapshot in the view asked for. Requires the memory snapshot authorization; a snapshot the system cannot find is an error.',
  inputSchema: {
    type: 'object',
    properties: { snapshot_id: { type: 'string', description: 'The id MemorySnapshotList answered.' }, ...SNAPSHOT_VIEW_PROPERTIES, ...DETAIL_PROPERTY },
    required: ['snapshot_id'],
  },
} as const;

type Args = { snapshot_id: string; view?: string; key?: string; max_objects?: number; detail?: string };

export async function handleMemorySnapshotGet(context: HandlerContext, args: Args) {
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
    return { value: readXmlDocument(raw), raw };
  }, (v) => v);
}

export function requireKey(args: { key?: string; view?: string }): string {
  if (!args.key) throw new Error(`view ${args.view}: give key`);
  return String(args.key);
}
```

`MemorySnapshotDelta` uses the same switch over `getDeltaOverview / getDeltaRankingList / getDeltaChildren / getDeltaReferences(fromId, toId, …)`. It has no `header`, and it imports `SNAPSHOT_VIEW_PROPERTIES` and `requireKey` from `handleMemorySnapshotGet`. `MemorySnapshotList`:

```ts
export const TOOL_DEFINITION = {
  name: 'MemorySnapshotList',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] The memory snapshots the system lists, newest first: id, user, time, size, program. Listing needs the memory snapshot authorization; without it the system answers an empty list, not an error. A snapshot just written appears after a while.',
  inputSchema: { type: 'object', properties: { user: { type: 'string', description: "Optional: another user's snapshots." }, ...DETAIL_PROPERTY }, required: [] },
} as const;

export async function handleMemorySnapshotList(context: HandlerContext, args: { user?: string; detail?: string }) {
  const snapshots = new MemorySnapshots(context.connection, context.logger);
  return debugAnswer(args, async () => {
    const answer = await snapshots.list({ analyse: analyseException, ...(args.user ? { user: args.user.toUpperCase() } : {}) });
    if (!answer.ok) throw new Error(answer.getError().message);
    const raw = String(answer.getResult().value ?? '');
    return { value: readSnapshotList(raw), raw };
  }, (list) => (list.length ? list.map(({ fileName: _f, ...rest }) => rest) : { snapshots: [], note: 'none listed — or the memory snapshot authorization is missing' }));
}
```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/debugger/memoryHandlers.test.ts
import { corpusBody } from '../../../lib/adtCorpus';
import { handleMemorySnapshotGet } from '../../../handlers/debugger/debug/handleMemorySnapshotGet';
import { handleMemorySnapshotList } from '../../../handlers/debugger/debug/handleMemorySnapshotList';
import { recordingConnection } from '../../helpers/recordingConnection';

describe('memory snapshot tools', () => {
  it('lists the recorded snapshots, terse', async () => {
    const conn = recordingConnection([{ status: 200, data: corpusBody('memory-snapshot-list--01-list-of-the-user') }]);
    const r: any = await handleMemorySnapshotList({ connection: conn, logger: undefined } as any, {});
    expect(JSON.parse(r.content[0].text)[0]).toMatchObject({ id: '0CC47A1E68C11FE1B1827ADCF9D455CB' });
  });
  it('an empty list says the authorization may be missing', async () => {
    const conn = recordingConnection([{ status: 200, data: corpusBody('memory-snapshot-list--02-list-of-a-user-with-none') }]);
    const r: any = await handleMemorySnapshotList({ connection: conn, logger: undefined } as any, {});
    expect(r.content[0].text).toMatch(/authorization/);
  });
  it('ranking sends the required limit', async () => {
    const conn = recordingConnection([{ status: 200, data: '<mi:rankingList xmlns:mi="x"/>' }]);
    await handleMemorySnapshotGet({ connection: conn, logger: undefined } as any, { snapshot_id: 'S1', view: 'ranking' });
    expect(conn.requests[0].url).toContain('maxNumberOfObjects=50');
  });
  it('children without key is an error that sends nothing', async () => {
    const conn = recordingConnection([]);
    const r: any = await handleMemorySnapshotGet({ connection: conn, logger: undefined } as any, { snapshot_id: 'S1', view: 'children' });
    expect(r.isError).toBe(true);
    expect(conn.requests).toHaveLength(0);
  });
});
```

If `recordingConnection` puts the query into `params` rather than `url`, assert on `conn.requests[0].params` instead. Read `src/__tests__/helpers/recordingConnection.ts:53` first.

- [ ] **Step 2: Run it and see it fail**

Run: `npx jest src/__tests__/unit/debugger/memoryHandlers.test.ts`
Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Write the three handlers, register them in `DebugHandlersGroup`, add the surface rows**

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/debugger/debug/handleMemorySnapshot*.ts src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit/debugger/memoryHandlers.test.ts
git commit -m "feat(debugger): memory snapshot list, views and deltas"
```

---

### Task 10: AMDP debugger tools

**Files:**
- Create the following in `src/handlers/debugger/debug/`: `handleAmdpDebugStart.ts`, `handleAmdpDebugSetBreakpoints.ts`, `handleAmdpDebugWait.ts`, `handleAmdpDebugStep.ts`, `handleAmdpDebugGetTable.ts`, `handleAmdpDebugCancel.ts`, `handleAmdpDebugStop.ts`
- Modify: `DebugHandlersGroup.ts`, `tests/fixtures/tools/surface.json`
- Test: `src/__tests__/unit/debugger/amdpHandlers.test.ts`

**Interfaces:**
- Consumes: `amdpSessionFor`, `AmdpSession`, `terseAmdpEvent`, `debugAnswer`, `runFromArgs`, `RUN_PROPERTY`, `HOLD_SECONDS_PROPERTY`, `USER_MODE_WARNING`.

Every description starts with `[debug] `. Every tool spreads `DETAIL_PROPERTY` and has `available_in: ['onprem', 'cloud'] as const`.

| Tool | properties | required | description | body |
|---|---|---|---|---|
| AmdpDebugStart | `stop_existing: {type:'boolean', default:false, description:'Ends an AMDP debug session of this user left behind (otherwise the start is refused while one exists).'}`, `...RUN_PROPERTY` | `[]` | `Starts the AMDP debugger for the connected SAP user. Optional run starts a class in the background. ${USER_MODE_WARNING}` | `debugAnswer(args, async () => { const r = await amdpSessionFor(context).start({ stopExisting: args.stop_existing === true, run: runFromArgs(args.run) }); return { value: { state: 'waiting', ...r }, raw: JSON.stringify(r) }; }, (v) => ({ state: v.state }))` |
| AmdpDebugSetBreakpoints | `breakpoints: {type:'array', items:{type:'object', properties:{class_name:{type:'string'}, line:{type:'number', description:'The line in the class source, inside a SQLScript method.'}}, required:['class_name','line']}, description:'Replaces the AMDP breakpoints.'}` | `['breakpoints']` | `Replaces the AMDP breakpoints: lines in SQLScript methods of a class. The outcome arrives as a SYNC_BREAKPOINTS event through AmdpDebugWait. ${USER_MODE_WARNING}` | `debugAnswer(args, () => amdpSessionFor(context).setBreakpoints((args.breakpoints ?? []).map((b: any) => ({ class_name: String(b.class_name), line: Number(b.line) }))), (v) => v)` |
| AmdpDebugWait | `...HOLD_SECONDS_PROPERTY` | `[]` | `Waits up to hold_seconds for the next AMDP events: ON_BREAK (line, variables), ON_EXECUTION_END, ON_WARNING, SYNC_BREAKPOINTS…; or ended when the background run finished.` | `debugAnswer(args, async () => { const s = await amdpSessionFor(context).wait(Number(args.hold_seconds ?? 10)); return { value: s, raw: s.state === 'event' ? s.events.map((e) => e.body).join('\n') : JSON.stringify(s) }; }, (s) => (s.state === 'event' ? { state: 'event', events: s.events.map(terseAmdpEvent) } : s))` |
| AmdpDebugStep | `action: {type:'string', enum:['over','continue']}` | `['action']` | `Steps over a statement or continues the stopped AMDP debuggee; the next stop arrives through AmdpDebugWait.` | `debugAnswer(args, () => amdpSessionFor(context).step(args.action === 'over' ? 'over' : 'continue'), (v) => v)` |
| AmdpDebugGetTable | `variable: {type:'string', description:'A table variable at the stop.'}`, `query: {type:'string', description:'Optional: a SELECT over the variable.'}` | `['variable']` | `A table variable's rows at the AMDP stop, up to 100; optional SELECT.` | `debugAnswer(args, () => amdpSessionFor(context).getTable(String(args.variable), args.query ? String(args.query) : undefined), (v) => v.columns)` |
| AmdpDebugCancel | none | `[]` | `Deletes the stopped AMDP debuggee: its execution is cancelled.` | `debugAnswer(args, async () => { await amdpSessionFor(context).cancel(); return { value: 'cancelled', raw: '' }; }, (v) => v)` |
| AmdpDebugStop | none | `[]` | `Ends the AMDP debug session; a suspended debuggee is released first (a stop alone never releases it).` | `debugAnswer(args, async () => { await amdpSessionFor(context).stop(); return { value: { state: 'idle' }, raw: '' }; }, (v) => v)` |

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unit/debugger/amdpHandlers.test.ts
import { AmdpSession } from '../../../lib/debugger/AmdpSession';
import { replaceDebuggerSessions } from '../../../lib/debugger/instance';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { handleAmdpDebugStep } from '../../../handlers/debugger/debug/handleAmdpDebugStep';

afterEach(() => replaceDebuggerSessions());

it('the group serves the seven AMDP tools', () => {
  const names = new DebugHandlersGroup({} as any).getHandlers().map((e) => e.toolDefinition.name);
  for (const n of ['AmdpDebugStart', 'AmdpDebugSetBreakpoints', 'AmdpDebugWait', 'AmdpDebugStep', 'AmdpDebugGetTable', 'AmdpDebugCancel', 'AmdpDebugStop']) {
    expect(names).toContain(n);
  }
});

it('a step with no AMDP session is a tool error', async () => {
  replaceDebuggerSessions(undefined, new AmdpSession({} as any));
  const r: any = await handleAmdpDebugStep({ connection: {} } as any, { action: 'over' });
  expect(r.isError).toBe(true);
  expect(r.content[0].text).toMatch(/no AMDP debug session/);
});
```

- [ ] **Step 2: Run it and see it fail; write the seven; register; add surface rows; run it and see it pass**

Run: `npx jest src/__tests__/unit/debugger/ src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`
Expected: PASS. The group now holds 29 tools.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/debugger/debug/handleAmdpDebug*.ts src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit/debugger/amdpHandlers.test.ts
git commit -m "feat(debugger): AMDP debugger tools"
```

---

### Task 11: Compact, the four verb tools behind `--exposition=…,debug`

**Files:**
- Create: `compact/src/debug/group.ts`, `compact/src/debug/handleHandlerDebugStart.ts`, `handleHandlerDebugWait.ts`, `handleHandlerDebugView.ts`, `handleHandlerDebugStep.ts`
- Modify: `compact/src/launcher.ts:27-133` (parse `debug`; pass `statefulGroups`; fix the stale 13/22 counts to 16/25 in the help and error strings), `compact/src/__tests__/compactSurface.test.ts`, `compact/tests/fixtures/surface.json`, `compact/src/__tests__/compactExposition.test.ts`, `compact/src/index.ts` (if it re-exports groups)
- Test: `compact/src/__tests__/compactDebug.test.ts`

**Interfaces:**
- Consumes `@mcp-abap-adt/lib/debugger`: `debugSessionFor`, `amdpSessionFor`, `debugAnswer`, `debugStateAnswer`, `breakpointsFromArgs`, `runFromArgs`, `BREAKPOINTS_PROPERTY`, `RUN_PROPERTY`, `HOLD_SECONDS_PROPERTY`, `USER_MODE_WARNING`, `TAKE_OVER_WARNING`, `terseVariables`, `terseStop`, `terseAmdpEvent`, `readXmlDocument`, `lineUriOf`. Also `DETAIL_PROPERTY` (from `@mcp-abap-adt/lib/compact-shared` if re-exported there, otherwise add it to that barrel).
- Produces:
  - `compactDebugEntries(getContext: () => HandlerContext): HandlerEntry[]`, with 4 entries.
  - `class CompactDebugHandlersGroup extends BaseHandlerGroup` with `groupName = 'CompactDebugHandlers'`.
  - `parseCompactDebug(argv: readonly string[]): boolean`.
  - `parseCompactExposition` now accepts a comma list of `ro|rw|debug`: the last of `ro`/`rw` wins (default `rw`), and `debug` is allowed beside them.

Tool shapes (spec §3):

```ts
// compact/src/debug/handleHandlerDebugStart.ts
export const TOOL_DEFINITION = {
  name: 'HandlerDebugStart',
  available_in: ['onprem', 'cloud'] as const,
  description: `Debugger start. kind: abap (breakpoints of every kind) or amdp (lines in SQLScript methods: object_name = the class, line). Arms the breakpoints, starts the listener (abap) or the AMDP session, and optionally runs a class or report in the background. take_over displaces another debugger of the user. ${USER_MODE_WARNING} ${TAKE_OVER_WARNING}`,
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['abap', 'amdp'] },
      ...BREAKPOINTS_PROPERTY,
      take_over: { type: 'boolean', default: false, description: 'abap: displace another debugger of the user; amdp: end an AMDP session left behind.' },
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['kind', 'breakpoints'],
  },
} as const;

export async function handleHandlerDebugStart(context: HandlerContext, args: any) {
  if (args.kind === 'amdp') {
    return debugAnswer(args, async () => {
      const session = amdpSessionFor(context);
      const run = runFromArgs(args.run);
      const started = await session.start({ stopExisting: args.take_over === true });
      await session.setBreakpoints((args.breakpoints ?? []).map((b: any) => ({ class_name: String(b.object_name), line: Number(b.line) })));
      if (run) session.startRun(run); // after the breakpoints, or the first stop is lost
      return { value: { state: 'waiting', ...started }, raw: JSON.stringify(started) };
    }, (v) => ({ state: v.state }));
  }
  return debugStateAnswer(args, async () => {
    const session = debugSessionFor(context);
    await session.setBreakpoints(breakpointsFromArgs(args.breakpoints));
    return session.start(args.take_over === true ? 'takeOver' : 'refuse', runFromArgs(args.run));
  });
}
```

This needs `AmdpSession.startRun(target: RunTarget): void` to be public: make the private one public in this task. In core, `AmdpDebugStart` keeps passing `run` to `start`.

The other three:
- `HandlerDebugWait({hold_seconds?, detail?})`: if an AMDP session is open, it answers the AMDP state the way `AmdpDebugWait` does; otherwise `debugStateAnswer(args, () => debugSessionFor(context).wait(...))`.
  - Add `isOpen(): boolean` to `AmdpSession` (`return !!this.open`).
- `HandlerDebugView({what: stack|variables|memory|table, names?, detail?})`:
  - `stack` → `getStack` with `terseStop`;
  - `variables` → `getVariables(names)`, or `getChildVariables(['@ROOT'])` with no names;
  - `memory` → `getMemorySizes` with `readXmlDocument`;
  - `table` → AMDP `getTable(names[0])`.
- `HandlerDebugStep({action: into|over|return|continue|run_to_line|jump_to_line|terminate|stop, line?, object_type?, object_name?, include?, parent_name?, detail?})`:
  - With an AMDP session open: `over` and `continue` go to AMDP, `terminate` → `cancel`, `stop` → AMDP `stop`.
  - Otherwise ABAP: `into|over|return|continue` → `step`; `run_to_line|jump_to_line` → `stepToLine(lineUriOf({object_type, object_name, include, parent_name}, line))`. If `object_*` is absent, take the object from the stop's top frame:
    - first, if the frame's `uri` holds a `/source/main` URI, use it with `#start=<line>`;
    - otherwise refuse with "give object_type and object_name".
  - `terminate` → `terminate`; `stop` → `stop()` on both sessions.

`compact/src/launcher.ts`:

```ts
export type CompactExposition = 'ro' | 'rw';

function expositionValues(argv: readonly string[]): string[] | undefined {
  // the existing scan for --exposition=x / --exposition x, last flag wins; returns the comma list
}

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

Keep the existing messages that `compactExposition.test.ts` asserts (`/no value/`). In `main()`, pass `statefulGroups: (context) => (parseCompactDebug(argv) ? [new CompactDebugHandlersGroup(context)] : [])` to the core launcher.

- [ ] **Step 1: Write the failing tests**

```ts
// compact/src/__tests__/compactDebug.test.ts
import { compactDebugEntries } from '../debug/group';
import { parseCompactDebug, parseCompactExposition } from '../launcher';

describe('compact debug', () => {
  it('four verb tools', () => {
    expect(compactDebugEntries(() => ({}) as never).map((e) => e.toolDefinition.name).sort()).toEqual(
      ['HandlerDebugStart', 'HandlerDebugStep', 'HandlerDebugView', 'HandlerDebugWait'],
    );
  });
  it('--exposition takes debug beside ro or rw', () => {
    expect(parseCompactExposition(['--exposition=ro,debug'])).toBe('ro');
    expect(parseCompactDebug(['--exposition=ro,debug'])).toBe(true);
    expect(parseCompactExposition(['--exposition=debug'])).toBe('rw');
    expect(parseCompactDebug(['--exposition=rw'])).toBe(false);
    expect(parseCompactDebug([])).toBe(false);
    expect(() => parseCompactExposition(['--exposition=high'])).toThrow();
  });
  it('the descriptions warn about user mode and taking over', () => {
    const start = compactDebugEntries(() => ({}) as never).find((e) => e.toolDefinition.name === 'HandlerDebugStart')!;
    expect(start.toolDefinition.description).toMatch(/every request of the connected SAP user/);
    expect(start.toolDefinition.description).toMatch(/displaces another debugger/);
  });
});
```

In `compactSurface.test.ts`:
- add `...compactDebugEntries(context)` to `current`;
- change both counts to 29;
- change the header comment to "the same 29 tools — 25 plus the four debug verbs, served only with --exposition=…,debug".

Append the four rows to `compact/tests/fixtures/surface.json` (`group: 'compact'`, `inputs` as rendered by `inputsOf`).

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest compact/src/__tests__/`
Expected: FAIL. The module is missing, and the count is 25.

- [ ] **Step 3: Implement the four, the group, the launcher**

- [ ] **Step 4: Run them and see them pass, plus the capability split (unchanged at 16/9, since the debug files are not in either half)**

Run: `npx jest compact/src/__tests__/ && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add compact/
git commit -m "feat(compact): HandlerDebugStart/Wait/View/Step behind --exposition=…,debug"
```

---

### Task 12: Integration on premise and on the cloud; recorded answers for AMDP and memory

This is a gate with the user (CLAUDE.md, memory):
- Before any run, check the token's `exp` locally (cloud) and ask whether the SAP connection is up.
- Ask that Eclipse be closed.
- Run nothing until they confirm.

**Files:**
- Create: `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`
- Modify: `tests/test-config.yaml.template` and `docs/development/tests/test-config.yaml.template` (section `debugger_handlers`), and `tests/fixtures/adt/` (recorded AMDP and memory answers)

**Interfaces:**
- Consumes: the handlers of Tasks 8–10 through `tester.invokeToolOrHandler` (soft mode) with `createHandlerContext({connection, logger})`, plus `replaceDebuggerSessions()` between cases.

Template section:

```yaml
debugger_handlers:
  test_cases:
    - name: "debugger_chain"
      enabled: true
      available_in: ["onprem", "cloud"]
      description: "ABAP chain, conflict, AMDP chain, memory — on a probe class the test creates and deletes"
      params:
        probe_class: "ZMCP_DBG_PROBE"        # created and deleted by the test
        amdp_probe_class: "ZMCP_DBG_AMDP"     # created and deleted by the test
        keep_probe: false
```

The test file follows `readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts`: `LambdaTester('debugger_handlers', 'debugger_chain', 'debugger')`, with `beforeAll` creating the probe class through the high-level class handlers and activating it. Its cases:

1. **ABAP chain:**
   - `DebugSetBreakpoints` on the probe's marked line;
   - `DebugStartListener` with `run: {kind:'class', name: probe}`;
   - `DebugWait(30)` until `stopped`, expecting `line` equal to the marked line;
   - `DebugGetStack` and `DebugGetVariables(['LV_COUNTER'])`;
   - `DebugStep({action:'over'})`;
   - `DebugStepToLine({mode:'run', object_type:'CLAS', object_name: probe, line: marked+2})`;
   - `DebugStep({action:'continue'})` → `ended`;
   - `DebugWait` → `ended` with `reason: 'run_finished'` and the probe's output.
2. **Conflict:**
   - a second `DebugSession` built on `liveDebugPorts()` with the same `SAP_DEBUG_IDE_ID` unset, so its ids differ;
   - session one `DebugStartListener`, then the second one's `start('refuse')` rejects with SAP's conflict message;
   - `DebugStop` on both.
3. **Memory:**
   - at a stop, `DebugGetMemorySizes` and `DebugCreateMemorySnapshot`;
   - `MemorySnapshotList`: assert `isError: false` only, since listing needs `S_MEM_SNAP` (memory).
4. **AMDP:**
   - the AMDP probe from the adt-clients AMDP test (a class with a SQLScript procedure plus a table function), created by the test;
   - `AmdpDebugStart(stop_existing: true)`, then `AmdpDebugSetBreakpoints`;
   - `AmdpDebugStart`'s run, via `HandlerDebugStart kind amdp` in hard mode, or the run in core;
   - `AmdpDebugWait` until `ON_BREAK`, then `AmdpDebugGetTable`, `AmdpDebugStep continue`, `AmdpDebugWait` until `ON_EXECUTION_END`, then `AmdpDebugStop`.
5. **`afterAll`:** `shutdownDebugger()`, then delete the probes unless `keep_probe` is set.

- [ ] **Step 1: Ask the user.** Ask whether the connection is up, whether the token is valid (check `exp` locally and report it), whether Eclipse is closed, and which systems to use: on premise (e19, user OKYSLYTSIA, request E19K907111, package ZAC_TEST_PKG; no new request) and/or trial.

- [ ] **Step 2: Write the test and the template section; run it in soft mode on premise, recording the wire**

```bash
DEBUG_HTTP_WIRE=true DEBUG_HTTP_BODY_CHARS=Infinity MCP_TEST_CONFIG=~/.config/mcp-abap-adt/test-config.e19.yaml \
  timeout 1800 npx jest --testPathPatterns=integration/debugger --runInBand --forceExit 2>&1 | tee /tmp/claude-debugger-e19.log
```

Expected: PASS. If it fails, read the log; do not rerun blindly.

- [ ] **Step 3: Record answers.** From the log, save these as corpus cases in the sidecar shape of `tests/fixtures/adt/debugger-run-to-line--02-listen.json`: one memory sizes answer, one `createMemorySnapshot` answer, and the AMDP start, one events batch with `ON_BREAK`, one with `ON_EXECUTION_END`, and one data preview. Use the case names `debugger-memory--0N-*` and `amdp-debugger--0N-*`.
  - Sanitise them: `SAPUSER01`, `SID`, `sap.example.local`, and the placeholder transport prefix.
  - Check with `grep -lE 'e19|E19|okyslytsia|OKYSLYTSIA' tests/fixtures/adt/amdp-* tests/fixtures/adt/debugger-memory-*`, which must print nothing.

- [ ] **Step 4: Same on the cloud** (trial config). Run hard mode once for the ABAP chain (`integration_hard_mode.enabled: true`, `--exposition=readonly,debug`).

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/integration/debugger/ tests/test-config.yaml.template docs/development/tests/test-config.yaml.template tests/fixtures/adt/amdp-debugger--* tests/fixtures/adt/debugger-memory--*
git commit -m "test(debugger): integration on premise and on the cloud; recorded AMDP and memory answers"
```

---

### Task 13: Terse readings for the recorded AMDP and memory answers

**Files:**
- Modify: `src/lib/debugger/amdpReadings.ts`, `src/lib/debugger/memoryReadings.ts`, the memory and watchpoint handlers (replace `readXmlDocument` under terse), `compact/src/debug/handleHandlerDebugView.ts`
- Test: `src/__tests__/unit/debugger/amdpReadings.test.ts`, `src/__tests__/unit/debugger/memoryReadings.test.ts`

**Interfaces:**
- Produces: `readMemorySizes(xml): { dynamicObjects?: number; total?: number; [k: string]: number | undefined }` and `terseMemorySizes`. Name the fields after the element names the recorded answer carries, and keep at most three of them (spec §3: "the two or three numbers that matter").

- [ ] **Step 1: Write a failing test per recorded answer** (`corpusBody('amdp-debugger--0N-…')`, `corpusBody('debugger-memory--0N-…')`), asserting the values that are in the file.
- [ ] **Step 2: Run it and see it fail; fix `readAmdpEvents` / `readAmdpStart` / `readAmdpPreview` where the recorded shape differs from the test-derived one; write `readMemorySizes`; run it and see it pass.**

Run: `npx jest src/__tests__/unit/debugger/`

- [ ] **Step 3: Replace `readXmlDocument` under terse in `DebugGetMemorySizes`, `HandlerDebugView memory`, and `MemorySnapshotGet overview`. `full` keeps the parsed document and `raw` keeps the document.**
- [ ] **Step 4: Commit**

```bash
git add src/lib/debugger/ src/handlers/debugger/ compact/src/debug/ src/__tests__/unit/debugger/
git commit -m "feat(debugger): terse readings of AMDP events and memory, from recorded answers"
```

---

### Task 14: Docs and the 17.2.0 release preparation

**Files:**
- Create: `docs/user-guide/DEBUGGER.md`
- Modify:
  - `README.md` (Features: a debugger bullet; the `debug` set; stdio only)
  - `docs/user-guide/HANDLERS_MANAGEMENT.md` (Available Sets; Command Line; Handler Set Details)
  - `docs/user-guide/CLI_OPTIONS.md` (`--exposition` values; env `SAP_DEBUG_TERMINAL_ID`, `SAP_DEBUG_IDE_ID`)
  - `docs/user-guide/CLIENT_CONFIGURATION.md` (headers table l.66-86: `x-sap-debug-terminal-id`, `x-sap-debug-ide-id`; env section l.223)
  - `server/src/launcher.ts` help l.165-183 (the two headers and env vars)
  - `tools/generate-tools-docs.js` (also scan `src/handlers/debugger/debug/*.ts`, as a "Debug" section)
  - regenerated `docs/user-guide/AVAILABLE_TOOLS*.md` (`npm run docs:tools`)
  - `compact/README.md`, `compact/docs/AVAILABLE_TOOLS.md` (four tools; `--exposition=…,debug`)
  - `CHANGELOG.md` and the compact packages' CHANGELOGs
  - versions to 17.2.0 in the five packages, `server.json`, `server-compact.json`, `glama.json` if versioned (follow `releaseMetadata.test.ts`)
- Delete: `docs/superpowers/specs/2026-10-10-debugger-tools-design.md` and this plan, once the code is merged (CLAUDE.md "Plans and Specs").

`DEBUGGER.md` covers:
- the two sessions (listener and stop; AMDP events and commands);
- auto-attach;
- one debuggee at a time;
- the 5-minute idle release;
- the user-mode warning;
- taking over;
- conflicts as errors;
- the identity and its overrides, with when to share an id and what follows (D1: the user's choice);
- stdio only until #287;
- memory snapshots and `S_MEM_SNAP` (an empty list means the authorization may be missing);
- AMDP: stop never releases a suspended debuggee, so stop deletes it first.

It names nothing concrete. A worked example uses placeholders (`<class>`, `<line>`).

- [ ] **Step 1: Write the docs; run `npm run docs:tools`; check that no description names a concrete object.**

Run: `npx jest src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts src/__tests__/unit/releaseMetadata.test.ts src/__tests__/unit/binSmoke.test.ts`
Expected: PASS.

- [ ] **Step 2: Full unit suite, lint, build**

Run: `npm run lint:check 2>&1 | tail -5; npm test 2>&1 | tee /tmp/claude-debugger-unit.log | tail -15; npm run build`
Expected: no lint errors, all suites pass, and a clean build. Check that `package-lock.json` has no `"link": true` outside the workspace siblings: `grep -n '"link": true' package-lock.json`.

- [ ] **Step 3: Commit and push to PR #290**

```bash
git add -A docs README.md CHANGELOG.md compact tools server package.json package-lock.json server.json server-compact.json
git commit -m "docs(debugger): debugger guide, the debug set, 17.2.0"
git push
```

- [ ] **Step 4: Hand over to the user.** Ask for review of PR #290 and say what remains. After the merge, the release is a tag and a push, on the user's word. The user publishes the five packages in dependency order (lib first, since compact needs `@mcp-abap-adt/lib/debugger`) and both registry entries (`mcp-publisher publish server.json`, then `server-compact.json` separately). Then verify an installed copy in an isolated `--prefix` (`mcp-abap-adt --version`, `mcp-abap-adt --exposition=readonly,debug --help`).

---

## Self-review

**Spec coverage:**

| Spec item | Where it is implemented |
|---|---|
| D1 (one instance) | `instance.ts`, Task 6 |
| D2 (both scenarios) | Task 4, plus run in Task 5 |
| D3 (auto-attach) | Task 4 |
| D4 (5-minute idle) | Task 4 |
| D5 (one at a time) | Task 4 |
| D6 (two core tools; a flag in compact) | Tasks 8 and 11 |
| D7 (four compact verbs) | Task 11 |
| D8 (opt-in set) | Task 7 |
| Identity with overrides | Tasks 2 and 6 |
| Breakpoints kept by the server | Task 4 |
| Shutdown cleanup | Tasks 5 and 7 |
| Transports (stdio only) | Task 7 |
| Conflict at start / later | Task 4 |
| `ended` from the run | Task 5 |
| Core tools §2 | Tasks 8–10 |
| Addressing | Tasks 2 and 6 (`breakpointsFromArgs`) |
| Output detail | Tasks 3, 6 and 13 |
| Descriptions | Tasks 6 (warnings), 8–11, plus the ratchet test |
| Tests §4 | Unit: Tasks 1–11. Integration and hard mode: Task 12 |
| Release §4 | Task 14 |
| Out of scope | No multi-debuggee, no batch, no cell substring; nothing added |

**Gaps closed while reviewing:**
- No recorded AMDP or memory answer existed. Task 12 records them and Task 13 reads them; until then `full`/`terse` give the parsed document.
- The compact AMDP start: the run starts after the breakpoints are synced (Task 11), or the first stop is lost.

**Type consistency:**
- `DebugSession` method names are used unchanged in Tasks 8 and 11: `start`, `wait`, `setBreakpoints`, `deleteBreakpoint`, `listBreakpoints`, `getStack`, `setStackPosition`, `getVariables`, `getChildVariables`, `setVariable`, `step`, `stepToLine`, `terminate`, `createWatchpoint`, `listWatchpoints`, `deleteWatchpoint`, `getMemorySizes`, `createMemorySnapshot`, `stop`.
- `AmdpSession` gains `startRun` (public) and `isOpen` in Task 11. Both are named there.
- `RunTarget`, `RunOutcome`, `DebugView`, `DebugState` and `EndReason` are defined in Task 4 and imported from there everywhere.
