# Research: ABAP Proxy for Legacy Systems

## Problem

Legacy SAP systems (BASIS < 7.50) lack ADT endpoints for many operations.
61 tools are currently unavailable on legacy, primarily DDIC object management.

## Goal

Create a custom ABAP ICF handler that exposes missing operations via HTTP/JSON,
allowing the MCP server to call them the same way it calls ADT endpoints.

## Missing DDIC Operations on Legacy (48 tools)

| Object Type    | Tools Count | ABAP FM for Create/Update          |
|----------------|-------------|-------------------------------------|
| Domain         | 12          | DDIF_DOMA_PUT, DDIF_DOMA_ACTIVATE   |
| Data Element   | 12          | DDIF_DTEL_PUT, DDIF_DTEL_ACTIVATE   |
| Structure      | 12          | DDIF_TABL_PUT (tabclass=INTTAB)     |
| Table          | 12          | DDIF_TABL_PUT, DDIF_TABL_ACTIVATE   |

## Other Missing Operations on Legacy (13 tools)

| Category               | Tools                                    |
|------------------------|------------------------------------------|
| Package Create         | CreatePackage, CreatePackageLow, Validate |
| Service Def/Binding    | 10 tools (OData infra not available)      |

## Operations NOT Feasible via Proxy

- Behavior Definition/Implementation (RAP — not on legacy at all)
- Metadata Extension (RAP — not on legacy)
- Service Definition/Binding (OData V4 — not on legacy)
- ABAP AST/Semantic Analysis (compiler-level APIs)

## Proposed Architecture

```
MCP Server  --HTTP/JSON-->  /sap/zmcp/proxy  (ICF handler)
                                |
                            ZCL_MCP_PROXY (handler class)
                                |
                    +-----------+-----------+
                    |           |           |
              DDIF_DOMA_*  DDIF_DTEL_*  DDIF_TABL_*
```

### ICF Node
- Path: `/sap/zmcp/proxy`
- Handler: `ZCL_MCP_PROXY`
- Auth: `S_DEVELOP` authority check

### Request Format
```json
{
  "operation": "create_domain",
  "params": {
    "name": "ZDOMAIN",
    "package": "ZPACKAGE",
    "transport": "DEVK900001",
    "description": "My domain",
    "data_type": "CHAR",
    "length": 10,
    "values": [
      {"low": "A", "high": "", "description": "Active"},
      {"low": "I", "high": "", "description": "Inactive"}
    ]
  }
}
```

### Response Format
```json
{
  "status": "ok",
  "object_name": "ZDOMAIN",
  "object_type": "DOMA",
  "messages": []
}
```

## Supported Operations (PoC Scope)

### Phase 1: DDIC Core
- `create_domain` / `update_domain` / `delete_domain` / `get_domain`
- `create_data_element` / `update_data_element` / `delete_data_element` / `get_data_element`
- `create_table` / `update_table` / `delete_table` / `get_table`
- `create_structure` / `update_structure` / `delete_structure` / `get_structure`
- `activate` (generic, by object type + name)

### Phase 2: Package & Transport
- `create_package`
- `validate_package`

### Phase 3: Extended
- `where_used` (via WBCROSSGT/environment analysis)
- `search_object` (via TADIR queries)

## ABAP Implementation Notes

### Key FMs for DDIC
```abap
" Domain
CALL FUNCTION 'DDIF_DOMA_PUT'
  EXPORTING dd01v_wa = ls_dd01v
  TABLES    dd07v_tab = lt_dd07v.

" Data Element
CALL FUNCTION 'DDIF_DTEL_PUT'
  EXPORTING dd04v_wa = ls_dd04v.

" Table / Structure
CALL FUNCTION 'DDIF_TABL_PUT'
  EXPORTING dd02v_wa = ls_dd02v
  TABLES    dd03p_tab = lt_dd03p.

" Activation
CALL FUNCTION 'DDIF_DOMA_ACTIVATE' / 'DDIF_DTEL_ACTIVATE' / 'DDIF_TABL_ACTIVATE'

" Lock/Unlock
CALL FUNCTION 'ENQUEUE_E_TRDIR' / 'DEQUEUE_E_TRDIR'

" Transport
CALL FUNCTION 'TRINT_INSERT_NEW_COMM'  " assign to transport
```

### Authority Check
```abap
AUTHORITY-CHECK OBJECT 'S_DEVELOP'
  ID 'DEVCLASS' FIELD iv_package
  ID 'OBJTYPE'  FIELD iv_object_type
  ID 'OBJNAME'  FIELD iv_object_name
  ID 'P_GROUP'  FIELD ' '
  ID 'ACTVT'    FIELD '02'.  " Change
```

## Distribution

- abapGit repository (separate from mcp-abap-adt)
- Single package `ZMCP_PROXY`
- Minimum BASIS requirement: 7.02 (ICF + JSON support)

## Open Questions

1. JSON parsing on old BASIS — `CL_TREX_JSON_DESERIALIZER` vs manual parsing?
2. Session handling — stateless per-request or stateful?
3. Should the proxy also handle lock/unlock or leave that to the MCP server?
4. Error reporting format — align with ADT error XML or custom JSON?
5. How to handle activation dependencies (e.g., create domain → create dtel → create table)?
