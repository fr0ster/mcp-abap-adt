# Docker Deployment Guide

How to run the server in a container, with the files in [`docker/`](../../docker/). There is one
image per server variant: one Dockerfile, built with the build argument `VARIANT`, installs that one
package and runs its binary.

| `VARIANT` | Package | Binary | Transport | Credentials |
|---|---|---|---|---|
| `core` | `@mcp-abap-adt/core` | `mcp-abap-adt` | stdio | a destination: `--mcp=<name>` or `--env-path=<file>` |
| `compact` | `@mcp-abap-adt/compact` | `mcp-abap-adt-compact` | stdio | the same |
| `core-ro` | `@mcp-abap-adt/core-ro` | `mcp-abap-adt-ro` | stdio | the same |
| `compact-ro` | `@mcp-abap-adt/compact-ro` | `mcp-abap-adt-compact-ro` | stdio | the same |
| `http` | `@mcp-abap-adt/http` | `mcp-abap-adt-http` | Streamable HTTP, port `3000` | each request's `x-sap-*` headers |
| `compact-http` | `@mcp-abap-adt/compact-http` | `mcp-abap-adt-compact-http` | Streamable HTTP, port `3000` | the same |
| `http-ro` | `@mcp-abap-adt/http-ro` | `mcp-abap-adt-http-ro` | Streamable HTTP, port `3000` | the same |
| `compact-http-ro` | `@mcp-abap-adt/compact-http-ro` | `mcp-abap-adt-compact-http-ro` | Streamable HTTP, port `3000` | the same |
| `sse` | `@mcp-abap-adt/sse` | `mcp-abap-adt-sse` | HTTP+SSE, port `3001` | the `x-sap-*` headers of the `GET` that opens each connection |
| `compact-sse` | `@mcp-abap-adt/compact-sse` | `mcp-abap-adt-compact-sse` | HTTP+SSE, port `3001` | the same |
| `sse-ro` | `@mcp-abap-adt/sse-ro` | `mcp-abap-adt-sse-ro` | HTTP+SSE, port `3001` | the same |
| `compact-sse-ro` | `@mcp-abap-adt/compact-sse-ro` | `mcp-abap-adt-compact-sse-ro` | HTTP+SSE, port `3001` | the same |

The `-ro` variants serve the read-only tool sets: no tool that creates, changes, activates, locks
or deletes anything.

## What works in a container

