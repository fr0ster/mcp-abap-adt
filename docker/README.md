# Docker

Container files for the server. One image per server variant: the Dockerfile's build argument
`VARIANT` (the package's name without its scope — `core`, `compact`, `core-ro`, `compact-ro`,
`http`, `compact-http`, `http-ro`, `compact-http-ro`, `sse`, `compact-sse`, `sse-ro`,
`compact-sse-ro`) chooses the package, and the image runs its binary. The images install the
**published package from npm** — nothing of the repository is built or copied into them — and are
not published anywhere: build the one you need. The full guide is
[docs/deployment/DOCKER.md](../docs/deployment/DOCKER.md); this page lists what is here.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Installs `@mcp-abap-adt/<VARIANT>` alone (with its dependencies) into `/opt/mcp-abap-adt`, copies it into a clean runtime image, and runs the variant's binary as the entrypoint. Build arguments `VARIANT` (default `core`), `MCP_ABAP_ADT_VERSION` (the variant package's version, default `latest`), `PACKAGE_SOURCE` (`registry`, or `tarballs` with the build context `tarballs` — CI). Streamable HTTP images listen on `0.0.0.0:3000`, SSE images on `0.0.0.0:3001`, each with a `HEALTHCHECK` on `/mcp/health`; stdio images set `AUTH_BROKER_PATH=/app` and run with `docker run -i`. |
| `docker-compose.yml` | A service per variant, named as the `VARIANT`, each in a profile of its own name: `docker compose up -d http`, `docker compose run --rm -T core --mcp=<name>`. stdio services mount `./service-keys` read-only and `./sessions`. |
| `Dockerfile.inspect`, `docker-compose.inspect.yml` | The published `core` behind `mcp-proxy`, no destination: for MCP inspection (Glama). Not for deployment. |
| `.env.example` | Compose variables: `MCP_ABAP_ADT_VERSION`, `SAP_SYSTEM_TYPE`. Copy to `.env`. |
| `.dockerignore` | The build context is this directory; only the Dockerfiles are sent. |

Not in git: `service-keys/` (`<destination>.json`), `sessions/`, `.env`.

## Quick start

```bash
# Streamable HTTP — credentials in each request's x-sap-* headers
docker build --build-arg VARIANT=http -t mcp-abap-adt-http docker
docker run -d -p 127.0.0.1:3000:3000 -e SAP_SYSTEM_TYPE=onprem mcp-abap-adt-http
curl http://localhost:3000/mcp/health

# stdio — a named destination
docker build --build-arg VARIANT=core -t mcp-abap-adt-core docker
docker run -i --rm -v "$PWD/service-keys:/app/service-keys:ro" -v "$PWD/sessions:/app/sessions" \
  -e SAP_SYSTEM_TYPE=onprem mcp-abap-adt-core --mcp=<destination>
```

## In a container

- **The system type** is required and set by no image: `-e SAP_SYSTEM_TYPE=onprem|cloud|legacy` (or
  `--system-type=…`). Without it a listener does not start, and a stdio destination does not either.
- **HTTP only.** The image carries no SAP NW RFC SDK and no compiler, and installs with
  `--omit=optional`: RFC and SNC are not available. See
  [docs/installation/RFC_SETUP.md](../docs/installation/RFC_SETUP.md) for what an RFC image would need.
- **TLS** settings are container environment variables, not lines in a destination `.env`:
  `NODE_EXTRA_CA_CERTS=<path to a mounted CA file>` to trust a CA, `TLS_REJECT_UNAUTHORIZED=0` to
  switch verification off (diagnosis only).
- **Browser login** (stdio) needs a browser and the callback port `61001`, which a container lacks.
  Log in outside, or run a Streamable HTTP or SSE image and send `x-sap-url` with `x-sap-jwt-token`
  (or `x-sap-login` + `x-sap-password`) per request.
- **Sessions** (stdio) stay in memory unless the command has `--unsafe`; then the `sessions` mount must
  be writable. Create `service-keys/` and `sessions/` before the first run.

## Checking the images

`node scripts/ci/check-images.mjs --tarballs <directory of npm pack tarballs>` (from the repository
root) builds every variant from the checkout's tarballs and checks it — `--version`, a `tools/list`,
for HTTP and SSE the health endpoint, the `HEALTHCHECK` and a `tools/call` against an ADT stand-in,
and that a `-ro` image lists no write tool. CI runs it; see
[docs/deployment/GITHUB_ACTIONS.md](../docs/deployment/GITHUB_ACTIONS.md).
