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
# Dependencies are automatically installed via npm install
# To update to latest versions, run:
npm update @mcp-abap-adt/connection @mcp-abap-adt/adt-clients
```

## ⚠️ Important: Workspace Setup

This project uses **npm workspaces** to manage multiple packages (`@mcp-abap-adt/connection`, `@mcp-abap-adt/adt-clients`). 

**❌ DO NOT run `npm install` in individual package directories!**

**✅ Correct installation process:**

1. **Only run `npm install` in the root directory:**
   ```bash
   cd mcp-abap-adt
   npm install
   ```
   This will automatically install dependencies for all workspace packages.

2. **Build all packages from root:**
   ```bash
   npm run build
   ```
   This will build all workspace packages in the correct order, then build the main project.

**Why?** 
- npm workspaces automatically link packages together
- Running `npm install` in root installs all dependencies for all packages
- The build script ensures packages are built in the correct order (dependencies first)
- Using `npx tsc` ensures TypeScript is found from `node_modules` without global installation

**If you get errors:**
- `tsc: command not found` → Make sure you ran `npm install` in the root directory (TypeScript is in `devDependencies`)
- `Cannot find module '@mcp-abap-adt/connection'` → Run `npm install` in root, then `npm run build` (packages need to be built first)

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
