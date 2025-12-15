# MCP Server Refactoring Roadmap

## Overview
**Status**: [ ] Not started | [ ] In progress | [ ] Completed

Refactor `src/index.ts` to:
1. Replace `registerAllToolsOnServer` with import from `@mcp-abap-adt/src/lib/servers/mcp_handlers.ts`
2. Implement per-request/server McpServer creation strategy:
   - **stdio**: Create McpServer once at startup
   - **sse**: Create McpServer on each GET request
   - **streamableHttp**: Create McpServer on each POST request
3. Connection creation: either via auth broker or via connection parameters in headers

## Current State Analysis

### Current Implementation
- `registerAllToolsOnServer()` is a private method in `mcp_abap_adt_server` class (line ~2590)
- `McpHandlers` class exists in `src/lib/servers/mcp_handlers.ts` with `RegisterAllToolsOnServer()` method
- `McpHandlers.RegisterAllToolsOnServer()` accepts `(server: McpServer, connection: AbapConnection)`
- Current `registerAllToolsOnServer()` in index.ts doesn't accept connection parameter (handlers get connection via context)
- stdio: Uses `this.mcpServer` created in constructor (line ~2248)
- sse: Uses `createMcpServerForSession()` on each GET (line ~3414)
- streamableHttp: Reuses `this.mcpServer` for all POST requests (line ~3241)

### Connection Management
- Connection is obtained via `getManagedConnection()` from session context
- Session context is set via `sessionContext.run()` with `{ sessionId, sapConfig, destination }`
- Auth broker is used when `defaultMcpDestination` is set or headers contain destination info
- Direct auth via headers: `x-sap-url`, `x-sap-auth-type`, etc.

## Tasks

### Task 1: Replace registerAllToolsOnServer with Import
**File**: `src/index.ts`
**Status**: [ ] Not started

- [ ] Import `McpHandlers` from `@mcp-abap-adt/src/lib/servers/mcp_handlers.ts`
- [ ] Remove private `registerAllToolsOnServer()` method (lines ~2590-2798)
- [ ] Remove `jsonSchemaToZod()` and `registerToolOnServer()` helper methods (if not used elsewhere)
- [ ] Update `setupMcpServerHandlers()` to use `McpHandlers.RegisterAllToolsOnServer()`
- [ ] Update `createMcpServerForSession()` to use `McpHandlers.RegisterAllToolsOnServer()`

**Challenges**:
- `McpHandlers.RegisterAllToolsOnServer()` requires `connection: AbapConnection` parameter
- Current handlers get connection via `getManagedConnection()` from session context
- Need to pass connection to `RegisterAllToolsOnServer()` or modify it to accept connection factory

**Solution Options**:
- Option A: Pass `null` or `undefined` connection and let handlers get it from context (modify `McpHandlers`)
- Option B: Get connection from context before calling `RegisterAllToolsOnServer()`
- Option C: Modify `McpHandlers.RegisterAllToolsOnServer()` to accept optional connection (defaults to context-based)

**Recommended**: Option C - modify `McpHandlers.RegisterAllToolsOnServer()` to accept optional connection parameter

### Task 2: Implement Per-Request McpServer Creation for streamableHttp
**File**: `src/index.ts`
**Status**: [ ] Not started

**Current**: Reuses `this.mcpServer` for all POST requests (line ~3241)

**Required**: Create new McpServer instance for each POST request

- [ ] Create helper method `createMcpServerForRequest(connection?: AbapConnection): McpServer`
- [ ] In streamableHttp POST handler (line ~3222), create new McpServer instead of reusing `this.mcpServer`
- [ ] Get connection from session context or create from headers/broker
- [ ] Register tools on new server using `McpHandlers.RegisterAllToolsOnServer(server, connection)`
- [ ] Connect transport to new server instance
- [ ] Clean up server instance when request completes (or let it be garbage collected)

**Connection Creation Logic**:
- If session has `sapConfig` and `destination`, create connection via auth broker
- If headers contain SAP connection params, create connection from headers
- If neither, use default connection from context

