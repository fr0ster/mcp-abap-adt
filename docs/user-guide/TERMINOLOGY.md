# Terminology

This project uses a few terms in specific ways. If a term below is used differently in other tools, prefer the definitions here.

## Destination

A **destination** is the **filename** of a service key stored in the local `service-keys` directory. Example:

```
~/.config/mcp-abap-adt/service-keys/TRIAL.json
```

Use it with `--mcp=TRIAL` or the `x-mcp-destination` header.

## Service Key

A JSON file downloaded from SAP BTP (XSUAA credentials). The filename becomes the destination name. The server reads it to obtain service URL and OAuth details.

## Auth Broker

The internal component that loads service keys, manages sessions/tokens, and provides connection configs. When `--mcp` is used, auth-broker is enabled automatically.

## Session Store

Storage for OAuth sessions/tokens created by auth-broker. By default sessions are in-memory unless `--unsafe` or `--auth-broker-path` is used.

## Transport

The protocol used between MCP client and server:

- `stdio` — local process stdio
- `http` / `streamableHttp` — HTTP POST JSON endpoint
- `sse` — server-sent events + POST messages

## Headers vs .env

For HTTP/SSE, SAP connection can be provided per request using headers (e.g., `x-sap-url`, `x-sap-auth-type`, `x-sap-jwt-token`). For stdio, use `.env` or `--mcp` destinations.

