# Migrating to 20.0.0

20.0.0 moves the RFC transport onto `@mcp-abap-adt/connection` 19 and `@mcp-abap-adt/sap-rfc-lite`
0.3.2, which compiles nothing when it is installed, and over Streamable HTTP makes `state_handle` an
argument of every tool and adds the long session
([#308](https://github.com/fr0ster/mcp-abap-adt/issues/308); see
[Streamable HTTP: held state by argument, and the long session](#streamable-http-held-state-by-argument-and-the-long-session)).
Go through the section that fits how you run the server.

The packages are the eighteen of 19.2.0, all at **20.0.0**. Their dependencies change:

| Package | Was | Now |
|---|---|---|
| `@mcp-abap-adt/connection` (`lib`, `server-runtime`) | `^18.0.1` | `^19.0.0` — no API change: it moves its own RFC dependency to sap-rfc-lite `^0.3.2` |
| `@mcp-abap-adt/sap-rfc-lite` (optional, `lib`) | `^0.2.3` (connection's own copy `^0.2.2`) | `^0.3.2` — one copy in the tree, the one connection loads |

## HTTP and stdio users without RFC

Nothing to do. sap-rfc-lite is loaded only when an RFC (or SNC) destination makes its first RFC
call; an HTTP destination never loads it.

## BREAKING — RFC and SNC users: nothing is compiled on install

19.x installed sap-rfc-lite 0.2.x, which built its RFC binding during `npm install` where it had no
prebuilt one, with the SAP NW RFC SDK, `SAPNWRFC_HOME` and a C++ toolchain. sap-rfc-lite 0.3 has no
install script: `npm install` and `npm ci` compile and download nothing for it, also under
`--ignore-scripts`. It loads a prebuilt binding at run time.

- **Prebuilt for Linux x64 (glibc), Windows x64 and macOS ARM64.** On these, the install needs no
  SDK, no `SAPNWRFC_HOME` and no compiler. If you set `SAPNWRFC_HOME` or installed a toolchain only
  for the install, neither is needed for it any more.
- **Anywhere else there is no binding after the install** — Linux on ARM, an Intel Mac, Linux with
  musl (Alpine), any other platform or architecture. The install succeeds (the dependency is
  optional), the server starts and serves HTTP, and the first RFC call is refused with
  `@mcp-abap-adt/sap-rfc-lite is not available`, its details naming `No native build was found`.
  Build the binding from sap-rfc-lite's repository and install the package you built, as its
  [README, "Installation"](https://github.com/fr0ster/sap-rfc-lite#installation) describes
  (`SAPNWRFC_HOME` and a C++ toolchain on the building machine):

  ```bash
  git clone https://github.com/fr0ster/sap-rfc-lite.git && cd sap-rfc-lite
  git checkout v0.3.2
  npm ci
  npm run prebuild:native      # -> prebuilds/<platform>-<arch>/
  npm pack                     # install the .tgz beside the server
  ```

  Building inside the installed package is not possible: the published package carries neither
  `binding.gyp` nor the C++ sources.

## RFC and SNC users: the RFC library at run time

The binding does not look for the SAP NW RFC library itself; the operating system's loader finds it
when the first RFC call loads the binding, and the prebuilt binding carries no path of the machine
it was built on. So the library must be loadable **by the server process**:

- **Windows where SAP GUI installed its 64-bit RFC library** (`sapnwrfc.dll` in
  `C:\Windows\System32`; `where.exe sapnwrfc.dll` lists it): nothing more — no SDK.
- **Anywhere else** — Windows without it, Linux, macOS, Docker images: the SAP NW RFC SDK, its `lib`
  directory on `PATH` (Windows), `LD_LIBRARY_PATH` (Linux) or `DYLD_LIBRARY_PATH` (macOS) of the
  server process — in an MCP client, its `env` block.

19.x on Linux needed no `LD_LIBRARY_PATH` when the binding was compiled on the machine, because the
build recorded `$SAPNWRFC_HOME/lib` in it. The prebuilt one records nothing: set the library path.
The steps per platform: [RFC Setup](installation/RFC_SETUP.md).

## Portable build: sap-rfc-lite 0.3.0 or later only

`npm run portable:build` refuses a stage holding any copy of sap-rfc-lite older than 0.3.0, naming
each: such a copy reads its own `package.json` at run time, which an executable does not have, so RFC
would not load in it. Every version published before 20.0.0 installs 0.2.x, so **`--version=19.2.0`
and older can no longer be built**; build 20.0.0 or later. `--build-from-source` is gone: npm compiles
nothing for sap-rfc-lite. See [Portable Build](installation/PORTABLE.md).

## Docker users

Nothing changes in the images: they carry no SAP NW RFC SDK and install with `--omit=optional`, so
RFC and SNC are not available in them, as before. An RFC image of your own no longer compiles
anything on install; it needs the SDK inside it, its `lib` directory on `LD_LIBRARY_PATH`, and an x64
glibc base for the prebuilt binding. See [Docker](deployment/DOCKER.md#rfc-and-snc).

## Streamable HTTP: held state by argument, and the long session

For a 19.x user of `mcp-abap-adt-http`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-compact-http` or
`mcp-abap-adt-compact-http-ro` ([#308](https://github.com/fr0ster/mcp-abap-adt/issues/308)).
stdio and SSE are unchanged: their tool lists, schemas and behaviour are those of 19.x.

### What changed

- **`state_handle` is a declared argument of every tool.** Over Streamable HTTP each request is
  served by a new server instance unless it carries the `state_handle` of an instance that holds
  state (a lock taken with compact `HandlerLock`, a batch, a debug session, and now a long session).
  In 19.x the pool already routed by a `tools/call`'s `state_handle` argument, but only the
  debugger tools declared it, so a model — which sets no header — could not send it to
  `HandlerUpdate`, `HandlerUnlock` or the batch tools. In 20.0.0 every tool of the four binaries
  declares an optional `state_handle` string: "The state_handle a long session, a lock or a batch
  answered: the call runs on the server instance that holds that state. Without it the call runs on
  a new instance." The debugger tools keep their own declaration, required where it was required.
  A tool that does not use the argument never sees it: it routes the call and is taken out of the
  arguments before the handler.
- **The `x-mcp-state-handle` header still works, and still wins.** A request that carries the
  header is routed by it; an argument beside it is not read for routing. A JSON-RPC batch (array)
  carrying `state_handle` is still answered `400`.
- **The texts that tell the model to send the handle name the argument first**, the header as
  the alternative: the refusal of a write or unlock under a lock the instance does not hold reads
  "lock_handle is not held by this instance: send the state_handle HandlerLock answered as the
  state_handle argument (or in the x-mcp-state-handle header)", and the descriptions of
  `HandlerLock`, `HandlerUpdate`, `HandlerDelete`, `HandlerUnlock`, `HandlerBatch`, `BatchBegin`,
  `DebugBatchBegin` and the compact debugger batch say the same.
- **New tools: the long session.** `mcp-abap-adt-http` and `mcp-abap-adt-http-ro` serve
  `SessionOpen` and `SessionClose`; `mcp-abap-adt-compact-http` and `mcp-abap-adt-compact-http-ro`
  serve `HandlerSession` with `action: 'open' | 'close'`. They change nothing in the system, so
  the `-ro` binaries serve them too; no stdio or SSE binary serves them. The tool counts grow by
  one or two: `mcp-abap-adt-http-ro` 71, `mcp-abap-adt-compact-http` 39,
  `mcp-abap-adt-compact-http-ro` 19 (listed against an on-premise system).
  - **Open** keeps an instance and its SAP connection and answers `{ "state_handle": "…" }`. Every
    call carrying it runs on that instance, on its held SAP session — no new connection, no
    `systeminformation` lookup, no logoff between the calls. Opened with the handle of an instance
    that already holds state, or of an open session, it answers that same handle and keeps what the
    instance holds; opened without one, it is a new instance with a handle of its own.
  - **Close** with the handle answers `{ "closed": true, "held": { "locks": <n>, "batch": <bool>,
    "debug_session": <bool> } }`, what the instance held. Once that answer is written the instance
    leaves the pool and is closed: every SAP session it owns gets its logoff, which releases the
    locks taken in it; an open batch and its recorded calls are dropped unsent; nothing is undone
    (the logoff ends in SAP what the state held); the MCP server closes. From then on the handle
    answers `state is not available` at once, whether or not SAP has answered the logoffs yet. The
    close awaits each logoff's write and its answer with no timer of the server's, and the server's
    shutdown awaits a close still running. Close without a handle, or with an unknown one, answers
    `state is not available`.
  - **The idle bound** (`--state-idle-minutes`, default 30) ends a session that is never closed:
    no call on it for that long, and its SAP session is logged off and the instance leaves the pool.
  - **No list tool.** The model keeps the handles it opened; nothing on the server tells it which
    sessions it opened. The handle is a bearer secret: whoever holds it reaches the session, and
    the server does not identify the caller.
  - **Batch mode.** The session tools run at once and are never recorded, in a communication batch
    and in a debugger batch alike: open leaves the batch open; close drops it with the instance.
- **Handles are unique among those the pool holds.** Each instance draws its handle again when the
  value drawn is already held, at its creation and at every rotation, so two long sessions never
  share a handle or an instance.
- **What another credential does on a held instance is unchanged, and now documented as the code
  does it.** A request carrying a handle with another credential (a renewed token, a new user and
  password) works on the held instance: its SAP session and its locks are kept, and the new
  credential is put in force for its next sends; what SAP answers to it reaches the caller as it
  came. The connection is replaced only when SAP ended its session. 19.x's READMEs of `http` and
  `compact-http` said another credential retired the held connection; it never did.

### What you must do

Nothing. A 19.x client that sends `x-mcp-state-handle` is routed as before, and one that sends no
handle gets a new instance per request as before. A client that compares tool lists or schemas
sees the new optional argument and the new tools.

### How to adopt

- Let the model send the `state_handle` it was answered as the `state_handle` argument of the
  calls that need the state — after `HandlerLock`, `BatchBegin` / `HandlerBatch` `begin`, a
  debugger start. Your client needs no header handling for it.
- For a run of calls that should share one SAP session — fewer logons, one `systeminformation`
  lookup, a lock and its write and unlock on one session — open a long session first, pass its
  `state_handle` on every call, and close it at the end. A session you forget ends at the idle
  bound.
- An embedder that registers its own tools on `StreamableHttpServer`: a tool registered with a raw
  zod shape or a JSON Schema `inputSchema` gets the declared `state_handle`; one registered with a
  whole `z.object(...)` schema does not (the schema is used as it is), so the model cannot send the
  handle to it — register such a tool with a raw shape or a JSON Schema.

See [`@mcp-abap-adt/http`](../http/README.md#held-state-and-the-long-session),
[`@mcp-abap-adt/compact-http`](../compact-http/README.md) and
[Batch Mode](user-guide/BATCH_MODE.md#over-streamable-http).
