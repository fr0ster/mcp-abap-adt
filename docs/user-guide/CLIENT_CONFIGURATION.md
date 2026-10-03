# Client Configuration Guide

This guide explains how to configure MCP clients to connect to the `mcp-abap-adt` server.

If you prefer not to edit JSON/TOML by hand, use the configurator CLI:
`@mcp-abap-adt/configurator` (repo: [`mcp-abap-adt-conf`](https://github.com/fr0ster/mcp-abap-adt-conf), docs: [CLIENT_INSTALLERS.md](https://github.com/fr0ster/mcp-abap-adt-conf/tree/main/docs/CLIENT_INSTALLERS.md)).

## Overview

The `mcp-abap-adt` server supports multiple transport modes:
- **stdio** - Standard input/output (default; for MCP clients like Cline, Cursor)
- **streamable-http** - HTTP-based transport with streaming support (requires `--transport=http`)
- **sse** - Server-Sent Events transport (requires `--transport=sse`)

For HTTP-based transports (streamable-http and sse), you can configure SAP connection parameters via HTTP headers, allowing dynamic connection configuration per request.

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

When using HTTP transport, a request can carry its own connection. The headers state the system and **one** credential; the authentication is decided by which credential is present, so there is no `x-sap-auth-type`:

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
| `x-sap-login` | Yes* (for basic) | Username for basic authentication | `your_username` |
| `x-sap-password` | Yes* (for basic) | Password for basic authentication | `your_password` |
| `x-mcp-destination` | No | A destination name; honoured **only** with `--allow-destination-header` | `TRIAL` |
| `x-sap-master-system` | No | SAP system ID for on-prem transport binding | `<system id>` |
| `x-sap-responsible` | No | Responsible user for transport operations | `<user>` |
| `x-sap-language` | No | Master language of created objects | `EN` |

\* A request that carries `x-sap-url` and either `x-sap-jwt-token` or both `x-sap-login` and `x-sap-password` is a direct connection. A request that carries neither a destination nor such headers is served from the default destination (`--mcp`, `--env` or `--env-path`), or answered `400` if there is none.

**Notes:**
- **Precedence per request:** `x-mcp-destination` (with `--allow-destination-header`), then the `x-sap-*` connection headers, then the default destination.
- A destination name is a plain file name (letters, digits, `_`, `.`, `-`; no path, no leading dot). Anything else is refused with `400`, naming the header.
- For a token that is renewed for you, use a destination with browser login (below), not a header.
- The headers `x-sap-destination`, `x-sap-auth-type` and `x-sap-refresh-token` are no longer read in 16.0; see the [migration note](../MIGRATION-16.0.md).

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
      "x-sap-password": "your_password",
      "x-sap-master-system": "<system id>",
      "x-sap-responsible": "<user>"
    }
  }
}
```

**Note:** For basic authentication, you can pass username and password via HTTP headers (`x-sap-login` and `x-sap-password`) or configure them in the server's `.env` file (`SAP_USERNAME`, `SAP_PASSWORD`). Headers take priority over the default destination.

**System context headers** (`x-sap-master-system`, `x-sap-responsible`) are optional. When provided, they override `SAP_MASTER_SYSTEM` / `SAP_RESPONSIBLE` from `.env` and, for a cloud system, the `getSystemInformation()` API. This is useful for on-premise HTTP/SSE setups where no `.env` file is used.

## Destinations

The server supports **four authentications** — basic (HTTP or RFC), SNC (RFC only, passwordless), JWT with browser login (`authorization_code`) and JWT you hold (`none`). The full table, with the `.env` keys of each, is in [Authentication & Destinations](AUTHENTICATION.md); this section is about wiring a client to one.

A process serves **one default destination**, chosen by:

1. `--mcp=<destination>` — a named destination: `service-keys/<destination>.json` and `sessions/<destination>.env`, read field by field (the `.env` wins).
2. `--env-path=<path|file>` (or `MCP_ENV_PATH`) or `--env=<destination>` (`sessions/<destination>.env`) — one env file, used as it is. A file that does not exist is refused at startup, naming the parameter and the path.

Otherwise there is no default destination. Nothing is looked up in the working directory: a `.env` there is read only when you name it (`--env-path=./.env`).

```bash
# stdio: a named destination
mcp-abap-adt --transport=stdio --mcp=TRIAL

# stdio: one env file
mcp-abap-adt --transport=stdio --env-path=/path/to/.env

