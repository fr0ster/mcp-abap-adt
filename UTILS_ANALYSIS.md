# Analysis of Utilities Module

## Overview

This document analyzes utility functions in `src/lib/` to determine which should be extracted into a separate package.

## Utility Files

### 1. `utils.ts` - Core Utilities
**Size:** ~237 lines  
**Dependencies:** 
- `@mcp-abap-adt/connection` (AbapConnection, createAbapConnection, SapConfig)
- `@modelcontextprotocol/sdk` (McpError, ErrorCode)
- Internal: `getConfig()` from `../index`
- Internal: `loggerAdapter`, `logger`

**Functions:**
- `encodeSapObjectName()` - URL encoding for SAP object names
- `return_response()` - Format MCP response (isError: false)
- `return_error()` - Format MCP error response (isError: true)
- `getManagedConnection()` - Get/cache AbapConnection instance
- `setConfigOverride()` - Override config for testing
- `setConnectionOverride()` - Override connection for testing
- `cleanup()` - Clean up connection cache
- `getBaseUrl()` - Get base URL from connection
- `getAuthHeaders()` - Get auth headers from connection
- `makeAdtRequestWithTimeout()` - Make ADT request with timeout
- `makeAdtRequest()` - Make ADT request (wrapper)
- `fetchNodeStructure()` - Fetch node structure from ADT repository
- `getSystemInformation()` - Get system info (cloud only)

**Assessment:**
- ❌ **NOT suitable for separate package**
- **Reasons:**
  - Tightly coupled to MCP server (uses `getConfig()` from index)
  - MCP-specific response formatting (`return_response`, `return_error`)
  - Connection management is server-specific
  - Used by all handlers as core infrastructure

---

### 2. `activationUtils.ts` - Activation Utilities
**Size:** ~207 lines  
**Dependencies:**
- `./utils` (makeAdtRequestWithSession, makeAdtRequestWithTimeout, getBaseUrl, encodeSapObjectName)
- `./sessionUtils` (makeAdtRequestWithSession)
- `fast-xml-parser` (for parsing activation responses)

**Functions:**
- `buildObjectUri()` - Build ADT URI from object name and type
- `activateObjectInSession()` - Activate single object in stateful session
- `activateObjectsGroup()` - Activate multiple objects (stateless)
- `parseActivationResponse()` - Parse XML activation response

**Assessment:**
- ✅ **SUITABLE for separate package** (with modifications)
- **Reasons:**
  - Domain-specific (ABAP activation logic)
  - Could be reused by other ABAP tools
  - Relatively self-contained
  - **BUT:** Depends on `sessionUtils` and `utils` (needs refactoring)

**Recommendation:**
- Extract to `@mcp-abap-adt/activation` package
- Accept `AbapConnection` as parameter (dependency injection)
- Remove dependency on `utils.ts` helpers
- Keep `fast-xml-parser` as dependency

---

### 3. `sessionUtils.ts` - Session Management
**Size:** ~181 lines  
**Dependencies:**
- `./utils` (makeAdtRequestWithTimeout, getBaseUrl)
- `crypto` (Node.js built-in)

**Functions:**
- `generateSessionId()` - Generate unique session ID (UUID)
- `generateRequestId()` - Generate unique request ID (UUID)
- `makeAdtRequestWithSession()` - Make ADT request with stateful session headers
- `makeAdtRequestStateless()` - Make ADT request with stateless session headers

**Assessment:**
- ✅ **SUITABLE for separate package** (with modifications)
- **Reasons:**
  - Domain-specific (ADT session management)
  - Could be reused by other ADT tools
  - Well-documented and self-contained
  - **BUT:** Depends on `utils.ts` (needs refactoring)

**Recommendation:**
- Extract to `@mcp-abap-adt/session` package
- Accept `AbapConnection` as parameter (dependency injection)
- Remove dependency on `utils.ts` helpers
- Keep as lightweight utility package

---

### 4. `getFullCodeCache.ts` - Full Code Caching
**Size:** ~23 lines  
**Dependencies:** `fs`, `path` (Node.js built-in)

**Functions:**
- `saveFullCodeCache()` - Save cache to file (`.getfullcode.cache.json`)
- `loadFullCodeCache()` - Load cache from file

**Assessment:**
- ⚠️ **MAYBE suitable** (very simple)
- **Reasons:**
  - Very simple file-based cache
  - Specific to `GetProgFullCode` handler
  - Could be part of a general caching package
  - **BUT:** Too small to justify separate package

