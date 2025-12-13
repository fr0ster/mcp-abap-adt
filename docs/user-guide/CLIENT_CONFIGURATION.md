# Client Configuration Guide

This guide explains how to configure MCP clients to connect to the `mcp-abap-adt` server.

## Overview

The `mcp-abap-adt` server supports multiple transport modes:
- **streamable-http** - HTTP-based transport with streaming support (default)
- **stdio** - Standard input/output (for MCP clients like Cline, Cursor)
- **sse** - Server-Sent Events transport

For HTTP-based transports (streamable-http and sse), you can configure SAP connection parameters via HTTP headers, allowing dynamic connection configuration per request.

### Methods That Require SAP Configuration

**Only `tools/call` requires SAP configuration** - all other MCP methods work without SAP connection:
- `tools/list` - List available tools (no SAP config needed)
- `tools/get` - Get tool metadata (no SAP config needed)
- `initialize` - Initialize MCP session (no SAP config needed)
- `ping` - Health check (no SAP config needed)
- `notifications/initialized` - Notification (no SAP config needed)
- `tools/call` - **Execute a tool** (requires SAP configuration)

This means you can query available tools, get tool descriptions, and initialize the connection without providing SAP credentials. Only when you actually call a tool (e.g., `GetProgram`, `CreateClass`) does the server require SAP authentication.

## Streamable HTTP Configuration

### Basic Configuration

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http"
  }
}
```

### Configuration with SAP Connection Headers

When using HTTP transport, you can configure the SAP connection dynamically via HTTP headers:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-sap-system.abap.us10.hana.ondemand.com",
      "x-sap-auth-type": "jwt",
      "x-sap-jwt-token": "your_jwt_token_here",
      "x-sap-refresh-token": "your_refresh_token_here"
    }
  }
}
```

### Supported HTTP Headers

The server processes the following HTTP headers (as checked in `applyAuthHeaders` method):

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `x-sap-url` | Yes* | SAP system URL | `https://system.abap.us10.hana.ondemand.com` |
| `x-sap-auth-type` | Yes* | Authentication type | `jwt`, `xsuaa`, or `basic` |
| `x-sap-jwt-token` | Yes* (for JWT) | JWT access token | `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `x-sap-refresh-token` | No | Refresh token for automatic token renewal (JWT only) | `refresh_token_string` |
| `x-sap-login` | Yes* (for basic) | Username for basic authentication | `your_username` |
| `x-sap-password` | Yes* (for basic) | Password for basic authentication | `your_password` |
| `x-sap-destination` | No | Destination name for service key-based authentication | `TRIAL`, `DEV`, `PROD` |
| `x-mcp-destination` | No | Destination name for MCP destination-based authentication | `TRIAL`, `DEV`, `PROD` |

\* Required when not using `.env` file configuration or destination-based authentication. If headers are not provided, the server will use configuration from `.env` file or environment variables.

**Notes:**
- For **JWT authentication**: `x-sap-url`, `x-sap-auth-type`, and `x-sap-jwt-token` are required. `x-sap-refresh-token` is optional for automatic token refresh.
- For **basic authentication**: `x-sap-url`, `x-sap-auth-type`, `x-sap-login`, and `x-sap-password` are required.
- For **destination-based authentication**: Use `x-sap-destination` or `x-mcp-destination` header. URL is automatically derived from the service key, so `x-sap-url` is not required (and will be ignored if provided). Service keys must be stored in platform-specific locations (see [Destination-Based Authentication](#destination-based-authentication) section).
- For automatic token refresh, you only need `x-sap-refresh-token`. Client ID and Client Secret are **not needed** for refresh - they are only required for initial token generation via `sap-abap-auth` CLI tool (part of `@mcp-abap-adt/connection` package) or service keys.


## Basic Authentication

For on-premise systems using basic authentication:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-onpremise-system.com:8000",
      "x-sap-auth-type": "basic",
      "x-sap-login": "your_username",
      "x-sap-password": "your_password"
    }
  }
}
```

**Note:** For basic authentication, you can pass username and password via HTTP headers (`x-sap-login` and `x-sap-password`) or configure them in the server's `.env` file (`SAP_USERNAME`, `SAP_PASSWORD`). Headers take priority over `.env` values.

