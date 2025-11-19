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

1. **stdio** (default) - Standard input/output, used by Cline/Cursor
2. **SSE/HTTP** - Server-Sent Events over HTTP, for web interfaces

### Cline (VS Code Extension)

Uses **stdio** mode (default).

1. Install Cline extension in VS Code
2. Open Cline settings (JSON): `Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"
3. Add MCP server configuration:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["/Users/your-username/mcp-abap-adt/dist/index.js"],
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

Add to Cursor settings (`~/.cursor/config.json`):

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["/Users/your-username/mcp-abap-adt/dist/index.js"]
    }
  }
}
```

### SSE/HTTP Mode (Web Interfaces)

For web-based clients or custom integrations:

```bash
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
```bash
node dist/index.js --transport sse --sse-port 4100 --sse-host 127.0.0.1
```

Server will be available at: `http://127.0.0.1:4100/sse`

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

- [Configure SAP Connection](../CONFIGURATION.md)
- [Connect to AI Tools](../AI_TOOLS.md)
- [Available Tools](../AVAILABLE_TOOLS.md)

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
