# Debugger on adt-clients 29 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the ABAP debug session to adt-clients 29 / interfaces-adt 15 / adt-strategies 0.10 so it can debug another user's runs, listen in terminal mode, leave a debuggee running (`detach`, `release_debugger`), change the debugger settings, and never again lose breakpoints it already armed.

**Architecture:** `DebugSession` (src/lib/debugger/DebugSession.ts) fixes one identity per start (a union on `debuggingMode`), keeps the caller's breakpoint definitions (`requested`) beside the server's rows (`armed`) and re-sends the whole set on every change, each definition tagged with a `clientId` of the session's, and pairs answer rows with definitions by the echoed tag in a pure module (`arming.ts`). `stopListener` becomes the authoritative cleanup; detach and release return the session to listening; settings are re-applied after every attach. The tool layer (core and compact) only adds optional parameters, two step methods and one tool, all refused before the wire where they do not apply.

**Tech Stack:** TypeScript 6, Jest 30 + ts-jest, biome, `@mcp-abap-adt/adt-clients` 29.0.0, `@mcp-abap-adt/adt-strategies` 0.10.0, `@mcp-abap-adt/interfaces-adt` 15.0.0, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-10-11-debugger-adt-clients-28-design.md` (binding). The spec and this plan keep their `-28-` file names, as the branch does; the contract is adt-clients 29's.

---

## Global Constraints

- **Dependency ranges.** Root `package.json`: `"@mcp-abap-adt/adt-clients": "^29.0.0"` (was `~27.0.0`), `"@mcp-abap-adt/adt-strategies": "^0.10.0"` (was `^0.8.1`), `"@mcp-abap-adt/interfaces-adt": "^15.0.0"` (was `^13.2.0`). 29 is the first adt-clients release that sends `clientId` on a breakpoint row, which the arming contract pairs by; adt-strategies 0.10.0 declares `interfaces-adt ^15`, so one copy installs. `compact-modify/package.json` gains `"@mcp-abap-adt/interfaces-adt": "^15.0.0"` — it imports the package directly (`compact-modify/src/handlers/handleHandlerActivate.ts`) and never declared it. No other package of this repository imports any of the three.
- **Registry only.** No `file:`, `link:`, `workspace:`, `npm link`. After every install: `grep -n '"link": true' package-lock.json` prints nothing; every `node_modules/@mcp-abap-adt/*` entry in the lockfile has `"resolved": "https://registry.npmjs.org/…"`; `npm ls @mcp-abap-adt/interfaces-adt` shows exactly one version, 15.x.
- **Version 18.0.0** for the five packages released together — `@mcp-abap-adt/lib` (`.`), `@mcp-abap-adt/core` (`server/`), `@mcp-abap-adt/compact`, `@mcp-abap-adt/compact-readonly`, `@mcp-abap-adt/compact-modify` — all at 17.2.2 today. Sibling ranges become `^18.0.0`; `server.json`, `server-compact.json` and `docker/Dockerfile.inspect` (`ARG CORE_VERSION=18.0.0`) follow. `src/__tests__/unit/releaseMetadata.test.ts` enforces all of it. The agent never runs `npm publish`, `npm run release:publish` or `mcp-publisher`: the user publishes.
- **Names nothing concrete.** No SID, host, real user or transport anywhere — code, comments, descriptions, test data, fixtures, docs. Test users: `SAPUSER01` (the connected one, as `fakes.ts` already answers), `SAPUSER02` and `SAPUSER03` (others). New test objects: `class_a` / `CLASS_A`, `CX_A`. Measurement notes: `on premise (2026-10-11), BASIS 816`; a server-source note: `(server source, BASIS 816, read 2026-10-11)`.
- **No timeouts.** Nothing new ends on a clock of ours. `WAIT_MAX_SECONDS`, the poll holds and the idle bound stay as they are.
- **Errata at the call site.** `terminateDebugger` passes `analyseDebuggerFreed` with a comment naming the errata entry; steps and `terminateDebuggee` keep `analyseDebuggeeEnd`.
- **No SAP run without asking the user.** Before proposing one, check the token's `exp` locally and report it; ask; wait. Soft mode for the mass run, full log to a file, never truncated.
- **Codex reviews are read-only**: Codex reads and reports; the implementer changes the code.
- **One PR.** Everything lands on `feat/debugger-adt-clients-28` (draft PR #293) as new commits. No new PR, no history rewrite.
- **Commit trailer** (every commit ends with exactly these two lines):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
  ```
- **Per-commit gate** (all four green before `git commit`; `npm run lint` first to let biome format):
  1. `npm run build`
  2. `npm run test:check`
  3. `npm run lint:check`
  4. the task's suites: `npx jest <the paths the task names>`
  
  Tasks 7, 8, 10 and 11 also run the whole unit suite and the server's: `npm test 2>&1 | tee /tmp/debugger-28-unit.log` and `npm --prefix server run test:check && npm --prefix server test 2>&1 | tee /tmp/debugger-28-server.log`. The integration suite runs only when the user says so (Task 9).
- **Verify an edit landed before committing**: `git diff --stat` must name every file the task lists.

## Review Focus

Failure modes the spec implies but that no spec-listed test exercises, most likely first. Each has a test in its owning task.

1. **A schema `default` filled in at the MCP boundary.** `schemaUtils.ts` applies `default` at the boundary. A `default: 'user'` on `debugging_mode` would make every compact `HandlerDebugStart` with `kind: amdp` arrive with `debugging_mode` set and be refused, through MCP only — the soft unit tests call handlers directly and would stay green. No new parameter carries a `default`; the default lives in the session. Test: Task 8, `boundary.test.ts`, an AMDP start through the SDK reaches the handler without `debugging_mode`, `request_user` or `settings`.
2. **A delete by an id the session does not hold** — an id from an earlier answer that a replacement no longer placed, or a made-up one. Sent to the wire it would change nothing in `requested`, so the next change re-arms it. Refused before the wire. Test: Task 3.
3. **A listener the system drops while nothing is armed** (a take-over's `conflictNotification`, a failed poll). The identity stays fixed and a `stopListener` is owed; if `holdsState()` went false the state handle would end, and the next start on that server instance would be refused with no handle to stop it. `holdsState()` counts the owed cleanup. Test: Task 4.
4. **The settings for a catch on the start's own first poll.** The preferences must be in place before the first listen, or the first stop runs without them. Test: Task 6.
5. **A first listen refused `409` when nothing was armed or reconciled.** That is a start refused before any change: a cleanup `stopListener` here would delete the breakpoints of the other IDE that holds the same key. Test: Task 2 (no `stopListener`), Task 4 (the cleanup keeps it so).
6. **A caller's `clientId` reaching the wire in place of the session's tag.** `IDebuggerBreakpoint` types `clientId` on every kind, so an embedder may hand the session a definition that carries one. Spread after the tag, it would go out instead of the tag, and every row of the answer would come back `unexpected` while the definitions read as refused. The tag is spread last (`wireOf`). Test: Task 3, in `arming.test.ts` and in the session (`world.sent` carries the session's tags).

## Spec decisions this plan takes (resolved ambiguities)

- **The `clientId` is `bp` and a counter of the session instance** (`bp1`, `bp2`, …), assigned when a definition first enters `requested` and kept with it while it stays there. The counter is a field of `DebugSession`, never reset (not by a stop, not by a new start of the same instance), so a tag is never reused and an echo of an earlier definition cannot pair with a later one. Why not a key derived from kind, target and condition: it would be as long as a URI and a condition together, carry a condition's quotes and angle brackets into an attribute, and depend on a field length of the server nobody measured; its one gain, the same tag for a definition deleted and added again, buys nothing, because pairing is per request. The counter's tag is a few characters of `[a-z0-9]`: unique within a request by construction (deduplication leaves one definition per key, each with one tag), and nothing in it needs the escaping the library applies.
- **An unexpected placed row stays armed.** A placed row without a tag of this request is still on the server under the key; it goes to `placed` and `armed` (so `DebugDeleteBreakpoint` and the stop's per-id fallback reach it) and to `unexpected`, and it is paired with no definition, so deleting it touches `requested` not at all. A second row for a tag already answered is unexpected in the same way. A refused unexpected row appears only in `unexpected`.
- **The fake's default breakpoints answer is a conforming echo**: every definition sent is placed, with its `clientId` and an id of the fake's (`ID<n>`). The recorded answer `debugger-conversation--01-breakpoints-set` was captured without tags (2026-10-08), so it serves as the fixture of rows a session cannot pair (`unexpected`), not as the default.
- **A `409` on the first listen with nothing armed or reconciled is "refused before any change"**; any other failure of the first listen counts as after a change (its listener state is unknown).
- **The breakpoint conflict is resolved when the instance is created** (as the ids are): request scope (`x-sap-debug-breakpoint-conflict` header, or the destination's `SAP_DEBUG_BREAKPOINT_CONFLICT`), then the environment, then `createDebuggerInstance`'s option, then `replace`. An unknown value is refused, naming both values. An embedder reaches the option by overriding `BaseMcpServer.debuggerFor()`.
- **The freed connection is dropped through a new port**, `DebugSessionPorts.dropConnection(connection): void`; the live port forgets the connection and sends nothing (the connection package has no close-without-logoff).
- **A settings failure at an attach does not lose the stop**: the stop keeps `settingsError`, as it keeps `stackError`.
- **`refuse-if-held` refuses `DebugTakeOverListener` too** when another IDE holds the key: the host's policy is over the tool's choice (the spec places the preflight before every start).
- **Another user without authorisation, under `replace`, is applied as written and flagged.** The arming answers `403` (it reaches the model as SAP said it); the cleanup's `stopListener` for that identity answers `403` too, so the identity is kept and every `DebugStop` reports it again until the host or the idle bound lets the instance go. Task 4 pins this; whether a `403` on the cleanup's `stopListener` should count as "nothing of ours to clean" is the user's decision, not taken here.
- **Terminal mode follows the same cleanup.** The library documents `stopListener`'s deletion for user mode; the spec makes it authoritative for both modes, and so does this plan. Task 9's terminal case starts and stops with a breakpoint armed; a breakpoint left behind in terminal mode would show there only as a later catch, which is not measured.

---

## File map

| File | Change |
|---|---|
| `package.json`, `package-lock.json`, `compact-modify/package.json` | dependency ranges (Task 1); versions and floors (Task 10) |
| `src/lib/debugger/DebugSession.ts` | identity, start order, arming, cleanup, detach/release, settings (Tasks 1–6) |
| `src/lib/debugger/arming.ts` (new) | definition keys, tagged merge, the wire form, pairing by `clientId` (Task 3) |
| `src/lib/debugger/ids.ts` | `terminalStated`, `BreakpointConflict`, `resolveBreakpointConflict` (Task 2) |
| `src/lib/debugger/DebuggerInstance.ts` | `createDebuggerInstance` option (Task 2) |
| `src/lib/debugger/ports.ts` | `dropConnection` (Task 5) |
| `src/lib/debugger/readings.ts` | `BreakpointReading.clientId` (Task 3); `SettingsReading`, `readSettings`, `terseSettings` (Task 6) |
| `src/lib/debugger/answer.ts` | terse stop carries settings (Task 6) |
| `src/lib/debugger/schemas.ts` | condition refusal (Task 1); new properties, sentences, `startOptionsFromArgs`, `settingsFromArgs` (Task 7) |
| `src/lib/debugger/access.ts` | `startedExtra` (Task 7) |
| `src/lib/requestContext.ts`, `src/lib/requestSystemResolution.ts`, `src/lib/auth/destinationStores.ts`, `src/lib/auth/IAuthBrokerFactory.ts`, `server/src/launcher.ts` | breakpoint-conflict plumbing (Task 2) |
| `src/handlers/debugger/debug/handleDebugStartListener.ts`, `handleDebugTakeOverListener.ts`, `handleDebugStep.ts`, `handleDebugSetBreakpoints.ts`, `handleDebugDeleteBreakpoint.ts` | tool surface (Task 7) |
| `src/handlers/debugger/debug/handleDebugSetSettings.ts` (new), `src/lib/handlers/groups/DebugHandlersGroup.ts` | new tool (Task 7) |
| `compact/src/debug/handleHandlerDebugStart.ts`, `handleHandlerDebugStep.ts` | compact (Task 8) |
| `tests/fixtures/tools/surface.json`, `src/__tests__/unit/toolSurface.test.ts`, `src/__tests__/unit/detailSurface.test.ts`, `compact/tests/fixtures/surface.json` | surface ratchets (Tasks 7, 8) |
| `src/__tests__/unit/debugger/*`, `compact/src/__tests__/compactDebug.test.ts`, `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts` | unit tests |
| `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`, `tests/test-config.yaml.template` | integration (Task 9) |
| `docs/user-guide/DEBUGGER.md`, `docs/MIGRATION-18.0.md` (new), `docs/README.md`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/user-guide/CLI_OPTIONS.md`, `docs/user-guide/CLIENT_CONFIGURATION.md`, `docs/user-guide/AVAILABLE_TOOLS*.md` | docs (Task 10) |
| `server.json`, `server-compact.json`, `docker/Dockerfile.inspect`, `server/package.json`, `compact*/package.json` | release metadata (Task 10) |

---

## Task 1: adt-clients 29, interfaces-adt 15, adt-strategies 0.10 — the identity states its mode

Compile the repository on the new contract without changing behaviour, except the one change the types force: a condition on a non-line breakpoint, which interfaces-adt 15 does not type, is refused instead of sent. interfaces-adt 15 also drops `skipCount` and adds `clientId` to every breakpoint kind; nothing here sets either yet (Task 3 assigns the tags).

**Files:**
- Modify: `package.json`, `package-lock.json`, `compact-modify/package.json`
- Modify: `src/lib/debugger/DebugSession.ts` (`identity()`, `attachTo`, `releaseCaught`)
- Modify: `src/lib/debugger/schemas.ts` (`breakpointsFromArgs`)
- Modify: `src/__tests__/unit/debugger/fakes.ts` (a wire log)
- Create: `src/__tests__/unit/debugger/schemas.test.ts`
- Modify: `src/__tests__/unit/debugger/DebugSession.test.ts`, `src/__tests__/unit/debugger/methodShapes.test.ts`
- Modify: `src/__tests__/integration/debugger/DebuggerHandlers.test.ts` (`rawListener`'s identity — compile only)

**Interfaces:**
- Consumes: `IDebuggerIdentity` (interfaces-adt 15: `{ debuggingMode: 'user'; requestUser; terminalId; ideId } | { debuggingMode: 'terminal'; terminalId; ideId }`); `AbapDebugger.attach(identity: IDebuggerIdentity, debuggeeId: string, options?: { server?: string })`.
- Produces: `DebugSession.identity(): Promise<IDebuggerIdentity>` answering user mode (replaced in Task 2); `breakpointsFromArgs` refusing `condition` off a line breakpoint with `breakpoints[<i>] (<kind>): a condition applies to a line breakpoint only`; `fakeWorld().log: WireCall[]` where `interface WireCall { call: string; connection: number; args: unknown[] }`.

- [ ] **Step 1: Install from the registry**

```bash
cd /home/okyslytsia/prj/mcp-abap-adt/.worktrees/debugger-28
npm ci
npm install @mcp-abap-adt/adt-clients@^29.0.0 @mcp-abap-adt/adt-strategies@^0.10.0 @mcp-abap-adt/interfaces-adt@^15.0.0
grep -n '"@mcp-abap-adt/adt-clients"\|"@mcp-abap-adt/adt-strategies"\|"@mcp-abap-adt/interfaces-adt"' package.json
grep -n '"link": true' package-lock.json
npm ls @mcp-abap-adt/interfaces-adt
```

Expected: package.json shows `"^29.0.0"`, `"^0.10.0"`, `"^15.0.0"`; the `link` grep prints nothing; `npm ls` shows one `@mcp-abap-adt/interfaces-adt@15.x` (deduped under adt-clients and adt-strategies). If npm wrote another prefix, edit package.json to the exact ranges and run `npm install` again.

Then add the direct dependency of compact-modify — `compact-modify/package.json`, `dependencies`:

```json
  "dependencies": {
    "@mcp-abap-adt/interfaces-adt": "^15.0.0",
    "@mcp-abap-adt/lib": "^17.2.0"
  },
```

- [ ] **Step 2: Give the fakes a wire log**

In `src/__tests__/unit/debugger/fakes.ts`, export the record type and wrap every member so each call is logged with the connection it went out on. Replace `const make = (): Debugger => new Proxy(` … `) as unknown as Debugger;` by:

```ts
export interface WireCall {
  call: string;
  /** The fake connection's id: the index in `opened`. */
  connection: number;
  args: unknown[];
}
```

(at module level, above `fakeWorld`), and inside `fakeWorld`:

```ts
  const log: WireCall[] = [];
  const make = (connection: IAbapConnection): Debugger => {
    const members: Record<string, any> = {
      // … the existing member object, unchanged …
    };
    return new Proxy(members, {
      get: (target, key: string) => {
        const member = override[key] ?? target[key];
        if (typeof member !== 'function') return member;
        return (...args: unknown[]) => {
          log.push({
            call: key,
            connection: (connection as unknown as { id: number }).id,
            args,
          });
          return member(...args);
        };
      },
    }) as unknown as Debugger;
  };
```

`abapDebugger: (_c, mode) => { modes.push(String(mode)); return make(); }` becomes `abapDebugger: (c, mode) => { modes.push(String(mode)); return make(c); }`. The fake `attach` keeps its body; rename its first parameter `_identity: unknown`. Return `log` from `fakeWorld` beside `calls`.

- [ ] **Step 3: Write the failing tests**

Add to `src/__tests__/unit/debugger/DebugSession.test.ts`, inside `describe('DebugSession', …)`:

```ts
  it('the identity states user mode, and the attach names the same identity', async () => {
    const { world } = await stopped();
    const listen = world.log.find((c) => c.call === 'listen')!;
    expect(listen.args[0]).toEqual({
      debuggingMode: 'user',
      requestUser: 'SAPUSER01',
      terminalId: IDS.terminalId,
      ideId: IDS.ideId,
    });
    const attach = world.log.find((c) => c.call === 'attach')!;
    expect(attach.args[0]).toEqual(listen.args[0]);
  });
```

Create `src/__tests__/unit/debugger/schemas.test.ts`:

```ts
import {
  type BreakpointArg,
  breakpointsFromArgs,
} from '../../../lib/debugger/schemas';

const LINE: BreakpointArg = {
  object_type: 'CLAS',
  object_name: 'class_a',
  line: 7,
};

describe('breakpointsFromArgs', () => {
  it('a line breakpoint keeps its condition', () => {
    expect(
      breakpointsFromArgs([{ ...LINE, condition: 'lv_a = 1' }]),
    ).toEqual([
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=7',
        condition: 'lv_a = 1',
      },
    ]);
  });

  it.each([
    ['exception', { exception_class: 'cx_a', condition: 'lv_a = 1' }],
    ['statement', { statement: 'message', condition: 'lv_a = 1' }],
    [
      'message',
      { message: { id: 'a', number: '001', type: 'e' }, condition: 'lv_a = 1' },
    ],
  ])(
    'a condition on a %s breakpoint is refused, naming the breakpoint',
    (kind, b) => {
      expect(() =>
        breakpointsFromArgs([LINE, b as BreakpointArg]),
      ).toThrow(
        `breakpoints[1] (${kind}): a condition applies to a line breakpoint only`,
      );
    },
  );

  it('the other kinds without a condition carry none', () => {
    expect(breakpointsFromArgs([{ exception_class: 'cx_a' }])).toEqual([
      { kind: 'exception', exceptionClass: 'CX_A' },
    ]);
  });
});
```

In `src/__tests__/unit/debugger/methodShapes.test.ts` the identity and the attach follow the new contract:

```ts
const IDENTITY = {
  debuggingMode: 'user',
  requestUser: 'SAPUSER01',
  terminalId: 'T'.repeat(32),
  ideId: 'I'.repeat(32),
} as const;
```

and the attach row becomes `(d) => d.attach(IDENTITY, 'X', {})`.

- [ ] **Step 4: Run them and see them fail**

```bash
npx jest src/__tests__/unit/debugger/DebugSession.test.ts src/__tests__/unit/debugger/schemas.test.ts src/__tests__/unit/debugger/methodShapes.test.ts
```

Expected: the identity test fails (`debuggingMode` missing from the received identity, or ts-jest's type error on `attach(identity.requestUser, …)`), the three refusal cases fail (no throw — or a ts-jest type error on `condition` beside `exceptionClass`).

- [ ] **Step 5: Implement**

`src/lib/debugger/DebugSession.ts`, `identity()`:

```ts
  protected async identity(): Promise<IDebuggerIdentity> {
    this.user ??= (
      await this.ports.requestUser(this.requireOrigin())
    ).toUpperCase();
    return {
      debuggingMode: 'user',
      requestUser: this.user,
      terminalId: this.ids.terminalId,
      ideId: this.ids.ideId,
    };
  }
```

In `attachTo` and `releaseCaught`, the attach names the identity:

```ts
      const attached = await dbg.attach(
        identity,
        debuggee.debuggeeId,
        debuggee.instance ? { server: debuggee.instance } : {},
      );
```

(`releaseCaught` keeps its `.catch(asFailure)`.)

`src/lib/debugger/schemas.ts`, `breakpointsFromArgs`:

```ts
export function breakpointsFromArgs(
  raw: readonly BreakpointArg[],
): IDebuggerBreakpoint[] {
  return raw.map((b, i) => {
    // Only a line breakpoint takes a condition: the system ignores it on the
    // other kinds, and interfaces-adt 15 does not type it there.
    const noCondition = (kind: string) => {
      if (b.condition)
        throw new Error(
          `breakpoints[${i}] (${kind}): a condition applies to a line breakpoint only`,
        );
    };
    if (b.exception_class) {
      noCondition('exception');
      return {
        kind: 'exception',
        exceptionClass: b.exception_class.toUpperCase(),
      };
    }
    if (b.statement) {
      noCondition('statement');
      return { kind: 'statement', statement: b.statement.toUpperCase() };
    }
    if (b.message) {
      noCondition('message');
      return {
        kind: 'message',
        msgId: b.message.id.toUpperCase(),
        msgNo: b.message.number,
        msgTy: b.message.type.toUpperCase(),
      };
    }
    if (b.object_type && b.object_name && b.line !== undefined) {
      return {
        kind: 'line',
        uri: lineUriOf(
          {
            object_type: b.object_type,
            object_name: b.object_name,
            include: b.include,
            parent_name: b.parent_name,
          },
          b.line,
        ),
        ...(b.condition ? { condition: b.condition } : {}),
      };
    }
    throw new Error(
      `breakpoints[${i}]: a line needs object_type, object_name and line; or exception_class, statement or message`,
    );
  });
}
```

`src/__tests__/integration/debugger/DebuggerHandlers.test.ts`, `rawListener`: `.listen({ debuggingMode: 'user', requestUser, ...ids }, { holdSeconds: 60 })`.

Any other compile error `npm run test:check` names comes from the same two changes (an identity without `debuggingMode`, an `attach` taking a user, a condition on a non-line breakpoint); fix each the same way.

- [ ] **Step 6: Run the gate**

```bash
npm run lint && npm run build && npm run test:check && npm run lint:check
npx jest src/__tests__/unit/debugger compact/src/__tests__/compactDebug.test.ts
```

Expected: all green. `npm ls @mcp-abap-adt/interfaces-adt` still one version; `grep -n '"link": true' package-lock.json` empty.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json compact-modify/package.json src/lib/debugger/DebugSession.ts src/lib/debugger/schemas.ts src/__tests__/unit/debugger src/__tests__/integration/debugger/DebuggerHandlers.test.ts
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(debugger): adt-clients 29, interfaces-adt 15, adt-strategies 0.10 — the identity states its mode

The identity is user mode for now, as before; the attach names it. A
condition on a non-line breakpoint, which interfaces-adt 15 does not type,
is refused naming the breakpoint. compact-modify declares interfaces-adt,
which it imports.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 2: The start — identity by mode, the host's breakpoint conflict, the preflight, refusals before any change

**Files:**
- Modify: `src/lib/debugger/ids.ts`
- Modify: `src/lib/requestContext.ts`, `src/lib/requestSystemResolution.ts`, `src/lib/auth/destinationStores.ts`, `src/lib/auth/IAuthBrokerFactory.ts`, `server/src/launcher.ts`
- Modify: `src/lib/debugger/DebugSession.ts`
- Modify: `src/lib/debugger/DebuggerInstance.ts`
- Modify: `src/__tests__/unit/debugger/fakes.ts`
- Modify: `src/__tests__/unit/debugger/ids.test.ts`
- Create: `src/__tests__/unit/debugger/DebugSessionStart.test.ts`

**Interfaces:**
- Consumes: `checkListener(identity)` (answers `ok` when free, `409` when held), `readListenerConflict(error: IAdtError): { conflictText: string; ideUser?: string } | undefined` from `@mcp-abap-adt/adt-clients`.
- Produces (all exported from `src/lib/debugger/DebugSession.ts` unless named otherwise):
  - `type DebuggingMode = 'user' | 'terminal'`
  - `type DebugSettings = Omit<IDebuggerSettings, 'showDataAging'>`
  - `interface DebugStartOptions { breakpoints?: IDebuggerBreakpoint[]; run?: RunTarget; requestUser?: string; debuggingMode?: DebuggingMode; settings?: DebugSettings }`
  - `interface DebugSessionOptions { breakpointConflict?: BreakpointConflict }`
  - `class DebugRefusedError extends Error` — refused before the wire
  - `class DebugConflictError extends DebugListenerError { readonly conflictText: string; readonly ideUser?: string }`
  - `function refuseConditionOffLine(list: readonly IDebuggerBreakpoint[]): void`
  - `DebugSession` constructor `(ports, ids: DebuggerIds & { stated?: boolean; terminalStated?: boolean }, options: DebugSessionOptions = {})`; `currentIdentity(): IDebuggerIdentity | undefined`; `start(conflict: IDebuggerListenerConflict, options?: DebugStartOptions)`
  - `src/lib/debugger/ids.ts`: `type BreakpointConflict = 'replace' | 'refuse-if-held'`; `resolveBreakpointConflict(fallback?: BreakpointConflict, env?: NodeJS.ProcessEnv): BreakpointConflict`; `resolveDebuggerIds()` answers `terminalStated: boolean`
  - `createDebuggerInstance(ids?, options?: { breakpointConflict?: BreakpointConflict })`
  - `RequestContext.debugBreakpointConflict?: string`; header `x-sap-debug-breakpoint-conflict`; destination key `SAP_DEBUG_BREAKPOINT_CONFLICT` (`DestinationSystemContext.debugBreakpointConflict`)

- [ ] **Step 1: Extend the fakes**

In `fakes.ts`, add to the debugger members:

```ts
        checkListener: async () => {
          calls.push('checkListener');
          return (checkAnswers.shift() ?? DONE)();
        },