## Destination-Based Authentication

> **Note:** Destination-based authentication (auth-broker) is available for all transport types:
> - **HTTP/streamable-http**: Use `x-sap-destination` or `x-mcp-destination` headers (default behavior)
> - **stdio**: Use `--mcp=<destination>` command-line parameter
> - **SSE**: Use `x-mcp-destination` header or `--mcp=<destination>` command-line parameter
> 
> For **stdio** and **SSE** transports without `--mcp` parameter, use `.env` file configuration instead.
> 
> **Important:** When `--mcp` parameter is specified, `.env` file is **not loaded automatically** (even if it exists in current directory). This ensures that auth-broker configuration takes precedence over `.env` file settings.

The server supports destination-based authentication using service keys stored locally. This allows you to configure authentication once per destination and reuse it across multiple requests.

### When Auth-Broker is Used

The server uses auth-broker (service keys) in the following cases:

1. **By default** (when `--env` is not specified AND no `.env` file exists in current directory): Auth-broker is used automatically
2. **When `--auth-broker` flag is specified**: Forces use of auth-broker, ignoring any `.env` file (even if it exists in current directory)
3. **When `--mcp` parameter is specified**: Uses auth-broker with the specified destination, `.env` file is not loaded automatically
4. **When `--env` is specified**: Uses the specified `.env` file instead of auth-broker

**Priority:**
1. `--env=<path>` - explicit .env file (highest priority)
2. `--mcp=<destination>` - uses auth-broker, skips .env file loading
3. `.env` in current directory - used automatically if exists (default behavior)
4. `--auth-broker` - force auth-broker, ignore .env
5. Auth-broker - used if no .env found (fallback)

**Examples:**
```bash
# Default: uses .env from current directory if exists, otherwise auth-broker
mcp-abap-adt

# Forces auth-broker, ignores .env file even if exists
mcp-abap-adt --auth-broker

# Uses auth-broker with --mcp parameter (skips .env file)
mcp-abap-adt --transport=stdio --mcp=TRIAL

# Uses .env file from custom path
mcp-abap-adt --env=/path/to/.env
```

### How It Works

1. **Service Keys**: Store SAP BTP service keys as JSON files
2. **Lazy Initialization**: AuthBroker instances are created on-demand when a destination is first used (not at server startup)
3. **Per-Destination Instances**: Each destination gets its own AuthBroker instance, cached in a map for reuse
4. **Sessions**: The server automatically manages JWT tokens and refresh tokens in `.env` files
5. **Automatic Token Management**: Tokens are validated, refreshed, and cached automatically

**Important:** AuthBroker is only initialized when needed:
- AuthBroker instances are created lazily when a request with destination header arrives
- Each destination (e.g., "TRIAL", "sk") gets its own AuthBroker instance
- Instances are cached and reused for subsequent requests to the same destination
- This reduces memory usage and startup time

### Service Key Storage

Service keys are stored in platform-specific locations:

**Unix (Linux/macOS):**
- Service keys: `~/.config/mcp-abap-adt/service-keys/{destination}.json`
- Sessions: `~/.config/mcp-abap-adt/sessions/{destination}.env` (only when `--unsafe` is used)

**Windows:**
- Service keys: `%USERPROFILE%\Documents\mcp-abap-adt\service-keys\{destination}.json`
- Sessions: `%USERPROFILE%\Documents\mcp-abap-adt\sessions\{destination}.env` (only when `--unsafe` is used)

**Fallback:** The server also searches in the current working directory (where the server is launched from).

### Session Storage

By default, session data (JWT tokens and refresh tokens) is stored **in-memory** using `SafeSessionStore`:
- **Secure by default**: Session data is not persisted to disk
- **Data loss on restart**: Session data is lost when the server restarts (requires re-authentication)
- **No file I/O**: No `.env` files are created for sessions

To enable **file-based session storage** (persists tokens to disk), use the `--unsafe` flag:

```bash
# Enable file-based session storage (persists tokens to disk)
mcp-abap-adt --auth-broker --unsafe

# Or via environment variable
MCP_UNSAFE=true mcp-abap-adt --auth-broker
```

