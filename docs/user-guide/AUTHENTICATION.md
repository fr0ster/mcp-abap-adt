# Authentication & Destinations

The server supports multiple auth flows. The primary (and recommended) model is **destination-based authentication** using service keys.

## Destinations

A **destination** is simply the **filename** of a service key stored in the service-keys directory.

- Put service keys here:
  - Linux/macOS: `~/.config/mcp-abap-adt/service-keys`
  - Windows: `%USERPROFILE%\Documents\mcp-abap-adt\service-keys`
- The filename (without extension) becomes the destination name.

Example:

```
~/.config/mcp-abap-adt/service-keys/TRIAL.json
```

Use it like this:

```bash
mcp-abap-adt --transport=stdio --mcp=TRIAL
```

The server will load the matching service key and manage tokens automatically.
When `--mcp=<destination>` is specified, automatic fallback loading of local `./.env` is skipped.

## .env Authentication

You can also provide credentials via `.env`:

- In the current directory: `.env`
- By destination: `--env <destination>` (resolved to sessions `<destination>.env`)
- Or explicitly: `--env-path /path/to/.env`

This is useful for quick local testing or when you do not want to store service keys.

**.env comments rule:** only full-line comments are supported (lines that start with `#`).  
Inline comments are not parsed, so keep comments on separate lines.

### Generate .env from Service Key

```bash
npm install -g @mcp-abap-adt/connection
mcp-auth auth -k path/to/service-key.json
```

This writes JWT details to `.env`.

**Claude recommendation:** for Claude, prefer service keys in `service-keys` and use `--mcp=<destination>` instead of manual tokens.

If browser-based OAuth callback port is occupied, override it:

```bash
mcp-abap-adt --transport=http --mcp=TRIAL --browser-auth-port=5100
```

## HTTP/SSE Headers

For HTTP/SSE transports, you can supply auth per request using headers:

- JWT: `x-sap-url`, `x-sap-client`, `x-sap-auth-type=jwt`, `x-sap-jwt-token`
- Basic: `x-sap-url`, `x-sap-client`, `x-sap-login`, `x-sap-password`

Header-based auth is useful for proxy setups or dynamic routing.

## Related Docs

- Client setup: `docs/user-guide/CLIENT_CONFIGURATION.md`
- Service key example: `docs/installation/examples/SERVICE_KEY_SETUP.md`
- Server CLI options: `docs/user-guide/CLI_OPTIONS.md`