```

with `const checkAnswers: Array<() => any> = [];` inside `fakeWorld` and returned. Give the fake `stopListener` and `listen` their identity in the log (they already get it through the wrapper). Add at module level:

```ts
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';

/** The system's 409 to a listener or a check while another IDE holds the user (recorded on premise, sanitised). */
export const CONFLICT_409 = () =>
  refusedResponse('An exception was raised', {
    response: {
      status: 409,
      headers: { 'content-type': 'application/xml' },
      data: corpusBody('debugger-conflict--01-listen-refused'),
    },
  } as unknown as Partial<IAdtError>);
```

- [ ] **Step 2: Write the failing tests**

Append to `src/__tests__/unit/debugger/ids.test.ts` (new imports at the top):

```ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readDestinationSystemContext } from '../../../lib/auth/destinationStores';
import { resolveBreakpointConflict } from '../../../lib/debugger/ids';
import { withDestinationSystemContext } from '../../../lib/requestSystemResolution';

describe('the terminal id and the breakpoint conflict, as stated', () => {
  it('says whether the terminal id itself was stated', () => {
    expect(
      resolveDebuggerIds({ SAP_DEBUG_TERMINAL_ID: 'T1' }).terminalStated,
    ).toBe(true);
    expect(
      resolveDebuggerIds({ SAP_DEBUG_IDE_ID: 'I1' }).terminalStated,
    ).toBe(false);
  });

  it('the conflict: replace by default; the embedder, under the environment, under the request scope', () => {
    expect(resolveBreakpointConflict(undefined, {})).toBe('replace');
    expect(resolveBreakpointConflict('refuse-if-held', {})).toBe(
      'refuse-if-held',
    );
    expect(
      resolveBreakpointConflict('refuse-if-held', {
        SAP_DEBUG_BREAKPOINT_CONFLICT: 'replace',
      }),
    ).toBe('replace');
    runWithRequestContext(
      requestContextFromHeaders({
        'x-sap-debug-breakpoint-conflict': 'refuse-if-held',
      }),
      () =>
        expect(
          resolveBreakpointConflict('replace', {
            SAP_DEBUG_BREAKPOINT_CONFLICT: 'replace',
          }),
        ).toBe('refuse-if-held'),
    );
  });

  it("a destination's .env states it, and a header wins over it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-conflict-'));
    try {
      const file = path.join(dir, 'destination.env');
      fs.writeFileSync(file, 'SAP_DEBUG_BREAKPOINT_CONFLICT=refuse-if-held\n');
      const stated = readDestinationSystemContext(file);
      expect(stated.debugBreakpointConflict).toBe('refuse-if-held');
      withDestinationSystemContext(stated, () =>
        expect(resolveBreakpointConflict(undefined, {})).toBe('refuse-if-held'),
      );
      runWithRequestContext(
        requestContextFromHeaders({
          'x-sap-debug-breakpoint-conflict': 'replace',
        }),
        () =>
          withDestinationSystemContext(stated, () =>
            expect(resolveBreakpointConflict(undefined, {})).toBe('replace'),
          ),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a value it does not know, naming both it knows', () => {
    expect(() =>
      resolveBreakpointConflict(undefined, {
        SAP_DEBUG_BREAKPOINT_CONFLICT: 'merge',
      }),
    ).toThrow(
      'SAP_DEBUG_BREAKPOINT_CONFLICT: merge is neither replace nor refuse-if-held',
    );
  });
});
```

Create `src/__tests__/unit/debugger/DebugSessionStart.test.ts`:

```ts
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import {
  DebugConflictError,
  DebugRefusedError,
  DebugRequestError,
  DebugSession,
} from '../../../lib/debugger/DebugSession';
import { refusedResponse } from '../../helpers/fakeClient';
import {
  CONFLICT_409,
  fakeWorld,
  IDS,
  LISTEN_NOTHING,
  until,
} from './fakes';

const LINE: IDebuggerBreakpoint = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
};
const HELD = { breakpointConflict: 'refuse-if-held' as const };

describe('the start', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function listening(
    world = fakeWorld(),
    ids: ConstructorParameters<typeof DebugSession>[1] = IDS,
    options: ConstructorParameters<typeof DebugSession>[2] = {},
    start: Parameters<DebugSession['start']>[1] = {},
  ) {
    const session = new DebugSession(world.ports, ids, options).bind('origin');
    const started = session.start('refuse', start);
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await started;
    return { session, world };
  }

  describe('identity by mode', () => {
    it('terminal mode without a configured terminal id is refused before the wire', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await expect(
        session.start('refuse', { debuggingMode: 'terminal' }),
      ).rejects.toThrow(
        new DebugRefusedError('terminal mode: no terminal id is configured'),
      );
      expect(world.log).toEqual([]);
      expect(world.opened).toEqual([]);
      expect(session.holdsState()).toBe(false);
    });

    it('request_user with terminal mode is refused before the wire', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, {
        ...IDS,
        terminalStated: true,
      }).bind('origin');
      await expect(
        session.start('refuse', {
          debuggingMode: 'terminal',
          requestUser: 'SAPUSER02',
        }),
      ).rejects.toThrow(DebugRefusedError);
      expect(world.log).toEqual([]);
      expect(world.opened).toEqual([]);
    });

    it.each([
      ['user', {}],
      ['terminal', { debuggingMode: 'terminal' as const }],
    ])('a blank request_user in %s mode is refused before the wire, not read as omitted', async (_, mode) => {
      for (const blank of ['', '   ']) {
        const world = fakeWorld();
        const session = new DebugSession(world.ports, {
          ...IDS,
          terminalStated: true,
        }).bind('origin');
        await expect(
          session.start('refuse', { ...mode, requestUser: blank }),
        ).rejects.toThrow(new DebugRefusedError('request_user is empty'));
        expect(world.log).toEqual([]);
        expect(world.opened).toEqual([]);
        expect(session.holdsState()).toBe(false);
      }
    });

    it('terminal mode keys on the configured terminal id and asks for no request user', async () => {
      const world = fakeWorld();
      const asked = jest.spyOn(world.ports, 'requestUser');
      const { session } = await listening(
        world,
        { ...IDS, terminalStated: true },
        {},
        { debuggingMode: 'terminal' },
      );
      const listen = world.log.find((c) => c.call === 'listen')!;
      expect(listen.args[0]).toEqual({
        debuggingMode: 'terminal',
        terminalId: IDS.terminalId,
        ideId: IDS.ideId,
      });
      expect(asked).not.toHaveBeenCalled();
      expect(session.currentIdentity()).toEqual(listen.args[0]);
    });

    it("user mode for another user names that user, upper case, without asking the connection's", async () => {
      const world = fakeWorld();
      const asked = jest.spyOn(world.ports, 'requestUser');
      await listening(world, IDS, {}, { requestUser: 'sapuser02' });
      expect(world.log.find((c) => c.call === 'listen')!.args[0]).toEqual({
        debuggingMode: 'user',
        requestUser: 'SAPUSER02',
        terminalId: IDS.terminalId,
        ideId: IDS.ideId,
      });
      expect(asked).not.toHaveBeenCalled();
    });

    it('a condition on a non-line breakpoint is refused before the wire, naming it', async () => {
      const world = fakeWorld();
      const session = new DebugSession(world.ports, IDS).bind('origin');
      await expect(
        session.start('refuse', {
          breakpoints: [
            LINE,
            {
              kind: 'exception',
              exceptionClass: 'CX_A',
              condition: 'lv_a = 1',
            } as unknown as IDebuggerBreakpoint,
          ],
        }),
      ).rejects.toThrow(
        'breakpoints[1] (exception): a condition applies to a line breakpoint only',
      );
      expect(world.log).toEqual([]);
    });
  });

  describe('the preflight (refuse-if-held)', () => {
    it('a 409 refuses the start before any stopListener or arming, with the holder named', async () => {
      const world = fakeWorld();
      world.checkAnswers.push(CONFLICT_409);
      const session = new DebugSession(
        world.ports,
        { ...IDS, stated: true },
        HELD,
      ).bind('origin');
      const error = await session
        .start('refuse', { breakpoints: [LINE] })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DebugConflictError);
      expect((error as DebugConflictError).conflictText).toMatch(
        /global debugging scope/,
      );
      expect((error as DebugConflictError).ideUser).toBe('SAPUSER01');
      expect(world.calls).toEqual(['checkListener']);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
      expect(session.holdsState()).toBe(false);
      expect(session.currentIdentity()).toBeUndefined();
    });

    it('a failure of the preflight itself refuses the start before any change', async () => {
      const world = fakeWorld();
      world.checkAnswers.push(() => refusedResponse('No authorization'));
      const session = new DebugSession(world.ports, IDS, HELD).bind('origin');
      await expect(
        session.start('refuse', { breakpoints: [LINE] }),
      ).rejects.toThrow(new DebugRequestError('No authorization'));
      expect(world.calls).toEqual(['checkListener']);
      expect(new Set(world.closed)).toEqual(new Set(world.opened));
    });

    it('runs on the control connection, then the reconciliation, then the arming, then the listener on a connection of its own', async () => {
      const { world } = await listening(
        fakeWorld(),
        { ...IDS, stated: true },
        HELD,
        { breakpoints: [LINE] },
      );
      const at = (call: string) => world.log.findIndex((c) => c.call === call);
      const on = (call: string) =>
        world.log.find((c) => c.call === call)!.connection;
      expect(at('checkListener')).toBeLessThan(at('stopListener'));
      expect(at('stopListener')).toBeLessThan(at('setBreakpoints'));
      expect(at('setBreakpoints')).toBeLessThan(at('listen'));
      expect(on('stopListener')).toBe(on('checkListener'));
      expect(on('setBreakpoints')).toBe(on('checkListener'));
      expect(on('listen')).not.toBe(on('checkListener'));
    });

    it('replace (the default) sends no check', async () => {
      const { world } = await listening(fakeWorld(), IDS, {}, {
        breakpoints: [LINE],
      });
      expect(world.calls).not.toContain('checkListener');
    });

    it('a later replacement is checked first; our own listener under the same ideId does not block it', async () => {
      const { session, world } = await listening(fakeWorld(), IDS, HELD);
      world.calls.length = 0;
      await session.setBreakpoints([LINE]);
      expect(world.calls.slice(0, 2)).toEqual([
        'checkListener',
        'setBreakpoints:1',
      ]);
    });

    it('a 409 before a later replacement refuses it; nothing is sent and the listener stands', async () => {
      const { session, world } = await listening(fakeWorld(), IDS, HELD);
      world.calls.length = 0;
      world.checkAnswers.push(CONFLICT_409);
      await expect(session.setBreakpoints([LINE])).rejects.toThrow(
        DebugConflictError,
      );
      expect(world.calls).toEqual(['checkListener']);
      expect((await session.wait(0)).state).toBe('listening');
    });
  });

  // Review Focus 5.
  it('a first listen refused 409 with nothing armed or reconciled is a refusal before any change: no stopListener', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const started = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT_409());
    await expect(started).rejects.toThrow(DebugConflictError);
    expect(world.calls).not.toContain('stopListener');
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    expect(session.holdsState()).toBe(false);
  });
});
```

- [ ] **Step 3: Run them and see them fail**

```bash
npx jest src/__tests__/unit/debugger/ids.test.ts src/__tests__/unit/debugger/DebugSessionStart.test.ts
```

Expected: compile errors first (`resolveBreakpointConflict`, `DebugRefusedError`, `DebugConflictError`, `currentIdentity`, the third constructor argument, `terminalStated`, `debugBreakpointConflict` do not exist).

- [ ] **Step 4: Implement the ids and the request-scope plumbing**

`src/lib/debugger/ids.ts` — `resolveDebuggerIds` and the conflict:

```ts
export function resolveDebuggerIds(
  env: NodeJS.ProcessEnv = process.env,
): DebuggerIds & { stated: boolean; terminalStated: boolean } {
  const stated = statedDebuggerIds(env);
  return {
    terminalId: stated.terminalId ?? newDebuggerId(),
    ideId: stated.ideId ?? newDebuggerId(),
    stated: stated.terminalId !== undefined || stated.ideId !== undefined,
    // Terminal mode keys on a terminal id the host configured: a random one names no terminal.
    terminalStated: stated.terminalId !== undefined,
  };
}

/**
 * What a change does to the breakpoints another IDE of the same SAP user holds
 * under the same key: `replace` sends the full list, `refuse-if-held` first asks
 * whether another IDE holds the key and refuses if so. The host's choice,
 * stated like the ids: the request scope (a header, or the destination's
 * `.env` entered into it), then the environment, then the embedder's option.
 */
export type BreakpointConflict = 'replace' | 'refuse-if-held';
const BREAKPOINT_CONFLICTS: readonly string[] = ['replace', 'refuse-if-held'];

export function resolveBreakpointConflict(
  fallback?: BreakpointConflict,
  env: NodeJS.ProcessEnv = process.env,
): BreakpointConflict {
  const stated =
    getRequestContext()?.debugBreakpointConflict?.trim() ||
    env.SAP_DEBUG_BREAKPOINT_CONFLICT?.trim() ||
    fallback ||
    'replace';
  if (!BREAKPOINT_CONFLICTS.includes(stated))
    throw new Error(
      `SAP_DEBUG_BREAKPOINT_CONFLICT: ${stated} is neither replace nor refuse-if-held`,
    );
  return stated as BreakpointConflict;
}
```

`src/lib/requestContext.ts` — the field, below `debugIdeId`:

```ts
  /**
   * The debugger's breakpoint conflict (`replace` or `refuse-if-held`), as
   * stated: `x-sap-debug-breakpoint-conflict`, or
   * `SAP_DEBUG_BREAKPOINT_CONFLICT` of the request's destination. Same
   * presence rule as `debugTerminalId`.
   */
  debugBreakpointConflict?: string;
```

and in `requestContextFromHeaders`:

```ts
  const debugBreakpointConflict = headerValue(
    headers,
    'x-sap-debug-breakpoint-conflict',
  );
```

with `...(debugBreakpointConflict ? { debugBreakpointConflict } : {}),` beside `debugIdeId`; the doc comment names `x-sap-debug-breakpoint-conflict` with the two debug ids.

`src/lib/auth/IAuthBrokerFactory.ts`, `DestinationSystemContext`:

```ts
  /** `SAP_DEBUG_BREAKPOINT_CONFLICT`. */
  debugBreakpointConflict?: string;
```

`src/lib/auth/destinationStores.ts`, `readDestinationSystemContext`: read `parsed.SAP_DEBUG_BREAKPOINT_CONFLICT` as `debugBreakpointConflict` and add `...(debugBreakpointConflict ? { debugBreakpointConflict } : {})`; the doc comment lists the key.

`src/lib/requestSystemResolution.ts`, `withDestinationSystemContext`: add `debugBreakpointConflict?: string;` to both inline types and

```ts
  if (
    stated?.debugBreakpointConflict &&
    !(scope && 'debugBreakpointConflict' in scope)
  ) {
    added.debugBreakpointConflict = stated.debugBreakpointConflict;
  }
```

`server/src/launcher.ts`, the help text — after the `SAP_DEBUG_IDE_ID` block:

```
    SAP_DEBUG_BREAKPOINT_CONFLICT  replace (default) or refuse-if-held: whether a change of the
                                   debugger's breakpoints first asks if another IDE of the same
                                   SAP user holds them, and refuses if so. First found:
                                   x-sap-debug-breakpoint-conflict; the destination's .env;
                                   the environment
```

and after `x-sap-debug-ide-id` in the headers block:

```
    x-sap-debug-breakpoint-conflict The debugger's breakpoint conflict (wins over the .env and env)
```

- [ ] **Step 5: Implement the start**

`src/lib/debugger/DebugSession.ts`. Imports: add `readListenerConflict` (value) from `@mcp-abap-adt/adt-clients`; `IDebuggerSettings` (type) from `@mcp-abap-adt/interfaces-adt`; `type BreakpointConflict` from `./ids`.

New exported declarations, after `BreakpointsAnswer`:

```ts
export type DebuggingMode = 'user' | 'terminal';
/** What a caller may set; `showDataAging` is left out, so it stays off, the system's default. */
export type DebugSettings = Omit<IDebuggerSettings, 'showDataAging'>;
export interface DebugStartOptions {
  breakpoints?: IDebuggerBreakpoint[];
  run?: RunTarget;
  /** User mode: whose requests are caught; the connected user when omitted. */
  requestUser?: string;
  /** `user` (the default) or `terminal`, which keys on the configured terminal id. */
  debuggingMode?: DebuggingMode;
  /** Applied after each attach; see `setSettings`. */
  settings?: DebugSettings;
}
export interface DebugSessionOptions {
  /** The host's choice; `replace` when omitted. */
  breakpointConflict?: BreakpointConflict;
}
```

New errors beside the four existing ones:

```ts
/** Refused before anything was sent. */
export class DebugRefusedError extends Error {}
/** Another debugger holds the user's debugging (409), as `readListenerConflict` reads it. */
export class DebugConflictError extends DebugListenerError {
  constructor(
    readonly conflictText: string,
    readonly ideUser?: string,
  ) {
    super(
      `another debugger holds this debugging: ${conflictText}${ideUser ? ` (IDE user ${ideUser})` : ''}`,
    );
  }
}

/** A condition on a breakpoint other than a line is refused before the wire, naming it. */
export function refuseConditionOffLine(
  list: readonly IDebuggerBreakpoint[],
): void {
  list.forEach((b, i) => {
    if (b.kind !== 'line' && (b as { condition?: string }).condition)
      throw new DebugRefusedError(
        `breakpoints[${i}] (${b.kind}): a condition applies to a line breakpoint only`,
      );
  });
}

/** A failed listener answer: the holder named when it is the system's conflict. */
function listenerError(answer: IAdtResponse<unknown>): DebugListenerError {
  const held = answer.ok ? undefined : readListenerConflict(answer.getError());
  return held
    ? new DebugConflictError(held.conflictText, held.ideUser)
    : new DebugListenerError(messageOf(answer));
}
```

Fields — remove `protected user?: string;`, add:

```ts
  protected readonly breakpointConflict: BreakpointConflict;
  /** The identity of this debug session: fixed by a start, kept until a cleanup succeeded completely. */
  protected fixed?: IDebuggerIdentity;
  /** True once something that changes the system was sent: the cleanup owes a stopListener. */
  protected changed = false;
  /** The settings the caller set; applied after each attach (Task 6). */
  protected preferences: DebugSettings = {};
```

Constructor:

```ts
  constructor(
    protected readonly ports: DebugSessionPorts<O>,
    readonly ids: DebuggerIds & { stated?: boolean; terminalStated?: boolean },
    options: DebugSessionOptions = {},
  ) {
    this.breakpointConflict = options.breakpointConflict ?? 'replace';
  }
```

Replace `identity()` by:

```ts
  /** The identity in force: undefined before a start and after a complete cleanup. */
  currentIdentity(): IDebuggerIdentity | undefined {
    return this.fixed;
  }
  protected requireIdentity(): IDebuggerIdentity {
    if (!this.fixed)
      throw new DebugStateError('this debug session has not started');
    return this.fixed;
  }
  /** From a start's arguments; a mode they do not fit is refused before the wire. */
  protected async identityFor(
    options: DebugStartOptions,
  ): Promise<IDebuggerIdentity> {
    // Presence is checked before any normalisation: a supplied blank is refused in
    // every mode, never read as "not supplied".
    const supplied = options.requestUser !== undefined;
    const named = options.requestUser?.trim();
    if (supplied && !named)
      throw new DebugRefusedError('request_user is empty');
    if (options.debuggingMode === 'terminal') {
      if (supplied)
        throw new DebugRefusedError(
          'request_user does not apply to terminal mode: the system reads no request user there',
        );
      if (!this.ids.terminalStated)
        throw new DebugRefusedError('terminal mode: no terminal id is configured');
      return {
        debuggingMode: 'terminal',
        terminalId: this.ids.terminalId,
        ideId: this.ids.ideId,
      };
    }
    const requestUser = (
      named || (await this.ports.requestUser(this.requireOrigin()))
    ).toUpperCase();
    return {
      debuggingMode: 'user',
      requestUser,
      terminalId: this.ids.terminalId,
      ideId: this.ids.ideId,
    };
  }
  /**
   * refuse-if-held: asks on the control connection — never on a polling one —
   * whether another debugger holds the key. Changes nothing. Our own listener
   * under the same ideId is no conflict (measured on premise, 2026-10-10), so
   * this protects against another IDE, not against ourselves. Not atomic: a
   * listener started between this check and the arming is not seen.
   */
  private async preflight(identity: IDebuggerIdentity): Promise<void> {
    if (this.breakpointConflict !== 'refuse-if-held') return;
    const checked = await (await this.controlDebugger())
      .checkListener(identity)
      .catch(asFailure);
    if (!checked.ok) {
      const error = listenerError(checked);
      throw error instanceof DebugConflictError
        ? error
        : new DebugRequestError(messageOf(checked));
    }
  }
  /** Closes the control connection; a close that throws is kept for the next stop and named. */
  private async closeControl(): Promise<string[]> {
    const control = this.control;
    this.control = undefined;
    const kept = await this.closeOrRecord(
      control?.connection,
      "the breakpoints' connection",
    );
    return kept ? [kept] : [];
  }
```

`setBreakpoints` runs the preflight before a later replacement:

```ts
  setBreakpoints(
    list: IDebuggerBreakpoint[],
  ): Promise<DebugView<BreakpointsAnswer>> {
    return this.mutate(async () => {
      refuseConditionOffLine(list);
      await this.preflight(this.requireIdentity());
      return this.armLocked(list);
    });
  }
```

In `armLocked`, `const identity = await this.identity();` becomes `const identity = this.requireIdentity();` and `this.changed = true;` goes after `const dbg = await this.controlDebugger();` and right before `dbg.setBreakpoints(identity, list)` (the first request that replaces the key's set). In `deleteBreakpoint`, `await this.identity()` becomes `this.requireIdentity()`. In `loop`, `attachTo`, `releaseCaught` and `stop`, every `await this.identity()` becomes `this.requireIdentity()`.

`beforeFirstListen` marks the change before it sends:

```ts
  protected async beforeFirstListen(
    identity: IDebuggerIdentity,
  ): Promise<void> {
    if (!this.ids.stated || this.reconciled) return;
    // A predecessor under these ids may have left a listener (D12); its absence is no failure.
    // It counts as done only once the request was sent: a start that failed before it retries.
    // stopListener deletes the key's breakpoints too, which the arming then replaces.
    // A connection that cannot be opened sends nothing: that start failed before any change.
    const control = await this.controlDebugger();
    this.changed = true;
    await control.stopListener(identity).catch(() => undefined);
    this.reconciled = true;
  }
```

In `armLocked` likewise: `const dbg = await this.controlDebugger();` first, then `this.changed = true;`, then the request — so `DebugSessionLifecycle.test.ts`'s "a start that failed before reconciling reconciles on the next start" (the connection cannot be opened) stays a start refused before any change.

`start` — the whole method:

```ts
  start(
    conflict: IDebuggerListenerConflict,
    options: DebugStartOptions = {},
  ): Promise<DebugState & { breakpoints?: BreakpointsAnswer }> {
    return this.mutate(async () => {
      if (this.listener || this.current)
        throw new DebugStateError(
          'a listener is already running for this debug session',
        );
      // Refusals before the wire: nothing is opened, nothing is sent.
      refuseConditionOffLine(options.breakpoints ?? []);
      const identity = await this.identityFor(options);
      this.mode = conflict;
      this.failure = undefined;
      this.fixed = identity;
      this.preferences = { ...(options.settings ?? {}) };
      const before = new Set(this.armed.keys());
      const placedHere = () =>
        [...this.armed.values()].filter((b) => !before.has(b.id!));
      let armed: DebugView<BreakpointsAnswer> | undefined;
      try {
        // 1. the preflight; 2. the reconciliation (stopListener deletes the key's
        // breakpoints, so it runs only after the preflight); 3. the arming, then listening.
        await this.preflight(identity);
        await this.beforeFirstListen(identity);
        armed = options.breakpoints?.length
          ? await this.armLocked(options.breakpoints)
          : undefined;
        const connection = await this.open();
        const listener: Listener = {
          connection,
          debugger: this.ports.abapDebugger(connection, conflict),
        };
        const generation = ++this.generation;
        this.listener = listener;
        const first = await this.poll(
          listener,
          identity,
          FIRST_POLL_HOLD_SECONDS,
        );
        listener.open = undefined; // handled here
        if (!first.ok) {
          const error = listenerError(first);
          // A refused listener (409) changed nothing; any other failure leaves its state unknown.
          if (!(error instanceof DebugConflictError)) this.changed = true;
          throw error;
        }
        this.changed = true;
        const caught = readDebuggee(bodyOf(first));
        if (caught) await this.attachTo(caught, bodyOf(first), generation);
        if (!this.current && this.owns(listener, generation))
          void this.loop(listener, generation);
        if (options.run && this.owns(listener, generation))
          this.startRun(options.run, generation);
        // Inside the protected part: an attach that failed is reported here (report() throws its failure).
        return {
          ...this.report(),
          ...(armed ? { breakpoints: armed.value } : {}),
        };
      } catch (error) {
        if (!this.changed) {
          // Refused before any change — a preflight 409, a failure of the preflight
          // itself, a first listen refused 409 with nothing armed or reconciled. No
          // stopListener and no deletion: only the connections this start opened close.
          const failures = [
            ...(await this.dropListener()),
            ...(await this.closeControl()),
          ];
          // The identity and the settings go only with a complete cleanup (Task 4
          // replaces this branch by `settle(failures)`).
          if (failures.length === 0) {
            this.fixed = undefined;
            this.preferences = {};
            throw error;
          }
          const notClosed = `not closed: ${failures.join('; ')}`;
          if (error instanceof Error) {
            error.message = `${error.message}; ${notClosed}`;
            throw error;
          }
          throw new DebugListenerError(`${thrown(error)}; ${notClosed}`);
        }
        // A refused or failed start leaves nothing it armed. Each undo runs whatever the other did,
        // and what could not be undone is named in the error the start fails with.
        const failures: string[] = [];
        failures.push(...(await this.releaseLocked()));
        const run = this.run;
        this.run = undefined;
        const runKept = await this.closeOrRecord(
          run?.connection,
          "the run's connection",
        );
        if (runKept) failures.push(runKept);
        failures.push(...(await this.dropListener()));
        failures.push(...(await this.undoArmed(identity, placedHere())));
        if (failures.length === 0) throw error;
        const notUndone = `not undone: ${failures.join('; ')}`;
        if (error instanceof Error) {
          error.message = `${error.message}; ${notUndone}`;
          throw error;
        }
        throw new DebugListenerError(`${thrown(error)}; ${notUndone}`);
      }
    });
  }
