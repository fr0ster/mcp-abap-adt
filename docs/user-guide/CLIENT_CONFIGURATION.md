# Client Configuration Guide

This guide explains how to configure MCP clients to connect to the MCP ABAP ADT server: `mcp-abap-adt`
(stdio), `mcp-abap-adt-http` (Streamable HTTP) or `mcp-abap-adt-sse` (HTTP+SSE).

If you prefer not to edit JSON/TOML by hand, use the configurator CLI:
`@mcp-abap-adt/configurator` (repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf), docs: [CLIENT_INSTALLERS.md](https://github.com/fr0ster/mcp-abap-adt-conf/tree/main/docs/CLIENT_INSTALLERS.md)).

## Overview

A binary is its transport (there is no `--transport` option):
- **stdio** - `mcp-abap-adt` (`@mcp-abap-adt/core`), for MCP clients like Cline, Cursor: one destination through the auth broker
- **streamable-http** - `mcp-abap-adt-http` (`@mcp-abap-adt/http`): each request's `x-sap-*` headers
- **sse** - `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`): the `x-sap-*` headers of the `GET` that opens each SSE connection

The HTTP binaries take SAP connection parameters **only** from HTTP headers: no destination, no
service key, no session file, no login. A request without them is answered `400`, and so is one
carrying `x-mcp-destination` ("destinations are served only by mcp-abap-adt (stdio); send x-sap-*
headers").

For stdio, the client starts the server itself: `mcp-abap-adt` (or `mcp-abap-adt-compact`, or `npx -y @mcp-abap-adt/core`) with `--env-path=<file>` or `--mcp=<destination>`. Configurations for the full and compact server, RFC/SNC and a company CA: [Cline configuration](../installation/CLINE_CONFIGURATION.md) and [examples](../installation/examples/README.md).

### Methods That Require SAP Configuration

**Only `tools/call` requires SAP configuration** - all other MCP methods work without SAP connection:
- `tools/list` - List available tools (no SAP config needed)
- `tools/get` - Get tool metadata (no SAP config needed)
- `initialize` - Initialize MCP session (no SAP config needed)
- `ping` - Health check (no SAP config needed)
- `notifications/initialized` - Notification (no SAP config needed)
- `tools/call` - **Execute a tool** (requires SAP configuration)

This means you can query available tools, get tool descriptions, and initialize the connection without providing SAP credentials. Only when you actually call a tool (e.g., `GetProgram`, `CreateClass`) does the server require SAP authentication.

## Streamable HTTP Configuration

### Basic Configuration

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http"
  }
}
```

### Configuration with SAP Connection Headers

When using HTTP transport, a request can carry its own connection. The headers state the system and **one** credential; the authentication is decided by which credential is present, so no header states it:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-sap-system.example",
      "x-sap-client": "100",
      "x-sap-jwt-token": "your_jwt_token_here"
    }
  }
}
```

