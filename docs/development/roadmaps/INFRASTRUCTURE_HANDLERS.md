# Infrastructure Handlers for adt-clients

This document lists handlers from `mcp-abap-adt` that need to be implemented in the `infrastructure` module of `@mcp-abap-adt/adt-clients` package.

## Categories

### 1. Handlers using direct endpoints (need infrastructure module)

These handlers currently use `makeAdtRequest`/`makeAdtRequestWithTimeout` directly instead of using adt-clients:

#### System/Repository Operations
- **`GetWhereUsed`** (`system/readonly/handleGetWhereUsed.ts`)
  - Endpoint: `/sap/bc/adt/repository/informationsystem/usageReferences`
  - Method: POST with XML body
  - Purpose: Get where-used references for ABAP objects
  - Status: ✅ Fully implemented with direct endpoint

- **`GetObjectStructure`** (`system/readonly/handleGetObjectStructure.ts`)
  - Endpoint: `/sap/bc/adt/repository/objectstructure`
  - Method: GET with query parameters
  - Purpose: Retrieve ADT object structure as compact JSON tree
  - Status: ✅ Fully implemented with direct endpoint

- **`GetObjectInfo`** (`system/readonly/handleGetObjectInfo.ts`)
  - Endpoint: `/sap/bc/adt/repository/nodestructure`
  - Method: POST with parameters
  - Purpose: Return ABAP object tree with root, group nodes, and terminal leaves
  - Status: ✅ Fully implemented with direct endpoint

- **`GetObjectNodeFromCache`** (`system/readonly/handleGetObjectNodeFromCache.ts`)
  - Endpoint: Dynamic (from OBJECT_URI)
  - Method: GET
  - Purpose: Returns a node from in-memory cache and expands OBJECT_URI if present
  - Status: ✅ Fully implemented with direct endpoint

- **`GetTypeInfo`** (`system/readonly/handleGetTypeInfo.ts`)
  - Endpoints: 
    - `/sap/bc/adt/ddic/domains/{name}/source/main`
    - `/sap/bc/adt/ddic/dataelements/{name}`
    - `/sap/bc/adt/ddic/tabletypes/{name}`
    - `/sap/bc/adt/repository/informationsystem/objectproperties/values`
  - Method: GET (with fallback chain)
  - Purpose: Retrieve ABAP type information (domain, data element, table type)
  - Status: ✅ Fully implemented with direct endpoints

- **`GetAllTypes`** (`system/readonly/handleGetAllTypes.ts`)
  - Endpoint: `/sap/bc/adt/repository/informationsystem/objecttypes`
  - Method: GET with query parameters
  - Purpose: Retrieve all valid ADT object types
  - Status: ✅ Fully implemented with direct endpoint

- **`GetSqlQuery`** (`system/readonly/handleGetSqlQuery.ts`)
  - Endpoint: `/sap/bc/adt/datapreview/freestyle`
  - Method: POST with SQL query in body
  - Purpose: Execute freestyle SQL queries via SAP ADT Data Preview API
  - Status: ✅ Fully implemented with direct endpoint

- **`GetTransaction`** (`system/readonly/handleGetTransaction.ts`)
  - Endpoint: Not implemented (commented out)
  - Method: N/A
  - Purpose: Retrieve ABAP transaction details
  - Status: ❌ Not implemented (returns "Not implemented" message)

- **`GetSession`** (`system/readonly/handleGetSession.ts`)
  - Endpoint: N/A (session management)
  - Method: N/A
  - Purpose: Get session ID and session state for reuse
  - Status: ✅ Implemented (uses session utilities, no direct ADT call)

#### Enhancement Operations
- **`GetEnhancementImpl`** (`enhancement/readonly/handleGetEnhancementImpl.ts`)
  - Endpoint: `/sap/bc/adt/enhancements/{spot}/{name}/source/main`
  - Method: GET
  - Purpose: Retrieve source code of specific enhancement implementation
  - Status: ✅ Fully implemented with direct endpoint

