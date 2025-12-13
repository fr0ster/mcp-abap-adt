# Docker Configuration

This directory contains all Docker-related configuration files for the MCP ABAP ADT server.

## Files

- `Dockerfile` - Docker image build configuration
- `docker-compose.yml` - Basic configuration (minimal, no logging, no persistence)
- `docker-compose.logging.yml` - Configuration with logging enabled
- `docker-compose.full.yml` - Full configuration with logging and persistence (sessions, locks, cache)

## Configuration Variants

### 1. Basic (`docker-compose.yml`)

**Use for:** Simple testing, quick start, minimal resource usage

**Features:**
- ✅ HTTP server on port 3000
- ✅ Health checks
- ✅ Resource limits
- ⚙️ Logging: Optional (uncomment in file)
- ⚙️ Persistence: Optional (uncomment in file)

**Usage:**
```bash
docker-compose up -d
```

**To enable logging:** Uncomment the `logging:` section in `docker-compose.yml`

**To enable session persistence:** 
1. Uncomment `MCP_ENABLE_SESSION_STORAGE=true` in `environment:` section
2. Uncomment the `volumes:` section

### 2. With Logging (`docker-compose.logging.yml`)

**Use for:** Debugging, monitoring server activity

**Features:**
- ✅ HTTP server on port 3000
- ✅ Health checks
- ✅ Resource limits
- ✅ Logging (json-file driver, 10MB max, 3 files)
- ❌ No persistence (sessions, locks)

**Usage:**
```bash
docker-compose -f docker-compose.logging.yml up -d
docker-compose -f docker-compose.logging.yml logs -f
```

### 3. Full (`docker-compose.full.yml`)

**Use for:** Production, long-running operations, when you need session/lock persistence

**Features:**
- ✅ HTTP server on port 3000
- ✅ Health checks
- ✅ Resource limits
- ✅ Logging (json-file driver, 10MB max, 3 files)
- ✅ Session persistence (enabled via `MCP_ENABLE_SESSION_STORAGE=true`)
- ✅ Lock persistence (active-locks.json)
- ✅ Cache directory (reserved for future use)

**Usage:**
```bash
docker-compose -f docker-compose.full.yml up -d
docker-compose -f docker-compose.full.yml logs -f
```

**Note:** Session persistence requires `MCP_ENABLE_SESSION_STORAGE=true` (already set in this config). This allows cookies and CSRF tokens to persist across requests.

## Quick Start

### Prerequisites

1. Create `.env` file in the project root with SAP connection details:
   ```env
   SAP_URL=https://your-sap-system.com
   SAP_CLIENT=100
   SAP_AUTH_TYPE=jwt
   SAP_JWT_TOKEN=your-token
   ```

2. Ensure Docker and Docker Compose are installed

### Running with Docker Compose

**Basic (minimal):**
```bash
cd docker
docker-compose up -d
```

**With logging:**
```bash
cd docker
docker-compose -f docker-compose.logging.yml up -d
docker-compose -f docker-compose.logging.yml logs -f
```

**Full (with persistence):**
```bash
cd docker
docker-compose -f docker-compose.full.yml up -d
docker-compose -f docker-compose.full.yml logs -f
```

**Stop services:**
```bash
docker-compose down
# or
docker-compose -f docker-compose.logging.yml down
# or
docker-compose -f docker-compose.full.yml down
```

The server will be available at `http://localhost:3000/mcp/stream/http`

### Building Docker Image

```bash
# From this directory (docker/)
docker build -f Dockerfile -t mcp-abap-adt ..
```

### Running Docker Image Directly

You can also run the image directly without docker-compose:

```bash
# Build image
docker build -f docker/Dockerfile -t mcp-abap-adt .

# Run container (basic)
docker run -d \
  --name mcp-abap-adt-server \
  -p 3000:3000 \
  --env-file .env \
  mcp-abap-adt

# Run container (with persistence)
docker run -d \
  --name mcp-abap-adt-server \
  -p 3000:3000 \
  --env-file .env \
  -e MCP_ENABLE_SESSION_STORAGE=true \
  -v $(pwd)/data/sessions:/app/.sessions \
  -v $(pwd)/data/locks:/app/.locks \
  -v $(pwd)/data/cache:/app/cache \
  mcp-abap-adt
```

## Documentation

For detailed deployment instructions, see:
- [Docker Deployment Guide](../docs/deployment/DOCKER.md)
- [Cline Setup Guide](../docs/deployment/CLINE_SETUP.md)

## Directory Structure

```
mcp-abap-adt/
├── docker/              # Docker configuration files (this directory)
│   ├── Dockerfile
│   ├── docker-compose.yml          # Basic (minimal)
│   ├── docker-compose.logging.yml  # With logging
│   ├── docker-compose.full.yml     # Full (logging + persistence)
│   └── README.md
├── .env                 # Environment variables (create in project root)
└── data/                # Persistent data (created by Docker containers, only with full config)
    ├── sessions/        # Session files (only if MCP_ENABLE_SESSION_STORAGE=true)
    ├── locks/           # Lock registry (active-locks.json)
    └── cache/           # Cache directory (reserved for future use)
```

## Notes

- All Docker commands should be run from the `docker/` directory (for docker-compose)
- The build context is set to the project root (`..`) to access source files
- Environment variables are loaded from `.env` file in the project root
- Persistent data directories are created in the project root (only when volumes are enabled)
- The server listens on port 3000 and is exposed directly (no nginx proxy needed for local development)
- **Logging:** Disabled by default. Uncomment the `logging:` section in `docker-compose.yml` to enable
- **Session storage:** Disabled by default (stateless mode). To enable:
  1. Uncomment `MCP_ENABLE_SESSION_STORAGE=true` in `environment:` section
  2. Uncomment the `volumes:` section