| | In the images of `docker/` |
|---|---|
| HTTP connection (`SAP_CONNECTION_TYPE=http`) | Yes |
| HTTPS with your own CA, or without verification | Yes — container environment variables, see [TLS](#tls) |
| RFC connection, SNC | **No** — see [RFC and SNC](#rfc-and-snc) |
| Browser login (`jwt` / `authorization_code`, stdio only) | Not inside the container — see [Login](#login) |
| Basic auth, a token you hold | Yes — in a destination (stdio) or per request in headers (HTTP, SSE) |

## The images

The images install the server the way a user does — the **published package from npm**. Nothing of
this checkout goes into them: the build context is the `docker/` directory and the Dockerfile reads
nothing from it.

| File | What it is |
|---|---|
| `docker/Dockerfile` + `docker-compose.yml` | **Install, then run.** The install stage puts `@mcp-abap-adt/<VARIANT>` (and what it depends on, nothing else) into `/opt/mcp-abap-adt`; the runtime image copies that installation, without npm's cache, and runs the variant's binary as its entrypoint. Build arguments: `VARIANT` (default `core`), `MCP_ABAP_ADT_VERSION` — the variant package's version (default `latest`) —, `PACKAGE_SOURCE` (`registry`, the default; `tarballs` is for CI, below). |
| `docker/Dockerfile.inspect` + `docker-compose.inspect.yml` | The published `core` behind `mcp-proxy`, with no destination: the image Glama builds for inspecting the tools. Not for deployment. |

All are `node:22-bookworm-slim` and run as the unprivileged `node` user. The images are not
published to a registry: build the one you need.

**The system type is required** and never set by an image: pass `SAP_SYSTEM_TYPE` (`onprem`,
`cloud` or `legacy`) with `-e`, or `--system-type=…` as an argument. A Streamable HTTP or SSE
container without it does not start listening; a stdio container does not start its destination.

## Quick start

### Streamable HTTP or SSE

```bash
docker build --build-arg VARIANT=http -t mcp-abap-adt-http docker
docker run -d --name mcp-abap-adt-http -p 127.0.0.1:3000:3000 -e SAP_SYSTEM_TYPE=onprem mcp-abap-adt-http
curl http://localhost:3000/mcp/health
```

The MCP endpoint is `http://localhost:3000/mcp/stream/http`. Every request carries its system and
credential in headers:

- `x-sap-url` (required) and `x-sap-client` (optional);
- `x-sap-login` and `x-sap-password` (basic), or `x-sap-jwt-token` (a token you hold, sent as a
  Bearer token; the server cannot renew it).

A request without them is answered `400`. There are no destinations, no service keys and no
sessions in a listener image: `x-mcp-destination` is refused with `400`, and
`--allow-destination-header`, `--mcp` and `AUTH_BROKER_PATH` are not options of these binaries.

For SSE build `VARIANT=sse` (or `compact-sse`, …) and publish `3001`: a client opens
`GET http://localhost:3001/sse` with the `x-sap-*` headers and posts its messages to the endpoint
the stream names (`/messages?sessionId=…`); the headers of a `POST` are not read.

### stdio

```bash
docker build --build-arg VARIANT=core -t mcp-abap-adt-core docker
mkdir -p ~/mcp-abap-adt/service-keys ~/mcp-abap-adt/sessions
cp /path/to/service-key.json ~/mcp-abap-adt/service-keys/<destination>.json
docker run -i --rm \
  -v ~/mcp-abap-adt/service-keys:/app/service-keys:ro \
  -v ~/mcp-abap-adt/sessions:/app/sessions \
  -e SAP_SYSTEM_TYPE=onprem \
  mcp-abap-adt-core --mcp=<destination>
```

`-i` keeps stdin open: the MCP client talks to the container's stdin and stdout, so the client's
own configuration names `docker` as the command and the line above as its arguments. The image
sets `AUTH_BROKER_PATH=/app`: a named destination is `service-keys/<name>.json` and
`sessions/<name>.env` there. Create both directories on the host before the first run (a missing
bind-mount source is created by Docker as `root`, and the `node` user cannot write to it).

A destination `.env` works as on a host: mount it and name it, e.g.
`-v ./trial.env:/app/trial.env:ro … mcp-abap-adt-core --env-path=/app/trial.env`; the server copies
only `SAP_CLIENT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE` and `SAP_LANGUAGE` from it into the
process. Without `--mcp` or `--env-path` the server starts in tool-inspection-only mode.

### With compose

[`docker/docker-compose.yml`](../../docker/docker-compose.yml) has a service per variant, named as
the `VARIANT`. Each has a profile of its own name, so a bare `up` starts nothing; name the service:

```bash
export SAP_SYSTEM_TYPE=onprem                    # or SAP_SYSTEM_TYPE=… in docker/.env
npm run docker:build -- http                      # docker compose -f docker/docker-compose.yml build http
npm run docker:up -- http                         # … up -d http — port 3000
curl http://localhost:3000/mcp/health
npm run docker:logs -- http
npm run docker:down

# stdio: ./service-keys and ./sessions under docker/
docker compose -f docker/docker-compose.yml run --rm -T core --mcp=<destination>
```

The Streamable HTTP services publish `3000`, the SSE services `3001`, on the host's loopback only
(`127.0.0.1:3000`, `127.0.0.1:3001`), so one of each can run at a time on those ports. To reach one
from another machine, put TLS in front of it or change the mapping in your own compose file.

**A version:** `MCP_ABAP_ADT_VERSION=<version>` in `docker/.env` (see `docker/.env.example`), or
`docker build --build-arg MCP_ABAP_ADT_VERSION=<version> …`. It is the version of the variant's own
package. `latest` is resolved when the image is built: rebuild (`docker compose build --no-cache`)
to take a newer release.

### From the checkout's tarballs (CI)

`PACKAGE_SOURCE=tarballs` installs the variant from `npm pack` tarballs instead of the registry —
CI builds the images this way before the release is on npm. The tarballs of every package of the
release go in one directory, handed to the build as the context `tarballs`; the variant's tarball
is installed, and each other tarball stands in for its package wherever the tree asks for it:

```bash
docker build --build-arg VARIANT=http --build-arg PACKAGE_SOURCE=tarballs \
  --build-context tarballs=<directory of *.tgz> -t mcp-abap-adt-http docker
```

`node scripts/ci/check-images.mjs --tarballs <directory>` builds every variant that way and checks
it (see [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)).

## Configuration

### Container environment

The process environment of the container is the server's process environment; set it with
`docker run -e` (or `environment:` in the compose file).

| Variable | Variants | Meaning |
|---|---|---|
| `SAP_SYSTEM_TYPE` | all | `onprem`, `cloud` or `legacy`. Required; no image sets it. |
| `MCP_HTTP_HOST`, `MCP_HTTP_PORT` | Streamable HTTP | Listen address and port. The images set `0.0.0.0` and `3000`; the binary's own default host, `127.0.0.1`, is unreachable from outside a container. |
| `MCP_SSE_HOST`, `MCP_SSE_PORT` | SSE | The same for SSE: `0.0.0.0` and `3001`. |
| `AUTH_BROKER_PATH` | stdio | Base directory of `service-keys/` and `sessions/` (one directory). The images set `/app`. |
| `NODE_EXTRA_CA_CERTS`, `TLS_REJECT_UNAUTHORIZED` | all | See [TLS](#tls). |
| `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM` | writing variants | Responsible person and master system of created objects, when no header (HTTP, SSE) or destination states them. |

Change the published port together with `MCP_HTTP_PORT` / `MCP_SSE_PORT`; the health check reads
the same variable.

### Sessions (stdio)

A destination's session is kept in memory. It is written to `sessions/<destination>.env` only with
`--unsafe`; then the `sessions` mount must be writable.

## TLS

The server verifies the SAP system's HTTPS certificate. In a container the two settings are
**container environment variables** (`-e`, `environment:`), never lines in a destination `.env`:

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

A browser login (stdio, `jwt` with `SAP_GRANT_TYPE=authorization_code`) needs a browser and a
reachable callback port (`61001`, `--browser-auth-port`). A container has neither by default. Log in
outside the container and mount the session with `--unsafe`, or run a Streamable HTTP or SSE image
and hand a token per request (`x-sap-url` + `x-sap-jwt-token`).

## Operations

| Script | What it runs |
|---|---|
| `docker:build`, `docker:up`, `docker:down`, `docker:logs` | `docker compose -f docker/docker-compose.yml …`; name the service after `--` (`npm run docker:up -- http`) |

**Health:** the Streamable HTTP and SSE images answer `GET /mcp/health` with
`{"status":"ok",…}`, and their `HEALTHCHECK` probes it on the port their variable names. A stdio
image has no health check: it lives as long as its client keeps stdin open.

**Stopping a container:** `docker stop` sends `SIGTERM`. A Streamable HTTP or SSE server then takes
no new request, **logs off every ADT session** it opened **at once** (the logoff releases any lock a
tool holds) and interrupts the running tools — it does not wait for them: a write whose `UNLOCK` was
still to come never sends it, and its lock goes with the logoff —, then exits `0`. It has no
deadline of its own; docker's stop grace (`--time`, `stop_grace_period`, 10 s by default) or
Kubernetes' `terminationGracePeriodSeconds` only has to cover the logoffs' writes — a kill sends no
logoff, and SAP keeps the sessions and their locks until its own timeout. `--shutdown-timeout`
(`MCP_SHUTDOWN_TIMEOUT`) bounds that wait: at the timeout the server stops waiting and exits `1`.

**Debugging:** `NODE_OPTIONS=--inspect=0.0.0.0:9229` in the environment and a published `9229`.
The inspector runs any code it is sent: never expose it beyond your own machine.

## Security

- Never commit `service-keys/` or `sessions/`; mount service keys read-only (the compose file does).
  The build context is `docker/`, and the image copies nothing from it.
- A Streamable HTTP or SSE image receives SAP credentials in every request's headers: keep its port
  on the host's loopback (`-p 127.0.0.1:3000:3000`) or behind TLS. Setting `MCP_HTTP_HOST=127.0.0.1`
  inside the container makes the server unreachable instead.
- A reverse proxy in front of the container (TLS termination, access control) passes requests to
  `http://<service>:3000` (`:3001` for SSE).

## See Also

- [docker/README.md](../../docker/README.md)
- [Installation Guide](../installation/INSTALLATION.md)
- [CLI Options](../user-guide/CLI_OPTIONS.md)
- [Authentication](../user-guide/AUTHENTICATION.md)
- [MIGRATION-19.0.md](../MIGRATION-19.0.md) — what changed in the image