```

(The after-change branch is the 17.2 rollback, unchanged; Task 4 replaces it with the authoritative cleanup.)

In `onPoll`, a failed poll names the holder too: `this.failure = listenerError(answer).message;`.

`src/lib/debugger/DebuggerInstance.ts`:

```ts
export function createDebuggerInstance(
  ids: DebuggerIds & {
    stated: boolean;
    terminalStated?: boolean;
  } = resolveDebuggerIds(),
  options: { breakpointConflict?: BreakpointConflict } = {},
): DebuggerInstance {
  return new DebuggerInstance({
    abap: new DebugSession(liveDebugPorts(), ids, {
      breakpointConflict: resolveBreakpointConflict(options.breakpointConflict),
    }),
    amdp: new AmdpSession(liveAmdpPorts()),
  });
}
```

(import `type BreakpointConflict, resolveBreakpointConflict` from `./ids`). The doc comment above it: "The breakpoint conflict is the host's: the request scope, the environment, then `options.breakpointConflict`; an embedder overriding `BaseMcpServer.debuggerFor()` passes it here."

- [ ] **Step 6: Run the tests and the gate**

```bash
npx jest src/__tests__/unit/debugger/ids.test.ts src/__tests__/unit/debugger/DebugSessionStart.test.ts
npm run lint && npm run build && npm run test:check && npm run lint:check
npx jest src/__tests__/unit/debugger compact/src/__tests__/compactDebug.test.ts
```

Expected: green. The existing tests keep passing: every existing start is user mode under `replace`, and the existing `CONFLICT()` fake carries no 409 document, so it still takes the after-change branch.

- [ ] **Step 7: Commit**

```bash
git add src/lib/debugger src/lib/requestContext.ts src/lib/requestSystemResolution.ts src/lib/auth/destinationStores.ts src/lib/auth/IAuthBrokerFactory.ts server/src/launcher.ts src/__tests__/unit/debugger
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(debugger): the start fixes an identity by mode, runs the host's preflight first, and a refusal before any change sends nothing

user or terminal mode, another request user; the breakpoint conflict
(replace | refuse-if-held) from the request scope, the environment or
createDebuggerInstance. refuse-if-held checks the listener on the control
connection before the reconciliation and the arming, and before every later
replacement. A 409 — of the preflight, or of a first listen with nothing
armed or reconciled — carries the holder and changes nothing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 3: The arming contract — one set, `requested` beside `armed`, every row paired by its `clientId`

**Files:**
- Create: `src/lib/debugger/arming.ts`
- Modify: `src/lib/debugger/index.ts` (`export * from './arming';`)
- Modify: `src/lib/debugger/readings.ts` (`BreakpointReading.clientId`, read by `readBreakpoints`)
- Modify: `src/lib/debugger/DebugSession.ts` (`BreakpointsAnswer`, `armLocked`, `deleteBreakpoint`, `forget`, `requestedBreakpoints`, `nextTag`, `undoArmed` and `stop` use `forget`)
- Modify: `src/__tests__/unit/debugger/fakes.ts` (`breakpointAnswers`, `sent`, `rowsXml`, `placeAll` as the default answer)
- Create: `src/__tests__/unit/debugger/arming.test.ts`
- Modify: `src/__tests__/unit/debugger/DebugSession.test.ts`, `src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts`, `src/__tests__/unit/debugger/handlers.test.ts`

**Interfaces:**
- Consumes: `readBreakpoints(xml): BreakpointReading[]`, `breakpointKey(b)` (readings.ts); `requireIdentity()`, `preflight()`, `changed` (Task 2); `IDebuggerBreakpoint.clientId?: string` (interfaces-adt 15, every kind), sent by adt-clients 29 as the row's `clientId` attribute, escaped.
- Produces:
  - `readings.ts`: `BreakpointReading` gains `clientId?: string`, the tag the system echoed on the row.
  - `arming.ts`: `interface RequestedBreakpoint { clientId: string; definition: IDebuggerBreakpoint }`; `interface BreakpointNotPlaced { requested: IDebuggerBreakpoint; error?: string }`; `interface UnexpectedRow { kind: string; id?: string; clientId?: string; error?: string }`; `definitionKey(b: IDebuggerBreakpoint): string`; `mergeDefinitions(kept: readonly RequestedBreakpoint[], added: readonly IDebuggerBreakpoint[], nextTag: () => string): RequestedBreakpoint[]`; `wireOf(r: RequestedBreakpoint): IDebuggerBreakpoint`; `interface Pairing { requested: RequestedBreakpoint[]; paired: Map<string, string>; placed: BreakpointReading[]; refused: BreakpointNotPlaced[]; lost: BreakpointNotPlaced[]; unexpected: UnexpectedRow[] }`; `pairRows(sent: readonly RequestedBreakpoint[], earlier: ReadonlySet<string>, rows: readonly BreakpointReading[]): Pairing` — `earlier` holds the tags of the definitions kept before this change.
  - `BreakpointsAnswer` becomes `{ placed: BreakpointReading[]; refused: BreakpointNotPlaced[]; lost: BreakpointNotPlaced[]; unexpected: UnexpectedRow[] }` — `refused[].error` is optional now (a definition no row answered has no reason).
  - `DebugSession.requestedBreakpoints(): IDebuggerBreakpoint[]` — the definitions as the callers gave them, without the tags.
  - The tag: `bp` and a counter of the session instance (`bp1`, `bp2`, …), from `private nextTag(): string`; the counter is never reset.
  - `deleteBreakpoint(id)` refuses with `DebugRefusedError`: `no breakpoint <id> is armed in this debug session`.

- [ ] **Step 1: Read the tag, extend the fakes**

`src/lib/debugger/readings.ts` — `BreakpointReading` gains, after `condition?: string;`:

```ts
  /** The caller's tag, echoed by the system on a placed and on a refused row alike. */
  clientId?: string;
```

and `readBreakpoints` reads it with the others: `'condition',` is followed by `'clientId',` in the key list.

In `fakes.ts`, the fake `setBreakpoints` records the list it was sent and takes scripted answers; with none scripted it answers as a conforming system does, every row placed with its tag echoed:

```ts
        setBreakpoints: async (_i: unknown, list: any[], o: any) => {
          if (o?.validationOnly) {
            calls.push(`validate:${list.length}`);
            return (validationAnswers.shift() ?? (() => okResponse('')))();
          }
          calls.push(`setBreakpoints:${list.length}`);
          sent.push(list);
          return (
            breakpointAnswers.shift() ??
            ((l: any[]) => okResponse(placeAll(l)))
          )(list);
        },
```

with `const sent: any[][] = [];` and `const breakpointAnswers: Array<(sent: any[]) => any> = [];` inside `fakeWorld`, both returned. At module level:

```ts
/** A breakpoints answer with these rows, in this order; `uri` and `error` are written the way the system names them. */
export const rowsXml = (rows: Array<Record<string, string>>) =>
  `<?xml version="1.0" encoding="utf-8"?><dbg:breakpoints xmlns:dbg="http://www.sap.com/adt/debugger" xmlns:adtcore="http://www.sap.com/adt/core">${rows
    .map(
      (r) =>
        `<breakpoint ${Object.entries(r)
          .map(
            ([k, v]) =>
              `${k === 'uri' ? 'adtcore:uri' : k === 'error' ? 'errorMessage' : k}="${v}"`,
          )
          .join(' ')}/>`,
    )
    .join('')}</dbg:breakpoints>`;

/** A conforming answer: every row sent is placed, its tag echoed, its id the fake's own. */
export const placeAll = (list: Array<Record<string, any>>) =>
  rowsXml(
    list.map((b, i) => {
      const row: Record<string, string> = { kind: b.kind, id: `ID${i + 1}` };
      for (const k of [
        'clientId',
        'uri',
        'exceptionClass',
        'statement',
        'msgId',
        'msgNo',
        'msgTy',
        'condition',
      ])
        if (b[k] !== undefined) row[k] = String(b[k]);
      return row;
    }),
  );
```

- [ ] **Step 2: Write the failing tests**

Create `src/__tests__/unit/debugger/arming.test.ts`:

```ts
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import { corpusBody } from '../../../lib/adtCorpus';
import {
  definitionKey,
  mergeDefinitions,
  pairRows,
  type RequestedBreakpoint,
  wireOf,
} from '../../../lib/debugger/arming';
import { readBreakpoints } from '../../../lib/debugger/readings';
import { rowsXml } from './fakes';

type LineBreakpoint = Extract<IDebuggerBreakpoint, { kind: 'line' }>;
const line = (n: number, condition?: string): LineBreakpoint => ({
  kind: 'line',
  uri: `/sap/bc/adt/oo/classes/class_a/source/main#start=${n}`,
  ...(condition ? { condition } : {}),
});
const EXC: IDebuggerBreakpoint = { kind: 'exception', exceptionClass: 'CX_A' };
const STMT: IDebuggerBreakpoint = { kind: 'statement', statement: 'MESSAGE' };
const tagged = (
  clientId: string,
  definition: IDebuggerBreakpoint,
): RequestedBreakpoint => ({ clientId, definition });
const counter = () => {
  let n = 0;
  return () => `bp${++n}`;
};
const rows = (r: Array<Record<string, string>>) => readBreakpoints(rowsXml(r));
const NOT_HERE = 'Cannot create a breakpoint at this position';
const none = new Set<string>();

describe('the arming contract', () => {
  it('deduplicates by kind, target and condition; a kept definition keeps its tag, a new one takes the next', () => {
    const next = counter();
    const kept = mergeDefinitions([], [line(10)], next);
    expect(kept).toEqual([tagged('bp1', line(10))]);
    expect(
      mergeDefinitions(kept, [line(10), line(10, 'lv_a = 1'), EXC, EXC], next),
    ).toEqual([
      tagged('bp1', line(10)),
      tagged('bp2', line(10, 'lv_a = 1')),
      tagged('bp3', EXC),
    ]);
    expect(definitionKey(line(10))).not.toBe(
      definitionKey(line(10, 'lv_a = 1')),
    );
  });

  // Review Focus 6.
  it('the wire form carries the session tag, never a clientId the definition brought', () => {
    const own = { ...EXC, clientId: 'own' } as IDebuggerBreakpoint;
    expect(wireOf(tagged('bp7', own))).toEqual({ ...EXC, clientId: 'bp7' });
    expect(definitionKey(own)).toBe(definitionKey(EXC));
  });

  it('rows out of the request order, several of one kind: each pairs by its tag, whatever its URI says', () => {
    const sent = [
      tagged('bp1', line(32, 'lv_a = 1')),
      tagged('bp2', line(1)),
      tagged('bp3', line(40)),
    ];
    const p = pairRows(
      sent,
      none,
      rows([
        { kind: 'line', clientId: 'bp2', error: NOT_HERE },
        {
          kind: 'line',
          id: 'L9',
          clientId: 'bp1',
          uri: '/sap/bc/adt/oo/classes/class_a/includes/implementations#start=9',
          condition: 'lv_a = 1',
        },
        { kind: 'line', id: 'L40', clientId: 'bp3', uri: line(40).uri },
      ]),
    );
    expect(p.requested).toEqual([sent[0], sent[2]]);
    expect(p.paired).toEqual(
      new Map([
        ['L9', 'bp1'],
        ['L40', 'bp3'],
      ]),
    );
    expect(p.placed.map((r) => r.id)).toEqual(['L9', 'L40']);
    expect(p.refused).toEqual([{ requested: line(1), error: NOT_HERE }]);
    expect(p.lost).toEqual([]);
    expect(p.unexpected).toEqual([]);
  });

  it('an earlier breakpoint that comes back refused is lost, not refused', () => {
    const p = pairRows(
      [tagged('bp1', EXC), tagged('bp2', STMT)],
      new Set(['bp1']),
      rows([
        { kind: 'statement', id: 'S1', clientId: 'bp2', statement: 'MESSAGE' },
        {
          kind: 'exception',
          clientId: 'bp1',
          error: 'Exception class does not exist',
        },
      ]),
    );
    expect(p.lost).toEqual([
      { requested: EXC, error: 'Exception class does not exist' },
    ]);
    expect(p.refused).toEqual([]);
    expect(p.requested).toEqual([tagged('bp2', STMT)]);
  });

  it('a definition no row answers is not placed: refused without a reason, or lost', () => {
    const p = pairRows(
      [tagged('bp1', EXC), tagged('bp2', STMT)],
      new Set(['bp1']),
      rows([]),
    );
    expect(p.lost).toEqual([{ requested: EXC }]);
    expect(p.refused).toEqual([{ requested: STMT }]);
    expect(p.requested).toEqual([]);
  });

  it('a row without a tag, with a tag not sent, or a second row for one tag is unexpected; a placed one stays placed and pairs with nothing', () => {
    const sent = [tagged('bp1', EXC)];
    const p = pairRows(
      sent,
      none,
      rows([
        { kind: 'exception', id: 'E1', clientId: 'bp1', exceptionClass: 'CX_A' },
        { kind: 'exception', id: 'E2', clientId: 'bp1', exceptionClass: 'CX_A' },
        { kind: 'statement', id: 'S1', statement: 'MESSAGE' },
        { kind: 'line', clientId: 'bp9', error: NOT_HERE },
      ]),
    );
    expect(p.requested).toEqual(sent);
    expect(p.paired).toEqual(new Map([['E1', 'bp1']]));
    expect(p.placed.map((r) => r.id)).toEqual(['E1', 'E2', 'S1']);
    expect(p.unexpected).toEqual([
      { kind: 'exception', id: 'E2', clientId: 'bp1' },
      { kind: 'statement', id: 'S1' },
      { kind: 'line', clientId: 'bp9', error: NOT_HERE },
    ]);
    expect(p.refused).toEqual([]);
    expect(p.lost).toEqual([]);
  });

  it('the recorded answer, captured without tags: both rows unexpected, both definitions refused without a reason', () => {
    const p = pairRows(
      [tagged('bp1', line(32, 'lv_a = 1')), tagged('bp2', line(1))],
      none,
      readBreakpoints(corpusBody('debugger-conversation--01-breakpoints-set')),
    );
    expect(p.unexpected).toEqual([
      { kind: 'line', error: NOT_HERE },
      { kind: 'line', id: expect.any(String) },
    ]);
    expect(p.placed).toHaveLength(1);
    expect(p.paired.size).toBe(0);
    expect(p.refused).toEqual([
      { requested: line(32, 'lv_a = 1') },
      { requested: line(1) },
    ]);
    expect(p.requested).toEqual([]);
  });
});
```

In `src/__tests__/unit/debugger/DebugSession.test.ts`, **delete** the two tests `breakpoints: placed kept by id, a refusal matched by content` and `refusals ambiguous within a kind are asked one by one with validationOnly`, and add (import `rowsXml` from `./fakes`, `DebugRefusedError` from the session):

```ts
  describe('the breakpoint set', () => {
    const A = {
      kind: 'line',
      uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
    } as const;
    const B = {
      kind: 'line',
      uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=1',
    } as const;
    const EXC = { kind: 'exception', exceptionClass: 'CX_A' } as const;
    const STMT = { kind: 'statement', statement: 'MESSAGE' } as const;
    const NOT_HERE = 'Cannot create a breakpoint at this position';
    // The tags follow the order the session first saw each definition: bp1, bp2, …
    const ROW_A = { kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri };
    const ROW_EXC = {
      kind: 'exception',
      id: 'E1',
      clientId: 'bp2',
      exceptionClass: 'CX_A',
    };

    it('a second change sends the first set with the new one, each with its tag, and keeps both', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_A])),
        () => okResponse(rowsXml([ROW_EXC, ROW_A])),
      );
      await session.setBreakpoints([A]);
      const second = await session.setBreakpoints([EXC]);
      expect(world.sent).toEqual([
        [{ ...A, clientId: 'bp1' }],
        [
          { ...A, clientId: 'bp1' },
          { ...EXC, clientId: 'bp2' },
        ],
      ]);
      expect(second.value.placed.map((r) => r.id)).toEqual(['E1', 'L10']);
      expect(second.value.unexpected).toEqual([]);
      expect(session.requestedBreakpoints()).toEqual([A, EXC]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['E1', 'L10']);
    });

    // Review Focus 6.
    it("a caller's clientId does not reach the wire: the session's tag does", async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      const a = await session.setBreakpoints([{ ...EXC, clientId: 'own' }]);
      expect(world.sent).toEqual([[{ ...EXC, clientId: 'bp1' }]]);
      expect(a.value.placed).toHaveLength(1);
      expect(a.value.refused).toEqual([]);
      expect(a.value.unexpected).toEqual([]);
    });

    it('no validationOnly request is ever made', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      await session.setBreakpoints([A, B, { kind: 'line', uri: '/x#start=2' }]);
      expect(world.calls.filter((c) => c.startsWith('validate'))).toEqual([]);
    });

    it('two lines answered out of order, the refusal first: each pairs by its tag, the refusal names its definition', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(() =>
        okResponse(
          rowsXml([{ kind: 'line', clientId: 'bp2', error: NOT_HERE }, ROW_A]),
        ),
      );
      const a = await session.setBreakpoints([A, B]);
      expect(a.value.refused).toEqual([{ requested: B, error: NOT_HERE }]);
      expect(a.value.lost).toEqual([]);
      expect(a.value.unexpected).toEqual([]);
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    });

    it('an earlier breakpoint the system no longer places is lost, with its reason', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_A])),
        () =>
          okResponse(
            rowsXml([
              { kind: 'line', clientId: 'bp1', error: 'Source changed' },
              ROW_EXC,
            ]),
          ),
      );
      await session.setBreakpoints([A]);
      const next = await session.setBreakpoints([EXC]);
      expect(next.value.lost).toEqual([
        { requested: A, error: 'Source changed' },
      ]);
      expect(next.value.refused).toEqual([]);
      expect(session.requestedBreakpoints()).toEqual([EXC]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['E1']);
    });

    it('a delete by id removes exactly its definition, of two of one kind, and sends nothing else; the next change does not re-send it', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () =>
          okResponse(
            rowsXml([
              { kind: 'line', id: 'L1', clientId: 'bp2', uri: B.uri },
              ROW_A,
            ]),
          ),
        () =>
          okResponse(
            rowsXml([
              ROW_A,
              {
                kind: 'statement',
                id: 'S1',
                clientId: 'bp3',
                statement: 'MESSAGE',
              },
            ]),
          ),
      );
      await session.setBreakpoints([A, B]);
      world.calls.length = 0;
      await session.deleteBreakpoint('L1');
      expect(world.calls).toEqual(['deleteBreakpoint:L1']);
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
      await session.setBreakpoints([STMT]);
      expect(world.sent[1]).toEqual([
        { ...A, clientId: 'bp1' },
        { ...STMT, clientId: 'bp3' },
      ]);
    });

    it('an unexpected placed row is reported and stays armed; deleting it touches no definition', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(() =>
        okResponse(
          rowsXml([
            ROW_A,
            { kind: 'statement', id: 'S9', statement: 'MESSAGE' },
          ]),
        ),
      );
      const a = await session.setBreakpoints([A]);
      expect(a.value.unexpected).toEqual([{ kind: 'statement', id: 'S9' }]);
      expect(a.value.placed.map((r) => r.id)).toEqual(['L10', 'S9']);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10', 'S9']);
      await session.deleteBreakpoint('S9');
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    });

    // Review Focus 2.
    it('a delete by an id the session does not hold is refused before the wire', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      await expect(session.deleteBreakpoint('L99')).rejects.toThrow(
        new DebugRefusedError('no breakpoint L99 is armed in this debug session'),
      );
      expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
        false,
      );
    });

    it('a failed replacement keeps both lists for the next change', async () => {
      const world = fakeWorld();
      const { session } = await listening(world);
      world.breakpointAnswers.push(
        () => okResponse(rowsXml([ROW_A])),
        () => refusedResponse('Too many breakpoints'),
      );
      await session.setBreakpoints([A]);
      await expect(session.setBreakpoints([EXC])).rejects.toThrow(
        /Too many breakpoints/,
      );
      expect(session.requestedBreakpoints()).toEqual([A]);
      expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    });
  });
