# Command Line Interface (CLI) Reference

Complete reference for MCP ABAP ADT Server command line options.

## Available Command

After global installation, one command is available:

- `mcp-abap-adt` - MCP ABAP ADT Server (supports stdio, HTTP, and SSE transports)

## Getting Help

```bash
mcp-abap-adt --help
```

The help message shows all available options for all transport modes.

## General Options

### Environment File Configuration

**--env=\<path\>** or **--env \<path\>**

Specify path to .env file containing SAP connection details.

```bash
# Absolute path
mcp-abap-adt --env=/opt/config/sap-prod.env

# Relative path (resolved from current directory)
mcp-abap-adt --env=../configs/dev.env

# Space-separated syntax
mcp-abap-adt --env ~/sap-configs/production.env
```

**Environment File Priority:**

The server looks for .env file in this order:
1. Path specified via `--env` argument
2. `.env` in current working directory (`process.cwd()`)
3. `.env` in package installation directory

This allows you to:
- Have different .env files per project
- Override with `--env` when needed
- Use global default as fallback

**Example workflow:**
```bash
# Project 1 (development system)
cd ~/projects/abap-dev
cat > .env << EOF
SAP_URL=https://dev.sap.company.com
SAP_CLIENT=100
EOF
mcp-abap-adt  # Uses ~/projects/abap-dev/.env

# Project 2 (production system)
cd ~/projects/abap-prod
cat > .env << EOF
SAP_URL=https://prod.sap.company.com
SAP_CLIENT=200
EOF
mcp-abap-adt  # Uses ~/projects/abap-prod/.env

# Override for testing
mcp-abap-adt --env=/tmp/test.env
```

## Transport Selection

**--transport=\<type\>**

Specify which transport protocol to use.

Valid values:
- `http` or `streamable-http` - HTTP server (default)
- `stdio` - Standard input/output (for MCP protocol)
- `sse` - Server-Sent Events

```bash
# Default HTTP mode (no flag needed)
mcp-abap-adt

# Explicit stdio (for MCP clients like Cline, Cursor)
mcp-abap-adt --transport=stdio

# HTTP transport
mcp-abap-adt --transport=http

# SSE transport
mcp-abap-adt --transport=sse
```

**Note:** You can use shortcuts `--http` or `--sse` instead of `--transport=http` or `--transport=sse`.

## Auth-Broker Options

**--mcp=\<destination\>**

Default MCP destination name. When specified, this destination will be used when `x-mcp-destination` header is not provided in the request. This allows using auth-broker (service keys) with stdio and SSE transports.

```bash
# Use stdio with auth-broker (--mcp parameter)
mcp-abap-adt --transport=stdio --mcp=TRIAL

# Use SSE with auth-broker (--mcp parameter)
mcp-abap-adt --transport=sse --mcp=TRIAL

# Use HTTP with default destination (overrides x-mcp-destination header if not provided)
mcp-abap-adt --transport=http --mcp=TRIAL
```

**Important:** The `--mcp` parameter enables auth-broker usage with stdio and SSE transports, which previously required `.env` file configuration. When `--mcp` is specified:
- For **stdio transport**: The server initializes auth-broker with the specified destination at startup
- For **SSE transport**: The server uses the specified destination when `x-mcp-destination` header is not provided
- For **HTTP transport**: The server uses the specified destination as a fallback when `x-mcp-destination` header is not provided
- **`.env` file is not loaded automatically** when `--mcp` is specified (even if it exists in current directory)
- **`.env` file is not considered mandatory** for stdio and SSE transports when `--mcp` is specified

**--auth-broker**

Force use of auth-broker (service keys) instead of `.env` file. Ignores `.env` file even if present in current directory.

```bash
# Force auth-broker usage
mcp-abap-adt --auth-broker

# Use auth-broker with custom path
mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/
```

**--auth-broker-path=\<path\>**

Custom path for auth-broker service keys and sessions. Creates `service-keys` and `sessions` subdirectories in the specified path.

```bash
# Use custom path for auth-broker
mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/
# This will use ~/prj/tmp/service-keys and ~/prj/tmp/sessions
```

## HTTP Server Options

