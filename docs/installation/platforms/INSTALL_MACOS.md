# macOS Installation Guide

Complete guide for installing MCP ABAP ADT Server on macOS using Homebrew.

## 📋 Prerequisites

- macOS 10.15 (Catalina) or later
- Node.js 22 or 24
- Terminal access
- Administrator privileges

## 🍺 Step 1: Install Homebrew

If you don't have Homebrew installed:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Verify installation:

```bash
brew --version
```

## 🔧 Step 2: Install Node.js

### Option 1: Using nvm (Recommended)

nvm (Node Version Manager) allows you to install and switch between multiple Node.js versions.

1. **Install nvm:**

```bash
# Install nvm via Homebrew
brew install nvm

# Create nvm directory
mkdir ~/.nvm

# Add to your shell profile (~/.zshrc or ~/.bash_profile)
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"' >> ~/.zshrc

# Reload shell
source ~/.zshrc
```

2. **Install Node.js 24 (or 22):**

```bash
nvm install 24

# Use the installed version
nvm use 24

# Set as default
nvm alias default 24

# Verify installation
node -v
npm -v
```

### Option 2: Using Homebrew (Direct)

```bash
# Install Node.js 24 (plain `node` may be a newer release than 22/24)
brew install node@24
# node@24 is keg-only: follow the PATH line `brew info node@24` prints

# Verify installation
node -v
npm -v
```

## 📦 Step 3: Install Git (only to build from source)

```bash
# Install Git (if not already installed)
brew install git

# Verify
git --version
```

## 🚀 Step 4: Install MCP ABAP ADT Server

### Option A: Install from npm (Recommended)

```bash
npm install -g @mcp-abap-adt/core

# Verify installation
mcp-abap-adt --help
```

`@mcp-abap-adt/compact` (command `mcp-abap-adt-compact`) is the alternative compact server; it takes
the same configuration. See [Installation variants](../INSTALLATION.md#installation-variants).

**Available commands after installation:**
- `mcp-abap-adt` - stdio transport (default)
- `mcp-abap-adt --transport=stdio` - stdio transport (for MCP clients)
- `mcp-abap-adt --transport=http` - HTTP server transport
- `mcp-abap-adt --transport=sse` - SSE server transport

**Usage examples:**
```bash
# HTTP server on default port (3000)
mcp-abap-adt --transport=http

# HTTP server on custom port
mcp-abap-adt --transport=http --port=8080

# SSE server accessible from network
mcp-abap-adt --transport=sse --host=0.0.0.0 --port=3000

# Use a custom .env file
mcp-abap-adt --transport=http --env-path=/path/to/custom/.env --port=8080
```

**Troubleshooting:**

If command not found after global installation:
```bash
# Check npm global bin directory
npm config get prefix

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
export PATH="$(npm config get prefix)/bin:$PATH"
source ~/.zshrc  # or source ~/.bash_profile
```

### Option B: Build from Source (For Development)

```bash
git clone https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
```

The checkout is not runnable as a server by itself; to run what you built, see
[From source (development)](../INSTALLATION.md#from-source-development).

### RFC and SNC

RFC and SNC need, **before** `npm install -g`: the SAP NW RFC SDK, a C++ toolchain, and
`SAPNWRFC_HOME` set in the shell that runs the install.

- **Toolchain:** `xcode-select --install`.
- **SDK:** the macOS ARM package on Apple Silicon (x64 on Intel).
- **SNC:** the library is found at `/Applications/Secure Login Client.app/Contents/MacOS/lib/libsapcrypto.dylib`.

```bash
export SAPNWRFC_HOME=~/nwrfcsdk
npm install -g @mcp-abap-adt/core
npm ls -g @mcp-abap-adt/sap-rfc-lite
```

`(empty)` from `npm ls` means npm silently dropped the RFC module. Details and the SNC `.env`:
[RFC Setup](../RFC_SETUP.md).

## ⚙️ Step 5: Configure SAP Connection

Create a `.env` file anywhere (the server reads nothing from the working directory) and start the
server with `--env-path=<file>`:

```env
SAP_URL=https://your-sap-system.example:8000
SAP_CLIENT=100
SAP_LANGUAGE=en
SAP_AUTH_TYPE=basic
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
```

```bash
mcp-abap-adt --env-path=/path/to/your/your-system.env
```

> **No `SAP_TIMEOUT_DEFAULT` here on purpose.** The sample used to set it to
> `45000`, and copying that arms a 45-second deadline on every ADT request the
> server is still working on. `@mcp-abap-adt/adt-clients` removed that default
> for a measured reason: an aborted `POST /deletion/delete` was retried into a
> *new* session, while the ABAP session underneath kept the enqueue locks — the
> lock handle dead, the lock alive and unreachable, the object left locked and
> inactive. Leave the variable unset and requests run without a client-side
> deadline; set it only when you have a specific reason to cut one short, and
> expect that cost.

## 🔌 Step 6: Connect to AI Tools

### Server Modes

MCP ABAP ADT Server supports two transport protocols:

1. **stdio** (default) - Standard input/output, used by Cline/Cursor (requires .env file)
2. **http** - HTTP StreamableHTTP transport (requires `--transport=http`), works without .env file
2. **SSE/HTTP** - Server-Sent Events over HTTP, for web interfaces

### Cline (VS Code Extension)

Uses **stdio** mode (must be explicitly specified).

**⚠️ IMPORTANT:** After global installation (`npm install -g @mcp-abap-adt/core`), use the `mcp-abap-adt` command with `--transport=stdio` and `--env` arguments.

1. Install Cline extension in VS Code
2. Open Cline settings (JSON): `Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"
3. Add MCP server configuration:

**For globally installed package (recommended):**

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": [
        "--transport=stdio",
        "--env=/path/to/your/your-system.env"
      ]
    }
  }
}
```

**Important notes:**
- `--transport=stdio` is the default; HTTP/SSE require `--transport=http`/`--transport=sse`
- Name the env file with `--env` (or `--env-path`, or use `--mcp=<name>`): nothing is looked up in the
  working directory, so a `.env` there is read only when named (`--env-path=./.env`)

**Alternative: Using node with full path (if global command not in PATH):**

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": [
        "/usr/local/lib/node_modules/@mcp-abap-adt/core/bin/mcp-abap-adt.js",
        "--transport=stdio",
        "--env=/path/to/your/your-system.env"
      ]
    }
  }
}
```

### Cursor

Uses **stdio** mode (must be explicitly specified).

**⚠️ IMPORTANT:** After global installation, use the `mcp-abap-adt` command with `--transport=stdio` and `--env` arguments.

Add to Cursor settings (`~/.cursor/config.json`):

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": [
        "--transport=stdio",
        "--env=/path/to/your/your-system.env"
      ]
    }
  }
}
```

