# Available Tools Reference - MCP ABAP ADT Server

This document contains a complete list of all tools (functions) provided by the MCP ABAP ADT server, with descriptions of their purpose and parameters.

> **Note:** This document is automatically generated from `TOOL_DEFINITION` exports in handler modules. To regenerate, run:
> ```bash
> npm run docs:tools
> ```

## 📋 Table of Contents

- [Programs, Classes, Functions](#programs-classes-functions)
- [Tables and Structures](#tables-and-structures)
- [Dictionary Objects (Domains, Data Elements)](#dictionary-objects-domains-data-elements)
- [Dictionary Objects (Tables, Structures, Views)](#dictionary-objects-tables-structures-views)
- [Transport Management](#transport-management)
- [Packages and Interfaces](#packages-and-interfaces)
- [Includes and Hierarchies](#includes-and-hierarchies)
- [Types, Descriptions, Metadata](#types-descriptions-metadata)
- [Search, SQL, Transactions](#search-sql-transactions)
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

## Dictionary Objects (Domains, Data Elements)

### GetDomain
**Description:** Retrieve ABAP domain structure and properties from SAP system.

**Parameters:**
- `domain_name` (string, required): Domain name (e.g., MATNR, CHAR20, ZZ_TEST_DOMAIN)

**Example:**
```json
{
  "domain_name": "ZZ_TEST_MCP_25"
}
```

**Response includes:**
- Domain metadata (name, type, description, version)
- Type information (datatype, length, decimals)
- Output information (conversion exit, lowercase, sign)
- Value information (value table, fixed values)
- Package and responsible user

---

### CreateDomain
**Description:** Create a new ABAP domain in SAP system. Creates domain with all properties in one call and activates it automatically.

**Parameters:**
- `domain_name` (string, required): Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.
- `description` (string, optional): Domain description. If not provided, domain_name will be used.
- `package_name` (string, required): Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, required): Transport request number (e.g., E19K905635). Required for transportable packages.
- `datatype` (string, optional, default: "CHAR"): Data type - CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `length` (number, optional, default: 100): Field length (max depends on datatype)
- `decimals` (number, optional, default: 0): Decimal places (for DEC, CURR, QUAN types)
- `conversion_exit` (string, optional): Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `lowercase` (boolean, optional, default: false): Allow lowercase input
- `sign_exists` (boolean, optional, default: false): Field has sign (+/-)
- `value_table` (string, optional): Value table name for foreign key relationship

**Example:**
```json
{
  "domain_name": "ZZ_TEST_MCP_25",
  "description": "Test domain created via MCP",
  "package_name": "ZOK_LOCAL",
  "transport_request": "E19K905635",
  "datatype": "CHAR",
  "length": 50,
  "decimals": 0,
  "lowercase": false,
  "sign_exists": false
}
```

**Workflow:**
1. POST creates domain with all properties
2. Activate domain
3. Verify activation

**Response includes:**
- Success status
- Domain name and version
- Package and transport request
- Domain details (datatype, length, decimals)

**Note:** SAP handles locking automatically on the transport. Domain is created and activated in one operation.

---

### CreateDataElement
**Description:** Create a new ABAP data element in SAP system. Creates data element with all properties including domain reference and field labels, then activates it automatically.

**Parameters:**
- `data_element_name` (string, required): Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions.
- `description` (string, optional): Data element description. If not provided, data_element_name will be used.
- `package_name` (string, required): Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, required): Transport request number (e.g., E19K905635). Required for transportable packages.
- `domain_name` (string, required): Domain name to use as type reference (e.g., ZZ_TEST_0001)
- `data_type` (string, optional, default: "CHAR"): Data type (e.g., CHAR, NUMC). Usually inherited from domain.
- `length` (number, optional, default: 100): Data type length. Usually inherited from domain.
- `decimals` (number, optional, default: 0): Decimal places. Usually inherited from domain.
- `short_label` (string, optional): Short field label (max 10 chars)
- `medium_label` (string, optional): Medium field label (max 20 chars)
- `long_label` (string, optional): Long field label (max 40 chars)
- `heading_label` (string, optional): Heading field label (max 55 chars)

**Example:**
```json
{
  "data_element_name": "ZZ_E_TEST_MCP_01",
  "description": "Test data element created via MCP",
  "package_name": "ZOK_LOCAL",
  "transport_request": "E19K905635",
  "domain_name": "ZZ_TEST_MCP_03",
  "data_type": "CHAR",
  "length": 50,
  "decimals": 0,
  "short_label": "ShortLbl",
  "medium_label": "Medium Label",
  "long_label": "Long Field Label",
  "heading_label": "Heading"
}
```

**Workflow:**
1. POST creates data element with all properties (domain reference + field labels)
2. Activate data element
3. Verify activation

**Response includes:**
- Success status
- Data element name and version
- Package and transport request
- Domain linkage confirmation
- Data element details (type_kind, type_name, data_type, length, decimals)

**Note:** SAP handles locking automatically on the transport. Data element is created and activated in one operation (similar to CreateDomain).

---

### GetDataElement
**Description:** Retrieve ABAP data element information including type definition, field labels, and metadata from SAP system via ADT API.

**Parameters:**
- `data_element_name` (string, required): Data element name (e.g., MAKTX, MATNR, ZZ_E_TEST_001)

**Example:**
```json
{
  "data_element_name": "MAKTX"
}
```

**Response includes:**
- **Metadata:**
  - Name, type, description
  - Language, master language, master system
  - Created/changed by and timestamp
  - Version and ABAP language version
- **Package information:**
  - Package name, type, description, URI
- **Data element details:**
  - Type kind (domain/built-in type)
  - Type name (domain reference)
  - Data type, length, decimals
  - Field labels (short/10, medium/20, long/40, heading/55)
  - Search help and parameters
  - Change document settings
  - Input history and BIDI settings

**Use cases:**
- Verify data element properties after creation
- Check domain references and type definitions
- Retrieve field labels for UI generation
- Analyze data element configurations

---

## Transport Management

### CreateTransport
**Description:** Create new ABAP transport requests for development and customizing objects with automatic task creation.

**Parameters:**
- `description` (string, required): Transport request description
- `transport_type` (string, optional): Transport type - 'workbench' (default) or 'customizing'
- `target_system` (string, optional): Target system for transport (e.g., 'E19TOQAS', 'PRD')
- `owner` (string, optional): Transport owner (defaults to current user)

**Example:**
```json
{
  "description": "New features for inventory management",
  "transport_type": "workbench",
  "target_system": "E19TOQAS"
}
```

**Workflow:**
1. POST creates transport request with Eclipse-compatible XML structure
2. System generates unique transport number
3. Automatic task creation with current user as owner

**Response includes:**
- **Success status** and transport number (E.g., E19K905642)
- **Transport metadata:** description, type (K/T), target system
- **URI references** for ADT and GUI access
- **Creation confirmation** with all provided parameters

**Supported transport types:**
- **Workbench (K)**: Cross-client development objects (programs, classes, tables)
- **Customizing (T)**: Client-specific configuration objects

---

### GetTransport
**Description:** Retrieve comprehensive transport request information including objects, tasks, metadata, and relationships.

**Parameters:**
- `transport_number` (string, required): Transport request number (e.g., E19K905635, E19K905642)
- `include_objects` (boolean, optional): Include transport objects list (default: true)
- `include_tasks` (boolean, optional): Include task information (default: true)

**Example:**
```json
{
  "transport_number": "E19K905635",
  "include_objects": true,
  "include_tasks": true
}
```

**Response includes:**
- **Transport metadata:**
  - Number, description, type, status, owner
  - Target system, client, CTS project
  - Created/changed timestamps and users
- **Objects list** (when include_objects=true):
  - Object name, type, workbench type, PGMID
  - Description, position, lock status
  - Package and object information
- **Tasks information** (when include_tasks=true):
  - Task number, parent, description, type
  - Task status, owner, target system
  - Task-specific objects with details
- **Validation results:**
  - Object count, task count
  - Completeness checks and status validation

**Use cases:**
- Verify transport creation results
- Analyze transport contents before release
- Track development object assignments
- Monitor task and object relationships
- Generate transport documentation

---

## Dictionary Objects

### CreateTable
**Description:** Create a new ABAP table in SAP system with fields, keys, and technical settings. Includes create, activate, and verify steps.

**Parameters:**
- `table_name` (string, required): Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.
- `description` (string, optional): Table description. If not provided, table_name will be used.
- `package_name` (string, required): Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional): Transport request number (e.g., E19K905635). Required for transportable packages.
- `fields` (array, required): Array of table fields
  - Each field object contains:
    - `name` (string, required): Field name (e.g., CLIENT, MATERIAL_ID)
    - `data_type` (string, required): Data type (CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.)
    - `length` (number, required): Field length
    - `decimals` (number, optional): Decimal places (for DEC, CURR, QUAN types), default: 0
    - `key` (boolean, optional): Is this a key field?, default: false
    - `not_null` (boolean, optional): NOT NULL constraint, default: false
    - `domain` (string, optional): Domain name for type reference
    - `data_element` (string, optional): Data element name for type reference
    - `description` (string, optional): Field description
- `delivery_class` (string, optional): Delivery class (A=Application table, C=Customer table, L=Local table, G=Global table), default: L
- `data_category` (string, optional): Data category (APPL0=User data, APPL1=Configuration data, APPL2=System data), default: APPL0
- `maintenance_allowed` (boolean, optional): Table maintenance allowed via SM30, default: false

**Example:**
```json
{
  "table_name": "ZZ_TEST_MATERIALS_001",
  "description": "Test Materials Table",
  "package_name": "ZOK_LOCAL",
  "transport_request": "E19K905635",
  "fields": [
    {
      "name": "CLIENT",
      "data_type": "CHAR",
      "length": 3,
      "key": true,
      "not_null": true,
      "description": "Client ID"
    },
    {
      "name": "MATERIAL_ID",
      "data_type": "CHAR", 
      "length": 18,
      "key": true,
      "not_null": true,
      "description": "Material Number"
    },
    {
      "name": "DESCRIPTION",
      "data_type": "CHAR",
      "length": 40,
      "description": "Material Description"
    },
    {
      "name": "PRICE",
      "data_type": "CURR",
      "length": 15,
      "decimals": 2,
      "description": "Material Price"
    }
  ],
  "delivery_class": "L",
  "maintenance_allowed": true
}
```

**Workflow:**
1. **Create table** with field definitions and technical settings
2. **Activate table** for use in the system
3. **Verify creation** by retrieving table structure

**Response includes:**
- **Step-by-step results** for create, activate, verify operations
- **Table metadata** including name, package, field count
- **Field verification** with complete field structure and properties
- **Success/failure status** for each operation step

---

### CreateStructure  
**Description:** Create a new ABAP structure in SAP system with fields and type references. Includes create, activate, and verify steps.

**Parameters:**
- `structure_name` (string, required): Structure name (e.g., ZZ_S_ADDRESS_001). Must follow SAP naming conventions.
- `description` (string, optional): Structure description. If not provided, structure_name will be used.
- `package_name` (string, required): Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional): Transport request number (e.g., E19K905635). Required for transportable packages.
- `fields` (array, required): Array of structure fields
  - Each field object contains:
    - `name` (string, required): Field name (e.g., CLIENT, MATERIAL_ID)
    - `data_type` (string, optional): Data type (CHAR, NUMC, DATS, TIMS, DEC, etc.)
    - `length` (number, optional): Field length
    - `decimals` (number, optional): Decimal places (for DEC, CURR, QUAN types), default: 0
    - `domain` (string, optional): Domain name for type reference
    - `data_element` (string, optional): Data element name for type reference
    - `structure_ref` (string, optional): Include another structure
    - `table_ref` (string, optional): Reference to table type
    - `description` (string, optional): Field description
- `includes` (array, optional): Include other structures in this structure
  - Each include object contains:
    - `name` (string, required): Include structure name
    - `suffix` (string, optional): Optional suffix for include fields

**Example:**
```json
{
  "structure_name": "ZZ_S_ADDRESS_001",
  "description": "Test Address Structure",
  "package_name": "ZOK_LOCAL", 
  "transport_request": "E19K905635",
  "fields": [
    {
      "name": "CLIENT",
      "data_type": "CHAR",
      "length": 3,
      "description": "Client ID"
    },
    {
      "name": "ADDRESS_ID", 
      "data_type": "CHAR",
      "length": 10,
      "description": "Address ID"
    },
    {
      "name": "STREET",
      "data_type": "CHAR",
      "length": 35,
      "description": "Street Name"
    },
    {
      "name": "LATITUDE",
      "data_type": "DEC",
      "length": 15,
      "decimals": 6,
      "description": "Latitude Coordinate"
    }
  ]
}
```

**Workflow:**
1. **Create structure** with field definitions and includes
2. **Activate structure** for use in the system  
3. **Verify creation** by retrieving structure details

**Response includes:**
- **Step-by-step results** for create, activate, verify operations
- **Structure metadata** including name, package, field count
- **Field verification** with complete field structure and type references
- **Success/failure status** for each operation step

---

### CreateView
**Description:** Create CDS View or Classic View in SAP using DDL syntax. Supports both modern CDS Views with annotations and classic views with plain DDL. Both types use the same API workflow, differing only in DDL content.

**Parameters:**
- `view_name` (string, required): View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW). Must follow SAP naming conventions.
- `ddl_source` (string, required): Complete DDL source code. 
  - **For CDS View**: Include @AbapCatalog.sqlViewName and other annotations
  - **For Classic View**: Plain 'define view' statement without annotations
- `package_name` (string, required): Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional): Transport request number (e.g., E19K905635). Required for transportable packages.
- `description` (string, optional): Optional description. If not provided, view_name will be used.

**Example (CDS View):**
```json
{
  "view_name": "ZOK_R_TEST_MCP_02",
  "description": "Test CDS View via MCP",
  "package_name": "ZOK_LAB",
  "transport_request": "E19K905635",
  "ddl_source": "@AbapCatalog.sqlViewName: 'ZOK_V_MCP_02'\n@AbapCatalog.compiler.compareFilter: true\n@AccessControl.authorizationCheck: #NOT_REQUIRED\n@EndUserText.label: 'Test CDS View'\n@Metadata.ignorePropagatedAnnotations: true\ndefine view ZOK_R_TEST_MCP_02 as select from mara\n{\n    matnr as MaterialNumber,\n    mtart as MaterialType,\n    meins as BaseUnitOfMeasure,\n    ersda as CreatedOn\n}"
}
```

**Example (Classic View):**
```json
{
  "view_name": "Z_CLASSIC_VIEW_01",
  "description": "Classic View via MCP",
  "package_name": "ZOK_LAB",
  "transport_request": "E19K905635",
  "ddl_source": "define view Z_CLASSIC_VIEW_01 as select from mara\n{\n    matnr,\n    mtart,\n    meins\n}"
}
```

**Workflow (Eclipse ADT compliant):**
1. **Create DDLS object** with metadata (POST /sap/bc/adt/ddic/ddl/sources)
2. **Lock object** for modification (POST with _action=LOCK)
3. **Upload DDL source** code (PUT /source/main)
4. **Unlock object** (POST with _action=UNLOCK)
5. **Activate** the view (POST /sap/bc/adt/activation)

**Technical Implementation:**
- Uses **stateful session** (`sap-adt-connection-id`) for all 5 steps
- Unique **request IDs** for each individual request
- **Cookies automatically managed** via BaseAbapConnection
- **Lock handle** obtained and passed through session

**Response includes:**
- Success status and view name
- Package and transport request
- Complete URI to the created view
- Steps completed confirmation
- Activation warnings (e.g., key field differences)

**Notes:**
- CDS Views and Classic Views use identical API workflow
- Only difference is DDL source content (annotations vs. plain DDL)
- Lock handle is session-dependent and must be maintained throughout workflow
- Activation may return warnings about key definitions - this is normal

---

### CreateClass
**Description:** Create a new ABAP class in SAP system with full object-oriented features. Supports inheritance, final classes, abstract classes, and visibility modifiers. Follows Eclipse ADT approach with stateful session and lock management.

**Parameters:**
- `class_name` (string, required): Class name (e.g., ZCL_TEST_MCP_01). Must follow SAP naming conventions (usually starts with Z or Y).
- `package_name` (string, required): Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional): Transport request number (e.g., E19K905635). Required for transportable packages.
- `description` (string, optional): Class description. If not provided, class_name will be used.
- `superclass` (string, optional): Superclass name for inheritance (e.g., CL_ABAP_BEHAVIOR_HANDLER). Leave empty for no inheritance.
- `final` (boolean, optional): Mark class as final (cannot be inherited). Default: false
- `abstract` (boolean, optional): Mark class as abstract (cannot be instantiated). Default: false
- `create_protected` (boolean, optional): Set CREATE PROTECTED visibility. Default: false (CREATE PUBLIC)
- `source_code` (string, optional): Complete ABAP class source code including DEFINITION and IMPLEMENTATION sections. If not provided, a minimal template will be generated.

**Example (Minimal class):**
```json
{
  "class_name": "ZCL_TEST_MCP_01",
  "description": "Test ABAP Class",
  "package_name": "ZOK_LAB",
  "transport_request": "E19K905635"
}
```

**Example (With source code):**
```json
{
  "class_name": "ZCL_MY_HANDLER",
  "description": "Custom Event Handler",
  "package_name": "ZOK_LAB",
  "transport_request": "E19K905635",
  "superclass": "CL_ABAP_BEHAVIOR_HANDLER",
  "final": true,
  "source_code": "CLASS ZCL_MY_HANDLER DEFINITION\n  PUBLIC\n  FINAL\n  CREATE PUBLIC .\n\n  PUBLIC SECTION.\n    METHODS: handle_event.\n  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\nCLASS ZCL_MY_HANDLER IMPLEMENTATION.\n  METHOD handle_event.\n    \" Implementation here\n  ENDMETHOD.\nENDCLASS."
}
```

**Workflow (Eclipse ADT compliant):**
1. **Create class object** with metadata (POST /sap/bc/adt/oo/classes)
   - XML attributes: `class:final`, `class:visibility` as XML attributes (not elements!)
   - Includes package reference, superclass reference, test class include
2. **Extract lock handle** from POST response headers (`sap-adt-lockhandle`)
   - Class is automatically locked after creation
   - No separate LOCK request needed (unlike Views/Tables)
3. **Upload source code** (PUT /sap/bc/adt/oo/classes/{name}/source/main)
   - Content-Type: `text/plain; charset=utf-8`
   - Must include both DEFINITION and IMPLEMENTATION sections
4. **Unlock class** (POST with _action=UNLOCK&lockHandle={handle})
5. **Activate** the class (POST /sap/bc/adt/activation?method=activate)

**Technical Implementation:**
- Uses **stateful session** (`sap-adt-connection-id`) for all requests
- Unique **request IDs** (`sap-adt-request-id`) for each request
- **Cookies automatically managed** via BaseAbapConnection
- **Lock handle** extracted from POST response headers, not separate LOCK call
- XML format: `application/vnd.sap.adt.oo.classes.v4+xml`
- Source upload: `text/plain; charset=utf-8`

**Response includes:**
- Success status and class name
- Package and transport request
- Class type (CLAS/OC)
- URI to the created class
- Steps completed: `[create_object, lock, upload_source, unlock, activate]`
- Superclass, final, abstract flags

**Important Notes:**
- **Source code must be complete**: Include both CLASS...DEFINITION and CLASS...IMPLEMENTATION sections
- **XML attributes vs elements**: `class:final` and `class:visibility` must be XML attributes, not child elements
- **Lock handle**: Automatically obtained from POST response, no explicit LOCK needed
- **Session management**: All operations must use same `sap-adt-connection-id`
- **Error handling**: If any step fails, unlock is attempted automatically

**Common Patterns:**
- Simple class: Leave `source_code` empty, template generated automatically
- Inheritance: Set `superclass` parameter (e.g., "CL_ABAP_BEHAVIOR_HANDLER")
- Final class: Set `final: true` to prevent inheritance
- Abstract class: Set `abstract: true` for abstract classes
- Protected creation: Set `create_protected: true` for CREATE PROTECTED

---

### GetView
**Description:** Retrieve ABAP database view definition including tables, fields, joins, and selection conditions.

**Parameters:**
- `view_name` (string, required): Name of the ABAP database view
- `filePath` (string, optional): Optional file path to write the result to

**Example:**
```json
{
  "view_name": "DD02V",
  "max_rows": 50
}
```

**Response includes:**
- **View definition:**
  - Name, type, description, package
  - View type (database_view, maintenance_view, etc.)
  - Maintenance allowed flag
- **Tables information:**
  - Participating tables with names, aliases, positions
  - Table relationships and dependencies
- **Fields structure:**
  - Field names, data types, lengths, decimals
  - Key field indicators and aggregation functions
  - Field descriptions and table associations
- **Joins information:**
  - Join types (INNER, LEFT, RIGHT, etc.)
  - Join conditions between tables
  - Left/right table specifications
- **Selection conditions:**
  - Where clause conditions
  - Field operators and values
  - Conditional logic for view filtering
- **View contents** (optional):
  - Actual data from the view (if accessible)
  - SQL query used for data retrieval
  - Row count and data preview

**Supported view types:**
- **Database Views**: Standard join views with selection criteria
- **Maintenance Views**: Views with table maintenance capabilities  
- **Help Views**: Views designed for F4 help functionality
- **Projection Views**: Simple single-table projections

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

*Last updated: 2025-11-05*
*Document version: 1.0*
*Generated automatically from TOOL_DEFINITION exports*