```

In `src/__tests__/unit/debugger/handlers.test.ts`, `a start that catches at once still answers its breakpoints under terse` scripts the answer as the system gives it (the refusal first, every row with its tag) and asks for two lines of a neutral class (import `rowsXml` from `./fakes`, and `okResponse` if the file does not import it yet):

```ts
  it('a start that catches at once still answers its breakpoints under terse', async () => {
    const { world, context } = install();
    // As the system answers (on premise (2026-10-11), BASIS 816): the refused row first, each row with its tag.
    world.breakpointAnswers.push(() =>
      okResponse(
        rowsXml([
          {
            kind: 'line',
            clientId: 'bp2',
            error: 'Cannot create a breakpoint at this position',
          },
          {
            kind: 'line',
            id: 'L32',
            clientId: 'bp1',
            uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=32',
          },
        ]),
      ),
    );
    const started = handleDebugStartListener(context as any, {
      breakpoints: [
        { object_type: 'CLAS', object_name: 'class_a', line: 32 },
        { object_type: 'CLAS', object_name: 'class_a', line: 1 },
      ],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    const answer = json(await started);
    expect(answer.state).toBe('stopped');
    expect(answer.breakpoints.placed).toHaveLength(1);
    expect(answer.breakpoints.refused).toEqual([
      {
        requested: {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=1',
        },
        error: 'Cannot create a breakpoint at this position',
      },
    ]);
    expect(answer.breakpoints.unexpected).toEqual([]);
  });
```

The same file's test whose override answers `E1` and `S1` without tags (the one asserting that `r.placed` names `CX_A`, `WRITE` and the condition) stays as it is: those rows are unexpected, and an unexpected placed row is still in `placed`.

The default answer is now the conforming echo, so the placed id a start's rollback deletes is the fake's `ID1`, not the recorded one: in `DebugSession.test.ts`, `a refused start undoes the breakpoints it armed`, and in `DebugSessionLifecycle.test.ts`, `stop releases the debuggee, deletes breakpoints, stops the listener, closes every connection once`, `c.startsWith('deleteBreakpoint:KIND=0.')` becomes `c === 'deleteBreakpoint:ID1'` (Task 4 then replaces both expectations with the `stopListener` cleanup). Add `src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts` to this step's run.

- [ ] **Step 3: Run them and see them fail**

```bash
npx jest src/__tests__/unit/debugger/arming.test.ts src/__tests__/unit/debugger/DebugSession.test.ts src/__tests__/unit/debugger/handlers.test.ts src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts
```

Expected: `arming.ts` does not exist; `requestedBreakpoints` and `unexpected` are unknown; `world.sent` carries no `clientId`.

- [ ] **Step 4: Implement `arming.ts`**

```ts
/**
 * A debug session's breakpoints as one set. `setBreakpoints` without
 * `syncScope` replaces the key's whole set — a `validationOnly` request too
 * (measured on premise (2026-10-11), BASIS 816) — so every change sends the
 * definitions kept so far with the new ones.
 *
 * Each definition carries a tag of the session's, sent as its `clientId`. The
 * system echoes the tag on every answer row, placed and refused alike, answers
 * the rows out of the request's order (the refused ones first) and renumbers
 * the ids (measured on premise (2026-10-11), BASIS 816): the tag is the only
 * thing that pairs a row with its definition. A placed line row also echoes
 * its URI, possibly rewritten, and its condition; neither is used to pair. A
 * row that carries no tag of the request is reported, never paired by guess.
 */
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import { type BreakpointReading, breakpointKey } from './readings';

/** A definition as the caller gave it, with the session's tag for it. */
export interface RequestedBreakpoint {
  /** `bp` and the session's counter: never reused within a session instance. */
  clientId: string;
  definition: IDebuggerBreakpoint;
}

/** A definition the system did not place, with the reason its row gave. */
export interface BreakpointNotPlaced {
  requested: IDebuggerBreakpoint;
  error?: string;
}

/**
 * An answer row no definition of the request pairs with: no tag, a tag this
 * request did not send, or a second row for a tag already answered. A
 * conforming system sends none.
 */
export interface UnexpectedRow {
  kind: string;
  id?: string;
  clientId?: string;
  error?: string;
}

/** Kind, target and condition: what makes two definitions the same. */
export function definitionKey(b: IDebuggerBreakpoint): string {
  const condition = b.kind === 'line' ? (b.condition ?? '') : '';
  return `${breakpointKey(b)}|${condition}`;
}

/**
 * The kept definitions with their tags, then each new one with the next tag;
 * each definition once. `nextTag` is called only for a definition not kept.
 */
export function mergeDefinitions(
  kept: readonly RequestedBreakpoint[],
  added: readonly IDebuggerBreakpoint[],
  nextTag: () => string,
): RequestedBreakpoint[] {
  const merged = new Map<string, RequestedBreakpoint>();
  for (const r of kept) {
    const key = definitionKey(r.definition);
    if (!merged.has(key)) merged.set(key, r);
  }
  for (const b of added) {
    const key = definitionKey(b);
    if (!merged.has(key)) merged.set(key, { clientId: nextTag(), definition: b });
  }
  return [...merged.values()];
}

/**
 * The row as it is sent: the definition with the session's tag. The tag is
 * set last, so a `clientId` the definition brought never goes out.
 */
export function wireOf(r: RequestedBreakpoint): IDebuggerBreakpoint {
  return { ...r.definition, clientId: r.clientId };
}

export interface Pairing {
  /** The definitions placed, with their tags: what the next change sends again. */
  requested: RequestedBreakpoint[];
  /** A paired placed row's id → its definition's tag. */
  paired: Map<string, string>;
  /** Every placed row of the answer, an unexpected one included: the system holds it. */
  placed: BreakpointReading[];
  /** New definitions not placed. */
  refused: BreakpointNotPlaced[];
  /** Earlier definitions not placed any more. */
  lost: BreakpointNotPlaced[];
  /** Rows that pair with no definition. */
  unexpected: UnexpectedRow[];
}

/**
 * Pairs the rows of one answer with the definitions sent, by the echoed tag
 * alone. A row answers the definition its tag names: placed with an id,
 * refused without one. A definition no row answers was not placed, without a
 * reason. A row that pairs with nothing is `unexpected`; a placed one of them
 * is still in `placed`, because the system holds it under the key.
 */
export function pairRows(
  sent: readonly RequestedBreakpoint[],
  earlier: ReadonlySet<string>,
  rows: readonly BreakpointReading[],
): Pairing {
  const byTag = new Map(sent.map((r) => [r.clientId, r]));
  const answered = new Map<string, BreakpointReading>();
  const result: Pairing = {
    requested: [],
    paired: new Map(),
    placed: rows.filter((r) => r.id),
    refused: [],
    lost: [],
    unexpected: [],
  };
  for (const row of rows) {
    const tag = row.clientId;
    if (tag === undefined || !byTag.has(tag) || answered.has(tag)) {
      result.unexpected.push({
        kind: row.kind,
        ...(row.id ? { id: row.id } : {}),
        ...(tag !== undefined ? { clientId: tag } : {}),
        ...(row.error ? { error: row.error } : {}),
      });
      continue;
    }
    answered.set(tag, row);
  }
  for (const r of sent) {
    const row = answered.get(r.clientId);
    if (row?.id) {
      result.requested.push(r);
      result.paired.set(row.id, r.clientId);
      continue;
    }
    const entry: BreakpointNotPlaced = row?.error
      ? { requested: r.definition, error: row.error }
      : { requested: r.definition };
    (earlier.has(r.clientId) ? result.lost : result.refused).push(entry);
  }
  return result;
}
```

- [ ] **Step 5: Implement the session side**

`DebugSession.ts` — import `type BreakpointNotPlaced, mergeDefinitions, pairRows, type RequestedBreakpoint, type UnexpectedRow, wireOf` from `./arming`. `BreakpointsAnswer`:

```ts
export interface BreakpointsAnswer {
  /** The full resulting set, the surviving earlier breakpoints included. */
  placed: BreakpointReading[];
  /** This call's definitions the system did not place, each with the reason its row gave. */
  refused: BreakpointNotPlaced[];
  /** Earlier definitions no longer placed. */
  lost: BreakpointNotPlaced[];
  /** Answer rows that pair with no definition sent; a conforming system answers none. */
  unexpected: UnexpectedRow[];
}
```

Fields beside `armed`:

```ts
  /** The breakpoint definitions as the callers gave them, deduplicated and tagged: what every change sends again. */
  protected requested: RequestedBreakpoint[] = [];
  /** A paired placed row's id → its definition's tag. */
  protected readonly pairedWith = new Map<string, string>();
  /** The last tag handed out. Never reset — not by a stop, not by a new start — so a tag is never reused. */
  private tags = 0;
```

and the tag source:

```ts
  /** `bp` and the next count: short, `[a-z0-9]` only, unique within the instance. */
  private nextTag(): string {
    this.tags += 1;
    return `bp${this.tags}`;
  }
```

`armLocked`, the whole method:

```ts
  /**
   * Inside the serial: the kept definitions and the new ones, sent as one set
   * (it replaces the key's set), each with its tag. No validationOnly request
   * is ever made: it replaces the set as well. A failed replacement keeps both
   * lists, and the next change sends them again.
   */
  private async armLocked(
    added: readonly IDebuggerBreakpoint[],
  ): Promise<DebugView<BreakpointsAnswer>> {
    const identity = this.requireIdentity();
    const dbg = await this.controlDebugger();
    const earlier = new Set(this.requested.map((r) => r.clientId));
    const sent = mergeDefinitions(this.requested, added, () => this.nextTag());
    this.changed = true;
    const answer = await dbg.setBreakpoints(identity, sent.map(wireOf));
    if (!answer.ok) throw new DebugRequestError(messageOf(answer));
    const raw = bodyOf(answer);
    const pairing = pairRows(sent, earlier, readBreakpoints(raw));
    this.armed.clear();
    for (const row of pairing.placed) this.armed.set(row.id!, row);
    this.requested = pairing.requested;
    this.pairedWith.clear();
    for (const [id, tag] of pairing.paired) this.pairedWith.set(id, tag);
    return {
      value: {
        placed: pairing.placed,
        refused: pairing.refused,
        lost: pairing.lost,
        unexpected: pairing.unexpected,
      },
      raw,
    };
  }
```

`deleteBreakpoint`, `forget`, `requestedBreakpoints`:

```ts
  /**
   * By id: the breakpoint leaves both lists, and nothing else is sent. Refused
   * before the wire for an id this session does not hold: sent, it would change
   * nothing in `requested`, and the next change would arm it again.
   */
  deleteBreakpoint(id: string): Promise<void> {
    return this.mutate(async () => {
      if (!this.armed.has(id))
        throw new DebugRefusedError(
          `no breakpoint ${id} is armed in this debug session`,
        );
      const answer = await (await this.controlDebugger()).deleteBreakpoint(
        this.requireIdentity(),
        id,
      );
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      this.forget(id);
    });
  }

  /** The row leaves `armed`, and the definition its tag pairs it with leaves `requested`. */
  private forget(id: string): void {
    this.armed.delete(id);
    const tag = this.pairedWith.get(id);
    this.pairedWith.delete(id);
    if (tag !== undefined)
      this.requested = this.requested.filter((r) => r.clientId !== tag);
  }

  /** The definitions every change sends again, as the callers gave them. */
  requestedBreakpoints(): IDebuggerBreakpoint[] {
    return this.requested.map((r) => r.definition);
  }
```

In `undoArmed` and in `stop`'s per-id loop, `this.armed.delete(...)` after a successful delete becomes `this.forget(...)`. Remove the now-unused `asFailure` import only if the compiler says so (it is still used by the rollback). `listBreakpoints()` stays `[...this.armed.values()]`.

- [ ] **Step 6: Run the tests and the gate**

```bash
npx jest src/__tests__/unit/debugger/arming.test.ts src/__tests__/unit/debugger/DebugSession.test.ts src/__tests__/unit/debugger/handlers.test.ts
npm run lint && npm run build && npm run test:check && npm run lint:check
npx jest src/__tests__/unit/debugger compact/src/__tests__/compactDebug.test.ts
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/debugger src/__tests__/unit/debugger
git diff --cached --stat
git commit -m "$(cat <<'EOF'
fix(debugger): breakpoints are armed as one set — a second DebugSetBreakpoints no longer wipes the first

setBreakpoints replaces the key's whole set, validationOnly included, so the
session keeps the definitions it was given and sends them with every change.
Each definition carries a tag of the session's (bp and a counter, never
reused), sent as its clientId; the system echoes it on every answer row,
placed and refused, out of the request's order, so each row pairs with its
definition by the tag. A row that pairs with nothing is reported as
unexpected, and a placed one stays armed; an earlier breakpoint no longer
placed is lost. A delete by an unknown id is refused before the wire.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 4: Stop and a failed start — `stopListener` is the authoritative cleanup; the identity lives until the cleanup is complete

**Files:**
- Modify: `src/lib/debugger/DebugSession.ts` (`cleanupLocked`, `settle`, `stop`, `start`'s catch and refusal, `holdsState`, `preferredSettings`; remove `releaseLocked` and `undoArmed`)
- Create: `src/__tests__/unit/debugger/DebugSessionCleanup.test.ts`
- Modify: `src/__tests__/unit/debugger/DebugSession.test.ts`, `src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts`, `src/__tests__/unit/debugger/handlers.test.ts`

**Interfaces:**
- Consumes: `forget(id)`, `requested`, `pairedWith` (Task 3); `fixed`, `changed`, `preferences` (Task 2).
- Produces: `private cleanupLocked(): Promise<string[]>` (never throws); `private settle(failures: string[]): void`; `preferredSettings(): DebugSettings`; `start` refuses with `DebugStateError('the cleanup of this debug session is not complete: DebugStop it, then start again')` while an identity is kept; `holdsState()` is true while `changed` or an identity is held.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/unit/debugger/DebugSessionCleanup.test.ts`:

```ts
import {
  DebugCleanupError,
  DebugSession,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  CONFLICT,
  CONFLICT_409,
  fakeWorld,
  IDS,
  LISTEN_NOTHING,
  rowsXml,
  until,
} from './fakes';

const A = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
} as const;
const EXC = { kind: 'exception', exceptionClass: 'CX_A' } as const;
// The session's tags: A is the first definition it was given, EXC the second.
const ROWS = () =>
  okResponse(
    rowsXml([
      { kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri },
      { kind: 'exception', id: 'E1', clientId: 'bp2', exceptionClass: 'CX_A' },
    ]),
  );
const NOT_COMPLETE =
  'the cleanup of this debug session is not complete: DebugStop it, then start again';

describe('the cleanup', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function armed(
    world = fakeWorld(),
    start: Parameters<DebugSession['start']>[1] = {},
  ) {
    world.breakpointAnswers.push(ROWS);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A, EXC], ...start });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    return { session, world };
  }

  it('after a successful stopListener both lists are empty, nothing is deleted by id, and earlier per-id failures are gone', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async () =>
      refusedResponse('Breakpoint is locked');
    await expect(session.stop()).rejects.toThrow(
      /listener: listener busy; breakpoint L10: Breakpoint is locked; breakpoint E1: Breakpoint is locked/,
    );
    delete world.override.stopListener;
    delete world.override.deleteBreakpoint;
    world.calls.length = 0;
    await session.stop();
    expect(world.calls).toContain('stopListener');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    expect(session.listBreakpoints()).toEqual([]);
    expect(session.requestedBreakpoints()).toEqual([]);
    expect(session.failures()).toEqual([]);
    expect(session.holdsState()).toBe(false);
  });

  it('after a failed stopListener the per-id deletes run, and what fails stays for the next stop', async () => {
    const world = fakeWorld();
    const { session } = await armed(world);
    world.override.stopListener = async () => refusedResponse('listener busy');
    world.override.deleteBreakpoint = async (_i: unknown, id: string) =>
      id === 'E1'
        ? refusedResponse('Breakpoint is locked')
        : okResponse(undefined);
    await expect(session.stop()).rejects.toThrow(DebugCleanupError);
    expect(session.listBreakpoints().map((r) => r.id)).toEqual(['E1']);
    expect(session.requestedBreakpoints()).toEqual([EXC]);
    expect(session.failures()).toEqual([
      'listener: listener busy',
      'breakpoint E1: Breakpoint is locked',
    ]);
    expect(session.holdsState()).toBe(true);
  });

  it('a start that failed after a change runs the same cleanup: stopListener, no deletion by id', async () => {
    const world = fakeWorld();
    world.breakpointAnswers.push(ROWS);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A, EXC] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(CONFLICT());
    await expect(s).rejects.toThrow(/SY 530/);
    expect(world.calls).toContain('stopListener');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    expect(session.listBreakpoints()).toEqual([]);
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  });

  it('a start refused by the preflight 409, or before the wire, sends no stopListener and no deletion', async () => {
    const world = fakeWorld();
    world.checkAnswers.push(CONFLICT_409);
    const held = new DebugSession(
      world.ports,
      { ...IDS, stated: true },
      { breakpointConflict: 'refuse-if-held' },
    ).bind('origin');
    await expect(held.start('refuse', { breakpoints: [A] })).rejects.toThrow(
      /global debugging scope/,
    );
    const terminal = new DebugSession(world.ports, IDS).bind('origin');
    await expect(
      terminal.start('refuse', { debuggingMode: 'terminal' }),
    ).rejects.toThrow('terminal mode: no terminal id is configured');
    expect(world.calls).toEqual(['checkListener']);
  });

  it('a close that fails during a refusal before any change keeps the identity; a new start is refused; DebugStop completes the cleanup and a start is accepted', async () => {
    const world = fakeWorld();
    world.checkAnswers.push(CONFLICT_409);
    const realClose = world.ports.closeConnection;
    let once = true;
    world.ports.closeConnection = async (c) => {
      if (once) {
        once = false;
        throw new Error('close refused');
      }
      return realClose(c);
    };
    const session = new DebugSession(
      world.ports,
      { ...IDS, stated: true },
      { breakpointConflict: 'refuse-if-held' },
    ).bind('origin');
    await expect(
      session.start('refuse', {
        requestUser: 'SAPUSER02',
        settings: { systemDebugging: true },
        breakpoints: [A],
      }),
    ).rejects.toThrow(/global debugging scope.*not closed: .*close refused/);
    expect(world.calls).not.toContain('stopListener');
    expect(session.currentIdentity()).toMatchObject({
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    expect(session.preferredSettings()).toEqual({ systemDebugging: true });
    expect(session.holdsState()).toBe(true);
    await expect(session.start('refuse', { breakpoints: [A] })).rejects.toThrow(
      NOT_COMPLETE,
    );
    await session.stop();
    expect(session.currentIdentity()).toBeUndefined();
    expect(session.preferredSettings()).toEqual({});
    expect(session.holdsState()).toBe(false);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
    world.breakpointAnswers.push(ROWS);
    const again = session.start('refuse', { breakpoints: [A, EXC] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await expect(again).resolves.toBeDefined();
    expect(session.currentIdentity()).toMatchObject({ debuggingMode: 'user' });
  });

  it('a failed stop keeps the identity and the settings; a new start is refused; the retry addresses the same key; a complete one clears them', async () => {
    const world = fakeWorld();
    const { session } = await armed(world, {
      requestUser: 'SAPUSER02',
      settings: { systemDebugging: true },
    });
    world.override.stopListener = async () => refusedResponse('listener busy');
    await expect(session.stop()).rejects.toThrow(/listener busy/);
    expect(session.currentIdentity()).toMatchObject({
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    expect(session.preferredSettings()).toEqual({ systemDebugging: true });
    await expect(
      session.start('refuse', { requestUser: 'SAPUSER03' }),
    ).rejects.toThrow(DebugStateError);
    delete world.override.stopListener;
    world.log.length = 0;
    await session.stop();
    expect(
      world.log.find((c) => c.call === 'stopListener')!.args[0],
    ).toMatchObject({ requestUser: 'SAPUSER02' });
    expect(session.currentIdentity()).toBeUndefined();
    expect(session.preferredSettings()).toEqual({});
  });

  // Review Focus 3.
  it('a listener the system drops while nothing is armed still holds the state: the stopListener is owed', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(CONFLICT_409()); // taken over by another IDE
    await until(() => world.closed.length === 1);
    await expect(session.wait(0)).rejects.toThrow(/global debugging scope/);
    expect(session.holdsState()).toBe(true);
    await expect(session.start('refuse')).rejects.toThrow(NOT_COMPLETE);
    await session.stop();
    expect(world.calls).toContain('stopListener');
    expect(session.holdsState()).toBe(false);
  });

  it("another user without authorisation: SAP's 403 reaches the caller as it said it, and the state stays held for DebugStop", async () => {
    const world = fakeWorld();
    const NO_AUTH = 'No authorization to debug the requests of SAPUSER02';
    world.breakpointAnswers.push(() => refusedResponse(NO_AUTH));
    world.override.stopListener = async () => refusedResponse(NO_AUTH);
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const error = await session
      .start('refuse', { requestUser: 'SAPUSER02', breakpoints: [A] })
      .catch((e: unknown) => e);
    expect((error as Error).message).toBe(
      `${NO_AUTH}; not undone: listener: ${NO_AUTH}`,
    );
    expect(session.holdsState()).toBe(true);
    expect(session.currentIdentity()).toMatchObject({
      requestUser: 'SAPUSER02',
    });
  });

  it('a listener for another request user never reuses a connection that served another identity', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const first = session.start('refuse', {
      requestUser: 'SAPUSER02',
      breakpoints: [A],
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await first;
    await session.stop();
    const served = new Set(world.log.map((c) => c.connection));
    world.log.length = 0;
    const second = session.start('refuse', {
      requestUser: 'SAPUSER03',
      breakpoints: [A],
    });
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_NOTHING());
    await second;
    expect(world.log.length).toBeGreaterThan(0);
    for (const c of world.log) expect(served.has(c.connection)).toBe(false);
  });

  // Pins Task 3's counter across the cleanup: it passes once Task 3 is in, and fails if the cleanup resets it.
  it('a tag is never reused: the cleanup empties the lists, not the counter', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const first = session.start('refuse', { breakpoints: [A] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await first;
    await session.stop();
    expect(session.requestedBreakpoints()).toEqual([]);
    const second = session.start('refuse', { breakpoints: [A] });
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_NOTHING());
    await second;
    expect(world.sent.map((l) => l.map((b: any) => b.clientId))).toEqual([
      ['bp1'],
      ['bp2'],
    ]);
    expect(session.requestedBreakpoints()).toEqual([A]);
  });
});
```

Update the existing tests whose expectation was the 17.2 rollback by id:

- `DebugSession.test.ts`, `a refused start undoes the breakpoints it armed` — replace its two expectations on `deleteBreakpoint` with:

  ```ts
    expect(world.calls).toContain('stopListener');
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    expect(session.listBreakpoints()).toEqual([]);
    expect(new Set(world.closed)).toEqual(new Set(world.opened));
  ```
- `DebugSession.test.ts`, `a rollback step that throws does not skip the next` — its last expectation becomes `expect(world.calls).toContain('stopListener');`.
- `DebugSession.test.ts`, `a refused start reports the breakpoint it could not delete, and keeps it armed` — add `world.override.stopListener = async () => refusedResponse('listener busy');` beside the `deleteBreakpoint` override, and the message expectation becomes `/not undone: listener: listener busy; breakpoint .*: Breakpoint is locked/`.
- `DebugSessionLifecycle.test.ts`, `stop releases the debuggee, deletes breakpoints, stops the listener, closes every connection once` — rename to `stop releases the debuggee, stops the listener (which deletes the key's breakpoints), closes every connection once`; the `deleteBreakpoint` expectation becomes:

  ```ts
    expect(world.calls.some((c) => c.startsWith('deleteBreakpoint:'))).toBe(
      false,
    );
    expect(session.listBreakpoints()).toEqual([]);
  ```
- `DebugSessionLifecycle.test.ts`, `a cleanup that fails is reported, and what failed stays to retry` — add `world.override.stopListener = async () => refusedResponse('listener busy');` before the first stop and `delete world.override.stopListener;` beside `delete world.override.deleteBreakpoint;`.
- `handlers.test.ts`, `a refused start that could not undo everything answers the handle with its error, so the model can stop it` — add `world.override.stopListener = async () => CONFLICT();` beside the `deleteBreakpoint` override and `delete world.override.stopListener;` before `handleDebugStop`.

- [ ] **Step 2: Run them and see them fail**

```bash
npx jest src/__tests__/unit/debugger/DebugSessionCleanup.test.ts src/__tests__/unit/debugger/DebugSession.test.ts src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts src/__tests__/unit/debugger/handlers.test.ts
```

Expected: `preferredSettings` unknown; the stop still deletes by id before `stopListener`; a dropped listener answers `holdsState() === false`; a second start is not refused. The tag test passes already (Task 3's counter); it guards the cleanup written in Step 3.

- [ ] **Step 3: Implement**

Remove `releaseLocked` and `undoArmed`. Add:

```ts
  /** The settings the caller set, kept until a complete cleanup. */
  preferredSettings(): DebugSettings {
    return { ...this.preferences };
  }

  /**
   * Inside the serial: everything off — DebugStop, a start that failed after a
   * change, dispose, shutdown. stopListener deletes the key's breakpoints
   * (measured on premise (2026-10-11), BASIS 816), so it is the authoritative
   * cleanup: only when it fails are the breakpoints deleted by id. Never
   * throws; answers what it could not undo, which stays for the next stop.
   */
  private async cleanupLocked(): Promise<string[]> {
    this.generation++;
    const failures: string[] = [];
    try {
      for (const connection of [...this.unclosed])
        await this.closeOrKeep(connection, 'a connection', failures);
      for (const owed of [...this.owed]) {
        const notReleased = await this.release(owed.debugger);
        if (notReleased) {
          failures.push(`${owed.what}: ${notReleased}`); // kept: a later stop retries
          continue;
        }
        // Released: only its connection may be left, and a retry must not release twice.
        this.owed.delete(owed);
        await this.closeOrKeep(
          owed.connection,
          `${owed.what}'s connection`,
          failures,
        );
      }
      // 1. A held stop is released.
      const stop = this.current;
      if (stop) {
        const released = await stop.debugger
          .step('stepContinue', { analyse: analyseDebuggeeEnd })
          .catch(asFailure);
        if (released.ok) {
          // Released: only its connection may be left, and a retry must not release twice.
          this.current = undefined;
          await this.closeOrKeep(
            stop.connection,
            "the debuggee's connection",
            failures,
          );
        } else {
          failures.push(`release the debuggee: ${messageOf(released)}`); // kept: a later stop retries
        }
      }
      // 2. The listener is stopped, and the key's breakpoints with it.
      if (this.changed) {
        const identity = this.requireIdentity();
        const control = await this.controlDebugger();
        const listener = this.listener;
        const open = listener?.open; // taken before the stop: its answer may come at once
        const stopped = await control.stopListener(identity).catch(asFailure);
        if (stopped.ok) {
          // 3. Nothing is left to delete by id, and no per-id failure of an earlier stop stands.
          // The tag counter stays: a tag is never reused in this instance.
          this.armed.clear();
          this.requested = [];
          this.pairedWith.clear();
          this.changed = false;
          this.listener = undefined;
          if (listener) {
            // Accepted is not done: SAP lets go of the user's listener when it answers the
            // open poll (130–570 ms after the stop, at most the poll's hold, measured on
            // premise 2026-10-11). Until then a start of another ideId meets 409
            // conflictDetected, so the stop returns only after that answer.
            if (open) {
              const last = await open;
              listener.open = undefined;
              if (!last.ok)
                failures.push(`the listener's last poll: ${messageOf(last)}`);
              else {
                // A catch in it — during the stop, or just before and not yet handled.
                const caught = readDebuggee(bodyOf(last));
                if (caught) await this.releaseCaught(caught, failures);
              }
            }
            await this.closeOrKeep(
              listener.connection,
              "the listener's connection",
              failures,
            );
          }
        } else {
          // 4. Deleted by id, as before; what fails stays for the next stop.
          failures.push(`listener: ${messageOf(stopped)}`);
          for (const id of [...this.armed.keys()]) {
            const deleted = await control
              .deleteBreakpoint(identity, id)
              .catch(asFailure);
            if (deleted.ok) this.forget(id);
            else failures.push(`breakpoint ${id}: ${messageOf(deleted)}`);
          }
        }
      }
      if (!failures.length && this.control) {
        const control = this.control;
        this.control = undefined;
        await this.closeOrKeep(
          control.connection,
          "the breakpoints' connection",
          failures,
        );
      }
    } catch (error) {
      failures.push(thrown(error));
    } finally {
      const run = this.run;
      this.run = undefined;
      await this.closeOrKeep(run?.connection, "the run's connection", failures);
    }
    return failures;
  }

  /**
   * What the cleanup could not undo stays named for the next stop. The
   * identity — the request user, the mode — and the settings go only with a
   * complete cleanup: while anything is kept, a retry addresses the same key.
   */
  private settle(failures: string[]): void {
    this.cleanupFailures = failures;
    if (failures.length > 0) return;
    this.fixed = undefined;
    this.changed = false;
    this.preferences = {};
  }
```

`stop` becomes:

```ts
  /**
   * Everything off — DebugStop, dispose, shutdown. Required, not best effort.
   * Never throws anything but DebugCleanupError, and whatever failed stays for the next stop.
   */
  stop(): Promise<void> {
    return this.mutate(async () => {
      const failures = await this.cleanupLocked();
      this.failure = undefined;
      this.notices.length = 0;
      this.settle(failures);
      this.notify(); // also tells the instance state (observe) that this part may hold nothing now
      if (failures.length) throw new DebugCleanupError(failures.join('; '));
    });
  }
```

`start`: right after the `listener || current` refusal,

```ts
      if (this.fixed)
        throw new DebugStateError(
          'the cleanup of this debug session is not complete: DebugStop it, then start again',
        );
```

remove `before` and `placedHere`, and make the refused-before-any-change branch (Task 2's `if (!this.changed)` block) settle like every other cleanup path — its two lines `this.fixed = undefined; this.preferences = {};` and the conditional clearing Task 2 wrote become one call, so the identity and the settings are cleared only when the connections this start opened all closed:

```ts
        if (!this.changed) {
          // Refused before any change: no stopListener and no deletion — only the
          // connections this start opened close. A close that fails is kept like any
          // other cleanup failure: the identity stays, a new start is refused, DebugStop finishes it.
          const failures = [
            ...(await this.dropListener()),
            ...(await this.closeControl()),
          ];
          this.settle(failures);
          if (failures.length === 0) throw error;
          const notClosed = `not closed: ${failures.join('; ')}`;
          if (error instanceof Error) {
            error.message = `${error.message}; ${notClosed}`;
            throw error;
          }
          throw new DebugListenerError(`${thrown(error)}; ${notClosed}`);
        }
```

and replace the after-change branch of the catch (everything below the `if (!this.changed) { … }` block) with:

```ts
        // A start that failed after a change runs the stop's cleanup. It no longer
        // deletes the ids "placed here": after a replacement they do not say what this
        // start added.
        const failures = await this.cleanupLocked();
        this.failure = undefined;
        this.notices.length = 0;
        this.settle(failures);
        if (failures.length === 0) throw error;
        const notUndone = `not undone: ${failures.join('; ')}`;
        if (error instanceof Error) {
          error.message = `${error.message}; ${notUndone}`;
          throw error;
        }
        throw new DebugListenerError(`${thrown(error)}; ${notUndone}`);
```

`holdsState` gains the owed cleanup:

```ts
  holdsState(): boolean {
    return (
      !!this.listener ||
      !!this.current ||
      this.armed.size > 0 ||
      // An identity is held, or a stopListener is owed: only a cleanup ends them.
      this.changed ||
      this.fixed !== undefined ||
      this.notices.length > 0 ||
      !!this.run ||
      this.failure !== undefined ||
      this.cleanupFailures.length > 0 ||
      this.unclosed.size > 0 ||
      this.owed.size > 0
    );
  }
```

- [ ] **Step 4: Run the tests and the gate**

```bash
npx jest src/__tests__/unit/debugger/DebugSessionCleanup.test.ts src/__tests__/unit/debugger/DebugSession.test.ts src/__tests__/unit/debugger/DebugSessionLifecycle.test.ts src/__tests__/unit/debugger/handlers.test.ts src/__tests__/unit/debugger/DebugSessionStart.test.ts
npm run lint && npm run build && npm run test:check && npm run lint:check
npx jest src/__tests__/unit/debugger compact/src/__tests__/compactDebug.test.ts
```

Expected: green. If a test outside the list above asserted a deletion by id at a stop or a start's rollback, it follows the same rule: the deletion became `stopListener`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/debugger/DebugSession.ts src/__tests__/unit/debugger
git diff --cached --stat
git commit -m "$(cat <<'EOF'
fix(debugger): stopListener is the authoritative cleanup; the identity stays until the cleanup is complete

A stop releases a held stop, then stops the listener, which deletes the key's
breakpoints; only a failed stopListener falls back to deleting by id. A start
that failed after a change runs the same cleanup. The identity, request user,
mode and settings are cleared only by a complete cleanup, a new start is
refused until then, and a dropped listener keeps the state held while its
stopListener is owed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 5: `detach` and `release_debugger` — the debuggee runs on, the session listens on

**Files:**
- Modify: `src/lib/debugger/DebugSession.ts` (`DebugSessionPorts.dropConnection`, `detach`, `releaseDebugger`, `leaveStop`)
- Modify: `src/lib/debugger/ports.ts` (`liveDebugPorts().dropConnection`)
- Modify: `src/__tests__/unit/debugger/fakes.ts` (`detachDebugger`, `terminateDebugger`, `dropConnection`, `dropped`)
- Create: `src/__tests__/unit/debugger/DebugSessionLeave.test.ts`
- Modify: `src/__tests__/unit/debugger/methodShapes.test.ts`

**Interfaces:**
- Consumes: `detachDebugger(options?)`, `terminateDebugger({ analyse })` (adt-clients 29); `analyseDebuggerFreed` (adt-strategies 0.10.0).
- Produces: `DebugSessionPorts.dropConnection(connection: IAbapConnection): void` (required — an embedder's own ports must add it); `DebugSession.detach(): Promise<DebugState>`; `DebugSession.releaseDebugger(): Promise<DebugState>`; both answer the listening state, and throw `DebugStateError` without a stop, `DebugRequestError` on a refusal (the stop kept).

- [ ] **Step 1: Extend the fakes**

`fakes.ts` — import `analyseDebuggerFreed` from `@mcp-abap-adt/adt-strategies`. Members:

```ts
        detachDebugger: async () => {
          calls.push('detachDebugger');
          return DONE();
        },
        terminateDebugger: async (o: any) => {
          calls.push(
            `terminateDebugger:${o?.analyse === analyseDebuggerFreed ? 'freed' : 'other'}`,
          );
          return DONE();
        },
```

Port: `dropConnection: (c) => { dropped.push(c); },` with `const dropped: IAbapConnection[] = [];` returned from `fakeWorld`.

- [ ] **Step 2: Write the failing tests**

Create `src/__tests__/unit/debugger/DebugSessionLeave.test.ts`:

```ts
import {
  DebugRequestError,
  DebugSession,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  rowsXml,
  until,
} from './fakes';

const A = {
  kind: 'line',
  uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=10',
} as const;
const idOf = (c: unknown) => (c as { id: number }).id;

describe('leaving a debuggee running', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function stoppedWith(world = fakeWorld()) {
    world.breakpointAnswers.push(() =>
      okResponse(
        rowsXml([{ kind: 'line', id: 'L10', clientId: 'bp1', uri: A.uri }]),
      ),
    );
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { breakpoints: [A] });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    // opened: the control connection, the listener's, the attach's
    return { session, world, debuggee: world.opened[2] };
  }

  it('detach: the debugger leaves, its connection closes, and the session listens on with its breakpoints', async () => {
    const { session, world, debuggee } = await stoppedWith();
    await expect(session.detach()).resolves.toEqual({ state: 'listening' });
    expect(world.calls).toContain('detachDebugger');
    expect(world.closed).toContain(debuggee);
    expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    expect(session.requestedBreakpoints()).toEqual([A]);
    await until(() => world.polls.length === 3); // polling resumed
    expect(session.holdsState()).toBe(true);
  });

  it('a catch after detach is attached again', async () => {
    const { session, world } = await stoppedWith();
    await session.detach();
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_CATCH());
    await until(
      () => world.calls.filter((c) => c === 'getStack').length === 2,
    );
    expect((await session.wait(0)).state).toBe('stopped');
  });

  it('release_debugger: read as freed; the freed connection is dropped with no further request and never logged off; the session listens on', async () => {
    const { session, world, debuggee } = await stoppedWith();
    await expect(session.releaseDebugger()).resolves.toEqual({
      state: 'listening',
    });
    expect(world.calls).toContain('terminateDebugger:freed');
    expect(world.dropped).toEqual([debuggee]);
    const onIt = world.log.filter((c) => c.connection === idOf(debuggee));
    expect(onIt[onIt.length - 1].call).toBe('terminateDebugger');
    expect(session.listBreakpoints().map((r) => r.id)).toEqual(['L10']);
    await until(() => world.polls.length === 3);
    await session.stop();
    expect(world.closed).not.toContain(debuggee);
    expect(
      world.log.filter((c) => c.connection === idOf(debuggee)),
    ).toHaveLength(onIt.length);
    expect(session.holdsState()).toBe(false);
  });

  it('a refused release_debugger is a failure, and the stop stays for DebugStop', async () => {
    const world = fakeWorld();
    const { session, debuggee } = await stoppedWith(world);
    world.override.terminateDebugger = async () =>
      refusedResponse('Debugger session is busy');
    await expect(session.releaseDebugger()).rejects.toThrow(
      new DebugRequestError('Debugger session is busy'),
    );
    expect((await session.wait(0)).state).toBe('stopped');
    expect(world.dropped).toEqual([]);
    delete world.override.terminateDebugger;
    await session.stop();
    expect(world.calls).toContain('step:stepContinue:analysed');
    expect(world.closed).toContain(debuggee);
  });

  it('a refused detach is a failure, and the stop stays', async () => {
    const world = fakeWorld();
    const { session } = await stoppedWith(world);
    world.override.detachDebugger = async () =>
      refusedResponse('Debuggee is not attached');
    await expect(session.detach()).rejects.toThrow(DebugRequestError);
    expect((await session.wait(0)).state).toBe('stopped');
  });

  it('without a stop both are refused and send nothing', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await expect(session.detach()).rejects.toThrow(DebugStateError);
    await expect(session.releaseDebugger()).rejects.toThrow(DebugStateError);
    expect(
      world.calls.filter(
        (c) => c === 'detachDebugger' || c.startsWith('terminateDebugger'),
      ),
    ).toEqual([]);
  });
});
```

Append to `methodShapes.test.ts` (import `analyseDebuggerFreed` beside `analyseDebuggeeEnd`):

```ts
/** One wire answer; a status of 400 or more is thrown the way the transport throws it. */
function answering(
  status: number,
  headers: Record<string, string>,
  data: unknown,
): IAbapConnection {
  const wire = { status, statusText: '', headers, data } as IAdtWireResponse;
  return {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest() {
      if (status >= 400)
        throw Object.assign(
          new Error(`Request failed with status code ${status}`),
          { response: wire },
        );
      return wire;
    },
  } as unknown as IAbapConnection;
}

