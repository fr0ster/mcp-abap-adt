# Package Independence Guide

This document explains how the `@mcp-abap-adt/connection` and `@mcp-abap-adt/adt-clients` packages can be used both as:
1. **Git submodules** in the `mcp-abap-adt` monorepo
2. **Independent repositories** for separate development

## Package Structure

Both packages are independent Git repositories that can be:
- Cloned separately for standalone development
- Used as git submodules in the monorepo

## TypeScript Configuration

### Package tsconfig.json

Packages use **self-contained** `tsconfig.json` that works both in monorepo and as standalone repositories:

**Key points:**
- ✅ No `extends` from monorepo root (works standalone)
- ✅ No `references` to other packages (TypeScript resolves types via npm packages)
- ✅ Self-contained compiler options
- ✅ Works in both contexts without modification

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2022"],
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  }
}
```

## Package Dependencies

### In Monorepo

In the monorepo, npm workspaces automatically resolve git dependencies to local packages:

```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "git+ssh://git@github.com:fr0ster/mcp-abap-connection.git"
  }
}
```

npm workspaces will automatically link local packages, so git dependencies work seamlessly.

### As Independent Repositories

When used separately, git dependencies are resolved from GitHub:

```bash
# For adt-clients package
npm install
# This will install @mcp-abap-adt/connection from git
```

**Note:** The `package.json` uses git URLs for dependencies. This allows:
- ✅ Private packages (not published to npmjs)
- ✅ Works in monorepo (npm workspaces links local packages)
- ✅ Works standalone (npm installs from git)

To use a specific version or branch:
```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "git+ssh://git@github.com:fr0ster/mcp-abap-connection.git#v0.1.0"
  }
}
```

## Development Workflow

### Working in Monorepo

1. Clone with submodules:
   ```bash
   git clone --recurse-submodules https://github.com/fr0ster/mcp-abap-adt.git
   ```

2. Install dependencies (from root):
   ```bash
   npm install
   ```

3. Build all packages:
   ```bash
   npm run build
   ```

### Working with Individual Packages

1. Clone the package repository:
   ```bash
   git clone https://github.com/fr0ster/mcp-abap-adt-connection.git
   cd mcp-abap-adt-connection
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build:
   ```bash
   npm run build
   ```

## Publishing Considerations

When publishing packages to npm:

1. **Dependencies in `package.json`**:
   - In monorepo: `workspace:*` (automatically resolved by npm workspaces)
   - For standalone use: Install from npm: `npm install @mcp-abap-adt/connection@^0.1.0`
   - **Note:** The `package.json` in submodules uses `workspace:*` for monorepo compatibility. When using packages separately, npm will install from npm registry.

2. **TypeScript config**:
   - ✅ Already self-contained (no monorepo dependencies)
   - ✅ No `references` (TypeScript resolves types via npm packages)
   - ✅ Works in both contexts without modification

3. **Test build** in clean environment:
   ```bash
   git clean -xfd
   npm install
   npm run build
   ```

## Current Status

- ✅ `tsconfig.json` in packages is self-contained (no monorepo dependencies)
- ✅ No TypeScript `references` (works in standalone mode)
- ✅ Packages can be built independently
- ✅ `package.json` uses `workspace:*` (works in monorepo via npm workspaces)
- 📝 Documentation added for both use cases

