# ADT Clients Architecture

## Overview

Separation of ADT endpoint functionality into three classes to enable different access levels and reduce context for LLM.

## Package Structure `@mcp-abap-adt/adt-clients`

```
packages/adt-clients/
├── src/
│   ├── clients/
│   │   ├── ReadOnlyClient.ts      # Read-only operations (GET)
│   │   ├── CrudClient.ts          # Full CRUD (Create, Read, Update, Delete)
│   │   └── ManagementClient.ts    # Management operations (Activate, Check, etc.)
│   ├── utils/
│   │   └── internalUtils.ts       # Private utilities (encodeSapObjectName, etc.)
│   └── index.ts                   # Exports
├── package.json
└── tsconfig.json
```

## Classes

### 1. ReadOnlyClient

**Purpose:** Read-only operations (GET)

**Methods:**
- `getClass(name: string)`
- `getProgram(name: string)`
- `getFunction(name: string, group: string)`
- `getFunctionGroup(name: string)`
- `getTable(name: string)`
- `getStructure(name: string)`
- `getView(name: string)`
- `getDomain(name: string)`
- `getDataElement(name: string)`
- `getPackage(name: string)`
- `getInterface(name: string)`
- `getInclude(name: string)`
- `getIncludesList(name: string, type: string)`
- `getTypeInfo(name: string, type: string)`
- `getObjectInfo(parentType: string, parentName: string, maxDepth?: number)`
- `getObjectStructure(parentType: string, parentName: string, nodeId: string)`
- `getTransaction(name: string)`
- `getTableContents(tableName: string, maxRows?: number)`
- `getObjectsList(parentName: string, parentTechName: string, parentType: string)`
- `getObjectsByType(parentName: string, parentTechName: string, parentType: string, nodeId: string)`
- `getProgFullCode(name: string, type: string)`
- `getObjectNodeFromCache(...)`
- `getAdtTypes()`
- `getSqlQuery(sqlQuery: string, rowNumber?: number)`
- `getWhereUsed(name: string, type: string)`
- `searchObject(query: string, objectType?: string)`
- `getEnhancements(packageName?: string)`
- `getEnhancementImpl(name: string)`
- `getEnhancementSpot(name: string)`
- `getBdef(name: string)`
- `getTransport(transportNumber: string)`
- `getAbapAST(name: string, type: string)`
- `getAbapSemanticAnalysis(name: string, type: string)`
- `getAbapSystemSymbols()`
- `describeByList(objects: Array<{name: string, type: string}>)`

**Handlers:**
- handleGetClass
- handleGetProgram
- handleGetFunction
- handleGetFunctionGroup
- handleGetTable
- handleGetStructure
- handleGetView
- handleGetDomain
- handleGetDataElement
- handleGetPackage
- handleGetInterface
- handleGetInclude
- handleGetIncludesList
- handleGetTypeInfo
- handleGetObjectInfo
- handleGetObjectStructure
- handleGetTransaction
- handleGetTableContents
- handleGetObjectsList
- handleGetObjectsByType
- handleGetProgFullCode
- handleGetObjectNodeFromCache
- handleGetAllTypes
- handleGetSqlQuery
- handleGetWhereUsed
- handleSearchObject
- handleGetEnhancements
- handleGetEnhancementImpl
- handleGetEnhancementSpot
- handleGetBdef
- handleGetTransport
- handleGetAbapAST
- handleGetAbapSemanticAnalysis
- handleGetAbapSystemSymbols
- handleDescribeByList

---

### 2. CrudClient extends ReadOnlyClient

**Purpose:** Full CRUD functionality (Create, Read, Update, Delete)

**Additional methods (besides ReadOnlyClient):**

