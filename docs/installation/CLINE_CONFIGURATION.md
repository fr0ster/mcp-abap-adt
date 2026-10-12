# Cline MCP Configuration

How to configure Cline to start or connect to the MCP ABAP ADT server. Which server and which connection
to choose: [Installation variants](INSTALLATION.md#installation-variants). Ready-made files:
[examples/](examples/README.md).

## Prerequisites

1. Install the server (Node.js 22 or 24):

   ```bash
   npm install -g @mcp-abap-adt/core        # full server, command mcp-abap-adt
   npm install -g @mcp-abap-adt/compact     # compact server, command mcp-abap-adt-compact
   ```

   Or run it without installing: `npx -y @mcp-abap-adt/core …`. For RFC and SNC, install **after** the
   SAP NW RFC SDK is in place — see [RFC Setup](RFC_SETUP.md).

2. Name the destination. The server reads a `.env` only when you name it — nothing is read from the
   working directory:
   - `--env-path=<file>` — any `.env` file;
   - `--env=<name>` — the sessions store file `<sessions>/<name>.env`
     (`~/.config/mcp-abap-adt/sessions/` on Unix, `%USERPROFILE%\Documents\mcp-abap-adt\sessions\` on Windows);
   - `--mcp=<destination>` — a service key and its session ([SERVICE_KEY_SETUP.md](examples/SERVICE_KEY_SETUP.md)).

   A `.env` for basic authentication:

   ```env
   SAP_URL=https://your-sap-system.example
   SAP_CLIENT=100
   SAP_AUTH_TYPE=basic
   SAP_USERNAME=<your ABAP user>
   SAP_PASSWORD=<your password>
   # or a JWT you hold:
   # SAP_AUTH_TYPE=jwt
   # SAP_GRANT_TYPE=none
   # SAP_JWT_TOKEN=<token>
   ```

   All authentications: [Authentication & Destinations](../user-guide/AUTHENTICATION.md).

## Configuration Files

Cline reads MCP server configurations from:
- **VS Code**: `.vscode/mcp.json` or global settings
- **Cursor**: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Windsurf**: `~/Library/Application Support/Windsurf/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

## Option 1: STDIO (Recommended for Cline)

Cline starts the server itself.

### Full server

With a `.env` file:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "type": "stdio",
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio", "--env-path=/path/to/<destination>.env"],
      "timeout": 60,
      "disabled": false
    }
  }
}
```

With a named destination: `"args": ["--transport=stdio", "--mcp=<destination>"]`. Add `--unsafe` to keep
its session on disk across restarts.

Without installing: `"command": "npx"`, `"args": ["-y", "@mcp-abap-adt/core", "--transport=stdio", "--env-path=/path/to/<destination>.env"]`.

### Compact server

The same arguments, the command `mcp-abap-adt-compact` (through npx:
`"args": ["-y", "-p", "@mcp-abap-adt/compact", "mcp-abap-adt-compact", …]`):

```json
{
  "mcpServers": {
    "mcp-abap-adt-compact": {
      "type": "stdio",
      "command": "mcp-abap-adt-compact",
      "args": ["--transport=stdio", "--env-path=/path/to/<destination>.env"],
      "timeout": 60,
      "disabled": false
    }
  }
}
```

### RFC and SNC

The same arguments; the `.env` states the connection. Process-level variables are not read from the
`.env` — they go in the `env` block. On Windows the SDK's `lib` directory must be on `PATH` when the
server runs:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "type": "stdio",
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio", "--env-path=C:/path/to/<destination>.env"],
      "env": {
        "PATH": "C:\\nwrfcsdk\\nwrfcsdk\\lib;<the rest of your PATH>"
      },
      "timeout": 60,
      "disabled": false
    }
  }
}
```

A `PATH` in `env` replaces the inherited one: keep the rest of it in the value. When the system number
cannot be derived from the `SAP_URL` port (`80NN` → `NN`), add `"SAP_SYSNR": "<NN>"` to the block.

The `.env` for SNC:

```env
SAP_URL=http://your-sap-system.example:8000
SAP_CLIENT=100
SAP_CONNECTION_TYPE=rfc
SAP_AUTH_TYPE=snc
SAP_SNC_PARTNERNAME=p:CN=<system>, O=<org>, C=<country>
SAP_RESPONSIBLE=<your ABAP user>
```

RFC with a user and password: `SAP_AUTH_TYPE=basic` with `SAP_USERNAME` and `SAP_PASSWORD`. The SDK,
the install order and the SNC options: [RFC Setup](RFC_SETUP.md).

### A company CA

