# User Guide Documentation

This directory contains documentation for end users of the MCP ABAP ADT Server.

## Quick Start

### Installation Options

You can install MCP ABAP ADT Server in two ways:

#### 1. From Pre-built Package (Recommended for Production)

Install from a pre-built `.tgz` package:

```bash
# Install globally
npm install -g ./fr0ster-mcp-abap-adt-1.1.0.tgz

# Available commands:
mcp-abap-adt          # HTTP transport (default)
mcp-abap-adt --transport=stdio    # stdio transport (for MCP clients)
mcp-abap-adt --transport=sse      # SSE server
```

**Configuration:**
```bash
# Create .env file
cat > .env << 'EOF'
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your-jwt-token
EOF

# Run HTTP server
mcp-abap-adt --transport=http --port 3000
```

See [Installation Guide](../installation/INSTALLATION.md#package-installation-details) for detailed instructions.

#### 2. From Source Repository (For Development)

```bash
# Clone and build
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
npm run build
npm start
```

See [Installation Guide](../installation/INSTALLATION.md) for full instructions.

---

## Documentation Files

- **[CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md)** - Guide for configuring MCP clients to connect to the server, including HTTP header configuration for dynamic SAP connection setup
- **[AVAILABLE_TOOLS.md](AVAILABLE_TOOLS.md)** - Complete list of all available MCP tools with descriptions and usage examples (auto-generated from handler definitions)
- **[AUTHENTICATION.md](AUTHENTICATION.md)** - Destination-based auth, service key locations, and header-based auth
- **[TERMINOLOGY.md](TERMINOLOGY.md)** - Project-specific terminology

## Getting Started

1. **Install the server**: Choose package or source installation above
2. **Configure your client**: See [CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md) for setup instructions
3. **Explore available tools**: See [AVAILABLE_TOOLS.md](AVAILABLE_TOOLS.md) for a complete list of tools you can use

## Package Tree Output

`GetPackageTree` returns a package root with nested subpackages and a flat list of
objects for each package. Each object includes:

- `adtType` (ADT type string, e.g. `CLAS/OC`)
- `type` (normalized object type)
- `codeFormat` (`source` or `xml`)
- `restoreStatus` (`ok` or `not-implemented`)

## Command Reference

After installing from package, these commands are available:

### `mcp-abap-adt` - Default HTTP transport
```bash
mcp-abap-adt [--env /path/to/.env]
```
Use with MCP clients like Claude Desktop, VSCode extensions.

### `mcp-abap-adt --transport=http` - HTTP server
```bash
mcp-abap-adt --transport=http [--port 3000] [--host localhost] [--env /path/to/.env]
```
Starts HTTP server with StreamableHTTP transport.

### `mcp-abap-adt --transport=sse` - SSE server
```bash
mcp-abap-adt --transport=sse [--port 3000] [--host localhost] [--env /path/to/.env]
```
Starts HTTP server with Server-Sent Events transport.

## Examples

### Example 1: HTTP Server on Port 8080
```bash
mcp-abap-adt --transport=http --port 8080
```

### Example 2: SSE Server Accessible from Network
```bash
mcp-abap-adt --transport=sse --host 0.0.0.0 --port 3000
```

### Example 3: Custom Environment File
```bash
mcp-abap-adt --transport=http --env /opt/config/.env.production --port 8080
```
