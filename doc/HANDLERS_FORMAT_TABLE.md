# MCP ABAP ADT Handlers: Return & File Formats

| Handler Name                | Returns                          | Return Format             |
|-----------------------------|----------------------------------|---------------------------|
| handleGetProgram            | { isError, content: [{type:"text", text}] } | MCP JSON (unified)      |
| handleGetInclude            | { isError, content: [{type:"text", text}] } | MCP JSON (unified)      |
| handleGetFunction           | { isError, content: [{type:"text", text}]} or {isError, content: [{type:"json", json}]} | MCP JSON (unified)      |
| handleGetClass              | { isError, content: [{type:"text", text}]} or {isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetFunctionGroup      | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetStructure          | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetTable              | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetTableContents      | { isError, content: [{type:"text", text}]}  | MCP JSON (unified)      |
| handleGetPackage            | { isError, content: [{type:"text", text}]}  | MCP JSON (unified)      |
| handleGetTypeInfo           | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetInterface          | { isError, content: [{type:"text", text}]} or {type:"json", json} | MCP JSON (unified)      |
| handleGetTransaction        | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleSearchObject          | { isError, content: [{type:"text", text}]}  | MCP JSON (unified)      |
| handleGetEnhancements       | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetEnhancementSpot    | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetEnhancementImpl    | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetSqlQuery           | { isError, content: [{type:"text", text}]}  | MCP JSON (unified)      |
| handleGetIncludesList       | { isError, content: [{type:"text", text}]} or {type:"json", json} | MCP JSON (unified)      |
| handleGetObjectsByType      | { isError, content: [{type:"text", text}]} or {type:"json", json} | MCP JSON (unified)      |
| handleGetObjectsList        | { isError, content: [{type:"json", json: {...}}] } | MCP JSON (unified)      |
| handleGetWhereUsed          | { isError, content: [{type:"json", json}]}  | MCP JSON (unified)      |
| handleGetBdef               | { isError, content: [{type:"json", json}]} | MCP JSON (unified)      |

**Notes:**
- Errors always follow { isError: true, content: [{type: "text", text: "..."}] }.
- The `mimeType` and `data` fields are no longer used.
- For type `"text"` only the `text` field is populated.
- For type `"json"` only the `json` field is populated.
- Every handler returns the unified MCP format.

Updated: 2025-07-14
