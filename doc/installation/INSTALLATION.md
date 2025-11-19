# MCP ABAP ADT Server - Installation Guide

Complete installation guide for MCP ABAP ADT Server across different platforms.

## 📋 Quick Links

- **[Windows Installation](./platforms/INSTALL_WINDOWS.md)** - Using PowerShell and winget
- **[macOS Installation](./platforms/INSTALL_MACOS.md)** - Using Homebrew
- **[Linux Installation](./platforms/INSTALL_LINUX.md)** - Using package managers

## 🎯 What You'll Get

After installation, you'll be able to:
- Work with SAP ABAP systems through MCP protocol
- Integrate ABAP development with AI tools (Cline, Cursor, GitHub Copilot)
- Use 50+ ABAP tools via natural language

## 🔧 Prerequisites

All platforms require:
- **Node.js** 18 or later
- **npm** (comes with Node.js)
- **Git**
- Access to SAP ABAP system (on-premise or BTP)

## 🚀 Quick Start

Choose your platform:

### Windows
```powershell
# Install Node.js via winget
winget install OpenJS.NodeJS.LTS

# Clone with submodules and build
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
```

### macOS
```bash
# Install Node.js via Homebrew
brew install node

# Clone with submodules and build
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
```

### Linux
```bash
# Install Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone with submodules and build
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
```

### 📦 Working with Git Submodules

This project uses a git submodule for the `@mcp-abap-adt/connection` package. If you've already cloned the repository without submodules, initialize them:

```bash
# Initialize and update submodules
git submodule update --init --recursive
```

To update submodules to their latest commits:

```bash
# Update all submodules
git submodule update --remote

# Or update a specific submodule
git submodule update --remote packages/connection
```

## 📖 Detailed Guides

For detailed platform-specific instructions, see:
- [Windows Installation Guide](./platforms/INSTALL_WINDOWS.md)
- [macOS Installation Guide](./platforms/INSTALL_MACOS.md)
- [Linux Installation Guide](./platforms/INSTALL_LINUX.md)

## 🔗 Next Steps

After installation:
1. [Configure SAP Connection](./CONFIGURATION.md)
2. [Connect to AI Tools](./AI_TOOLS.md)
3. [Test Your Setup](./TESTING.md)

## 💡 Need Help?

- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [FAQ](./FAQ.md)
- [GitHub Issues](https://github.com/fr0ster/mcp-abap-adt/issues)
