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
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_TRANSPORT=stdio

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create directories for service keys and sessions
RUN mkdir -p /app/service-keys /app/sessions

# Expose HTTP and Debug ports
EXPOSE 3000 9229

# Healthcheck - only relevant for sse/http transports
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD if [ "$MCP_TRANSPORT" = "stdio" ]; then exit 0; else node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1; fi

# Start server with v2 launcher
# Transport will be taken from MCP_TRANSPORT env var (defaults to stdio)
CMD ["node", "--inspect=0.0.0.0:9229", "./dist/server/v2/launcher.js"]
