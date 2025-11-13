# ADT Clients Package Migration Plan

## Overview

Extract ADT endpoint handlers into a separate package `@mcp-abap-adt/adt-clients` with three client classes (ReadOnlyClient, CrudClient, ManagementClient) as a git submodule.

## Steps

### Step 1: Create Public Repository

```bash
# Create public repository on GitHub
gh repo create mcp-abap-adt-clients --public --description "ADT clients for SAP ABAP systems - Read-only, CRUD, and Management operations" --clone=false
```

**Repository:** `https://github.com/fr0ster/mcp-abap-adt-clients`

**License:** MIT (same as main project)

---

### Step 2: Add as Git Submodule

```bash
cd /home/okyslytsia/prj/mcp-abap-adt

# Remove old directory if exists
rm -rf packages/adt-clients

# Add as submodule
git submodule add git@github.com:fr0ster/mcp-abap-adt-clients.git packages/adt-clients
```

---

### Step 3: Create Package Structure

```bash
cd packages/adt-clients

# Initialize git (if not already)
git init

# Create structure
mkdir -p src/clients src/utils
touch src/index.ts
touch src/clients/ReadOnlyClient.ts
touch src/clients/CrudClient.ts
touch src/clients/ManagementClient.ts
touch src/utils/internalUtils.ts
touch package.json
touch tsconfig.json
touch README.md
touch LICENSE
```

---

### Step 4: Package Configuration

**package.json:**
```json
{
  "name": "@mcp-abap-adt/adt-clients",
  "version": "0.1.0",
  "description": "ADT clients for SAP ABAP systems - Read-only, CRUD, and Management operations",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "keywords": [
    "abap",
    "sap",
    "adt",
    "clients",
    "read-only",
    "crud",
    "mcp"
  ],
  "author": "Oleksii Kyslytsia <oleksij.kyslytsja@gmail.com>",
  "license": "MIT",
  "homepage": "https://github.com/fr0ster/mcp-abap-adt-clients#readme",
  "bugs": {
    "url": "https://github.com/fr0ster/mcp-abap-adt-clients/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/fr0ster/mcp-abap-adt-clients.git"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@mcp-abap-adt/connection": "workspace:*",
    "fast-xml-parser": "^5.2.5"
  },
  "devDependencies": {
    "@types/node": "^24.2.1",
    "typescript": "^5.9.2"
  }
}
```

**tsconfig.json:**
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
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### Step 5: Migrate Code

#### 5.1 Extract Handlers Logic

For each handler, extract the core logic (without MCP-specific response formatting):

**Example: ReadOnlyClient methods**

```typescript
// src/clients/ReadOnlyClient.ts
import { AbapConnection } from '@mcp-abap-adt/connection';
import { AxiosResponse } from 'axios';
import { encodeSapObjectName } from '../utils/internalUtils';

export class ReadOnlyClient {
  constructor(private connection: AbapConnection) {}

  async getProgram(name: string): Promise<AxiosResponse> {
    const baseUrl = await this.connection.getBaseUrl();
    const encodedName = encodeSapObjectName(name);
    const url = `${baseUrl}/sap/bc/adt/programs/programs/${encodedName.toLowerCase()}`;
    
    return this.connection.makeAdtRequest({
      url,
      method: 'GET',
      timeout: 30000
    });
  }

  async getClass(name: string): Promise<AxiosResponse> {
    // Extract logic from handleGetClass
  }

  // ... other read-only methods
}
```

#### 5.2 Extract Utilities

Move shared utilities to `src/utils/internalUtils.ts`:

```typescript
// src/utils/internalUtils.ts
export function encodeSapObjectName(objectName: string): string {
  return encodeURIComponent(objectName);
}

// Other shared utilities (XML parsing, etc.)
```

#### 5.3 Create CrudClient

```typescript
// src/clients/CrudClient.ts
import { ReadOnlyClient } from './ReadOnlyClient';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { AxiosResponse } from 'axios';

export class CrudClient extends ReadOnlyClient {
  constructor(connection: AbapConnection) {
    super(connection);
  }

  async createProgram(params: CreateProgramParams): Promise<AxiosResponse> {
    // Extract logic from handleCreateProgram
  }

  async updateProgramSource(name: string, source: string, transportRequest?: string): Promise<AxiosResponse> {
    // Extract logic from handleUpdateProgramSource
  }

  async deleteObject(name: string, type: string, transportRequest?: string): Promise<AxiosResponse> {
    // Extract logic from handleDeleteObject
  }

  // ... other CRUD methods
}
```

#### 5.4 Create ManagementClient