# HTTP: a default destination, which a client may override per request
mcp-abap-adt --transport=http --mcp=TRIAL --allow-destination-header
```

Both stdio and the HTTP transports take any of these. Without any of them, stdio starts in inspection-only mode (the tool list answers; a tool call needs a connection) and HTTP/SSE requests need `x-sap-*` headers.

### How It Works

1. **One destination per process by default; more with the header.** A destination named by `x-mcp-destination` is built the first time a request asks for it and kept for the life of the process.
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
2. **Start the server:**
```bash
mcp-abap-adt --transport=http --mcp=TRIAL
```
3. **Configure the client** — no credentials in it:
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
4. **First tool call:** the browser opens for authentication. **Later calls** use the stored token.

To let the client choose per request, start with `--allow-destination-header` and add `"headers": { "x-mcp-destination": "TRIAL" }`.

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
| `--allow-destination-header` | Honour `x-mcp-destination` |

Every parameter, with its environment and YAML forms, is in [CLI_OPTIONS.md](CLI_OPTIONS.md). An invalid port, enum or flag value is refused at startup.

## Server Configuration

The server can be started in HTTP mode with:

```bash
npm run start:http
# or
node dist/index.js --transport streamable-http --port 3000
```

### Environment Variables

Alternatively, you can configure the server via environment variables in a `.env` file.

**For a JWT you hold:**
```env
SAP_URL=https://your-sap-system.example
SAP_AUTH_TYPE=jwt
SAP_GRANT_TYPE=none
SAP_JWT_TOKEN=your_jwt_token_here
```

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

# System context (required for on-prem create/update operations)
SAP_MASTER_SYSTEM=<system id>
# SAP_RESPONSIBLE is optional — falls back to SAP_USERNAME
```

### SAP System Type

The `SAP_SYSTEM_TYPE` environment variable controls which tools are available and how the server interacts with the SAP system:

| Value | Description | Default |
|-------|-------------|---------|
| `cloud` | ABAP Cloud / BTP systems | **Yes** (default) |
| `onprem` | On-premise systems (BASIS ≥ 7.50) | No |
| `legacy` | Legacy on-premise systems (BASIS < 7.50) — **not supported at present**, see below | No |

**Why this matters:** Different SAP environments support different ADT endpoints. For example, Programs are only available on `onprem` systems. The server uses `SAP_SYSTEM_TYPE` to filter tools accordingly.

**On `legacy`:** no tool declares that environment, so a server started with `SAP_SYSTEM_TYPE=legacy` offers none. Support for legacy systems is parked on the `parked/legacy-support` branch until it can be tried against a live one — it was declared on 142 tools and had never been run against such a system, which is a claim rather than a fact.

**Default is `cloud`** — this covers most modern scenarios. On-premise users must set `SAP_SYSTEM_TYPE=onprem` to access on-premise-only tools (e.g., Programs).

You can also set this via CLI: `--system-type=onprem`

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

**Resolution order:** `options.systemType` → `process.env.SAP_SYSTEM_TYPE` → default `cloud`.

### System Context for On-Premise Systems

When creating or updating ABAP objects on on-premise systems, SAP ADT requires `masterSystem` and `responsible` attributes in the XML request body. These ensure that objects are correctly bound to transport requests.

**How system context is resolved:**

| Variable | Purpose | Resolution order |
|----------|---------|-----------------|
| `SAP_MASTER_SYSTEM` | SAP system ID (the three-character SID) | 1. Env var `SAP_MASTER_SYSTEM` → 2. `getSystemInformation()` API (cloud only, per call) |
| `SAP_RESPONSIBLE` | Responsible user for the object | 1. Env var `SAP_RESPONSIBLE` → 2. Env var `SAP_USERNAME` → 3. `getSystemInformation()` API (cloud only, per call) |

