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

After installation, you'll have access to:
- `mcp-abap-adt` - MCP ABAP ADT Server (default: HTTP mode)
- `mcp-abap-adt --transport=stdio` - stdio transport (for MCP clients)
- `mcp-abap-adt --transport=http` - HTTP server transport
- `mcp-abap-adt --transport=sse` - SSE transport

**For JWT authentication with service keys**, install the connection package separately:
```bash
npm install -g @mcp-abap-adt/connection
sap-abap-auth auth -k path/to/service-key.json
```

**Get help on available options:**
```bash
mcp-abap-adt --help
```

**Setup .env file:**

For basic authentication:
```bash
# The server automatically looks for .env in your current directory
cd ~/my-project
cat > .env << EOF
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
EOF
```

For JWT authentication (SAP BTP) with service key:
```bash
# Install the connection package globally (one-time setup)
npm install -g @mcp-abap-adt/connection

# Generate .env file from service key JSON
sap-abap-auth auth -k path/to/service-key.json

# This automatically creates/updates .env file with JWT tokens
```

**Run the server:**
```bash
# Default HTTP mode (uses auth-broker by default, even if .env exists)
# Note: auth-broker is only available for HTTP/streamable-http transport
mcp-abap-adt

# Force use of auth-broker (service keys), ignore .env file
# Note: Only works with HTTP/streamable-http transport
mcp-abap-adt --auth-broker

# stdio mode (for MCP clients, requires .env file or --mcp parameter)
# Use --mcp parameter to enable auth-broker with stdio transport
# Example: mcp-abap-adt --transport=stdio --mcp=TRIAL
mcp-abap-adt --transport=stdio

# Or specify custom .env location (uses .env instead of auth-broker)
mcp-abap-adt --env=/path/to/my.env
mcp-abap-adt --env ~/configs/sap-dev.env

# Start HTTP server on custom port
mcp-abap-adt --transport=http --http-port=8080
```

**Environment File Priority:**
1. Path specified via `--env` or `--env=` argument  
2. `.env` in current working directory (where you run the command)
3. `.env` in package installation directory

This means you can have different `.env` files for different projects and the server will automatically use the one in your current directory.

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
mcp-abap-adt --transport=http --help
mcp-abap-adt --transport=sse --help
```

**Available commands after global installation:**

```bash
# Default HTTP mode (uses auth-broker by default)
mcp-abap-adt

# Force use of auth-broker (service keys), ignore .env file
mcp-abap-adt --auth-broker

# stdio mode (for MCP clients, requires .env file or --mcp parameter for auth-broker)
mcp-abap-adt --transport=stdio

# Use .env file instead of auth-broker
mcp-abap-adt --env=/path/to/.env

# HTTP server transport
mcp-abap-adt --transport=http --http-port=3000

# SSE transport
mcp-abap-adt --transport=sse --sse-port=3001
```

**For JWT authentication with service keys**, install separately:
```bash
npm install -g @mcp-abap-adt/connection
sap-abap-auth auth -k path/to/service-key.json
```

#### Local Installation (Project-specific)

Install in your project directory:

```bash
# Navigate to your project
cd /path/to/your/project

# Install the package
npm install /path/to/fr0ster-mcp-abap-adt-1.1.0.tgz

# Use via npx
npx mcp-abap-adt --transport=http --port 3000
```

#### Configuration

The server supports two authentication methods:

1. **Service Keys (Auth-Broker)** - Recommended for multi-destination scenarios
2. **.env File** - Traditional single-configuration approach

##### Option 1: Service Keys (Auth-Broker) - Default

By default, the server uses auth-broker (service keys) for authentication. This is the recommended approach when working with multiple destinations.

**Setup:**
```bash
# Create service key directory (Unix)
mkdir -p ~/.config/mcp-abap-adt/service-keys

# Create service key file (e.g., TRIAL.json)
cat > ~/.config/mcp-abap-adt/service-keys/TRIAL.json << 'EOF'
{
  "uaa": {
    "url": "https://your-uaa-url.com",
    "clientid": "your-client-id",
    "clientsecret": "your-client-secret"
  },
  "url": "https://your-sap-url.com"
}
EOF

