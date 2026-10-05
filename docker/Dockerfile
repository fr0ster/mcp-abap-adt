# mcp-abap-adt server, installed from the npm registry — the way a user installs
# it, nothing is built here.
#
# Stage 1 installs the published packages into their own prefix; stage 2 copies
# that installation into a clean runtime image, without npm's cache.
#
#   docker build -f docker/Dockerfile -t mcp-abap-adt .
#   docker build -f docker/Dockerfile --build-arg MCP_ABAP_ADT_VERSION=<version> -t mcp-abap-adt .
#
# Both commands are installed: mcp-abap-adt (@mcp-abap-adt/core) and
# mcp-abap-adt-compact (@mcp-abap-adt/compact).
#
# RFC and SNC are not available in this image: @mcp-abap-adt/sap-rfc-lite is
# compiled at install time against the SAP NW RFC SDK, which the image does not
# carry, so the optional dependency is left out on purpose.

ARG NODE_IMAGE=node:22-bookworm-slim

# =========================
# Stage 1: install from npm
# =========================
FROM ${NODE_IMAGE} AS install

ARG MCP_ABAP_ADT_VERSION=latest
RUN npm install -g --prefix /opt/mcp-abap-adt --omit=dev --omit=optional --no-audit --no-fund \
      "@mcp-abap-adt/core@${MCP_ABAP_ADT_VERSION}" \
      "@mcp-abap-adt/compact@${MCP_ABAP_ADT_VERSION}" \
 && /opt/mcp-abap-adt/bin/mcp-abap-adt --version

# =========================
# Stage 2: runtime
# =========================
FROM ${NODE_IMAGE}

COPY --from=install /opt/mcp-abap-adt /opt/mcp-abap-adt

WORKDIR /app

# AUTH_BROKER_PATH: service-keys/ and sessions/ under /app (mount them).
ENV PATH=/opt/mcp-abap-adt/bin:$PATH \
    NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_HTTP_PORT=3000 \
    MCP_HTTP_HOST=0.0.0.0 \
    AUTH_BROKER_PATH=/app

RUN mkdir -p /app/service-keys /app/sessions && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD if [ "$MCP_TRANSPORT" = "stdio" ]; then exit 0; else node -e "require('http').get('http://localhost:' + (process.env.MCP_HTTP_PORT || 3000) + '/mcp/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"; fi

# The transport comes from MCP_TRANSPORT. A client names its destination per
# request (x-mcp-destination); add --mcp=<destination> for a default one.
# For the compact server, run `mcp-abap-adt-compact` with the same arguments.
# Debugging: NODE_OPTIONS=--inspect=0.0.0.0:9229 and publish 9229 — never on
# a network you do not trust.
CMD ["mcp-abap-adt", "--allow-destination-header"]
