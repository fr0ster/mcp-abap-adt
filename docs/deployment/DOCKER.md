# Docker Deployment Guide

This guide explains how to deploy MCP ABAP ADT Server using Docker with destination-based authentication.

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
   # The destination is chosen by the container command (--mcp=trial in the compose file),
   # not by an environment variable
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
   - Chosen by the container command: `--mcp=<name>` (an own default destination), a YAML `mcp` key passed with `--config`, or `x-mcp-destination` per request with `--allow-destination-header` (the Dockerfile's default command)
   - The server reads no environment variable for it
   - Example: `--mcp=trial` uses `service-keys/trial.json`
   - `AUTH_BROKER_PATH=/app` (set in the compose files) makes `/app/service-keys` and `/app/sessions` the directories it reads

3. **Login**: a browser login needs a browser and a reachable callback port (default `61001`), which a container does not have by default. Obtain the session outside the container and mount `sessions/`, or hand a token in a header (`x-sap-url` and `x-sap-jwt-token`).

### Container Configuration

```
Container: mcp-abap-adt-server
├── Port: 3000 (HTTP)
├── Transport: streamable-http
├── Volumes:
│   ├── ./service-keys:/app/service-keys (ro)  # Service keys
├── Command: --mcp=<name> and/or --allow-destination-header
└── Environment:
    ├── MCP_HTTP_PORT (default: 3000)
    └── AUTH_BROKER_PATH (/app in the compose files)
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

# Edit the command in docker-compose.yml: --mcp=dev
docker-compose up -d

# Or start with --allow-destination-header and send x-mcp-destination: dev per request
```

## Troubleshooting

### Container exits immediately

```bash
# Check logs
docker-compose logs

# Verify service key exists
ls -la service-keys/

# Check the --mcp=<name> in the container command matches a service key file
docker-compose config | grep -- --mcp
ls service-keys/
```

### Authentication errors

```bash
# Check service key format
cat service-keys/<name>.json | jq .

# Check if session was created
ls -la sessions/

# Force re-authentication (remove session; written only with --unsafe)
rm sessions/<name>.env
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
# Use trial: --mcp=trial in the compose command
docker-compose up -d

# Switch to dev: change the command to --mcp=dev
docker-compose down
docker-compose up -d

# Or serve both: --allow-destination-header, and clients send x-mcp-destination
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
