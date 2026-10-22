# Design: held state by argument, and a long session over Streamable HTTP

Answers `docs/superpowers/2026-10-22-http-long-session-goal.md` (issue #308).

## What exists (measured in the code at ee887288)

- `server-runtime/src/http/InstancePool.ts` serves each request on a new per-request server
  instance unless it carries the `state_handle` of an instance that holds state. It reads the
  handle from the `x-mcp-state-handle` header first, else from a single `tools/call`'s
  `arguments.state_handle` (`handleFrom`, `handleOf`). An unknown handle on a tool call is answered
  `state is not available` with nothing created or logged on. A JSON-RPC batch carrying
  `state_handle` is refused `400`.
- An instance is kept while `InstanceState.holdsState()` — any attached part holds state:
  `InstanceBatch` (a batch open or answers kept), `HeldLocks` (a compact lock held), the debugger.
  When the state empties, the pool evicts the instance: `dispose()`, then `terminalClose()`, which
  logs off every connection it owns.
- The handle is 128 bits from `randomBytes`, rotated when the state empties after
  `endWhenEmpty()`.
- The idle bound lives in `InstanceState`: armed while something is held and no call runs, reset
  only by tool calls; at expiry it ends the state, the pooled instance's `idleStopped()` runs
  `terminalClose()`, and the emptied state evicts the instance.
- A request with other credentials on a held instance keeps its SAP session and locks; only the
  credential is taken over (`BaseMcpServer.getConnection`, `compactLockChain.test.ts`).
- Tool schemas pass through `jsonSchemaToZod` into a non-strict `z.object`: an undeclared argument
  is stripped before the handler, not refused.

## Design

### 1. `state_handle` is a declared argument on the HTTP binaries

- On the Streamable HTTP binaries (`http`, `http-ro`, `compact-http`, `compact-http-ro`) every
  tool's input schema carries an optional `state_handle` string property:
  "The state_handle a long session, a lock or a batch answered: the call runs on the server
  instance that holds that state. Without it the call runs on a new instance." Tools whose schema
  already declares it (the debugger's) keep their own declaration, required where it is required
  today.
- The declaration is added where the HTTP server registers its tools, from one function, so stdio
  and SSE register the schemas they register today, unchanged.
- The pool routes by the argument as it does today; the header still comes first when present.
- Every text that tells the model to send the handle names the argument, the header as an
  alternative for clients that set headers:
  - the held-lock refusal (`src/lib/state/heldLocks.ts`): "lock_handle is not held by this
    instance: send the state_handle HandlerLock answered as the state_handle argument (or in the
    x-mcp-state-handle header)";
  - the descriptions of `HandlerLock`, `HandlerUpdate`, `HandlerDelete`, `HandlerUnlock`,
    `HandlerBatch`, `BatchBegin`, `DebugBatchBegin`, and of the compact debug batch: "send it as the
    state_handle argument of every call …".

### 2. The long session

- **Tools.** Full HTTP binaries: `SessionOpen` and `SessionClose`. Compact HTTP binaries: one tool
  `HandlerSession` with `action: 'open' | 'close'` (the compact batch's pattern). All are
  read-only: they hold or end a session and change nothing in the system, so the `-ro` binaries
  carry them too. They are registered only on the Streamable HTTP binaries.
- **State part.** A new `LongSession` part of `InstanceState`, attached only by the HTTP host, as
  `HeldLocks` is: it holds state while open.
- **Open.** On an instance with nothing held (a call without a handle reaches a new one), open
  marks the part open and answers `{ state_handle }`, the instance's handle; the pool keeps the
  instance because it now holds state. On an instance that already holds state (the call carried
  its handle), open marks the part open and answers the same handle. Opening an open session
  answers its handle again.
- **Calls.** A call carrying the handle runs on that instance, on its held SAP connection: no new
  connection, no `systeminformation` lookup, no logoff. A call without it runs as today, on a new
  instance.
- **Close.** Ends the instance's held state the way the idle bound does — `endWhenEmpty()`, then
  `dispose()` of every part — and logs the SAP session off (`terminalClose()`); the pool evicts the
  instance and the handle rotates (the old one answers `state is not available`). Whatever else the
  instance held ends with it: a lock is released by the logoff, a batch is dropped with nothing
  sent, its kept answers are dropped, a debug session is ended. Close answers what it ended. Close
  without a handle, or with an unknown one, answers `state is not available`.
- **Close when a part's cleanup fails or is still finishing.** Close runs the idle bound's own stop
  (`InstanceState.expire`'s steps, one function for both) and inherits its contract: the terminal
  close of the instance's connections runs whatever the disposal answered, so a failed cleanup never
  keeps a SAP session or a lock open; a part whose cleanup failed (a debugger whose cleanup threw)
  or is still finishing (a pending AMDP cleanup) stays held, so the instance stays in the pool and the
  handle stays routable. Close then answers that the state did not end, naming the failed parts, and
  calling close again with the same handle retries the cleanup; the idle bound retries it as well.
  A call queued on the instance behind close runs after it; any other call on such an instance opens
  a new SAP session, as on a new instance.
- **Idle bound.** Nothing new: an open long session is held state, so the existing bound
  (`--state-idle-minutes`, default 30) arms between calls; at expiry the SAP session is logged off
  and the instance leaves the pool.
- **Batch mode.** The session tools run at once, never recorded: while a communication batch or a
  debugger batch is open they bypass batch recording and its refusal of connectionless tools, the
  way the batch's own control tools do; open neither ends nor flushes the batch. Closing a session
  while a batch is open drops the batch as described under Close.
- **No list tool.** The model keeps the handles it opened; the handle is its only link to its long
  session, and nothing on the server tells it which sessions it opened. The handle is a bearer
  secret and the server does not identify the caller, so there is nothing to list by.

### 3. Documentation

- `http/README.md`, `compact-http/README.md`, `README.md`, `docs/user-guide/{CLIENT_CONFIGURATION,
  BATCH_MODE,DEBUGGER}.md`, `docs/architecture/STATEFUL_SESSION_GUIDE.md`, `compact/README.md`:
  the argument first, the header as the alternative; the long session (open, use, close, idle
  bound); what another credential does on a held instance, as the code does it.
- Generated tool docs regenerated (`npm run docs:tools`, compact `docs:tools`).
- `CHANGELOG.md` `[19.3.0]`.

## Tests

- Tool surfaces: the HTTP binaries' schemas carry `state_handle` and the session tools; stdio and
  SSE surfaces unchanged (the surface fixtures and parity tests).
- Pool, over a real HTTP server: Lock → Update → Unlock with the handle only as an argument, no
  header; the refusal names the argument.
- Long session: open answers a handle; calls carrying it reuse the instance and its SAP connection
  (one connection, one `systeminformation`, no logoff in between); close evicts and logs off and the
  handle is then unknown; close with a lock held releases it (logoff) and evicts; open while a
  communication batch and while a debugger batch is open runs at once, is not recorded and leaves
  the batch open; close while a batch is open, or with answers kept, drops them, logs off and evicts;
  close with a debugger cleanup that throws, and with a pending AMDP cleanup: the connections are
  closed, close answers the state did not end, the handle still routes, a second close retries, and
  a call queued behind close runs after it; the idle bound ends an open session and logs it off.
- Load-bearing: each test goes red with its rule removed.
- Live (on the owner's go, one system): a compact HTTP scenario through the long session, SAP
  requests per call counted with `DEBUG_HTTP_WIRE`.
