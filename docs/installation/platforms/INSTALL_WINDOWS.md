# Windows Installation Guide

Complete guide for installing MCP ABAP ADT Server on Windows using PowerShell and winget.

## 📋 Prerequisites

- Windows 10/11
- PowerShell 5.1 or later
- Administrator access (for winget installations)

## 🔧 Step 1: Install Node.js

### Option 1: Using nvm-windows (Recommended)

nvm (Node Version Manager) allows you to install and switch between multiple Node.js versions.

1. **Install nvm-windows:**

```powershell
# Using winget
winget install CoreyButler.NVMforWindows

# Or download installer from:
# https://github.com/coreybutler/nvm-windows/releases
```

2. **Restart PowerShell as Administrator**

3. **Install Node.js LTS:**

```powershell
# Install latest LTS version
nvm install lts

# Use the installed version
nvm use lts

# Verify installation
node -v
npm -v
```

### Option 2: Using winget (Direct)

```powershell
# Install Node.js LTS directly
winget install OpenJS.NodeJS.LTS

# Verify installation
node -v
npm -v
```

### Option 3: Manual Installation

1. Download Node.js LTS from [nodejs.org](https://nodejs.org/)
2. Run the installer
3. Restart PowerShell
4. Verify:
   ```powershell
   node -v
   npm -v
   ```

## 📦 Step 2: Install Git

### Using winget

```powershell
winget install Git.Git

# Restart PowerShell, then verify
git --version
```

### Manual Installation

Download from [git-scm.com](https://git-scm.com/download/win)

## 🚀 Step 3: Install MCP ABAP ADT Server

You have two installation options:

### Option A: Install from Pre-built Package (Recommended)

Install from a pre-built `.tgz` package file:

**Global Installation (Recommended):**

```powershell
# Download or obtain the package file
# Then install globally
npm install -g .\fr0ster-mcp-abap-adt-1.1.0.tgz

# Verify installation
mcp-abap-adt --help
```

**Available commands after installation:**
- `mcp-abap-adt` - HTTP transport (default)
- `mcp-abap-adt --transport=stdio` - stdio transport (for MCP clients)
- `mcp-abap-adt --transport=http` - HTTP server transport
- `mcp-abap-adt --transport=sse` - SSE server transport

**Usage examples:**
```powershell
# HTTP server on default port (3000)
mcp-abap-adt --transport=http

# HTTP server on custom port
mcp-abap-adt --transport=http --port 8080

# SSE server accessible from network
mcp-abap-adt --transport=sse --host 0.0.0.0 --port 3000

# Use custom .env file
mcp-abap-adt --transport=http --env C:\path\to\custom\.env --port 8080
```

**Local Installation (Project-specific):**

```powershell
# Navigate to your project
cd C:\path\to\your\project

# Install package locally
npm install C:\path\to\fr0ster-mcp-abap-adt-1.1.0.tgz

# Use via npx
npx mcp-abap-adt --transport=http --port 3000
```

**Troubleshooting:**

If command not found after global installation:
```powershell
# Check npm global bin directory
npm config get prefix

# Add to PATH (PowerShell as Administrator)
$npmPrefix = npm config get prefix
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$npmPrefix", "User")

# Restart PowerShell for changes to take effect
```

### Option B: Install from Source (For Development)

Clone and build from source code:

```powershell
# Clone repository with submodules
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt

# If you already cloned without submodules, initialize them:
# git submodule update --init --recursive

# Install dependencies
npm install

# Build project
npm run build
```

## ⚙️ Step 4: Configure SAP Connection

Create `.env` file in project root:

```powershell
# Create .env file
@"
SAP_URL=https://your-sap-system.com:8000
SAP_CLIENT=100
SAP_LANGUAGE=en
SAP_AUTH_TYPE=basic
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
TLS_REJECT_UNAUTHORIZED=0
SAP_TIMEOUT_DEFAULT=45000
"@ | Out-File -FilePath .env -Encoding utf8
```

Or copy from template:

```powershell
Copy-Item .env.template .env
# Edit .env with your values
notepad .env
```

## 🔌 Step 5: Connect to AI Tools

### Server Modes

MCP ABAP ADT Server supports two transport protocols:

1. **http** (default) - HTTP StreamableHTTP transport, works without .env file
2. **stdio** - Standard input/output, used by Cline/Cursor (requires .env file)
2. **SSE/HTTP** - Server-Sent Events over HTTP, for web interfaces

### Cline (VS Code Extension)

Uses **stdio** mode (must be explicitly specified).

**⚠️ IMPORTANT:** After global installation (`npm install -g @fr0ster/mcp-abap-adt`), use the `mcp-abap-adt` command with `--transport=stdio` and `--env` arguments.

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
        "--env=C:\\path\\to\\your\\e19.env"
      ]
    }
  }
}
```

**Important notes for Windows:**
- Use double backslashes `\\` or forward slashes `/` in file paths
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
        "C:\\Users\\YourUsername\\AppData\\Roaming\\npm\\node_modules\\@fr0ster\\mcp-abap-adt\\bin\\mcp-abap-adt.js",
        "--transport=stdio",
        "--env=C:\\path\\to\\your\\e19.env"
      ]
    }
  }
}
```