### Supported HTTP Headers

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `x-sap-url` | Yes* | SAP system URL | `https://system.example` |
| `x-sap-client` | No | SAP client | `100` |
| `x-sap-jwt-token` | Yes* (for a token) | A JWT access token you hold. It is used as it is: the server cannot renew it | `eyJhbGciOiJSUzI1NiIs...` |
| `x-sap-login` | Yes* (for basic) | Username for basic authentication; on-premise also the responsible of created objects when none is stated (only on this `x-sap-url` connection, not on a destination request) | `your_username` |
| `x-sap-password` | Yes* (for basic) | Password for basic authentication | `your_password` |
| `x-sap-master-system` | No | Master system of created objects; wins over the environment | `<system id>` |
| `x-sap-responsible` | No | Responsible person of created objects; wins over the environment and the login | `<user>` |
| `x-sap-language` | No | Master language of created objects | `EN` |
| `x-sap-debug-terminal-id` | No | The debugger's terminal id; wins over the environment (`SAP_DEBUG_TERMINAL_ID`). Random per instance when none is stated | `<terminal id>` |
| `x-sap-debug-ide-id` | No | The debugger's IDE id; same order. The system keys its listener conflict by it: a shared IDE id means shared catches and no conflict ([Debugger](DEBUGGER.md#the-sap-ids-and-when-to-share-one)) | `<IDE id>` |
| `x-sap-debug-breakpoint-conflict` | No | `replace` or `refuse-if-held` ([Debugger](DEBUGGER.md#the-breakpoint-set-and-its-key)); wins over the destination's `.env` and the environment | `refuse-if-held` |

\* A request (SSE: the opening `GET`) must carry `x-sap-url` and either `x-sap-jwt-token` or both `x-sap-login` and `x-sap-password`; without them it is answered `400`. `x-mcp-destination` is answered `400`.

**Notes:**
- For a token that is renewed for you, use a destination with browser login on `mcp-abap-adt` (stdio, below), not a header.
- 16.0 stopped reading the earlier headers for a destination, an authentication type and a refresh token; see the [migration note](../MIGRATION-16.0.md).

## Basic Authentication

For on-premise systems using basic authentication:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-onpremise-system.com:8000",
      "x-sap-login": "your_username",
      "x-sap-password": "your_password"
    }
  }
}
```

**Note:** Over HTTP the user and password come only from the headers (`x-sap-login`, `x-sap-password`); a server `.env` is read only by `mcp-abap-adt` (stdio).

**System context headers** (`x-sap-master-system`, `x-sap-responsible`) are optional, and apply only where an on-premise system gives no information (no `systeminformation`, an answer without the user, or an error): the user and the system id the system names win over them, on every kind of system. Where they apply, they win over the process environment and the login — for this request only (SSE: for the session the headers opened); without `x-sap-responsible` (and no `SAP_RESPONSIBLE`) the responsible is the login: here `x-sap-login`. See [System context](#system-context-for-on-premise-systems).

## Destinations

`mcp-abap-adt` (stdio) supports **three authentications** — basic (HTTP or RFC), SNC (RFC only, passwordless) and JWT with browser login (`authorization_code`); a JWT you hold goes in the `x-sap-jwt-token` header of `mcp-abap-adt-http` / `mcp-abap-adt-sse`. The full table, with the `.env` keys of each, is in [Authentication & Destinations](AUTHENTICATION.md); this section is about wiring a client to one.

A process serves **one default destination**, chosen by:

1. `--mcp=<destination>` — a named destination: `service-keys/<destination>.json` and `sessions/<destination>.env`, read field by field (the `.env` wins).
2. `--env-path=<path|file>` (or `MCP_ENV_PATH`) or `--env=<destination>` (`sessions/<destination>.env`) — one env file, used as it is. A file that does not exist is refused at startup, naming the parameter and the path.

Otherwise there is no default destination. Nothing is looked up in the working directory: a `.env` there is read only when you name it (`--env-path=./.env`).

```bash
# stdio: a named destination
mcp-abap-adt --mcp=TRIAL

