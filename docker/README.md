# Docker Deployment

Docker configuration for MCP ABAP ADT Server with AuthBroker and destination-based authentication.

## Two Deployment Options

### Option 1: Using Published npm Package (Recommended)

Simplest approach - uses pre-built package from npm:
- Smaller image size
- Faster build time
- Always uses latest published version

```bash
docker-compose -f docker-compose.package.yml up -d
```

### Option 2: Building from Source

For development or custom modifications:
- Build from local source code
- Larger image size
- Requires build step

```bash
docker-compose up -d
```

## Quick Start

### 1. Prepare Service Key

Create `service-keys` directory and add your SAP service key:

```bash
mkdir -p service-keys
# Copy your service key file
cp /path/to/your-service-key.json service-keys/trial.json
```

Service key format (ABAP environment):
```json
{
  "uaa": {
    "url": "https://your-uaa-url.com",
    "clientid": "your-client-id",
    "clientsecret": "your-client-secret"
  },
  "url": "https://your-sap-url.com",
  "abap": {
    "url": "https://your-sap-url.com"
  }
}
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and set MCP_DESTINATION to match your service key filename (without .json)
```

### 3. Start Server

**Using npm package (recommended)**:
```bash
docker-compose -f docker-compose.package.yml up -d
```

**Or building from source**:
```bash
docker-compose up -d
```

### 4. Check Status

```bash
# View logs
docker-compose logs -f

# Check health
curl http://localhost:3000/health

# Check container status
docker-compose ps
```

## Architecture

### Dockerfile Options

**Dockerfile.package** (recommended):
- Uses `npm install -g @fr0ster/mcp-abap-adt`
- Single-stage build
- ~200MB image size
- Fast build (~1 minute)

**Dockerfile** (from source):
- Multi-stage build with TypeScript compilation
- Builds from local source code
- ~300MB image size
- Slower build (~3-5 minutes)

### Authentication Flow

1. **Service Keys**: Stored in `./service-keys/{destination}.json`
   - Read-only volume mount
   - Contains OAuth2 credentials for SAP system

2. **Destination**: Specified via `MCP_DESTINATION` environment variable
   - Determines which service key to use

### Directory Structure

```
docker/
├── Dockerfile              # Multi-stage build
├── docker-compose.yml      # Service configuration
├── .env.example            # Environment template
├── README.md              # This file
├── service-keys/          # Service keys (not in git)
│   ├── trial.json
│   ├── dev.json
│   └── prod.json
```

## Usage Examples

### Single Destination

```bash
# Use default destination from .env
docker-compose up -d

# Or specify destination
MCP_DESTINATION=trial docker-compose up -d
```

### Multiple Destinations

Create multiple service key files and switch between them:

```bash
# Use trial
MCP_DESTINATION=trial docker-compose up -d

# Stop and switch to dev
docker-compose down
MCP_DESTINATION=dev docker-compose up -d
```

### Development with Volume Mounts

```yaml
# docker-compose.override.yml
services:
  mcp-abap-adt:
    volumes:
      - ../dist:/app/dist  # Hot reload
```

**From source**:
```bash
docker-compose up -d
```

**From npm package**:
```bash
# No need for volume mounts - package is already built
docker-compose -f docker-compose.package.yml up -d
```

## Configuration Options

### Environment Variables

- `MCP_DESTINATION`: Destination name (default: "default")
- `MCP_HTTP_PORT`: Server port (default: 3000)
- `MCP_HTTP_HOST`: Server host (default: 0.0.0.0)
- `AUTH_BROKER_PATH`: Custom path for service keys (default: /app/service-keys)

### Volumes

- `./service-keys:/app/service-keys:ro` - Service keys (read-only)
- `./cache:/app/cache` - Cache directory (optional)

## Troubleshooting

### Container exits immediately

```bash
# Check logs
docker-compose logs

# Common causes:
# - Missing service key file
# - Invalid service key format
# - Port 3000 already in use
```

### Authentication fails

```bash
# Check service key exists
ls -la service-keys/

# Check destination matches filename
echo $MCP_DESTINATION  # Should match {destination}.json

# Check session was created
ls -la sessions/

# View session contents (after first successful auth)
cat sessions/${MCP_DESTINATION}.env
```

### Token expired

AuthBroker automatically refreshes tokens. If manual refresh needed:

```bash
# Remove session file to force re-authentication
rm sessions/${MCP_DESTINATION}.env

# Restart container
docker-compose restart
```

## Security

### Best Practices

1. **Never commit service keys or sessions to git**
   - `.gitignore` already excludes these directories
   - Use secrets management in production

2. **Use read-only mount for service keys**
   - Already configured in docker-compose.yml

3. **Restrict container resources**
   - Memory and CPU limits configured

4. **Use specific user**
   ```dockerfile
   USER node  # Add to Dockerfile if needed
   ```

5. **Scan for vulnerabilities**
   ```bash
   docker scan mcp-abap-adt
   ```

## Production Deployment

### With HTTPS Proxy (nginx)

```yaml
# docker-compose.prod.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - mcp-abap-adt
```

### With Secrets Management

```bash
# Using Docker secrets
echo '{"uaa": {...}}' | docker secret create sap_service_key -

# Reference in compose
secrets:
  - sap_service_key
```

## Maintenance

### Update Server

```bash
# Rebuild image
docker-compose build

# Restart with new image
docker-compose up -d
```

### Backup

```bash
# Backup sessions (tokens)
tar -czf sessions-backup.tar.gz sessions/

# Service keys should be backed up separately (security)
```

### Clean Up

```bash
# Stop and remove containers
docker-compose down

# Remove volumes
docker-compose down -v

# Remove images
docker rmi mcp-abap-adt
```
