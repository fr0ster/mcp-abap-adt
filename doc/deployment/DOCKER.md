# Docker Deployment Guide

This guide explains how to deploy MCP ABAP ADT Server using Docker.

## Quick Start

### 1. Using Docker Run

```bash
# Build image
docker build -t mcp-abap-adt .

# Run container
docker run -d \
  --name mcp-abap-adt \
  -p 3000:3000 \
  -e SAP_URL=https://your-sap-system.com \
  -e SAP_CLIENT=100 \
  -e SAP_AUTH_TYPE=jwt \
  -e SAP_JWT_TOKEN=your-token \
  mcp-abap-adt
```

### 2. Using Docker Compose (Recommended)

```bash
# Create .env file with SAP credentials
cat > .env << EOF
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your-token
EOF

# Start service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop service
docker-compose down
```

## Configuration

### Environment Variables

Required:
- `SAP_URL` - SAP system URL
- `SAP_CLIENT` - SAP client number
- `SAP_AUTH_TYPE` - Authentication type (jwt, basic)

For JWT auth:
- `SAP_JWT_TOKEN` - JWT token

For Basic auth:
- `SAP_USERNAME` - SAP username
- `SAP_PASSWORD` - SAP password

Optional:
- `MCP_HTTP_PORT` - Server port (default: 3000)
- `MCP_HTTP_HOST` - Server host (default: 0.0.0.0)
- `NODE_ENV` - Environment (default: production)

### Volumes

Persist data by mounting volumes:

```yaml
volumes:
  - ./data/sessions:/app/.sessions    # Session storage
  - ./data/locks:/app/.locks          # Lock files
  - ./data/cache:/app/cache           # Cache files
```

## Using with nginx Reverse Proxy

Enable nginx proxy:

```bash
# Start with nginx profile
docker-compose --profile with-nginx up -d
```

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream mcp-abap-adt {
        server mcp-abap-adt:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        location / {
            proxy_pass http://mcp-abap-adt;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## Health Checks

Built-in health check endpoint:

```bash
# Check health
curl http://localhost:3000/health

# Docker healthcheck
docker inspect --format='{{.State.Health.Status}}' mcp-abap-adt
```

## Multi-stage Builds (Optimized)

For smaller image size, use multi-stage build:

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "./dist/index.js", "--transport", "streamable-http"]
```

## Examples

### Example 1: Development with hot reload

```bash
docker run -it --rm \
  -v $(pwd):/app \
  -v /app/node_modules \
  -p 3000:3000 \
  --env-file .env \
  node:18-alpine \
  sh -c "cd /app && npm install && npm run dev:http"
```

### Example 2: Production with custom port

```bash
docker run -d \
  --name mcp-abap-adt \
  -p 8080:3000 \
  -e MCP_HTTP_PORT=3000 \
  --env-file .env \
  mcp-abap-adt
```

### Example 3: Multiple instances (load balancing)

```yaml
version: '3.8'
services:
  mcp-abap-adt-1:
    image: mcp-abap-adt
    env_file: .env

  mcp-abap-adt-2:
    image: mcp-abap-adt
    env_file: .env

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf
```

## Troubleshooting

**Container exits immediately:**
```bash
# Check logs
docker logs mcp-abap-adt

# Common issues:
# - Missing .env file
# - Invalid SAP credentials
# - Port already in use
```

**Connection refused:**
```bash
# Ensure container is running
docker ps

# Check port mapping
docker port mcp-abap-adt

# Test from container
docker exec mcp-abap-adt wget -O- http://localhost:3000/health
```

**High memory usage:**
```bash
# Set memory limit
docker run --memory=1g --memory-swap=1g ...

# Or in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 1G
```

## Security

**Best practices:**

1. Use secrets for credentials:
```bash
echo "your-token" | docker secret create sap_jwt_token -
```

2. Run as non-root user:
```dockerfile
USER node
```

3. Use read-only filesystem:
```bash
docker run --read-only --tmpfs /tmp ...
```

4. Scan for vulnerabilities:
```bash
docker scan mcp-abap-adt
```

## Building for Multiple Platforms

```bash
# Build for ARM and x86
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t mcp-abap-adt:latest \
  --push .
```
