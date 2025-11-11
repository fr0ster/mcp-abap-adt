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

```powershell
# Clone repository
git clone https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt

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

1. **stdio** (default) - Standard input/output, used by Cline/Cursor
2. **SSE/HTTP** - Server-Sent Events over HTTP, for web interfaces

### Cline (VS Code Extension)

Uses **stdio** mode (default).

1. Install Cline extension in VS Code
2. Open Cline settings (JSON)
3. Add MCP server configuration:

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

Uses **stdio** mode (default).

Add to Cursor settings:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-abap-adt\\dist\\index.js"]
    }
  }
}
```

### SSE/HTTP Mode (Web Interfaces)

For web-based clients or custom integrations:

```powershell
# Start server in SSE mode
npm run start:sse

# Or with custom port
node dist/index.js --transport sse --sse-port 3001

# Or streamable HTTP mode
npm run start:http
node dist/index.js --transport streamable-http
```

**SSE Server Options:**
- `--sse-port PORT` - Port number (default: 3001)
- `--sse-host HOST` - Host address (default: 0.0.0.0)
- `--sse-allowed-origins LIST` - Comma-separated allowed origins
- `--sse-enable-dns-protection` - Enable DNS rebinding protection

**Example:**
```powershell
node dist/index.js --transport sse --sse-port 4100 --sse-host 127.0.0.1
```

Server will be available at: `http://127.0.0.1:4100/sse`

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

- [Configure SAP Connection](../CONFIGURATION.md)
- [Connect to AI Tools](../AI_TOOLS.md)
- [Available Tools](../AVAILABLE_TOOLS.md)

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
