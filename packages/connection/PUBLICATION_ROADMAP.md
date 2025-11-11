# Publication Roadmap for @mcp-abap-adt/connection

## Current Status

- ✅ Package created and working
- ✅ TypeScript compiles
- ✅ Exports configured
- ✅ Repository specified in package.json
- ✅ License specified (MIT)

## What needs to be done before publication

### 1. README.md
**Status:** ❌ Missing

**What to add:**
- Package description and purpose
- Usage examples
- API documentation
- Installation: `npm install @mcp-abap-adt/connection`
- Dependencies and requirements
- **CLI tool usage** (how to run `sap-abap-auth` after installation)
- Code examples for:
  - Creating connection (Basic Auth)
  - Creating connection (JWT)
  - Using stateful sessions
  - Using with custom logger

**File:** `packages/connection/README.md`

---

### 2. Update package.json
**Status:** ⚠️ Additional fields needed

**What to add:**
```json
{
  "name": "@mcp-abap-adt/connection",
  "version": "0.1.0",
  "description": "ABAP connection layer for MCP ABAP ADT server",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "bin", "README.md", "LICENSE"],  // ⚠️ Add
  "keywords": [  // ⚠️ Add
    "abap",
    "sap",
    "adt",
    "connection",
    "mcp",
    "abap-adt"
  ],
  "author": "Oleksii Kyslytsia <oleksij.kyslytsja@gmail.com>",  // ⚠️ Add
  "homepage": "https://github.com/fr0ster/mcp-abap-adt#readme",  // ⚠️ Add
  "bugs": {  // ⚠️ Add
    "url": "https://github.com/fr0ster/mcp-abap-adt/issues"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "jest",
    "prepublishOnly": "npm run build"  // ⚠️ Add - automatic build before publication
  },
  "engines": {  // ⚠️ Add
    "node": ">=18.0.0"
  }
}
```

---

### 3. LICENSE file
**Status:** ❌ Missing in packages/connection

**What to do:**
- Copy LICENSE from project root to `packages/connection/LICENSE`
- Or create symlink
- Ensure license in package.json matches the file

---

### 4. .npmignore or files in package.json
**Status:** ⚠️ Needs configuration

**What to include in publication:**
- ✅ `dist/` - compiled code
- ✅ `bin/` - CLI tools (sap-abap-auth.js)
- ✅ `README.md` - documentation
- ✅ `LICENSE` - license
- ✅ `package.json` - configuration

**What to exclude:**
- ❌ `src/` - source code (optional, can be left)
- ❌ `tsconfig.json` - TypeScript configuration
- ❌ `tsconfig.tsbuildinfo` - TypeScript cache
- ❌ `node_modules/` - dependencies
- ❌ `*.test.ts` - tests
- ❌ `.git/` - git files

**Solution:** Add `files` to package.json (preferred) or create `.npmignore`

---

### 5. Versioning
**Status:** ⚠️ Current version 0.1.0