**Recommendation:**
- Keep in server package OR
- Include in a general `@mcp-abap-adt/cache` package (if more caching utilities are added)

---

### 5. `getObjectsListCache.ts` - Objects List Caching
**Size:** ~22 lines  
**Dependencies:** None (pure TypeScript)

**Functions:**
- `ObjectsListCache` class - In-memory cache for objects list
- `objectsListCache` singleton instance

**Assessment:**
- ⚠️ **MAYBE suitable** (very simple)
- **Reasons:**
  - Very simple in-memory cache
  - Specific to `GetObjectsList` handler
  - Could be part of a general caching package
  - **BUT:** Too small to justify separate package

**Recommendation:**
- Keep in server package OR
- Include in a general `@mcp-abap-adt/cache` package (if more caching utilities are added)

---

### 6. `writeResultToFile.ts` - File Writing Utility
**Size:** ~54 lines  
**Dependencies:** `fs`, `path` (Node.js built-in)

**Functions:**
- `writeResultToFile()` - Write result to file (with path validation)

**Assessment:**
- ❌ **NOT suitable for separate package**
- **Reasons:**
  - Very simple utility
  - Used for debugging/development
  - Not part of core functionality
  - Too small to justify separate package

**Recommendation:**
- Keep in server package

---

### 7. `toolsRegistry.ts` - Tools Registry
**Size:** ~188 lines  
**Dependencies:**
- All handler files (imports `TOOL_DEFINITION` from each)

**Functions:**
- `getAllTools()` - Get all tool definitions
- `getToolByName()` - Find tool by name
- `ALL_TOOLS` - Array of all tool definitions

**Assessment:**
- ❌ **NOT suitable for separate package**
- **Reasons:**
  - Tightly coupled to MCP server handlers
  - Imports all handler files
  - MCP-specific (tool definitions)
  - Core server infrastructure

**Recommendation:**
- Keep in server package

---

## Summary

### ✅ Suitable for Extraction

1. **`activationUtils.ts`** → `@mcp-abap-adt/activation`
   - ABAP object activation logic
   - Reusable across ABAP tools
   - Needs refactoring to remove `utils.ts` dependency

2. **`sessionUtils.ts`** → `@mcp-abap-adt/session`
   - ADT session management
   - Reusable across ADT tools
   - Needs refactoring to remove `utils.ts` dependency

### ⚠️ Maybe Suitable (Too Small)

3. **`getFullCodeCache.ts`** + **`getObjectsListCache.ts`** → `@mcp-abap-adt/cache`
   - Only if more caching utilities are added
   - Currently too small to justify separate package

### ❌ Not Suitable

4. **`utils.ts`** - Core server infrastructure
5. **`writeResultToFile.ts`** - Too simple, debugging utility
6. **`toolsRegistry.ts`** - Tightly coupled to server handlers

---

## Recommended Extraction Plan

### Phase 1: Extract Session Utilities
1. Create `@mcp-abap-adt/session` package
2. Move `sessionUtils.ts` → `packages/session/src/sessionUtils.ts`
3. Refactor to accept `AbapConnection` as parameter
4. Remove dependency on `utils.ts`
5. Update imports in handlers

### Phase 2: Extract Activation Utilities
1. Create `@mcp-abap-adt/activation` package
2. Move `activationUtils.ts` → `packages/activation/src/activationUtils.ts`
3. Refactor to accept `AbapConnection` as parameter
4. Remove dependency on `utils.ts` and `sessionUtils.ts` (use `@mcp-abap-adt/session`)
5. Update imports in handlers

### Benefits
- ✅ Reusable across different ABAP tools
- ✅ Better separation of concerns
- ✅ Easier testing (dependency injection)
- ✅ Independent versioning
- ✅ Can be published to npm separately

### Considerations
- ⚠️ Need to refactor to remove `utils.ts` dependencies
- ⚠️ Need to update all handler imports
- ⚠️ Two new packages to maintain
- ⚠️ May be overkill if only used by MCP server

---

## Alternative: Keep in Server Package

If the utilities are **only used by the MCP server** and not needed elsewhere:

- ✅ Simpler architecture
- ✅ No refactoring needed
- ✅ Easier to maintain
- ❌ Less reusable
- ❌ Larger server package

**Recommendation:** Extract only if you plan to use these utilities in other projects or if you want to publish them as standalone npm packages for the ABAP community.

