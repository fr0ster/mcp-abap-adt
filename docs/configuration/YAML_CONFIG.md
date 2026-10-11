# YAML Configuration File

Each binary of the MCP ABAP ADT server reads a YAML configuration file of its own (`--conf`):
`mcp-abap-adt` (stdio), `mcp-abap-adt-http` (Streamable HTTP) and `mcp-abap-adt-sse` (SSE). The
file holds only that binary's parameters — its template is written from the binary's table, and
its validation is the table's: a key of another binary is refused naming the binary that serves
it (18.0.0, D38, D39).

## Quick Start

1. **Generate a template** — the binary you will run writes its own:
   ```bash
   mcp-abap-adt --conf=config.yaml         # stdio: the destination and login keys
   mcp-abap-adt-http --conf=http.yaml      # Streamable HTTP: the http: keys
   mcp-abap-adt-sse --conf=sse.yaml        # SSE: the sse: keys
   ```
   If the file doesn't exist, the template is written there and the start ends.

2. **Edit the template:** fill in your configuration values.

3. **Run with config:**
   ```bash
   mcp-abap-adt --conf=config.yaml
   ```

## Command-Line Override

Command-line arguments and the environment **override** YAML values (CLI, then environment, then
YAML). Keep **configuration** in YAML. **Secrets and the session do not belong there** — see
[Configuration only](#configuration-only-no-secrets).

```bash
mcp-abap-adt-http --conf=http.yaml --port=8080
```

## Keys of every binary

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exposition` | string or string[] | `readonly,high` | Tool sets: `readonly`, `high`, `low`, `debug` (compact: `ro` / `rw`, `debug` beside either) |
| `system-type` | string | tools: `cloud`; connector: `cloud` for a `jwt`, else `onprem` | `onprem`, `cloud` or `legacy`; never guessed from the URL |
| `state-idle-minutes` | number | `30` | See [Held State](#held-state) |

`transport` is gone: the key, with any value, stops every binary naming the binary to run.

## `mcp-abap-adt` (stdio)

```yaml
# Default destination: service-keys/<name>.json + sessions/<name>.env
mcp: TRIAL
# Or one env file: by destination name (sessions/<name>.env) or by path
# env: trial
# env-path: .env
connection-type: http          # http (default) | rfc
system-type: cloud             # onprem | cloud | legacy
unsafe: false                  # write named destinations' sessions to disk
# auth-broker-path: ~/custom/path
browser: system                # system | auto | chrome | edge | firefox | none | headless
# browser-program: /opt/browsers/my-browser   (excludes browser)
renewal: refresh-then-login    # refresh-then-login | refresh-only
browser-auth-port: 61001
exposition: readonly,high
state-idle-minutes: 30
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mcp` | string | - | Default destination name: `service-keys/<name>.json` and `sessions/<name>.env`, field by field |
| `env` | string | - | Destination name resolved from the sessions store (`sessions/<name>.env`) |
| `env-path` | string | - | Explicit path to `.env` file. Nothing is looked up in the working directory: a `.env` there is read only when named (`env-path: ./.env`) |
| `connection-type` | string | `http` | SAP connection transport: `http` (default) or `rfc` |
| `unsafe` | boolean | `false` | Write named destinations' sessions to disk instead of keeping them in memory |
| `auth-broker-path` | string | - | Base directory of `service-keys/` and `sessions/` |
| `browser` | string | `system` | Browser for a login: `system`, `auto`, `chrome`, `edge`, `firefox`, `none`, `headless` (mapped by the platform; excludes `browser-program`) |
| `browser-program` | string | — | The program that opens the login URL (excludes `browser`) |
| `renewal` | string | `refresh-then-login` | `refresh-then-login` or `refresh-only` (never a login) |
| `browser-auth-port` | number | `61001` | Login callback port, 1-65535 |

Refused in `mcp-abap-adt`'s file: `http` (Streamable HTTP is `mcp-abap-adt-http`'s), `sse`
(`mcp-abap-adt-sse`'s), `allow-destination-header` (gone: there is no destination header),
`transport`, and 16.0.0's `auth-broker`.

## `mcp-abap-adt-http` (Streamable HTTP)

```yaml
http:
  host: 127.0.0.1            # 0.0.0.0 for every interface
  port: 3000
  json-response: false
  allowed-hosts: []          # DNS-rebinding protection: exact Host values incl. port, e.g. ["localhost:3000"]
  allowed-origins: []        # DNS-rebinding protection: exact Origin values incl. scheme
  enable-dns-protection: false
  tls:
    cert: /path/to/server.crt   # cert and key together start HTTPS
    key: /path/to/server.key
    # ca: /path/to/ca.crt
exposition: readonly,high
state-idle-minutes: 30
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `http.host` | string | `127.0.0.1` | Host to listen on |
| `http.port` | number | `3000` | Port to listen on |
| `http.json-response` | boolean | `false` | JSON responses rather than SSE streams |
| `http.allowed-hosts` | string[] | - | DNS-rebinding protection: exact Host header values to allow, including port. NOT browser CORS — no Access-Control-Allow-Origin headers are emitted |
| `http.allowed-origins` | string[] | - | DNS-rebinding protection: exact Origin header values to allow, including scheme |
| `http.enable-dns-protection` | boolean | `false` | Enable Host/Origin allowlist validation (needs at least one list set); a non-allowlisted Host/Origin gets HTTP 403 |
| `http.tls.cert`, `http.tls.key`, `http.tls.ca` | string | - | TLS files (PEM); cert and key together, the CA optional beside them |

Refused in `mcp-abap-adt-http`'s file: the destination and login keys (`mcp`, `env`, `env-path`,
`auth-broker-path`, `allow-destination-header`, `unsafe`, `connection-type`, `browser`,
`browser-program`, `browser-auth-port`, `login-timeout`, `renewal`, `auth-debug`: "destinations
and logins are served only by mcp-abap-adt (stdio); send x-sap-* headers"), `sse`, and
`transport`.

## `mcp-abap-adt-sse` (HTTP + SSE)

```yaml
sse:
  host: 127.0.0.1
  port: 3001
  allowed-hosts: []
  allowed-origins: []
  enable-dns-protection: false
  tls:
    cert: /path/to/server.crt
    key: /path/to/server.key
exposition: readonly,high
state-idle-minutes: 30
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sse.host` | string | `127.0.0.1` | Host to listen on |
| `sse.port` | number | `3001` | Port to listen on |
| `sse.allowed-hosts` | string[] | - | DNS-rebinding protection: exact Host header values to allow, including port |
| `sse.allowed-origins` | string[] | - | DNS-rebinding protection: exact Origin header values to allow, including scheme |
| `sse.enable-dns-protection` | boolean | `false` | Enable Host/Origin allowlist validation (needs at least one list set) |
| `sse.tls.cert`, `sse.tls.key`, `sse.tls.ca` | string | - | TLS files (PEM); cert and key together, the CA optional beside them |

The SSE and `POST` paths have no YAML key: `--sse-path`, `--post-path`. Refused in
`mcp-abap-adt-sse`'s file: the destination and login keys (as for `mcp-abap-adt-http`), `http`,
and `transport`.

## Held State

`state-idle-minutes` (also `--state-idle-minutes`, `MCP_STATE_IDLE_MINUTES`), in every binary's
file: held state (a debug session) ends after this many minutes without a tool call; a whole
number, at least 30 and at most 35791 (the longest a timer can hold); default 30. A call in
flight pauses it; a listener's own background re-poll does not count. On `mcp-abap-adt` it bounds
the stdio instance's state, on `mcp-abap-adt-http` each pooled instance's, on `mcp-abap-adt-sse`
each connection's.

## Validation

A value that is not valid (a port outside 1-65535, an unknown `connection-type`, `system-type` or
flag value, a `state-idle-minutes` under 30, over 35791 or not a whole number) is **refused at
startup**, naming the key, instead of being ignored — and so is a key of another binary, or
`transport`. A file that is not YAML is refused naming its line and column, never quoting it.

### Configuration only (no secrets)

`.env` files and environment variables hold secrets and the session; YAML holds configuration
only. The server **refuses a YAML key whose name looks like a secret or a session value** — a name
containing `password`, `passphrase`, `secret`, `token`, `cookie`, `refresh` or `credential`, at any
depth — and exits with an error that names the key (never a value). Put such values in the
destination's `.env` (see [Authentication & Destinations](../user-guide/AUTHENTICATION.md)).

## File Path Resolution

- **Relative paths**: Resolved relative to current working directory
- **Absolute paths**: Used as-is

## Error Handling

If the YAML file has syntax errors, invalid values, a key of another binary or a secret-looking
key, the error is written to stderr and the server exits with code 1.

## See Also

- [CLI Options](../user-guide/CLI_OPTIONS.md) - The options of each binary
- [Client Configuration](../user-guide/CLIENT_CONFIGURATION.md) - How to configure MCP clients
- [Installation Guide](../installation/INSTALLATION.md) - Server installation instructions
