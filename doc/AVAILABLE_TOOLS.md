# Available Tools Reference - MCP ABAP ADT Server

This document contains a complete list of all tools (functions) provided by the MCP ABAP ADT server, with descriptions of their purpose and parameters.

> **Note:** This document is automatically generated based on `TOOL_DEFINITION` from each handler module. To update the documentation, run:
> ```bash
> node tools/generate-tools-docs.js
> ```

## 📋 Table of Contents

- [Programs, Classes, Functions](#programs-classes-functions)
- [Tables and Structures](#tables-and-structures)
- [Packages and Interfaces](#packages-and-interfaces)
- [Includes and Hierarchies](#includes-and-hierarchies)
- [Types, Descriptions, Metadata](#types-descriptions-metadata)
- [Search, SQL, Transactions](#search-sql-transactions)
- [Enhancements](#enhancements)
- [ABAP Parser and Semantic Analysis](#abap-parser-and-semantic-analysis)
- [Batch Operations](#batch-operations)

---

## Programs, Classes, Functions

### GetProgram
**Description:** Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.

**Parameters:**
- `program_name` (string, required) - Name of the ABAP program

**Example:**
```json
{
  "program_name": "ZMY_PROGRAM"
}
```

### GetClass
**Description:** Retrieve ABAP class source code.

**Parameters:**
- `class_name` (string, required) - Name of the ABAP class

**Example:**
```json
{
  "class_name": "ZCL_MY_CLASS"
}
```

### GetFunction
**Description:** Retrieve ABAP Function Module source code.

**Parameters:**
- `function_name` (string, required) - Name of the function module
- `function_group` (string, required) - Name of the function group

**Example:**
```json
{
  "function_name": "Z_MY_FUNCTION",
  "function_group": "ZMY_FG"
}
```

### GetFunctionGroup
**Description:** Retrieve ABAP Function Group source code.

**Parameters:**
- `function_group` (string, required) - Name of the function group

**Example:**
```json
{
  "function_group": "ZMY_FG"
}
```

---

## Tables and Structures

### GetTable
**Description:** Retrieve ABAP table structure.

**Parameters:**
- `table_name` (string, required) - Name of the ABAP table

**Example:**
```json
{
  "table_name": "ZMY_TABLE"
}
```

### GetStructure
**Description:** Retrieve ABAP structure definition.

**Parameters:**
- `structure_name` (string, required) - Name of the ABAP structure

**Example:**
```json
{
  "structure_name": "ZMY_STRUCTURE"
}
```

### GetTableContents
**Description:** Retrieve contents of an ABAP table via ADT Data Preview API.

> **⚠️ ABAP Cloud Limitation:** Direct access to table data through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.

**Parameters:**
- `table_name` (string, required) - Name of the ABAP table
- `max_rows` (number, optional) - Maximum number of rows to return

**Example:**
```json
{
  "table_name": "ZMY_TABLE",
  "max_rows": 100
}
```

---

## Packages and Interfaces

### GetPackage
**Description:** Retrieve ABAP package details, including list of objects in the package.

**Parameters:**
- `package_name` (string, required) - Name of the ABAP package

**Example:**
```json
{
  "package_name": "ZMY_PACKAGE"
}
```

### GetInterface
**Description:** Retrieve ABAP interface source code.

**Parameters:**
- `interface_name` (string, required) - Name of the ABAP interface

**Example:**
```json
{
  "interface_name": "ZIF_MY_INTERFACE"
}
```

---

## Includes and Hierarchies

### GetInclude
**Description:** Retrieve source code of a specific ABAP include file.

**Parameters:**
- `include_name` (string, required) - Name of the ABAP include

**Example:**
```json
{
  "include_name": "ZMY_INCLUDE"
}
```

### GetIncludesList
**Description:** Recursively discover and list ALL include files within an ABAP program, function group, or class, including dependency hierarchy.

**Parameters:**
- `object_name` (string, required) - Name of the ABAP program, include, function group, or class
- `object_type` (string, required) - ADT object type (e.g., PROG/P, PROG/I, FUGR, CLAS/OC)

**Example:**
```json
{
  "object_name": "ZMY_PROGRAM",
  "object_type": "PROG/P"
}
```

### GetObjectStructure
**Description:** Retrieve ADT object structure as a compact JSON tree.

**Parameters:**
- `object_name` (string, required) - Name of the object
- `object_type` (string, required) - Type of the object

**Example:**
```json
{
  "object_name": "ZMY_PROGRAM",
  "object_type": "PROG/P"
}
```

---

## Types, Descriptions, Metadata

### GetTypeInfo
**Description:** Retrieve ABAP type information.

**Parameters:**
- `type_name` (string, required) - Name of the ABAP type

**Example:**
```json
{
  "type_name": "ZMY_TYPE"
}
```

### GetAdtTypes
**Description:** Retrieve all valid ADT object types.

**Parameters:** None

**Example:**
```json
{}
```

### GetObjectInfo
**Description:** Return ABAP object tree: root, group nodes, and terminal leaves up to maxDepth. Enrich each node via SearchObject if `enrich=true`. Group nodes are included for hierarchy. Each node has `node_type`: root, point, end.

**Parameters:**
- `object_name` (string, required) - Name of the object
- `object_type` (string, required) - Type of the object
- `maxDepth` (number, optional) - Maximum depth of the tree
- `enrich` (boolean, optional) - Whether to enrich nodes via SearchObject

**Example:**
```json
{
  "object_name": "ZMY_PROGRAM",
  "object_type": "PROG/P",
  "maxDepth": 3,
  "enrich": true
}
```

---

## Search, SQL, Transactions

### SearchObject
**Description:** Search for ABAP objects by name pattern. Parameters: `object_name` (with or without mask), `object_type` (optional), `maxResults` (optional). If `object_type` is specified, results are filtered by type.

**Parameters:**
- `object_name` (string, required) - Name or mask for search (e.g., "Z*", "*TEST*")
- `object_type` (string, optional) - Object type for filtering
- `maxResults` (number, optional) - Maximum number of results

**Example:**
```json
{
  "object_name": "Z*",
  "object_type": "CLAS/OC",
  "maxResults": 50
}
```

### GetSqlQuery
**Description:** Execute freestyle SQL queries via SAP ADT Data Preview API.

> **⚠️ ABAP Cloud Limitation:** Direct execution of SQL queries through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.

**Parameters:**
- `sql_query` (string, required) - SQL query to execute
- `row_number` (number, optional, default: 100) - Maximum number of rows to return

**Example:**
```json
{
  "sql_query": "SELECT * FROM ZMY_TABLE WHERE FIELD1 = 'VALUE'",
  "row_number": 100
}
```

### GetTransaction
**Description:** Retrieve ABAP transaction details.

**Parameters:**
- `transaction_name` (string, required) - Name of the ABAP transaction

**Example:**
```json
{
  "transaction_name": "SE80"
}
```

### GetWhereUsed
**Description:** Retrieve where-used references for ABAP objects via ADT usageReferences.

**Parameters:**
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - Type of the ABAP object
- `detailed` (boolean, optional) - Whether to return detailed information

**Example:**
```json
{
  "object_name": "ZCL_MY_CLASS",
  "object_type": "CLAS/OC",
  "detailed": true
}
```

---

## Enhancements

### GetEnhancements
**Description:** Retrieve a list of enhancements for a given ABAP object.

**Parameters:**
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - Type of the ABAP object

**Example:**
```json
{
  "object_name": "ZMY_PROGRAM",
  "object_type": "PROG/P"
}
```

### GetEnhancementSpot
**Description:** Retrieve metadata and list of implementations for a specific enhancement spot.

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot

**Example:**
```json
{
  "enhancement_spot": "ZMY_ENHANCEMENT_SPOT"
}
```

### GetEnhancementImpl
**Description:** Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot
- `enhancement_name` (string, required) - Name of the enhancement implementation

**Example:**
```json
{
  "enhancement_spot": "ZMY_ENHANCEMENT_SPOT",
  "enhancement_name": "ZMY_ENHANCEMENT_IMPL"
}
```

### GetBdef
**Description:** Retrieve the source code of a BDEF (Behavior Definition) for a CDS entity in ABAP Cloud.

**Parameters:**
- `bdef_name` (string, required) - Name of the Behavior Definition

**Example:**
```json
{
  "bdef_name": "ZMY_BDEF"
}
```

---

## ABAP Parser and Semantic Analysis

### GetAbapAST
**Description:** Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.

**Parameters:**
- `code` (string, required) - ABAP source code to parse
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{
  "code": "CLASS zcl_test DEFINITION.\n  PUBLIC SECTION.\n    METHODS: test.\nENDCLASS.",
  "filePath": "output/ast.json"
}
```

### GetAbapSemanticAnalysis
**Description:** Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.

**Parameters:**
- `code` (string, required) - ABAP source code to analyze
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{
  "code": "CLASS zcl_test DEFINITION.\n  PUBLIC SECTION.\n    DATA: mv_field TYPE string.\nENDCLASS.",
  "filePath": "output/semantic.json"
}
```

### GetAbapSystemSymbols
**Description:** Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.

**Parameters:**
- `symbols` (object, required) - Result from GetAbapSemanticAnalysis
- `object_name` (string, required) - Name of the object for context
- `object_type` (string, required) - Type of the object

**Example:**
```json
{
  "symbols": { /* result from GetAbapSemanticAnalysis */ },
  "object_name": "ZCL_MY_CLASS",
  "object_type": "CLAS/OC"
}
```

---

## Batch Operations

### GetObjectsByType
**Description:** Retrieves all ABAP objects of a specific type under a given node.

**Parameters:**
- `object_type` (string, required) - Type of objects to search for
- `parent_node` (string, optional) - Parent node for filtering

**Example:**
```json
{
  "object_type": "CLAS/OC",
  "parent_node": "ZMY_PACKAGE"
}
```

### GetObjectsList
**Description:** Recursively retrieves all valid ABAP repository objects for a given parent (program, function group, etc.) including nested includes.

**Parameters:**
- `object_name` (string, required) - Name of the parent object
- `object_type` (string, required) - Type of the parent object

**Example:**
```json
{
  "object_name": "ZMY_PROGRAM",
  "object_type": "PROG/P"
}
```

### GetProgFullCode
**Description:** Returns the full code for a program or function group, including all includes, in tree traversal order.

**Parameters:**
- `object_name` (string, required) - Name of the program or function group
- `object_type` (string, required) - Type of the object (PROG/P or FUGR)

**Example:**
```json
{
  "object_name": "ZMY_PROGRAM",
  "object_type": "PROG/P"
}
```

### GetObjectNodeFromCache
**Description:** Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.

**Parameters:**
- `object_type` (string, required) - Type of the object
- `object_name` (string, required) - Name of the object
- `tech_name` (string, optional) - Technical name

**Example:**
```json
{
  "object_type": "CLAS/OC",
  "object_name": "ZCL_MY_CLASS",
  "tech_name": "ZCL_MY_CLASS"
}
```

### DescribeByList
**Description:** Batch description for a list of ABAP objects. Input: `objects`: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.

**Parameters:**
- `objects` (array, required) - Array of objects with `name` and optional `type` fields

**Example:**
```json
{
  "objects": [
    { "name": "ZMY_PROGRAM", "type": "PROG/P" },
    { "name": "ZCL_MY_CLASS", "type": "CLAS/OC" },
    { "name": "ZMY_TABLE", "type": "TABLE" }
  ]
}
```

---

## Batch Detection Tools

### DetectObjectTypeListArray
**Description:** Batch detection of ABAP object types. Accepts an array of objects via the `objects` parameter.

For more details, see: [doc/DetectObjectTypeListTools.md](DetectObjectTypeListTools.md)

### DetectObjectTypeListJson
**Description:** Batch detection of ABAP object types. Accepts a JSON payload with an `objects` array via the `payload` parameter.

For more details, see: [doc/DetectObjectTypeListTools.md](DetectObjectTypeListTools.md)

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

*Last updated: 2025-01-XX*
*Document version: 1.0*
