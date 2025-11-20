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

## � Installation Methods

There are two main ways to install MCP ABAP ADT Server:

### Method 1: Install from Pre-built Package (Recommended for Production)

Download and install from a pre-built `.tgz` package:

```bash
# Download the package (replace URL with actual location)
# Or receive it from your administrator

# Install globally (recommended)
npm install -g ./fr0ster-mcp-abap-adt-1.1.0.tgz

# Or install locally in your project
npm install ./fr0ster-mcp-abap-adt-1.1.0.tgz
```

After installation, you'll have access to these commands:
- `mcp-abap-adt` - Default stdio transport
- `mcp-abap-adt-http` - HTTP server transport
- `mcp-abap-adt-sse` - SSE transport

**Setup .env file:**
```bash
# Create .env file with your SAP connection details
cat > .env << EOF
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your-jwt-token
EOF

# Run the server
mcp-abap-adt-http --port 3000
```

See [Package Installation Guide](#package-installation-details) below for detailed instructions.

### Method 2: Install from Source (Recommended for Development)

Clone the repository and build from source:

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt

# Install dependencies and build
npm install
npm run build

# Run the server
npm start
```

This method is recommended if you want to:
- Contribute to development
- Customize the server
- Build your own package

---

## �🚀 Quick Start

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

---

## 📦 Package Installation Details

### Installing from Pre-built Package

The pre-built package (`fr0ster-mcp-abap-adt-<version>.tgz`) contains everything you need to run the server without building from source.

#### Prerequisites
- Node.js 18 or later
- npm 9 or later

#### Global Installation (Recommended)

Install globally to use commands from anywhere:

```bash
# Install from local package file
npm install -g ./fr0ster-mcp-abap-adt-1.1.0.tgz

# Verify installation
mcp-abap-adt --help
mcp-abap-adt-http --help
mcp-abap-adt-sse --help
```

**Available commands after global installation:**

```bash
# Default stdio transport
mcp-abap-adt

# HTTP server transport
mcp-abap-adt-http --port 3000

# SSE transport
mcp-abap-adt-sse --port 3000
```

#### Local Installation (Project-specific)

Install in your project directory:

```bash
# Navigate to your project
cd /path/to/your/project

# Install the package
npm install /path/to/fr0ster-mcp-abap-adt-1.1.0.tgz

# Use via npx
npx mcp-abap-adt-http --port 3000
```

#### Configuration

After installation, create a `.env` file with your SAP connection details:

```bash
# Create .env file
cat > .env << 'EOF'
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your-jwt-token
EOF
```

Or use a custom environment file:

```bash
mcp-abap-adt-http --env /path/to/custom/.env --port 3000
```

#### Usage Examples

**Example 1: Start HTTP server on default port (3000)**
```bash
mcp-abap-adt-http
```

**Example 2: Start HTTP server on custom port**
```bash
mcp-abap-adt-http --port 8080
```

**Example 3: Start HTTP server accessible from network**
```bash
mcp-abap-adt-http --host 0.0.0.0 --port 3000
```

**Example 4: Use custom environment file**
```bash
mcp-abap-adt-http --env /opt/config/.env.production --port 8080
```

**Example 5: Start SSE server**
```bash
mcp-abap-adt-sse --port 3000
```

**Example 6: Use stdio transport (for MCP clients)**
```bash
mcp-abap-adt
```

#### Updating the Package

To update to a newer version:

```bash
# Uninstall old version
npm uninstall -g @fr0ster/mcp-abap-adt

# Install new version
npm install -g ./fr0ster-mcp-abap-adt-1.2.0.tgz
```

#### Troubleshooting Package Installation

**Issue: Command not found after global installation**

Solution:
```bash
# Check npm global bin directory
npm config get prefix

# Add to PATH if needed (Linux/macOS)
export PATH="$(npm config get prefix)/bin:$PATH"

# Or on Windows (PowerShell)
$env:PATH += ";$(npm config get prefix)"
```

**Issue: Permission denied (Linux/macOS)**

Solution:
```bash
# Use sudo for global installation
sudo npm install -g ./fr0ster-mcp-abap-adt-1.1.0.tgz

# Or configure npm to use a different directory (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Then install without sudo
npm install -g ./fr0ster-mcp-abap-adt-1.1.0.tgz
```

---

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