# stdio: one env file
mcp-abap-adt --env-path=/path/to/.env
```

Destinations are served only by `mcp-abap-adt` (stdio); `mcp-abap-adt-http` and `mcp-abap-adt-sse` refuse
`--mcp`, `--env` and `--env-path` at start, naming `mcp-abap-adt`. Without any of them, stdio starts in
inspection-only mode (the tool list answers; a tool call needs a connection).

### How It Works

1. **One destination per process.** For another destination, start another process (`--mcp=<other>`).
2. **One login at a time.** Several first requests to the same new destination share one login; destinations logging in at once take turns on the callback port.
3. **The session is the server's to keep current.** A token obtained or renewed is stored with the secret alone (the token, its expiry and refresh token). An env file you named is written back; a named destination's session is written to `sessions/<destination>.env` only with `--unsafe`, otherwise it is kept in memory and a restart logs in again.
4. **A destination is read once per process.** A change you make to a `.env` from outside (a new password, a token handed over again) takes effect on restart.

### Service Key Storage

- Linux/macOS: `~/.config/mcp-abap-adt/service-keys/{destination}.json`
- Windows: `%USERPROFILE%\Documents\mcp-abap-adt\service-keys\{destination}.json`
- Sessions: `.../sessions/{destination}.env` (only with `--unsafe`)
- `--auth-broker-path` / `AUTH_BROKER_PATH` move both directories.

Download the service key JSON from SAP BTP and save it as `{destination}.json`; the file name without `.json` is the destination name (case-sensitive).

**An XSUAA key** carries the UAA, not the ABAP system. State the system's URL as `XSUAA_MCP_URL` in `sessions/{destination}.env`; without it the destination is refused naming `XSUAA_MCP_URL`.

### Session Storage

By default a named destination's session (JWT and refresh token) is kept **in memory**: nothing is written, and a restart logs in again. With `--unsafe` (or `MCP_UNSAFE=true`) the session is written to `sessions/{destination}.env` in plain text and survives restarts. An env file named with `--env` / `--env-path` is written back whatever `--unsafe` says.

### First-Time Authentication (JWT, browser login)

1. The server reads the destination.
2. With no valid session it opens the system's login page in the chosen browser (`--browser`) and waits for the redirect on port `61001` (`--browser-auth-port`).
3. The token is stored (see above) and used from then on; it is renewed with the refresh token, and a new login is the fallback.

### Example: Complete Setup

1. **Create the service key** as `service-keys/TRIAL.json` (an ABAP service key).
2. **Configure the client** — it starts the server; no credentials in it:
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--mcp=TRIAL"]
    }
  }
}
```
3. **At the start** (before your MCP client sees the tools): the browser opens for authentication.
   **Tool calls** use the stored token.

### Custom Paths

```bash
# Unix/Linux/macOS
mcp-abap-adt --mcp=TRIAL --auth-broker-path=~/prj/tmp/
# Windows
mcp-abap-adt --mcp=TRIAL --auth-broker-path=C:\prj\tmp\
```

The server uses `service-keys` and `sessions` subdirectories of that path (`~/prj/tmp/service-keys/`, `~/prj/tmp/sessions/`).

### Server Command-Line Options

| Option | Effect |
|--------|--------|
| `--mcp=<destination>` | Named destination |
| `--env=<destination>` | `sessions/<destination>.env` as one env file |
| `--env-path=<path\|file>` | One env file; relative paths resolve from the working directory |
| `--auth-broker-path=<path>` | Base directory of `service-keys/` and `sessions/` |
| `--unsafe` | Write named destinations' sessions to disk |
| `--browser`, `--browser-auth-port` | Browser and callback port (default `61001`) of a login |

These are `mcp-abap-adt`'s (stdio). Every parameter of each binary, with its environment and YAML forms, is in [CLI_OPTIONS.md](CLI_OPTIONS.md). An invalid port, enum or flag value is refused at startup.

## Server Configuration

The Streamable HTTP server is its own package:

```bash
mcp-abap-adt-http --port=3000
# or without installing
npx -y @mcp-abap-adt/http --port=3000
```

It takes no destination and no `.env`: each request carries its credential in `x-sap-*` headers.

### Environment Variables

The connection lives in a `.env` file the server is told about (`--env-path`, `--env` or `--mcp`). Of that file only `SAP_CLIENT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE` and `SAP_LANGUAGE` reach the process environment; process-level settings (`NODE_EXTRA_CA_CERTS`, `SAP_SYSNR`, `PATH` for the RFC SDK on Windows) belong in the shell or the MCP client's `env` block.

**A JWT you hold** is not served over stdio (19.0.0): send it in the `x-sap-jwt-token` header to
`mcp-abap-adt-http` or `mcp-abap-adt-sse`, or create the session with `mcp-auth`. A `.env` stating
`SAP_GRANT_TYPE=none` is refused at startup, saying so.

**For JWT with browser login** (the server obtains and renews the token; no token in the file at first):
```env
SAP_URL=https://your-sap-system.example
SAP_AUTH_TYPE=jwt
SAP_GRANT_TYPE=authorization_code
SAP_UAA_URL=https://your-uaa.example
SAP_UAA_CLIENT_ID=your_client_id
SAP_UAA_CLIENT_SECRET=your_client_secret
```

