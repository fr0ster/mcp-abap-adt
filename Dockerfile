# MCP ABAP ADT Server - Docker Image
# Runs with StreamableHTTP transport by default

FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Build the TypeScript application
RUN npm run build

# Environment variables with defaults
ENV MCP_HTTP_PORT=3000
ENV MCP_HTTP_HOST=0.0.0.0
ENV NODE_ENV=production

# Expose the HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${MCP_HTTP_PORT}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start with StreamableHTTP transport
CMD ["node", "./dist/index.js", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "3000"]
