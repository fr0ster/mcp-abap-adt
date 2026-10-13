# Background runs of the code-running tools

## Goal

A run of ABAP code — `RuntimeRunClass`, `RuntimeRunProgram` (and compact's `HandlerProfileRun`) —
may write and may run long. It cannot be cut: measured on E19 (2026-10-13), a running synchronous
request dies when its socket closes or its session is logged off, and its write is lost. So instead
of a `timeout`, the user may start such a run **in the background**: the call answers at once with a
handle, the run goes on to SAP's answer on a connection of its own, and the user reads the result
later by the handle — or never.

## The tools

- **`background: true`** on `RuntimeRunClass`, `RuntimeRunProgram` and `HandlerProfileRun` (both
  profiling modes). No default: without it the tool waits as today.
  - The server opens the run's own stateless connection (the fresh-connection path, §4.3), sends
    the run request, and answers at once, in fixed words: started in the background, with its
    **`run_handle`** (random, 128 bits).
  - The run's request is never cut: its socket and its connection stay open until SAP answers. Then
    the answer is kept under the handle and the connection is closed with `disconnect()` (the logoff).
- **`GetBackgroundRun { run_handle }`** (full) / **`HandlerBackgroundRunGet`** (compact): `running`,
  or `finished` with what the run tool would have answered (SAP's answer as it is, an error
  included). Reading does not remove it.
- **`ListBackgroundRuns`** (full) / **`HandlerBackgroundRunList`** (compact): the caller's runs —
  handle, tool, object, when started, `running` / `finished`. No output.
- **`DiscardBackgroundRun { run_handle }`** (full) / **`HandlerBackgroundRunDiscard`** (compact):
  removes a finished run's kept answer. A running one cannot be discarded (it cannot be stopped).

## A strategy: the contract in the library, the implementation in the server

Where background runs and their answers live is the host's (the user's rule: everything a consumer
may want differently is a strategy):

- **`@mcp-abap-adt/lib` holds the contract** (`IBackgroundRuns`: start → handle, get, list, discard,
  each checked against the caller) and the run itself: the library opens the run's own connection,
  sends the request, waits for SAP's answer and logs the connection off after it. The strategy
  decides only where runs and answers are kept and how a handle is found.
- **The server (`mcp-abap-adt`, `-http`, `-sse`) ships the implementation:** in the process's memory.
  The host (our launcher) creates it and hands it to the server instances (no module global); it may
  take an instance id from the host as the handle's prefix (routing a handle to its instance is the
  host's).
- **An embedder** (e.g. cloud-llm-hub) passes its own (a store of its choosing, its own routing
  between replicas). **Without a strategy, `background: true` is refused** in fixed words, as a
  fresh-connection operation is without `freshConnection` (§4.3) — no silent default in the library.

## Ownership and lifetime (the MCP rules)

- **Possession of a handle is not authorization.** Every call checks the pair (handle, caller): the
  caller is the destination identity and the backend user its request resolved. An unknown handle
  and someone else's handle get the same answer: not available.
- **No timeouts.** A kept answer stays until the user discards it (`DiscardBackgroundRun`) or the
  process ends. **A limit of 16 per owner** (running plus kept; the user's number): a new background
  run beyond it is refused in fixed words naming the limit and `DiscardBackgroundRun`.
- **Ends:** the orderly shutdown and an instance close wait for running background requests (they
  may write) before their logoff, as for a running tool; the forced close logs them off at once,
  which cuts them (the user's escape). The server's in-memory answers end with the process.
  `tools/connection-ends.json` gains the background run's connection: ended after SAP's answer, or
  by the forced close.

## Out of scope

Background runs of anything else (the unit-test runs and ATC already are SAP-side runs with their
own ids); persisting kept answers across processes; stopping a run.

## Decided by the user (2026-10-13)

The limit is 16 per owner; discarding is its own tool; the store is a strategy — the server's in
memory, an embedder's its own. No process-wide limit: 16 per owner is enough (the user).
