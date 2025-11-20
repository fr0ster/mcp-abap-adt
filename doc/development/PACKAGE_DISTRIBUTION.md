# Package Distribution Options

This document describes different ways to distribute and use `@mcp-abap-adt/connection` and `@mcp-abap-adt/adt-clients` packages.

## Option 1: Git Dependencies (Current)

**How it works:**
- Packages are separate Git repositories
- Dependencies use git URLs: `git+ssh://git@github.com:fr0ster/mcp-abap-connection.git`
- npm installs directly from Git

**Pros:**
- ✅ No npm registry needed
- ✅ Always latest version (or specific branch/tag)
- ✅ Works in both monorepo and standalone

**Cons:**
- ⚠️ Requires Git access
- ⚠️ Slower installation (clones repo)
- ⚠️ Installs full repo (not just built files)

**Usage:**
```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "git+ssh://git@github.com:fr0ster/mcp-abap-connection.git"
  }
}
```

## Option 2: Tarball Archives (Recommended for Private Packages)

**How it works:**
- Build package: `npm run pack` (creates `.tgz` file)
- Store archive locally or in repository
- Install from archive: `npm install ./package.tgz`

**Pros:**
- ✅ Complete isolation (only built files)
- ✅ Fast installation (no Git clone)
- ✅ Version control via file naming
- ✅ Works offline
- ✅ Can be stored in Git LFS or artifact storage

**Cons:**
- ⚠️ Manual archive generation
- ⚠️ Need to update archives on changes

**Usage:**

### Step 1: Generate Archive

In package repository:
```bash
# Navigate to the package repository (e.g., mcp-abap-connection)
cd /path/to/mcp-abap-connection
npm run pack
# Creates: mcp-abap-adt-connection-0.1.0.tgz
```

### Step 2: Store Archive

Option A - In repository (Git LFS recommended):
```bash
mkdir -p packages/archives
mv mcp-abap-adt-connection-0.1.0.tgz packages/archives/
git add packages/archives/*.tgz
```

Option B - Local storage:
```bash
mkdir -p ~/.npm-packages
mv mcp-abap-adt-connection-0.1.0.tgz ~/.npm-packages/
```

### Step 3: Install from Archive

In consuming project:
```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "file:./packages/archives/mcp-abap-adt-connection-0.1.0.tgz"
  }
}
```

Or absolute path:
```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "file:/home/user/.npm-packages/mcp-abap-adt-connection-0.1.0.tgz"
  }
}
```

## Option 3: Git Submodules (Current Monorepo Setup)

**How it works:**
- Packages are git submodules in `packages/` directory
- npm workspaces automatically link them
- Works seamlessly in monorepo

**Pros:**
- ✅ Automatic linking via workspaces
- ✅ Easy development (edit directly)
- ✅ Version control via submodule commits

**Cons:**
- ⚠️ Requires submodule management
- ⚠️ Not ideal for standalone use

**Usage:**
```bash
git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
cd mcp-abap-adt
npm install
```

## Option 4: Private npm Registry

**How it works:**
- Publish to private registry (GitHub Packages, npm private, etc.)
- Install like regular npm packages

**Pros:**
- ✅ Standard npm workflow
- ✅ Version management
- ✅ Dependency resolution

**Cons:**
- ⚠️ Requires registry setup
- ⚠️ Authentication needed
- ⚠️ May have costs

## Recommendation

For **private packages without npm publication**:

1. **Development**: Use Git submodules (current setup)
2. **Distribution**: Use tarball archives (Option 2)
3. **CI/CD**: Generate archives in build pipeline, store as artifacts

**Workflow:**
```bash
# In package repository
npm run pack
# Archive: mcp-abap-adt-connection-0.1.0.tgz

# In consuming project
npm install ./path/to/mcp-abap-adt-connection-0.1.0.tgz
```

This gives you:
- ✅ Complete isolation
- ✅ Fast installation
- ✅ No external dependencies
- ✅ Version control via file naming

