# macOS Installation Guide

Complete guide for installing MCP ABAP ADT Server on macOS using Homebrew.

## 📋 Prerequisites

- macOS 10.15 (Catalina) or later
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

2. **Install Node.js LTS:**

```bash
# Install latest LTS version
nvm install --lts

# Use the installed version
nvm use --lts

# Set as default
nvm alias default lts/*

# Verify installation
node -v
npm -v
```

### Option 2: Using Homebrew (Direct)

```bash
# Install Node.js LTS directly
brew install node

# Verify installation
node -v
npm -v
```

## 📦 Step 3: Install Git

```bash
# Install Git (if not already installed)
brew install git

# Verify
git --version
```

## 🚀 Step 4: Install MCP ABAP ADT Server

You have two installation options:

### Option A: Install from Pre-built Package (Recommended)

Install from a pre-built `.tgz` package file:

**Global Installation (Recommended):**

```bash
# Download or obtain the package file
# Then install globally
npm install -g ./fr0ster-mcp-abap-adt-1.1.0.tgz

# Verify installation
mcp-abap-adt --help
```

**Available commands after installation:**
- `mcp-abap-adt` - HTTP transport (default)
- `mcp-abap-adt --transport=stdio` - stdio transport (for MCP clients)
- `mcp-abap-adt --transport=http` - HTTP server transport
- `mcp-abap-adt --transport=sse` - SSE server transport

**Usage examples:**
```bash
# HTTP server on default port (3000)
mcp-abap-adt --transport=http

# HTTP server on custom port
mcp-abap-adt --transport=http --port 8080

# SSE server accessible from network
mcp-abap-adt --transport=sse --host 0.0.0.0 --port 3000

# Use custom .env file
mcp-abap-adt --transport=http --env /path/to/custom/.env --port 8080
```

**Local Installation (Project-specific):**

```bash
# Navigate to your project
cd /path/to/your/project

# Install package locally
npm install /path/to/fr0ster-mcp-abap-adt-1.1.0.tgz

# Use via npx
npx mcp-abap-adt --transport=http --port 3000
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

### Option B: Install from Source (For Development)

Clone and build from source code:

```bash
# Clone repository with submodules
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt

# If you already cloned without submodules, initialize them:
# git submodule update --init --recursive

# Install dependencies
npm install

# Build project
npm run build

# Verify installation
npm test
```

## ⚙️ Step 5: Configure SAP Connection

Create `.env` file in project root:

```bash
# Copy template
cp .env.template .env

# Edit with your favorite editor
nano .env
# or
vim .env
# or
code .env  # if you have VS Code
```

Example `.env` content:

```env
SAP_URL=https://your-sap-system.com:8000
SAP_CLIENT=100
SAP_LANGUAGE=en
SAP_AUTH_TYPE=basic
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
TLS_REJECT_UNAUTHORIZED=0
SAP_TIMEOUT_DEFAULT=45000
```

## 🔌 Step 6: Connect to AI Tools

### Server Modes

MCP ABAP ADT Server supports two transport protocols:

1. **http** (default) - HTTP StreamableHTTP transport, works without .env file
2. **stdio** - Standard input/output, used by Cline/Cursor (requires .env file)
2. **SSE/HTTP** - Server-Sent Events over HTTP, for web interfaces

### Cline (VS Code Extension)

Uses **stdio** mode (must be explicitly specified).

**⚠️ IMPORTANT:** After global installation (`npm install -g @fr0ster/mcp-abap-adt`), use the `mcp-abap-adt` command with `--transport=stdio` and `--env` arguments.

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
        "--env=/path/to/your/e19.env"
      ]
    }
  }
}
```

**Important notes:**
- `--transport=stdio` is **required** (default is HTTP mode)
- `--env` argument is **required** if `.env` file is not in the current working directory
- If `.env` file is in the current directory, you can omit `--env` argument:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio"]
    }
  }
}
```

**Alternative: Using node with full path (if global command not in PATH):**

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": [
        "/usr/local/lib/node_modules/@fr0ster/mcp-abap-adt/bin/mcp-abap-adt.js",
        "--transport=stdio",
        "--env=/path/to/your/e19.env"
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
        "--env=/path/to/your/e19.env"
      ]
    }
  }
}
```

**Note:** If `.env` file is in the current directory, you can omit `--env` argument.

### HTTP Mode (Streamable HTTP)

**⚠️ IMPORTANT:** HTTP mode is the **default** mode. No `.env` file is required for HTTP mode (connection can be configured via HTTP headers).

**Starting HTTP Server:**

```bash
# Start server in HTTP mode (default, no arguments needed)
mcp-abap-adt

# Or explicitly specify HTTP mode
mcp-abap-adt --transport=streamable-http

# Or with custom port
mcp-abap-adt --transport=streamable-http --http-port=8080
```

**HTTP Server Options:**
- `--transport=streamable-http` or `--transport=http` - Use HTTP transport (default)
- `--http-port PORT` - Port number (default: 3000)
- `--http-host HOST` - Host address (default: 0.0.0.0)

**Example with custom port:**
```bash
mcp-abap-adt --transport=streamable-http --http-port=8080
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
      "x-sap-url": "https://your-sap-system.com:8000",
      "x-sap-auth-type": "basic",
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
mcp-abap-adt --transport=streamable-http --env=/path/to/your/e19.env
```

### SSE Mode (Server-Sent Events)

**⚠️ IMPORTANT:** SSE mode requires `.env` file or HTTP headers for SAP connection configuration.

**Starting SSE Server:**

```bash
# Start server in SSE mode (requires .env file)
mcp-abap-adt --transport=sse --env=/path/to/your/e19.env

# Or with custom port
mcp-abap-adt --transport=sse --sse-port=3001 --env=/path/to/your/e19.env
```

**SSE Server Options:**
- `--transport=sse` - Use SSE transport
- `--sse-port PORT` - Port number (default: 3001)
- `--sse-host HOST` - Host address (default: 0.0.0.0)
- `--sse-allowed-origins LIST` - Comma-separated allowed origins
- `--sse-enable-dns-protection` - Enable DNS rebinding protection
- `--env=PATH` - Path to `.env` file (required for SSE mode)

**Example with custom port and host:**
```bash
mcp-abap-adt --transport=sse --sse-port=4100 --sse-host=127.0.0.1 --env=/path/to/your/e19.env
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
# Run test suite
npm test

# Test specific connection
node tests/test-connection.js
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
nvm install 18
nvm use 18
```

### SSL/TLS certificate errors

Set in `.env`:

```env
TLS_REJECT_UNAUTHORIZED=0
```

Or install certificates:

```bash
# Update certificates
brew install ca-certificates
```

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
- [Available Tools](../../user-guide/AVAILABLE_TOOLS.md)

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
