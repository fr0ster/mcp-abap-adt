# MCP ABAP ADT Server - Installation Guide

How to install the server, which variant to install, and what each variant needs on the machine.
Platform walk-throughs: [Windows](./platforms/INSTALL_WINDOWS.md), [macOS](./platforms/INSTALL_MACOS.md),
[Linux](./platforms/INSTALL_LINUX.md). RFC and SNC in detail: [RFC Setup](RFC_SETUP.md).

## Installation variants

Two choices make a variant: **which server** and **how it connects to the ABAP system**. They are
independent — either server connects every way.

### Which server

| Package | What it is | Command |
|---|---|---|
| [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core) | **The full server**: one tool per object type and operation (`CreateClass`, `GetTable`, …), in the `readonly`, `high` and `low` sets. | `mcp-abap-adt` |
| [`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact) | **The compact server**: one tool per operation, the object type in the arguments (`HandlerCreate` with `object_type`) — a short tool list for a host that cannot select tools per request. Configuration is the full server's. | `mcp-abap-adt-compact` |
| [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib), [`compact-readonly`](https://www.npmjs.com/package/@mcp-abap-adt/compact-readonly), [`compact-modify`](https://www.npmjs.com/package/@mcp-abap-adt/compact-modify) | Libraries, not servers: the tool handlers and an embeddable server for your own application. | — |

### How it connects

| Connection | Authentication (`SAP_AUTH_TYPE`) | What the machine needs besides Node.js |
|---|---|---|
| **HTTP** (default) | `basic`, or `jwt` (browser login with a service key, or a token you hold) | Nothing. |
| **RFC** (`SAP_CONNECTION_TYPE=rfc`) | `basic` | The SAP NW RFC SDK and a C++ build toolchain **at install time** — the RFC module is compiled by `npm install`. |
| **SNC** (RFC, passwordless) | `snc` | Everything RFC needs, plus an SNC product logged on — typically SAP Secure Login Client. No user, no password in the `.env`. |

The authentications in full: [Authentication & Destinations](../user-guide/AUTHENTICATION.md).

### What to run

**HTTP** — full or compact:

```bash
npm install -g @mcp-abap-adt/core        # mcp-abap-adt
npm install -g @mcp-abap-adt/compact     # mcp-abap-adt-compact
```

**RFC and SNC** — the same command, run **after** the SDK and the toolchain are in place and with
`SAPNWRFC_HOME` set in the shell that runs it:

```bash
# Linux / macOS
export SAPNWRFC_HOME=/path/to/nwrfcsdk
npm install -g @mcp-abap-adt/core        # or @mcp-abap-adt/compact
```

```powershell
# Windows (PowerShell)
$env:SAPNWRFC_HOME = "C:\nwrfcsdk\nwrfcsdk"
$env:PATH = "$env:SAPNWRFC_HOME\lib;$env:PATH"
npm install -g @mcp-abap-adt/core        # or @mcp-abap-adt/compact
```

Then check that the RFC module is there:

```bash
npm ls -g @mcp-abap-adt/sap-rfc-lite
```

**`(empty)` means the server was installed without RFC.** `@mcp-abap-adt/sap-rfc-lite` is an optional
dependency, and when it cannot be compiled — no SDK, `SAPNWRFC_HOME` unset, no compiler — npm drops it
and still reports success. The server then starts with every tool and refuses the first RFC call with
`@mcp-abap-adt/sap-rfc-lite is not available`. Fix the cause and run the install again. The toolchain per
platform, the runtime settings and the SNC prerequisites: [RFC Setup](RFC_SETUP.md).

### Portable build (personal)

One executable per server and platform, with Node.js and your own SAP NW RFC SDK inside: unpack and run,
no Node.js, npm or compiler on the machine — HTTP, RFC and, on Windows and macOS, SNC. You build it
yourself from this repository (`npm run portable:build`) and keep it: it carries the SDK, so it is never
handed on. See [Portable Build](PORTABLE.md).

### HTTPS certificates

The server verifies the certificate of an `https://` system (from 17.0.0). A system whose certificate is
self-signed or issued by a company CA is refused at its first request until Node.js trusts that CA:
point `NODE_EXTRA_CA_CERTS` at a PEM file holding it, in the environment of the server process. Turning
verification off is `TLS_REJECT_UNAUTHORIZED=0` in that same environment — a destination's `.env` is not
read for either. See [Migrating to 17.0.0](../MIGRATION-17.0.md).

## Prerequisites

- **Node.js** 22 or 24, with **npm** 9 or later
- Access to an SAP ABAP system (on-premise or BTP)
- For RFC and SNC: see the table above
- Git only to build from source

## Installing

After `npm install -g @mcp-abap-adt/core` you have the `mcp-abap-adt` command (default: stdio);
`--transport=http` and `--transport=sse` serve the other MCP transports. `@mcp-abap-adt/compact` gives
`mcp-abap-adt-compact`, which takes the same options.

**To write a `.env` for JWT authentication**, install the CLI separately (`mcp-auth` and `mcp-sso` ship in `@mcp-abap-adt/auth-broker-cli`, not in `@mcp-abap-adt/auth-broker`):
```bash
npm install -g @mcp-abap-adt/auth-broker-cli
mcp-auth generate-env --grant authorization_code   # `mcp-auth --help` lists the other flags
```
A `jwt` `.env` must state `SAP_GRANT_TYPE`.

**Get help on available options:**
```bash
mcp-abap-adt --help
```

**Setup .env file:**

For basic authentication:
```bash
# The server reads only a file you name: start it with --env-path=~/my-project/.env
cd ~/my-project
cat > .env << EOF
SAP_URL=https://your-sap-system.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
# System type: cloud (default for tools), onprem, or legacy
# Controls tool availability (e.g. Programs require onprem)
SAP_SYSTEM_TYPE=onprem
EOF
```

For JWT authentication (SAP BTP) with browser login, put the service key in `~/.config/mcp-abap-adt/service-keys/<destination>.json` and start with `--mcp=<destination>` (see below), or write a `.env`:
```bash
# One-time setup: the CLI that writes destination files
npm install -g @mcp-abap-adt/auth-broker-cli

# Write a .env that states its authentication and grant
mcp-auth generate-env --grant authorization_code   # `mcp-auth --help` lists the other flags
```

For RFC with basic authentication, add `SAP_CONNECTION_TYPE=rfc` to the basic `.env` above.

For SNC (passwordless logon over RFC; no user, no password):
```bash
SAP_URL=http://your-sap-system.example:8000
SAP_CLIENT=100
SAP_CONNECTION_TYPE=rfc
SAP_AUTH_TYPE=snc
SAP_SNC_PARTNERNAME='p:CN=<system>, O=<org>, C=<country>'
# Creates need a responsible person: no login is known over SNC
SAP_RESPONSIBLE=<your ABAP user>
```
Over RFC the host comes from `SAP_URL` and the system number from its port (`80NN` → `NN`). For a URL
whose port follows no such rule (an `https` port such as `44300`), set `SAP_SYSNR` in the process
environment. See [RFC Setup](RFC_SETUP.md).

**Run the server:**
```bash
# Default stdio mode (bare command starts stdio; HTTP/SSE require --transport=http/--transport=sse)
# Note: a named destination is chosen with `--mcp=<destination>` on every transport,
# and per request on HTTP/SSE with the x-mcp-destination header (--allow-destination-header)
mcp-abap-adt

# stdio mode (for MCP clients, requires --env, --env-path or --mcp)
# Example: mcp-abap-adt --transport=stdio --mcp=TRIAL
mcp-abap-adt --transport=stdio

# Or specify env destination from sessions store
mcp-abap-adt --env=trial

# Or explicit .env location
mcp-abap-adt --env-path=/path/to/my.env
mcp-abap-adt --env-path ~/configs/sap-dev.env

# Start HTTP server on custom port
mcp-abap-adt --transport=http --port=8080
```

**Environment File Priority:**
1. Path specified via `--env-path` (or `MCP_ENV_PATH`)  
2. Destination file via `--env=<destination>`:
   - Unix: `~/.config/mcp-abap-adt/sessions/<destination>.env`
   - Windows: `%USERPROFILE%\\Documents\\mcp-abap-adt\\sessions\\<destination>.env`

Nothing is looked up in the working directory: a server started inside someone else's project must not take
their settings. A `.env` there is read only when you name it (`--env-path=./.env`).

### From source (development)

```bash
git clone https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install          # set SAPNWRFC_HOME first if you want RFC
npm run build
npm test             # unit tests; integration tests need a system, see docs/development/tests
```

The checkout is not runnable as a server by itself: `server/` and `compact/` take `@mcp-abap-adt/lib` as a
package. To run what you built, pack it and install the tarballs together:

```bash
npm pack                                  # @mcp-abap-adt/lib
(cd server && npm pack)                   # @mcp-abap-adt/core
npm install -g ./mcp-abap-adt-lib-<version>.tgz ./server/mcp-abap-adt-core-<version>.tgz
```

---

## 📦 Package Installation Details

#### Local Installation (Project-specific)

Install in your project directory:

```bash
cd /path/to/your/project
npm install @mcp-abap-adt/core
npx mcp-abap-adt --transport=http --port=3000
```

#### Configuration

The server supports **four authentications** — basic (HTTP or RFC), SNC (RFC, passwordless), JWT with browser login and JWT you hold — see [Authentication & Destinations](../user-guide/AUTHENTICATION.md). A destination lives in one of two places:

1. **Named destination** (`--mcp=<destination>`): `service-keys/<destination>.json` and `sessions/<destination>.env`, read field by field
2. **A `.env` file** (`--env` or `--env-path`): one file, read and written back with a renewed token

##### Option 1: Service Key (named destination)

**Setup:**
```bash
# Create service key directory (Unix)
mkdir -p ~/.config/mcp-abap-adt/service-keys

# Create service key file (e.g., TRIAL.json) from the key downloaded from SAP BTP
cat > ~/.config/mcp-abap-adt/service-keys/TRIAL.json << 'EOF'
{
  "uaa": {
    "url": "https://your-uaa-url.com",
    "clientid": "your-client-id",
    "clientsecret": "your-client-secret"
  },
  "url": "https://your-sap-url.com"
}
EOF

# Run the server with the destination; the first tool call opens a browser login
# (callback port 61001 unless --browser-auth-port says otherwise)
mcp-abap-adt --mcp=TRIAL
```

An XSUAA service key carries the UAA, not the system: state the system's URL as `XSUAA_MCP_URL` in `~/.config/mcp-abap-adt/sessions/TRIAL.env`.

**Choosing the destination per request (HTTP/SSE):** start the server with `--allow-destination-header` and send

```json
{
  "headers": {
    "x-mcp-destination": "TRIAL"
  }
}
```

See [Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md#destinations) for details.

##### Option 2: .env File

For single-configuration scenarios, you can use a `.env` file:

After installation, create a `.env` file with your SAP connection details:

```bash
# Create .env file (a JWT you hold)
cat > .env << 'EOF'
SAP_URL=https://your-sap-system.example
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_GRANT_TYPE=none
SAP_JWT_TOKEN=your-jwt-token
# System type: cloud (default), onprem, or legacy
SAP_SYSTEM_TYPE=cloud
EOF
```

A `.env` is read once per process: a change to it takes effect on restart.

Or use a custom environment file:

```bash
mcp-abap-adt --transport=http --env-path /path/to/custom/.env --port=3000
```

#### Usage Examples

**Example 1: Start HTTP server on default port (3000)**
```bash
mcp-abap-adt --transport=http
```

**Example 2: Start HTTP server on custom port**
```bash
mcp-abap-adt --transport=http --port=8080
```

**Example 3: Start HTTP server accessible from network**
```bash
mcp-abap-adt --transport=http --host=0.0.0.0 --port=3000
```

**Example 4: Use custom environment file**
```bash
mcp-abap-adt --transport=http --env-path /opt/config/.env.production --port=8080
```

**Example 5: Start SSE server**
```bash
mcp-abap-adt --transport=sse --port=3000
```

#### Command Line Options

All server commands (`mcp-abap-adt`, `mcp-abap-adt --transport=http`, `mcp-abap-adt --transport=sse`) support the following options:

**General Options:**
- `--help` - Show complete help message with all available options
- `--mcp=<destination>` - Named destination (`service-keys/<destination>.json` + `sessions/<destination>.env`)
- `--auth-broker-path=<path>` - Base directory of the `service-keys` and `sessions` subdirectories
  - Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
- `--env=<destination>` - Destination env file from sessions store (`<destination>.env`)
- `--env-path=<path|file>` - Explicit path to a `.env` file
- `--unsafe` - Write named destinations' sessions to disk (default: in memory)
- `--browser=<name>`, `--browser-auth-port=<port>` - Browser and callback port (default `61001`) of a login
- `--allow-destination-header` - Honour `x-mcp-destination` (HTTP/SSE)

**Note:** When no `--mcp`, `--env` or `--env-path` is given, there is no default destination: nothing is looked up in the working directory (`--env-path=./.env` names a `.env` there). An invalid port, enum or flag value is refused at startup.

**Transport Selection:**
- `--transport=<type>` - Transport type: `stdio`, `http`, `streamable-http`, or `sse`

**HTTP Server Options (for `mcp-abap-adt --transport=http`):**
- `--host=<host>` - Server host (default: 127.0.0.1; use 0.0.0.0 for all interfaces)
- `--port=<port>` - Server port (default: 3000 for http)
- `--path=<path>` / `--http-path=<path>` (alias) - HTTP endpoint path (default: /mcp/stream/http)
- `--http-json-response` - Enable JSON response format
- `--http-allowed-hosts=<list>` - Comma-separated exact Host header values for DNS-rebinding protection (includes port, e.g. `localhost:3000`)
- `--http-allowed-origins=<list>` - Comma-separated exact Origin header values for DNS-rebinding protection (includes scheme, e.g. `https://app.example.com`)
- `--http-enable-dns-protection` - Enable Host/Origin allowlist validation (NOT browser CORS — no Access-Control-Allow-Origin headers are emitted); needs at least one list set; non-allowlisted Host/Origin → HTTP 403

**SSE Server Options (for `mcp-abap-adt --transport=sse`):**
- `--host=<host>` - Server host (default: 127.0.0.1; use 0.0.0.0 for all interfaces)
- `--port=<port>` - Server port (default: 3001 for sse)
- `--sse-path=<path>` - SSE connection path (default: /sse)
- `--post-path=<path>` - SSE message post path (default: /messages)
- `--sse-allowed-hosts=<list>` - Comma-separated exact Host header values for DNS-rebinding protection (includes port, e.g. `localhost:3001`)
- `--sse-allowed-origins=<list>` - Comma-separated exact Origin header values for DNS-rebinding protection (includes scheme, e.g. `https://app.example.com`)
- `--sse-enable-dns-protection` - Enable Host/Origin allowlist validation (NOT browser CORS — no Access-Control-Allow-Origin headers are emitted); needs at least one list set; non-allowlisted Host/Origin → HTTP 403

**Environment Variables:**

You can also configure the server using environment variables.

*MCP Server Configuration:*
- `MCP_ENV_PATH` - Explicit path to `.env` file (same as `--env-path`)
- `MCP_TRANSPORT` - Default transport type (stdio|http|sse)
- `MCP_HTTP_PORT` - Default HTTP port
- `MCP_HTTP_HOST` - Default HTTP host (default: 127.0.0.1)
- `MCP_HTTP_ALLOWED_HOSTS` - Comma-separated exact Host header values (DNS-rebinding protection; includes port, e.g. `localhost:3000`)
- `MCP_HTTP_ALLOWED_ORIGINS` - Comma-separated exact Origin header values (DNS-rebinding protection; includes scheme)
- `MCP_HTTP_ENABLE_DNS_PROTECTION` - Enable HTTP Host/Origin allowlist validation (true|false; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted)
- `MCP_SSE_PORT` - Default SSE port
- `MCP_SSE_HOST` - Default SSE host (default: 127.0.0.1)
- `MCP_SSE_ALLOWED_HOSTS` - Comma-separated exact Host header values (DNS-rebinding protection; includes port, e.g. `localhost:3001`)
- `MCP_SSE_ALLOWED_ORIGINS` - Comma-separated exact Origin header values (DNS-rebinding protection; includes scheme)
- `MCP_SSE_ENABLE_DNS_PROTECTION` - Enable SSE Host/Origin allowlist validation (true|false; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted)
- `MCP_UNSAFE` - Write named destinations' sessions to disk (true|false)
- `MCP_BROWSER` - Browser for a login (chrome, edge, firefox, system, headless, none)
- `MCP_BROWSER_AUTH_PORT` - Login callback port (default 61001)

*Auth-Broker:*
- `AUTH_BROKER_PATH` - Base directory of `service-keys/` and `sessions/`
- `DEBUG_AUTH_LOG` - Enable auth-broker debug logging (true|false)

*Debug Options:*
- `DEBUG_HANDLERS` - Enable handler debug logging (true|false)
- `DEBUG_CONNECTORS` - Enable connector debug logging (true|false)
- `DEBUG_CONNECTION_MANAGER` - Enable connection manager debug logging (true|false)
- `HANDLER_LOG_SILENT` - Disable all handler logs (true|false)

*SAP Connection (in .env file):*
- `SAP_URL` - SAP system URL (required)
- `SAP_CLIENT` - SAP client number (required)
- `SAP_AUTH_TYPE` - Authentication type: basic|snc|jwt (required)
- `SAP_GRANT_TYPE` - `authorization_code` or `none`; required with jwt
- `SAP_SNC_PARTNERNAME`, `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` - SNC (RFC only; no user, no password)
- `SAP_SYSTEM_TYPE` - System type: `cloud` (default), `onprem`, or `legacy`. Controls tool availability (e.g. Programs require `onprem`)
- `SAP_USERNAME` - SAP username (for basic auth)
- `SAP_PASSWORD` - SAP password (for basic auth)
- `SAP_LANGUAGE` - SAP language (optional, e.g., EN, DE)
- `SAP_JWT_TOKEN` - JWT token (with `SAP_GRANT_TYPE=none`)
- `SAP_REFRESH_TOKEN` - Refresh token for token renewal
- `SAP_UAA_URL` - UAA URL for OAuth2
- `SAP_UAA_CLIENT_ID` - UAA Client ID
- `SAP_UAA_CLIENT_SECRET` - UAA Client Secret

For complete list see [CLI Options](../user-guide/CLI_OPTIONS.md#environment-variables)

**Examples with Options:**

```bash
# Show help
mcp-abap-adt --help

# Use custom .env from different location
mcp-abap-adt --env=~/configs/sap-production.env

# Start HTTP server
mcp-abap-adt --transport=http --port=8080

# Start SSE server
mcp-abap-adt --transport=sse --port=3001
```

**Example 6: Use stdio transport (for MCP clients)**
```bash
mcp-abap-adt
```

#### Updating the Package

To update to a newer version:

```bash
# Uninstall old version
npm uninstall -g @mcp-abap-adt/core

# Install new version
npm install -g @mcp-abap-adt/core   # with SAPNWRFC_HOME set again, for RFC
```

#### Troubleshooting Package Installation

**Issue: Command not found after global installation**

Solution:
```bash
# Check npm global bin directory
npm config get prefix

# Add to PATH if needed (Linux/macOS)
export PATH="$(npm config get prefix)/bin:$PATH"

# Or on Windows (PowerShell)
$env:PATH += ";$(npm config get prefix)"
```

**Issue: Permission denied (Linux/macOS)**

Solution:
```bash
# Use sudo for global installation
sudo npm install -g @mcp-abap-adt/core

# Or configure npm to use a different directory (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Then install without sudo
npm install -g @mcp-abap-adt/core
```

---

## 📖 Detailed Guides

For detailed platform-specific instructions, see:
- [Windows Installation Guide](./platforms/INSTALL_WINDOWS.md)
- [macOS Installation Guide](./platforms/INSTALL_MACOS.md)
- [Linux Installation Guide](./platforms/INSTALL_LINUX.md)

## 🔗 Next Steps

After installation:
1. [Configure SAP Connection](../user-guide/CLIENT_CONFIGURATION.md)
2. [Review CLI Options](../user-guide/CLI_OPTIONS.md)
3. [Explore Available Tools](../user-guide/AVAILABLE_TOOLS.md)

## 💡 Need Help?

- [Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md)
- [User Guide Overview](../user-guide/README.md)
- [GitHub Issues](https://github.com/fr0ster/mcp-abap-adt/issues)