Used with `--transport=http` or `--transport=streamable-http`.

### Port Configuration

**--http-port=\<port\>**

HTTP server port (default: 3000).

```bash
mcp-abap-adt --transport=http --http-port=8080
```

### Host Binding

**--http-host=\<host\>**

HTTP server host address (default: 0.0.0.0, binds to all interfaces).

```bash
# Bind to localhost only
mcp-abap-adt --transport=http --http-host=127.0.0.1

# Bind to all interfaces (default)
mcp-abap-adt --transport=http --http-host=0.0.0.0
```

### Response Format

**--http-json-response**

Enable JSON response format.

```bash
mcp-abap-adt --transport=http --http-json-response
```

### CORS Configuration

**--http-allowed-origins=\<list\>**

Comma-separated list of allowed origins for CORS.

```bash
# Single origin
mcp-abap-adt --transport=http --http-allowed-origins=http://localhost:3000

# Multiple origins
mcp-abap-adt --transport=http --http-allowed-origins=http://localhost:3000,https://app.example.com
```

**--http-allowed-hosts=\<list\>**

Comma-separated list of allowed hosts.

```bash
mcp-abap-adt --transport=http --http-allowed-hosts=localhost,myapp.local
```

### Security

**--http-enable-dns-protection**

Enable DNS rebinding protection.

```bash
mcp-abap-adt --transport=http --http-enable-dns-protection
```

### Complete HTTP Example

```bash
mcp-abap-adt --transport=http \
  --http-port=8080 \
  --http-host=0.0.0.0 \
  --http-allowed-origins=http://localhost:3000,https://myapp.com \
  --http-enable-dns-protection \
  --env=~/configs/sap-prod.env
```

## SSE Server Options

Used with `mcp-abap-adt --transport=sse` or `--transport=sse`.

### Port Configuration

**--sse-port=\<port\>**

SSE server port (default: 3001).

```bash
mcp-abap-adt --transport=sse --sse-port=8081
```

### Host Binding

**--sse-host=\<host\>**

SSE server host address (default: 0.0.0.0).

```bash
# Bind to localhost only
mcp-abap-adt --transport=sse --sse-host=127.0.0.1
```

### CORS Configuration

**--sse-allowed-origins=\<list\>**

Comma-separated list of allowed origins for CORS.

```bash
mcp-abap-adt --transport=sse --sse-allowed-origins=http://localhost:3000,https://app.example.com
```

**--sse-allowed-hosts=\<list\>**

Comma-separated list of allowed hosts.

```bash
mcp-abap-adt --transport=sse --sse-allowed-hosts=localhost,myapp.local
```

### Security

**--sse-enable-dns-protection**

Enable DNS rebinding protection.

```bash
mcp-abap-adt --transport=sse --sse-enable-dns-protection
```

### Complete SSE Example

```bash
mcp-abap-adt --transport=sse \
  --sse-port=3001 \
  --sse-host=0.0.0.0 \
  --sse-allowed-origins=http://localhost:3000 \
  --sse-enable-dns-protection \
  --env=~/configs/sap-dev.env
```

## Environment Variables

Alternative to command line arguments. Environment variables can be set in shell or `.env` file.

### General

- `MCP_ENV_PATH` - Path to .env file
- `MCP_SKIP_ENV_LOAD` - Skip automatic .env loading (true|false)
- `MCP_SKIP_AUTO_START` - Skip automatic server start (true|false, for testing)
- `MCP_TRANSPORT` - Default transport type (stdio|http|sse)

### HTTP Transport

- `MCP_HTTP_PORT` - Default HTTP port
- `MCP_HTTP_HOST` - Default HTTP host
- `MCP_HTTP_ENABLE_JSON_RESPONSE` - Enable JSON responses (true|false)
- `MCP_HTTP_ALLOWED_ORIGINS` - Allowed CORS origins (comma-separated)
- `MCP_HTTP_ALLOWED_HOSTS` - Allowed hosts (comma-separated)
- `MCP_HTTP_ENABLE_DNS_PROTECTION` - Enable DNS protection (true|false)

### SSE Transport