**When `--unsafe` is used:**
- Session data is saved to platform-specific locations (see Service Key Storage above)
- Tokens persist across server restarts
- `.env` files are created/updated in the sessions directory
- **Security consideration**: Tokens are stored in plain text files on disk

**Recommendation**: Use `--unsafe` only if you need session persistence across server restarts. For production environments, consider using the default in-memory storage for better security.

### Service Key Format

Download the service key JSON file from SAP BTP (from the corresponding service instance) and save it as `{destination}.json` (e.g., `TRIAL.json`). The filename without `.json` extension becomes the destination name (case-sensitive).

**Storage locations:**
- **Linux/macOS:** `~/.config/mcp-abap-adt/service-keys/{destination}.json`
- **Windows:** `%USERPROFILE%\Documents\mcp-abap-adt\service-keys\{destination}.json`
- **Fallback:** Server also searches in current working directory (where server is launched)

### Using Destination Headers

#### Option 1: `x-sap-destination` (Highest Priority)

For SAP Cloud systems, use `x-sap-destination`:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-destination": "TRIAL"
    }
  }
}
```

**Features:**
- URL is automatically derived from the service key
- Optional: `x-sap-client` for client number
- Optional: `x-sap-login` and `x-sap-password` for additional authentication
- Automatically uses JWT authentication

#### Option 2: `x-mcp-destination`

For MCP-specific destinations, use `x-mcp-destination`:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-mcp-destination": "TRIAL"
    }
  }
}
```

**Features:**
- URL is automatically derived from the service key
- Optional: `x-sap-client` for client number
- Automatically uses JWT authentication
- Tokens are retrieved from the service key
- Note: If `x-sap-url` is provided, it will be ignored (URL comes from destination)

### First-Time Authentication

When using a destination for the first time:

1. The server reads the service key from `{destination}.json`
2. Opens a browser for OAuth2 authentication (if no valid session exists)
3. After successful authentication, saves tokens to `{destination}.env`
4. Subsequent requests use the cached tokens automatically

### Automatic Token Refresh

The server automatically:
- Validates tokens before use
- Refreshes expired tokens using refresh tokens
- Caches valid tokens for performance
- Falls back to browser authentication if refresh fails

### Example: Complete Setup

1. **Create service key:**
```bash
# Unix
mkdir -p ~/.config/mcp-abap-adt/service-keys
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
```

2. **Configure client:**
```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-destination": "TRIAL"
    }
  }
}
```

3. **First request:** Browser opens for authentication
4. **Subsequent requests:** Uses cached tokens automatically

### Using --mcp Parameter for stdio and SSE Transports

The `--mcp` parameter allows you to use auth-broker (service keys) with stdio and SSE transports, which previously required `.env` file configuration.

**For stdio transport:**
```bash
# Start server with --mcp parameter
mcp-abap-adt --transport=stdio --mcp=TRIAL
```

The server will:
1. Initialize auth-broker with the specified destination at startup
2. Load service key from `{destination}.json` (e.g., `TRIAL.json`)
3. Authenticate using OAuth2 if needed
4. Use the destination for all MCP tool calls

**For SSE transport:**
```bash
# Start server with --mcp parameter
mcp-abap-adt --transport=sse --mcp=TRIAL
```

The server will:
1. Use the specified destination when `x-mcp-destination` header is not provided in requests
2. Allow clients to override by providing `x-mcp-destination` header
3. Fall back to the `--mcp` destination if header is missing

**Example Cline configuration with stdio:**
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio", "--mcp=TRIAL"]
    }
  }
}
```

**Example SSE client configuration:**
```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/sse"
  }
}
```

The server will use `TRIAL` destination automatically (from `--mcp=TRIAL`), or you can override it per request:
```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/sse",
    "headers": {
      "x-mcp-destination": "DEV"  // Overrides --mcp parameter
    }
  }
}
```

### Custom Paths

You can override default paths using the `AUTH_BROKER_PATH` environment variable or the `--auth-broker-path` command-line option:

**Using Environment Variable:**
```bash
# Unix (colon-separated)
export AUTH_BROKER_PATH="/custom/path:/another/path"