describe('terminateDebugger under analyseDebuggerFreed (errata: the debugger freeing its session is answered as an ICF 500)', () => {
  const free = (status: number, headers: Record<string, string>, data: unknown) =>
    new AbapDebugger(answering(status, headers, data)).terminateDebugger({
      analyse: analyseDebuggerFreed,
    });

  it.each([
    ['a plain 500 served as text/plain', { 'content-type': 'text/plain' }, 'Internal Server Error'],
    ['a plain 500 with an empty body', {}, ''],
  ])('%s is no failure', async (_, headers, data) => {
    expect((await free(500, headers, data)).ok).toBe(true);
  });

  it.each([
    [
      'a 500 carrying an ADT exception document',
      500,
      { 'content-type': 'application/xml' },
      corpusBody('debugger-terminate--01-terminate-debuggee'),
    ],
    [
      'a 500 served as HTML',
      500,
      { 'content-type': 'text/html' },
      '<html><body>Internal Server Error</body></html>',
    ],
    ['a 400', 400, { 'content-type': 'text/plain' }, 'Session no longer exists'],
  ])('%s stays a failure', async (_, status, headers, data) => {
    expect((await free(status, headers, data)).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run them and see them fail**

```bash
npx jest src/__tests__/unit/debugger/DebugSessionLeave.test.ts src/__tests__/unit/debugger/methodShapes.test.ts
```

Expected: `detach` / `releaseDebugger` / `dropConnection` do not exist (the methodShapes cases pass already: they pin the library's strategy, which the session relies on).

- [ ] **Step 4: Implement**

`DebugSessionPorts` gains:

```ts
  /**
   * Forgets a connection whose ABAP session the system freed itself
   * (`terminateDebugger`): nothing more is sent on it, not even a logoff.
   */
  dropConnection(connection: IAbapConnection): void;
```

`ports.ts`, `liveDebugPorts()`:

```ts
    // The system freed this ABAP session itself (terminateDebugger); the next request
    // on it would answer 400, and a logoff is a request. Nothing to send: forget it.
    dropConnection: () => {},
```

`DebugSession.ts` (import `analyseDebuggerFreed` from `@mcp-abap-adt/adt-strategies`), in the stop section:

```ts
  /** The debugger leaves and the program runs on; an armed breakpoint can catch it again. */
  detach(): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      const answer = await stop.debugger.detachDebugger();
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      await this.leaveStop(stop, 'close');
      return this.report();
    });
  }

  /** Frees the debugger; the program runs on, and the session listens on. */
  releaseDebugger(): Promise<DebugState> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      // terminateDebugger frees this ABAP session, and the system answers that with a
      // plain ICF 500 (errata "The debugger freeing its session is answered as an ICF
      // 500", measured on premise (2026-10-11), BASIS 816): analyseDebuggerFreed takes
      // exactly that shape as no failure. An ADT document, an HTML 500 or a 400 stay
      // failures, and the attachment is kept for DebugStop.
      const answer = await stop.debugger.terminateDebugger({
        analyse: analyseDebuggerFreed,
      });
      if (!answer.ok) throw new DebugRequestError(messageOf(answer));
      await this.leaveStop(stop, 'drop');
      return this.report();
    });
  }

  /**
   * Inside the serial: the stop is left — its connection closed (a close that
   * throws is kept and recorded), or, freed by the system, dropped without a
   * request — and the listener polls again. The breakpoints stay.
   */
  private async leaveStop(stop: Stop, how: 'close' | 'drop'): Promise<void> {
    if (this.current !== stop) return;
    this.current = undefined;
    if (how === 'drop') this.ports.dropConnection(stop.connection);
    else await this.closeOrRecord(stop.connection, "the debuggee's connection");
    const listener = this.listener;
    if (listener && this.failure === undefined)
      void this.loop(listener, this.generation);
  }
```

Every other `DebugSessionPorts` literal in the repository gains `dropConnection` (the compiler names them: `fakes.ts` done above; any test that builds ports by hand adds `dropConnection: () => {}`).

- [ ] **Step 5: Run the tests and the gate**

```bash
npx jest src/__tests__/unit/debugger/DebugSessionLeave.test.ts src/__tests__/unit/debugger/methodShapes.test.ts
npm run lint && npm run build && npm run test:check && npm run lint:check
npx jest src/__tests__/unit/debugger compact/src/__tests__/compactDebug.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/debugger/DebugSession.ts src/lib/debugger/ports.ts src/__tests__/unit/debugger
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(debugger): detach and release_debugger — the debuggee runs on and the session listens on

detach lets the debugger leave (an armed breakpoint can catch the run again);
release_debugger frees it with analyseDebuggerFreed, whose plain 500 is no
failure, and the freed connection is dropped without a request or a logoff.
Both keep the listener and the breakpoints; a refusal keeps the stop.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 6: Settings — preferences kept, applied after each attach, the effective ones reported

**Files:**
- Modify: `src/lib/debugger/readings.ts` (`SettingsReading`, `readSettings`, `terseSettings`)
- Modify: `src/lib/debugger/DebugSession.ts` (`StopView.settings`, `StopView.settingsError`, `Stop.settingsSent`, `effective`, `applySettings`, `setSettings`, `settingsInForce`, `attachTo`, `settle`)
- Modify: `src/lib/debugger/answer.ts` (the terse stop)
- Modify: `src/__tests__/unit/debugger/fakes.ts` (`setDebuggerSettings`, `settingsAnswers`, `settingsXml`)
- Create: `src/__tests__/unit/debugger/DebugSessionSettings.test.ts`
- Modify: `src/__tests__/unit/debugger/readings.test.ts`, `src/__tests__/unit/debugger/answer.test.ts`

**Interfaces:**
- Consumes: `setDebuggerSettings(settings: IDebuggerSettings)` answering the `<dbg:settings>` document with six attributes (measured on premise (2026-10-11), BASIS 816).
- Produces: `interface SettingsReading { systemDebugging?: boolean; updateDebugging?: boolean; createExceptionObject?: boolean; backgroundRFC?: boolean; sharedObjectDebugging?: boolean }`; `readSettings(xml: string): SettingsReading`; `terseSettings(r: SettingsReading): { system_debugging?: boolean; update_debugging?: boolean; create_exception_object?: boolean; background_rfc?: boolean; shared_object_debugging?: boolean }`; `DebugSession.setSettings(patch: DebugSettings): Promise<DebugView<SettingsReading>>`; `DebugSession.settingsInForce(): SettingsReading | undefined`; `StopView.settings?: SettingsReading`, `StopView.settingsError?: string`.

- [ ] **Step 1: Extend the fakes**

```ts
/** A settings answer: the six attributes in force (the shape measured on premise (2026-10-11), BASIS 816). */
export const settingsXml = (s: Record<string, boolean | undefined> = {}) => {
  const v = (k: string) => String(s[k] ?? false);
  return `<?xml version="1.0" encoding="utf-8"?><dbg:settings xmlns:dbg="http://www.sap.com/adt/debugger" systemDebugging="${v('systemDebugging')}" createExceptionObject="${v('createExceptionObject')}" backgroundRFC="${v('backgroundRFC')}" sharedObjectDebugging="${v('sharedObjectDebugging')}" showDataAging="false" updateDebugging="${v('updateDebugging')}"/>`;
};
```

and the member (with `const settingsAnswers: Array<() => any> = [];` returned from `fakeWorld`):

```ts
        setDebuggerSettings: async (s: Record<string, boolean>) => {
          calls.push(`settings:${JSON.stringify(s)}`);
          return (settingsAnswers.shift() ?? (() => okResponse(settingsXml(s))))();
        },
```

- [ ] **Step 2: Write the failing tests**

`readings.test.ts`:

```ts
describe('readSettings', () => {
  it('reads the five settings a caller may set; showDataAging is not read', () => {
    expect(
      readSettings(settingsXml({ systemDebugging: true, backgroundRFC: true })),
    ).toEqual({
      systemDebugging: true,
      createExceptionObject: false,
      backgroundRFC: true,
      sharedObjectDebugging: false,
      updateDebugging: false,
    });
  });
  it('an empty answer reads as nothing known', () => {
    expect(readSettings('')).toEqual({});
  });
  it('terse names them as the tools do', () => {
    expect(terseSettings({ systemDebugging: false, backgroundRFC: true })).toEqual({
      system_debugging: false,
      background_rfc: true,
    });
  });
});
```

(imports: `readSettings`, `terseSettings` from `../../../lib/debugger/readings`; `settingsXml` from `./fakes`.)

Create `src/__tests__/unit/debugger/DebugSessionSettings.test.ts`:

```ts
import {
  DebugSession,
  type DebugSettings,
  DebugStateError,
} from '../../../lib/debugger/DebugSession';
import { readSettings } from '../../../lib/debugger/readings';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';
import {
  fakeWorld,
  IDS,
  LISTEN_CATCH,
  LISTEN_NOTHING,
  settingsXml,
  until,
} from './fakes';

const sent = (world: ReturnType<typeof fakeWorld>) =>
  world.calls.filter((c) => c.startsWith('settings:'));

describe('the debugger settings', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function caught(settings?: DebugSettings, world = fakeWorld()) {
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', settings ? { settings } : {});
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await until(() => world.polls.length === 2);
    world.polls[1].resolve(LISTEN_CATCH());
    await until(() => world.calls.includes('getStack'));
    return { session, world };
  }

  it('the preferences are applied after the attach, and the stop reports the settings in force', async () => {
    const { session, world } = await caught({ systemDebugging: true });
    expect(sent(world)).toEqual(['settings:{"systemDebugging":true}']);
    const state = await session.wait(0);
    expect(state.state === 'stopped' && state.stop.settings).toEqual(
      readSettings(settingsXml({ systemDebugging: true })),
    );
  });

  it('no preferences: nothing is sent at an attach', async () => {
    const { world } = await caught();
    expect(sent(world)).toEqual([]);
  });

  it('again after a re-attach: a catch after detach, and after release_debugger', async () => {
    const { session, world } = await caught({ updateDebugging: true });
    await session.detach();
    await until(() => world.polls.length === 3);
    world.polls[2].resolve(LISTEN_CATCH());
    await until(() => sent(world).length === 2);
    await session.releaseDebugger();
    await until(() => world.polls.length === 4);
    world.polls[3].resolve(LISTEN_CATCH());
    await until(() => sent(world).length === 3);
    expect(sent(world)).toEqual(
      Array(3).fill('settings:{"updateDebugging":true}'),
    );
  });

  it('system_debugging false is sent twice after an attach; the reported settings are the second answer', async () => {
    const world = fakeWorld();
    world.settingsAnswers.push(
      () => okResponse(settingsXml({ systemDebugging: true })),
      () => okResponse(settingsXml({ systemDebugging: false })),
    );
    const { session } = await caught({ systemDebugging: false }, world);
    expect(sent(world)).toEqual(
      Array(2).fill('settings:{"systemDebugging":false}'),
    );
    expect(session.settingsInForce()).toMatchObject({ systemDebugging: false });
  });

  it('setSettings merges into the preferences, applies them, and answers the last answer', async () => {
    const { session, world } = await caught({ systemDebugging: true });
    const answer = await session.setSettings({ createExceptionObject: true });
    expect(sent(world).at(-1)).toBe(
      'settings:{"systemDebugging":true,"createExceptionObject":true}',
    );
    expect(answer.value).toEqual(
      readSettings(
        settingsXml({ systemDebugging: true, createExceptionObject: true }),
      ),
    );
    expect(session.preferredSettings()).toEqual({
      systemDebugging: true,
      createExceptionObject: true,
    });
    expect(session.settingsInForce()).toEqual(answer.value);
  });

  it('setSettings as the first call after an attach, with system_debugging false, sends it twice', async () => {
    const { session, world } = await caught();
    await session.setSettings({ systemDebugging: false });
    expect(sent(world)).toEqual(
      Array(2).fill('settings:{"systemDebugging":false}'),
    );
    await session.setSettings({ systemDebugging: false });
    expect(sent(world)).toHaveLength(3);
  });

  it('setSettings without a stop is refused and sends nothing', async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse');
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    await s;
    await expect(
      session.setSettings({ systemDebugging: true }),
    ).rejects.toThrow(DebugStateError);
    expect(sent(world)).toEqual([]);
  });

  // Review Focus 4.
  it("a catch on the start's own first poll gets the preferences", async () => {
    const world = fakeWorld();
    const session = new DebugSession(world.ports, IDS).bind('origin');
    const s = session.start('refuse', { settings: { updateDebugging: true } });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_CATCH());
    const state = await s;
    expect(sent(world)).toEqual(['settings:{"updateDebugging":true}']);
    expect(state.state === 'stopped' && state.stop.settings).toMatchObject({
      updateDebugging: true,
    });
  });

  it('a settings failure at an attach keeps the stop and names the failure', async () => {
    const world = fakeWorld();
    world.settingsAnswers.push(() => refusedResponse('Settings not allowed'));
    const { session } = await caught({ systemDebugging: true }, world);
    const state = await session.wait(0);
    expect(state.state).toBe('stopped');
    expect(state.state === 'stopped' && state.stop.settingsError).toBe(
      'Settings not allowed',
    );
  });
});
```

`answer.test.ts` — a terse stop carries the settings under the tools' names (append inside `describe('debug answers', …)`; it builds its stop from the recorded readings, as the file's last test does):

```ts
  it('a terse stop names the settings in force and a settings failure', async () => {
    const r = await debugStateAnswer({}, async () => ({
      state: 'stopped' as const,
      stop: {
        debuggee: readDebuggee(corpusBody('debugger-run-to-line--02-listen'))!,
        attach: readAttach(corpusBody('debugger-run-to-line--03-attach')),
        stack: readStack(corpusBody('debugger-run-to-line--04-stack')),
        raw: { debuggee: '', attach: '', stack: '' },
        settings: { systemDebugging: true },
        settingsError: 'Settings not allowed',
      },
    }));
    const json = JSON.parse((r.content[0] as { text: string }).text);
    expect(json.settings).toEqual({ system_debugging: true });
    expect(json.settings_error).toBe('Settings not allowed');
  });
```

- [ ] **Step 3: Run them and see them fail**

```bash
npx jest src/__tests__/unit/debugger/DebugSessionSettings.test.ts src/__tests__/unit/debugger/readings.test.ts src/__tests__/unit/debugger/answer.test.ts
```

Expected: `readSettings`, `terseSettings`, `setSettings`, `settingsInForce`, `StopView.settings` unknown.

- [ ] **Step 4: Implement**

`readings.ts`:

```ts
/** The debugger settings in force, as `setDebuggerSettings` answers them; `showDataAging` is not read (not offered). */
export interface SettingsReading {
  systemDebugging?: boolean;
  updateDebugging?: boolean;
  createExceptionObject?: boolean;
  backgroundRFC?: boolean;
  sharedObjectDebugging?: boolean;
}
const SETTINGS = [
  'systemDebugging',
  'updateDebugging',
  'createExceptionObject',
  'backgroundRFC',
  'sharedObjectDebugging',
] as const;

export function readSettings(xml: string): SettingsReading {
  const node: Node = parse(xml)?.settings ?? {};
  const out: SettingsReading = {};
  for (const k of SETTINGS) {
    const v = text(node[k]);
    if (v === 'true' || v === 'false') out[k] = v === 'true';
  }
  return out;
}

/** The settings under the names the tools take them by. */
export function terseSettings(r: SettingsReading) {
  return {
    ...(r.systemDebugging !== undefined ? { system_debugging: r.systemDebugging } : {}),
    ...(r.updateDebugging !== undefined ? { update_debugging: r.updateDebugging } : {}),
    ...(r.createExceptionObject !== undefined
      ? { create_exception_object: r.createExceptionObject }
      : {}),
    ...(r.backgroundRFC !== undefined ? { background_rfc: r.backgroundRFC } : {}),
    ...(r.sharedObjectDebugging !== undefined
      ? { shared_object_debugging: r.sharedObjectDebugging }
      : {}),
  };
}
```

`DebugSession.ts` — import `readSettings, type SettingsReading` from `./readings`. `StopView` gains:

```ts
  /** The settings in force after this attach applied the preferences. */
  settings?: SettingsReading;
  /** Why applying them failed; the stop stands. */
  settingsError?: string;
```

`Stop` gains `/** Whether this attach has had its first setDebuggerSettings. */ settingsSent?: boolean;`. Field: `/** The last answer of setDebuggerSettings. */ protected effective?: SettingsReading;`. Methods:

```ts
  /** The settings in force: the last answer of setDebuggerSettings. */
  settingsInForce(): SettingsReading | undefined {
    return this.effective;
  }

  /** At the current stop: merges into the preferences, applies them, answers the settings in force. */
  setSettings(patch: DebugSettings): Promise<DebugView<SettingsReading>> {
    return this.mutate(async () => {
      const stop = this.requireStop();
      this.preferences = { ...this.preferences, ...patch };
      return this.applySettings(stop);
    });
  }

  /**
   * Sends the preferences at a stop. The first call after an attach ignores
   * systemDebugging=false (server source, BASIS 816, read 2026-10-11), and its
   * answer cannot show it, so then they are sent a second time; what is
   * reported is the last answer.
   */
  private async applySettings(stop: Stop): Promise<DebugView<SettingsReading>> {
    const first = !stop.settingsSent;
    stop.settingsSent = true;
    let answer = await stop.debugger.setDebuggerSettings(this.preferences);
    if (answer.ok && first && this.preferences.systemDebugging === false)
      answer = await stop.debugger.setDebuggerSettings(this.preferences);
    if (!answer.ok) throw new DebugRequestError(messageOf(answer));
    const raw = bodyOf(answer);
    this.effective = readSettings(raw);
    stop.view = { ...stop.view, settings: this.effective, settingsError: undefined };
    return { value: this.effective, raw };
  }
```

In `attachTo`, right after `this.current = { … };` and before `return true;`:

```ts
      // The preferences after each attach; a failure leaves the stop standing and is named.
      if (Object.keys(this.preferences).length > 0) {
        const stop = this.current;
        await this.applySettings(stop).catch((e: unknown) => {
          stop.view = { ...stop.view, settingsError: thrown(e) };
        });
      }
```

`settle` clears `this.effective = undefined;` with the preferences.

`answer.ts`, in `debugStateAnswer`'s terse projection (import `terseSettings` from `./readings`):

```ts
      return {
        ...rest,
        ...terseStop(stop.debuggee, stop.stack, stop.attach),
        ...(stop.stackError ? { stack_error: stop.stackError } : {}),
        ...(stop.settings ? { settings: terseSettings(stop.settings) } : {}),
        ...(stop.settingsError ? { settings_error: stop.settingsError } : {}),
      };
```

- [ ] **Step 5: Run the tests and the gate**

```bash
npx jest src/__tests__/unit/debugger/DebugSessionSettings.test.ts src/__tests__/unit/debugger/readings.test.ts src/__tests__/unit/debugger/answer.test.ts
npm run lint && npm run build && npm run test:check && npm run lint:check
npx jest src/__tests__/unit/debugger compact/src/__tests__/compactDebug.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/debugger src/__tests__/unit/debugger
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(debugger): settings — kept as preferences, applied after each attach, reported as the system answers them

The first setDebuggerSettings after an attach ignores systemDebugging=false
(server source), so a false is sent twice there. setSettings merges at the
current stop. A failure at an attach keeps the stop and names it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 7: The core tool surface — start parameters, two step methods, `DebugSetSettings`, the breakpoint texts

**Files:**
- Modify: `src/lib/debugger/schemas.ts` (sentences, properties, `settingsFromArgs`, `startOptionsFromArgs`)
- Modify: `src/lib/debugger/access.ts` (`startedExtra`)
- Modify: `src/handlers/debugger/debug/handleDebugStartListener.ts`, `handleDebugTakeOverListener.ts`, `handleDebugStep.ts`, `handleDebugSetBreakpoints.ts`, `handleDebugDeleteBreakpoint.ts`
- Create: `src/handlers/debugger/debug/handleDebugSetSettings.ts`
- Modify: `src/lib/handlers/groups/DebugHandlersGroup.ts`
- Modify: `tests/fixtures/tools/surface.json`, `src/__tests__/unit/toolSurface.test.ts`, `src/__tests__/unit/detailSurface.test.ts`
- Modify: `src/__tests__/unit/debugger/handlers.test.ts`, `src/__tests__/unit/debugger/boundary.test.ts`
- Create: `src/__tests__/unit/debugger/descriptions.test.ts`

**Interfaces:**
- Consumes: `DebugSession.start(conflict, DebugStartOptions)`, `detach()`, `releaseDebugger()`, `setSettings(DebugSettings)`, `currentIdentity()`; `terseSettings`.
- Produces (schemas.ts): `USER_MODE_SENTENCE`, `SHARED_SET_SENTENCE`, `REQUEST_USER_PROPERTY`, `DEBUGGING_MODE_PROPERTY`, `SETTINGS_FIELDS`, `SETTINGS_PROPERTY`, `START_PROPERTIES`, `type SettingsArg`, `type StartArgs`, `settingsFromArgs(raw: SettingsArg): DebugSettings`, `startOptionsFromArgs(args: StartArgs): Pick<DebugStartOptions, 'requestUser' | 'debuggingMode' | 'settings'>`; (access.ts) `startedExtra(context: HandlerContext): Record<string, unknown>`; the tool `DebugSetSettings`. No new property carries a `default` (Review Focus 1).

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/unit/debugger/descriptions.test.ts`:

```ts
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';

/** A tool's own text and every parameter description, at any depth. */
const textsOf = (definition: {
  description: string;
  inputSchema: unknown;
}): string[] => {
  const found: string[] = [definition.description];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'description' && typeof value === 'string') found.push(value);
      else walk(value);
    }
  };
  walk(definition.inputSchema);
  return found;
};

