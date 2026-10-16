# Cline Configuration Examples

Client configuration files for the MCP ABAP ADT server. Which server and which connection to choose:
[Installation variants](../INSTALLATION.md#installation-variants). Every file here uses placeholders —
replace `<destination>`, the paths and the URLs with your own.

Install the server first (Node.js 22 or 24):

```bash
npm install -g @mcp-abap-adt/core        # full server, command mcp-abap-adt
npm install -g @mcp-abap-adt/compact     # compact server, command mcp-abap-adt-compact
```

or run it without installing: `npx -y @mcp-abap-adt/core …`.

The server reads a `.env` only when you name it: `--env-path=<file>` (any path), `--env=<name>` (the
sessions store file `<sessions>/<name>.env`), or `--mcp=<destination>` (a service key and its session).
Nothing is read from the working directory.

## Files

| File | Variant |
|---|---|
| `cline-stdio-global-config.json` | Full server, stdio, installed command, one `.env` (`--env-path`) |
| `cline-stdio-npx-config.json` | The same through `npx -y @mcp-abap-adt/core` |
| `cline-stdio-destination-config.json` | Full server, stdio, a named destination (`--mcp=<destination>`) |
| `cline-stdio-compact-config.json` | Compact server (`mcp-abap-adt-compact`), same arguments |
| `cline-stdio-snc-config.json` | RFC / SNC on Windows: the SDK's `lib` directory on `PATH` |
| `cline-stdio-ca-config.json` | A system whose certificate a company CA issued: `NODE_EXTRA_CA_CERTS` |
| `cline-http-config.json` | Client of `mcp-abap-adt-http`, its credentials in `x-sap-*` headers |
| `cline-sse-config.json` | Client of `mcp-abap-adt-sse`, its credentials in the opening request's `x-sap-*` headers |

## 1. Full server over HTTP (stdio)

With one `.env` file:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--env-path=/path/to/<destination>.env", "--system-type=<onprem|cloud>"],
      "disabled": false
    }
  }
}
```

With a named destination (`service-keys/<destination>.json` and `sessions/<destination>.env`, see
[SERVICE_KEY_SETUP.md](SERVICE_KEY_SETUP.md)): replace the `--env-path` argument with `--mcp=<destination>`
and state the system type beside it, `--system-type=<onprem|cloud>` — required since 19.0.0, and a
named destination's session `.env` is not read for it (`cline-stdio-destination-config.json`).
Without a global install, use `"command": "npx"` and put `"-y", "@mcp-abap-adt/core"` before the
other arguments.

A `.env` for basic authentication:

```env
SAP_URL=https://your-sap-system.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=<your ABAP user>
SAP_PASSWORD=<your password>
SAP_SYSTEM_TYPE=onprem
```

A token you hold is not served over stdio: send it in the `x-sap-jwt-token` header to `mcp-abap-adt-http` or `mcp-abap-adt-sse`, or create the session with `mcp-auth`. All
authentications: [Authentication & Destinations](../../user-guide/AUTHENTICATION.md).

## 2. Compact server

The same arguments and `.env`, the command `mcp-abap-adt-compact`:

```json
{
  "mcpServers": {
    "mcp-abap-adt-compact": {
      "command": "mcp-abap-adt-compact",
      "args": ["--env-path=/path/to/<destination>.env", "--system-type=<onprem|cloud>"],
      "disabled": false
    }
  }
}
```

Through npx: `"command": "npx"`, `"args": ["-y", "-p", "@mcp-abap-adt/compact", "mcp-abap-adt-compact", "--env-path=…", "--system-type=<onprem|cloud>"]`.

## 3. RFC and SNC

The same arguments. Process-level variables go in the client's `env` block — the server does not read
them from the `.env`. On Windows the SDK's `lib` directory must be on `PATH` when the server runs:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--env-path=C:/path/to/<destination>.env", "--system-type=<onprem|cloud>"],
      "env": {
        "PATH": "C:\\nwrfcsdk\\nwrfcsdk\\lib;<the rest of your PATH>"
      },
      "disabled": false
    }
  }
}
```

A `PATH` in the `env` block replaces the inherited one, so keep the rest of it (Node.js among it) in the
value. If the system number cannot be derived from the `SAP_URL` port (`80NN` → `NN`), add
`"SAP_SYSNR": "<NN>"` to the same block.

The `.env` for SNC (no user, no password):

```env
SAP_URL=http://your-sap-system.example:8000
SAP_CLIENT=100
SAP_CONNECTION_TYPE=rfc
SAP_AUTH_TYPE=snc
SAP_SNC_PARTNERNAME=p:CN=<system>, O=<org>, C=<country>
SAP_RESPONSIBLE=<your ABAP user>
SAP_SYSTEM_TYPE=onprem
```

For RFC with a user and password, use `SAP_AUTH_TYPE=basic` with `SAP_USERNAME` and `SAP_PASSWORD`
instead of the SNC keys. Through a message server and a logon group, add `SAP_MSHOST` with
`SAP_MSSERV` or `SAP_SYSID`, and optionally `SAP_GROUP` and `SAP_SAPROUTER`: then the system number
comes from neither the port nor `SAP_SYSNR`. The SDK, the install order, the SNC options and the
message server: [RFC Setup](../RFC_SETUP.md).

## 4. A company CA

An `https://` system whose certificate is self-signed or issued by a company CA is refused until Node.js
trusts that CA. Name the PEM file in the client's `env` block:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "mcp-abap-adt",
      "args": ["--env-path=/path/to/<destination>.env", "--system-type=<onprem|cloud>"],
      "env": {
        "NODE_EXTRA_CA_CERTS": "/path/to/company-ca.pem"
      },
      "disabled": false
    }
  }
}
```

A destination's `.env` is not read for it. See [HTTPS certificates](../INSTALLATION.md#https-certificates).

## HTTP and SSE transports

The server runs on its own; the client only connects. Start it in a terminal (process-level variables
such as `NODE_EXTRA_CA_CERTS` belong in that terminal's environment):

```bash
# Streamable HTTP (@mcp-abap-adt/http): http://localhost:3000/mcp/stream/http
mcp-abap-adt-http --port=3000 --system-type=onprem

# SSE (@mcp-abap-adt/sse): http://localhost:3001/sse
mcp-abap-adt-sse --sse-port=3001 --system-type=onprem
```

The system type (`onprem`, `cloud` or `legacy`) is the process's parameter — `--system-type`,
`SAP_SYSTEM_TYPE` or YAML `system-type`; no header states it, and without it neither binary starts.

Neither takes a destination: each request (Streamable HTTP), or the `GET` that opens each SSE
connection, carries its credential in `x-sap-*` headers. Then use `cline-http-config.json` or
`cline-sse-config.json`. A request carrying `x-mcp-destination` is answered `400`: destinations, service
keys and the browser login are served only by `mcp-abap-adt` (stdio).

**First-time authentication** of a service-key destination (`mcp-abap-adt --mcp=<destination> --system-type=cloud`, stdio): the browser opens for the login at the
server's start, before the client sees its tools (callback port `61001`). The token is kept in memory, or saved to `sessions/<destination>.env` with `--unsafe`.

## More Info

- [CLINE_CONFIGURATION.md](../CLINE_CONFIGURATION.md) — Cline in detail
- [CLIENT_CONFIGURATION.md](../../user-guide/CLIENT_CONFIGURATION.md) — headers and destinations over HTTP
- [CLI_OPTIONS.md](../../user-guide/CLI_OPTIONS.md) — every option
