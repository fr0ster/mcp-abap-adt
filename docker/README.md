# Docker

Container files for `@mcp-abap-adt/core` (the `mcp-abap-adt` server). The full guide is
[docs/deployment/DOCKER.md](../docs/deployment/DOCKER.md); this page lists what is here.

## Files

| File | Purpose |
|---|---|
| `Dockerfile.package` | Installs one `@mcp-abap-adt/core` tarball from `packages/` (`npm install --omit=dev`). Default command: `--transport stdio`, inspection-only. |
| `docker-compose.package.yml` | Runs that image over HTTP on port 3000 with `--mcp=<destination> --allow-destination-header`, `AUTH_BROKER_PATH=/app`, `./service-keys` mounted read-only. See [README.package.md](README.package.md). |
| `Dockerfile` | Multi-stage build from the checkout. Does not start in this release: it builds only `@mcp-abap-adt/lib` (`npm run build:fast`) and its command, `dist/server/launcher.js`, is not produced. |
| `docker-compose.yml` | Uses `Dockerfile`; same limitation. |
| `docker-compose.headerless.yml` | Uses `Dockerfile`; meant for per-request header auth with no service keys; same limitation. |
| `Dockerfile.inspect`, `docker-compose.inspect.yml` | Builds a fixed old commit under `mcp-proxy` for MCP inspection. Not for deployment. |

Not in git: `packages/` (the tarball), `service-keys/` (`<destination>.json`), `sessions/`.

## Quick start

```bash
# from the repository root
mkdir -p docker/packages
npm pack @mcp-abap-adt/core@<version> --pack-destination docker/packages
mkdir -p docker/service-keys
cp /path/to/service-key.json docker/service-keys/<destination>.json
# set --mcp=<destination> in docker-compose.package.yml's command
cd docker
docker compose -f docker-compose.package.yml up -d --build
curl http://localhost:3000/mcp/health
```

## In a container

- **HTTP only.** The images have no SAP NW RFC SDK and no compiler, so `@mcp-abap-adt/sap-rfc-lite`
  is not built: RFC and SNC are not available (the first RFC call is refused with
  `@mcp-abap-adt/sap-rfc-lite is not available`). See
  [docs/installation/RFC_SETUP.md](../docs/installation/RFC_SETUP.md) for what an RFC image would
  need.
- **TLS** settings are container environment variables (`environment:` in the compose file), not
  lines in a destination `.env`: `NODE_EXTRA_CA_CERTS=<path to a mounted CA file>` to trust a CA,
  `TLS_REJECT_UNAUTHORIZED=0` to switch verification off (diagnosis only).
- **Browser login** needs a browser and the callback port `61001`, which a container lacks. Log in
  outside, or send `x-sap-url` with `x-sap-jwt-token` (or `x-sap-login` + `x-sap-password`) per
  request.
- **Health** is `GET /mcp/health`. The compose files' `healthcheck` probes `/health`, so Docker
  reports the container unhealthy even when it serves.
- **Sessions** stay in memory unless the command has `--unsafe`; then mount `./sessions:/app/sessions`
  writable.
