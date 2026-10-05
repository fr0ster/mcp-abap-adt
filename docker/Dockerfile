# mcp-abap-adt server, built from this checkout and installed as packages.
#
# A checkout is not runnable as a server: server/ and compact/ take
# @mcp-abap-adt/lib as a package. So the image does what npm does for a user —
# stage 1 builds and packs the five packages, stage 2 installs the tarballs
# globally, together, so every sibling resolves to this build and every
# third-party dependency from the registry.
#
# RFC and SNC are not available in this image: @mcp-abap-adt/sap-rfc-lite is
# compiled at install time against the SAP NW RFC SDK, which the image does not
# carry, so the optional dependency is left out on purpose.

# =========================
# Stage 1: build and pack
# =========================
FROM node:22-bookworm-slim AS builder

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
 && mkdir /packages \
 && npm pack --pack-destination /packages \
 && npm pack ./compact-readonly ./compact-modify ./server ./compact --pack-destination /packages \
 && ls -l /packages

# =========================
# Stage 2: install the packages
# =========================
FROM node:22-bookworm-slim

RUN --mount=type=bind,from=builder,source=/packages,target=/packages \
    npm install -g --omit=dev --omit=optional --no-audit --no-fund /packages/*.tgz \
 && npm cache clean --force \
 && mcp-abap-adt --version

WORKDIR /app

# AUTH_BROKER_PATH: service-keys/ and sessions/ under /app (mount them).
ENV NODE_ENV=production \
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
# The compact server is installed too: run `mcp-abap-adt-compact` instead.
# Debugging: NODE_OPTIONS=--inspect=0.0.0.0:9229 and publish 9229 — never on
# a network you do not trust.
CMD ["mcp-abap-adt", "--allow-destination-header"]