const coreDebugTools = () =>
  new DebugHandlersGroup({} as never)
    .getHandlers()
    .map((e) => e.toolDefinition as { name: string; description: string; inputSchema: unknown });

describe('the debugger descriptions', () => {
  it('no breakpoint description says every kind takes a condition', () => {
    for (const tool of coreDebugTools())
      for (const text of textsOf(tool))
        expect({ tool: tool.name, text }).not.toEqual({
          tool: tool.name,
          text: expect.stringMatching(/each with an optional condition|with an optional condition/),
        });
  });

  it('the breakpoint descriptions say a line breakpoint may carry a condition', () => {
    const set = coreDebugTools().find((t) => t.name === 'DebugSetBreakpoints')!;
    expect(textsOf(set).join('\n')).toMatch(/a line breakpoint may carry a condition/);
  });

  it('the set is described as shared by the key and replaced as a whole', () => {
    for (const name of ['DebugSetBreakpoints', 'DebugStartListener', 'DebugTakeOverListener']) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      expect(tool.description).toMatch(
        /shared by every IDE of the same SAP user debugging the same request user \(or terminal id\)/,
      );
      expect(tool.description).toMatch(/replaces that set as a whole/);
    }
  });

  it('no new parameter carries a default the boundary would fill in', () => {
    for (const name of ['DebugStartListener', 'DebugTakeOverListener', 'DebugSetSettings']) {
      const tool = coreDebugTools().find((t) => t.name === name)!;
      const props = (tool.inputSchema as { properties: Record<string, { default?: unknown; properties?: Record<string, { default?: unknown }> }> }).properties;
      for (const key of ['request_user', 'debugging_mode', 'settings', 'system_debugging'])
        if (props[key]) {
          expect({ key, default: props[key].default }).toEqual({ key, default: undefined });
          for (const inner of Object.values(props[key].properties ?? {}))
            expect(inner.default).toBeUndefined();
        }
    }
  });
});
```

`handlers.test.ts` (imports: `handleDebugSetSettings` from `../../../handlers/debugger/debug/handleDebugSetSettings`; `settingsXml` from `./fakes`):

- `the group serves the 19 ABAP tools` → `the group serves the 20 ABAP tools`, with `'DebugSetSettings',` added to the list.
- `start answers the state handle and the SAP ids; …` — the expected start answer becomes:

  ```ts
    expect(await startedListening(world, context)).toEqual({
      state: 'listening',
      state_handle: state.handle,
      terminal_id: IDS.terminalId,
      ide_id: IDS.ideId,
      debugging_mode: 'user',
      request_user: 'SAPUSER01',
    });
  ```
- New tests, inside `describe('debugger handlers', …)`:

  ```ts
  it('a start takes the request user, the mode and the settings; the answer names the identity', async () => {
    const { world, context } = install();
    const started = handleDebugStartListener(context as any, {
      request_user: 'sapuser02',
      debugging_mode: 'user',
      settings: { system_debugging: true, background_rfc: false },
    });
    await until(() => world.polls.length === 1);
    world.polls[0].resolve(LISTEN_NOTHING());
    const answer = json(await started);
    expect(world.log.find((c) => c.call === 'listen')!.args[0]).toMatchObject({
      debuggingMode: 'user',
      requestUser: 'SAPUSER02',
    });
    expect(answer).toMatchObject({ debugging_mode: 'user', request_user: 'SAPUSER02' });
    expect(context.debugger().abap.preferredSettings()).toEqual({
      systemDebugging: true,
      backgroundRFC: false,
    });
  });

  it.each([
    ['blank in user mode', { request_user: '   ' }, 'request_user is empty'],
    [
      'blank with terminal',
      { request_user: '', debugging_mode: 'terminal' as const },
      'request_user is empty',
    ],
    [
      'non-blank with terminal',
      { request_user: 'sapuser02', debugging_mode: 'terminal' as const },
      'request_user does not apply to terminal mode',
    ],
  ])('a request_user %s is a tool error before the wire, with no handle', async (_, extra, text) => {
    const { world, context } = install();
    const r: any = await handleDebugStartListener(context as any, extra);
    expect(r.isError).toBe(true);
    expect(r.content).toHaveLength(1);
    expect(r.content[0].text).toContain(text);
    expect(world.log).toEqual([]);
    expect(world.opened).toEqual([]);
  });

  it('terminal mode with no configured terminal id is a tool error before the wire, with no handle', async () => {
    const { world, context } = install();
    const r: any = await handleDebugStartListener(context as any, {
      debugging_mode: 'terminal',
    });
    expect(r.isError).toBe(true);
    expect(r.content).toHaveLength(1);
    expect(r.content[0].text).toContain('terminal mode: no terminal id is configured');
    expect(world.log).toEqual([]);
  });
  ```
- Inside `describe('every tool reaches its port', …)`:

  ```ts
    it('Step: detach and release_debugger reach the session and answer the listening state', async () => {
      const { world, call } = await stopped();
      expect(json(await call(handleDebugStep, { action: 'detach' }))).toEqual({
        state: 'listening',
      });
      expect(world.calls).toContain('detachDebugger');
      await until(() => world.polls.length === 2);
      world.polls[1].resolve(LISTEN_CATCH());
      await until(() => world.calls.filter((c) => c === 'getStack').length === 2);
      expect(
        json(await call(handleDebugStep, { action: 'release_debugger' })),
      ).toEqual({ state: 'listening' });
      expect(world.calls).toContain('terminateDebugger:freed');
    });

    it('Step: detach and release_debugger are refused for an AMDP session, before the wire', async () => {
      const world = fakeWorld();
      const state = new InstanceState();
      const amdp = {
        holdsState: () => true,
        pending: () => false,
        failures: () => [],
        bind() {
          return this;
        },
        observe() {},
        stop: async () => {},
      } as unknown as AmdpSession;
      const dbg = new DebuggerInstance({
        abap: new DebugSession(world.ports as any, IDS),
        amdp,
      });
      state.attach(dbg);
      const context = { connection: {} as any, logger: undefined, state, debugger: () => dbg };
      for (const action of ['detach', 'release_debugger'] as const) {
        const r: any = await handleDebugStep(context as any, {
          state_handle: state.handle,
          action,
        });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain(
          `action: ${action} does not apply to an AMDP debug session`,
        );
      }
      expect(world.log).toEqual([]);
    });

    it('SetSettings maps its fields and answers the settings in force under the tool names', async () => {
      const { world, call } = await stopped();
      const r = json(
        await call(handleDebugSetSettings, {
          system_debugging: false,
          background_rfc: true,
        }),
      );
      expect(world.calls.filter((c) => c.startsWith('settings:'))).toEqual(
        Array(2).fill('settings:{"systemDebugging":false,"backgroundRFC":true}'),
      );
      expect(r).toEqual({
        system_debugging: false,
        update_debugging: false,
        create_exception_object: false,
        background_rfc: true,
        shared_object_debugging: false,
      });
    });
  ```

  (`stopped()`'s start catches on its first poll, so no long poll stands until the detach resumes the listener: that one is `world.polls[1]`.)

`boundary.test.ts` — add `TOOL_DEFINITION as StartListener` from `handleDebugStartListener` and `TOOL_DEFINITION as SetSettings` from `handleDebugSetSettings` to the imports and to the `entries` list, then add the refusal rows

```ts
    [
      'a debugging mode outside its enum',
      StartListener.name,
      { debugging_mode: 'process' },
    ],
    [
      'a setting that is not a boolean',
      SetSettings.name,
      { state_handle: handle, system_debugging: 'yes' },
    ],
```

and, as its own test (Review Focus 1, core half):

```ts
  it('a start with none of the new parameters reaches the handler without them: no default fills them in', async () => {
    const server = new BoundaryServer();
    const client = await connected(server);
    const result = await client.callTool({ name: StartListener.name, arguments: {} });
    expect(result.isError).toBeFalsy();
    const received = server.handler.mock.calls[0][1] as Record<string, unknown>;
    expect(received).not.toHaveProperty('request_user');
    expect(received).not.toHaveProperty('debugging_mode');
    expect(received).not.toHaveProperty('settings');
    await client.close();
  });
```

`tests/fixtures/tools/surface.json` — the one new row, after the `DebugTerminate` row:

```json
  {
    "group": "debug",
    "name": "DebugSetSettings",
    "inputs": "state_handle*, system_debugging, update_debugging, create_exception_object, background_rfc, shared_object_debugging, detail",
    "available_in": "cloud, onprem"
  },
```

`toolSurface.test.ts` — in `EXTRA_ALLOWED_ADDITIONS`:

```ts
        // adt-clients 29 (fr0ster/mcp-abap-adt-clients#217): the two ABAP debugger
        // starts take whose requests are caught, the debugging mode and the
        // debugger settings. All three optional; a caller that worked still works.
        'debug/DebugStartListener': ['request_user', 'debugging_mode', 'settings'],
        'debug/DebugTakeOverListener': ['request_user', 'debugging_mode', 'settings'],
```

and above `it('adds tools only deliberately', …)` a third paragraph in the comment block: "**The third deliberate move: `DebugSetSettings` arrived** with the debugger on adt-clients 29 — the settings at the current stop. Every other row was checked unchanged."

`detailSurface.test.ts` — `'DebugSetSettings',` into `JSON_ANSWERING` between `'DebugSetBreakpoints',` and `'DebugSetStackPosition',`; the comment "The thirty debugger tools" becomes "The debugger tools".

- [ ] **Step 2: Run them and see them fail**

```bash
npx jest src/__tests__/unit/debugger/descriptions.test.ts src/__tests__/unit/debugger/handlers.test.ts src/__tests__/unit/debugger/boundary.test.ts src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/detailSurface.test.ts
```

Expected: `handleDebugSetSettings` missing; the description still says "each with an optional condition"; the start answer has no `debugging_mode`.

- [ ] **Step 3: Implement the schemas**

`src/lib/debugger/schemas.ts` (import `DebugRefusedError, type DebugSettings, type DebugStartOptions` from `./DebugSession` beside `RunTarget`):

```ts
export const USER_MODE_SENTENCE =
  'In user mode it catches every request of the request user (the connected SAP user unless another is named), not only programs run by this server.';
export const TAKE_OVER_SENTENCE =
  'Displaces another debugger listening for the same user.';
export const SHARED_SET_SENTENCE =
  'Its breakpoints are one set, shared by every IDE of the same SAP user debugging the same request user (or terminal id), and each change replaces that set as a whole.';

export const REQUEST_USER_PROPERTY = {
  request_user: {
    type: 'string',
    description:
      "User mode: the SAP user whose requests are caught; the connected user when omitted. Debugging another user's requests needs the debug authorization for that user. Not taken in terminal mode.",
  },
} as const;

export const DEBUGGING_MODE_PROPERTY = {
  debugging_mode: {
    type: 'string',
    enum: ['user', 'terminal'],
    description:
      'user (when omitted) catches the requests of the request user; terminal catches the requests carrying the terminal id this server is configured with, and is refused when none is configured.',
  },
} as const;

export const SETTINGS_FIELDS = {
  system_debugging: {
    type: 'boolean',
    description: 'Steps into system programs and stops at breakpoints there.',
  },
  update_debugging: { type: 'boolean', description: 'Debugs update tasks.' },
  create_exception_object: {
    type: 'boolean',
    description:
      'Creates the exception object even where a CATCH does not ask for it.',
  },
  background_rfc: {
    type: 'boolean',
    description: 'Debugs background RFC calls.',
  },
  shared_object_debugging: {
    type: 'boolean',
    description: 'Debugs shared objects.',
  },
} as const;

export const SETTINGS_PROPERTY = {
  settings: {
    type: 'object',
    description:
      'Debugger settings, applied after each attach; a field left out keeps its value.',
    properties: SETTINGS_FIELDS,
  },
} as const;

/** What both ABAP starts take beside the breakpoints and the run. No `default`: the boundary would fill it in. */
export const START_PROPERTIES = {
  ...REQUEST_USER_PROPERTY,
  ...DEBUGGING_MODE_PROPERTY,
  ...SETTINGS_PROPERTY,
} as const;

export type SettingsArg = ArgsOf<{
  type: 'object';
  properties: typeof SETTINGS_FIELDS;
}>;
export type StartArgs = ArgsOf<{
  type: 'object';
  properties: typeof START_PROPERTIES;
}>;

/** The settings the session takes, by the library's names; a field not given is not sent. */
export function settingsFromArgs(raw: SettingsArg): DebugSettings {
  const out: DebugSettings = {};
  if (raw.system_debugging !== undefined)
    out.systemDebugging = raw.system_debugging;
  if (raw.update_debugging !== undefined)
    out.updateDebugging = raw.update_debugging;
  if (raw.create_exception_object !== undefined)
    out.createExceptionObject = raw.create_exception_object;
  if (raw.background_rfc !== undefined) out.backgroundRFC = raw.background_rfc;
  if (raw.shared_object_debugging !== undefined)
    out.sharedObjectDebugging = raw.shared_object_debugging;
  return out;
}

/** A start's identity and settings; what is not given stays out, and the session decides the default. Throws `DebugRefusedError` for a supplied blank `request_user`, or a supplied one with terminal mode. */
export function startOptionsFromArgs(
  args: StartArgs,
): Pick<DebugStartOptions, 'requestUser' | 'debuggingMode' | 'settings'> {
  // Presence first, then normalisation: a supplied blank is refused in every mode
  // and a supplied name with terminal is refused, both before the wire. The session
  // makes the same checks; this keeps the refusal at the tool boundary too.
  if (args.request_user !== undefined && !args.request_user.trim())
    throw new DebugRefusedError('request_user is empty');
  if (args.request_user !== undefined && args.debugging_mode === 'terminal')
    throw new DebugRefusedError(
      'request_user does not apply to terminal mode: the system reads no request user there',
    );
  return {
    ...(args.request_user !== undefined
      ? { requestUser: args.request_user.trim() }
      : {}),
    ...(args.debugging_mode ? { debuggingMode: args.debugging_mode } : {}),
    ...(args.settings ? { settings: settingsFromArgs(args.settings) } : {}),
  };
}
```

`BREAKPOINTS_PROPERTY`: the array description becomes `'Breakpoints: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.'` and `condition.description` becomes `'A line breakpoint only: stops only when this ABAP condition holds.'`

`src/lib/debugger/access.ts`:

```ts
/** What a start answers beside its state: the handle, the SAP ids, and the identity in force. */
export function startedExtra(context: HandlerContext): Record<string, unknown> {
  const abap = context.debugger!().abap;
  const identity = abap.currentIdentity();
  return {
    state_handle: context.state!.handle,
    terminal_id: identity?.terminalId ?? abap.ids.terminalId,
    ide_id: abap.ids.ideId,
    ...(identity ? { debugging_mode: identity.debuggingMode } : {}),
    ...(identity?.debuggingMode === 'user'
      ? { request_user: identity.requestUser }
      : {}),
  };
}
```

- [ ] **Step 4: Implement the tools**

`handleDebugStartListener.ts` (`handleDebugTakeOverListener.ts` the same, with its name, its description and `'takeOver'`):

```ts
// src/handlers/debugger/debug/handleDebugStartListener.ts
import {
  heldStateHandle,
  requireDebugger,
  startedExtra,
} from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import {
  BREAKPOINTS_PROPERTY,
  breakpointsFromArgs,
  RUN_PROPERTY,
  runFromArgs,
  SHARED_SET_SENTENCE,
  START_PROPERTIES,
  startOptionsFromArgs,
  USER_MODE_SENTENCE,
} from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStartListener',
  available_in: ['onprem', 'cloud'] as const,
  description: `[debug] Opens a debug session: arms breakpoints, listens for a debuggee and attaches the first one caught; refused while another debugger listens for that user. Takes whose requests are caught, the debugging mode and the debugger settings. ${USER_MODE_SENTENCE} ${SHARED_SET_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      ...BREAKPOINTS_PROPERTY,
      ...START_PROPERTIES,
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
  },
} as const;

export async function handleDebugStartListener(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugStateAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, { create: 'abap' });
      return d.abap.start('refuse', {
        ...(args.breakpoints?.length
          ? { breakpoints: breakpointsFromArgs(args.breakpoints) }
          : {}),
        run: runFromArgs(args.run),
        ...startOptionsFromArgs(args),
      });
    },
    () => startedExtra(context),
    () => heldStateHandle(context),
  );
}
```

`DebugTakeOverListener` description: `` `[debug] Opens a debug session: arms breakpoints, listens for a debuggee and attaches the first one caught. ${TAKE_OVER_SENTENCE} Takes whose requests are caught, the debugging mode and the debugger settings. ${USER_MODE_SENTENCE} ${SHARED_SET_SENTENCE}` ``.

`handleDebugStep.ts`:

```ts
export const TOOL_DEFINITION = {
  name: 'DebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Moves the stopped debuggee into a call, over it, out of the current one or on to the next stop; or leaves it running, the listener and the breakpoints kept, by detaching or by freeing the debugger.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      action: {
        type: 'string',
        enum: ['into', 'over', 'return', 'continue', 'detach', 'release_debugger'],
        description:
          'into enters the call, over runs it, return leaves the current one, continue runs to the next stop; detach lets the program run on, where an armed breakpoint can catch it again; release_debugger frees the debugger and the program runs on. detach and release_debugger apply to ABAP only.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'action'],
  },
} as const;

const STEPS = {
  into: 'stepInto',
  over: 'stepOver',
  return: 'stepReturn',
  continue: 'stepContinue',
} as const;

export async function handleDebugStep(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugStateAnswer(args, async () => {
    const d = requireDebugger(context, args, 'use');
    if (args.action === 'detach' || args.action === 'release_debugger') {
      if (d.amdp.holdsState() && !d.abap.holdsState())
        throw new Error(
          `action: ${args.action} does not apply to an AMDP debug session`,
        );
      return args.action === 'detach'
        ? d.abap.detach()
        : d.abap.releaseDebugger();
    }
    return d.abap.step(STEPS[args.action]);
  });
}
```

`handleDebugSetBreakpoints.ts` description (import `SHARED_SET_SENTENCE` instead of `USER_MODE_SENTENCE`):

```ts
  description: `[debug] Adds breakpoints to a debug session — a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition — and answers the whole set placed, this call's refusals each with its breakpoint and reason, earlier breakpoints no longer placed, and any answer row it cannot pair with a breakpoint. ${SHARED_SET_SENTENCE}`,
```

`handleDebugDeleteBreakpoint.ts` description:

```ts
  description:
    '[debug] Removes one breakpoint of a debug session by its id; the rest of the set stays armed. Refused for an id the session does not hold.',
```

Create `src/handlers/debugger/debug/handleDebugSetSettings.ts`:

```ts
// src/handlers/debugger/debug/handleDebugSetSettings.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseSettings } from '../../../lib/debugger/readings';
import {
  SETTINGS_FIELDS,
  STATE_HANDLE_PROPERTY,
  settingsFromArgs,
} from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetSettings',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Changes the debugger settings at the current stop and answers the settings in force; a field left out keeps its value. The debug session applies them again after each later attach.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...SETTINGS_FIELDS,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugSetSettings(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () =>
      requireDebugger(context, args, 'use').abap.setSettings(
        settingsFromArgs(args),
      ),
    terseSettings,
  );
}
```

`DebugHandlersGroup.ts`: import `TOOL_DEFINITION as DebugSetSettings_Tool, handleDebugSetSettings` (alphabetical among the imports) and register `defineTool(DebugSetSettings_Tool, handleDebugSetSettings),` after `DebugTerminate`. The group's doc comment: "a breakpoint catches every request of the request user".

- [ ] **Step 5: Run the tests, the gate and the whole unit suite**

```bash
npx jest src/__tests__/unit/debugger src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/detailSurface.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts
npm run lint && npm run build && npm run test:check && npm run lint:check
npm test 2>&1 | tee /tmp/debugger-28-unit.log
npm --prefix server run test:check && npm --prefix server test 2>&1 | tee /tmp/debugger-28-server.log
```

Expected: green. `compact/src/__tests__/compactDebug.test.ts`'s `the start describes user mode and taking over as facts` fails on the new sentence until Task 8 — if it does, change its regex here to `/every request of the request user/` and include the file in this commit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/debugger src/handlers/debugger/debug src/lib/handlers/groups/DebugHandlersGroup.ts tests/fixtures/tools/surface.json src/__tests__/unit compact/src/__tests__/compactDebug.test.ts
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(debugger): the core tools — request_user, debugging_mode and settings at the start; detach and release_debugger; DebugSetSettings

The starts answer the identity in force. A condition is a line breakpoint's
only; the descriptions say the set is shared by the key and replaced as a
whole. detach and release_debugger are refused for an AMDP session before
the wire. No new parameter carries a schema default.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 8: Compact — the same parameters at the start, the two actions, refused for `kind: amdp`

**Files:**
- Modify: `compact/src/debug/handleHandlerDebugStart.ts`, `compact/src/debug/handleHandlerDebugStep.ts`
- Modify: `compact/tests/fixtures/surface.json` (the `HandlerDebugStart` and `HandlerDebugStep` rows — the ratchet rises)
- Modify: `compact/src/__tests__/compactDebug.test.ts`
- Modify: `src/__tests__/unit/debugger/boundary.test.ts`, `src/__tests__/unit/debugger/descriptions.test.ts`, `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts`

**Interfaces:**
- Consumes: `START_PROPERTIES`, `startOptionsFromArgs`, `SHARED_SET_SENTENCE`, `startedExtra` (Task 7); `d.abap.detach()`, `d.abap.releaseDebugger()` (Task 5).
- Produces: `HandlerDebugStart` takes `request_user`, `debugging_mode`, `settings` (kind abap); `HandlerDebugStep` takes the actions `detach` and `release_debugger`.

- [ ] **Step 1: Write the failing tests**

`compactDebug.test.ts` — the fake ABAP session gains the members the handlers now call:

```ts
    currentIdentity: () => undefined,
    detach: async () => {
      calls.push(['detach']);
      return { state: 'listening' };
    },
    releaseDebugger: async () => {
      calls.push(['releaseDebugger']);
      return { state: 'listening' };
    },