# Windows (semicolon-separated)
set AUTH_BROKER_PATH=C:\custom\path;C:\another\path
```

**Using Command-Line Option:**
```bash
# Unix/Linux/macOS
mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/

# Windows
mcp-abap-adt --auth-broker --auth-broker-path=C:\prj\tmp\
```

**Note:** When using `--auth-broker-path`, the server automatically creates `service-keys` and `sessions` subdirectories in the specified path. For example, `--auth-broker-path=~/prj/tmp/` will use:
- `~/prj/tmp/service-keys/` for service key files
- `~/prj/tmp/sessions/` for session files

The directories are created automatically if they don't exist.

### Server Command-Line Options

When starting the server, you can control whether to use auth-broker or `.env` file:

```bash
# Uses auth-broker by default (even if .env exists in current directory)
mcp-abap-adt

# Forces use of auth-broker, ignores .env file
mcp-abap-adt --auth-broker

# Forces use of auth-broker with custom path (creates service-keys and sessions subdirectories)
mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/

# Uses .env file from current directory (must be explicitly specified)
mcp-abap-adt --env=.env
mcp-abap-adt --env .env

# Uses .env file from custom path
mcp-abap-adt --env=/path/to/.env
mcp-abap-adt --env /path/to/.env
```

**Behavior:**
- **Default (no flags)**: Checks for `.env` in current directory first; if exists, uses it; otherwise uses auth-broker
- **`--auth-broker`**: Forces use of auth-broker, completely ignores `.env` file (even if exists in current directory)
- **`--auth-broker-path=<path>`**: Specifies custom path for auth-broker service keys and sessions
  - Creates `service-keys` and `sessions` subdirectories in the specified path
  - Directories are created automatically if they don't exist
  - Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
  - Can be used together with `--auth-broker` flag
- **`--unsafe`**: Enables file-based session storage (persists tokens to disk)
  - By default, session data is stored in-memory (secure, lost on restart)
  - With `--unsafe`, session tokens are saved to `.env` files in the sessions directory
  - Can be set via environment variable: `MCP_UNSAFE=true`
  - Use only if you need session persistence across server restarts
- **`--env=<path>` or `--env <path>`**: Uses specified `.env` file, auth-broker is not used
  - Relative paths are resolved from current working directory
  - Absolute paths are used as-is

## Server Configuration

The server can be started in HTTP mode with:

```bash
npm run start:http
# or
node dist/index.js --transport streamable-http --http-port 3000
```

### Environment Variables

Alternatively, you can configure the server via environment variables in a `.env` file.

**For JWT authentication:**
```env
SAP_URL=https://your-sap-system.abap.us10.hana.ondemand.com
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your_jwt_token_here
SAP_REFRESH_TOKEN=your_refresh_token_here
```

**For basic authentication:**
```env
SAP_URL=https://your-onpremise-system.com:8000
SAP_AUTH_TYPE=basic
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
SAP_CLIENT=100
```

When using `.env` configuration, HTTP headers in the client configuration are optional and will override the `.env` values if provided.

## Dynamic Configuration Updates

The server automatically updates the connection configuration when it receives HTTP headers with SAP connection parameters. This allows:

1. **Multi-tenant scenarios**: Different clients can connect to different SAP systems
2. **Token refresh**: Update JWT tokens dynamically without restarting the server
3. **Runtime configuration**: Configure connections without modifying server files

### Configuration Priority

1. HTTP headers (if provided) - highest priority
2. `.env` file configuration
3. Environment variables

## SSE Mode Configuration

For Server-Sent Events transport, the configuration is similar:

**JWT authentication:**
```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/mcp/events",
    "headers": {
      "x-sap-url": "https://your-sap-system.abap.us10.hana.ondemand.com",
      "x-sap-auth-type": "jwt",
      "x-sap-jwt-token": "your_jwt_token_here",
      "x-sap-refresh-token": "your_refresh_token_here"
    }
  }
}
```

**Basic authentication:**
```json
{
  "local-mcp-sse": {
    "disabled": false,
    "timeout": 60,
    "type": "sse",
    "url": "http://localhost:3001/mcp/events",
    "headers": {
      "x-sap-url": "https://your-onpremise-system.com:8000",
      "x-sap-auth-type": "basic",
      "x-sap-login": "your_username",
      "x-sap-password": "your_password"
    }
  }
}
```

## Security Considerations

1. **Token Storage**: Never commit tokens to version control. Use environment variables or secure secret management.
2. **HTTPS**: Always use HTTPS for production deployments.
3. **Token Refresh**: Use refresh tokens to automatically renew expired JWT tokens without manual intervention.
4. **Header Validation**: The server validates header values but does not enforce HTTPS. Ensure your deployment uses HTTPS.
5. **Connection Isolation**: Starting from version 1.1.10, each client session maintains its own isolated SAP connection. This prevents data mixing between different clients connecting to different SAP systems. Each connection is cached based on a unique combination of `sessionId` + `sapUrl` + authentication parameters.
6. **Non-Local Connection Restrictions**:
   - **SSE Transport**: Always restricted to localhost connections only (127.0.0.1, ::1, localhost). Remote connections are rejected with a 403 Forbidden error.
   - **HTTP Transport**: Non-local connections are restricted when:
     - `.env` file exists (was found at server startup)
     - AND request does not include SAP connection headers (`x-sap-url`, `x-sap-auth-type`)
   - Non-local connections with SAP headers are allowed (enables multi-tenant scenarios)
   - Local connections are always allowed regardless of `.env` file presence

## Troubleshooting

### Connection Issues

- Verify the server is running: `curl http://localhost:3000/health` (if health endpoint exists)
- Check server logs for configuration errors
- Verify header names are correct (case-insensitive, but recommended format: `x-sap-*`)