**For SNC (passwordless, RFC):**
```env
SAP_URL=https://your-onpremise-system.com:8000
SAP_AUTH_TYPE=snc
SAP_SNC_PARTNERNAME='p:CN=<system>, O=<org>, C=<country>'
```
Add `SAP_CONNECTION_TYPE=rfc` to the `.env`, or start the server with `--connection-type=rfc`. No user and no password: the SNC credential is mapped to an ABAP user by its SNC name.

**For basic authentication (on-premise):**
```env
SAP_URL=https://your-onpremise-system.com:8000
SAP_AUTH_TYPE=basic
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
SAP_CLIENT=100
SAP_SYSTEM_TYPE=onprem

# System context (optional): the responsible defaults to SAP_USERNAME;
# without SAP_MASTER_SYSTEM the master system is left out of the request
# SAP_RESPONSIBLE=<user>
# SAP_MASTER_SYSTEM=<system id>

# Debugger ids (optional; the write binaries serve the debugger): random per instance when absent;
# the x-sap-debug-* headers win over these
# SAP_DEBUG_TERMINAL_ID=<terminal id>
# SAP_DEBUG_IDE_ID=<IDE id>
# SAP_DEBUG_BREAKPOINT_CONFLICT=replace
```

### SAP System Type

The `SAP_SYSTEM_TYPE` environment variable controls which tools are available and how the server interacts with the SAP system. **It is required (19.0.0): there is no default, and the kind is never guessed** — not from the credential, the URL or the system's answers.

| Value | Description |
|-------|-------------|
| `cloud` | ABAP Cloud / BTP systems |
| `onprem` | On-premise systems (BASIS ≥ 7.50) |
| `legacy` | Legacy on-premise systems (BASIS < 7.50) — **not supported at present**, see below; connects as on-premise |

**Why this matters:** Different SAP environments support different ADT endpoints. For example, Programs are only available on `onprem` systems. The server uses `SAP_SYSTEM_TYPE` to filter tools accordingly.

**On `legacy`:** no tool declares that environment, so a server started with `SAP_SYSTEM_TYPE=legacy` offers none. Support for legacy systems is parked on the `parked/legacy-support` branch until it can be tried against a live one — it was declared on 142 tools and had never been run against such a system, which is a claim rather than a fact.

**Without it** `mcp-abap-adt` does not start a destination (exit `1`, naming the parameter), `mcp-abap-adt-http` / `mcp-abap-adt-sse` (and their `-ro` and compact binaries) do not start (exit `1` before anything listens; no request header states the kind), A value other than the three is refused the same way. `EmbeddableMcpServer` and `HandlerExporter` require none (see below). Inspection-only stdio (no destination) needs no kind: it filters nothing and lists every tool of its set — there is no `cloud` default.

You can also set this via CLI: `--system-type=onprem`, or YAML `system-type: onprem`. Precedence: the CLI flag, then the environment — which the `--env` / `--env-path` `.env` value joins, never over one already set — then YAML.

#### Per-Instance Override (embedders)

When embedding the server via `EmbeddableMcpServer`, pass `systemType` in the constructor options to bind one server instance to a specific SAP system type, independent of the process-global `SAP_SYSTEM_TYPE` env var:

```ts
new EmbeddableMcpServer({
  connection,
  exposition: ['readonly', 'high'],
  systemType: 'onprem', // or 'cloud'
});
```

Use this when one host serves multiple SAP systems per request — for example, a proxy that resolves a BTP destination at request time and decides whether it is OnPremise (Cloud Connector) or an internet-facing cloud endpoint. Mutating `process.env.SAP_SYSTEM_TYPE` per request is not safe and is not required.

**Resolution order:** `options.systemType` → `process.env.SAP_SYSTEM_TYPE`; neither is required (without both, every tool is listed). That order picks the tools and states the kind of the injected connection, by which the rules you pass (`systemContextRules`, below) read its `systeminformation` — never the URL.

### System Context for On-Premise Systems

