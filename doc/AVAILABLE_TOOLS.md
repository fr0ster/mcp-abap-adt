# Available Tools Reference - MCP ABAP ADT Server

This document contains a complete list of all tools (functions) provided by the MCP ABAP ADT server, with descriptions of their purpose and parameters.

> **Note:** This document is automatically generated from `TOOL_DEFINITION` exports in handler modules. To regenerate, run:
> ```bash
> npm run docs:tools
> ```

## 📋 Table of Contents

- [Programs, Classes, Functions](#programs,-classes,-functions)
- [Tables and Structures](#tables-and-structures)
- [Packages and Interfaces](#packages-and-interfaces)
- [Includes and Hierarchies](#includes-and-hierarchies)
- [Types, Descriptions, Metadata](#types,-descriptions,-metadata)
- [Search, SQL, Transactions](#search,-sql,-transactions)
- [Enhancements](#enhancements)
- [ABAP Parser and Semantic Analysis](#abap-parser-and-semantic-analysis)
- [Batch Operations](#batch-operations)

---

## Programs, Classes, Functions

### GetClass
**Description:** Retrieve ABAP class source code.

**Parameters:**
- `inputSchema` (string, optional) - Name of the ABAP class

**Example:**
```json
{}
```

---

### GetFunction
**Description:** Retrieve ABAP Function Module source code.

**Parameters:**
- `inputSchema` (string, optional) - Name of the function module
- `function_group` (string, required) - Name of the function group

**Example:**
```json
{
  "function_group": "\"example_value\""
}
```

---

### GetFunctionGroup
**Description:** Retrieve ABAP Function Group source code.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetProgram
**Description:** Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.

**Parameters:**
- `inputSchema` (string, optional) - Name of the ABAP program

**Example:**
```json
{}
```

---

## Tables and Structures

### GetStructure
**Description:** Retrieve ABAP Structure.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetTable
**Description:** Retrieve ABAP table structure.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetTableContents
**Description:** Retrieve contents of an ABAP table.

> **⚠️ ABAP Cloud Limitation:** Direct access to table data through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.

**Parameters:** None

**Example:**
```json
{}
```

---

## Packages and Interfaces

### GetInterface
**Description:** Retrieve ABAP interface source code.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetPackage
**Description:** Retrieve ABAP package details.

**Parameters:** None

**Example:**
```json
{}
```

---

## Includes and Hierarchies

### GetInclude
**Description:** Retrieve source code of a specific ABAP include file.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetIncludesList
**Description:** Recursively discover and list ALL include files within an ABAP program or include.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetObjectStructure
**Description:** Retrieve ADT object structure as a compact JSON tree.

**Parameters:**
- `inputSchema` (string, optional) - ADT object type (e.g. DDLS/DF)
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)

**Example:**
```json
{
  "objectname": "\"ZMY_OBJECTNAME\""
}
```

---

## Types, Descriptions, Metadata

### GetAdtTypes
**Description:** Retrieve all valid ADT object types.

**Parameters:**
- `inputSchema` (string, optional) - Type name to validate (optional)

**Example:**
```json
{}
```

---

### GetObjectInfo
**Description:** Return ABAP object tree: root, group nodes, and terminal leaves up to maxDepth. Enrich each node via SearchObject if enrich=true. Group nodes are included for hierarchy. Each node has node_type: root, point, end.

**Parameters:**
- `inputSchema` (string, optional) - Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)
- `parent_name` (string, required) - Parent object name
- `maxDepth` (integer, optional (default: "1")) - Maximum tree depth (default depends on type)
- `enrich` (boolean, optional (default: "true")) - Whether to add description and package via SearchObject (default true)

**Example:**
```json
{
  "parent_name": "\"ZMY_PARENT_NAME\"",
  "maxDepth": "\"example\"",
  "enrich": "true"
}
```

---

### GetTypeInfo
**Description:** Retrieve ABAP type information.

**Parameters:** None

**Example:**
```json
{}
```

---

## Search, SQL, Transactions

### GetSqlQuery
**Description:** Execute freestyle SQL queries via SAP ADT Data Preview API.

> **⚠️ ABAP Cloud Limitation:** Direct execution of SQL queries through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetTransaction
**Description:** Retrieve ABAP transaction details.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetWhereUsed
**Description:** Retrieve where-used references for ABAP objects via ADT usageReferences.

**Parameters:** None

**Example:**
```json
{}
```

---

### SearchObject
**Description:** Search for ABAP objects by name pattern. Parameters: object_name (with or without mask), object_type (optional), maxResults (optional). If object_type is specified, results are filtered by type.

**Parameters:**
- `inputSchema` (string, optional) - Object name or mask (e.g. 
- `object_type` (string, optional) - Optional ABAP object type (e.g. 
- `maxResults` (number, optional (default: "100")) - Maximum number of results to return

**Example:**
```json
{
  "maxResults": "100"
}
```

---

## Enhancements

### GetBdef
**Description:** Retrieve the source code of a BDEF (Behavior Definition) for a CDS entity.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetEnhancementImpl
**Description:** Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetEnhancements
**Description:** Retrieve a list of enhancements for a given ABAP object.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetEnhancementSpot
**Description:** Retrieve metadata and list of implementations for a specific enhancement spot.

**Parameters:** None

**Example:**
```json
{}
```

---

## ABAP Parser and Semantic Analysis

### GetAbapAST
**Description:** Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.

**Parameters:**
- `inputSchema` (string, optional) - ABAP source code to parse
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{}
```

---

### GetAbapSemanticAnalysis
**Description:** Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.

**Parameters:**
- `inputSchema` (string, optional) - ABAP source code to analyze
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{}
```

---

### GetAbapSystemSymbols
**Description:** Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.

**Parameters:**
- `inputSchema` (string, optional) - ABAP source code to analyze and resolve symbols for
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{}
```

---

## Batch Operations

### DescribeByList
**Description:** Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.

**Parameters:**
- `inputSchema` (string, optional) - Object name (required, must be valid ABAP object name or mask)
- `type` (string, optional) - Optional type (e.g. PROG/P, CLAS/OC, etc.)

**Example:**
```json
{}
```

---

### GetObjectNodeFromCache
**Description:** Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.

**Parameters:**
- `inputSchema` (string, optional) - Object type
- `object_name` (string, required) - Object name
- `tech_name` (string, required) - Technical name

**Example:**
```json
{
  "object_name": "\"ZMY_OBJECT_NAME\"",
  "tech_name": "\"ZMY_TECH_NAME\""
}
```

---

### GetObjectsByType
**Description:** Retrieves all ABAP objects of a specific type under a given node.

**Parameters:**
- `inputSchema` (string, optional) - Parent object name
- `parent_tech_name` (string, required) - Parent technical name
- `parent_type` (string, required) - Parent object type
- `node_id` (string, required) - Node ID
- `format` (string, optional) - Output format: 
- `with_short_descriptions` (boolean, optional) - Include short descriptions

**Example:**
```json
{
  "parent_tech_name": "\"ZMY_PARENT_TECH_NAME\"",
  "parent_type": "\"PROG/P\"",
  "node_id": "\"example_value\""
}
```

---

### GetObjectsList
**Description:** Recursively retrieves all valid ABAP repository objects for a given parent (program, function group, etc.) including nested includes.

**Parameters:**
- `inputSchema` (string, optional) - Parent object name
- `parent_tech_name` (string, required) - Parent technical name
- `parent_type` (string, required) - Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional (default: "true)")) - Include short descriptions (default: true)

**Example:**
```json
{
  "parent_tech_name": "\"ZMY_PARENT_TECH_NAME\"",
  "parent_type": "\"PROG/P\"",
  "with_short_descriptions": "true)"
}
```

---

### GetProgFullCode
**Description:** Returns the full code for a program or function group, including all includes, in tree traversal order.

**Parameters:**
- `inputSchema` (string, optional) - Technical name of the program or function group (e.g., 

**Example:**
```json
{}
```

---

## Notes

### ABAP Cloud Limitations

Some functions have limitations when working with ABAP Cloud on SAP BTP:

- **GetTableContents** - Direct access to table data is blocked
- **GetSqlQuery** - Direct execution of SQL queries is blocked

These functions work only for on-premise systems.

### Caching

All handler modules use a centralized in-memory cache (`objectsListCache`) to improve performance and consistency.

### Response Format

All functions return MCP-compliant responses in the following format:
```typescript
{
  isError: boolean;
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

---

## Additional Information

- [Tools Architecture](../TOOLS_ARCHITECTURE.md) - Technical documentation about the tools architecture
- [Installation Guide](INSTALLATION_GUIDE_UA.md) - Setup and configuration instructions
- [README](../README.md) - Main project documentation

---

*Last updated: 2025-11-16*
*Document version: 1.0*
*Generated automatically from TOOL_DEFINITION exports*