- `MCP_SSE_PORT` - Default SSE port
- `MCP_SSE_HOST` - Default SSE host
- `MCP_SSE_ALLOWED_ORIGINS` - Allowed CORS origins (comma-separated)
- `MCP_SSE_ALLOWED_HOSTS` - Allowed hosts (comma-separated)
- `MCP_SSE_ENABLE_DNS_PROTECTION` - Enable DNS protection (true|false)

### SAP Connection

These are typically set in `.env` file:

- `SAP_URL` - SAP system URL (required)
- `SAP_CLIENT` - SAP client number (required)
- `SAP_AUTH_TYPE` - Authentication type: `basic` or `jwt` (default: basic)
- `SAP_USERNAME` - SAP username (for basic auth)
- `SAP_PASSWORD` - SAP password (for basic auth)
- `SAP_JWT_TOKEN` - JWT token (for jwt auth)

### Example Environment Setup

**Shell environment:**
```bash
export MCP_HTTP_PORT=8080
export MCP_HTTP_ALLOWED_ORIGINS=http://localhost:3000
mcp-abap-adt --transport=http
```

**System .env file:**
```bash
# ~/.mcp-abap-adt.env
MCP_HTTP_PORT=8080
MCP_HTTP_ALLOWED_ORIGINS=http://localhost:3000,https://myapp.com

# Use it
mcp-abap-adt --transport=http --env ~/.mcp-abap-adt.env
```

## Priority Order

When the same option is specified multiple ways, this is the priority order (highest to lowest):

1. **Command line arguments** (`--http-port=8080`)
2. **Environment variables** (`MCP_HTTP_PORT=8080`)
3. **Default values**

Example:
```bash
# Port 9000 wins (command line)
export MCP_HTTP_PORT=8080
mcp-abap-adt --transport=http --http-port=9000
```

## Common Usage Patterns

### Development Setup

```bash
# Create dev environment
cd ~/dev/my-abap-project
cat > .env << EOF
SAP_URL=https://dev.sap.company.com
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=developer
SAP_PASSWORD=dev-password
EOF

# Run with auto-discovery
mcp-abap-adt
```

### Production Setup

```bash
# Centralized config
sudo mkdir -p /etc/mcp-abap-adt
sudo cat > /etc/mcp-abap-adt/prod.env << EOF
SAP_URL=https://prod.sap.company.com
SAP_CLIENT=200
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=production-jwt-token
EOF

# Run with explicit config
mcp-abap-adt --transport=http \
  --env=/etc/mcp-abap-adt/prod.env \
  --http-port=8080 \
  --http-enable-dns-protection
```

### Multi-Environment

```bash
# Structure
~/sap-configs/
├── dev.env
├── test.env
└── prod.env

# Quick switch
alias mcp-dev='mcp-abap-adt --env=~/sap-configs/dev.env'
alias mcp-test='mcp-abap-adt --env=~/sap-configs/test.env'
alias mcp-prod='mcp-abap-adt --transport=http --env=~/sap-configs/prod.env --http-port=8080'

# Use
mcp-dev
mcp-prod
```

## Troubleshooting

### Server Won't Start

Check if .env file exists and is readable:
```bash
# Check current directory
ls -la .env

# Check specified path
ls -la ~/configs/sap.env

# Verify environment loading (stderr output)
mcp-abap-adt 2>&1 | grep MCP-ENV
```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000

# Use different port
mcp-abap-adt --transport=http --http-port=3001
```

### Can't Find .env File

The server shows where it's looking:
```bash
mcp-abap-adt 2>&1 | head -10
# Look for [MCP-ENV] messages
```

Output will show:
- Current working directory
- Whether .env was found
- Which .env file is being used
- Full path being tried

### Wrong Environment Loaded

Check which .env is being used:
```bash
# Server shows this on startup
[MCP-ENV] Found .env file: /home/user/project/.env
[MCP-ENV] ✓ Successfully loaded: /home/user/project/.env

# Or use explicit path
mcp-abap-adt --env=/correct/path/.env
```

## See Also

- [Installation Guide](../installation/INSTALLATION.md)
- [Client Configuration](CLIENT_CONFIGURATION.md)
- [Available Tools](AVAILABLE_TOOLS.md)
