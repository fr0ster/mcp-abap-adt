# =========================
# Stage 1: Build + prune dev dependencies
# =========================
FROM node:22-bookworm-slim AS builder

# Set working directory
WORKDIR /app

# Copy only package manifests first (better cache re-use)
COPY package.json package-lock.json ./

# Install all dependencies (including dev) for TypeScript build
ENV NODE_ENV=development
RUN npm ci

# Copy application source
COPY . .

# Build TypeScript → JavaScript
RUN npm run build

# Remove dev dependencies and keep only production ones
RUN npm prune --omit=dev


# =========================
# Stage 2: Runtime
# =========================
FROM node:22-bookworm-slim

# Set working directory
WORKDIR /app

# Runtime environment variables
ENV MCP_HTTP_PORT=3000 \
    MCP_HTTP_HOST=0.0.0.0 \
    NODE_ENV=production

# Copy only what is required at runtime
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Expose HTTP port
EXPOSE 3000

# Healthcheck for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${MCP_HTTP_PORT}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Default command with StreamableHTTP transport
CMD ["node", "./dist/index.js", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "3000"]
