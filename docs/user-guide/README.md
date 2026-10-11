# User Guide Documentation

This directory contains documentation for end users of the MCP ABAP ADT Server.

## Quick Start

### Installation

Install from the npm registry (Node.js 22 or 24):

```bash
npm install -g @mcp-abap-adt/core        # full server: mcp-abap-adt
npm install -g @mcp-abap-adt/compact     # compact server: mcp-abap-adt-compact (same options)

# or without installing
npx -y @mcp-abap-adt/core --help
```

Which server and which connection (HTTP, RFC, SNC) to choose, and what RFC needs on the machine:
[Installation variants](../installation/INSTALLATION.md#installation-variants). Building from a checkout:
[From source](../installation/INSTALLATION.md#from-source-development).

**Configuration:** the server reads a `.env` only when you name it (`--env-path=<file>`, `--env=<name>` for
the sessions store, or `--mcp=<destination>` for a service key):

```bash
cat > /path/to/<destination>.env << 'EOF'
SAP_URL=https://your-sap-system.example
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_GRANT_TYPE=none
SAP_JWT_TOKEN=<token>
EOF

# stdio (for MCP clients)
mcp-abap-adt --env-path=/path/to/<destination>.env

# HTTP server
mcp-abap-adt --transport=http --port=3000 --env-path=/path/to/<destination>.env
```

---

## Documentation Files

- **[CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md)** - Guide for configuring MCP clients to connect to the server, including HTTP header configuration for dynamic SAP connection setup
- **[AVAILABLE_TOOLS_READONLY.md](AVAILABLE_TOOLS_READONLY.md)** - Read-only tools (auto-generated)
- **[AVAILABLE_TOOLS_HIGH.md](AVAILABLE_TOOLS_HIGH.md)** - High-level tools (auto-generated)
- **[AVAILABLE_TOOLS_LOW.md](AVAILABLE_TOOLS_LOW.md)** - Low-level tools (auto-generated)
- **Compact facade tools** — moved to `@mcp-abap-adt/compact` and documented there (`compact/docs/AVAILABLE_TOOLS.md`) (auto-generated)
- **[AVAILABLE_TOOLS.md](AVAILABLE_TOOLS.md)** - Full combined tools reference (auto-generated)
- **[AUTHENTICATION.md](AUTHENTICATION.md)** - The four supported authentications, destinations, service key locations, and header-based auth
- **[CLI_OPTIONS.md](CLI_OPTIONS.md)** - Every command-line option with its environment and YAML forms
- **[TERMINOLOGY.md](TERMINOLOGY.md)** - Project-specific terminology
- **[HANDLERS_MANAGEMENT.md](HANDLERS_MANAGEMENT.md)** - Enable/disable handler groups and exposure
- **[DEBUGGER.md](DEBUGGER.md)** - The opt-in debugger: debug sessions, the SAP ids, transports, what ends a session

## Getting Started

1. **Install the server**: see Installation above
2. **Configure your client**:
   - **Auto (recommended)**: Use the configurator (`@mcp-abap-adt/configurator`, repo: `mcp-abap-adt-conf`)
   - **Manual**: See [CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md) for JSON/TOML examples
3. **Explore available tools**:
   - [Read-only tools](AVAILABLE_TOOLS_READONLY.md)
   - [High-level tools](AVAILABLE_TOOLS_HIGH.md)
   - [Low-level tools](AVAILABLE_TOOLS_LOW.md)
   - Compact tools — in the `@mcp-abap-adt/compact` package

## Package Tree Output

`GetPackageTree` returns a package root with nested subpackages and a flat list of
objects for each package. Each object includes:

- `adtType` (ADT type string, e.g. `CLAS/OC`)
- `type` (normalized object type)
- `codeFormat` (`source` or `xml`)
- `restoreStatus` (`ok` or `not-implemented`)

## Command Reference

After installing, these commands are available (`mcp-abap-adt-compact` takes the same options):

### `mcp-abap-adt` - Default stdio transport
```bash
mcp-abap-adt [--env <destination>] [--env-path /path/to/.env]
```
Use with MCP clients like Claude Desktop, VSCode extensions.

### `mcp-abap-adt --transport=http` - HTTP server
```bash
mcp-abap-adt --transport=http [--port 3000] [--host localhost] [--env <destination>] [--env-path /path/to/.env]
```
Starts HTTP server with StreamableHTTP transport.

### `mcp-abap-adt --transport=sse` - SSE server
```bash
mcp-abap-adt --transport=sse [--port 3001] [--host localhost] [--env <destination>] [--env-path /path/to/.env]
```
Starts HTTP server with Server-Sent Events transport.

## Examples

### Example 1: HTTP Server on Port 8080
```bash
mcp-abap-adt --transport=http --port=8080
```

### Example 2: SSE Server Accessible from Network
```bash
mcp-abap-adt --transport=sse --host=0.0.0.0 --port=3001
```

### Example 3: Custom Environment File
```bash
mcp-abap-adt --transport=http --env-path /opt/config/.env.production --port=8080
```