**Create:**
- `createClass(params: CreateClassParams)`
- `createProgram(params: CreateProgramParams)`
- `createInterface(params: CreateInterfaceParams)`
- `createFunctionGroup(params: CreateFunctionGroupParams)`
- `createFunctionModule(params: CreateFunctionModuleParams)`
- `createTable(params: CreateTableParams)`
- `createStructure(params: CreateStructureParams)`
- `createView(params: CreateViewParams)`
- `createDomain(params: CreateDomainParams)`
- `createDataElement(params: CreateDataElementParams)`
- `createPackage(params: CreatePackageParams)`
- `createTransport(params: CreateTransportParams)`

**Update:**
- `updateClassSource(name: string, source: string, transportRequest?: string)`
- `updateProgramSource(name: string, source: string, transportRequest?: string)`
- `updateInterfaceSource(name: string, source: string, transportRequest?: string)`
- `updateFunctionModuleSource(group: string, name: string, source: string, transportRequest?: string)`
- `updateViewSource(name: string, ddlSource: string, transportRequest?: string)`
- `updateDomain(name: string, params: UpdateDomainParams)`
- `updateDataElement(name: string, params: UpdateDataElementParams)`

**Delete:**
- `deleteObject(name: string, type: string, transportRequest?: string)`

**Handlers:**
- handleCreateClass
- handleCreateProgram
- handleCreateInterface
- handleCreateFunctionGroup
- handleCreateFunctionModule
- handleCreateTable
- handleCreateStructure
- handleCreateView
- handleCreateDomain
- handleCreateDataElement
- handleCreatePackage
- handleCreateTransport
- handleUpdateClassSource
- handleUpdateProgramSource
- handleUpdateInterfaceSource
- handleUpdateFunctionModuleSource
- handleUpdateViewSource
- handleUpdateDomain
- handleUpdateDataElement
- handleDeleteObject

---

### 3. ManagementClient

**Purpose:** Object management operations (activation, syntax checking)

**Methods:**
- `activateObject(objects: Array<{name: string, type: string}>)`
- `checkObject(name: string, type: string, version?: string)`

**Handlers:**
- handleActivateObject
- handleCheckObject

---

## Usage and Imports

### Importing Specific Clients

The package allows importing exactly the client variant you need:

```typescript
// Import only ReadOnlyClient
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';

// Import only CrudClient
import { CrudClient } from '@mcp-abap-adt/adt-clients';

// Import only ManagementClient
import { ManagementClient } from '@mcp-abap-adt/adt-clients';

// Import all clients
import { ReadOnlyClient, CrudClient, ManagementClient } from '@mcp-abap-adt/adt-clients';
```

### Read-Only MCP Server

```typescript
import { ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import { createAbapConnection } from '@mcp-abap-adt/connection';

const connection = createAbapConnection(config, logger);
const client = new ReadOnlyClient(connection);

// Read-only operations only
const program = await client.getProgram('Z_MY_PROGRAM');
const table = await client.getTable('Z_MY_TABLE');
const classes = await client.searchObject('ZCL_*', 'CLAS/OC');
```

### Full CRUD MCP Server

```typescript
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { createAbapConnection } from '@mcp-abap-adt/connection';

const connection = createAbapConnection(config, logger);
const client = new CrudClient(connection);

// Full CRUD functionality
await client.createProgram({ name: 'Z_NEW_PROG', ... });
await client.updateProgramSource('Z_NEW_PROG', 'REPORT z_new_prog.');
await client.deleteObject('Z_NEW_PROG', 'PROG/P');

// Also has all read-only methods (inherited from ReadOnlyClient)
const program = await client.getProgram('Z_NEW_PROG');
```

### Management Operations Only

```typescript
import { ManagementClient } from '@mcp-abap-adt/adt-clients';
import { createAbapConnection } from '@mcp-abap-adt/connection';

const connection = createAbapConnection(config, logger);
const management = new ManagementClient(connection);

// Activation and syntax checking
await management.activateObject([
  { name: 'Z_CLASS', type: 'CLAS/OC' }
]);
await management.checkObject('Z_CLASS', 'CLAS/OC');
```