# Run server (uses auth-broker by default)
mcp-abap-adt

# Or explicitly force auth-broker
mcp-abap-adt --auth-broker
```

**Using destinations in HTTP headers:**
```json
{
  "headers": {
    "x-sap-destination": "TRIAL"
  }
}
```

See [Client Configuration Guide](../user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication) for details.

##### Option 2: .env File

For single-configuration scenarios, you can use a `.env` file:

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
mcp-abap-adt --transport=http --env /path/to/custom/.env --port 3000
```

#### Usage Examples

**Example 1: Start HTTP server on default port (3000)**
```bash
mcp-abap-adt --transport=http
```

**Example 2: Start HTTP server on custom port**
```bash
mcp-abap-adt --transport=http --port 8080
```

**Example 3: Start HTTP server accessible from network**
```bash
mcp-abap-adt --transport=http --host 0.0.0.0 --port 3000
```

**Example 4: Use custom environment file**
```bash
mcp-abap-adt --transport=http --env /opt/config/.env.production --port 8080
```

**Example 5: Start SSE server**
```bash
mcp-abap-adt --transport=sse --port 3000
```

#### Command Line Options

All server commands (`mcp-abap-adt`, `mcp-abap-adt --transport=http`, `mcp-abap-adt --transport=sse`) support the following options:

**General Options:**
- `--help` - Show complete help message with all available options
- `--auth-broker` - Force use of auth-broker (service keys), ignore .env file
- `--auth-broker-path=<path>` - Custom path for auth-broker service keys and sessions
  - Creates `service-keys` and `sessions` subdirectories in the specified path
  - Directories are created automatically if they don't exist
  - Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
  - Can be used together with `--auth-broker` flag
- `--env=<path>` - Path to .env file (uses .env instead of auth-broker)
- `--env <path>` - Alternative syntax for specifying .env path

**Note:** By default (when no flags are specified), the server checks for `.env` in the current directory first. If `.env` exists, it is used automatically. If not, auth-broker is used. Use `--auth-broker` to force auth-broker even when `.env` exists.

**Transport Selection:**
- `--transport=<type>` - Transport type: `stdio`, `http`, `streamable-http`, or `sse`

**HTTP Server Options (for `mcp-abap-adt --transport=http`):**
- `--http-port=<port>` - HTTP server port (default: 3000)
- `--http-host=<host>` - HTTP server host (default: 0.0.0.0)
- `--http-json-response` - Enable JSON response format
- `--http-allowed-origins=<list>` - Comma-separated allowed origins for CORS
- `--http-allowed-hosts=<list>` - Comma-separated allowed hosts
- `--http-enable-dns-protection` - Enable DNS rebinding protection

**SSE Server Options (for `mcp-abap-adt --transport=sse`):**
- `--sse-port=<port>` - SSE server port (default: 3001)
- `--sse-host=<host>` - SSE server host (default: 0.0.0.0)
- `--sse-allowed-origins=<list>` - Comma-separated allowed origins for CORS
- `--sse-allowed-hosts=<list>` - Comma-separated allowed hosts
- `--sse-enable-dns-protection` - Enable DNS rebinding protection

**Environment Variables:**

You can also configure the server using environment variables:
- `MCP_ENV_PATH` - Path to .env file
- `MCP_SKIP_ENV_LOAD` - Skip automatic .env loading (true|false)
- `MCP_TRANSPORT` - Default transport type
- `MCP_HTTP_PORT` - Default HTTP port
- `MCP_HTTP_HOST` - Default HTTP host
- `MCP_SSE_PORT` - Default SSE port
- `MCP_SSE_HOST` - Default SSE host

**Examples with Options:**

```bash
# Show help
mcp-abap-adt --help

# Use custom .env from different location
mcp-abap-adt --env=~/configs/sap-production.env

# Start HTTP server with CORS configuration
mcp-abap-adt --transport=http --http-port=8080 \
  --http-allowed-origins=http://localhost:3000,https://myapp.com

# Start SSE with DNS protection
mcp-abap-adt --transport=sse --sse-port=3001 --sse-enable-dns-protection
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
