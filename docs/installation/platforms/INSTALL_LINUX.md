# Linux Installation Guide

Complete guide for installing MCP ABAP ADT Server on Linux distributions.

## 📋 Prerequisites

- Linux distribution (Ubuntu, Debian, Fedora, Arch, etc.)
- Node.js 22 or 24
- Terminal access
- sudo privileges

## 🔧 Step 1: Install Node.js

### Option 1: Using nvm (Recommended)

nvm (Node Version Manager) allows you to install and switch between multiple Node.js versions.

> **Note**: nvm is not available in apt/dnf/pacman repositories. It must be installed via the official install script.

1. **Install nvm:**

```bash
# Download and install nvm (choose one method)

# Method 1: Using curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash

# Method 2: Using wget
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
```

2. **Reload shell configuration:**

```bash
# For bash users
source ~/.bashrc

# For zsh users
source ~/.zshrc

# Verify nvm installation
nvm --version
```

3. **Install Node.js 24 (or 22):**

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

**Why nvm?**
- ✅ No sudo needed for global packages
- ✅ Easy version switching
- ✅ Per-project Node.js versions
- ✅ Industry standard for Node.js development

### Option 2: Using Package Managers

#### Ubuntu/Debian

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node -v
npm -v
```

#### Fedora/RHEL/CentOS

```bash
# Using NodeSource repository
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs

# Verify
node -v
npm -v
```

#### Arch Linux

```bash
# Using pacman
sudo pacman -S nodejs npm

# Verify
node -v
npm -v
```

`node -v` must report 22 or 24; if the distribution's package is another version, use nvm.

## 📦 Step 2: Install Git (only to build from source)

### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install -y git
```

### Fedora/RHEL/CentOS

```bash
sudo dnf install -y git
```

### Arch Linux

```bash
sudo pacman -S git
```

Verify:

```bash
git --version
```

## 🚀 Step 3: Install MCP ABAP ADT Server

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

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH="$(npm config get prefix)/bin:$PATH"
```

If permission denied during global installation:
```bash
# Configure npm to use home directory (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Then install without sudo
npm install -g @mcp-abap-adt/core
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

- **Toolchain:** `sudo apt-get install -y build-essential python3` (or the distribution's equivalent).
- **Node.js:** one built for the system — distribution package, NodeSource or nvm. A Linuxbrew
  Node.js was measured unable to load the SDK's system dependency `libuuid`.

```bash
export SAPNWRFC_HOME=~/nwrfcsdk
npm install -g @mcp-abap-adt/core
npm ls -g @mcp-abap-adt/sap-rfc-lite
```

`(empty)` from `npm ls` means npm silently dropped the RFC module. Details and the SNC `.env`:
[RFC Setup](../RFC_SETUP.md).

## ⚙️ Step 4: Configure SAP Connection

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

## 🔌 Step 5: Connect to AI Tools

### Server Modes

MCP ABAP ADT Server supports two transport protocols:

1. **stdio** (default) - Standard input/output, used by Cline/Cursor (requires .env file)
2. **http** - HTTP StreamableHTTP transport (requires `--transport=http`), works without .env file
2. **SSE/HTTP** - Server-Sent Events over HTTP, for web interfaces

### Cline (VS Code Extension)

Uses **stdio** mode (must be explicitly specified).

**⚠️ IMPORTANT:** After global installation (`npm install -g @mcp-abap-adt/core`), use the `mcp-abap-adt` command with `--transport=stdio` and `--env` arguments.

1. Install Cline extension in VS Code
2. Open Cline settings (JSON): `Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)"
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
        "/home/your-username/.npm-global/lib/node_modules/@mcp-abap-adt/core/bin/mcp-abap-adt.js",
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

## ✅ Step 6: Test Installation

```bash
mcp-abap-adt --help

# In a source checkout: run the unit tests
npm test
```

## 🐛 Troubleshooting

### Permission errors during npm install

Fix npm permissions:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Node.js not found after installation

Add to PATH in `~/.bashrc` or `~/.zshrc`:

```bash
export PATH="/usr/local/bin:$PATH"
export PATH="$HOME/.npm-global/bin:$PATH"
```

Reload:

```bash
source ~/.bashrc  # or ~/.zshrc
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

### Build errors with native modules

Install build tools:

```bash
# Ubuntu/Debian
sudo apt-get install -y build-essential

# Fedora/RHEL
sudo dnf groupinstall "Development Tools"

# Arch
sudo pacman -S base-devel
```

### EACCES errors

Don't use sudo with npm. Fix permissions instead:

```bash
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

## 📚 Next Steps

- [Configure SAP Connection](../../user-guide/CLIENT_CONFIGURATION.md)
- [Review CLI Options](../../user-guide/CLI_OPTIONS.md)

## 💡 Tips for Linux

### Use Fish Shell

Modern shell with better autocomplete:

```bash
# Ubuntu/Debian
sudo apt-get install fish

# Fedora
sudo dnf install fish

# Arch
sudo pacman -S fish

# Set as default
chsh -s $(which fish)
```

### Install VS Code

```bash
# Ubuntu/Debian
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
sudo install -o root -g root -m 644 packages.microsoft.gpg /etc/apt/trusted.gpg.d/
sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
sudo apt-get update
sudo apt-get install code

# Fedora
sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
sudo sh -c 'echo -e "[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" > /etc/yum.repos.d/vscode.repo'
sudo dnf check-update
sudo dnf install code

# Arch
yay -S visual-studio-code-bin
```

### Use tmux for session management

```bash
# Install
sudo apt-get install tmux  # Ubuntu/Debian
sudo dnf install tmux      # Fedora
sudo pacman -S tmux        # Arch

# Basic usage
tmux new -s mcp
# Detach: Ctrl+b, then d
# Reattach: tmux attach -t mcp
```

### Set up systemd service (optional)

Create `/etc/systemd/system/mcp-abap-adt.service`:

```ini
[Unit]
Description=MCP ABAP ADT Server
After=network.target

[Service]
Type=simple
User=your-username
# The path `command -v mcp-abap-adt` prints for that user
ExecStart=/usr/local/bin/mcp-abap-adt --transport=http --env-path=/home/your-username/your-system.env
Restart=on-failure
# A company CA, if the SAP system needs one:
# Environment="NODE_EXTRA_CA_CERTS=/path/to/ca.pem"

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-abap-adt
sudo systemctl start mcp-abap-adt
sudo systemctl status mcp-abap-adt
```
- [Available Tools](../../user-guide/AVAILABLE_TOOLS.md)