**Legacy: Direct dist/index.js (not recommended, use launcher instead):**

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-abap-adt\\dist\\index.js"],
      "env": {
        "SAP_URL": "https://your-sap-system.com:8000",
        "SAP_CLIENT": "100",
        "SAP_USERNAME": "your_username",
        "SAP_PASSWORD": "your_password"
      }
    }
  }
}
```

### Cursor

Uses **stdio** mode (must be explicitly specified).

**⚠️ IMPORTANT:** After global installation, use the `mcp-abap-adt` command with `--transport=stdio` and `--env` arguments.

Add to Cursor settings:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": [
        "--transport=stdio",
        "--env=C:\\path\\to\\your\\e19.env"
      ]
    }
  }
}
```

**Note:** If `.env` file is in the current directory, you can omit `--env` argument.

### HTTP Mode (Streamable HTTP)

**⚠️ IMPORTANT:** HTTP mode is the **default** mode. No `.env` file is required for HTTP mode (connection can be configured via HTTP headers).

**Starting HTTP Server:**

```powershell
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
```powershell
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

```powershell
# Using .env file with HTTP mode
mcp-abap-adt --transport=streamable-http --env=C:\\path\\to\\your\\e19.env
```

### SSE Mode (Server-Sent Events)

**⚠️ IMPORTANT:** SSE mode requires `.env` file or HTTP headers for SAP connection configuration.

**Starting SSE Server:**

```powershell
# Start server in SSE mode (requires .env file)
mcp-abap-adt --transport=sse --env=C:\\path\\to\\your\\e19.env

# Or with custom port
mcp-abap-adt --transport=sse --sse-port=3001 --env=C:\\path\\to\\your\\e19.env
```

**SSE Server Options:**
- `--transport=sse` - Use SSE transport
- `--sse-port PORT` - Port number (default: 3001)
- `--sse-host HOST` - Host address (default: 0.0.0.0)
- `--sse-allowed-origins LIST` - Comma-separated allowed origins
- `--sse-enable-dns-protection` - Enable DNS rebinding protection
- `--env=PATH` - Path to `.env` file (required for SSE mode)

**Example with custom port and host:**
```powershell
mcp-abap-adt --transport=sse --sse-port=4100 --sse-host=127.0.0.1 --env=C:\\path\\to\\your\\e19.env
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

```powershell
# Run test suite
npm test

# Test specific connection
node tests/test-connection.js
```

## 🐛 Troubleshooting

### Node.js not found after installation

Restart PowerShell or add to PATH manually:

```powershell
$env:Path += ";C:\Program Files\nodejs"
```

### Permission errors during npm install

Run PowerShell as Administrator or use:

```powershell
npm install --no-optional
```

### SSL/TLS certificate errors

Set in `.env`:

```env
TLS_REJECT_UNAUTHORIZED=0
```

### Firewall blocking connection

Add exception in Windows Firewall:

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "Node.js" -Direction Outbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow
```

## 📚 Next Steps

- [Configure SAP Connection](../../user-guide/CLIENT_CONFIGURATION.md)
- [Review CLI Options](../../user-guide/CLI_OPTIONS.md)
- [Available Tools](../../user-guide/AVAILABLE_TOOLS.md)

## 💡 Tips for Windows

### Use Windows Terminal

Install for better PowerShell experience:

```powershell
winget install Microsoft.WindowsTerminal
```

### Set Execution Policy

If scripts are blocked:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Use PowerShell 7

For better performance:

```powershell
winget install Microsoft.PowerShell
```