When creating ABAP objects, SAP ADT takes `responsible` and `masterSystem` attributes in the XML request body (a transport takes its owner). The server always sends a responsible person; it sends a master system only when it knows one, and otherwise leaves the attribute out so the system applies itself (as 15.x did).

**How system context is resolved**, once per destination when its connection is created (a tool's own argument per call), each from the first that has it. The system is asked first (`systeminformation`, once per destination — its credentials and its target system; each HTTP request's headers are their own —, on ABAP Cloud and on-premise alike): what it names wins over everything configured — with passwordless SSO, or a user provisioned into the system, the user exists only inside the system. The configuration (steps 3–8) applies only where an on-premise system has no such function (it answers `404`):

| Order | Source | `responsible` | `masterSystem` |
|---|---|---|---|
| 1 | The tool's own argument | `owner` (`CreateTransport`) | — (no tool takes one) |
| 2 | `systeminformation` on the connected connection | the system's user | the system id |
| 3 | Request headers (HTTP/SSE) — on-premise `404` only | `x-sap-responsible` | `x-sap-master-system` |
| 4 | The destination's own `.env` (`--env` / `--env-path` file, or `sessions/<destination>.env`) — on-premise `404` only | `SAP_RESPONSIBLE` | `SAP_MASTER_SYSTEM` |
| 5 | The process environment — on-premise `404` only | `SAP_RESPONSIBLE` | `SAP_MASTER_SYSTEM` |
| 6 | The login: the destination's own `.env` — on-premise `404` only | `SAP_USERNAME` | — |
| 7 | The login: an `x-sap-url` connection's header — on-premise `404` only | `x-sap-login` | — |
| 8 | The login: the process environment — on-premise `404` only | `SAP_USERNAME` | — |
| — | Nothing found | the create is refused | left out of the request |

The values of steps 3, 4, 6 and 7 live in the request's scope, never in a process-wide cache: two concurrent requests to different destinations, or with different headers, each see their own. The `--env` file's `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` and `SAP_USERNAME` are read as that destination's own and are not copied into the process environment, so they never become another destination's fallback.

The answer of step 2 is read by the system's kind: an answer naming a user is used on both kinds. Anything else — a `404` (no endpoint), an answer without the user, an error — is no information: on-premise steps 3–8 apply when the call states a responsible (`x-sap-responsible`, `SAP_RESPONSIBLE`) or, none, a login (`SAP_USERNAME` of the destination or the environment, or `x-sap-login` of an `x-sap-url` basic connection) — the login is for the logon, the responsible and `x-sap-master-system` are passed separately —, else the call is refused `system_user_unknown` ("the system gave no session user (systeminformation) and the call states no user: …; the tool did not run") and the next call asks again; a cloud system always has it, so there it is one step to the error — a `404` is `cloud_without_systeminformation` ("the destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every ABAP Cloud system has: the configuration or the headers are inconsistent; the tool did not run"), anything else `system_lookup_failed` (a problem of the ABAP system with a valid configuration). On a cloud system steps 3–8 never count. `x-sap-login` is read only on an `x-sap-url` basic connection, which logs on with it; a destination request's `x-sap-login` is ignored. The process environment is read once: a change to `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` or `SAP_USERNAME` while the server runs is not picked up.

**The one exception: a message class** is created with the system's own default responsible — adt-clients' message class create takes none (15.x the same) — and is never refused for a missing one.

