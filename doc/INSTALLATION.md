# MCP ABAP ADT Server - Installation Guide

Complete installation guide for MCP ABAP ADT Server across different platforms.

## 📋 Quick Links

- **[Windows Installation](./install/INSTALL_WINDOWS.md)** - Using PowerShell and winget
- **[macOS Installation](./install/INSTALL_MACOS.md)** - Using Homebrew
- **[Linux Installation](./install/INSTALL_LINUX.md)** - Using package managers

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

# Clone and build
git clone https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
```

### macOS
```bash
# Install Node.js via Homebrew
brew install node

# Clone and build
git clone https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
```

### Linux
```bash
# Install Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
```

## 📖 Detailed Guides

For detailed platform-specific instructions, see:
- [Windows Installation Guide](./install/INSTALL_WINDOWS.md)
- [macOS Installation Guide](./install/INSTALL_MACOS.md)
- [Linux Installation Guide](./install/INSTALL_LINUX.md)

## 🔗 Next Steps

After installation:
1. [Configure SAP Connection](./CONFIGURATION.md)
2. [Connect to AI Tools](./AI_TOOLS.md)
3. [Test Your Setup](./TESTING.md)

## 💡 Need Help?

- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [FAQ](./FAQ.md)
- [GitHub Issues](https://github.com/fr0ster/mcp-abap-adt/issues)
