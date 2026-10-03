# Command Line Interface (CLI) Reference

Complete reference for MCP ABAP ADT Server command line options.

## Available Command

After global installation, one command is available:

- `mcp-abap-adt` - MCP ABAP ADT Server (supports stdio, HTTP, and SSE transports)

## Getting Help

```bash
mcp-abap-adt --help
```

The help message shows all available options for all transport modes.

## General Options

### YAML Configuration File

**--conf=\<path\>** or **--conf \<path\>** (alias: `--config`)

Load server configuration from a YAML file instead of command-line arguments. If the file doesn't exist, a template will be automatically generated.

```bash
# Use YAML config file
mcp-abap-adt --conf=config.yaml

# Override YAML values with command-line arguments
mcp-abap-adt --conf=config.yaml --port=8080
```

**Benefits:**
- Cleaner command-line interface
- Easy to create different configs for different scenarios
- Template generation helps understand available options
- Configuration can be version-controlled

**Command-Line Override:**
Command-line arguments always override YAML values, allowing you to use YAML as base configuration and override specific values when needed.

**See Also:**
- [YAML Configuration Guide](../configuration/YAML_CONFIG.md) - Complete YAML config documentation

### Environment File Configuration

**--env=\<destination\>** or **--env \<destination\>**

Use destination-style env lookup from platform sessions store.

**--env-path=\<path|file\>**

Use an explicit `.env` file path (or relative file name).

```bash
# Destination name -> sessions/<destination>.env
mcp-abap-adt --env=trial

# Explicit path
mcp-abap-adt --env-path=/opt/config/sap-prod.env

# Relative file name/path (resolved from current directory)
mcp-abap-adt --env-path=../configs/dev.env
```

**Environment File Priority:**

The server resolves env file in this order:
1. `--env-path=<path|file>` (or `MCP_ENV_PATH`)
2. `--env=<destination>` -> platform sessions path:
   - Unix: `~/.config/mcp-abap-adt/sessions/<destination>.env`
   - Windows: `%USERPROFILE%\\Documents\\mcp-abap-adt\\sessions\\<destination>.env`

**Nothing is looked up in the working directory.** A server started inside someone else's project
must not take their settings, so a `.env` there is read only when you name it
(`--env-path=./.env`). Without `--env`, `--env-path` or `--mcp` there is no default destination.

A file you name that does not exist is refused at startup, naming the parameter and the path.

The chosen file is read **and written back** with a renewed token, whatever `--unsafe` says.
It is read once per process: a change made from outside takes effect on restart.

**Example workflow:**
```bash
# One file per system, each named explicitly
mcp-abap-adt --env-path=~/configs/abap-dev.env
mcp-abap-adt --env-path=~/configs/abap-prod.env

# Or keep them in the sessions directory and name them
mcp-abap-adt --env=abap-dev   # sessions/abap-dev.env

# A .env in the current directory is read only when named
mcp-abap-adt --env-path=./.env
```

## Transport Selection

**--transport=\<type\>**

Specify which transport protocol to use.

Valid values:
- `stdio` - Standard input/output (default, for MCP clients like Cline, Cursor, Claude Desktop)
- `http` or `streamable-http` - HTTP server (for web interfaces)
- `sse` - Server-Sent Events

```bash
# Default stdio mode (for MCP clients)
mcp-abap-adt

# Explicit stdio mode
mcp-abap-adt --transport=stdio

# HTTP transport (for web interfaces)
mcp-abap-adt --transport=http

# SSE transport
mcp-abap-adt --transport=sse
```

**Note:** The default transport is `stdio`; running bare `mcp-abap-adt` starts stdio. Select the transport explicitly with `--transport=stdio|http|sse`. There are no `--http`/`--sse` standalone shortcuts; configure host and port with the generic `--host`/`--port` flags (and the path flags `--path`/`--sse-path`/`--post-path`).

## SAP Connection Type

**--connection-type=\<type\>**

SAP connection transport layer. Determines how the server communicates with the SAP system.