Whether a system is cloud is the kind its connection was built for: `SAP_SYSTEM_TYPE` / `--system-type` — required, never guessed from the credential or the URL. A connection an embedding host builds itself (not through the server's factory) has no settings to read: the server's `systemType` option states its kind, then `SAP_SYSTEM_TYPE`.

**A create without a responsible is refused.** In the servers the responsible is made with the connection, before any tool runs: an on-premise system that gives no information, with neither a responsible nor a login stated (SNC, or a token you hold, with no `SAP_RESPONSIBLE`), refuses the call `system_user_unknown` — and ends a stdio start — so no create gets that far. An embedder that passes no rules has no such step: an operation that sends a responsible — creating an object, a transport without an `owner` — and finds none is answered `"error": "system_context_missing"`, naming `SAP_RESPONSIBLE`, the `x-sap-responsible` header and the login, and no request is made. A missing master system is never refused.

**On-premise systems** are asked too — one request per connection. Where the system answers, nothing more is needed. Where it gives no information (no `systeminformation`, an answer without the user, an error), a basic destination needs nothing more — its `SAP_USERNAME` is the responsible; over SNC or with a token, set `SAP_RESPONSIBLE` in the destination's `.env` or the environment, or send `x-sap-responsible`; set `SAP_MASTER_SYSTEM` only if the system should record one other than itself.

**Cloud systems** (ABAP Cloud / BTP) take both from `systeminformation` on the connected connection — no additional configuration is needed, and none applies. A cloud destination without `SAP_CLIENT` uses the system's default client.

#### Per-request responsible and master system (embedding hosts)

**TL;DR:** a host that serves several SAP users from one process sets the responsible person per request, not in the process context.

The server's own transports already scope the headers and the destination's `.env` per request. An embedding host has its own transport: the process environment is one process-wide value, right for one MCP session per process and wrong for a host that runs requests from different SAP users side by side — every concurrent create would use the same user.

Wrap each request in a request scope instead (`requestContextFromHeaders(headers)` from the same entry point builds one from `x-sap-language`, `x-sap-responsible`, `x-sap-master-system`, `x-sap-debug-terminal-id`, `x-sap-debug-ide-id` and `x-sap-debug-breakpoint-conflict`; `x-sap-login` is not read there — set `login` yourself when the request logs on as that user):

```typescript
import { runWithRequestContext } from '@mcp-abap-adt/lib/request-context';

await runWithRequestContext(
  { responsible: 'JSMITH', masterSystem: 'DEV', masterLanguage: 'EN' },
  () => handleTheRequest(),
);
```

How the scope combines with the process context:

| Key in the scope | Result for this request |
|---|---|
| `responsible` present (even `undefined`) | The scope's value — never a process value (neither `SAP_RESPONSIBLE` nor `setSystemContext`); the connection's parameters replace it where they are made (below) |
| `responsible` absent | The process value (`SAP_RESPONSIBLE`, or what `setSystemContext` / `systemContext` stated) |
| `login` | The user the request is logged on as: never the responsible by itself — only the rules (below) make it one |
| `masterSystem` present (even `undefined`) / absent | The scope's value / the process value |
| `masterLanguage` | Always the scope's value inside a scope, never the process value |

Outside any scope (stdio) the process values apply: `SAP_RESPONSIBLE` (or `setSystemContext`).

**The connection's parameters win, where your host makes them.** The library looks nothing up and applies no rule by default. Pass a resolver (`systemContextResolver: defaultSystemContextResolver`, `@mcp-abap-adt/lib/request-context`, asks `systeminformation`) and the rules (`systemContextRules: responsibleRules`, `@mcp-abap-adt/responsible-rules` — what core, http and sse pass) to `EmbeddableMcpServer` or `HandlerExporter`, and the connection's parameters are made once, before its first tool (a `HandlerExporter` handler: before the call it wraps), and kept:

- the system names its user: `responsible` ← the system's user name, `masterSystem` ← its system id;
- an on-premise system that gives no information (no `systeminformation`, an answer without the user, an error): the stated responsible, else the login (the connection's `SAP_USERNAME`, the request scope's `login`, the process `SAP_USERNAME`), with the stated master system; neither is `system_user_unknown`;
- on ABAP Cloud no information is the call's error, and the tool or handler does not run: a `404` `cloud_without_systeminformation` (the configuration is inconsistent); anything else `system_lookup_failed`. A credential failure (a chain failure, a `401`) is the call's as it came, on both kinds. `EmbeddableMcpServer` answers it as the tool's error; a `HandlerExporter` handler throws it (a `ServerRefusal` carrying the code and fixed words). A failure keeps nothing: the next call asks again.

With a resolver and no rules, the information is applied and no information leaves the table above as it stands; without a resolver nothing is looked up.

**Example `.env` for on-premise:**
```env
SAP_URL=http://your-sap-system:8000
SAP_AUTH_TYPE=basic
SAP_USERNAME=JSMITH
SAP_PASSWORD=secret
SAP_CLIENT=100
SAP_SYSTEM_TYPE=onprem
# Optional: SAP_RESPONSIBLE (defaults to SAP_USERNAME), SAP_MASTER_SYSTEM (else left out)
```

In Claude Code (`claude_desktop_config.json` or `mcp.json`), name that file — the connection is not read from the `env` block:
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--env-path=/path/to/<destination>.env"]
    }
  }
}
```

A `.env` is read once per process: a change to it takes effect on restart.

## Dynamic Configuration Updates

`mcp-abap-adt-http` builds each request's connection from its own `x-sap-*` headers (`mcp-abap-adt-sse`: each SSE connection's, from its opening `GET`). This allows:

1. **Multi-tenant scenarios**: Different clients can connect to different SAP systems
2. **Token handover**: A request may carry a different `x-sap-jwt-token`; the server does not renew it
3. **Runtime configuration**: Configure connections without modifying server files

Nothing is stored, shared or cached across requests (SSE: across connections).

## SSE Mode Configuration

For Server-Sent Events transport, the configuration is similar:

**JWT authentication:**
```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/sse",
    "headers": {
      "x-sap-url": "https://your-sap-system.example",
      "x-sap-jwt-token": "your_jwt_token_here"
    }
  }
}
```

**Basic authentication:**
```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/sse",
    "headers": {
      "x-sap-url": "https://your-onpremise-system.com:8000",
      "x-sap-login": "your_username",
      "x-sap-password": "your_password"
    }
  }
}
```

## Security Considerations

1. **Token Storage**: Never commit tokens to version control. Use environment variables or secure secret management.
2. **HTTPS**: Always use HTTPS for production deployments.
3. **Token Refresh**: Use a destination with browser login: the server renews its token with the refresh token. A token passed in a header is used as it is.
4. **Header Validation**: The server validates header values but does not enforce HTTPS. Ensure your deployment uses HTTPS.
5. **Connection Isolation**: Starting from version 1.1.10, each client session maintains its own isolated SAP connection. This prevents data mixing between different clients connecting to different SAP systems. Each connection is cached based on a unique combination of `sessionId` + `sapUrl` + authentication parameters.

## Troubleshooting

### Connection Issues

- Verify the server is running: `curl http://localhost:3000/health` (if health endpoint exists)
- Check server logs for configuration errors
- Verify header names are correct (case-insensitive, but recommended format: `x-sap-*`)

