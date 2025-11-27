# Client Configuration Guide

This guide explains how to configure MCP clients to connect to the `mcp-abap-adt` server.

## Overview

The `mcp-abap-adt` server supports multiple transport modes:
- **stdio** - Standard input/output (default)
- **streamable-http** - HTTP-based transport with streaming support
- **sse** - Server-Sent Events transport

For HTTP-based transports (streamable-http and sse), you can configure SAP connection parameters via HTTP headers, allowing dynamic connection configuration per request.

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

\* Required when not using `.env` file configuration. If headers are not provided, the server will use configuration from `.env` file or environment variables.

**Notes:**
- For **JWT authentication**: `x-sap-url`, `x-sap-auth-type`, and `x-sap-jwt-token` are required. `x-sap-refresh-token` is optional for automatic token refresh.
- For **basic authentication**: `x-sap-url`, `x-sap-auth-type`, `x-sap-login`, and `x-sap-password` are required.
- For automatic token refresh, you only need `x-sap-refresh-token`. Client ID and Client Secret are **not needed** for refresh - they are only required for initial token generation via `sap-abap-auth` CLI tool (part of `@mcp-abap-adt/connection` package).


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

- [Installation Guide](./INSTALLATION.md)
- [Stateful Session Guide](./STATEFUL_SESSION_GUIDE.md)
- [Server README](../README.md)