### Task 3: Ensure stdio Creates McpServer at Startup
**File**: `src/index.ts`
**Status**: [ ] Not started

**Current**: Already creates `this.mcpServer` in constructor (line ~2248)

**Required**: Ensure tools are registered on this server at startup

- [ ] Verify `setupMcpServerHandlers()` is called in `run()` method for stdio mode
- [ ] Get connection from default destination or .env file
- [ ] Register tools using `McpHandlers.RegisterAllToolsOnServer(this.mcpServer, connection)`

**Note**: stdio mode already initializes connection in `run()` method (lines ~2900-2927)

### Task 4: Ensure sse Creates McpServer on Each GET
**File**: `src/index.ts`
**Status**: [ ] Not started

**Current**: Already uses `createMcpServerForSession()` on each GET (line ~3414)

**Required**: Update to use `McpHandlers.RegisterAllToolsOnServer()`

- [ ] Update `createMcpServerForSession()` to accept optional connection parameter
- [ ] Get connection from session context or create from headers/broker
- [ ] Use `McpHandlers.RegisterAllToolsOnServer(server, connection)` instead of `this.registerAllToolsOnServer(server)`

**Connection Creation**:
- If headers contain SAP connection params, create connection from headers
- If default destination exists, create connection via auth broker
- Store connection in session context for later use

### Task 5: Connection Creation Strategy
**File**: `src/index.ts`
**Status**: [ ] Not started

**Requirements**:
- Connection should be created either via auth broker OR via connection parameters in headers
- Connection should be available in session context for handlers

**Implementation**:
- [ ] Create helper method `getOrCreateConnection(sessionId?: string, headers?: IncomingHttpHeaders, destination?: string): Promise<AbapConnection>`
- [ ] Method should:
  - [ ] Check if connection exists in session context
  - [ ] If headers contain SAP connection params, create connection from headers
  - [ ] If destination is provided, create connection via auth broker
  - [ ] If neither, use default connection from context
  - [ ] Store connection in session context
- [ ] Use this method in:
  - [ ] stdio: In `run()` method after initializing connection
  - [ ] sse: In GET handler before creating McpServer
  - [ ] streamableHttp: In POST handler before creating McpServer

## Implementation Order

- [ ] **Task 1**: Replace `registerAllToolsOnServer` with import
  - [ ] Modify `McpHandlers.RegisterAllToolsOnServer()` to accept optional connection
  - [ ] Update `setupMcpServerHandlers()` and `createMcpServerForSession()`
  - [ ] Remove old implementation

- [ ] **Task 5**: Implement connection creation helper
  - [ ] Create `getOrCreateConnection()` method
  - [ ] Test with different scenarios (headers, broker, default)

- [ ] **Task 3**: Verify stdio implementation
  - [ ] Ensure connection is created at startup
  - [ ] Ensure tools are registered on `this.mcpServer`

- [ ] **Task 4**: Update sse implementation
  - [ ] Update `createMcpServerForSession()` to use new approach
  - [ ] Ensure connection is created from headers or broker

- [ ] **Task 2**: Implement per-request McpServer for streamableHttp
  - [ ] Create `createMcpServerForRequest()` method
  - [ ] Update POST handler to create new server per request

## Testing Checklist

- [ ] stdio mode: Server starts, tools are registered, connection works
- [ ] sse mode: Each GET creates new server, connection from headers works
- [ ] sse mode: Each GET creates new server, connection from broker works
- [ ] streamableHttp mode: Each POST creates new server, connection from headers works
- [ ] streamableHttp mode: Each POST creates new server, connection from broker works
- [ ] All tools are accessible in all modes
- [ ] Connection is properly shared via session context
- [ ] No memory leaks (servers are properly cleaned up)

## Notes

- `McpHandlers.RegisterAllToolsOnServer()` currently requires `connection` parameter
- Need to modify it to accept optional connection (defaults to context-based)
- Connection is typically obtained via `getManagedConnection()` from session context
- Session context is set via `sessionContext.run()` with session info
- Auth broker is initialized lazily when destination is needed
