# HTTP long session — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/2026-10-22-http-long-session-goal.md` (issue #308).

**Spec:** `docs/superpowers/2026-10-22-http-long-session-design.md` — the binding authority; read it
before any task.

**Architecture:** the pool (`server-runtime/src/http/InstancePool.ts`) already pins a call carrying a
`state_handle` to the instance that holds state. The work adds: unique handles in the pool; a
declared `state_handle` argument on the Streamable HTTP binaries; a `LongSession` state part with
open/close tools; close as the existing instance close (`src/lib/instanceClose.ts`) started by the
pool after the close call's answer, with the instance unindexed at once.

**Tech stack:** TypeScript, the MCP SDK, Jest (`npm test` scripts only), Biome.

## Global constraints

- npm scripts only, never `npx`. Never pass `--testPathIgnorePatterns` without the defaults; run
  `--listTests` first when narrowing.
- No timer of the server's anywhere new: waits end on a result, the backend, the idle bound (the
  owner's existing exception) or shutdown.
- The handle stays a bearer secret: 128 bits from `randomBytes`, never logged; no caller check, no
  limit per owner, no list tool.
- stdio and SSE tool surfaces and behaviour unchanged; the session tools and the declared
  `state_handle` exist only on `http`, `http-ro`, `compact-http`, `compact-http-ro`.
- No dependency change; the lockfile is not touched.
- Commits GPG-signed, English, with the session trailers; if signing fails, stop.
- `CHANGELOG.md`: only the `[19.3.0]` entry may change, its date set on every change.
- Subagents never edit `CLAUDE.md` or `SCOPE.md`.
- No live SAP contact in any task but the last, and that one only on the owner's go.
- Each new test is load-bearing: break the rule it protects, watch it go red, revert.

## Review focus

1. A call with the header and a different `state_handle` argument: the header wins, as today — the
   argument never overrides it.
2. A handle that was closed, then a call carrying it: `state is not available`, nothing created, no
   logon.
3. `SessionOpen` called with the handle of an instance holding a lock: same handle answered, the lock
   kept, one instance.
4. A JSON-RPC batch carrying `state_handle`: still `400`, the session tools included.
5. A long session whose SAP session ended on the SAP side (spent connection): the next call carrying
   the handle reconnects as `getConnection` does today, and close still logs off what it owns.

---

### Task 1: unique handles in the pool

**Files:** `src/lib/state/InstanceState.ts`, `server-runtime/src/http/InstancePool.ts`,
`server-runtime/src/http/StreamableHttpServer.ts`; tests beside them.

- [ ] Write the failing tests: a handle minted while the pool holds an instance whose handle the
      random source would repeat is drawn again (inject the random source in the test); the same at
      rotation; two instances created in a row never share a handle.
- [ ] Run them: red.
- [ ] `InstanceState` takes an optional `isTaken(handle: string): boolean` from its host and draws
      again while it answers `true`, at creation and at rotation; the pool supplies one that checks
      its index. stdio/SSE pass none.
- [ ] Run the tests and the existing pool and state tests: green.
- [ ] Commit.

### Task 2: `state_handle` declared on the HTTP binaries; texts name the argument

**Files:** the tool-registration path in `src/embeddable/BaseMcpServer.ts` (schema to zod at
registration), `server-runtime/src/http/StreamableHttpServer.ts` (`createPerRequestServer`),
`src/lib/state/heldLocks.ts`, the descriptions in `compact-modify/src/handlers/handleHandler{Lock,
Update,Delete,Unlock}.ts`, `src/lib/compact/batch/handleHandlerBatch.ts`,
`src/handlers/batch/batch/handleBatchBegin.ts`, the debug batch begin handlers; a new HTTP surface
test and fixture. The entry fixtures `tests/fixtures/tools/surface.json` and
`compact/tests/fixtures/surface.json` enumerate transport-independent groups and entries: they stay
as they are (only description text changes there).

- [ ] Write the failing tests: on the per-request HTTP server every tool's schema has an optional
      string `state_handle` with the spec's description, and the debugger tools keep theirs
      (required where required today); stdio and SSE servers' schemas are byte-identical to today's
      fixtures; the held-lock refusal reads exactly as in the spec; over a real HTTP server
      `HandlerLock` → `HandlerUpdate` → `HandlerUnlock` succeed with the handle only as an argument
      and no header.
- [ ] Run them: red.
- [ ] One function adds the property to a schema that lacks it; the registration applies it only
      when the host states it (an option the HTTP per-request server sets). Update the refusal and
      the descriptions to the spec's words.
- [ ] Add an HTTP surface test that enumerates the schemas actually registered by a per-request
      HTTP server for each of `http`, `http-ro`, `compact-http`, `compact-http-ro`, against a new
      fixture written by that test's own update switch (as the existing surface tests do); the
      entry fixtures change only by the description texts above.
- [ ] Run the full unit suite: green.
- [ ] Commit.

### Task 3: the `LongSession` part and the open tools