```

`the start describes user mode and taking over as facts`: the first regex becomes `/every request of the request user/`, and add `expect(start.toolDefinition.description).toMatch(/replaces that set as a whole/);`. New tests in `describe('compact debug verbs on the fake sessions', …)`:

```ts
  it('start abap passes request_user, debugging_mode and settings to the session', async () => {
    const t = install();
    await t.call('HandlerDebugStart', {
      kind: 'abap',
      breakpoints: [{ exception_class: 'cx_a' }],
      request_user: 'sapuser02',
      debugging_mode: 'user',
      settings: { system_debugging: true },
    });
    expect(t.abap[0]).toEqual([
      'start',
      'refuse',
      {
        breakpoints: [{ kind: 'exception', exceptionClass: 'CX_A' }],
        run: undefined,
        requestUser: 'sapuser02',
        debuggingMode: 'user',
        settings: { systemDebugging: true },
      },
    ]);
  });

  it.each([
    ['request_user', { request_user: 'sapuser02' }],
    ['debugging_mode', { debugging_mode: 'terminal' as const }],
    ['settings', { settings: { system_debugging: true } }],
  ])('start amdp with %s is refused before the wire', async (_, extra) => {
    const t = install();
    const r = await t.call('HandlerDebugStart', {
      kind: 'amdp',
      breakpoints: [{ object_name: 'class_a', line: 14 }],
      ...extra,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain(
      'request_user, debugging_mode and settings apply to kind abap only',
    );
    expect(t.amdp).toEqual([]);
  });

  it('step on ABAP: detach and release_debugger reach the session', async () => {
    const t = install();
    await t.call('HandlerDebugStart', {
      kind: 'abap',
      breakpoints: [{ exception_class: 'cx_a' }],
    });
    const h = { state_handle: t.state.handle };
    await t.call('HandlerDebugStep', { ...h, action: 'detach' });
    await t.call('HandlerDebugStep', { ...h, action: 'release_debugger' });
    expect(t.abap.map((c) => c[0])).toEqual(['start', 'detach', 'releaseDebugger']);
  });

  it('step on AMDP: detach and release_debugger are refused', async () => {
    const t = install();
    await t.call('HandlerDebugStart', {
      kind: 'amdp',
      breakpoints: [{ object_name: 'class_a', line: 14 }],
    });
    const h = { state_handle: t.state.handle };
    for (const action of ['detach', 'release_debugger'] as const) {
      const r = await t.call('HandlerDebugStep', { ...h, action });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain(
        `action: ${action} does not apply to an amdp debug session`,
      );
    }
    expect(t.amdp.map((c) => c[0])).toEqual(['start']);
  });
```

`boundary.test.ts` (Review Focus 1, compact half): import `TOOL_DEFINITION as CompactStart` from `'../../../../compact/src/debug/handleHandlerDebugStart'`, add it to `entries`, and:

```ts
  it('a compact AMDP start reaches the handler without request_user, debugging_mode or settings: no default fills them in', async () => {
    const server = new BoundaryServer();
    const client = await connected(server);
    const result = await client.callTool({
      name: CompactStart.name,
      arguments: {
        kind: 'amdp',
        breakpoints: [{ object_name: 'class_a', line: 14 }],
      },
    });
    expect(result.isError).toBeFalsy();
    const received = server.handler.mock.calls[0][1] as Record<string, unknown>;
    expect(received).not.toHaveProperty('request_user');
    expect(received).not.toHaveProperty('debugging_mode');
    expect(received).not.toHaveProperty('settings');
    await client.close();
  });
```

`descriptions.test.ts`: import `compactDebugEntries` from `'../../../../compact/src/debug/group'` and run the first test over both — replace `coreDebugTools()` in it by `[...coreDebugTools(), ...compactDebugEntries().map((e) => e.toolDefinition as { name: string; description: string; inputSchema: unknown })]`.

`toolDescriptionsCarryNoLiterals.test.ts`: the compact debug verbs come from their own package, so the exporter does not list them. Import `compactDebugEntries` from `'../../../compact/src/debug/group'` and extend `tools`:

```ts
  const tools = [
    ...new HandlerExporter({ /* the existing options */ })
      .getHandlerEntries()
      .map((e) => e.toolDefinition),
    // The compact debug verbs (their own package): their text joins the same rule.
    ...compactDebugEntries().map((e) => e.toolDefinition),
  ];
```

(keep the existing option object as it is).

`compact/tests/fixtures/surface.json`:

```json
    "name": "HandlerDebugStart",
    "inputs": "kind*, breakpoints*, take_over, request_user, debugging_mode, settings, run, detail",
```

(the `HandlerDebugStep` row's inputs do not change: the actions are values, not parameters).

- [ ] **Step 2: Run them and see them fail**

```bash
npx jest compact/src/__tests__/compactDebug.test.ts compact/src/__tests__/compactSurface.test.ts src/__tests__/unit/debugger/boundary.test.ts src/__tests__/unit/debugger/descriptions.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts
```

Expected: the compact start has no `request_user`; `detach` is outside the enum; the compact breakpoint description still says "each with an optional condition".

- [ ] **Step 3: Implement**

`compact/src/debug/handleHandlerDebugStart.ts` — imports gain `SHARED_SET_SENTENCE`, `START_PROPERTIES`, `startedExtra`, `startOptionsFromArgs` from `@mcp-abap-adt/lib/debugger`. The definition:

```ts
export const TOOL_DEFINITION = {
  name: 'HandlerDebugStart',
  available_in: ['onprem', 'cloud'] as const,
  description: `Debugger start. kind: abap (line, exception, statement or message breakpoints) or amdp (lines in SQLScript methods). Arms the breakpoints, listens (abap) or opens an AMDP session, and optionally runs a class or report in the background. request_user, debugging_mode and settings apply to abap only. take_over: abap — ${TAKE_OVER_SENTENCE.replace(/\.$/, '')}; amdp — ends an AMDP session of this user left behind. ${USER_MODE_SENTENCE} ${SHARED_SET_SENTENCE}`,
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['abap', 'amdp'],
        description:
          'abap debugs ABAP code; amdp debugs SQLScript methods of a class.',
      },
      breakpoints: {
        ...BREAKPOINTS_PROPERTY.breakpoints,
        minItems: 1,
        description:
          'abap: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition. amdp: object_name (the class) and line of each.',
      },
      take_over: {
        type: 'boolean',
        default: false,
        description:
          'Takes over from an existing debugger of this user instead of refusing; the breakpoints of the same key — the SAP user with the request user, or with the terminal id — are replaced.',
      },
      ...START_PROPERTIES,
      ...RUN_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['kind', 'breakpoints'],
  },
} as const;
```

In the handler, the AMDP branch's work starts with the refusal:

```ts
      async () => {
        // The identity and the settings are the ABAP debugger's; the AMDP session takes none.
        if (
          args.request_user !== undefined ||
          args.debugging_mode !== undefined ||
          args.settings !== undefined
        )
          throw new Error(
            'request_user, debugging_mode and settings apply to kind abap only',
          );
        refuseOtherKind(context, 'amdp');
        // … unchanged …
```

and the ABAP branch:

```ts
      return d.abap.start(args.take_over ? 'takeOver' : 'refuse', {
        breakpoints: breakpointsFromArgs(args.breakpoints),
        run: runFromArgs(args.run),
        ...startOptionsFromArgs(args),
      });
    },
    () => startedExtra(context),
    () => heldStateHandle(context),
```

`compact/src/debug/handleHandlerDebugStep.ts` — `description: 'Moves the stopped debuggee (into, over, return, continue, run or jump to a line), leaves it running (detach, release_debugger), ends it where it stands, or ends the debug session.'`; the enum adds `'detach', 'release_debugger'` after `'jump_to_line'`; the action description:

```ts
        description:
          'into enters the call, over runs it, return leaves the current one, continue runs to the next stop; run_to_line executes up to the line, jump_to_line moves there without executing what lies between; detach lets the program run on, where an armed breakpoint can catch it again; release_debugger frees the debugger and the program runs on; terminate ends the debuggee where it stands; stop ends the debug session. For AMDP only over, continue, terminate and stop apply.',
```

In the `abap` branch, before `if (action === 'terminate')`:

```ts
        if (action === 'detach')
          return debugStateAnswer(args, async () => d.abap.detach());
        if (action === 'release_debugger')
          return debugStateAnswer(args, async () => d.abap.releaseDebugger());
```

(the `amdp` branch already ends in `refused('amdp')`).

- [ ] **Step 4: Run the tests, the gate and the whole unit suite**

```bash
npx jest compact/src/__tests__ src/__tests__/unit/debugger src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts
npm run lint && npm run build && npm run test:check && npm run lint:check
npm test 2>&1 | tee /tmp/debugger-28-unit.log
npm --prefix server run test:check && npm --prefix server test 2>&1 | tee /tmp/debugger-28-server.log
```

- [ ] **Step 5: Commit**

```bash
git add compact/src/debug compact/tests/fixtures/surface.json compact/src/__tests__/compactDebug.test.ts src/__tests__/unit
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(compact): HandlerDebugStart takes request_user, debugging_mode and settings; HandlerDebugStep detach and release_debugger

All three are refused for kind amdp before the wire, as are the two actions
for an AMDP session. take_over says the key's breakpoints are replaced; a
line breakpoint may carry a condition. The compact debug texts join the
no-literals rule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 9: Integration on premise — written now, run only after the user says so

**Files:**
- Modify: `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`
- Modify: `tests/test-config.yaml.template` (`second_user_env`)

**Interfaces:**
- Consumes: the tools of Tasks 7–8 through `call(inst, tool, args)` (soft: the handler; hard: MCP); `createDebuggerInstance(ids)` with `terminalStated`.
- Produces: six cases; `MEASURE breakpoint answer | …` lines that record each breakpoints answer as the server paired it.

- [ ] **Step 1: The probe gets a loop, the config a second user**

In `abapProbeSource`, declare `DATA lv_pass TYPE i.` under `DATA lv_counter TYPE i.` and put the loop **after** `out->write( … ).` so no existing stepping case changes and the output stays `counter 15`:

```abap
    out->write( |counter { lv_counter }| ).
    DO 2 TIMES.
      lv_pass = lv_pass + 1. "BP:loop
    ENDDO.
  ENDMETHOD.
```

`tests/test-config.yaml.template`, `debugger_handlers.test_cases[0].params`:

```yaml
        # A session .env name (in the standard sessions folder) of a second SAP user
        # with basic authentication; the connected user needs the debug authorization
        # on that user. Empty: the another-user case is skipped.
        second_user_env: ""
```

Copy the same lines into the local `tests/test-config.yaml` (gitignored).

- [ ] **Step 2: Helpers**

Imports: `handleDebugSetSettings`; `type SapConfig` from `@mcp-abap-adt/connection`; `* as fs` from `node:fs`; `* as dotenv` from `dotenv`; `resolveEnvFilePath` from `../../../lib/config/envResolver`; `createAbapConnection` from `../../../lib/connectionFactory`; `credentialFromSapConfig` from `../../../lib/credentialSources`; `loadTestConfig, testAuthBrokerPath` from `../helpers/configHelpers`. `HANDLERS` gains `DebugSetSettings: handleDebugSetSettings`. In `beforeAll`, beside `keep_probe`, read `secondUserEnv = String(p.second_user_env ?? '');` into a `let secondUserEnv = '';` of the describe.

`newInstance`'s parameter type becomes `{ terminalId: string; ideId: string; stated: boolean; terminalStated?: boolean }`. Add inside the describe:

```ts
  /** DebugWait until the background run reports its end. */
  const untilRunFinished = async (inst: Instance, handle: string) => {
    const seen: unknown[] = [];
    for (let i = 0; i < 8; i++) {
      const a = await call(inst, 'DebugWait', {
        state_handle: handle,
        hold_seconds: 30,
      });
      seen.push(a.isError ? a.text.slice(0, 300) : a.json);
      if (a.isError || a.json?.reason === 'run_finished') return a;
    }
    throw new Error(`the run did not report its end: ${JSON.stringify(seen)}`);
  };

  /** A connection as the user a session .env names (basic authentication). */
  const connectionAs = async (envName: string) => {
    const file = resolveEnvFilePath({
      envDestination: envName,
      authBrokerPath: testAuthBrokerPath(loadTestConfig()),
    });
    if (!file || !fs.existsSync(file))
      throw new Error(`second_user_env: no session .env named ${envName}`);
    const env = dotenv.parse(fs.readFileSync(file, 'utf8'));
    const settings: SapConfig = {
      url: String(env.SAP_URL).replace(/\/$/, ''),
      authType: 'basic',
      username: env.SAP_USERNAME,
      password: env.SAP_PASSWORD,
      ...(env.SAP_CLIENT ? { client: env.SAP_CLIENT.trim() } : {}),
    };
    const conn = createAbapConnection(
      settings,
      credentialFromSapConfig(settings),
      null,
    ) as IAbapConnection & { connect?: () => Promise<void> };
    if (typeof conn.connect === 'function') await conn.connect();
    return {
      connection: conn as IAbapConnection,
      close: async () => {
        await (conn as { disconnect?: () => Promise<void> }).disconnect?.();
      },
    };
  };

  /** Runs the probe on the connection given (another user's), with no debugger of ours. */
  const runOn = async (conn: IAbapConnection, name: string) => {
    const answer = await new AdtExecutor(conn)
      .getClassExecutor(ourClassExecutor)
      .run({ className: name }, { analyse: analyseException });
    return answer.ok
      ? { ok: true, output: String(answer.getResult().value ?? '') }
      : { ok: false, output: answer.getError().message };
  };
```

- [ ] **Step 3: The cases**

Add after the existing ABAP cases (each wrapped like the others: `it(name, async () => { await tester.run(async () => { … }); }, getTimeout('long'));`). Bodies:

```ts
  // the regression: two DebugSetBreakpoints in a row, and the run stops at both
      if (!abapReady) throw new Error('the probe is not ready');
      const inst = newInstance();
      const start = await call(inst, 'DebugStartListener', {});
      expect(start.isError).toBe(false);
      const h = { state_handle: start.json.state_handle };
      /** What the session paired: placed lines, refused lines with reasons, lost, unexpected. */
      const paired = (a: { json: any }) => ({
        placed: a.json.placed.map((r: any) => String(r.uri).split('#')[1]),
        refused: a.json.refused.map(
          (r: any) => `${String(r.requested.uri).split('#')[1]}: ${r.error ?? ''}`,
        ),
        lost: a.json.lost.length,
        unexpected: a.json.unexpected,
      });
      const first = await call(inst, 'DebugSetBreakpoints', {
        ...h,
        breakpoints: [line('mark')],
      });
      expect(first.isError).toBe(false);
      const second = await call(inst, 'DebugSetBreakpoints', {
        ...h,
        breakpoints: [line('second')],
      });
      expect(second.isError).toBe(false);
      measure('breakpoint answer', 'sent: mark, second (both placeable)', paired(second));
      expect(second.json.placed).toHaveLength(2);
      expect(second.json.refused).toEqual([]);
      expect(second.json.lost).toEqual([]);
      expect(second.json.unexpected).toEqual([]);
      // A refusal among the rows: a class's first line takes no breakpoint. The system
      // answers it first (measured on premise (2026-10-11), BASIS 816); the tag pairs it.
      const withRefusal = await call(inst, 'DebugSetBreakpoints', {
        ...h,
        breakpoints: [{ object_type: 'CLAS', object_name: probe, line: 1 }],
      });
      expect(withRefusal.isError).toBe(false);
      measure('breakpoint answer', 'sent: mark, second, line 1', paired(withRefusal));
      expect(withRefusal.json.placed).toHaveLength(2);
      expect(withRefusal.json.refused).toHaveLength(1);
      expect(withRefusal.json.refused[0].requested.uri).toMatch(/#start=1$/);
      expect(withRefusal.json.lost).toEqual([]);
      expect(withRefusal.json.unexpected).toEqual([]);
      const ran = runProbe(probe);
      const atMark = await waitFor(inst, h.state_handle, ['stopped']);
      expect(atMark.last.json?.state).toBe('stopped');
      expect(atMark.last.json.at.address.line).toBe(LINE.mark);
      expect((await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError).toBe(false);
      const atSecond = await waitFor(inst, h.state_handle, ['stopped']);
      measure('breakpoint set', 'the second stop', atSecond.last.json?.at?.address);
      expect(atSecond.last.json?.state).toBe('stopped');
      expect(atSecond.last.json.at.address.line).toBe(LINE.second);
      expect((await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError).toBe(false);
      expect(await ran).toMatchObject({ ok: true, output: ABAP_OUTPUT });
      expect((await call(inst, 'DebugStop', h)).isError).toBe(false);
```

```ts
  // another user: caught, stepped, continued — skipped unless second_user_env is configured
      if (!abapReady) throw new Error('the probe is not ready');
      if (!secondUserEnv)
        throw new Error('SKIP: no second user configured (second_user_env)');
      const other = await connectionAs(secondUserEnv);
      try {
        const otherUser = (await requestUserOf(other.connection)).toUpperCase();
        const inst = newInstance();
        const start = await call(inst, 'DebugStartListener', {
          request_user: otherUser,
          breakpoints: [line('mark')],
        });
        measure('another user', 'start', start.isError ? start.text.slice(0, 400) : start.json?.state);
        expect(start.isError).toBe(false);
        expect(start.json.request_user).toBe(otherUser);
        const h = { state_handle: start.json.state_handle };
        const ran = runOn(other.connection, probe);
        const caught = await waitFor(inst, h.state_handle, ['stopped']);
        expect(caught.last.json?.state).toBe('stopped');
        expect(caught.last.json.at.address.line).toBe(LINE.mark);
        expect((await call(inst, 'DebugStep', { ...h, action: 'over' })).isError).toBe(false);
        expect((await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError).toBe(false);
        expect(await ran).toMatchObject({ ok: true, output: ABAP_OUTPUT });
        expect((await call(inst, 'DebugStop', h)).isError).toBe(false);
      } finally {
        await other.close();
      }
```

```ts
  // detach: caught again at the next pass of an armed line in a loop, then continued to its end
      if (!abapReady) throw new Error('the probe is not ready');
      const inst = newInstance();
      const start = await call(inst, 'DebugStartListener', {
        breakpoints: [line('loop')],
        run: { kind: 'class', name: probe },
      });
      expect(start.isError).toBe(false);
      const h = { state_handle: start.json.state_handle };
      const pass1 =
        start.json.state === 'stopped'
          ? start
          : (await waitFor(inst, h.state_handle, ['stopped'])).last;
      expect(pass1.json.at.address.line).toBe(LINE.loop);
      const detached = await call(inst, 'DebugStep', { ...h, action: 'detach' });
      expect(detached.isError).toBe(false);
      expect(detached.json.state).toBe('listening');
      const pass2 = await waitFor(inst, h.state_handle, ['stopped', 'ended']);
      measure('detach', 'the next pass of the armed line', pass2.last.json?.state);
      expect(pass2.last.json?.state).toBe('stopped');
      expect(pass2.last.json.at.address.line).toBe(LINE.loop);
      expect((await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError).toBe(false);
      const finished = await untilRunFinished(inst, h.state_handle);
      expect(finished.json?.run).toMatchObject({ ok: true, output: ABAP_OUTPUT });
      expect((await call(inst, 'DebugStop', h)).isError).toBe(false);
```

```ts
  // release_debugger: the run finishes, the answer is no failure, the listener catches the next run
      if (!abapReady) throw new Error('the probe is not ready');
      const inst = newInstance();
      const start = await call(inst, 'DebugStartListener', {
        breakpoints: [line('mark')],
        run: { kind: 'class', name: probe },
      });
      expect(start.isError).toBe(false);
      const h = { state_handle: start.json.state_handle };
      if (start.json.state !== 'stopped')
        expect((await waitFor(inst, h.state_handle, ['stopped'])).last.json?.state).toBe('stopped');
      const released = await call(inst, 'DebugStep', { ...h, action: 'release_debugger' });
      measure('release_debugger', 'answer', released.isError ? released.text.slice(0, 400) : released.json);
      expect(released.isError).toBe(false);
      expect(released.json.state).toBe('listening');
      const finished = await untilRunFinished(inst, h.state_handle);
      expect(finished.json?.run).toMatchObject({ ok: true, output: ABAP_OUTPUT });
      const next = runProbe(probe);
      const caught = await waitFor(inst, h.state_handle, ['stopped']);
      expect(caught.last.json?.state).toBe('stopped');
      expect((await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError).toBe(false);
      expect((await next).ok).toBe(true);
      expect((await call(inst, 'DebugStop', h)).isError).toBe(false);
```

```ts
  // settings: at the start and through DebugSetSettings, recorded after each
      if (!abapReady) throw new Error('the probe is not ready');
      const inst = newInstance();
      const start = await call(inst, 'DebugStartListener', {
        breakpoints: [line('mark')],
        settings: { system_debugging: true, create_exception_object: true },
        run: { kind: 'class', name: probe },
      });
      expect(start.isError).toBe(false);
      const h = { state_handle: start.json.state_handle };
      const stopped =
        start.json.state === 'stopped'
          ? start
          : (await waitFor(inst, h.state_handle, ['stopped'])).last;
      measure('settings', 'after the attach: system_debugging, create_exception_object', stopped.json?.settings ?? stopped.json?.settings_error);
      expect(stopped.json.settings).toMatchObject({ system_debugging: true, create_exception_object: true });
      const off = await call(inst, 'DebugSetSettings', { ...h, system_debugging: false });
      measure('settings', 'DebugSetSettings system_debugging false', off.isError ? off.text.slice(0, 300) : off.json);
      expect(off.isError).toBe(false);
      expect(off.json).toMatchObject({ system_debugging: false, create_exception_object: true });
      const update = await call(inst, 'DebugSetSettings', { ...h, update_debugging: true });
      measure('settings', 'DebugSetSettings update_debugging true', update.isError ? update.text.slice(0, 300) : update.json);
      expect(update.json).toMatchObject({ update_debugging: true, system_debugging: false });
      expect((await call(inst, 'DebugStep', { ...h, action: 'continue' })).isError).toBe(false);
      await untilRunFinished(inst, h.state_handle);
      expect((await call(inst, 'DebugStop', h)).isError).toBe(false);
```

```ts
  // terminal mode without SAP GUI: the listener starts and stops; no catch is asserted
      softOnly('the terminal id is configured on the instance');
      const unconfigured = newInstance();
      const refused = await call(unconfigured, 'DebugStartListener', { debugging_mode: 'terminal' });
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain('terminal mode: no terminal id is configured');
      const inst = newInstance({
        terminalId: newDebuggerId(),
        ideId: newDebuggerId(),
        stated: true,
        terminalStated: true,
      });
      const start = await call(inst, 'DebugStartListener', {
        debugging_mode: 'terminal',
        breakpoints: [line('mark')],
      });
      measure('terminal', 'start', start.isError ? start.text.slice(0, 400) : start.json?.state);
      expect(start.isError).toBe(false);
      expect(start.json.debugging_mode).toBe('terminal');
      const stop = await call(inst, 'DebugStop', { state_handle: start.json.state_handle });
      measure('terminal', 'stop', stop.isError ? stop.text.slice(0, 400) : 'stopped');
      expect(stop.isError).toBe(false);
```

Case names, in order: `the breakpoint set: two DebugSetBreakpoints in a row, and the run stops at both; every answer row pairs by its clientId`; `another user: a listener for a second configured user catches that user's run; stepped and continued`; `detach: the run is caught again at the next pass of an armed line in a loop, then continued to its end`; `release_debugger: the run finishes, the answer is no failure, and the listener catches the next run`; `settings: at the start and through DebugSetSettings, the settings in force recorded after each`; `terminal mode without SAP GUI: the listener starts and stops; no catch is asserted`.

- [ ] **Step 4: Compile and commit (no SAP run)**

