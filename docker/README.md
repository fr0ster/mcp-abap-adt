# Docker

Container files for the server. Both commands are in every image: `mcp-abap-adt` (full,
`@mcp-abap-adt/core`) and `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`). The full guide is
[docs/deployment/DOCKER.md](../docs/deployment/DOCKER.md); this page lists what is here.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Two stages from the checkout: build and pack the five packages, then install the tarballs with `npm install -g`. Default command: `mcp-abap-adt --allow-destination-header`, HTTP on `0.0.0.0:3000`. |
| `docker-compose.yml` | Runs that image with `AUTH_BROKER_PATH=/app` and `./service-keys` mounted read-only. |
| `docker-compose.headerless.yml` | The same image with no destinations: every request carries `x-sap-url` and its credential in headers. |
| `Dockerfile.package` | Installs the tarballs in `packages/` (e.g. the published `core`, `npm run docker:pack`). Default command: `--transport=stdio`, inspection-only. |
| `docker-compose.package.yml` | Runs that image over HTTP. See [README.package.md](README.package.md). |
| `Dockerfile.inspect`, `docker-compose.inspect.yml` | The published `core` behind `mcp-proxy`, no destination: for MCP inspection (Glama). Not for deployment. |

Not in git: `packages/` (tarballs), `service-keys/` (`<destination>.json`), `sessions/`.

## Quick start

```bash
# from the repository root
mkdir -p docker/service-keys
cp /path/to/service-key.json docker/service-keys/<destination>.json
npm run docker:build
npm run docker:up
curl http://localhost:3000/mcp/health
```

## In a container

- **HTTP only.** The images carry no SAP NW RFC SDK and no compiler, and install with
  `--omit=optional`: RFC and SNC are not available. See
  [docs/installation/RFC_SETUP.md](../docs/installation/RFC_SETUP.md) for what an RFC image would need.
- **TLS** settings are container environment variables (`environment:` in the compose file), not lines
  in a destination `.env`: `NODE_EXTRA_CA_CERTS=<path to a mounted CA file>` to trust a CA,
  `TLS_REJECT_UNAUTHORIZED=0` to switch verification off (diagnosis only).
- **Browser login** needs a browser and the callback port `61001`, which a container lacks. Log in
  outside, or send `x-sap-url` with `x-sap-jwt-token` (or `x-sap-login` + `x-sap-password`) per request.
- **Health** is `GET /mcp/health`.
- **Sessions** stay in memory unless the command has `--unsafe`; then mount `./sessions:/app/sessions`
  writable.