- **`GetEnhancementSpot`** (`enhancement/readonly/handleGetEnhancementSpot.ts`)
  - Endpoint: `/sap/bc/adt/enhancements/enhsxsb/{spot_name}`
  - Method: GET
  - Purpose: Retrieve metadata and list of implementations for enhancement spot
  - Status: ✅ Fully implemented with direct endpoint

- **`GetEnhancements`** (`enhancement/readonly/handleGetEnhancements.ts`)
  - Endpoints: 
    - `/sap/bc/adt/oo/classes/{name}/source/main/enhancements/elements`
    - `/sap/bc/adt/programs/programs/{name}/source/main/enhancements/elements`
    - `/sap/bc/adt/programs/includes/{name}/source/main/enhancements/elements`
  - Method: GET (with context parameter for includes)
  - Purpose: Retrieve enhancement implementations for ABAP programs/includes/classes
  - Status: ✅ Fully implemented with direct endpoints

#### Include Operations
- **`GetInclude`** (`include/readonly/handleGetInclude.ts`)
  - Endpoint: `/sap/bc/adt/programs/includes/{name}/source/main`
  - Method: GET
  - Purpose: Retrieve source code of specific ABAP include file
  - Status: ✅ Fully implemented with direct endpoint

- **`GetIncludesList`** (`include/readonly/handleGetIncludesList.ts`)
  - Endpoint: `/sap/bc/adt/repository/nodestructure` (via `fetchNodeStructure`)
  - Method: POST
  - Purpose: Recursively discover and list ALL include files within an ABAP program or include
  - Status: ✅ Fully implemented with direct endpoint

#### Behavior Definition Operations
- **`GetBdef`** (`behavior_definition/readonly/handleGetBdef.ts`)
  - Endpoint: `/sap/bc/adt/bo/behaviordefinitions/{name}/source/main`
  - Method: GET
  - Purpose: Retrieve source code of BDEF (Behavior Definition) for CDS entity
  - Status: ✅ Fully implemented with direct endpoint

#### Package Operations
- **`GetPackage`** (`package/readonly/handleGetPackage.ts`)
  - Endpoint: `/sap/bc/adt/repository/nodestructure`
  - Method: POST with parameters
  - Purpose: Retrieve ABAP package details and contents
  - Status: ✅ Fully implemented with direct endpoint

#### Transport Operations
- **`GetTransport`** (`transport/readonly/handleGetTransport.ts`)
  - Endpoint: `/sap/bc/adt/cts/transportrequests/{number}`
  - Method: GET with query parameters
  - Purpose: Retrieve ABAP transport request information
  - Status: ✅ Fully implemented with direct endpoint

#### Function Group Operations
- **`UpdateFunctionGroup`** (`function/high/handleUpdateFunctionGroup.ts`)
  - Endpoint: `/sap/bc/adt/functions/groups/{name}` (PUT)
  - Method: PUT (uses `connection.makeAdtRequest` directly)
  - Purpose: Update function group metadata (description)
  - Status: ⚠️ Partially implemented (uses CrudClient for lock/unlock, but direct endpoint for update)

#### Code Analysis (No ADT endpoints, but could benefit from infrastructure)
- **`GetAbapAST`** (`system/readonly/handleGetAbapAST.ts`)
  - Endpoint: N/A (local parsing)
  - Method: N/A
  - Purpose: Parse ABAP code and return AST (Abstract Syntax Tree)
  - Status: ✅ Implemented (local parsing, no ADT call)

- **`GetAbapSemanticAnalysis`** (`system/readonly/handleGetAbapSemanticAnalysis.ts`)
  - Endpoint: N/A (local parsing)
  - Method: N/A
  - Purpose: Perform semantic analysis on ABAP code
  - Status: ✅ Implemented (local parsing, no ADT call)

- **`GetAbapSystemSymbols`** (`system/readonly/handleGetAbapSystemSymbols.ts`)
  - Endpoint: N/A (uses other handlers)
  - Method: N/A
  - Purpose: Resolve ABAP symbols with SAP system information
  - Status: ✅ Implemented (uses other handlers, no direct ADT call)