**Note:** The `--env` argument is required: the server reads no `.env` it was not given.

### HTTP Mode (Streamable HTTP)

**⚠️ IMPORTANT:** HTTP mode requires `--transport=http` (the default transport is stdio). No `.env` file is required for HTTP mode (connection can be configured via HTTP headers).

**Starting HTTP Server:**

```bash
# Start server in HTTP mode (requires --transport=http)
mcp-abap-adt --transport=http

# Or explicitly specify HTTP mode
mcp-abap-adt --transport=streamable-http

# Or with custom port
mcp-abap-adt --transport=streamable-http --port=8080
```

**HTTP Server Options:**
- `--transport=streamable-http` or `--transport=http` - Use HTTP transport (stdio is the default)
- `--host=<host>` - Server host (default: 127.0.0.1; use 0.0.0.0 for all interfaces)
- `--port=<port>` - Server port (default: 3000 for http)
- `--path=<path>` (alias `--http-path=<path>`) - HTTP endpoint path (default: /mcp/stream/http)
- `--http-allowed-hosts=<list>` - Comma-separated exact Host header values for DNS-rebinding protection (includes port, e.g. `localhost:3000`)
- `--http-allowed-origins=<list>` - Comma-separated exact Origin header values for DNS-rebinding protection (includes scheme, e.g. `https://app.example.com`)
- `--http-enable-dns-protection` - Enable Host/Origin allowlist validation (NOT browser CORS — no Access-Control-Allow-Origin headers are emitted); non-allowlisted Host/Origin → HTTP 403

**Example with custom port:**
```bash
mcp-abap-adt --transport=streamable-http --port=8080
```

Server will be available at: `http://localhost:8080/mcp/stream/http`