The master system is determined from configuration, or by a request in the cloud — there is no other way. Whether a system is cloud is the kind its connection was built for: `SAP_SYSTEM_TYPE` / `--system-type`, else a `jwt` destination is cloud and any other on-premise. It is never guessed from the URL. A connection an embedding host builds itself (not through the server's factory) has no settings to read: `SAP_SYSTEM_TYPE` alone states its kind, on-premise when unset.

**On-premise systems**: nothing is asked of the system, so `SAP_MASTER_SYSTEM` **must** be set in the `.env` file. Without it, create/update operations may fail with `403 Forbidden` because the object gets bound to the wrong transport request.

**Cloud systems** (ABAP Cloud / BTP) resolve the system context per call via the `getSystemInformation()` API on the connected connection — no additional configuration is needed. A cloud destination without `SAP_CLIENT` uses the system's default client.

#### Per-request responsible and master system (embedding hosts)

**TL;DR:** a host that serves several SAP users from one process sets the responsible person per request, not in the process context.

The values above live in one process-wide cache. That is right for one MCP session per process. It is wrong for a host that runs requests from different SAP users side by side: every concurrent create would use whichever user wrote the cache last.

Wrap each request in a request scope instead:

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
| `responsible` / `masterSystem` present (even `undefined`) | The scope's value |
| `responsible` / `masterSystem` absent | The process value (env / `getSystemInformation()`) |
| `masterLanguage` | Always the scope's value inside a scope, never the process value |

Outside any scope (stdio) nothing changes.

**ABAP Cloud fills the gaps.** If a tool call still has no `responsible` or `masterSystem` after the rules above, and its connection is to ABAP Cloud, the library asks the system and fills only the missing one:

- `responsible` ← the system's user name, `masterSystem` ← its system id.
- One lookup per connection, only when a call lacks a value. On-premise: no lookup, nothing filled.
- Only a key that is **absent** counts as missing. A scope carrying `responsible: undefined` has said this request has no responsible, and nothing fills it.
- A lookup that answers nothing is remembered as nothing for that connection; only one that throws is retried. Either way the call runs.

Turn it off with `systemContextResolver: null` on `EmbeddableMcpServer` or `HandlerExporter` (or pass your own resolver).

**Example `.env` for on-premise:**
```env
SAP_URL=http://your-sap-system:8000
SAP_AUTH_TYPE=basic
SAP_USERNAME=JSMITH
SAP_PASSWORD=secret
SAP_CLIENT=100
SAP_SYSTEM_TYPE=onprem
SAP_MASTER_SYSTEM=DEV
```

In Claude Code (`claude_desktop_config.json` or `mcp.json`):
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio"],
      "env": {
        "SAP_URL": "http://your-sap-system:8000",
        "SAP_AUTH_TYPE": "basic",
        "SAP_USERNAME": "JSMITH",
        "SAP_PASSWORD": "secret",
        "SAP_CLIENT": "100",
        "SAP_SYSTEM_TYPE": "onprem",
        "SAP_MASTER_SYSTEM": "DEV"
      }
    }
  }
}
```

With a default destination, `x-sap-*` connection headers in the client configuration are optional; a request that carries a complete set (`x-sap-url` and a credential) uses them instead of the default destination. A `.env` is read once per process: a change to it takes effect on restart.

## Dynamic Configuration Updates

The server automatically updates the connection configuration when it receives HTTP headers with SAP connection parameters. This allows:

1. **Multi-tenant scenarios**: Different clients can connect to different SAP systems
2. **Token handover**: A request may carry a different `x-sap-jwt-token`; the server does not renew it
3. **Runtime configuration**: Configure connections without modifying server files

### Configuration Priority

1. `x-mcp-destination` (with `--allow-destination-header`), then complete `x-sap-*` connection headers
2. The default destination (`--mcp`, `--env` or `--env-path`)

## SSE Mode Configuration

For Server-Sent Events transport, the configuration is similar:

**JWT authentication:**
```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/mcp/events",
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
    "url": "http://localhost:3001/mcp/events",
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
- A destination refused at startup names the fields it lacks (`Destination "X" lacks: <fields>`) and one hint
- A `jwt` `.env` must state `SAP_GRANT_TYPE`; regenerate it with `mcp-auth generate-env --grant <grant>` (`@mcp-abap-adt/auth-broker-cli`)

### Token Refresh

A destination with browser login renews its token itself: with the refresh token first, then a new login if the refresh is refused. A token handed over in `x-sap-jwt-token` or `SAP_JWT_TOKEN` with `SAP_GRANT_TYPE=none` is used as it is; when SAP refuses it the request fails and you hand over a new one (a `.env` change takes effect on restart).

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

**Note:** For basic authentication, you can pass username and password via HTTP headers (as shown above) or configure them in the server's `.env` file. Headers take priority over the default destination:

```env
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
SAP_CLIENT=100
```

### A destination, chosen per request

Start the server with `mcp-abap-adt --transport=http --mcp=TRIAL --allow-destination-header`, then:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-mcp-destination": "DEV"
    }
  }
}
```

The server reads `DEV` from `service-keys/DEV.json` and `sessions/DEV.env` (field by field), opens the browser for a login if there is no valid session, and stores the token (on disk with `--unsafe`, otherwise in memory).

### Minimal Configuration (using .env)

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

In this case, the server uses its default destination: `--mcp`, `--env` or `--env-path`.

## Related Documentation

- [Installation Guide](../installation/INSTALLATION.md)
- [Server README](../README.md)
- [Stateful Session Guide](../architecture/STATEFUL_SESSION_GUIDE.md)
