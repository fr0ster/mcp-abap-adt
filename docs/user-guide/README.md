# User Guide Documentation

This directory contains documentation for end users of the MCP ABAP ADT Server.

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
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=<your ABAP user>
SAP_PASSWORD=<your password>
EOF

# A token you hold is not served over stdio: send it in the x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse, or create the session with mcp-auth.

# stdio (for MCP clients)
mcp-abap-adt --env-path=/path/to/<destination>.env

# Streamable HTTP server (@mcp-abap-adt/http): no destination, each request sends x-sap-* headers
mcp-abap-adt-http --port=3000
```

---

## Documentation Files

- **[CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md)** - Guide for configuring MCP clients to connect to the server, including HTTP header configuration for dynamic SAP connection setup
- **[AVAILABLE_TOOLS_READONLY.md](AVAILABLE_TOOLS_READONLY.md)** - Read-only tools (auto-generated)
- **[AVAILABLE_TOOLS_HIGH.md](AVAILABLE_TOOLS_HIGH.md)** - High-level tools (auto-generated)
- **[Compact tools](../../compact/docs/AVAILABLE_TOOLS.md)** - the compact set, which does what the low set did (auto-generated)
- **Compact facade tools** — moved to `@mcp-abap-adt/compact` and documented there (`compact/docs/AVAILABLE_TOOLS.md`) (auto-generated)
- **[AVAILABLE_TOOLS.md](AVAILABLE_TOOLS.md)** - Full combined tools reference (auto-generated)
- **[AUTHENTICATION.md](AUTHENTICATION.md)** - The four supported authentications, destinations, service key locations, and header-based auth
- **[CLI_OPTIONS.md](CLI_OPTIONS.md)** - Each binary's command-line options with their environment and YAML forms
- **[TERMINOLOGY.md](TERMINOLOGY.md)** - Project-specific terminology
- **[HANDLERS_MANAGEMENT.md](HANDLERS_MANAGEMENT.md)** - Enable/disable handler groups and exposure
- **[DEBUGGER.md](DEBUGGER.md)** - The debugger (the write binaries; no `-ro` one): debug sessions, the SAP ids, transports, what ends a session

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
4. **Long reads take a `timeout`** (seconds, no default) — the approved list, each on an ABAP
   session of its own. When it passes the read is cancelled (its session logged off) and nothing
   was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels
   at 60 s — because a cancel does nothing to SAP. No run (unit test, ATC, class, program) takes
   one. The list:
   [MIGRATION-19.0](../MIGRATION-19.0.md#every-transport-the-long-reads-take-a-timeout-each-on-an-abap-session-of-its-own).
5. **A class or program run may go on in the background** (`background: true`): it cannot be
   cut, so instead of waiting the call answers at once with a `run_handle` — see below.

## Background runs of a class or a program

A run of ABAP code (`RuntimeRunClass`, `RuntimeRunProgram`; compact `HandlerProfileRun`, with or
without profiling) may write and may run long, and it cannot be cut: a running request dies with
its connection, and its write is lost. With **`background: true`** the call answers at once with
a `run_handle`; the run goes on in an ABAP session of its own until SAP answers, then that session
is logged off and the answer is kept for you. No default: without it the call waits, as before.

- `GetBackgroundRun { run_handle }` (compact `HandlerBackgroundRunGet`) — `running`, or `finished`
  followed by what the run tool would have answered, SAP's error included. Reading keeps it.
- `ListBackgroundRuns` (compact `HandlerBackgroundRunList`) — your runs: handle, tool, object,
  start, running or finished; no output.
- `DiscardBackgroundRun { run_handle }` (compact `HandlerBackgroundRunDiscard`) — removes a
  finished run's answer. A running run cannot be discarded: it cannot be stopped.

A run is yours when its destination and SAP user equal those of your request (for a token
credential, the user SAP answers); another user's handle reads as an unknown one. You may hold 16
runs, running and kept together; discard a finished one to start another. Kept answers live in the
server's memory (`@mcp-abap-adt/background-runs-memory`) and end with the process. An application
embedding `@mcp-abap-adt/lib` keeps runs in a store of its own (`IBackgroundRuns`), or takes that
package. A shutdown waits for a running background run; only the
forced close (a second signal, `--shutdown-timeout`) cuts it. Details:
[MIGRATION-19.0](../MIGRATION-19.0.md#every-transport-background-runs-of-the-class-and-program-runs).

## Leftover SAP sessions of a killed process

A server process killed from outside (`SIGKILL`, out of memory, a client that kills its child)
cannot log off, so its SAP sessions — and the locks a lock tool took in them — stay open until
SAP's idle timeout. A stdio server keeps a record of the HTTP sessions it holds in
`<config dir>/runtime/` (`~/.config/mcp-abap-adt/runtime`, `Documents\mcp-abap-adt\runtime` on
Windows; `--auth-broker-path` moves it) and deletes each record once that session's logoff is
written, so only a killed process leaves records behind. From a later stdio server process, three
tools act on the leftover sessions of the destination the server serves, and nothing else does:

- `ListLeftoverSessions` (compact `HandlerLeftoverSessionList`) — the handle, role, destination,
  user and time of each session a dead process left; never a cookie, and nothing is sent to SAP.
- `ResumeLeftoverSession { handle }` (compact `HandlerLeftoverSessionResume`) — the server's
  connection is built on that session instead of logging on, so a `lock_handle` taken there works
  again: finish the write, or unlock. Call it first, before any other SAP tool: once the server
  has a connection, a resume is refused ("a leftover session can be resumed only before this
  server has connected to SAP; it already has a connection, and a resume never replaces it").
  Served only by the write binaries (`mcp-abap-adt`, `mcp-abap-adt-compact`), never by a `-ro`
  one. A debugger's session cannot be resumed. If SAP says the session is gone, you get SAP's
  answer, the record is deleted, and the next call logs on. After a resume the server checks and
  repairs nothing: if the session ended or its locks are gone, SAP's answers say so, and you redo
  your requests.
- `LogoffLeftoverSession { handle }` (compact `HandlerLeftoverSessionLogoff`) — logs the session off
  (every lock in it is released) — one request, the logoff, with no credential and nothing sent
  before it — and deletes the record.

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
mcp-abap-adt [--mcp <destination>] [--env <destination>] [--env-path /path/to/.env]
```
Use with MCP clients like Claude Desktop, VSCode extensions. `mcp-abap-adt-compact` takes the same
options with the compact tool set.

### `mcp-abap-adt-http` - Streamable HTTP (`@mcp-abap-adt/http`)
```bash
mcp-abap-adt-http [--port 3000] [--host 127.0.0.1]
```
Credentials come only from each request's `x-sap-*` headers.

### `mcp-abap-adt-sse` - HTTP+SSE (`@mcp-abap-adt/sse`)
```bash
mcp-abap-adt-sse [--sse-port 3001] [--sse-host 127.0.0.1]
```
Credentials come only from the `x-sap-*` headers of the `GET` that opens each SSE connection.

## Examples

### Example 1: Streamable HTTP Server on Port 8080
```bash
mcp-abap-adt-http --port=8080
```

### Example 2: SSE Server Accessible from Network
```bash
mcp-abap-adt-sse --sse-host=0.0.0.0 --sse-port=3001
```

### Example 3: Custom Environment File (stdio)
```bash
mcp-abap-adt --env-path /opt/config/.env.production
```
