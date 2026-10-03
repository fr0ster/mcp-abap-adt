# Terminology

This project uses a few terms in specific ways. If a term below is used differently in other tools, prefer the definitions here.

## Destination

A **destination** is a name for one SAP system and how to log on to it. Two kinds:

- **Named** (`--mcp=TRIAL`, or the `x-mcp-destination` header with `--allow-destination-header`): read field by field from `sessions/TRIAL.env` (wins) and `service-keys/TRIAL.json`, in the platform directories (`~/.config/mcp-abap-adt/` on Linux/macOS).
- **An env file** (`--env`, `--env-path`, `MCP_ENV_PATH`): one file that states everything. Nothing is looked up in the working directory; a `.env` there is read only when named (`--env-path=./.env`).

The server supports four authentications for a destination: basic, SNC, JWT with browser login, JWT you hold. See [Authentication & Destinations](AUTHENTICATION.md).

## Service Key

A JSON file downloaded from SAP BTP. The file name becomes the destination name. Two shapes are read: an **ABAP service key** (it carries the system's URL and a `uaa` object) and an **XSUAA key** (`url`, `clientid`, `clientsecret` at the root: the UAA, not the system). An XSUAA key needs `XSUAA_MCP_URL` in `sessions/<destination>.env` to say where the ABAP system is.

## Auth Broker

The component (`@mcp-abap-adt/auth-broker` 4) that builds the credential a destination states, keeps its token current and stores it. The server creates one per destination, on first use.

## Session

The secret part of a destination: the token and its refresh token (or cookies), with its expiry. Named destinations keep it in memory unless `--unsafe` is used; an env file you name is written back with a renewed token.

## SNC

Secure Network Communications: passwordless logon over RFC with the credential of an installed SNC product. The `.env` carries no user and no password; the ABAP user is found by the SNC name.

## Transport

The protocol used between MCP client and server:

- `stdio` — local process stdio
- `http` / `streamableHttp` — HTTP POST JSON endpoint
- `sse` — server-sent events + POST messages

## Headers vs .env

For HTTP/SSE, SAP connection can be provided per request using headers (`x-sap-url` with `x-sap-jwt-token`, or with `x-sap-login` and `x-sap-password`). For stdio, use `.env` or `--mcp` destinations.

