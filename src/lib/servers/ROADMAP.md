# MCP Server v2 Implementation Roadmap

Implementation roadmap for the new simplified architecture based on `BaseMcpServer` extending `McpServer` from SDK.

## Status

- ✅ **Completed**: Phase 1.2, Phase 1.3, Phase 2.1 (BaseMcpServer implementation)
- 🔄 **In Progress**: Phase 1.1 (handlers use HandlerContext, but need verification)
- ⏳ **Not Started**: Phase 1.4, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8

---

## Phase 1: Handler Correction & Registry Implementation

### 1.1 Update Handler Signature
- [x] Update all handlers to accept `connection` as first parameter (via HandlerContext)
- [x] Handler signature: `(context: HandlerContext, args: any) => Promise<any>` (HandlerContext contains connection)
- [x] Remove `getManagedConnection()` calls from handlers (verified: no matches found)
- [x] Update handler function signatures in all handler files (handlers use HandlerContext)
- [x] Update handler groups to use new signature
- [ ] **Verification needed**: Ensure all handlers properly use context.connection

### 1.2 Handler Registry with Lambda Wrapping
- [x] Create `BaseMcpServer` class extending `McpServer` from SDK
- [x] Add `connectionContext: ConnectionContext | null` property
- [x] Implement `getConnection()` method (creates AbapConnection from context)
- [x] Implement `registerHandlers(handlersRegistry)` method:
  - Get handler groups from `CompositeHandlersRegistry`
  - For each handler, wrap it with lambda: `(args) => handler(context, args)` where context contains connection
  - Register wrapped handler via `this.registerTool()` (connection is NOT part of MCP tool signature)
  - This ensures connection is injected but not exposed in MCP protocol

### 1.3 ConnectionContext Type
- [x] Define `ConnectionContext` interface (in `src/lib/servers/ConnectionContext.ts`)
- [x] Include `connectionParams` (SapConfig type with url, authType, jwtToken, client)
- [x] Include `sessionId`
- [x] Include optional `metadata`

### 1.4 Testing Handler Registration
- [ ] Verify handlers are wrapped correctly
- [ ] Verify MCP tool signature doesn't include connection parameter
- [ ] Test that handlers receive connection when called

---

## Phase 2: Base Server Class

### 2.1 BaseMcpServer Implementation
- [x] Complete `BaseMcpServer` class (started in Phase 1.2)
- [x] Add `authBroker?: AuthBroker` property
- [x] Implement `setConnectionContext(destination, authBroker)` method
- [x] Implement `getConnectionContext()` method
- [x] Add error handling for missing context (error thrown in `getConnection()`)

---

## Phase 3: StdioServer Implementation

### 2.1 StdioServer Class
- [ ] Create `StdioServer` class extending `BaseMcpServer`
- [ ] Constructor: inject `IHandlersRegistry` and `AuthBroker`
- [ ] Implement `start(destination)` method:
  - Call `setConnectionContext(destination, authBroker)`
  - Call `registerHandlers(handlersRegistry)`
  - Create `StdioServerTransport` from SDK
  - Connect via `this.server.connect(transport)`

### 2.2 Testing
- [ ] Create test script for stdio server
- [ ] Test with MCP Inspector
- [ ] Verify handlers receive connection via first parameter

---

## Phase 4: SseServer Implementation

### 3.1 SseServer Class
- [ ] Create `SseServer` class
- [ ] Constructor: inject `IHandlersRegistry` and `AuthBrokerFactory`
- [ ] Implement HTTP server setup
- [ ] Implement GET `/sse` endpoint:
  - Create new server instance (extends `BaseMcpServer`)
  - Register handlers
  - Create `SSEServerTransport` from SDK
  - Store transport in map by `sessionId`
  - Connect via `server.server.connect(transport)`
- [ ] Implement POST `/messages` endpoint:
  - Look up transport by `sessionId`
  - Build connection context from request
  - Set context on server instance
  - Call `transport.handlePostMessage(req, res, req.body)`

### 3.2 Testing
- [ ] Create test script for SSE server
- [ ] Test with MCP Inspector or curl
- [ ] Verify per-request context setup

---

## Phase 5: StreamableHttpServer Implementation

