# Multi-stage build for mcp-abap-adt server
# Optimized for production deployment with AuthBroker + destination-based auth

# =========================
# Stage 1: Build
# =========================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
ENV NODE_ENV=development
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --omit=dev


# =========================
# Stage 2: Runtime
# =========================
FROM node:22-bookworm-slim

WORKDIR /app

# Runtime environment
ENV NODE_ENV=production \
    MCP_HTTP_PORT=3000 \
    MCP_HTTP_HOST=0.0.0.0

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create directories for service keys and sessions
RUN mkdir -p /app/service-keys /app/sessions

# Expose HTTP port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start server with streamable-http transport and destination
# Destination should be passed via --mcp parameter or configured via YAML
CMD ["node", "./dist/index.js", "--transport", "streamable-http"]
