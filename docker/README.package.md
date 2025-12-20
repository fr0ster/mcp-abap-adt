# Package-Based Docker Deployment

This deployment option uses a pre-built npm package tarball instead of building from source.

## Preparing the Package

### Create Package with npm pack

```bash
# From project root
npm pack

# This creates: mcp-abap-adt-1.1.29.tgz
# Move it to docker/packages directory
mkdir -p docker/packages
mv mcp-abap-adt-*.tgz docker/packages/
```

### Or Download from GitHub Release

```bash
# Download tarball from GitHub release
mkdir -p docker/packages
cd docker/packages
wget https://github.com/your-org/mcp-abap-adt/releases/download/v1.1.29/mcp-abap-adt-1.1.29.tgz
```

## Building and Running

### 1. Prepare Service Key

```bash
cd docker
mkdir -p service-keys
cp /path/to/your-service-key.json service-keys/default.json
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and set MCP_DESTINATION if needed
```

### 3. Build and Start

```bash
docker-compose -f docker-compose.package.yml up -d
```

### 4. Verify

```bash
# Check logs
docker-compose -f docker-compose.package.yml logs -f

# Test health endpoint
curl http://localhost:3000/health
```

## Updating to New Version

```bash
# Stop current container
docker-compose -f docker-compose.package.yml down

# Get new tarball
cd ..
npm pack
mv mcp-abap-adt-*.tgz docker/packages/

# Rebuild and restart
cd docker
docker-compose -f docker-compose.package.yml up -d --build
```

## Advantages

- **No build tools required**: No TypeScript compiler, no dev dependencies
- **Smaller image**: Only runtime dependencies included
- **Faster deployment**: No compilation step
- **Version pinning**: Exact version from tarball
- **Offline capable**: Works without npm registry access

## File Structure

```
docker/
├── Dockerfile.package          # Package-based Dockerfile
├── docker-compose.package.yml  # Compose configuration
├── packages/                   # Package tarballs (not in git)
│   └── mcp-abap-adt-1.1.29.tgz
├── .env                        # Environment config (not in git)
├── .env.example                # Environment template
├── service-keys/               # Service keys (not in git)
│   └── default.json
└── sessions/                   # Session storage (not in git)
```

## Troubleshooting

### Package file not found

```bash
# Error: npm install failed - no .tgz found

# Solution: Make sure tarball exists in packages/
ls -la docker/packages/*.tgz

# Create if missing
npm pack
mkdir -p docker/packages
mv mcp-abap-adt-*.tgz docker/packages/
```

### Wrong package version

```bash
# Check what's in the tarball
tar -tzf docker/packages/mcp-abap-adt-1.1.29.tgz | head

# Verify package.json version
tar -xzf docker/packages/mcp-abap-adt-1.1.29.tgz package/package.json -O | jq .version
```
