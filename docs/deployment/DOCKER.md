# Docker Deployment Guide

How to run the server in a container, with the files in [`docker/`](../../docker/). Both servers are
in the images: `mcp-abap-adt` (the full one, `@mcp-abap-adt/core`) and `mcp-abap-adt-compact`
(`@mcp-abap-adt/compact`).

## What works in a container

| | In the images of `docker/` |
|---|---|
| HTTP connection (`SAP_CONNECTION_TYPE=http`) | Yes |
| HTTPS with your own CA, or without verification | Yes — container environment variables, see [TLS](#tls) |
| RFC connection, SNC | **No** — see [RFC and SNC](#rfc-and-snc) |
| Browser login (`jwt` / `authorization_code`) | Not inside the container — see [Login](#login) |
| Basic auth, a token you hold | Yes — in a destination or per request in headers |

## The images

Every image installs the server the way a user does — as npm packages, with `npm install -g` — and
none runs from a source tree.

| File | What it is |
|---|---|
| `docker/Dockerfile` + `docker-compose.yml`, `docker-compose.headerless.yml` | **Two stages from this checkout.** Stage 1 builds and packs the five packages (`lib`, `compact-readonly`, `compact-modify`, `core`, `compact`); stage 2 installs the tarballs together, so the siblings are this build and every other dependency comes from the registry. |
| `docker/Dockerfile.package` + `docker-compose.package.yml` | Installs the tarballs you put in `docker/packages/` — typically the published `core`, packed from the registry. |
| `docker/Dockerfile.inspect` + `docker-compose.inspect.yml` | The published `core` from the registry behind `mcp-proxy`, with no destination: the image Glama builds for inspecting the tools. Not for deployment. |

All are `node:22-bookworm-slim` and run as the unprivileged `node` user. The builds need BuildKit (the
default builder of current Docker) for `RUN --mount`.

## Quick start (from the checkout)

From the repository root:

```bash
mkdir -p docker/service-keys
cp /path/to/service-key.json docker/service-keys/<destination>.json   # optional, see below
npm run docker:build        # docker compose -f docker/docker-compose.yml build
npm run docker:up
curl http://localhost:3000/mcp/health
npm run docker:logs
npm run docker:down
```

The MCP endpoint is `http://localhost:3000/mcp/stream/http`. The image's command is
`mcp-abap-adt --allow-destination-header`: a client names its destination per request with
`x-mcp-destination`. Add `--mcp=<destination>` to the compose `command` for a default one. For the
compact server, make the command `mcp-abap-adt-compact` with the same arguments.

`npm run docker:up:headerless` (`docker-compose.headerless.yml`) runs the same image with no
destinations at all: every request carries its system in headers (see below).

## Quick start (published package)

```bash
npm run docker:pack            # npm pack @mcp-abap-adt/core into docker/packages/
npm run docker:build:package
npm run docker:up:package
```

`docker/packages/` may hold more than one tarball — `lib` and `core` packed from one build, the compact
packages too — and they are installed together; what is not there comes from the registry. To pin a
version: `npm pack @mcp-abap-adt/core@<version> --pack-destination docker/packages`. Without the
compose `command`, `Dockerfile.package` starts `--transport=stdio` with no destination:
inspection-only mode.

## Configuration

### Container environment

The process environment of the container is the server's process environment; set it under
`environment:` in the compose file (or `docker run -e`).

| Variable | Meaning |
|---|---|
| `MCP_TRANSPORT` | `stdio`, `http` or `sse`. `docker/Dockerfile` sets `http`. |
| `MCP_HTTP_HOST` | Listen address. The images set `0.0.0.0`; the server's own default, `127.0.0.1`, is unreachable from outside a container. |
| `MCP_HTTP_PORT` | Listen port, default `3000`. Change the `ports:` mapping with it. |
| `AUTH_BROKER_PATH` | Base directory of `service-keys/` and `sessions/` (one directory). The images set `/app`. |
| `NODE_EXTRA_CA_CERTS`, `TLS_REJECT_UNAUTHORIZED` | See [TLS](#tls). |
| `SAP_RESPONSIBLE` | Responsible person for creates when no login is known (a token you hold). |

A destination `.env` mounted into the container and named with `--env-path=<file>` works as on a
host; the server copies only `SAP_CLIENT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE` and
`SAP_LANGUAGE` from it into the process. Anything process-level belongs in `environment:`.

### Destinations per request (no service keys)

Over HTTP with no `--mcp`, each request carries the system:

- `x-sap-url` with `x-sap-jwt-token` (a token you hold; the server cannot renew it), or
- `x-sap-url` with `x-sap-login` and `x-sap-password`;
- or `x-mcp-destination: <destination>`, only with `--allow-destination-header`.

A request with none of them is refused: `Missing SAP connection context`.

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
`@mcp-abap-adt/sap-rfc-lite`, which `npm install` compiles against the SAP NW RFC SDK. The images carry
neither the SDK nor a compiler and install with `--omit=optional`, so the module is absent and the
first RFC call is refused with `@mcp-abap-adt/sap-rfc-lite is not available`.

An RFC image of your own needs the SDK, the build toolchain and `SAPNWRFC_HOME` set when the packages
are installed — see [RFC_SETUP.md](../installation/RFC_SETUP.md). SNC needs, besides, an SNC product
holding a credential inside the container, which a desktop Secure Login Client does not give.

## Login

A browser login (`jwt` with `SAP_GRANT_TYPE=authorization_code`) needs a browser and a reachable
callback port (`61001`, `--browser-auth-port`). A container has neither by default. Log in outside
the container and mount the session with `--unsafe`, or hand a token per request
(`x-sap-url` + `x-sap-jwt-token`).

## Operations

| Script | What it runs |
|---|---|
| `docker:build`, `docker:up`, `docker:down`, `docker:logs` | `docker compose -f docker/docker-compose.yml …` |
| `docker:build:headerless`, `docker:up:headerless`, `docker:down:headerless` | the same with `docker-compose.headerless.yml` |
| `docker:pack` | empties `docker/packages/` and packs the published `@mcp-abap-adt/core` into it |
| `docker:build:package`, `docker:up:package`, `docker:down:package` | the same with `docker-compose.package.yml` |

**Health:** `GET /mcp/health` answers `{"status":"ok",…}`; the images and compose files probe it.

**Debugging:** `NODE_OPTIONS=--inspect=0.0.0.0:9229` in `environment:` and a published `9229`.
The inspector runs any code it is sent: never expose it beyond your own machine.

## Security

- Never commit `service-keys/` or `sessions/`; mount service keys read-only (the compose files do).
  They are also kept out of the build context (`.dockerignore`).
- To keep the port on the host's loopback, map it there (`"127.0.0.1:3000:3000"`). Setting
  `MCP_HTTP_HOST=127.0.0.1` inside the container makes the server unreachable instead.
- A reverse proxy in front of the container (TLS termination, access control) passes requests to
  `http://<service>:3000`.

## See Also

- [docker/README.md](../../docker/README.md)
- [Installation Guide](../installation/INSTALLATION.md)
- [CLI Options](../user-guide/CLI_OPTIONS.md)
- [Authentication](../user-guide/AUTHENTICATION.md)
