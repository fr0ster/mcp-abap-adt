# MCP ABAP ADT Server - Installation Guide

How to install the server, which variant to install, and what each variant needs on the machine.
Platform walk-throughs: [Windows](./platforms/INSTALL_WINDOWS.md), [macOS](./platforms/INSTALL_MACOS.md),
[Linux](./platforms/INSTALL_LINUX.md). RFC and SNC in detail: [RFC Setup](RFC_SETUP.md).

## Installation variants

Two choices make a variant: **which server** and **how it connects to the ABAP system**. They are
independent — every server connects every way. **The server fixes its tool set** (19.0.0): there
is no `--exposition`, so choosing the server is choosing the tools. Each server below is stdio; its
Streamable HTTP and SSE siblings are packages of their own (`@mcp-abap-adt/http`, `sse`, `http-ro`,
`sse-ro`, `compact-http`, `compact-sse`, `compact-http-ro`, `compact-sse-ro`).

### Which server

| Package | What it is | Command |
|---|---|---|
| [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core) | **The full server**: one tool per object type and operation (`CreateClass`, `GetTable`, …): the `readonly`, `high` and `debug` sets, the leftover sessions (stdio only) and background runs. The low set left it in 19.0.0: its single-step operations are the compact server's. | `mcp-abap-adt` |
| [`@mcp-abap-adt/core-ro`](https://www.npmjs.com/package/@mcp-abap-adt/core-ro) | **The read-only full server**: the `readonly` tools (with system and search), the leftover-session list and logoff — no high, debugger, background-run or resume tool. Configuration is the full server's. | `mcp-abap-adt-ro` |
| [`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact) | **The compact server**: one tool per operation, the object type in the arguments (`HandlerCreate` with `object_type`) — a short tool list for a host that cannot select tools per request — with the four debugger tools. Configuration is the full server's. | `mcp-abap-adt-compact` |
| [`@mcp-abap-adt/compact-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-ro) | **The read-only compact server**: the 17 compact tools that change nothing, the leftover-session list and logoff. | `mcp-abap-adt-compact-ro` |
| [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib), [`compact-readonly-entries`](https://www.npmjs.com/package/@mcp-abap-adt/compact-readonly-entries), [`compact-modify`](https://www.npmjs.com/package/@mcp-abap-adt/compact-modify), [`background-runs-memory`](https://www.npmjs.com/package/@mcp-abap-adt/background-runs-memory), [`responsible-rules`](https://www.npmjs.com/package/@mcp-abap-adt/responsible-rules) | Libraries, not servers: the tool handlers, an embeddable server for your own application, the in-memory store of background runs, and the rules that name a call's responsible, user and system. | — |

### How it connects

| Connection | Authentication (`SAP_AUTH_TYPE`) | What the machine needs besides Node.js |
|---|---|---|
| **HTTP** (default) | `basic`, or `jwt` (browser login with a service key; a token you hold goes in the `x-sap-jwt-token` header of the HTTP and SSE binaries, not over stdio) | Nothing. |
| **RFC** (`SAP_CONNECTION_TYPE=rfc`) | `basic` | The SAP NW RFC library **at run time**: SAP GUI's 64-bit `sapnwrfc.dll` in `System32` on Windows, else the SAP NW RFC SDK. The RFC module comes prebuilt for Linux x64 (glibc), Windows x64 and macOS ARM64; nothing is compiled by `npm install`. |
| **SNC** (RFC, passwordless) | `snc` | Everything RFC needs, plus an SNC product logged on — typically SAP Secure Login Client. No user, no password in the `.env`. |

The authentications in full: [Authentication & Destinations](../user-guide/AUTHENTICATION.md).

### What to run

**HTTP** — full or compact:

```bash
npm install -g @mcp-abap-adt/core        # mcp-abap-adt
npm install -g @mcp-abap-adt/core-ro     # mcp-abap-adt-ro: the readonly tools alone
npm install -g @mcp-abap-adt/compact     # mcp-abap-adt-compact
npm install -g @mcp-abap-adt/compact-ro  # mcp-abap-adt-compact-ro: the compact tools that change nothing
```

**RFC and SNC** — the same command. The install compiles nothing, so it needs neither the SDK nor
`SAPNWRFC_HOME`; the RFC library must be loadable **when the server runs**:

```bash
# Linux: the SDK's lib directory on the library search path
export LD_LIBRARY_PATH="/path/to/nwrfcsdk/lib:$LD_LIBRARY_PATH"
# macOS
export DYLD_LIBRARY_PATH="/path/to/nwrfcsdk/lib"
npm install -g @mcp-abap-adt/core        # or @mcp-abap-adt/compact
```

```powershell
# Windows (PowerShell): nothing, where SAP GUI installed its 64-bit sapnwrfc.dll in System32
# (where.exe sapnwrfc.dll); else the SDK's lib directory on PATH
$env:SAPNWRFC_HOME = "C:\nwrfcsdk\nwrfcsdk"
$env:PATH = "$env:SAPNWRFC_HOME\lib;$env:PATH"
npm install -g @mcp-abap-adt/core        # or @mcp-abap-adt/compact
```

Then check that the RFC module is there:

```bash
npm ls -g @mcp-abap-adt/sap-rfc-lite
```

**`(empty)` means the server was installed without RFC** (`--no-optional` / `--omit=optional`): run
the install again without that option. On a platform with no prebuilt binding (another platform or
architecture, Linux with musl), the module is installed but has no binding until you build one, and the
server refuses the first RFC call with `@mcp-abap-adt/sap-rfc-lite is not available`. The runtime
settings per platform, building a binding and the SNC prerequisites: [RFC Setup](RFC_SETUP.md).

### Portable build (personal)

One executable per server and platform, with Node.js and your own SAP NW RFC SDK inside: unpack and run,
no Node.js, npm or SDK installation on the machine — HTTP, RFC and, on Windows and macOS, SNC. You build it
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

After `npm install -g @mcp-abap-adt/core` you have the `mcp-abap-adt` command: stdio, one destination
through the auth broker. A binary is its transport: `npm install -g @mcp-abap-adt/http` gives
`mcp-abap-adt-http` (Streamable HTTP), `npm install -g @mcp-abap-adt/sse` gives `mcp-abap-adt-sse`
(HTTP+SSE); both take credentials only from each request's `x-sap-*` headers. There is no
`--transport` option. `@mcp-abap-adt/compact` gives `mcp-abap-adt-compact`, which takes
`mcp-abap-adt`'s options; each `-ro` package (`core-ro`, `http-ro`, `sse-ro`, `compact-ro`,
`compact-http-ro`, `compact-sse-ro`) gives the read-only binary of the same transport, with its
write counterpart's options. There is no `--exposition` option: the binary fixes its tool set.
Each binary reads only its own options (`<binary> --help`); another
binary's, on the command line or in the config file, stops the start, naming the binary that serves
it. Another binary's environment variables are not read, so one shell can serve several binaries.

**To write a `.env` for JWT authentication**, install the CLI separately (`mcp-auth` ships in `@mcp-abap-adt/auth-broker-cli`, not in `@mcp-abap-adt/auth-broker`):
```bash
npm install -g @mcp-abap-adt/auth-broker-cli
mcp-auth --service-key ./service-key.json --output ./mcp.env --type abap   # --type xsuaa for an XSUAA key; `mcp-auth --help` lists the rest
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
# System type, required (no default): cloud, onprem, or legacy
# Controls tool availability (e.g. Programs require onprem)
SAP_SYSTEM_TYPE=onprem
EOF
```

For JWT authentication (SAP BTP) with browser login, put the service key in `~/.config/mcp-abap-adt/service-keys/<destination>.json` and start with `--mcp=<destination>` (see below), or write a `.env`:
```bash
# One-time setup: the CLI that writes destination files
npm install -g @mcp-abap-adt/auth-broker-cli

# Log in and write a .env that states its authentication and grant (--type xsuaa for an XSUAA key)
mcp-auth --service-key ./service-key.json --output ./mcp.env --type abap   # `mcp-auth --help` lists the rest
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
Through a message server and a logon group instead, add `SAP_MSHOST` with `SAP_MSSERV` or `SAP_SYSID` (one is required), and optionally `SAP_GROUP` (default `PUBLIC`, connection's) and `SAP_SAPROUTER`; then no host and no system number come from `SAP_URL` and `SAP_SYSNR` is not read. See [RFC Setup](RFC_SETUP.md#through-a-message-server-and-a-logon-group).

**Run the server:**
```bash
# stdio (for MCP clients): name the destination with --mcp, --env or --env-path
mcp-abap-adt --mcp=TRIAL --system-type=cloud

# Or specify env destination from sessions store
mcp-abap-adt --env=trial --system-type=cloud

# Or explicit .env location
mcp-abap-adt --env-path=/path/to/my.env --system-type=<onprem|cloud>
mcp-abap-adt --env-path ~/configs/sap-dev.env --system-type=<onprem|cloud>

# Streamable HTTP server on a custom port (credentials from each request's x-sap-* headers)
mcp-abap-adt-http --port=8080 --system-type=<onprem|cloud>
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
npm ci --ignore-scripts
npm run prepare      # the git hooks (husky), if you will commit
npm run build
npm test             # unit tests; integration tests need a system, see docs/development/tests
```

The repository's `.npmrc` lets no dependency run an install script that `package.json`
`allowScripts` does not allow (it denies every one: none is needed to build or test), and resolves
no new version younger than 7 days. npm reads both settings in full from 11.19.0; npm 10 (bundled
with Node.js 22) reads neither, so install with `--ignore-scripts` on any npm. That also skips the
repository's own `prepare` (husky), hence the second line.

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
npx mcp-abap-adt --mcp=TRIAL --system-type=cloud
```

#### Configuration

`mcp-abap-adt` (stdio) supports **three authentications** — basic (HTTP or RFC), SNC (RFC, passwordless) and JWT with browser login; a JWT you hold goes in the `x-sap-jwt-token` header of `mcp-abap-adt-http` / `mcp-abap-adt-sse` — see [Authentication & Destinations](../user-guide/AUTHENTICATION.md). A destination lives in one of two places:

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

# Run the server with the destination; the browser login opens at the start
# (callback port 61001 unless --browser-auth-port says otherwise)
mcp-abap-adt --mcp=TRIAL --system-type=cloud
```

An XSUAA service key carries the UAA, not the system: state the system's URL as `XSUAA_MCP_URL` in `~/.config/mcp-abap-adt/sessions/TRIAL.env`.

Destinations are served only by `mcp-abap-adt` (stdio). `mcp-abap-adt-http` and `mcp-abap-adt-sse`
take no destination: a request carrying `x-mcp-destination` is answered `400` ("destinations are served
only by mcp-abap-adt (stdio); send x-sap-* headers"). See
[Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md) for details.

##### Option 2: .env File

For single-configuration scenarios, you can use a `.env` file:

After installation, create a `.env` file with your SAP connection details:

```bash
# Create .env file (basic; a token you hold goes in the x-sap-jwt-token header
# of mcp-abap-adt-http / mcp-abap-adt-sse, never in a stdio .env)
cat > .env << 'EOF'
SAP_URL=https://your-sap-system.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=<your ABAP user>
SAP_PASSWORD=<your password>
# System type, required (no default): cloud, onprem, or legacy
SAP_SYSTEM_TYPE=cloud
EOF
```

A `.env` is read once per process: a change to it takes effect on restart.

Or use a custom environment file:

```bash
mcp-abap-adt --env-path /path/to/custom/.env --system-type=<onprem|cloud>
```

#### Usage Examples

**Example 1: stdio with a named destination**
```bash
mcp-abap-adt --mcp=TRIAL --system-type=cloud
```

**Example 2: Streamable HTTP server on a custom port** (`@mcp-abap-adt/http`)
```bash
mcp-abap-adt-http --port=8080 --system-type=<onprem|cloud>
```

**Example 3: Streamable HTTP server accessible from network**
```bash
mcp-abap-adt-http --host=0.0.0.0 --port=3000 --system-type=<onprem|cloud>
```

**Example 4: SSE server** (`@mcp-abap-adt/sse`)
```bash
mcp-abap-adt-sse --sse-port=3001 --system-type=<onprem|cloud>
```

#### Command Line Options

Each binary takes only its own options; an option of another binary, or `--transport`, stops the
start naming the binary that serves it. Every binary takes `--help`, `--version`, `--conf`,
`--system-type` and `--state-idle-minutes`; `--exposition` is gone (19.0.0) and stops the start,
naming the binary that serves the tools it asked for.

**`mcp-abap-adt` (stdio):**
- `--help` - Show complete help message with all available options
- `--mcp=<destination>` - Named destination (`service-keys/<destination>.json` + `sessions/<destination>.env`)
- `--auth-broker-path=<path>` - Base directory of the `service-keys` and `sessions` subdirectories
  - Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
- `--env=<destination>` - Destination env file from sessions store (`<destination>.env`)
- `--env-path=<path|file>` - Explicit path to a `.env` file
- `--unsafe` - Write named destinations' sessions to disk (default: in memory)
- `--browser=<name>`, `--browser-auth-port=<port>` - Browser and callback port (default `61001`) of a login; `--browser-program=<program>` in place of `--browser`
- `--renewal=refresh-then-login|refresh-only` - How an expired session is renewed (`refresh-only`: never a login)
- `--connection-type=http|rfc` - SAP connection type (default `http`)
- `--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter` - RFC through a message server and a logon group (`SAP_MSHOST`, … in the `.env`); see [RFC Setup](RFC_SETUP.md#through-a-message-server-and-a-logon-group)

**Note:** When no `--mcp`, `--env` or `--env-path` is given, there is no default destination: nothing is looked up in the working directory (`--env-path=./.env` names a `.env` there). An invalid port, enum or flag value is refused at startup.

**`mcp-abap-adt-http` (Streamable HTTP):**
- `--host=<host>` / `--http-host` - Server host (default: 127.0.0.1; use 0.0.0.0 for all interfaces)
- `--port=<port>` / `--http-port` - Server port (default: 3000)
- `--path=<path>` / `--http-path=<path>` (alias) - HTTP endpoint path (default: /mcp/stream/http)
- `--http-json-response` - Enable JSON response format
- `--http-allowed-hosts=<list>` - Comma-separated exact Host header values for DNS-rebinding protection (includes port, e.g. `localhost:3000`)
- `--http-allowed-origins=<list>` - Comma-separated exact Origin header values for DNS-rebinding protection (includes scheme, e.g. `https://app.example.com`)
- `--http-enable-dns-protection` - Enable Host/Origin allowlist validation (NOT browser CORS — no Access-Control-Allow-Origin headers are emitted); needs at least one list set; non-allowlisted Host/Origin → HTTP 403

- `--tls-cert=<path>`, `--tls-key=<path>`, `--tls-ca=<path>` - HTTPS (cert and key together)

**`mcp-abap-adt-sse` (HTTP+SSE):**
- `--sse-host=<host>` - Server host (default: 127.0.0.1; use 0.0.0.0 for all interfaces)
- `--sse-port=<port>` - Server port (default: 3001)
- `--sse-path=<path>` - SSE connection path (default: /sse)
- `--post-path=<path>` - SSE message post path (default: /messages)
- `--sse-allowed-hosts=<list>` - Comma-separated exact Host header values for DNS-rebinding protection (includes port, e.g. `localhost:3001`)
- `--sse-allowed-origins=<list>` - Comma-separated exact Origin header values for DNS-rebinding protection (includes scheme, e.g. `https://app.example.com`)
- `--sse-enable-dns-protection` - Enable Host/Origin allowlist validation (NOT browser CORS — no Access-Control-Allow-Origin headers are emitted); needs at least one list set; non-allowlisted Host/Origin → HTTP 403
- `--tls-cert=<path>`, `--tls-key=<path>`, `--tls-ca=<path>` - HTTPS (cert and key together)

**Environment Variables:**

You can also configure the server using environment variables.

*MCP Server Configuration:*
- `MCP_ENV_PATH` - Explicit path to `.env` file (same as `--env-path`; `mcp-abap-adt`)
- `MCP_HTTP_PORT` - Default HTTP port (`mcp-abap-adt-http`; so are the other `MCP_HTTP_*`)
- `MCP_HTTP_HOST` - Default HTTP host (default: 127.0.0.1)
- `MCP_HTTP_ALLOWED_HOSTS` - Comma-separated exact Host header values (DNS-rebinding protection; includes port, e.g. `localhost:3000`)
- `MCP_HTTP_ALLOWED_ORIGINS` - Comma-separated exact Origin header values (DNS-rebinding protection; includes scheme)
- `MCP_HTTP_ENABLE_DNS_PROTECTION` - Enable HTTP Host/Origin allowlist validation (true|false; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted)
- `MCP_SSE_PORT` - Default SSE port (`mcp-abap-adt-sse`; so are the other `MCP_SSE_*`)
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
- `SAP_GRANT_TYPE` - `authorization_code`; required with jwt
- `SAP_SNC_PARTNERNAME`, `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` - SNC (RFC only; no user, no password)
- `SAP_SYSTEM_TYPE` - System type, required (or `--system-type`; no default): `cloud`, `onprem`, or `legacy`. Controls tool availability (e.g. Programs require `onprem`), the connector, and how the system's answers are read
- `SAP_USERNAME` - SAP username (for basic auth)
- `SAP_PASSWORD` - SAP password (for basic auth)
- `SAP_LANGUAGE` - SAP language (optional, e.g., EN, DE)
- `SAP_JWT_TOKEN` - The session's token, written by `mcp-auth` or the server (a token you hold goes in the `x-sap-jwt-token` header of `mcp-abap-adt-http` / `mcp-abap-adt-sse`)
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
mcp-abap-adt --env-path=~/configs/sap-production.env --system-type=<onprem|cloud>

# Start a Streamable HTTP server
mcp-abap-adt-http --port=8080 --system-type=<onprem|cloud>

# Start an SSE server
mcp-abap-adt-sse --sse-port=3001 --system-type=<onprem|cloud>
```

**Example 6: Use stdio transport (for MCP clients)**
```bash
mcp-abap-adt --system-type=<onprem|cloud>
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
