# YAML Configuration File

The MCP ABAP ADT server supports YAML configuration files to simplify server setup and testing. Instead of passing many command-line arguments, you can use a single YAML file to configure all startup parameters.

## Quick Start

1. **Generate a template:**
   ```bash
   mcp-abap-adt --config=config.yaml
   ```
   If the file doesn't exist, a template will be automatically generated.

2. **Edit the template:**
   Open `config.yaml` and fill in your configuration values.

3. **Run with config:**
   ```bash
   mcp-abap-adt --config=config.yaml
   ```

## Command-Line Override

Command-line arguments **always override** YAML values. This allows you to:
- Use YAML as base configuration
- Override specific values via command-line when needed
- Keep sensitive values in YAML (not in command history)

Example:
```bash
# Use config.yaml but override the port
mcp-abap-adt --config=config.yaml --http-port=8080
```

## Configuration File Structure

```yaml
# Transport type: stdio | http | streamable-http | sse
# Default: stdio (for MCP clients)
transport: stdio

# Default MCP destination (uses auth-broker)
mcp: TRIAL

# Path to .env file (alternative to mcp destination)
env: .env

# Use unsafe mode (file-based session store)
unsafe: false

# Force use of auth-broker
auth-broker: false

# Custom path for auth-broker storage
auth-broker-path: ~/custom/path

# HTTP/StreamableHTTP transport options
http:
  port: 3000
  # Host binding: 127.0.0.1 (default, localhost only, secure) or 0.0.0.0 (all interfaces, less secure)
  # When using 0.0.0.0, client must provide all connection headers - server won't use default destination
  host: 127.0.0.1
  json-response: false
  allowed-origins: []
  allowed-hosts: []
  enable-dns-protection: false

# SSE (Server-Sent Events) transport options
sse:
  port: 3001
  # Host binding: 127.0.0.1 (default, localhost only, secure) or 0.0.0.0 (all interfaces, less secure)
  # When using 0.0.0.0, client must provide all connection headers - server won't use default destination
  host: 127.0.0.1
  allowed-origins: []
  allowed-hosts: []
  enable-dns-protection: false
```

## Configuration Options

### Top-Level Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | string | `stdio` | Transport type: `stdio` (default, for MCP clients), `http`, `streamable-http`, or `sse` |
| `mcp` | string | - | Default MCP destination name (uses auth-broker) |
| `env` | string | - | Path to `.env` file (alternative to `mcp` destination) |
| `unsafe` | boolean | `false` | Use file-based session store (persists to disk) |
| `auth-broker` | boolean | `false` | Force use of auth-broker (service keys) instead of `.env` |
| `auth-broker-path` | string | - | Custom path for auth-broker storage |

### HTTP Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `http.port` | number | `3000` | HTTP server port |
| `http.host` | string | `0.0.0.0` | HTTP server host (`0.0.0.0` for all interfaces, `localhost` for local only) |
| `http.json-response` | boolean | `false` | Enable JSON response format |
| `http.allowed-origins` | array/string | `[]` | Allowed CORS origins (comma-separated string or array) |
| `http.allowed-hosts` | array/string | `[]` | Allowed hosts (comma-separated string or array) |
| `http.enable-dns-protection` | boolean | `false` | Enable DNS rebinding protection |

### SSE Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sse.port` | number | `3001` | SSE server port |
| `sse.host` | string | `0.0.0.0` | SSE server host |
| `sse.allowed-origins` | array/string | `[]` | Allowed CORS origins (comma-separated string or array) |
| `sse.allowed-hosts` | array/string | `[]` | Allowed hosts (comma-separated string or array) |
| `sse.enable-dns-protection` | boolean | `false` | Enable DNS rebinding protection |

## Examples

### Example 1: stdio Mode with MCP Destination

```yaml
transport: stdio
mcp: TRIAL
```

Usage:
```bash
mcp-abap-adt --config=config.yaml
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
mcp-abap-adt --config=config.yaml
```

### Example 3: SSE Mode with CORS

```yaml
transport: sse
sse:
  port: 3001
  allowed-origins:
    - http://localhost:3000
    - http://localhost:5173
```

Usage:
```bash
mcp-abap-adt --config=config.yaml
```

### Example 4: stdio Mode with .env File

```yaml
transport: stdio
env: .env
```

Usage:
```bash
mcp-abap-adt --config=config.yaml
```

### Example 5: HTTP Mode with Auth-Broker

```yaml
transport: http
mcp: PRODUCTION
auth-broker: true
auth-broker-path: ~/custom/auth-broker
http:
  port: 3000
```

Usage:
```bash
mcp-abap-adt --config=config.yaml
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
env: .env
```

### Test Config 3: http-default.yaml
```yaml
transport: http
http:
  port: 3000
```

### Test Config 4: sse-cors.yaml
```yaml
transport: sse
sse:
  port: 3001
  allowed-origins:
    - http://localhost:3000
```

Run tests with different configs:
```bash
mcp-abap-adt --config=stdio-stdio.yaml
mcp-abap-adt --config=stdio-env.yaml
mcp-abap-adt --config=http-default.yaml
mcp-abap-adt --config=sse-cors.yaml
```

## Benefits

1. **Cleaner Command-Line**: No need to pass many arguments
2. **Easy Testing**: Create different YAML files for different test scenarios
3. **Version Control**: Configuration files can be committed to git (exclude sensitive data)
4. **Template Generation**: Automatic template generation helps understand available options
5. **Flexibility**: Command-line arguments still override YAML values

## Template Generation

When you specify `--config=<path>` and the file doesn't exist, a template is automatically generated with:
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
mcp-abap-adt --config=config.yaml

# Absolute path
mcp-abap-adt --config=/path/to/config.yaml

# Home directory
mcp-abap-adt --config=~/config.yaml
```

## Error Handling

If the YAML file has syntax errors or invalid values:
- An error message is displayed
- The server exits with code 1
- Check the file syntax and try again

## See Also

- [CLI Options](user-guide/CLI_OPTIONS.md) - Complete list of command-line options
- [Client Configuration](user-guide/CLIENT_CONFIGURATION.md) - How to configure MCP clients
- [Installation Guide](installation/INSTALLATION.md) - Server installation instructions

