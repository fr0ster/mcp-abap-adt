# Docker Deployment Guide

How to run `@mcp-abap-adt/core` (the `mcp-abap-adt` server) in a container, with the files in
[`docker/`](../../docker/). The image serves the full tool set; there is no image for
`@mcp-abap-adt/compact`.

## What works in a container

| | In the images of `docker/` |
|---|---|
| HTTP connection (`SAP_CONNECTION_TYPE=http`) | Yes |
| HTTPS with your own CA, or without verification | Yes — container environment variables, see [TLS](#tls) |
| RFC connection, SNC | **No** — see [RFC and SNC](#rfc-and-snc) |
| Browser login (`jwt` / `authorization_code`) | Not inside the container — see [Login](#login) |
| Basic auth, a token you hold | Yes — in a destination or per request in headers |

## The images

| File | What it is |
|---|---|
| `docker/Dockerfile.package` + `docker-compose.package.yml` | Installs a `@mcp-abap-adt/core` tarball from `docker/packages/`. **The one to use.** |
| `docker/Dockerfile` + `docker-compose.yml`, `docker-compose.headerless.yml` | Builds from the checkout. **Does not start in this release**: it builds only `@mcp-abap-adt/lib` (`npm run build:fast`), and its command, `dist/server/launcher.js`, is not produced by that build. |
| `docker/Dockerfile.inspect` + `docker-compose.inspect.yml` | Builds a fixed old commit for MCP inspection (a Glama-style image). Not for deployment. |

All images are `node:22-bookworm-slim` (the inspect image: Debian with Node 24).

## Quick start (package image)

Run from the repository root.

1. **Put exactly one `core` tarball in `docker/packages/`** — the published one:
   ```bash
   mkdir -p docker/packages
   npm pack @mcp-abap-adt/core@<version> --pack-destination docker/packages
   ```
   or one built from the checkout (`npm run build`, then
   `npm pack ./server --pack-destination docker/packages`). The image runs
   `npm install --omit=dev` on it, so its `@mcp-abap-adt/lib` range must be on npm. With two
   `.tgz` files in the directory the build fails.

2. **Put the service key** of each destination in `docker/service-keys/<destination>.json`
   (mounted read-only at `/app/service-keys`; `AUTH_BROKER_PATH=/app` in the compose file makes
   the server read it there).

3. **Choose the destination in the compose `command`**. The server reads no environment variable
   for it:
   - `--mcp=<destination>` — the container's own default destination;
   - `--allow-destination-header` — a client names it per request with `x-mcp-destination`.

   `docker-compose.package.yml` ships with both (and `--transport http`); replace the name in
   `--mcp=`.

4. **Start**:
   ```bash
   cd docker
   docker compose -f docker-compose.package.yml up -d --build
   docker compose -f docker-compose.package.yml logs -f
   curl http://localhost:3000/mcp/health
   ```
   The image needs BuildKit (the default builder of current Docker) for its `RUN --mount`.

The MCP endpoint is `http://localhost:3000/mcp/stream/http`.

Without `command`, `Dockerfile.package` starts `--transport stdio` with no destination:
inspection-only mode, for listing the tools.

## Configuration

### Container environment

The process environment of the container is the server's process environment; set it under
`environment:` in the compose file (or `docker run -e`).

| Variable | Meaning |
|---|---|
| `MCP_HTTP_HOST` | Listen address. The images set `0.0.0.0`; the server's own default, `127.0.0.1`, is unreachable from outside a container. |
| `MCP_HTTP_PORT` | Listen port, default `3000`. Change the `ports:` mapping with it. |
| `MCP_TRANSPORT` | `stdio`, `http` or `sse` (or `--transport=` in the command). |
| `AUTH_BROKER_PATH` | Base directory of `service-keys/` and `sessions/` (one directory). The compose files set `/app`. |
| `NODE_EXTRA_CA_CERTS`, `TLS_REJECT_UNAUTHORIZED` | See [TLS](#tls). |
| `SAP_RESPONSIBLE` | Responsible person for creates when no login is known (a token you hold). |

A destination `.env` mounted into the container and named with `--env-path=<file>` works as on a
host; the server copies only `SAP_CLIENT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE` and
`SAP_LANGUAGE` from it into the process. Anything process-level belongs in `environment:`.

### Destinations per request (no service keys)

Start with `--transport http` and no `--mcp`; each request then carries the system:

- `x-sap-url` with `x-sap-jwt-token` (a token you hold; the server cannot renew it), or
- `x-sap-url` with `x-sap-login` and `x-sap-password`;
- or `x-mcp-destination: <destination>`, only with `--allow-destination-header`.

### Sessions

A destination's session is kept in memory. It is written to `sessions/<destination>.env` only with
`--unsafe`; then mount a writable `./sessions:/app/sessions`.

## TLS

The server verifies the SAP system's HTTPS certificate. In a container the two settings are
**container environment variables** (`environment:`), never lines in a destination `.env`:

```yaml
    environment:
      - NODE_EXTRA_CA_CERTS=/certs/ca.pem    # trust your CA
    volumes:
      - ./certs/ca.pem:/certs/ca.pem:ro
```

`TLS_REJECT_UNAUTHORIZED=0` switches verification off; use it only to diagnose. See
[HTTPS certificates](../installation/INSTALLATION.md#https-certificates).

## RFC and SNC

Not available in these images. RFC (and SNC, which runs over RFC) needs
`@mcp-abap-adt/sap-rfc-lite`, which `npm install` compiles against the SAP NW RFC SDK. The images
contain neither the SDK nor a compiler, so the optional module is left out, the server starts as
usual, and the first RFC call is refused with `@mcp-abap-adt/sap-rfc-lite is not available`.

An RFC container needs an image of your own with the SDK, the build toolchain and `SAPNWRFC_HOME`
set when the package is installed — see [RFC_SETUP.md](../installation/RFC_SETUP.md). Over HTTP the
images need none of it.

## Login

A browser login (`jwt` with `SAP_GRANT_TYPE=authorization_code`) needs a browser and a reachable
callback port (`61001`, `--browser-auth-port`). A container has neither by default. Log in outside
the container and mount the session with `--unsafe`, or hand a token per request
(`x-sap-url` + `x-sap-jwt-token`).

## Operations

```bash
cd docker
docker compose -f docker-compose.package.yml ps
docker compose -f docker-compose.package.yml logs -f
docker compose -f docker-compose.package.yml restart
docker compose -f docker-compose.package.yml down
```

**Update:** replace the tarball in `docker/packages/`, then
`docker compose -f docker-compose.package.yml up -d --build`.

**Health:** the server answers `GET /mcp/health`. The compose files' `healthcheck` probes `/health`,
which the server does not serve, so `docker ps` reports the container unhealthy although it serves
requests.

## Security

- Never commit `service-keys/` or `sessions/`; mount service keys read-only (the compose files do).
- To keep the port on the host's loopback, map it there (`"127.0.0.1:3000:3000"`). Setting
  `MCP_HTTP_HOST=127.0.0.1` inside the container makes the server unreachable instead.
- A reverse proxy in front of the container (TLS termination, access control) passes requests to
  `http://<service>:3000`.

## See Also

- [docker/README.md](../../docker/README.md)
- [Installation Guide](../installation/INSTALLATION.md)
- [CLI Options](../user-guide/CLI_OPTIONS.md)
- [Authentication](../user-guide/AUTHENTICATION.md)
