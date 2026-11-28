# User Guide Documentation

This directory contains documentation for end users of the MCP ABAP ADT Server.

## Features

- **Read and analyse**: where-used, object and source search, every object's source and metadata, outlines, versions and diffs — [Read-only tools](AVAILABLE_TOOLS_READONLY.md)
- **Develop and change**: create, update, delete, check and activate the ABAP, DDIC, CDS and RAP objects — [High-level tools](AVAILABLE_TOOLS_HIGH.md)
- **Test and quality**: ATC runs and results, ABAP Unit per class, program, function group, CDS view or package — [ATC](AVAILABLE_TOOLS.md#high-level-atc), [Unit tests](AVAILABLE_TOOLS.md#high-level-unit-test)
- **Transports**: requests and tasks, their objects and logs, moving objects — [Transport tools](AVAILABLE_TOOLS.md#high-level-transport)
- **Debugger**: ABAP and AMDP debug sessions in the write binaries — [Debugger](DEBUGGER.md)
- **abapGit** (new in 24.2.0): link, pull, stage and push a package with a git host, full and compact — [abapGit](../../README.md#abapgit-the-git-loop-on-a-package), git credentials in [Authentication](AUTHENTICATION.md#abapgit-remotes-approved-endpoints)
- **Access restrictions**: deny tools, allow only listed packages, requests or tables; draft detection — [Access restrictions](ACCESS_RESTRICTIONS.md)
- **Read-only and compact binaries**: the twelve binaries and the tools each serves — [Handler sets](HANDLERS_MANAGEMENT.md), [Compact tools](../../compact/docs/AVAILABLE_TOOLS.md)
- **MCP prompts** (new in 24.2.0): nine slash-command prompts per binary and kind — [Prompts](PROMPTS.md)
- **Batch mode**: independent calls sent to SAP together (compact binaries: `HandlerBatch`; core binaries: read envelopes by `envelope_handle`) — [Batch Mode](BATCH_MODE.md)
- **Background long reads**: a handle at once, the result read or cancelled later — [Background runs](README.md#background-runs-of-the-long-reads)
- **Terse answers** (new in 24.2.0): TSV for a list, every row answered; `detail` (`terse`, `medium`, `full`, `raw`) chooses the reading — [Answers](../../README.md#answers)
- **Tool search**: keywords and semantic texts per tool — [Tool Search](TOOL_SEARCH.md)
- **Long session over Streamable HTTP**: one SAP session across calls by `state_handle` — [`@mcp-abap-adt/http`](../../http/README.md#held-state-and-the-long-session)
- **Data tools, off by default**: freestyle SQL and table preview only with `--enable-data-tools` — [The data tools](../../README.md#the-data-tools-off-unless-enabled)
- **Authentication**: basic, SNC, JWT with browser login; destinations — [Authentication](AUTHENTICATION.md)

## Quick Start

### Installation

Install from the npm registry (Node.js 22 or 24):

```bash
npm install -g @mcp-abap-adt/core        # full server: mcp-abap-adt
npm install -g @mcp-abap-adt/compact     # compact server: mcp-abap-adt-compact (same options)

# or without installing
npx -y @mcp-abap-adt/core --help
```

Which server and which connection (HTTP, RFC, SNC) to choose, and what RFC needs on the machine:
[Installation variants](../installation/INSTALLATION.md#installation-variants). Building from a checkout:
[From source](../installation/INSTALLATION.md#from-source-development).

**Configuration:** the server reads a `.env` only when you name it (`--env-path=<file>`, `--env=<name>` for
the sessions store, or `--mcp=<destination>` for a service key):

```bash
cat > /path/to/<destination>.env << 'EOF'
SAP_URL=https://your-sap-system.example
SAP_CONNECTION_TYPE=http
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=<your ABAP user>
SAP_PASSWORD=<your password>
EOF

# A token you hold is not served over stdio: send it in the x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse, or create the session with mcp-auth.

# stdio (for MCP clients)
mcp-abap-adt --env-path=/path/to/<destination>.env --system-type=<onprem|cloud>

# Streamable HTTP server (@mcp-abap-adt/http): no destination, each request sends x-sap-* headers
mcp-abap-adt-http --port=3000 --system-type=<onprem|cloud>
```

---

## Documentation Files

- **[CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md)** - Guide for configuring MCP clients to connect to the server, including HTTP header configuration for dynamic SAP connection setup
- **[AVAILABLE_TOOLS_READONLY.md](AVAILABLE_TOOLS_READONLY.md)** - Read-only tools (auto-generated)
- **[AVAILABLE_TOOLS_HIGH.md](AVAILABLE_TOOLS_HIGH.md)** - High-level tools (auto-generated)
- **[Compact tools](../../compact/docs/AVAILABLE_TOOLS.md)** - the compact set, which does what the low set did (auto-generated)
- **Compact facade tools** — moved to `@mcp-abap-adt/compact` and documented there (`compact/docs/AVAILABLE_TOOLS.md`) (auto-generated)
- **[AVAILABLE_TOOLS.md](AVAILABLE_TOOLS.md)** - Full combined tools reference (auto-generated)
- **[AUTHENTICATION.md](AUTHENTICATION.md)** - The supported authentications, destinations, service key locations, header-based auth, and the abapGit remotes' approved endpoints
- **[CLI_OPTIONS.md](CLI_OPTIONS.md)** - Each binary's command-line options with their environment and YAML forms
- **[TERMINOLOGY.md](TERMINOLOGY.md)** - Project-specific terminology
- **[HANDLERS_MANAGEMENT.md](HANDLERS_MANAGEMENT.md)** - The twelve binaries and the tools each serves
- **[ACCESS_RESTRICTIONS.md](ACCESS_RESTRICTIONS.md)** - Access restrictions: denied actions, allowed packages, requests and tables, the refusals, and `GetObjectDraft`
- **[PROMPTS.md](PROMPTS.md)** - The MCP prompts per binary and kind: the prompts, their `object_type` values, how a client shows them, the refusal (auto-generated)
- **[BATCH_MODE.md](BATCH_MODE.md)** - Batch mode (the compact binaries, `HandlerBatch`) and the read envelopes (the core binaries, `CreateReadEnvelope` / `ExecuteReadEnvelope`): independent calls recorded, sent together, answered by number; which calls are recorded
- **[TOOL_SEARCH.md](TOOL_SEARCH.md)** - Tool search: the three texts per tool (`description`, `keywords` for BM25, `semantic` for vectors), where a client reads them
- **[DEBUGGER.md](DEBUGGER.md)** - The debugger (the write binaries; no `-ro` one): debug sessions, the SAP ids, transports, what ends a session
- **abapGit** - The git loop on a package, full and compact, on premise and on ABAP Cloud: the tools per system, long runs, what an import writes ([README](../../README.md#abapgit-the-git-loop-on-a-package)); git credentials bound to approved endpoints — stdio's `<name>.abapgit.yaml`, the `x-abapgit-*` headers over HTTP and SSE — for any git host over HTTPS ([AUTHENTICATION.md](AUTHENTICATION.md#abapgit-remotes-approved-endpoints)); link and pull refused under access restrictions ([ACCESS_RESTRICTIONS.md](ACCESS_RESTRICTIONS.md#abapgit))
- **[ACCESS_RESTRICTIONS.md](ACCESS_RESTRICTIONS.md)** - Denied actions, allowed packages and requests, denied and allowed tables, the abapGit checks

## Getting Started

1. **Install the server**: see Installation above
2. **Configure your client**:
   - **Auto (recommended)**: Use the configurator (`@mcp-abap-adt/configurator`, repo: `mcp-abap-adt-conf`)
   - **Manual**: See [CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md) for JSON/TOML examples
3. **Explore available tools**:
   - [Read-only tools](AVAILABLE_TOOLS_READONLY.md)
   - [High-level tools](AVAILABLE_TOOLS_HIGH.md)
   - [Compact tools](../../compact/docs/AVAILABLE_TOOLS.md) (the low set's analogue since 19.0.0)
   - Compact tools — in the `@mcp-abap-adt/compact` package
4. **Long reads run in the background by default** — the approved list
   (`tools/long-handlers.json`), each on an ABAP session of its own: a call without `background`
   answers a `run_handle` at once; `background: false` answers the result in the call. A running
   read is cancelled with `DiscardBackgroundRun`. No tool takes a `timeout` — see below.
5. **A class or program run may go on in the background** (`background: true`): it cannot be
   cut, so instead of waiting the call answers at once with a `run_handle` — see below.

## Background runs of the long reads

A long read (where-used and search, `SearchSource`, package walks, data preview, the dump feed,
profiler traces, ATC results, …) only reads. Called **without** `background` (or with
`background: true`), it answers at once with a `run_handle` and reads on an ABAP session of its
own; `background: false` answers the result in the call, on a session of its own, as 23.x did.

- `GetBackgroundRun { run_handle }` (compact `HandlerBackgroundRunGet`) — `running`; `finished`
  followed by what the tool would have answered in the call; or `cancelled`. A read's finished or
  cancelled answer is answered once and then removed. Once Get answers a finished or cancelled read, that read is gone: a Get response lost on the way cannot be recovered, `ListBackgroundRuns` no longer shows it, and the read must be started again.
- `ListBackgroundRuns` (compact `HandlerBackgroundRunList`) — your runs with their state:
  `running`, `finished` or `cancelled`.
- `DiscardBackgroundRun { run_handle }` (compact `HandlerBackgroundRunDiscard`) — on a running
  read, cancels it: its session is logged off, SAP ends the read, and the run reads `cancelled`
  until Get answers it; on a finished run, removes its answer.

Every binary serves these tools, the `-ro` ones included: their runs are reads alone, and a
`-ro` binary's `DiscardBackgroundRun` cancels or removes reads only. A server without background
runs (an embedder without a store) lists a long tool without `background` and answers its read in
the call. `HandlerGet`'s run-reading parts (the `UNIT_TEST` / `CDS_UNIT_TEST` results,
`activation_status`, `activation_results`) are read in the call on the instance's connection and
take no `background`. In batch mode a long read is recorded; `background: true` there is refused
`batch_no_background`. Details: [MIGRATION-24.0](../MIGRATION-24.0.md#callers-of-the-long-tools-background-by-default-no-timeout).

## Background runs of a class or a program

A run of ABAP code (`RuntimeRunClass`, `RuntimeRunProgram`; compact `HandlerProfileRun`, plain or
under a scheduled profiler trace) may write and may run long, and it cannot be cut: a running request dies with
its connection, and its write is lost. With **`background: true`** the call answers at once with
a `run_handle`; the run goes on in an ABAP session of its own until SAP answers, then that session
is logged off and the answer is kept for you. No default: without it the call waits, as before.

- `GetBackgroundRun { run_handle }` (compact `HandlerBackgroundRunGet`) — `running`, or `finished`
  followed by what the run tool would have answered, SAP's error included. Reading keeps a code
  run's answer, until `DiscardBackgroundRun`.
- `ListBackgroundRuns` (compact `HandlerBackgroundRunList`) — your runs: handle, tool, object,
  start, running or finished; no output.
- `DiscardBackgroundRun { run_handle }` (compact `HandlerBackgroundRunDiscard`) — removes a
  finished run's answer. A running code run cannot be discarded: it cannot be stopped.

A run is yours when its destination and SAP user equal those of your request (for a token
credential, the user SAP answers); another user's handle reads as an unknown one. You may hold 16
runs, running and kept together; discard a finished one to start another. Kept answers live in the
server's memory (`@mcp-abap-adt/background-runs-memory`) and end with the process. An application
embedding `@mcp-abap-adt/lib` keeps runs in a store of its own (`IBackgroundRuns`), or takes that
package. An SSE connection that closes cuts the runs it started: their sessions are logged off at
once, as stdio's are when its client closes stdin; over Streamable HTTP a run goes on. The
process's end (a signal, or stdio's client closing stdin) logs every run's session off at once,
which cuts it. Details:
[MIGRATION-19.0](../MIGRATION-19.0.md#every-transport-background-runs-of-the-class-and-program-runs).

## Leftover SAP sessions of a killed process

A server process killed from outside (`SIGKILL`, out of memory, a client that kills its child)
cannot log off, so its SAP sessions — and the locks a lock tool took in them — stay open until
SAP's idle timeout. A stdio server keeps a record of the HTTP sessions it holds in
`<config dir>/runtime/` (`~/.config/mcp-abap-adt/runtime`, `Documents\mcp-abap-adt\runtime` on
Windows; `--auth-broker-path` moves it) and deletes each record once that session's logoff is
written, so only a killed process leaves records behind. A later stdio server process of the same
destination **starts on the one it finds**: at its start, before your MCP client sees its tools, it
connects on that session instead of logging on, so a `lock_handle` taken there works again —
finish the write, or unlock. If SAP says the old session has ended (much time passed), it logs on
normally and starts a new session instead; its locks are gone. The record stays the server's
either way. With several records, none is picked: the server logs on normally and leaves them for
the tools below. A debugger's session is never taken up. After a start on a leftover session the
server checks and repairs nothing: if the session ended or its locks are gone, SAP's answers say
so, and you redo your requests. With `--deferred-logon` (the start contacts no system) the record
is not taken up on its own: the first tool call logs on and the record stays for the tools below;
with `--restore-session` as well, the first tool call takes it up as a start does (see
[CLI options](CLI_OPTIONS.md#--deferred-logon)). Two tools act on the leftover sessions of the destination the
server serves:

- `ListLeftoverSessions` (compact `HandlerLeftoverSessionList`) — the handle, role, destination,
  user and time of each session a dead process left; never a cookie, and nothing is sent to SAP.
- `LogoffLeftoverSession { handle }` (compact `HandlerLeftoverSessionLogoff`) — logs the session off
  (every lock in it is released) — one request, the logoff, with no credential and nothing sent
  before it — and deletes the record. A logoff changes the system, so only the full binaries serve
  it; the `-ro` binaries list the sessions.

A record is the server's when it names the destination the server serves (`--mcp=<name>`, or
`default` for an `--env` file) and points where that destination points (URL, client, system
kind): on stdio the user and the credential are fixed for the process. A session of a server still running is never shown; off Linux a
server's liveness is read by its process id alone, so a reused id hides a record until that other
process ends. Two servers never act on one record at once: the first to claim it acts, the other
answers that it is not available. The records hold
the session's cookies, which act as you while the session lives: on Linux and macOS the directory
is owner-only (`0700`, files `0600`); on Windows the directory's inherited ACL applies, so keep it
in your own profile — and everywhere keep it out of backups and shared folders.

The http and sse binaries keep no record and serve none of these tools: one such server holds
the sessions of many users. There, resuming a SAP session is yours to do if you hold what it
takes; otherwise SAP ends it on its own timeout, which releases its locks. Details:
[MIGRATION-19.0](../MIGRATION-19.0.md#stdio-leftover-sap-sessions-of-a-killed-process).

## Activation and check messages

An activation (`ActivateObjects`, `ActivateObjectLow`, each `Activate…Low`, compact
`HandlerActivate`) and a check (`Check…`, compact `HandlerCheckRun`) answer SAP's messages, in a
success and in a refusal alike. Each message carries what SAP states of it:

| Field | What it is |
|---|---|
| `type` | the severity: `E`, `W`, `I`, … |
| `text` | SAP's words |
| `object` | the object and its part, as SAP describes them (`Class ZCL_X, Method GET_VALUE`) |
| `uri` | the source the message points into (`/sap/bc/adt/oo/classes/zcl_x/source/main`) |
| `position` | where in that source: `{ line, column }`, with `end: { line, column }` where SAP gives a range; lines count from 1, columns from 0 |
| `code` | SAP's message code (`MESSAGE(GTU)`, `D0(408)`) |
| `line` | deprecated, in a refusal only: the source line of `position` as text (`String(position.line)`); read `position.line` |

A field is present where SAP states it: a DDIC object's message names its uri alone, and a
message about no object (`Activation was cancelled.`) carries its type and text. A message of an
activation run (more than one object, or a type activated as a group) names the run's object it
is about as `objectName` and `uri`, and its source as `source_uri` beside `position`.

### Text elements

A write of text elements (`UpdateTextElements` with `activate: false`) lands inactive beside its
object, and an activation naming the object alone activates nothing: its answer lists the text
elements in `still_inactive` (measured on premise). Name both: `PROG/PX` is a program's text
elements, or with `parentName` a function group's; `CLAS/OCX` is a class's. Compact
`HandlerActivate` names them `PROGRAM_TEXT_ELEMENTS`, `FUNCTION_GROUP_TEXT_ELEMENTS` and
`CLASS_TEXT_ELEMENTS`; in compact the sequence is `HandlerLock`, `HandlerUpdate` (under the
handle), `HandlerLock` `action: unlock`, `HandlerActivate`, the same for `TABLE_SETTINGS` with the table
activated as `TABLE`. `UpdateTextElements` with `activate: true` names both itself. Where-used of
text elements is `GetWhereUsed` with `object_type: PROG/PX` and `container` (`program` or
`function_group`).

## Package Tree Output

`GetPackageTree` returns a package root with nested subpackages and a flat list of
objects for each package. Each object includes:

- `adtType` (ADT type string, e.g. `CLAS/OC`)
- `type` (normalized object type)
- `codeFormat` (`source` or `xml`)
- `restoreStatus` (`ok` or `not-implemented`)

## Command Reference

A binary is its transport; there is no `--transport` option. Each binary reads only its own options
(`<binary> --help`); an option of another binary, on the command line or in the config file, stops the
start, naming the binary that serves it. Another binary's environment variables are not read.

### `mcp-abap-adt` - stdio (`@mcp-abap-adt/core`)
```bash
mcp-abap-adt [--mcp <destination>] [--env <destination>] [--env-path /path/to/.env] --system-type=<onprem|cloud>
```
Use with MCP clients like Claude Desktop, VSCode extensions. `mcp-abap-adt-compact` takes the same
options with the compact tool set.

### `mcp-abap-adt-http` - Streamable HTTP (`@mcp-abap-adt/http`)
```bash
mcp-abap-adt-http [--port 3000] [--host 127.0.0.1] --system-type=<onprem|cloud>
```
Credentials come only from each request's `x-sap-*` headers.

### `mcp-abap-adt-sse` - HTTP+SSE (`@mcp-abap-adt/sse`)
```bash
mcp-abap-adt-sse [--sse-port 3001] [--sse-host 127.0.0.1] --system-type=<onprem|cloud>
```
Credentials come only from the `x-sap-*` headers of the `GET` that opens each SSE connection.

## Examples

### Example 1: Streamable HTTP Server on Port 8080
```bash
mcp-abap-adt-http --port=8080 --system-type=<onprem|cloud>
```

### Example 2: SSE Server Accessible from Network
```bash
mcp-abap-adt-sse --sse-host=0.0.0.0 --sse-port=3001 --system-type=<onprem|cloud>
```

### Example 3: Custom Environment File (stdio)
```bash
mcp-abap-adt --env-path /opt/config/.env.production --system-type=<onprem|cloud>
```