- **`DescribeByList`** (`system/readonly/handleDescribeByList.ts`)
  - Endpoint: N/A (uses SearchObject handler)
  - Method: N/A
  - Purpose: Batch description for a list of ABAP objects
  - Status: ✅ Implemented (uses SearchObject handler)

### 2. Empty handler directories (not implemented)

These directories exist but contain no handler files:

- **`enhancement/high/`** - No high-level enhancement handlers
- **`enhancement/low/`** - No low-level enhancement handlers (only readonly)
- **`include/high/`** - No high-level include handlers
- **`include/low/`** - No low-level include handlers (only readonly)
- **`search/high/`** - No high-level search handlers
- **`search/low/`** - No low-level search handlers (only readonly)
- **`behavior_implementation/readonly/`** - No readonly behavior implementation handlers
- **`system/low/`** - No low-level system handlers
- **`system/high/`** - No high-level system handlers

## Summary

### Handlers requiring infrastructure module (direct endpoints)

1. **System/Repository:**
   - `GetWhereUsed` - Usage references
   - `GetObjectStructure` - Object structure tree
   - `GetObjectInfo` - Object tree with nodes
   - `GetObjectNodeFromCache` - Cache node expansion
   - `GetTypeInfo` - Type information (domain/data element/table type)
   - `GetAllTypes` - All ADT object types
   - `GetSqlQuery` - SQL query execution
   - `GetTransaction` - Transaction details (NOT IMPLEMENTED)

2. **Enhancement:**
   - `GetEnhancementImpl` - Enhancement implementation source
   - `GetEnhancementSpot` - Enhancement spot metadata
   - `GetEnhancements` - Enhancements for object

3. **Include:**
   - `GetInclude` - Include source code
   - `GetIncludesList` - List of includes in program

4. **Behavior Definition:**
   - `GetBdef` - Behavior definition source

5. **Package:**
   - `GetPackage` - Package details and contents

6. **Transport:**
   - `GetTransport` - Transport request information

7. **Function Group:**
   - `UpdateFunctionGroup` - Update metadata (partially direct)

### Recommended infrastructure module structure

```
src/infrastructure/
├── system/
│   ├── whereUsed.ts          # GetWhereUsed
│   ├── objectStructure.ts    # GetObjectStructure
│   ├── objectInfo.ts         # GetObjectInfo
│   ├── objectNodeCache.ts    # GetObjectNodeFromCache
│   ├── typeInfo.ts           # GetTypeInfo
│   ├── allTypes.ts           # GetAllTypes
│   ├── sqlQuery.ts           # GetSqlQuery
│   └── transaction.ts        # GetTransaction (to be implemented)
├── enhancement/
│   ├── enhancementImpl.ts    # GetEnhancementImpl
│   ├── enhancementSpot.ts    # GetEnhancementSpot
│   └── enhancements.ts       # GetEnhancements
├── include/
│   ├── include.ts           # GetInclude
│   └── includesList.ts      # GetIncludesList
├── behavior/
│   └── behaviorDefinition.ts # GetBdef
├── package/
│   └── package.ts           # GetPackage
├── transport/
│   └── transport.ts         # GetTransport
└── function/
    └── functionGroup.ts     # UpdateFunctionGroup (partial)
```

### Priority

**High Priority** (frequently used):
- `GetWhereUsed` - Critical for dependency analysis
- `GetObjectInfo` - Used for object tree navigation
- `GetEnhancements` - Important for enhancement discovery
- `GetIncludesList` - Used for include discovery
- `GetPackage` - Package contents listing

**Medium Priority**:
- `GetObjectStructure` - Object structure tree
- `GetTypeInfo` - Type information lookup
- `GetEnhancementImpl` / `GetEnhancementSpot` - Enhancement details
- `GetInclude` - Include source code
- `GetBdef` - Behavior definition source
- `GetTransport` - Transport request info

**Low Priority**:
- `GetAllTypes` - Object types listing
- `GetSqlQuery` - SQL query execution
- `GetObjectNodeFromCache` - Cache operations
- `GetTransaction` - Transaction details (not implemented)
- `UpdateFunctionGroup` - Partial implementation

