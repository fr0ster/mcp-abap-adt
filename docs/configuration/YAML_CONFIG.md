# YAML Configuration File

The MCP ABAP ADT server supports YAML configuration files to simplify server setup and testing. Instead of passing many command-line arguments, you can use a single YAML file to configure all startup parameters.

## Quick Start

1. **Generate a template:**
   ```bash
   mcp-abap-adt --conf=config.yaml
   ```
   If the file doesn't exist, a template will be automatically generated.

2. **Edit the template:**
   Open `config.yaml` and fill in your configuration values.

3. **Run with config:**
   ```bash
   mcp-abap-adt --conf=config.yaml
   ```

## Command-Line Override

Command-line arguments **always override** YAML values. This allows you to:
- Use YAML as base configuration
- Override specific values via command-line when needed
- Keep **configuration** in YAML. **Secrets and the session do not belong there** — see [Configuration only](#configuration-only-no-secrets)

Example:
```bash
# Use config.yaml but override the port
mcp-abap-adt --conf=config.yaml --port=8080
```

## Configuration File Structure

```yaml
# Transport type: stdio | http | streamable-http | sse
# Default: stdio (for MCP clients)
transport: stdio

# Default destination: service-keys/<name>.json + sessions/<name>.env
mcp: TRIAL

# Env destination name in sessions store (e.g. trial -> trial.env)
env: trial

# Explicit path to .env file (recommended for file-based config)
env-path: .env

# SAP connection type: http (default) or rfc
connection-type: http

# SAP system type: onprem | cloud | legacy
# (tools default to cloud; the connector to cloud for a jwt, else onprem)
system-type: cloud

# Write named destinations' sessions to disk (default: in memory)
unsafe: false

# Base directory of service-keys/ and sessions/
auth-broker-path: ~/custom/path

# Browser for a login: chrome | edge | firefox | system (default) | headless | none
browser: system

# Login callback port, 1-65535 (default 61001)
browser-auth-port: 61001

# Honour the x-mcp-destination header (HTTP/SSE only)
allow-destination-header: false

# Held state (a debug session) ends after this many minutes without a tool call
# (a whole number, at least 30; default 30)
state-idle-minutes: 30

# HTTP/StreamableHTTP transport options
http:
  port: 3000
  # Host binding: 127.0.0.1 (default, localhost only) or 0.0.0.0 (all interfaces)
  host: 127.0.0.1
  json-response: false
  allowed-hosts: []          # DNS-rebinding protection: exact Host values incl. port, e.g. ["localhost:3000"]
  allowed-origins: []        # DNS-rebinding protection: exact Origin values incl. scheme, e.g. ["https://app.example.com"]
  enable-dns-protection: false  # Enable Host/Origin allowlist validation (needs at least one list set)

# SSE (Server-Sent Events) transport options
sse:
  port: 3001
  # Host binding: 127.0.0.1 (default, localhost only) or 0.0.0.0 (all interfaces)
  host: 127.0.0.1
  allowed-hosts: []          # DNS-rebinding protection: exact Host values incl. port, e.g. ["localhost:3001"]
  allowed-origins: []        # DNS-rebinding protection: exact Origin values incl. scheme, e.g. ["https://app.example.com"]
  enable-dns-protection: false  # Enable Host/Origin allowlist validation (needs at least one list set)
```

## Configuration Options

### Top-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | string | `stdio` | Transport type: `stdio` (default, for MCP clients), `http`, `streamable-http`, or `sse` |
| `mcp` | string | - | Default destination name: `service-keys/<name>.json` and `sessions/<name>.env`, field by field |
| `env` | string | - | Destination name resolved from sessions store (`sessions/<name>.env`) |
| `env-path` | string | - | Explicit path to `.env` file. Nothing is looked up in the working directory: a `.env` there is read only when named (`env-path: ./.env`) |
| `connection-type` | string | `http` | SAP connection transport: `http` (default) or `rfc` |
| `system-type` | string | tools: `cloud`; connector: `cloud` for a `jwt`, else `onprem` | `onprem`, `cloud` or `legacy`; never guessed from the URL |
| `unsafe` | boolean | `false` | Write named destinations' sessions to disk instead of keeping them in memory |
| `auth-broker-path` | string | - | Base directory of `service-keys/` and `sessions/` |
| `browser` | string | `system` | Browser for a login: `chrome`, `edge`, `firefox`, `system`, `headless`, `none` |
| `browser-auth-port` | number | `61001` | Login callback port, 1-65535 |
| `allow-destination-header` | boolean | `false` | Honour the `x-mcp-destination` header (HTTP/SSE only) |
| `state-idle-minutes` | number | `30` | Held state (a debug session) ends after this many minutes without a tool call; a whole number, at least 30 and at most 35791 (the longest a timer can hold). A call in flight pauses it; a listener's own background re-poll does not count |

A value that is not valid (a port outside 1-65535, an unknown `connection-type`, `system-type` or flag value, a `state-idle-minutes` under 30, over 35791 or not a whole number) is **refused at startup**, naming the key, instead of being ignored.

### Configuration only (no secrets)

`.env` files and environment variables hold secrets and the session; YAML holds configuration only. The server **refuses a YAML key whose name looks like a secret or a session value** — a name containing `password`, `passphrase`, `secret`, `token`, `cookie`, `refresh` or `credential`, at any depth — and exits with an error that names the key (never a value). Put such values in the destination's `.env` (see [Authentication & Destinations](../user-guide/AUTHENTICATION.md)).

Each parameter above also has a CLI form and, for nine of them, an environment variable; precedence is CLI, then environment, then YAML. See [CLI Options](../user-guide/CLI_OPTIONS.md).

### HTTP Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `http.port` | number | `3000` | HTTP server port |
| `http.host` | string | `127.0.0.1` | HTTP server host (`127.0.0.1`/`localhost` for local only, `0.0.0.0` for all interfaces) |
| `http.json-response` | boolean | `false` | Enable JSON response format |
| `http.allowed-hosts` | string[] | `[]` | DNS-rebinding protection: exact Host header values to allow, including port (e.g. `localhost:3000`). NOT browser CORS — no Access-Control-Allow-Origin headers are emitted. |
| `http.allowed-origins` | string[] | `[]` | DNS-rebinding protection: exact Origin header values to allow, including scheme (e.g. `https://app.example.com`). |
| `http.enable-dns-protection` | boolean | `false` | Enable Host/Origin allowlist validation. Required for `allowed-hosts`/`allowed-origins` to take effect; needs at least one list set. Non-allowlisted Host/Origin → HTTP 403. |

### SSE Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sse.port` | number | `3001` | SSE server port |
| `sse.host` | string | `127.0.0.1` | SSE server host |
| `sse.allowed-hosts` | string[] | `[]` | DNS-rebinding protection: exact Host header values to allow, including port (e.g. `localhost:3001`). NOT browser CORS — no Access-Control-Allow-Origin headers are emitted. |
| `sse.allowed-origins` | string[] | `[]` | DNS-rebinding protection: exact Origin header values to allow, including scheme (e.g. `https://app.example.com`). |
| `sse.enable-dns-protection` | boolean | `false` | Enable Host/Origin allowlist validation. Required for `allowed-hosts`/`allowed-origins` to take effect; needs at least one list set. Non-allowlisted Host/Origin → HTTP 403. |

## Examples

### Example 1: stdio Mode with MCP Destination

```yaml
transport: stdio
mcp: TRIAL
```

Usage:
```bash
mcp-abap-adt --conf=config.yaml
```

### Example 2: HTTP Mode with Custom Port

```yaml
transport: http
http:
  port: 8080
  host: localhost
```

Usage:
```bash
mcp-abap-adt --conf=config.yaml
```

### Example 3: SSE Mode with Custom Host and Port

```yaml
transport: sse
sse:
  port: 3001
  host: 127.0.0.1
```

Usage:
```bash
mcp-abap-adt --conf=config.yaml
```

### Example 4: stdio Mode with .env File

```yaml
transport: stdio
env-path: .env
```

Usage:
```bash
mcp-abap-adt --conf=config.yaml
```

### Example 5: HTTP Mode with a Named Destination and a Login Port

```yaml
transport: http
mcp: PRODUCTION
auth-broker-path: ~/custom/auth-broker
browser-auth-port: 61005
allow-destination-header: true
http:
  port: 3000
```

Usage:
```bash
mcp-abap-adt --conf=config.yaml
```

### Example 6: RFC Connection

```yaml
transport: stdio
env-path: my-system.env
connection-type: rfc
```

Usage:
```bash
mcp-abap-adt --conf=config.yaml
```

## Testing Scenarios

YAML config files are especially useful for testing different scenarios:

### Test Config 1: stdio-stdio.yaml
```yaml
transport: stdio
mcp: TRIAL
```

### Test Config 2: stdio-env.yaml
```yaml
transport: stdio
env-path: .env
```

### Test Config 3: http-default.yaml
```yaml
transport: http
http:
  port: 3000
```

### Test Config 4: sse-default.yaml
```yaml
transport: sse
sse:
  port: 3001
```

Run tests with different configs:
```bash
mcp-abap-adt --conf=stdio-stdio.yaml
mcp-abap-adt --conf=stdio-env.yaml
mcp-abap-adt --conf=http-default.yaml
mcp-abap-adt --conf=sse-default.yaml
```

## Benefits

1. **Cleaner Command-Line**: No need to pass many arguments
2. **Easy Testing**: Create different YAML files for different test scenarios
3. **Version Control**: Configuration files can be committed to git (it holds no secrets; the server refuses them)
4. **Template Generation**: Automatic template generation helps understand available options
5. **Flexibility**: Command-line arguments still override YAML values

## Template Generation

When you specify `--conf=<path>` (or `--config=<path>`) and the file doesn't exist, a template is automatically generated with:
- All available options
- Default values
- Comments explaining each option
- Example configurations

Edit the template to customize your configuration.

## File Path Resolution

- **Relative paths**: Resolved relative to current working directory
- **Absolute paths**: Used as-is
- **Home directory**: Use `~` for home directory (e.g., `~/config.yaml`)

Examples:
```bash
# Relative path (resolved from current directory)
mcp-abap-adt --conf=config.yaml

# Absolute path
mcp-abap-adt --conf=/path/to/config.yaml

# Home directory
mcp-abap-adt --conf=~/config.yaml
```

## Error Handling

If the YAML file has syntax errors, invalid values or a secret-looking key:
- An error message is displayed
- The server exits with code 1
- Check the file syntax and try again

## See Also

- [CLI Options](user-guide/CLI_OPTIONS.md) - Complete list of command-line options
- [Client Configuration](user-guide/CLIENT_CONFIGURATION.md) - How to configure MCP clients
- [Installation Guide](installation/INSTALLATION.md) - Server installation instructions