**Recommendations:**
- Use [Semantic Versioning](https://semver.org/)
- Start with `0.1.0` for first publication
- For breaking changes: `1.0.0`, `2.0.0`, etc.
- For new features: `0.2.0`, `0.3.0`, etc.
- For bug fixes: `0.1.1`, `0.1.2`, etc.

**Commands:**
```bash
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.0 -> 0.2.0
npm version major  # 0.1.0 -> 1.0.0
```

---

### 6. Testing before publication
**Status:** ⚠️ Needs verification

**What to check:**
1. Build works: `cd packages/connection && npm run build`
2. Tests pass (if any): `npm test`
3. Package can be installed locally:
   ```bash
   cd packages/connection
   npm pack  # Creates .tgz file
   # In another project:
   npm install /path/to/@mcp-abap-adt-connection-0.1.0.tgz
   ```
4. Verify all exports are available after installation

---

### 7. npm account and scope
**Status:** ❓ Needs verification

**Step-by-step actions:**

#### 7.1. Create/verify npm account
**If you don't have npm account:**
1. Go to https://www.npmjs.com/signup
2. Create account (can use GitHub account for quick signup)
3. Verify email address
4. Enable 2FA (recommended for security)

**If you already have npm account:**
1. Verify you can login: `npm login`
2. Check current user: `npm whoami`

#### 7.2. Check scope availability
**For scoped package `@mcp-abap-adt/connection`:**

**Option A: Use existing organization (if you have one)**
```bash
# Check if you're member of organization
npm org ls @mcp-abap-adt

# If organization exists and you're member - you can publish
```

**Option B: Create new organization**
1. Go to https://www.npmjs.com/org/create
2. Create organization `@mcp-abap-adt`
3. Choose plan (free plan allows unlimited public packages)
4. After creation, you can publish packages under this scope

**Option C: Use personal scope**
If you don't want to create organization, change package name in `package.json`:
```json
{
  "name": "@fr0ster/mcp-abap-adt-connection"
}
```
Then publish normally - personal scoped packages work automatically.

**Option D: Publish without scope**
Change package name in `package.json`:
```json
{
  "name": "mcp-abap-adt-connection"
}
```
No scope needed, publish directly.

**Important:** One organization can contain multiple packages!

**Example:** Organization `@mcp-abap-adt` can contain:
- `@mcp-abap-adt/connection` (this package)
- `@mcp-abap-adt/server` (future)
- `@mcp-abap-adt/utils` (future)
- `@mcp-abap-adt/transport` (future)
- etc.

**Recommendation:** 
- If you plan to publish multiple packages → create **one** organization `@mcp-abap-adt` (all packages under same scope)
- If this is single package → use personal scope `@fr0ster/mcp-abap-adt-connection` or no scope

**You don't need separate organizations for each package!**

---

### 8. Publication
**Status:** ⏳ After completing all previous steps

**Step-by-step commands:**

```bash
cd packages/connection

# Step 1: Verify everything is ready
npm run build
npm test  # if tests exist

# Step 2: Check what will be published (dry run)
npm pack --dry-run
# This shows what files will be included in the package

# Step 3: Create actual package file to verify
npm pack
# Creates .tgz file - you can inspect it or test install locally

# Step 4: Login to npm (if not already logged in)
npm login
# Enter your npm username, password, and email
# If 2FA enabled, enter OTP code

# Step 5: Verify you're logged in
npm whoami
# Should show your npm username

# Step 6: Publish
npm publish --access public
# For scoped packages (@mcp-abap-adt/connection) --access public is required
# For non-scoped packages, just: npm publish
```

**Important notes:**
- For scoped packages (`@mcp-abap-adt/connection`) they are **private by default**
- Must use `--access public` for public publication
- First publication cannot be undone (but you can deprecate)
- After publication, package is immediately available on npm
- Version cannot be republished (must increment version)

---

### 9. After publication
**Status:** ⏳ After publication

**What to do:**
1. Verify on npm: https://www.npmjs.com/package/@mcp-abap-adt/connection
2. Update documentation in main repository
3. Add badge to main project README:
   ```markdown
   [![npm version](https://badge.fury.io/js/%40mcp-abap-adt%2Fconnection.svg)](https://www.npmjs.com/package/@mcp-abap-adt/connection)
   ```
4. Create GitHub release (optional)

---

## CLI Tool Usage After Installation

After installing the package, users can run the `sap-abap-auth` CLI tool in several ways:

### Option 1: Using npx (Recommended)
```bash
# Install package locally
npm install @mcp-abap-adt/connection

# Run CLI tool
npx sap-abap-auth auth -k path/to/service-key.json

# Or with options
npx sap-abap-auth auth -k service-key.json --browser chrome
npx sap-abap-auth auth -k service-key.json --output .env.production
```

### Option 2: Global Installation
```bash
# Install globally
npm install -g @mcp-abap-adt/connection

# Run directly (command is in PATH)
sap-abap-auth auth -k path/to/service-key.json
```

### Option 3: Via node_modules/.bin
```bash
# After local installation
./node_modules/.bin/sap-abap-auth auth -k path/to/service-key.json
```

### Option 4: Direct Node.js execution
```bash
# Run directly with node
node node_modules/@mcp-abap-adt/connection/bin/sap-abap-auth.js auth -k path/to/service-key.json
```

### CLI Command Reference
```bash
# Show help
sap-abap-auth --help
# or
npx sap-abap-auth --help

# Authenticate with service key
sap-abap-auth auth -k <service-key.json> [options]

# Options:
#   -k, --key <path>     Path to service key JSON file (required)
#   -b, --browser <name>  Browser to open (chrome, edge, firefox, system, none)
#   -o, --output <path>  Path to output .env file (default: .env)
#   -h, --help           Show help
```

**Note:** The `bin` field in `package.json` automatically creates the CLI command. When the package is installed, npm creates symlinks in `node_modules/.bin/` that point to the executable files.

---

## Pre-publication Checklist

- [ ] README.md created with examples
- [ ] package.json updated (keywords, author, files, prepublishOnly)
- [ ] LICENSE file present
- [ ] .npmignore or files configured
- [ ] Version set correctly
- [ ] Build works without errors
- [ ] Tests pass (if any)
- [ ] npm pack verified locally
- [ ] npm account configured
- [ ] Scope accessible or decided to use different one
- [ ] npm login completed
- [ ] npm publish --access public completed

---

## Additional Recommendations

### CI/CD for automatic publication
Can configure GitHub Actions for automatic publication on tag creation:
```yaml
# .github/workflows/publish-connection.yml
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: cd packages/connection && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{secrets.NPM_TOKEN}}
```

### TypeScript declarations
Ensure `types` in package.json points to correct file:
```json
"types": "dist/index.d.ts"
```

### Peer dependencies (if needed)
If package expects user to install certain dependencies:
```json
"peerDependencies": {
  "axios": "^1.11.0"
}
```

---

## Notes

- Package uses workspace in monorepo, so need to ensure it can work independently
- All dependencies should be in `dependencies`, not `devDependencies` (except TypeScript and development tools)
- For scoped packages, `--access public` is required on first publication
