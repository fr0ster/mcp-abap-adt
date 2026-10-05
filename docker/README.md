# Docker

Container files for the server. The images install the **published packages from npm** — nothing of the
repository is built or copied into them. Both commands are in the image: `mcp-abap-adt` (full,
`@mcp-abap-adt/core`) and `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`). The full guide is
[docs/deployment/DOCKER.md](../docs/deployment/DOCKER.md); this page lists what is here.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Two stages: install `core` and `compact` from npm into a prefix, copy it into a clean runtime image. Build argument `MCP_ABAP_ADT_VERSION` (default `latest`). Default command: `mcp-abap-adt --allow-destination-header`, HTTP on `0.0.0.0:3000`. |
| `docker-compose.yml` | Runs that image with `AUTH_BROKER_PATH=/app` and `./service-keys` mounted read-only. |
| `docker-compose.headerless.yml` | The same image with no destinations: every request carries `x-sap-url` and its credential in headers. |
| `Dockerfile.inspect`, `docker-compose.inspect.yml` | The published `core` behind `mcp-proxy`, no destination: for MCP inspection (Glama). Not for deployment. |
| `.env.example` | Compose variables: `MCP_ABAP_ADT_VERSION`, ports. Copy to `.env`. |
| `.dockerignore` | The build context is this directory; only the Dockerfiles are sent. |

Not in git: `service-keys/` (`<destination>.json`), `sessions/`, `.env`.

## Quick start

```bash
# from the repository root
mkdir -p docker/service-keys
cp /path/to/service-key.json docker/service-keys/<destination>.json
npm run docker:build        # MCP_ABAP_ADT_VERSION in docker/.env pins a version
npm run docker:up
curl http://localhost:3000/mcp/health
```

## In a container

- **HTTP only.** The image carries no SAP NW RFC SDK and no compiler, and installs with
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