Valid values:
- `http` - HTTP/HTTPS (default, for modern on-premise and cloud systems)
- `rfc` - RFC via SAP NW RFC SDK (any system supported by NW RFC SDK)

```bash
# Default HTTP connection (modern systems)
mcp-abap-adt --env-path=.env

# RFC connection
mcp-abap-adt --connection-type=rfc --env-path=my-system.env
```

**Note:** RFC requires the SAP NW RFC SDK installed and configured. See [RFC Setup Guide](../installation/RFC_SETUP.md) for prerequisites.

The same option can be set with `SAP_CONNECTION_TYPE=rfc` in the process environment or in the `--env` / `--env-path` `.env` (which joins the environment, never over a value already set), or YAML `connection-type: rfc`. Precedence: the CLI flag, then the environment, then YAML.

## Authentication and Connection Parameters

Every parameter below has a CLI form, a YAML key and — for seven of them — an environment
variable. **CLI wins over the environment, which wins over YAML.** `.env` files and environment
variables hold secrets and the session; YAML holds configuration only. An invalid port, enum
value or flag value is **refused at startup**, naming the parameter in the form you used
(`Invalid --browser-auth-port: "abc". Must be a port between 1 and 65535`), instead of being
ignored.

| CLI | Environment | YAML | Value | Meaning |
|-----|-------------|------|-------|---------|
| `--mcp=<name>` | — | `mcp` | name | Default destination: `service-keys/<name>.json` and `sessions/<name>.env`, field by field |
| `--env=<name>` | — | `env` | name | One env file, `sessions/<name>.env` |
| `--env-path=<path>` | `MCP_ENV_PATH` | `env-path` | path | One env file by path or file name (relative to the working directory) |
| `--auth-broker-path=<dir>` | `AUTH_BROKER_PATH` | `auth-broker-path` | path | Base directory of `service-keys/` and `sessions/` (default: the platform paths) |
| `--unsafe` | `MCP_UNSAFE` | `unsafe` | flag | Write named destinations' sessions to disk instead of keeping them in memory |
| `--browser=<name>` | `MCP_BROWSER` | `browser` | `chrome`, `edge`, `firefox`, `system`, `headless`, `none` | Browser for a login (default `system`) |
| `--browser-auth-port=<port>` | `MCP_BROWSER_AUTH_PORT` | `browser-auth-port` | 1-65535 | Login callback port (default `61001`) |
| `--allow-destination-header` | — | `allow-destination-header` | flag | Honour `x-mcp-destination` (HTTP/SSE, off by default) |
| `--connection-type=<type>` | `SAP_CONNECTION_TYPE` | `connection-type` | `http`, `rfc` | SAP connection type (default `http`) |
| `--system-type=<type>` | `SAP_SYSTEM_TYPE` | `system-type` | `onprem`, `cloud`, `legacy` | SAP system type: the tools offered (default `cloud`); the connector and whether the responsible / master system are asked of the system (default `cloud` for a `jwt` destination, else `onprem`; never guessed from the URL) |

The environment forms `MCP_DESTINATION`, `MCP_ENV` and `MCP_ALLOW_DESTINATION_HEADER` do **not**
exist; use `--mcp`, `--env` and `--allow-destination-header` (or their YAML keys).

**Removed in 16.0.0:** `--auth-broker`, `MCP_USE_AUTH_BROKER` and the YAML key `auth-broker`. A
leftover one stops the start: `<name> was removed in 16.0.0 — remove it from the configuration`,
naming the form you used.

**--mcp=\<destination\>**

Default destination for the process. Used for every request unless `--allow-destination-header`
is enabled and the request carries `x-mcp-destination`.

```bash
mcp-abap-adt --transport=stdio --mcp=TRIAL
mcp-abap-adt --transport=sse --mcp=TRIAL
mcp-abap-adt --transport=http --mcp=TRIAL
```

- An XSUAA service key needs `XSUAA_MCP_URL` in `sessions/<name>.env` (the key carries the UAA,
  not the system).