An `https://` system whose certificate is self-signed or issued by a company CA is refused until Node.js
trusts that CA. The setting belongs to the process, so it goes in `env`:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "type": "stdio",
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio", "--env-path=/path/to/<destination>.env"],
      "env": {
        "NODE_EXTRA_CA_CERTS": "/path/to/company-ca.pem"
      },
      "timeout": 60,
      "disabled": false
    }
  }
}
```

See [HTTPS certificates](INSTALLATION.md#https-certificates).

## Option 2: HTTP (Streamable HTTP)

**Best for**: a server shared by several clients or running remotely.

### Step 1: Start the HTTP Server

```bash
mcp-abap-adt --transport=http --port=3000 --env-path=/path/to/<destination>.env
# or a named destination
mcp-abap-adt --transport=http --port=3000 --mcp=<destination>
```

`mcp-abap-adt-compact` and `npx -y @mcp-abap-adt/core` take the same arguments. Process-level variables
(`NODE_EXTRA_CA_CERTS`, on Windows `PATH` for RFC) belong in the environment of that terminal.

### Step 2: Configure Cline

**With the server's default destination**:

```json
{
  "mcpServers": {
    "mcp-abap-adt-http": {
      "type": "streamableHttp",
      "url": "http://localhost:3000/mcp/stream/http",
      "timeout": 60,
      "disabled": false
    }
  }
}
```

**A destination per request** — start the server with `--allow-destination-header` and add
`"headers": { "x-mcp-destination": "<destination>" }`.

**Direct auth** — a token you hold; the server does not renew it:

```json
{
  "mcpServers": {
    "mcp-abap-adt-direct": {
      "type": "streamableHttp",
      "url": "http://localhost:3000/mcp/stream/http",
      "headers": {
        "x-sap-url": "https://your-sap-system.example",
        "x-sap-jwt-token": "<token>"
      },
      "timeout": 60,
      "disabled": false
    }
  }
}
```

Without a default destination, every request must name one or carry `x-sap-url` with a credential. The
headers: [CLIENT_CONFIGURATION.md](../user-guide/CLIENT_CONFIGURATION.md).

## Option 3: SSE (Server-Sent Events)

```bash
mcp-abap-adt --transport=sse --port=3001 --env-path=/path/to/<destination>.env
```

```json
{
  "mcpServers": {
    "mcp-abap-adt-sse": {
      "type": "sse",
      "url": "http://localhost:3001/sse",
      "timeout": 60,
      "disabled": false
    }
  }
}
```

## Platform-Specific Notes

### macOS/Linux

Use absolute paths in `--env-path`. If Cline cannot find `mcp-abap-adt`, give the full path of the
command (`npm prefix -g` shows the directory; the command is in its `bin/`).

### Windows

Write paths with forward slashes (`C:/path/to/<destination>.env`) or escaped backslashes
(`C:\\path\\to\\<destination>.env`).

## Testing Connection

1. **Restart Cline** after updating the configuration.
2. **Check the available tools** — for example `ReadClass`, `ReadProgram`, `SearchObject`.
3. **Ask for a read**, for example the source of a class you know exists.

## Troubleshooting

### "Server not found" or "Connection failed"

1. Check that the command is installed: `mcp-abap-adt --version`.
2. Check that the `--env-path` path is absolute and the file exists — a missing file is refused at
   startup, naming the parameter and the path.
3. Run the same command in a terminal and read what it prints on stderr.

### "No tools available" or every call fails

1. Without `--mcp`, `--env` or `--env-path`, stdio starts in inspection-only mode: the tool list answers,
   a tool call needs a connection.
2. Check the credentials in the `.env`; a destination refused at startup names the fields it lacks.
3. For RFC: `npm ls -g @mcp-abap-adt/sap-rfc-lite` must show a version — see [RFC Setup](RFC_SETUP.md#troubleshooting).
4. Test stdio by hand:
   ```bash
   echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | mcp-abap-adt --transport=stdio --env-path=/path/to/<destination>.env
   ```

### Windows-specific issues

1. Check for `\r\n` line ending issues in the `.env` file.
2. Use PowerShell or CMD with UTF-8 encoding.

## Multiple Server Instances

One entry per system, each with its own destination:

```json
{
  "mcpServers": {
    "mcp-abap-dev": {
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio", "--env-path=/path/to/dev.env"],
      "disabled": false
    },
    "mcp-abap-prod": {
      "command": "mcp-abap-adt",
      "args": ["--transport=stdio", "--env-path=/path/to/prod.env"],
      "disabled": false
    }
  }
}
```

## Environment Variables

Instead of arguments the server takes environment variables:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_ENV_PATH": "/path/to/<destination>.env"
      },
      "disabled": false
    }
  }
}
```

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_TRANSPORT` | Transport type: stdio, http, sse | `stdio` |
| `MCP_ENV_PATH` | Path to a `.env` file (same as `--env-path`) | none |
| `MCP_HTTP_PORT` | HTTP server port | `3000` |
| `MCP_SSE_PORT` | SSE server port | `3001` |

Every option with its environment and YAML forms: [CLI_OPTIONS.md](../user-guide/CLI_OPTIONS.md).

## Security Notes

1. **Never commit** `.env` files with credentials to git.
2. **Use JWT authentication** for production environments.
3. **Enable DNS-rebinding protection** for HTTP/SSE servers exposed to network — use `--http-enable-dns-protection` with `--http-allowed-hosts` to restrict which Host headers are accepted. Example:
   ```bash
   mcp-abap-adt --transport=http --http-enable-dns-protection --http-allowed-hosts=localhost:3000
   ```
   This is Host/Origin allowlist validation, NOT browser CORS — no `Access-Control-Allow-Origin` headers are emitted. A non-allowlisted Host gets HTTP 403. The `--http-allowed-hosts` value must include the port (e.g. `localhost:3000`, not `localhost`).
4. **Use HTTPS** in production (configure reverse proxy).

## Next Steps

- [AVAILABLE_TOOLS.md](../user-guide/AVAILABLE_TOOLS.md) — all tools
- [CLIENT_CONFIGURATION.md](../user-guide/CLIENT_CONFIGURATION.md) — other clients and HTTP headers
- [examples/](examples/README.md) — ready-made configuration files
