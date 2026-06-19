# Dump integration test — isolate the dump trigger on a separate connection

**Status:** design (approved, pre-implementation)
**Scope:** `src/__tests__/integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts` only.

## Problem

The integration test `should create dump by division by zero and read/analyze
created dump` is unreliable:

- When the division-by-zero class is **inactive** (the soft-mode
  `createRunnableClass` never activated it), the forced run does **not** produce
  a dump → the test logs `SKIP: no runtime dump found` and silently passes
  without exercising the dump-read path (a false green).
- When the class **is** activated and the forced run actually dumps (HTTP 500),
  the very next call on the **same connection** —
  `RuntimeListFeeds(feed_type: 'dumps')` → `GET /sap/bc/adt/runtime/dumps` —
  fails with a server-side `400 "Session Timed Out or Not Found / Session no
  longer exists"`, and the test fails on `expect(listResult.isError).toBe(false)`.

### Root cause (confirmed by investigation)

- The dumping run consumes/clears the **application-level stateful context**
  that lives on the server *outside* the HTTP session, but is associated with
  the `sap-adt-connection-id` used by that connection.
- The HTTP session itself does **not** drop (the server cookie / session id are
  unchanged; toggling stateful↔stateless does not change the session). So the
  `400 "session no longer exists"` is about the application-level context, not
  the HTTP logon session.
- Reading the dumps feed on that same connection right after the dump therefore
  hits "context is gone" and surfaces the 400. Polling longer does not help
  (verified: 15→30 attempts, 2s→5s — still fails), because the context is gone,
  not late.
- This is **not** a connection-package defect. The connection layer is
  intentionally connection/transport-agnostic; it correctly leaves
  session-resurrection out of scope. Adding "session not found" recovery there
  would be fixing the wrong layer for what is, in practice, a test-only scenario
  (deliberately dumping a class is not a real user workflow).

## Goal / success criteria

The dump test **actually creates a dump and reads it back** — it no longer
silently skips and no longer fails on the `400 session` error. The fix stays
entirely in the test; `connection`, `adt-clients`, and the MCP handlers are
untouched. No npm release is involved (test-only change, excluded from `dist/`).

## Design

Isolate the dump **trigger** on its own throwaway connection, and read the dump
on the test's main (clean-context) connection.

### Components / data flow

1. **Dedicated trigger connection (soft mode)** — the dump class's whole
   lifecycle runs on a second connection from a fresh
   `createTestConnectionAndSession()`:
   - create the division-by-zero class,
   - **activate** it — required so the forced run actually executes the
     `lv_num / lv_den` (with `lv_den = 0`) and produces the dump. Activation
     itself does not execute code, so it never dumps; if activation ever dumped,
     that would be an ABAP-system defect, not this test's concern. (Activation
     support in the class helper is added per the resolved open question below;
     `createRunnableProgram` already activates, so there is precedent.)
   - forced run (`classrun`) → HTTP 500 → a real runtime dump is recorded
     server-side under the connection's user. The 500 / context loss now lands
     on the **throwaway** connection.
2. **Hard mode is transport-specific.** This bug is a soft-mode phenomenon: soft
   mode reuses one persistent direct connection, whose application context the
   dumping run consumes. In **HTTP hard mode** each tool call is independent
   (server-side stateless per request), so the same-connection poisoning does
   not arise the same way, and `LambdaTester` additionally **caches** its
   hard-mode client. Therefore the trigger-connection isolation is implemented
   for **soft mode**. If hard-mode isolation is ever needed, the trigger path
   must **bypass `tester.invokeToolOrHandler`** and own a fresh
   `createHardModeClient()` lifecycle (with its own `close()`), not reuse the
   cached tester client. The integration suite runs soft mode by default
   (`integration_hard_mode.enabled: false`).
3. **Main connection (unchanged context)** reads the result and cleans up:
   - `RuntimeListFeeds(feed_type: 'dumps', ...)` with the existing retry loop,
   - `RuntimeGetDumpById(dump_id, view)` + the summary read.
   Because this connection never ran the dumping class, its application context
   is intact and the feed read succeeds.
4. The dump is keyed to the **user**, not the connection, so the dump produced
   via the trigger connection is visible to the feed read on the main
   connection (same trial user).
5. **Cleanup** — delete the dump class via the **main (clean-context)
   connection**, because the trigger connection's application context was just
   destroyed by the dump and a delete there could itself hit
   `session no longer exists` and leak the generated class. Object identity is
   server-wide, so `deleteClassIfExists` on the main connection acquires its own
   lock and deletes regardless of which connection created the class. A delete
   via the trigger connection is at most a best-effort fallback.

### What stays the same

- The profiling sub-test (`should create class, run with profiling, …`) is
  unchanged — its run does not dump, so it does not lose its context; it already
  passes on the main connection (the CPU-workload fix, PR #116).
- Feed-retry knobs (`dump_feed_retries`, `dump_feed_retry_delay_ms`,
  `dumps_user`, `dump_feed_top`) and their config defaults are unchanged.
- `@mcp-abap-adt/connection`, `@mcp-abap-adt/adt-clients`, and all MCP handlers
  are untouched.

### Error handling

- The forced dumping run is still expected to error (HTTP 500) and is caught/
  logged exactly as today ("Expected failing run for dump generation: …").
- If the trigger connection cannot be created (no SAP config), the test skips
  cleanly, same as the existing config-driven skip behaviour.
- **Teardown is transport-specific.** Soft-mode HTTP connections have no
  network `close`/`disconnect` (HTTP is connectionless; session state is the
  client-side cookie). `createTestConnectionAndSession()` returns
  `{ connection, session, ... }` with **no close handle**, so "teardown" for the
  trigger connection means: stop using it and drop the reference; optionally
  call `connection.reset()` (available on the HTTP connection) to clear its
  local cookie/CSRF state. There is no server-side logout to perform and nothing
  leaks by letting it be garbage-collected. (Only a hard-mode
  `createHardModeClient()` — if ever used for the trigger path — owns a real
  `close()` that must run in a `finally`.)

### Testing

Run `RuntimeProfilingAndDumps` against the trial cloud system:

- the dump sub-test **creates a dump and reads it** (no `SKIP: no runtime dump
  found`, no `400 session` failure),
- the profiling sub-test stays green,
- full suite green.

## Resolved open question — how the dump class gets activated

The soft-mode `createRunnableClass` currently does create + update but **does
not activate**. The dump class must be active to run and dump.

**Decision:** add an optional `activate` flag to `createRunnableClass` (default
`false`). When `true`, the soft-mode path passes `{ activateOnUpdate: true }` to
`client.getClass().update(...)`. The dump path calls it with `activate: true`;
the profiling path keeps the default (`false`), so its behaviour — already green
via the CPU-workload fix — is unchanged. This keeps a single helper (DRY) and
mirrors `createRunnableProgram`, which already activates. A separate helper was
rejected as duplication.

## Out of scope

- Any `connection` / `adt-clients` change (e.g. "session not found" detection +
  retry). Explicitly rejected: the connection layer is agnostic by design and
  the dumping-class scenario is a test artifact, not a real user workflow. If a
  real consumer (e.g. cloud-llm-hub) is later shown to run a dumping class and
  then read dumps on the same connection, that product-side resilience would be
  designed separately.
- The profiling sub-test and its CPU-workload fix (already merged, PR #116).
