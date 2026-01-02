# Docker Deployment Guide

This guide explains how to deploy MCP ABAP ADT Server using Docker with the current AuthBroker + destination-based architecture.

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- SAP BTP ABAP Environment service key

### Two Deployment Options

**Option 1: Using Published Package (Recommended)**
- Simpler and faster
- Uses pre-built npm package
- Best for production use

**Option 2: Building from Source**
- For development
- Custom modifications
- Latest unreleased code

### Setup

1. **Navigate to docker directory**:
   ```bash
   cd docker
   ```

2. **Create service keys directory and add your service key**:
   ```bash
   mkdir -p service-keys
   # Add your service key file (get from SAP BTP)
   cp /path/to/your-key.json service-keys/trial.json
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and set MCP_DESTINATION=trial
   ```

4. **Start the server**:
   
   **Using npm package (recommended)**:
   ```bash
   docker-compose -f docker-compose.package.yml up -d
   ```
   
   **Or from source**:
   ```bash
   docker-compose up -d
   ```

5. **Verify it's running**:
   ```bash
   docker-compose logs -f
   curl http://localhost:3000/health
   ```

## Architecture

### How It Works

The Docker deployment uses:

1. **Service Keys** (`./service-keys/{destination}.json`):
   - Mounted as read-only volume
   - Contains OAuth2 credentials for SAP system
   - Never committed to git (.gitignore)

2. **Destination**:
   - Specified via `MCP_DESTINATION` environment variable
   - Determines which service key to use
   - Example: `MCP_DESTINATION=trial` uses `service-keys/trial.json`

### Container Configuration

```
Container: mcp-abap-adt-server
├── Port: 3000 (HTTP)
├── Transport: streamable-http
├── Volumes:
│   ├── ./service-keys:/app/service-keys (ro)  # Service keys
└── Environment:
    ├── MCP_DESTINATION (default: default)
    ├── MCP_HTTP_PORT (default: 3000)
    └── AUTH_BROKER_PATH (default: /app/service-keys)
```

## Service Key Format

Your service key should be in ABAP environment format:

```json
{
  "uaa": {
    "url": "https://your-account.authentication.region.hana.ondemand.com",
    "clientid": "your-client-id",
    "clientsecret": "your-client-secret"
  },
  "url": "https://your-abap-system.abap.region.hana.ondemand.com",
  "abap": {
    "url": "https://your-abap-system.abap.region.hana.ondemand.com"
  }
}
```

Save this as `service-keys/{destination}.json` (e.g., `service-keys/trial.json`)

## Common Operations

### Start Server
```bash
docker-compose up -d
```

### View Logs
```bash
docker-compose logs -f
```

### Stop Server
```bash
docker-compose down
```

### Restart Server
```bash
docker-compose restart
```

### Check Status
```bash
docker-compose ps
curl http://localhost:3000/health
```

### Use Different Destination
```bash
# Stop current
docker-compose down

# Start with different destination
MCP_DESTINATION=dev docker-compose up -d
```

## Troubleshooting

### Container exits immediately

```bash
# Check logs
docker-compose logs

# Verify service key exists
ls -la service-keys/

# Check destination name matches filename
cat .env | grep MCP_DESTINATION
ls service-keys/${MCP_DESTINATION}.json
```

### Authentication errors

```bash
# Check service key format
cat service-keys/${MCP_DESTINATION}.json | jq .

# Check if session was created
ls -la sessions/

# Force re-authentication (remove session)
rm sessions/${MCP_DESTINATION}.env
docker-compose restart
```

### Port already in use

```bash
# Check what's using port 3000
lsof -i :3000

# Use different port
echo "MCP_HTTP_PORT=3001" >> .env
# Update ports in docker-compose.yml: "3001:3001"
docker-compose up -d
```

## Multiple Environments

### Setup

```bash
# Create service keys for each environment
service-keys/
├── trial.json    # Trial environment
├── dev.json      # Development
└── prod.json     # Production
```

### Switch Between Environments

```bash
# Use trial
MCP_DESTINATION=trial docker-compose up -d

# Switch to dev
docker-compose down
MCP_DESTINATION=dev docker-compose up -d
```

## Advanced Configuration

### Custom Port

```bash
# In .env
MCP_HTTP_PORT=8080

# Update docker-compose.yml ports:
ports:
  - "8080:8080"
```

### Add nginx Reverse Proxy

Create `nginx.conf`:
```nginx
server {
    listen 80;
    location / {
        proxy_pass http://mcp-abap-adt:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Add to `docker-compose.yml`:
```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - mcp-abap-adt
```

## Security

### Best Practices

1. **Never commit credentials**:
   - `.gitignore` excludes `service-keys/` and `sessions/`
   - Use secrets management in production

2. **Use read-only mounts for service keys**:
   - Already configured in docker-compose.yml

3. **Restrict network access**:
   - Bind to localhost only: `MCP_HTTP_HOST=127.0.0.1`
   - Use firewall rules

4. **Regular updates**:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

5. **Monitor logs**:
   ```bash
   docker-compose logs -f | grep -i error
   ```

## Production Deployment

### Resource Limits

Already configured in docker-compose.yml:
- CPU: 1.0 core (limit), 0.5 core (reservation)
- Memory: 1GB (limit), 512MB (reservation)

### Monitoring

```bash
# Container stats
docker stats mcp-abap-adt-server

# Health check status
docker inspect mcp-abap-adt-server | jq '.[0].State.Health'
```

### Backup

```bash
# Backup sessions (tokens)
tar -czf backup-$(date +%Y%m%d).tar.gz sessions/

# Service keys should be backed up separately with encryption
```

## Maintenance

### Update Server

```bash
# Pull latest code
cd /path/to/mcp-abap-adt
git pull

# Rebuild and restart
cd docker
docker-compose build
docker-compose up -d
```

### Clean Up

```bash
# Remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove images
docker rmi $(docker images -q mcp-abap-adt)
```

## See Also

- [Docker README](../docker/README.md) - Detailed Docker documentation
- [Installation Guide](../installation/INSTALLATION.md) - General installation
- [CLI Options](../user-guide/CLI_OPTIONS.md) - Command-line options
