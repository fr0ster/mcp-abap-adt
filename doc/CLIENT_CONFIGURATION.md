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

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `x-sap-url` | Yes* | SAP system URL | `https://system.abap.us10.hana.ondemand.com` |
| `x-sap-auth-type` | Yes* | Authentication type | `jwt` or `basic` |
| `x-sap-jwt-token` | Yes* (for JWT) | JWT access token | `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `x-sap-refresh-token` | No | Refresh token for automatic token renewal | `refresh_token_string` |
| `Authorization` | Alternative | Bearer token (alternative to `x-sap-jwt-token`) | `Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...` |

\* Required when not using `.env` file configuration. If headers are not provided, the server will use configuration from `.env` file or environment variables.

### Alternative: Authorization Header

Instead of `x-sap-jwt-token`, you can use the standard `Authorization` header:

```json
{
  "local-mcp-http": {
    "disabled": false,
    "timeout": 60,
    "type": "streamableHttp",
    "url": "http://localhost:3000/mcp/stream/http",
    "headers": {
      "Authorization": "Bearer your_jwt_token_here",
      "x-sap-url": "https://your-sap-system.abap.us10.hana.ondemand.com",
      "x-sap-auth-type": "jwt",
      "x-sap-refresh-token": "your_refresh_token_here"
    }
  }
}
```

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
      "x-sap-url": "https://your-onpremise-system.com",
      "x-sap-auth-type": "basic"
    }
  }
}
```

**Note:** For basic authentication, username and password should be configured in the server's `.env` file or environment variables (`SAP_USERNAME`, `SAP_PASSWORD`), as they are not passed via HTTP headers for security reasons.

## Server Configuration

The server can be started in HTTP mode with:

```bash
npm run start:http
# or
node dist/index.js --transport streamable-http --http-port 3000
```

### Environment Variables

Alternatively, you can configure the server via environment variables in a `.env` file:

```env
SAP_URL=https://your-sap-system.abap.us10.hana.ondemand.com
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your_jwt_token_here
SAP_REFRESH_TOKEN=your_refresh_token_here
SAP_UAA_URL=https://your-uaa-url
SAP_UAA_CLIENT_ID=your_client_id
SAP_UAA_CLIENT_SECRET=your_client_secret
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

## Security Considerations

1. **Token Storage**: Never commit tokens to version control. Use environment variables or secure secret management.
2. **HTTPS**: Always use HTTPS for production deployments.
3. **Token Refresh**: Use refresh tokens to automatically renew expired JWT tokens without manual intervention.
4. **Header Validation**: The server validates header values but does not enforce HTTPS. Ensure your deployment uses HTTPS.

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

If you provide `x-sap-refresh-token` along with UAA credentials in the server's `.env` file, the connection will automatically refresh expired tokens. The refresh happens transparently when a 401/403 error is detected.

## Examples

### Complete JWT Configuration

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

