# Package Archive Workflow

This document describes how to generate and use tarball archives for private packages.

## Workflow Overview

1. **Generate archive** in package repository
2. **Store archive** in designated location
3. **Install from archive** in consuming project

## Step 1: Generate Archive

In the package directory (e.g., `mcp-abap-connection`):

```bash
cd mcp-abap-connection

# Install dependencies (if not already installed)
npm run install:local

# Build and pack
npm run pack
# Creates: mcp-abap-adt-connection-0.1.0.tgz
```

The `pack` script:
- Builds the package (`npm run build`)
- Creates tarball archive (`npm pack`)
- Archive contains only files listed in `package.json` → `files` field

## Step 2: Store Archive

### Option A: In Monorepo (Recommended)

Move archive to `packages/archives/`:

```bash
# From package directory
mv mcp-abap-adt-connection-0.1.0.tgz ../archives/

# Or from package repository root
mkdir -p archives
mv mcp-abap-adt-connection-0.1.0.tgz archives/
```

**Note:** Add `packages/archives/*.tgz` to `.gitignore` if you don't want to commit archives, or use Git LFS for large files.

### Option B: Local Storage

Store in a local directory:

```bash
mkdir -p ~/.npm-packages
mv mcp-abap-adt-connection-0.1.0.tgz ~/.npm-packages/
```

### Option C: Artifact Storage

Store in CI/CD artifact storage (GitHub Releases, S3, etc.)

## Step 3: Install from Archive

### In Monorepo

Update `package.json` in root project:

```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "file:./packages/archives/mcp-abap-adt-connection-0.1.0.tgz"
  }
}
```

Then:
```bash
npm install
```

### In Standalone Project

```bash
npm install ./path/to/mcp-abap-adt-connection-0.1.0.tgz
```

Or in `package.json`:
```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "file:./archives/mcp-abap-adt-connection-0.1.0.tgz"
  }
}
```

## Archive Contents

The archive contains:
- ✅ Built files (`dist/`)
- ✅ Binaries (`bin/`)
- ✅ Documentation (`README.md`, `LICENSE`)
- ✅ Package metadata (`package.json`)
- ❌ Source files (`src/`) - excluded
- ❌ Development files (`node_modules/`, tests) - excluded

This ensures:
- **Small size** (only production files)
- **Fast installation** (no build step)
- **Isolation** (no access to source code)

## Versioning

Archive filename includes version: `mcp-abap-adt-connection-0.1.0.tgz`

To update:
1. Bump version in `package.json`
2. Generate new archive
3. Update dependency path in consuming project

## Automation

### CI/CD Pipeline

```yaml
# Example GitHub Actions
- name: Build and pack
  run: |
    cd /path/to/mcp-abap-connection
    npm install
    npm run pack
    mv *.tgz ./archives/
```

### Script for Monorepo

Create `scripts/pack-packages.sh`:

```bash
#!/bin/bash
# For connection package
cd /path/to/mcp-abap-connection
npm install
npm run pack
mv *.tgz ./archives/

# For adt-clients package
cd /path/to/mcp-abap-adt-clients
npm install
npm run pack
mv *.tgz ../archives/
```

## Advantages

✅ **Complete isolation** - consuming project doesn't need package source  
✅ **Fast installation** - no build step, no Git clone  
✅ **Version control** - archive filename includes version  
✅ **No external dependencies** - works offline  
✅ **Small size** - only production files included  

## Disadvantages

⚠️ **Manual process** - need to regenerate archives on changes  
⚠️ **Storage** - archives need to be stored somewhere  
⚠️ **Version management** - need to update paths when version changes  

