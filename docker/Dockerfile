# One image per server variant, installed from the npm registry — the way a
# user installs it; nothing of the repository is built here.
#
#   docker build --build-arg VARIANT=http -t mcp-abap-adt-http docker
#   docker build --build-arg VARIANT=core --build-arg MCP_ABAP_ADT_VERSION=<version> -t mcp-abap-adt-core docker
#
# VARIANT is the package's name without its scope, and the image runs that
# package's binary:
#
#   stdio (destinations, logins):  core (mcp-abap-adt), compact, core-ro (mcp-abap-adt-ro), compact-ro
#   Streamable HTTP (x-sap-*):     http, compact-http, http-ro, compact-http-ro
#   HTTP+SSE (x-sap-*):            sse, compact-sse, sse-ro, compact-sse-ro
#
# Only @mcp-abap-adt/<VARIANT> is installed, with what it depends on.
# MCP_ABAP_ADT_VERSION is that package's version (default `latest`).
#
# PACKAGE_SOURCE=tarballs installs the variant from `npm pack` tarballs instead
# (CI: the checkout's own packages, before they are on npm). They come in as
# the build context `tarballs`, every package of the release in one directory:
#
#   docker build --build-arg VARIANT=http --build-arg PACKAGE_SOURCE=tarballs \
#     --build-context tarballs=<directory of *.tgz> -t mcp-abap-adt-http docker
#
# RFC and SNC are not available in this image: @mcp-abap-adt/sap-rfc-lite is
# compiled at install time against the SAP NW RFC SDK, which the image does not
# carry, so the optional dependency is left out on purpose.
#
# The system type is never set here: state it when the container runs
# (SAP_SYSTEM_TYPE, or --system-type). No variant starts a destination or a
# listener without it.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG VARIANT=core

# The tarballs of PACKAGE_SOURCE=tarballs: empty unless the build names a
# `tarballs` context.
FROM scratch AS tarballs

# =========================
# Install the one package
# =========================
FROM ${NODE_IMAGE} AS install

ARG VARIANT
ARG MCP_ABAP_ADT_VERSION=latest
ARG PACKAGE_SOURCE=registry

COPY --from=tarballs / /tarballs/

# From tarballs, the variant's tarball is the dependency, and every other
# tarball overrides its package wherever the tree asks for it — so no package
# of the release comes from the registry. A tarball nothing asks for is not
# installed.
WORKDIR /opt/mcp-abap-adt
RUN set -eu; \
  case "$VARIANT" in \
    core) bin=mcp-abap-adt ;; \
    core-ro) bin=mcp-abap-adt-ro ;; \
    compact|compact-ro|http|http-ro|sse|sse-ro|compact-http|compact-http-ro|compact-sse|compact-sse-ro) bin="mcp-abap-adt-$VARIANT" ;; \
    *) echo "VARIANT=$VARIANT is not a server variant: core, compact, core-ro, compact-ro, http, compact-http, http-ro, compact-http-ro, sse, compact-sse, sse-ro, compact-sse-ro" >&2; exit 1 ;; \
  esac; \
  npm init -y > /dev/null; \
  case "$PACKAGE_SOURCE" in \
    registry) \
      npm install --omit=dev --omit=optional --no-audit --no-fund "@mcp-abap-adt/$VARIANT@$MCP_ABAP_ADT_VERSION" ;; \
    tarballs) \
      PACKAGE="@mcp-abap-adt/$VARIANT" node -e " \
        const fs = require('node:fs'), cp = require('node:child_process'); \
        const wanted = process.env.PACKAGE; \
        const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
        manifest.dependencies = {}; manifest.overrides = {}; \
        for (const file of fs.readdirSync('/tarballs').filter((f) => f.endsWith('.tgz'))) { \
          const name = JSON.parse(cp.execFileSync('tar', ['-xzOf', '/tarballs/' + file, 'package/package.json'], { encoding: 'utf8' })).name; \
          (name === wanted ? manifest.dependencies : manifest.overrides)[name] = 'file:/tarballs/' + file; \
        } \
        if (manifest.dependencies[wanted] === undefined) { console.error('no tarball of ' + wanted + ' in the tarballs context'); process.exit(1); } \
        fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2)); \
      "; \
      npm install --omit=dev --omit=optional --no-audit --no-fund ;; \
    *) echo "PACKAGE_SOURCE=$PACKAGE_SOURCE: registry or tarballs" >&2; exit 1 ;; \
  esac; \
  npm cache clean --force; \
  "node_modules/.bin/$bin" --version

# =========================
# Runtime, per transport
# =========================
FROM ${NODE_IMAGE} AS runtime

COPY --from=install /opt/mcp-abap-adt /opt/mcp-abap-adt
ENV PATH=/opt/mcp-abap-adt/node_modules/.bin:$PATH \
    NODE_ENV=production

# stdio: run with `docker run -i`. A named destination (--mcp=<name>) is read
# from service-keys/ and sessions/ under AUTH_BROKER_PATH (mount them); an
# --env-path file is mounted where the argument names it.
FROM runtime AS stdio
ENV AUTH_BROKER_PATH=/app
RUN mkdir -p /app/service-keys /app/sessions && chown -R node:node /app
WORKDIR /app
USER node

# Streamable HTTP: credentials only from each request's x-sap-* headers.
FROM runtime AS streamable-http
ENV MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3000
USER node
WORKDIR /home/node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:' + (process.env.MCP_HTTP_PORT || 3000) + '/mcp/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

# HTTP+SSE: credentials only from the x-sap-* headers of the GET that opens
# each SSE connection. 3001 is the SSE binary's own default port.
FROM runtime AS sse-listener
ENV MCP_SSE_HOST=0.0.0.0 \
    MCP_SSE_PORT=3001
USER node
WORKDIR /home/node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:' + (process.env.MCP_SSE_PORT || 3001) + '/mcp/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

# =========================
# The variants: each runs its own binary
# =========================
FROM stdio AS core
ENTRYPOINT ["mcp-abap-adt"]

FROM stdio AS compact
ENTRYPOINT ["mcp-abap-adt-compact"]

FROM stdio AS core-ro
ENTRYPOINT ["mcp-abap-adt-ro"]

FROM stdio AS compact-ro
ENTRYPOINT ["mcp-abap-adt-compact-ro"]

FROM streamable-http AS http
ENTRYPOINT ["mcp-abap-adt-http"]

FROM streamable-http AS compact-http
ENTRYPOINT ["mcp-abap-adt-compact-http"]

FROM streamable-http AS http-ro
ENTRYPOINT ["mcp-abap-adt-http-ro"]

FROM streamable-http AS compact-http-ro
ENTRYPOINT ["mcp-abap-adt-compact-http-ro"]

FROM sse-listener AS sse
ENTRYPOINT ["mcp-abap-adt-sse"]

FROM sse-listener AS compact-sse
ENTRYPOINT ["mcp-abap-adt-compact-sse"]

FROM sse-listener AS sse-ro
ENTRYPOINT ["mcp-abap-adt-sse-ro"]

FROM sse-listener AS compact-sse-ro
ENTRYPOINT ["mcp-abap-adt-compact-sse-ro"]

# The image is the stage VARIANT names.
FROM ${VARIANT}