### Combined Access (Proxy Pattern)

```typescript
import { ReadOnlyClient, ManagementClient } from '@mcp-abap-adt/adt-clients';
import { AbapConnection } from '@mcp-abap-adt/connection';

class ReadOnlyWithActivation {
  private readOnly: ReadOnlyClient;
  private management: ManagementClient;

  constructor(connection: AbapConnection) {
    this.readOnly = new ReadOnlyClient(connection);
    this.management = new ManagementClient(connection);
  }

  // Delegate to ReadOnlyClient
  getProgram = this.readOnly.getProgram.bind(this.readOnly);
  getTable = this.readOnly.getTable.bind(this.readOnly);
  // ... other read-only methods

  // Delegate to ManagementClient
  activateObject = this.management.activateObject.bind(this.management);
  checkObject = this.management.checkObject.bind(this.management);
}
```

### Custom Client Composition

```typescript
import { ReadOnlyClient, CrudClient, ManagementClient } from '@mcp-abap-adt/adt-clients';

// Create a custom client that combines specific functionality
class CustomAbapClient {
  private readOnly: ReadOnlyClient;
  private crud: CrudClient;
  private management: ManagementClient;

  constructor(connection: AbapConnection) {
    this.readOnly = new ReadOnlyClient(connection);
    this.crud = new CrudClient(connection);
    this.management = new ManagementClient(connection);
  }

  // Expose only what you need
  getProgram = this.readOnly.getProgram.bind(this.readOnly);
  createProgram = this.crud.createProgram.bind(this.crud);
  activateObject = this.management.activateObject.bind(this.management);
}
```

---

## Benefits

1. **Reduced Context for LLM:**
   - Read-only MCP exposes only ~30 tools instead of 58
   - Fewer tokens, faster processing
   - More focused context

2. **Flexibility:**
   - Different MCP servers with different access levels
   - Ability to combine classes via proxy pattern
   - Import only what you need

3. **Security:**
   - Read-only access cannot modify the system
   - Perfect for production systems
   - Fine-grained access control

4. **Testing:**
   - Easy to mock individual classes
   - Independent testing of each level
   - Better test isolation

5. **Publishing:**
   - Can publish as separate package
   - Community can use only read-only functionality
   - Smaller bundle size for read-only use cases

---

## Dependencies

```json
{
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

---

## Interfaces

```typescript
interface AbapConnection {
  makeAdtRequest(options: AbapRequestOptions): Promise<AxiosResponse>;
  getBaseUrl(): Promise<string>;
  getAuthHeaders(): Promise<Record<string, string>>;
}

interface CreateClassParams {
  name: string;
  packageName: string;
  description?: string;
  transportRequest?: string;
  // ... other parameters
}

interface UpdateDomainParams {
  packageName: string;
  dataType: string;
  length?: number;
  decimals?: number;
  transportRequest?: string;
  activate?: boolean;
  // ... other parameters
}
```

---

## Implementation Plan

1. Create package `@mcp-abap-adt/adt-clients`
2. Extract handlers into separate modules
3. Create three classes with methods
4. Implement private utilities
5. Update MCP server to use classes
6. Create proxy for combined access
7. Add tests
8. Publish package

## Export Structure

The package will export clients individually, allowing tree-shaking and selective imports:

```typescript
// packages/adt-clients/src/index.ts
export { ReadOnlyClient } from './clients/ReadOnlyClient';
export { CrudClient } from './clients/CrudClient';
export { ManagementClient } from './clients/ManagementClient';

// Type exports
export type { ReadOnlyClient as IReadOnlyClient } from './clients/ReadOnlyClient';
export type { CrudClient as ICrudClient } from './clients/CrudClient';
export type { ManagementClient as IManagementClient } from './clients/ManagementClient';
```

This allows:
- Tree-shaking: Only imported code is bundled
- Selective imports: Import only what you need
- Type safety: Full TypeScript support
- Clear API: Explicit client selection