### 4.1 StreamableHttpServer Class
- [ ] Create `StreamableHttpServer` class extending `BaseMcpServer`
- [ ] Constructor: inject `IHandlersRegistry` and `AuthBrokerFactory`
- [ ] Implement HTTP server setup
- [ ] Implement POST `/mcp` endpoint:
  - Determine `clientId` from request
  - Build connection context from request
  - Call `setConnectionContext()` with context
  - Create `StreamableHTTPServerTransport` from SDK
  - Connect via `this.connect(transport)`
  - Call `transport.handleRequest(req, res, req.body)`

### 4.2 Testing
- [ ] Create test script for StreamableHTTP server
- [ ] Test with MCP Inspector or curl
- [ ] Verify per-request context setup

---

## Phase 6: Configuration & CLI

### 6.1 CLI Arguments Parser
- [ ] Create `ArgumentsParser` class
- [ ] Parse `--mcp=destination`
- [ ] Parse `--transport=stdio|sse|http`
- [ ] Parse `--port=...` and `--host=...`
- [ ] Parse `--config=path/to/config.yaml`

### 6.2 YAML Config Loader
- [x] Create YAML config loader functions (in `src/lib/yamlConfig.ts`)
- [x] Load destinations from YAML
- [x] Load service keys paths
- [x] Merge CLI args with YAML config (CLI overrides YAML)
- [ ] **Note**: Implemented as functions, not as a class. Consider refactoring to class if needed.

### 6.3 Server Launcher
- [ ] Create `ServerLauncher` class
- [ ] Determine server type from transport
- [ ] Create appropriate server instance (StdioServer, SseServer, StreamableHttpServer)
- [ ] Create `AuthBrokerFactory` from config
- [ ] Start server with proper configuration

---

## Phase 7: Integration & Testing

### 7.1 Update index.ts
- [ ] Update entry point (`src/index.ts`) to use new architecture
- [ ] Use `ServerLauncher` for server creation
- [ ] Remove old v1 imports and logic
- [ ] Use SDK transports directly
- [ ] Integrate `BaseMcpServer` and transport-specific server classes

### 7.2 Integration Tests
- [ ] Test stdio server with real ABAP system
- [ ] Test SSE server with real ABAP system
- [ ] Test StreamableHTTP server with real ABAP system
- [ ] Verify connection context is set correctly
- [ ] Verify handlers receive connection

### 7.3 Documentation
- [ ] Update README with new architecture
- [ ] Add usage examples
- [ ] Document handler signature changes

---

## Phase 8: Cleanup

### 8.1 Remove Old Code
- [ ] Remove unused v2 files (if any remain)
- [ ] Remove old test files
- [ ] Clean up imports

### 8.2 Final Verification
- [ ] Run all tests
- [ ] Verify build succeeds
- [ ] Check for any remaining references to old architecture

---

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK with `McpServer` and transports
- `@mcp-abap-adt/auth-broker` - AuthBroker for token management
- `@mcp-abap-adt/auth-stores` - ServiceKeyStore and SessionStore
- `@mcp-abap-adt/auth-providers` - TokenProvider implementations
- `@mcp-abap-adt/connection` - AbapConnection type
- `@mcp-abap-adt/adt-clients` - CRUD clients for ABAP operations

---

## Notes

- **Critical**: Handlers accept `HandlerContext` as first parameter (which contains `connection` and `logger`), but this parameter is NOT part of MCP tool signature
- Connection is injected via lambda wrapper: `(args) => handler({ connection: getConnection(), logger }, args)`
- Handler signature: `(context: HandlerContext, args: any) => Promise<any>` where `HandlerContext = { connection: AbapConnection, logger?: ILogger }`
- MCP tool signature only includes the actual tool arguments (from `inputSchema`)
- Each server instance (per request for SSE/HTTP) has its own `connectionContext`
- Transports are used directly from SDK, no custom wrapper classes needed
- Handler registry wraps handlers to inject connection without exposing it in MCP protocol
- **Implementation Status**: BaseMcpServer, ConnectionContext, and handler registry are implemented. Transport-specific servers (StdioServer, SseServer, StreamableHttpServer) are not yet implemented.
