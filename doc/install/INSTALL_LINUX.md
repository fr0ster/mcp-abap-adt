# Linux Installation Guide

Complete guide for installing MCP ABAP ADT Server on Linux distributions.

## 📋 Prerequisites

- Linux distribution (Ubuntu, Debian, Fedora, Arch, etc.)
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

3. **Install Node.js LTS:**

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

**Why nvm?**
- ✅ No sudo needed for global packages
- ✅ Easy version switching
- ✅ Per-project Node.js versions
- ✅ Industry standard for Node.js development

### Option 2: Using Package Managers

#### Ubuntu/Debian

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node -v
npm -v
```

#### Fedora/RHEL/CentOS

```bash
# Using NodeSource repository
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
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

## 📦 Step 2: Install Git

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

```bash
# Clone repository
git clone https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt

# Install dependencies
npm install

# Build project
npm run build

# Verify installation
npm test
```

## ⚙️ Step 4: Configure SAP Connection

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

## 🔌 Step 5: Connect to AI Tools

### Server Modes

MCP ABAP ADT Server supports two transport protocols:

1. **stdio** (default) - Standard input/output, used by Cline/Cursor
2. **SSE/HTTP** - Server-Sent Events over HTTP, for web interfaces

### Cline (VS Code Extension)

Uses **stdio** mode (default).

1. Install Cline extension in VS Code
2. Open Cline settings (JSON): `Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)"
3. Add MCP server configuration:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["/home/your-username/mcp-abap-adt/dist/index.js"],
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
      "args": ["/home/your-username/mcp-abap-adt/dist/index.js"]
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

## ✅ Step 6: Test Installation

```bash
# Run test suite
npm test

# Test specific connection
node tests/test-connection.js
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

Install certificates:

```bash
# Ubuntu/Debian
sudo apt-get install -y ca-certificates

# Fedora/RHEL
sudo dnf install -y ca-certificates

# Arch
sudo pacman -S ca-certificates
```

Or set in `.env`:

```env
TLS_REJECT_UNAUTHORIZED=0
```

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

- [Configure SAP Connection](../CONFIGURATION.md)
- [Connect to AI Tools](../AI_TOOLS.md)
- [Available Tools](../AVAILABLE_TOOLS.md)

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
WorkingDirectory=/home/your-username/mcp-abap-adt
ExecStart=/usr/bin/node /home/your-username/mcp-abap-adt/dist/index.js
Restart=on-failure
Environment="NODE_ENV=production"

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