**Configuration for HTTP clients:**

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-sap-system.example:8000",
      "x-sap-login": "your_username",
      "x-sap-password": "your_password",
      "x-sap-client": "100"
    }
  }
}
```

**⚠️ NOTE:** For HTTP mode, you can configure SAP connection via HTTP headers (as shown above) OR use `.env` file:

```bash
# Using .env file with HTTP mode
mcp-abap-adt --transport=streamable-http --env=/path/to/your/your-system.env
```

### SSE Mode (Server-Sent Events)

**⚠️ IMPORTANT:** SSE mode requires `.env` file or HTTP headers for SAP connection configuration.

**Starting SSE Server:**

```bash
# Start server in SSE mode (requires .env file)
mcp-abap-adt --transport=sse --env=/path/to/your/your-system.env

# Or with custom port
mcp-abap-adt --transport=sse --port=3001 --env=/path/to/your/your-system.env
```

**SSE Server Options:**
- `--transport=sse` - Use SSE transport
- `--host=<host>` - Server host (default: 127.0.0.1; use 0.0.0.0 for all interfaces)
- `--port=<port>` - Server port (default: 3001 for sse)
- `--sse-path=<path>` - SSE connection path (default: /sse)
- `--post-path=<path>` - SSE message post path (default: /messages)
- `--env=PATH` - Path to `.env` file (required for SSE mode)
- `--sse-allowed-hosts=<list>` - Comma-separated exact Host header values for DNS-rebinding protection (includes port, e.g. `localhost:3001`)
- `--sse-allowed-origins=<list>` - Comma-separated exact Origin header values for DNS-rebinding protection (includes scheme, e.g. `https://app.example.com`)
- `--sse-enable-dns-protection` - Enable Host/Origin allowlist validation (NOT browser CORS — no Access-Control-Allow-Origin headers are emitted); non-allowlisted Host/Origin → HTTP 403

**Example with custom port and host:**
```bash
mcp-abap-adt --transport=sse --port=4100 --host=127.0.0.1 --env=/path/to/your/your-system.env
```

Server will be available at: `http://127.0.0.1:4100/sse`

**Configuration for SSE clients:**

```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/sse"
  }
}
```

**⚠️ NOTE:** SSE mode requires `.env` file to be specified. The server will not start without it.

## ✅ Step 7: Test Installation

```bash
mcp-abap-adt --help

# In a source checkout: run the unit tests
npm test
```

## 🐛 Troubleshooting

### Homebrew installation fails

If you get permission errors:

```bash
sudo chown -R $(whoami) /usr/local/Cellar /usr/local/Homebrew
```

### Node.js version issues

Check and switch Node.js versions:

```bash
# Install nvm (Node Version Manager)
brew install nvm

# Install specific Node.js version
nvm install 24
nvm use 24
```

### SSL/TLS certificate errors

From 17.0.0 the server verifies the HTTPS certificate of the SAP system. For a self-signed or
company-CA certificate, trust the CA in the environment of the server process (the MCP client's
`env` block, or the shell that starts the server):

```bash
export NODE_EXTRA_CA_CERTS=/path/to/ca.pem
```

Opting out is `TLS_REJECT_UNAUTHORIZED=0` in that same process environment — only on a trusted
network. A destination's `.env` is not read for either. See [Migrating to 17.0.0](../../MIGRATION-17.0.md).

### Permission denied errors

Fix npm permissions:

```bash
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

### Command not found after installation

Add to PATH in `~/.zshrc` or `~/.bash_profile`:

```bash
export PATH="/usr/local/bin:$PATH"
export PATH="$HOME/.npm-global/bin:$PATH"
```

Then reload:

```bash
source ~/.zshrc  # for zsh
# or
source ~/.bash_profile  # for bash
```

## 📚 Next Steps

- [Configure SAP Connection](../../user-guide/CLIENT_CONFIGURATION.md)
- [Review CLI Options](../../user-guide/CLI_OPTIONS.md)

## 💡 Tips for macOS

### Use iTerm2

Better terminal experience:

```bash
brew install --cask iterm2
```

### Use Oh My Zsh

Enhanced shell:

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

### Install VS Code via Homebrew

```bash
brew install --cask visual-studio-code
```

### Use Rosetta 2 (Apple Silicon)

If you have M1/M2/M3 Mac and encounter compatibility issues:

```bash
softwareupdate --install-rosetta
```

### Check Architecture

```bash
uname -m
# arm64 = Apple Silicon
# x86_64 = Intel
```
- [Available Tools](../../user-guide/AVAILABLE_TOOLS.md)