### Authentication Issues

- Ensure JWT token is not expired
- A destination refused at startup names the fields it lacks (`Destination "X" cannot be used: <fields>`) and one hint
- A `jwt` `.env` must state `SAP_GRANT_TYPE`; write it again with `mcp-auth --service-key <file> --output <file> --type abap|xsuaa` or `mcp-auth --destination <name> --type abap|xsuaa` (`@mcp-abap-adt/auth-broker-cli`)

### Token Refresh

A destination with browser login renews its token itself: with the refresh token first, then a new login if the refresh is refused. A token handed over in `x-sap-jwt-token` (`mcp-abap-adt-http`, `mcp-abap-adt-sse`) is used as it is; when SAP refuses it the request fails and you hand over a new one (a `.env` change takes effect on restart).

## Examples

### JWT you hold (sent per request, not renewed)

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-sap-system.example",
      "x-sap-jwt-token": "<access token>"
    }
  }
}
```

### Basic Authentication

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-onpremise-system.com:8000",
      "x-sap-login": "your_username",
      "x-sap-password": "your_password"
    }
  }
}
```

**Note:** Over HTTP and SSE the user and password come only from the headers (as shown above).

## Related Documentation

- [Installation Guide](../installation/INSTALLATION.md)
- [Server README](../README.md)
- [Stateful Session Guide](../architecture/STATEFUL_SESSION_GUIDE.md)