### Authentication Issues

- Ensure JWT token is not expired
- Verify refresh token is valid if using automatic token renewal
- Check that `x-sap-auth-type` matches your authentication method (`jwt` or `basic`)

### Token Refresh

The server supports automatic token refresh when `x-sap-refresh-token` is provided in HTTP headers (or `SAP_REFRESH_TOKEN` in `.env`).

The connection will automatically refresh expired tokens when a 401/403 error is detected. The refresh happens transparently without requiring manual intervention.

**Note:** For automatic token refresh, you only need the refresh token. Client ID and Client Secret are **not needed** for refresh - they are only required for initial token generation via `sap-abap-auth` CLI tool (part of `@mcp-abap-adt/connection` package).

## Examples

### JWT Authentication (with automatic refresh)

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://5bff2ab7-3ad1-48e3-8980-53a354a1b276.abap.us10.hana.ondemand.com",
      "x-sap-auth-type": "jwt",
      "x-sap-jwt-token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
      "x-sap-refresh-token": "refresh_token_value_here"
    }
  }
}
```

### Basic Authentication

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-url": "https://your-onpremise-system.com:8000",
      "x-sap-auth-type": "basic",
      "x-sap-login": "your_username",
      "x-sap-password": "your_password"
    }
  }
}
```

**Note:** For basic authentication, you can pass username and password via HTTP headers (as shown above) or configure them in the server's `.env` file. Headers take priority over `.env` values:

```env
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
SAP_CLIENT=100
```

### Destination-Based Authentication (HTTP Transport Only)

> **Note:** This feature is only available for **HTTP/streamable-http** transport. For **stdio** and **SSE** transports, use `.env` file configuration instead.

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "x-sap-destination": "TRIAL"
    }
  }
}
```

In this case, the server will:
1. Look for `TRIAL.json` service key in `~/.config/mcp-abap-adt/service-keys/` (Unix) or `%USERPROFILE%\Documents\mcp-abap-adt\service-keys\` (Windows)
2. Check for existing session in `TRIAL.env` file
3. If no valid session exists, open browser for authentication
4. Save tokens to `TRIAL.env` for future use

### Minimal Configuration (using .env)

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http"
  }
}
```

In this case, the server will use configuration from `.env` file.

## Related Documentation

- [Installation Guide](../installation/INSTALLATION.md)
- [Stateful Session Guide](../architecture/STATEFUL_SESSION_GUIDE.md)
- [Server README](../README.md)