**Files:** new `src/lib/state/longSession.ts`; `src/embeddable/BaseMcpServer.ts` (attach the part
when the host states it, as `HeldLocks`); new handlers for `SessionOpen` (full) and `HandlerSession`
action `open` (compact), in the groups the HTTP binaries register; the batch dispatch in
`BaseMcpServer.registerHandlers` / `recordCall`.

- [ ] Write the failing tests: open on a fresh HTTP instance answers the instance's handle and the
      pool keeps the instance; two calls carrying it run on it with one SAP connection, one
      `systeminformation` and no logoff (stub connection counting requests); open carrying the
      handle of an instance holding a lock answers that handle and keeps the lock; open while a
      communication batch and while a debugger batch is open runs at once, is not recorded and
      leaves the batch open; the tools are absent on stdio and SSE and present on `-ro`.
- [ ] Run them: red.
- [ ] Implement the part (`holdsState()` while open) and the open handlers; register the session
      tools only on the HTTP binaries, marked read-only; let them bypass batch recording the way the
      batch control tools do.
- [ ] Run the full unit suite: green.
- [ ] Commit.

### Task 4: close — the instance close, started by the pool

**Files:** `server-runtime/src/http/InstancePool.ts` (an operation that unindexes an instance and
starts `closeInstance` on it), `server-runtime/src/http/StreamableHttpServer.ts`, the close handlers
(`SessionClose`, `HandlerSession` action `close`), `src/lib/instanceClose.ts` (its header comment: the
whole close awaits the logoffs' answers, `logoffsAnswered`, not only their writes).

- [ ] Write the failing tests: close answers, names what the instance held (locks, a batch, a debug
      session), and after its response the instance is unindexed in the same tick and the instance
      close runs — every owned connection's `disconnect()` once, an open batch and its answers
      dropped with nothing sent; a later call with the handle answers `state is not available`
      with nothing created; a call queued behind close is refused; with a stub whose logoff is
      written but never answered, a later call with the handle is refused at once and the shutdown
      still awaits that close; close without a handle or with an unknown one answers
      `state is not available`; close runs at once while a batch is open.
- [ ] Run them: red.
- [ ] The close handler only marks the instance for closing and answers; the pool, when that call
      settles, removes the instance from its index and starts `closeInstance` without awaiting it
      inside routing. The shutdown keeps awaiting running instance closes.
- [ ] Fix the `instanceClose.ts` header comment to what the code does.
- [ ] Run the full unit suite: green.
- [ ] Commit.

### Task 5: the idle bound ends a long session

**Files:** tests only, unless one goes red.

- [ ] Write the test: an open long session with no call for the bound (fake timers in the test only)
      is ended: its SAP session logged off, the instance out of the pool, the handle unknown.
- [ ] Run it; if green with the rule intact, prove it load-bearing by disabling the part's
      `holdsState()` and watching it go red; revert.
- [ ] Commit.

### Task 6: transport-aware tool documentation

**Files:** `tools/generate-tools-docs.js` (selects groups with transport `stdio`),
`compact/tools/generate-docs.js` (renders entry schemas before any HTTP registration), their
outputs.

- [ ] Write the failing check: the generated docs of the HTTP binaries name the optional
      `state_handle` argument of every tool and list the session tools; the stdio and SSE docs do
      not; the generated text no longer says HTTP serves the stdio set minus the leftover-session
      tools without these additions.
- [ ] Run it: red.
- [ ] Make both generators read the HTTP surface from the same registration the HTTP server uses
      (Task 2's function and Task 3's registration), and render it as the HTTP section of the
      existing documents, beside the stdio set.
- [ ] Regenerate; run the check: green.
- [ ] Commit.

### Task 7: documentation, changelog

**Files:** `http/README.md`, `compact-http/README.md`, `README.md`, `compact/README.md`,
`docs/user-guide/{CLIENT_CONFIGURATION,BATCH_MODE,DEBUGGER}.md`,
`docs/architecture/STATEFUL_SESSION_GUIDE.md`, `docs/MIGRATION-19.0.md` only where it states the
current contract, `server-runtime/src/http/launcher.ts` help text; `CHANGELOG.md`.

- [ ] The argument first, the header as the alternative; the long session (open, use, close, the
      idle bound, the model keeps its handles); what another credential does on a held instance, as
      the code does it (the session and its locks kept, the credential taken over).
- [ ] `CHANGELOG.md` `[19.3.0]`, dated.
- [ ] Run lint, typecheck and the unit suites as CI runs them.
- [ ] Commit.

### Task 8: live check (owner's go only)

- [ ] Ping the system first. Over `compact-http`, one scenario through a long session: open, a read,
      lock, update, unlock, close; count SAP requests per call with `DEBUG_HTTP_WIRE=true`; check in
      SM04 minutes later that the session is gone. Temporary objects in `$TMP`, deleted after.
- [ ] Record the measured numbers in the PR description.

### Before the release

- [ ] Delete this plan, the goal and the spec from `docs/superpowers/`; carry anything they still owe
      into the PR description.