```bash
npm run lint && npm run build && npm run test:check && npm run lint:check
git add src/__tests__/integration/debugger/DebuggerHandlers.test.ts tests/test-config.yaml.template
git diff --cached --stat
git commit -m "$(cat <<'EOF'
test(debugger): integration on premise — the set across two changes, another user, detach, release_debugger, settings, terminal mode

Every breakpoints answer pairs by clientId with nothing unexpected, a refusal
among the rows included (MEASURE breakpoint answer). A second user is
configured by second_user_env;
without one that case is skipped.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

- [ ] **Step 5: Ask, then run (soft, then hard for the new tools)**

Before proposing a run: read the token's `exp` of the configured destination locally and report it; ask the user whether to run against the configured on-premise system (Eclipse's debugger must be closed for the run, and nothing else may debug for that user). Wait for the answer. Then, as told:

```bash
npx jest --testPathPatterns='integration/debugger/DebuggerHandlers' --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit 2>&1 | tee /tmp/debugger-28-integration-soft.log
```

and with `integration_hard_mode.enabled: true` in `tests/test-config.yaml`:

```bash
npx jest --testPathPatterns='integration/debugger/DebuggerHandlers' --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit 2>&1 | tee /tmp/debugger-28-integration-hard.log
```

Report the `MEASURE` lines — `grep '^MEASURE' /tmp/debugger-28-integration-*.log` — in particular `breakpoint answer`: every definition placed or refused exactly, and `unexpected` empty. A non-empty `unexpected` on a real system means the server did not echo a tag as measured: report it with the `DEBUG_HTTP_WIRE` exchange and ask the user before changing anything. A failing case: read the log, ask the user what they see in the system rather than retrying blindly.

---

## Task 10: Documentation and the 18.0.0 release metadata

**Files:**
- Modify: `docs/user-guide/DEBUGGER.md`, `CLAUDE.md`, `README.md`, `docs/README.md`, `docs/user-guide/CLI_OPTIONS.md`, `docs/user-guide/CLIENT_CONFIGURATION.md`, `CHANGELOG.md`
- Create: `docs/MIGRATION-18.0.md`
- Regenerate: `docs/user-guide/AVAILABLE_TOOLS*.md`, `compact/docs/AVAILABLE_TOOLS.md`
- Modify: `package.json`, `server/package.json`, `compact/package.json`, `compact-readonly/package.json`, `compact-modify/package.json`, `package-lock.json`, `server.json`, `server-compact.json`, `docker/Dockerfile.inspect`

**Interfaces:** none in code. Consumes the names fixed by Tasks 1–8.

- [ ] **Step 1: `docs/user-guide/DEBUGGER.md`**

- "Turning it on": "because a breakpoint catches every request of the connected SAP user" → "because a breakpoint catches every request of the request user — the connected SAP user unless another is named"; "29 debugger tools" → "30 debugger tools".
- Replace the body of "## Scope: what it debugs" with:

  > The debugger catches **requests that start after it listens**: in user mode those of one SAP user — the connected one, or another named by `request_user` — and in terminal mode those that carry a configured terminal id. The model can have the server run a class (as a console application) or a report in the background once it listens, or catch what that user runs elsewhere. It cannot attach to a process or a request that is already running (see [What ADT cannot do](#what-adt-cannot-do)).

- "## The SAP ids, and when to share one": the bullet "The terminal id changes nothing in user mode." gains "; terminal mode keys on it (below)". The bullet "**Breakpoints belong to the SAP user, not to an id** …" becomes:

  > - **Breakpoints belong to a key, not to an IDE id**: the SAP user the server logs on as with the request user (user mode), or with the terminal id (terminal mode; a terminal id equal to the IDE id keys on the IDE id alone). Whichever listener of that key is active catches them (measured on premise (2026-10-11), BASIS 816). See [The breakpoint set and its key](#the-breakpoint-set-and-its-key).

- "## What a breakpoint catches": "every request of the connected SAP user" → "every request of the request user"; the breakpoint paragraph becomes:

  > Breakpoints are a line (`object_type`, `object_name`, `line`; a class's include and a function module's group where needed), an exception class, an ABAP statement or a message; a line breakpoint may carry a condition, and a condition on another kind is refused, naming the breakpoint (the system does not evaluate one there). `DebugSetBreakpoints` adds to the set: the server sends the whole set every time and answers it whole — `placed` (every breakpoint in force), `refused` (this call's that the system did not place, each with its definition and the system's reason), `lost` (earlier ones no longer placed) and `unexpected` (an answer row the server could not pair with a breakpoint it sent; a conforming system never answers one). The server tags every breakpoint it sends with an id of its own (`clientId`), and the system echoes that tag on each row, placed or refused, whatever order it answers them in (measured on premise (2026-10-11), BASIS 816: refused rows first, ids renumbered) — so each row pairs exactly with its breakpoint. `DebugDeleteBreakpoint` removes one by id, and is refused for an id the session does not hold; `DebugListBreakpoints` lists the placed set.

- After "## What a breakpoint catches", insert these sections (the text below is the content; keep it as written):

  ```markdown
  ## Another user

  `request_user` (on `DebugStartListener`, `DebugTakeOverListener`, compact `HandlerDebugStart` with `kind: abap`) names whose requests are caught; omitted, it is the connected user. The catching user needs `S_DEVELOP` with `DEBUG` and activity `90` on the user named; without it the system answers `403`, and the answer reaches the model as the system gave it. Measured end to end on premise (2026-10-11), BASIS 816: the other user's run was caught within about a second, attached, stepped and finished. Only a request that starts after the breakpoint and the listener are in place is caught.

  The identity — the mode and the request user — is fixed for the life of the state handle: another user is another start, with another handle.

  ## Terminal mode

  `debugging_mode: terminal` catches the requests that carry a terminal id instead of those of a user. The terminal id is the one the host configures — `x-sap-debug-terminal-id`, the destination's `SAP_DEBUG_TERMINAL_ID`, then the environment's — never a random one: with none configured, the start is refused before anything is sent ("no terminal id is configured"). `request_user` is refused in this mode: the system reads no request user there.

  - **Where SAP GUI shows its terminal id**: in its debugging settings. The Windows client keeps one per logon; a further window or a browser joins it.
  - **A catch in this mode is not measured.** The listener, its check, the breakpoints and their deletion answer on premise (2026-10-11), BASIS 816, but no run was caught in this mode there. If it does not catch for you, open an issue with: the mode; whether the terminal id is the one SAP GUI shows; how the program was started (SAP GUI, browser, RFC, background job); and the wire log of the requests (`DEBUG_HTTP_WIRE=true`).

  ## The breakpoint set and its key

  The system keeps one set of breakpoints per key: the SAP user the server logs on as with the request user (user mode), or with the terminal id (terminal mode). The IDE id does not separate them, so **every IDE of the same SAP user debugging the same request user shares one set** — an Eclipse, another server instance, this one. Each change replaces that set as a whole, and stopping a listener deletes it (measured on premise (2026-10-11), BASIS 816). The server keeps the definitions it was given and sends them all with every change, so a second `DebugSetBreakpoints` keeps the first.

  What a change does to another IDE's breakpoints under the same key is the host's choice, `SAP_DEBUG_BREAKPOINT_CONFLICT` — the header `x-sap-debug-breakpoint-conflict`, the destination's `.env`, the environment, in that order; an embedder passes `breakpointConflict` to `createDebuggerInstance`:

  - **`replace`** (the default): the set is sent whole, and another IDE's breakpoints under the key are replaced.
  - **`refuse-if-held`**: before a start and before every later `DebugSetBreakpoints`, the server asks the system whether another IDE holds the user's debugging, and refuses with the system's text and the IDE user if so; nothing is changed. Our own listener is no conflict. The check is not atomic: a listener started between the check and the change is not seen. It refuses `DebugTakeOverListener` (compact `take_over: true`) too.

  ## Leaving a debuggee running

  At a stop, `DebugStep` (compact `HandlerDebugStep`) takes two more actions, ABAP only:

  - **`detach`**: the debugger leaves and the program runs on. The listener and the breakpoints stay, so an armed breakpoint can catch the same run again at its next pass.
  - **`release_debugger`**: frees the debugger; the program runs on and returns its output. The system answers this with a plain `500` that is the request having worked (adt-clients' errata, "The debugger freeing its session is answered as an ICF 500"); the server reads exactly that as no failure, and anything else — an ADT document, an HTML page, a `400` — as a failure that keeps the stop for `DebugStop`. The freed ABAP session takes no further request, so the server sends it none, not even a logoff.

  Both answer the listening state. `DebugTerminate` (compact `terminate`) ends the program where it stands.

  ## Debugger settings

  `settings` at a start (compact: at the start only) — `system_debugging`, `update_debugging`, `create_exception_object`, `background_rfc`, `shared_object_debugging`, each a boolean — are kept and applied after each attach; a field left out keeps its value. `DebugSetSettings` changes them at the current stop, merges them into those kept and answers the settings in force; a stop answers them under `settings` (and a failure to apply them under `settings_error`, the stop standing). The first change after an attach ignores `system_debugging: false` (server source, BASIS 816, read 2026-10-11) and its answer cannot show it, so the server sends a `false` there twice. The display of data aging is not offered: left out, it stays off, the system's default.

  ## What ADT cannot do

  It cannot attach to a process or a request that is already running. A request is enabled for catching when it starts: a loop already running when the breakpoint and the listener were armed is never caught (measured on premise (2026-10-11), BASIS 816, for 45 s). Attaching a work process from the process overview opens the debugger in the requester's SAP GUI, and nothing routes that stop to an ADT listener; SAP GUI is the route there.
  ```

- "## Conflicts are errors": after the take-over bullet add "The error names who holds the user's debugging: the system's conflict text and, where it gives one, the IDE user. With `SAP_DEBUG_BREAKPOINT_CONFLICT=refuse-if-held` the same check runs before anything is changed (above)."
- "## What ends a session", the `DebugStop` bullet becomes:

  > - **`DebugStop`** (compact `stop`): releases a stopped debuggee, then stops the listener — which deletes the key's breakpoints, those of every IDE sharing the key included — and closes the connections, ABAP and AMDP alike. Only when the listener's stop fails are this session's breakpoints deleted one by one. It returns only after the system has answered the listener's open poll — so a conflict right after a stop means a real other listener, not our own still letting go. A part that could not be undone is reported, kept, and retried by the next stop; the handle stays valid, the identity (mode, request user) and the settings stay, and a new start is refused, until nothing is held. A debuggee the listener caught as the stop began is attached and released by the stop; measured on premise (2026-10-11), an attach after the listener was stopped still succeeds, and a caught debuggee nobody attaches is held by the system for about 30 seconds and then runs on.

  and "the SAP system" bullet gains: "The listener's stop is still owed then: the state stays held until `DebugStop`, the host or the idle bound."
- "## Restarting with stated ids": the second paragraph ("Breakpoints are different: …") becomes:

  > The reconciliation's stop also deletes the key's breakpoints, a predecessor's included (measured on premise (2026-10-11), BASIS 816: a listener's stop deletes them whether or not a listener ran); the start's own breakpoints are armed after it. Under an IDE id shared with an IDE, that IDE's breakpoints under the same key go too — sharing it is the choice described above.

- [ ] **Step 2: `CLAUDE.md`, the state-handle section**

Replace the paragraph "The debugger here debugs what it starts itself, under `debuggingMode=user`. Request-based (terminal) debugging, other users' requests and attaching to a process we did not start wait on adt-clients (fr0ster/mcp-abap-adt-clients#217)." with:

> The debugger catches requests that start after it listens: in user mode those of the connected user or of another named by `request_user` (measured end to end on premise (2026-10-11), BASIS 816; it needs the debug authorization on that user), in terminal mode those carrying the configured terminal id (the listener answers there; a catch is not measured). Attaching to a process or request already running is not something ADT can do (settled by fr0ster/mcp-abap-adt-clients#217). The identity is fixed for the life of the handle and kept until a cleanup is complete. The breakpoints belong to the key — the SAP user with the request user, or with the terminal id — shared by every IDE of that key; each change replaces the set and a listener's stop deletes it, so what a change does to another IDE's set is the host's choice (`SAP_DEBUG_BREAKPOINT_CONFLICT`).

- [ ] **Step 3: `docs/MIGRATION-18.0.md`**

```markdown
# Migrating to 18.0.0

All five packages (`lib`, `core`, `compact`, `compact-readonly`, `compact-modify`) are **18.0.0**. The debugger moved to `@mcp-abap-adt/adt-clients` 29, `@mcp-abap-adt/interfaces-adt` 15 and `@mcp-abap-adt/adt-strategies` 0.10. Nothing outside the debugger changed.

## A model, an MCP client, a configuration

Nothing to do. The tools gained optional parameters (`request_user`, `debugging_mode`, `settings`), two `DebugStep` actions (`detach`, `release_debugger`) and one tool (`DebugSetSettings`). Two things a caller may notice:

- **The breakpoints answer is the whole set.** `placed` is every breakpoint in force, not only this call's; `refused[].error` may be missing (no row answered that breakpoint, or its row gave no reason); `lost` and `unexpected` are new. See [Debugger → What a breakpoint catches](user-guide/DEBUGGER.md#what-a-breakpoint-catches).
- **A `condition` on an exception, statement or message breakpoint is refused**, naming the breakpoint. The system never evaluated it there.

## An embedder of `@mcp-abap-adt/lib/debugger`

1. **Dependencies.** Declare `@mcp-abap-adt/interfaces-adt` `^15.0.0` if you import it, and `@mcp-abap-adt/adt-clients` `^29.0.0` if you import that, so npm installs one copy: `npm ls @mcp-abap-adt/interfaces-adt` must show one version.
2. **`Debugger`** is adt-clients 29's `AbapDebugger`: `attach(identity, debuggeeId, options)` takes the identity, and `IDebuggerIdentity` states `debuggingMode` (`user` with `requestUser`, or `terminal` without). `IDebuggerBreakpoint` has no `skipCount` (a definition that sets it no longer compiles; the system ignored it) and takes an optional `clientId` on every kind. adt-clients' `docs/usage/MIGRATION-28.md` and `docs/usage/MIGRATION-29.md` have the rest.
3. **`DebugSessionPorts` gains `dropConnection(connection)`**, required: forget a connection whose ABAP session the system freed (`terminateDebugger`) and send nothing on it, not even a logoff. Ports of your own add it.
4. **`DebugSession`.** `start(conflict, options)` takes `requestUser`, `debuggingMode` and `settings` beside `breakpoints` and `run`; the constructor takes a third argument, `{ breakpointConflict }`; `identity()` is gone and `currentIdentity()` answers the identity in force. New: `detach()`, `releaseDebugger()`, `setSettings()`, `settingsInForce()`, `preferredSettings()`, `requestedBreakpoints()`.
5. **`BreakpointsAnswer`**: `{ placed, refused, lost, unexpected }`, `refused[].error` optional; `BreakpointReading` carries the echoed `clientId`. The session tags each definition it keeps with a `clientId` of its own (`bp` and a counter, never reused in the instance) and pairs the answer by it; a `clientId` on a definition you hand it is replaced on the wire. `requestedBreakpoints()` answers the definitions as you gave them.
6. **Errors.** `DebugRefusedError` (refused before anything was sent) and `DebugConflictError` (a `409`, with `conflictText` and `ideUser`; it extends `DebugListenerError`) are new.
7. **Behaviour you may rely on.** A stop releases a held stop, then stops the listener, which deletes the key's breakpoints — every IDE's under that key; it deletes by id only when the listener's stop fails. The identity and the settings stay until a stop undid everything, and a new start is refused until then; `holdsState()` stays true while a listener's stop is owed.
8. **The host's breakpoint conflict.** `createDebuggerInstance(ids?, { breakpointConflict? })`; `resolveDebuggerIds()` answers `terminalStated`; `resolveBreakpointConflict()` is new; the request scope carries `debugBreakpointConflict` (header `x-sap-debug-breakpoint-conflict`, `SAP_DEBUG_BREAKPOINT_CONFLICT` in a destination's `.env` or the environment). A host overriding `BaseMcpServer.debuggerFor()` passes the option there.
```

- [ ] **Step 4: README, docs index, CLI options, client configuration**

- `README.md` line 97: "Coming from 17.x? See the [18.0 migration note](docs/MIGRATION-18.0.md) — the debugger's embedder surface moved to adt-clients 29. From 16.x, the [17.0 note](docs/MIGRATION-17.0.md) first."
- `README.md`, the Debugger bullet (line 217): "breakpoints (line, exception, statement, message; a line breakpoint may carry a condition), a background run of a class or report caught at them, another user's requests and terminal mode, stack, variables, watchpoints, steps, leaving a debuggee running, the debugger settings, memory sizes and snapshots. … A breakpoint catches every request of the request user (the connected SAP user unless another is named), so the set is never on by default."
- `README.md` docs list, above the 17.0 line: `- **[docs/MIGRATION-18.0.md](docs/MIGRATION-18.0.md)** - The debugger on adt-clients 29: what an embedder of lib/debugger changes`.
- `docs/README.md`, above the 17.0 line: `- **Upgrading from 17.x**: [Migration to 18.0](MIGRATION-18.0.md)`.
- `docs/user-guide/CLI_OPTIONS.md`, after the `SAP_DEBUG_TERMINAL_ID`, `SAP_DEBUG_IDE_ID` bullet, the bullet gains "Terminal mode keys on the terminal id and is refused when none is stated." and a new bullet:
  `- \`SAP_DEBUG_BREAKPOINT_CONFLICT\` - \`replace\` (default) or \`refuse-if-held\`: whether a change of the debugger's breakpoints first asks if another IDE of the same SAP user holds them, and refuses if so. Same order (the \`x-sap-debug-breakpoint-conflict\` header first). An unknown value is refused. See [Debugger](DEBUGGER.md#the-breakpoint-set-and-its-key)`
- `docs/user-guide/CLIENT_CONFIGURATION.md`: a table row after `x-sap-debug-ide-id`: `| \`x-sap-debug-breakpoint-conflict\` | No | \`replace\` or \`refuse-if-held\` ([Debugger](DEBUGGER.md#the-breakpoint-set-and-its-key)); wins over the destination's \`.env\` and the environment | \`refuse-if-held\` |`; in the `.env` example `# SAP_DEBUG_BREAKPOINT_CONFLICT=replace` after `SAP_DEBUG_IDE_ID`; the request-scope sentence lists `x-sap-debug-breakpoint-conflict` with the two debug ids.

- [ ] **Step 5: The 18.0.0 metadata**

```bash
sed -i 's/"version": "17.2.2"/"version": "18.0.0"/' package.json server/package.json compact/package.json compact-readonly/package.json compact-modify/package.json
sed -i 's/"version": "17.2.2"/"version": "18.0.0"/g' server.json server-compact.json
sed -i -E 's#"(@mcp-abap-adt/(lib|core|compact-readonly|compact-modify))": "\^17\.[0-9]+\.[0-9]+"#"\1": "^18.0.0"#' server/package.json compact/package.json compact-readonly/package.json compact-modify/package.json
sed -i 's/^ARG CORE_VERSION=.*/ARG CORE_VERSION=18.0.0/' docker/Dockerfile.inspect
npm install --package-lock-only
grep -n '"version": "1[78]\.' package.json server/package.json compact/package.json compact-readonly/package.json compact-modify/package.json server.json server-compact.json
grep -n '"@mcp-abap-adt/\(lib\|core\|compact-readonly\|compact-modify\)"' server/package.json compact/package.json compact-readonly/package.json compact-modify/package.json
grep -n '"link": true' package-lock.json
```

Expected: every version 18.0.0, every sibling range `^18.0.0`, no `link`.

`CHANGELOG.md`, above `## [17.2.2]` — the date is `date +%F` on the day of the release commit:

```markdown
## [18.0.0] - <date +%F>

The debugger on `@mcp-abap-adt/adt-clients` 29 (`interfaces-adt` 15, `adt-strategies` 0.10): another user's runs, terminal mode, leaving a debuggee running, the debugger settings — and breakpoints armed as one set. Migration: [`docs/MIGRATION-18.0.md`](docs/MIGRATION-18.0.md).

### Added

- `DebugStartListener` and `DebugTakeOverListener` (compact `HandlerDebugStart`, `kind: abap`) take `request_user` (whose requests are caught; needs the debug authorization on that user), `debugging_mode` (`user` | `terminal`; terminal keys on the configured terminal id and is refused without one) and `settings` (applied after each attach). The start answers the identity in force.
- `DebugStep` (compact `HandlerDebugStep`): `detach` and `release_debugger`, ABAP only — the program runs on, the session listens on.
- `DebugSetSettings`: the debugger settings at the current stop; answers the settings in force. 30 debugger tools.
- `SAP_DEBUG_BREAKPOINT_CONFLICT` (`replace` | `refuse-if-held`): the header `x-sap-debug-breakpoint-conflict`, a destination's `.env`, the environment, `createDebuggerInstance`'s `breakpointConflict`.

### Fixed

- A second `DebugSetBreakpoints` removed the breakpoints of the first, and an ambiguous refusal re-asked with `validationOnly` removed the whole set: the system replaces the key's set on every request (measured on premise (2026-10-11), BASIS 816). The session sends its whole set every time, each breakpoint tagged with a `clientId` the system echoes, and pairs the answer rows by that tag without re-asking.

### Changed

- The breakpoints answer is the whole set: `placed`, `refused` (this call's, each with its definition), `lost`, `unexpected`. A delete by an id the session does not hold is refused before the wire.
- A condition on a non-line breakpoint is refused, naming it.
- `DebugStop` stops the listener first, which deletes the key's breakpoints, and deletes by id only when that fails; a start that failed after a change does the same. The identity and the settings stay until a stop undid everything, and a new start is refused until then.
- A listener conflict (`409`) names the holder: the system's conflict text and the IDE user.
- `@mcp-abap-adt/adt-clients` `^29.0.0`, `@mcp-abap-adt/adt-strategies` `^0.10.0`, `@mcp-abap-adt/interfaces-adt` `^15.0.0` (the breakpoint types lose `skipCount` and gain `clientId`); `@mcp-abap-adt/compact-modify` declares `interfaces-adt`, which it imports. `@mcp-abap-adt/core`, `@mcp-abap-adt/compact` and the two compact halves require `@mcp-abap-adt/lib` `^18.0.0`.
```

- [ ] **Step 6: Generated tool docs**

```bash
npm run docs:tools
npm run build && npm --prefix compact run docs:tools
git diff --stat docs/user-guide/AVAILABLE_TOOLS*.md compact/docs/AVAILABLE_TOOLS.md
```

Expected: the Debug group lists `DebugSetSettings` and the new parameters; compact's `HandlerDebugStart` and `HandlerDebugStep` show theirs.

- [ ] **Step 7: The gate, the release tests, the bin smoke**

```bash
npm run lint && npm run build && npm run test:check && npm run lint:check
npx jest src/__tests__/unit/releaseMetadata.test.ts src/__tests__/unit/binSmoke.test.ts src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts
npm test 2>&1 | tee /tmp/debugger-28-unit.log
npm --prefix server run test:check && npm --prefix server test 2>&1 | tee /tmp/debugger-28-server.log
npm run release:dry 2>&1 | tee /tmp/debugger-28-release-dry.log
grep -rnE '\b[A-Z0-9]{3}K9[0-9]{5}\b' docs/MIGRATION-18.0.md docs/user-guide/DEBUGGER.md CHANGELOG.md CLAUDE.md | head
```

Expected: green; `binSmoke` ran (not skipped — if it says skipped, say why and run it where the network is available); `release:dry` reports the five packages built; the last grep prints nothing.

- [ ] **Step 8: Commit**

```bash
git add docs CLAUDE.md README.md CHANGELOG.md package.json package-lock.json server/package.json compact/package.json compact-readonly/package.json compact-modify/package.json server.json server-compact.json docker/Dockerfile.inspect compact/docs/AVAILABLE_TOOLS.md
git diff --cached --stat
git commit -m "$(cat <<'EOF'
chore(release): 18.0.0 — the debugger on adt-clients 29; docs, migration note, release metadata

DEBUGGER.md: another user, terminal mode, the breakpoint set and its key,
SAP_DEBUG_BREAKPOINT_CONFLICT, detach and release_debugger, the settings,
what ADT cannot do. CLAUDE.md's state-handle section says what now holds.
MIGRATION-18.0.md for embedders of lib/debugger. The five packages at
18.0.0 with sibling floors ^18.0.0; server.json, server-compact.json and
the Glama pin follow; the tool references are regenerated.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

---

## Task 11: Final review — Codex read-only, the whole gate, the spec and plan leave the tree

**Files:**
- Delete: `docs/superpowers/specs/2026-10-11-debugger-adt-clients-28-design.md`, `docs/superpowers/plans/2026-10-11-debugger-adt-clients-28.md` (implemented; history keeps them)

- [ ] **Step 1: Codex review, read-only**

Dispatch Codex (the `codex:rescue` skill) with an explicit read-only brief: "Review the diff `git diff main...feat/debugger-adt-clients-28` against the spec `docs/superpowers/specs/2026-10-11-debugger-adt-clients-28-design.md`. Do not modify any file. Report findings with file and line: spec coverage gaps; the six Review Focus items of `docs/superpowers/plans/2026-10-11-debugger-adt-clients-28.md`; anything sent to the system before a refusal that should come before the wire; any path where a cleanup deletes breakpoints of a key it did not change; any description or test text that names a concrete object, user, system or transport." Read every finding; check each against the code; fix the ones that hold, each as its own commit with a test where behaviour changes; answer the others with the evidence. Re-run the review on the fixes until it reports nothing that holds.

- [ ] **Step 2: The whole gate once more**

```bash
npm run lint && npm run build && npm run test:check && npm run lint:check
npm test 2>&1 | tee /tmp/debugger-28-unit.log
npm --prefix server run test:check && npm --prefix server test 2>&1 | tee /tmp/debugger-28-server.log
grep -n '"link": true' package-lock.json
npm ls @mcp-abap-adt/interfaces-adt
```

- [ ] **Step 3: The spec and the plan leave the tree**

Only once Tasks 1–10 are done and the user has seen Task 9's run:

```bash
git rm docs/superpowers/specs/2026-10-11-debugger-adt-clients-28-design.md docs/superpowers/plans/2026-10-11-debugger-adt-clients-28.md
git commit -m "$(cat <<'EOF'
docs: the debugger-on-adt-clients-28 spec and plan are implemented — history keeps them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01V3NP1eYKcGJkWYoRMgqKjL
EOF
)"
```

- [ ] **Step 4: Hand over**

Push the branch (`git push`), mark PR #293 ready for review only when the user says so, and report: the commits, the Codex findings and what was done with each, Task 9's `MEASURE` lines (the breakpoint answers' pairing above all), and the release order for the user to publish — `lib`, `compact-readonly`, `compact-modify`, `core`, `compact` (`npm run release:publish`), then `mcp-publisher publish server.json` and `mcp-publisher publish server-compact.json`, then a clean install from the registry outside the repository (`npm i -g --prefix "$(mktemp -d)" @mcp-abap-adt/core@18.0.0` and `@mcp-abap-adt/compact@18.0.0`, each bin's `--version`). The agent publishes nothing.