- Without `--unsafe` the session is kept in memory: one browser login per process.
- With no default destination, an HTTP/SSE request without `x-sap-*` headers is answered `400`.

**--browser-auth-port=\<port\>**

Callback port of the browser login (JWT / `authorization_code`). The default is **`61001`** for
every transport; `0`, `70000`, `-1` or `abc` are refused at startup. Set it when the port is
taken or the redirect is registered elsewhere.

```bash
mcp-abap-adt --transport=http --mcp=TRIAL --browser-auth-port=61005
```

**--allow-destination-header**

Lets a client choose the destination per request with `x-mcp-destination`. The header must be a
plain destination name (letters, digits, `_`, `.`, `-`; no path, no leading dot); anything else
is refused naming the header.

```bash
mcp-abap-adt --transport=http --mcp=TRIAL --allow-destination-header
```

See [Authentication & Destinations](AUTHENTICATION.md) for the four supported authentications.

## HTTP Server Options

Used with `--transport=http` or `--transport=streamable-http`.

### Port Configuration

**--port=\<port\>**

HTTP server port (default: 3000).

```bash
mcp-abap-adt --transport=http --port=8080
```

### Host Binding

**--host=\<host\>**

HTTP server host address (default: 127.0.0.1).

- **127.0.0.1** (default): the server listens on the loopback interface.
- **0.0.0.0**: the server listens on all network interfaces.

```bash
# Bind to localhost only (default)
mcp-abap-adt --transport=http --host=127.0.0.1

# Bind to all interfaces
mcp-abap-adt --transport=http --host=0.0.0.0
```

### Path Configuration

**--path=\<path\>** (alias **--http-path=\<path\>**)

HTTP endpoint path (default: /mcp/stream/http).

```bash
mcp-abap-adt --transport=http --path=/mcp/stream/http
```

### Response Format

**--http-json-response**

Enable JSON response format.

```bash
mcp-abap-adt --transport=http --http-json-response
```

### DNS-Rebinding Protection (HTTP)

DNS-rebinding protection (Host + Origin allowlist; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted):

- `--http-allowed-hosts=<list>`   Comma-separated exact Host header values to allow,
                                  including port (e.g. `localhost:3000`).
- `--http-allowed-origins=<list>` Comma-separated exact Origin header values to allow,
                                  including scheme (e.g. `https://app.example.com`).
- `--http-enable-dns-protection`  Enable validation. Required for the allowlists to take
                                  effect; needs at least one of the two lists set.
                                  A non-allowlisted Host/Origin gets HTTP 403.

Only effective when `--http-enable-dns-protection` is set AND at least one allowlist is non-empty.
Env vars: `MCP_HTTP_ALLOWED_HOSTS`, `MCP_HTTP_ALLOWED_ORIGINS`, `MCP_HTTP_ENABLE_DNS_PROTECTION`.
YAML keys: `http.allowed-hosts`, `http.allowed-origins`, `http.enable-dns-protection`.

```bash
# Enable DNS-rebinding protection for HTTP transport
mcp-abap-adt --transport=http \
  --http-enable-dns-protection \
  --http-allowed-hosts=localhost:3000 \
  --http-allowed-origins=https://app.example.com
```

### Complete HTTP Example

```bash
mcp-abap-adt --transport=http \
  --port=8080 \
  --host=0.0.0.0 \
  --env-path=~/configs/sap-prod.env
```

## SSE Server Options

Used with `mcp-abap-adt --transport=sse` or `--transport=sse`.

### Port Configuration

**--port=\<port\>**

SSE server port (default: 3001).

```bash
mcp-abap-adt --transport=sse --port=8081
```

### Host Binding

**--host=\<host\>**

SSE server host address (default: 127.0.0.1).

- **127.0.0.1** (default): the server listens on the loopback interface.
- **0.0.0.0**: the server listens on all network interfaces.

```bash
# Bind to localhost only (default)
mcp-abap-adt --transport=sse --host=127.0.0.1

# Bind to all interfaces
mcp-abap-adt --transport=sse --host=0.0.0.0
```

### Path Configuration

**--sse-path=\<path\>**