```typescript
// src/clients/ManagementClient.ts
import { AbapConnection } from '@mcp-abap-adt/connection';
import { AxiosResponse } from 'axios';

export class ManagementClient {
  constructor(private connection: AbapConnection) {}

  async activateObject(objects: Array<{name: string, type: string}>): Promise<AxiosResponse> {
    // Extract logic from handleActivateObject
  }

  async checkObject(name: string, type: string, version?: string): Promise<AxiosResponse> {
    // Extract logic from handleCheckObject
  }
}
```

---

### Step 6: Update Main Repository

#### 6.1 Update package.json

```json
{
  "dependencies": {
    "@mcp-abap-adt/connection": "workspace:*",
    "@mcp-abap-adt/adt-clients": "workspace:*",
    // ... other dependencies
  }
}
```

#### 6.2 Update Handlers to Use Clients

**Before (function-based):**
```typescript
// src/handlers/handleGetProgram.ts
export async function handleGetProgram(args: any) {
  const response = await makeAdtRequest(...);
  return return_response(response);
}
```

**After (class-based):**
```typescript
// src/handlers/handleGetProgram.ts
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { getManagedConnection } from '../lib/utils';

export async function handleGetProgram(args: any) {
  const connection = getManagedConnection();
  const client = new ReadOnlyClient(connection);
  
  const response = await client.getProgram(args.name);
  return return_response(response);
}
```

#### 6.3 Update MCP Server to Support Different Client Types

```typescript
// src/index.ts
import { ReadOnlyClient, CrudClient, ManagementClient } from '@mcp-abap-adt/adt-clients';

// Configuration option
const CLIENT_TYPE = process.env.MCP_CLIENT_TYPE || 'crud'; // 'readonly' | 'crud' | 'management'

let client: ReadOnlyClient | CrudClient | ManagementClient;

if (CLIENT_TYPE === 'readonly') {
  client = new ReadOnlyClient(connection);
} else if (CLIENT_TYPE === 'crud') {
  client = new CrudClient(connection);
} else {
  client = new ManagementClient(connection);
}
```

---

### Step 7: Commit and Push

```bash
cd packages/adt-clients

# Add files
git add .

# Initial commit
git commit -m "Initial commit: ADT clients package with ReadOnlyClient, CrudClient, and ManagementClient"

# Push to repository
git push -u origin main
```

---

### Step 8: Update Main Repository

```bash
cd /home/okyslytsia/prj/mcp-abap-adt

# Commit submodule addition
git add packages/adt-clients .gitmodules
git commit -m "Add adt-clients package as submodule"

# Update package.json
git add package.json
git commit -m "Add @mcp-abap-adt/adt-clients dependency"

# Update handlers to use clients
git add src/handlers/
git commit -m "Refactor handlers to use ADT clients classes"
```

---

## Migration Checklist

- [ ] Create GitHub repository `mcp-abap-adt-clients`
- [ ] Add repository as git submodule
- [ ] Create package structure
- [ ] Copy LICENSE from main repository
- [ ] Create package.json with dependencies
- [ ] Create tsconfig.json
- [ ] Extract ReadOnlyClient class with all read-only methods
- [ ] Extract CrudClient class extending ReadOnlyClient
- [ ] Extract ManagementClient class
- [ ] Extract internal utilities
- [ ] Create README.md with usage examples
- [ ] Create ARCHITECTURE.md (move from main repo)
- [ ] Build package (`npm run build`)
- [ ] Test package locally
- [ ] Commit and push to submodule repository
- [ ] Update main repository handlers to use clients
- [ ] Update main repository package.json
- [ ] Test main repository with new clients
- [ ] Commit changes to main repository
- [ ] Delete ADT_CLIENTS_ARCHITECTURE.md from main repo (moved to package)

---

## Key Differences: Functions → Methods

### Before (Functions)
```typescript
export async function handleGetProgram(args: any) {
  const response = await makeAdtRequest(...);
  return return_response(response);
}
```

### After (Class Methods)
```typescript
// In package
export class ReadOnlyClient {
  async getProgram(name: string): Promise<AxiosResponse> {
    return this.connection.makeAdtRequest({...});
  }
}

// In main repo handler
export async function handleGetProgram(args: any) {
  const client = new ReadOnlyClient(connection);
  const response = await client.getProgram(args.name);
  return return_response(response);
}
```

**Benefits:**
- ✅ Methods are part of a class (better organization)
- ✅ Can import only needed client class
- ✅ Clear separation of concerns
- ✅ Easier to test (mock the client)
- ✅ Type-safe method signatures

---

## Notes

- Handlers in main repository remain as functions (MCP tool handlers)
- Handlers use client classes internally
- Client classes return raw `AxiosResponse` (no MCP formatting)
- MCP response formatting stays in handlers (`return_response`, `return_error`)
- This allows clients to be used outside MCP context