SSE connection path (default: /sse).

**--post-path=\<path\>**

SSE message post path (default: /messages).

```bash
mcp-abap-adt --transport=sse --sse-path=/sse --post-path=/messages
```

### DNS-Rebinding Protection (SSE)

DNS-rebinding protection (Host + Origin allowlist; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted):

- `--sse-allowed-hosts=<list>`   Comma-separated exact Host header values to allow,
                                 including port (e.g. `localhost:3001`).
- `--sse-allowed-origins=<list>` Comma-separated exact Origin header values to allow,
                                 including scheme (e.g. `https://app.example.com`).
- `--sse-enable-dns-protection`  Enable validation. Required for the allowlists to take
                                 effect; needs at least one of the two lists set.
                                 A non-allowlisted Host/Origin gets HTTP 403.

Only effective when `--sse-enable-dns-protection` is set AND at least one allowlist is non-empty.
Env vars: `MCP_SSE_ALLOWED_HOSTS`, `MCP_SSE_ALLOWED_ORIGINS`, `MCP_SSE_ENABLE_DNS_PROTECTION`.
YAML keys: `sse.allowed-hosts`, `sse.allowed-origins`, `sse.enable-dns-protection`.

```bash
# Enable DNS-rebinding protection for SSE transport
mcp-abap-adt --transport=sse \
  --sse-enable-dns-protection \
  --sse-allowed-hosts=localhost:3001 \
  --sse-allowed-origins=https://app.example.com
```

### Complete SSE Example

```bash
mcp-abap-adt --transport=sse \
  --port=3001 \
  --host=0.0.0.0 \
  --env-path=~/configs/sap-dev.env
```

## Environment Variables

Alternative to command line arguments. Environment variables can be set in shell or `.env` file.

### General

- `MCP_ENV_PATH` - Explicit path to `.env` file (same as `--env-path`)
- `MCP_SKIP_AUTO_START` - Skip automatic server start (true|false, for testing)
- `MCP_TRANSPORT` - Default transport type (stdio|http|sse)
- `MCP_UNSAFE` - Write named destinations' sessions to disk (true|false)
- `MCP_BROWSER` - Browser for a login: chrome, edge, firefox, system, headless, none
- `MCP_BROWSER_AUTH_PORT` - Login callback port (default 61001)

### HTTP Transport

- `MCP_HTTP_PORT` - Default HTTP port
- `MCP_HTTP_HOST` - Default HTTP host (default: 127.0.0.1)
- `MCP_HTTP_ENABLE_JSON_RESPONSE` - Enable JSON responses (true|false)
- `MCP_HTTP_ALLOWED_HOSTS` - Comma-separated exact Host header values (DNS-rebinding protection; includes port, e.g. `localhost:3000`)
- `MCP_HTTP_ALLOWED_ORIGINS` - Comma-separated exact Origin header values (DNS-rebinding protection; includes scheme, e.g. `https://app.example.com`)
- `MCP_HTTP_ENABLE_DNS_PROTECTION` - Enable Host/Origin allowlist validation (true|false; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted)

### SSE Transport

- `MCP_SSE_PORT` - Default SSE port
- `MCP_SSE_HOST` - Default SSE host
- `MCP_SSE_ALLOWED_HOSTS` - Comma-separated exact Host header values (DNS-rebinding protection; includes port, e.g. `localhost:3001`)
- `MCP_SSE_ALLOWED_ORIGINS` - Comma-separated exact Origin header values (DNS-rebinding protection; includes scheme, e.g. `https://app.example.com`)
- `MCP_SSE_ENABLE_DNS_PROTECTION` - Enable Host/Origin allowlist validation (true|false; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted)

### SAP Connection

These are typically set in `.env` file:

**Basic Authentication:**
- `SAP_URL` - SAP system URL (required)
- `SAP_CLIENT` - SAP client number (required)
- `SAP_AUTH_TYPE` - Authentication type: `basic`, `snc` or `jwt` (**required**: a `.env` without it is refused with `Destination "X" lacks: authType`). `saml`, `certificate` and `kerberos` are not supported
- `SAP_SYSTEM_TYPE` - SAP system type: `cloud` or `onprem` (same as `--system-type`). The tools offered default to `cloud` — e.g., Programs require `onprem`; the connector and whether the responsible / master system are asked of the system default to `cloud` for a `jwt` destination, else `onprem` (never guessed from the URL). **Set it explicitly for on-premise systems.** `legacy` is accepted as a value but no tool declares that environment: support for legacy systems (BASIS < 7.50) is parked on the `parked/legacy-support` branch until it can be tried against a live one.
- `SAP_USERNAME` - SAP username (for basic auth). Also the login the responsible of created objects falls back to when no `SAP_RESPONSIBLE` / `x-sap-responsible` is stated (the destination's own first, then `x-sap-login`, then the process environment's)
- `SAP_PASSWORD` - SAP password (for basic auth)
- `SAP_CONNECTION_TYPE` - Connection transport: `http` (default) or `rfc` (process environment, or the `--env` / `--env-path` `.env`)
- `SAP_LANGUAGE` - SAP language (optional, e.g., EN, DE)
- `SAP_MASTER_SYSTEM` - Master system of created objects (the system id), optional. In the destination's own `.env` (the `--env` / `--env-path` file, or `sessions/<destination>.env`) or the process environment; the `x-sap-master-system` header wins over both, the destination's `.env` over the environment. On a cloud system the system is asked when none is stated; otherwise the attribute is left out of the request and the system applies itself. Never refused
- `SAP_RESPONSIBLE` - Responsible person of created objects, optional. Same order, with the `x-sap-responsible` header; when none is stated, the login (`SAP_USERNAME` of the destination, `x-sap-login`, `SAP_USERNAME` of the environment; on a cloud system, the system's user). A create that finds none (SNC, a token you hold) is refused naming `SAP_RESPONSIBLE`, nothing sent

**SNC (RFC only, no user, no password):**
- `SAP_AUTH_TYPE=snc`; start with `--connection-type=rfc`
- `SAP_SNC_PARTNERNAME` - The system's SNC name (required)
- `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` - Optional

**JWT/OAuth2 Authentication:**
- `SAP_GRANT_TYPE` - `authorization_code` or `none` (**required** with `SAP_AUTH_TYPE=jwt`)
- `SAP_JWT_TOKEN` - The token (with `SAP_GRANT_TYPE=none`; otherwise the server stores the one it obtained)
- `SAP_REFRESH_TOKEN` - Refresh token for automatic token renewal
- `SAP_UAA_URL` - UAA URL for OAuth2 (alternative: `UAA_URL`)
- `SAP_UAA_CLIENT_ID` - UAA Client ID (alternative: `UAA_CLIENT_ID`)
- `SAP_UAA_CLIENT_SECRET` - UAA Client Secret (alternative: `UAA_CLIENT_SECRET`)

### Auth-Broker

- `AUTH_BROKER_PATH` - Base directory of `service-keys/` and `sessions/` (see the parameter table above)
- `DEBUG_AUTH_LOG` - Enable debug logging for auth-broker (true|false)
- `DEBUG_AUTH_BROKER` - Alias for `DEBUG_AUTH_LOG`

### Debug

- `DEBUG_HANDLERS` - Enable handler debug logging (true|false)
- `DEBUG_CONNECTORS` - Enable connector debug logging (true|false)
- `DEBUG_CONNECTION_MANAGER` - Enable connection manager debug logging (true|false)
- `HANDLER_LOG_SILENT` - Disable all handler logs (true|false)
- `DEBUG_RFC_WIRE` - Put the RFC request headers and both bodies on the debug
  channel (true|1). **RFC only**, off by default, and the only way to see a
  payload that was mis-serialised before it reached `SADT_REST_RFC_ENDPOINT`.
  Setting it is enough: where nothing else configured a logger, asking for the
  wire brings one at `debug`, **writing to stderr** — stdout carries JSON-RPC
  in stdio transport and must stay clean. A logger the caller already supplied
  is used as it is and never redirected, so a caller who supplies one that
  writes to stdout is responsible for that choice.
  Credential header values are replaced with `[redacted]` by
  `@mcp-abap-adt/connection`, so the output is safe to paste into an issue —
  but bodies are clipped, not redacted, so treat a body carrying a secret
  accordingly.
- `DEBUG_RFC_BODY_CHARS` - Ceiling on a logged body, in characters (default
  2000). `0` logs the size alone, `Infinity` the whole body.

### Example Environment Setup

**Shell environment:**
```bash
export MCP_HTTP_PORT=8080
mcp-abap-adt --transport=http
```

**System .env file:**
```bash
# ~/.mcp-abap-adt.env
MCP_HTTP_PORT=8080

# Use it
mcp-abap-adt --transport=http --env-path ~/.mcp-abap-adt.env
```

## Priority Order

When the same option is specified multiple ways, this is the priority order (highest to lowest):

1. **Command line arguments** (`--port=8080`)
2. **Environment variables** (`MCP_HTTP_PORT=8080`)
3. **YAML config file** (configuration only; secrets are refused there)
4. **Default values**

Example:
```bash
# Port 9000 wins (command line)
export MCP_HTTP_PORT=8080
mcp-abap-adt --transport=http --port=9000
```

## Common Usage Patterns

### Development Setup

```bash
# Create dev environment
cd ~/dev/my-abap-project
cat > .env << EOF
SAP_URL=https://dev.sap.company.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_SYSTEM_TYPE=onprem
SAP_USERNAME=developer
SAP_PASSWORD=dev-password
EOF

# Run with auto-discovery
mcp-abap-adt
```

### RFC Connection Setup

```bash
# Create RFC environment
cat > rfc-system.env << EOF
SAP_URL=https://sap.company.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_SYSTEM_TYPE=onprem
SAP_USERNAME=developer
SAP_PASSWORD=dev-password
EOF

# Run with RFC connection
mcp-abap-adt --connection-type=rfc --env-path=rfc-system.env

# Or from the process environment
SAP_CONNECTION_TYPE=rfc mcp-abap-adt --env-path=rfc-system.env
```

### Production Setup

```bash
# Centralized config
sudo mkdir -p /etc/mcp-abap-adt
sudo cat > /etc/mcp-abap-adt/prod.env << EOF
SAP_URL=https://prod.sap.company.example
SAP_CLIENT=200
SAP_AUTH_TYPE=jwt
SAP_GRANT_TYPE=none
SAP_JWT_TOKEN=production-jwt-token
EOF

# Run with explicit config
mcp-abap-adt --transport=http \
  --env-path=/etc/mcp-abap-adt/prod.env \
  --port=8080
```

### Multi-Environment

```bash
# Structure
~/sap-configs/
├── dev.env
├── test.env
└── prod.env

# Quick switch
alias mcp-dev='mcp-abap-adt --env-path=~/sap-configs/dev.env'
alias mcp-test='mcp-abap-adt --env-path=~/sap-configs/test.env'
alias mcp-prod='mcp-abap-adt --transport=http --env-path=~/sap-configs/prod.env --port=8080'

# Use
mcp-dev
mcp-prod
```

## Troubleshooting

### Server Won't Start

Check that the file you named exists and is readable (a named file that does not exist is
refused at startup, naming the parameter and the path):
```bash
ls -la ~/configs/sap.env
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000

# Use different port
mcp-abap-adt --transport=http --port=3001
```

### No Destination, or the Wrong One

The server reads only the file you name — never a `.env` it happens to find in the working
directory. Name it with `--env-path=<path>` (`--env-path=./.env` for the current directory),
`--env=<name>` (`sessions/<name>.env`), or use `--mcp=<name>`. The startup summary on stderr names
the destination and the file it serves.

## See Also

- [Installation Guide](../installation/INSTALLATION.md)
- [Client Configuration](CLIENT_CONFIGURATION.md)
- [Available Tools](AVAILABLE_TOOLS.md)
