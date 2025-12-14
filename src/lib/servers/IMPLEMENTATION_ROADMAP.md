# MCP Server v2 Implementation Roadmap

## Overview

This roadmap outlines the step-by-step implementation plan for the new MCP server architecture with Dependency Injection, modular design, and support for both LOCAL and REMOTE modes.

**Target Location**: `src/lib/servers/v2/`

**Estimated Total Time**: 4-6 weeks

---

## Phase 1: Foundation - Interfaces and Types (Week 1, Days 1-2)

### Goals
- Define all interfaces for Dependency Injection
- Create base types and data structures
- Establish type safety foundation

### Tasks

#### 1.1 Create Directory Structure
```bash
src/lib/servers/v2/
├── interfaces/
│   ├── transport.ts
│   ├── connection.ts
│   ├── auth.ts
│   ├── session.ts
│   ├── protocol.ts
│   └── handlers.ts
├── types/
│   ├── common.ts
│   ├── session.ts
│   └── config.ts
└── __tests__/
    └── unit/
```

#### 1.2 Define Core Interfaces

**File**: `interfaces/transport.ts`
- [ ] `ITransport` interface
- [ ] `ClientInfo` type
- [ ] Transport event types

**File**: `interfaces/connection.ts`
- [ ] `IConnectionProvider` interface
- [ ] `IServiceKeyStore` interface
- [ ] `ISessionStore` interface
- [ ] `ConnectionParams` type
- [ ] `ConnectionRequest` type
- [ ] `ServiceKey` type
- [ ] `TokenData` type

**File**: `interfaces/auth.ts`
- [ ] `IAuthBrokerFactory` interface
- [ ] `ITokenProvider` interface

**File**: `interfaces/session.ts`
- [ ] `ISessionManager` interface
- [ ] `ISession` interface
- [ ] Session event types

**File**: `interfaces/protocol.ts`
- [ ] `IProtocolHandler` interface

**File**: `interfaces/handlers.ts`
- [ ] `IHandlersRegistry` interface
- [ ] `ToolDefinition` type
- [ ] `ToolHandler` type

#### 1.3 Define Base Types

**File**: `types/common.ts`
- [ ] `ServerMode` type ('LOCAL' | 'REMOTE')
- [ ] `TransportType` type
- [ ] `SessionType` type ('high-level' | 'low-level')

**File**: `types/session.ts`
- [ ] `HighLevelSession` interface
- [ ] `LowLevelSession` interface
- [ ] Session metadata types

**File**: `types/config.ts`
- [ ] `LocalServerConfig` interface
- [ ] `RemoteServerConfig` interface
- [ ] `TransportConfig` type

#### 1.4 Unit Tests
- [ ] Test interface definitions compile
- [ ] Test type compatibility
- [ ] Test interface contracts

**Deliverables**:
- ✅ All interfaces defined
- ✅ All types defined
- ✅ TypeScript compilation passes
- ✅ Basic unit tests pass

**Dependencies**: None

**Estimated Time**: 2 days

---

## Phase 2: Service Key Store and Session Store (Week 1, Days 3-4)

### Goals
- Implement file system-based stores
- Create memory-based stores for testing
- Integrate with platform paths

### Tasks

#### 2.1 Service Key Store Implementation

**File**: `connection/stores/service-key/filesystem.ts`
- [ ] Implement `FileSystemServiceKeyStore` class
- [ ] `getServiceKey(destination)` - read from `~/.mcp-abap-adt/service-keys/{destination}.json`
- [ ] `hasServiceKey(destination)` - check file existence
- [ ] `listDestinations()` - list all `.json` files in service-keys directory
- [ ] Error handling for missing/invalid files
- [ ] Integration with `getPlatformPaths()` from `@mcp-abap-adt/auth-stores`

**File**: `connection/stores/service-key/memory.ts`
- [ ] Implement `MemoryServiceKeyStore` class (for testing)
- [ ] In-memory Map storage
- [ ] Same interface as FileSystemServiceKeyStore

#### 2.2 Session Store Implementation

**File**: `connection/stores/session/filesystem.ts`
- [ ] Implement `FileSystemSessionStore` class
- [ ] `saveTokens(destination, tokens)` - save to `~/.mcp-abap-adt/sessions/{destination}.env`
- [ ] `getTokens(destination)` - read from file
- [ ] `deleteTokens(destination)` - remove file
- [ ] Token expiration handling
- [ ] Integration with `getPlatformPaths()`

**File**: `connection/stores/session/memory.ts`
- [ ] Implement `MemorySessionStore` class (for testing)
- [ ] In-memory Map storage
- [ ] Same interface as FileSystemSessionStore

#### 2.3 Unit Tests

**File**: `__tests__/unit/stores/service-key-store.test.ts`
- [ ] Test FileSystemServiceKeyStore with real files
- [ ] Test MemoryServiceKeyStore
- [ ] Test error handling

**File**: `__tests__/unit/stores/session-store.test.ts`
- [ ] Test FileSystemSessionStore with real files
- [ ] Test MemorySessionStore
- [ ] Test token expiration

**Deliverables**:
- ✅ FileSystemServiceKeyStore implemented
- ✅ FileSystemSessionStore implemented
- ✅ Memory stores for testing
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 1 (interfaces)

**Estimated Time**: 2 days

---

## Phase 3: Auth Broker Factory (Week 1, Day 5 - Week 2, Day 1)

### Goals
- Implement factory for creating AuthBroker instances
- Inject ServiceKeyStore, SessionStore, TokenProvider into AuthBroker
- Manage broker lifecycle per session

### Tasks

#### 3.1 Auth Broker Factory Implementation

**File**: `auth/factory.ts`
- [ ] Implement `SessionBasedAuthBrokerFactory` class
- [ ] Constructor accepts: `IServiceKeyStore`, `ISessionStore`, `ITokenProvider`
- [ ] `getOrCreateBroker(sessionId, destination)` - create or retrieve broker
- [ ] `getBroker(sessionId)` - retrieve existing broker
- [ ] `deleteBroker(sessionId)` - cleanup broker
- [ ] `clearAll()` - cleanup all brokers
- [ ] Map-based storage: `Map<string, AuthBroker>`

#### 3.2 AuthBroker Integration

**File**: `auth/broker-manager.ts` (if needed)
- [ ] Internal broker management logic
- [ ] Broker configuration handling

**Integration with `@mcp-abap-adt/auth-broker`**:
- [ ] Create `AuthBroker` instances with injected dependencies:
  ```typescript
  new AuthBroker(
    serviceKeyStore,  // injected
    sessionStore,     // injected
    tokenProvider,    // injected
    { unsafe: false }
  )
  ```

#### 3.3 Unit Tests

**File**: `__tests__/unit/auth/factory.test.ts`
- [ ] Test broker creation
- [ ] Test broker retrieval
- [ ] Test broker cleanup
- [ ] Test multiple destinations per session
- [ ] Test broker isolation between sessions

**Deliverables**:
- ✅ SessionBasedAuthBrokerFactory implemented
- ✅ AuthBroker created with injected dependencies
- ✅ Broker lifecycle management
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 1 (interfaces), Phase 2 (stores)

**Estimated Time**: 2 days

---

## Phase 4: Connection Providers (Week 2, Days 2-3)

### Goals
- Implement LocalConnectionProvider (with AuthBroker)
- Implement RemoteConnectionProvider (with HeaderValidator)
- Support both LOCAL and REMOTE modes

### Tasks

#### 4.1 Local Connection Provider

**File**: `connection/providers/local.ts`
- [ ] Implement `LocalConnectionProvider` class
- [ ] Constructor accepts: `IAuthBrokerFactory`
- [ ] `getConnectionParams(request)` method:
  - Extract `destination` from request
  - Get or create AuthBroker via factory
  - Call `authBroker.getToken(destination)`
  - Get service key for URL
  - Return `ConnectionParams` with `sapUrl`, `auth`, `client`
- [ ] `updateConnectionParams()` - update tokens if needed

#### 4.2 Remote Connection Provider

**File**: `connection/providers/remote.ts`
- [ ] Implement `RemoteConnectionProvider` class
- [ ] Constructor accepts: `IHeaderValidator` (from `@mcp-abap-adt/header-validator`)
- [ ] `getConnectionParams(request)` method:
  - Extract `headers` from request
  - Call `headerValidator.validateAndExtract(headers)`
  - Return `ConnectionParams` from validated headers
- [ ] `updateConnectionParams()` - no-op or warning (REMOTE mode doesn't store credentials)

#### 4.3 Integration with Packages

- [ ] Import `validateAuthHeaders` from `@mcp-abap-adt/header-validator`
- [ ] Use `AuthMethodPriority` enum
- [ ] Handle all header constants from `@mcp-abap-adt/interfaces`

#### 4.4 Unit Tests

**File**: `__tests__/unit/connection/local-provider.test.ts`
- [ ] Test with mock AuthBrokerFactory
- [ ] Test token retrieval
- [ ] Test error handling (missing destination)

**File**: `__tests__/unit/connection/remote-provider.test.ts`
- [ ] Test with mock HeaderValidator
- [ ] Test header extraction
- [ ] Test validation errors

**Deliverables**:
- ✅ LocalConnectionProvider implemented
- ✅ RemoteConnectionProvider implemented
- ✅ Integration with external packages
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 1 (interfaces), Phase 3 (AuthBrokerFactory)

**Estimated Time**: 2 days

---

## Phase 5: Session Manager (Week 2, Days 4-5)

### Goals
- Implement session lifecycle management
- Support HighLevel and LowLevel sessions
- Handle session upgrade/downgrade

### Tasks

#### 5.1 Session Implementation

**File**: `session/session.ts`
- [ ] Implement `Session` class
- [ ] Properties:
  - `id: string` (UUID)
  - `type: 'high-level' | 'low-level'`
  - `connectionParams: ConnectionParams` (required)
  - `sapSession?: { sessionId, cookies, securityToken }`
  - `createdAt: Date`
  - `lastActivity: Date`
  - `metadata: { transport, clientIP, requestCount, errorCount }`
- [ ] Methods: `updateActivity()`, `upgrade()`, `downgrade()`

#### 5.2 Session Manager Implementation

**File**: `session/manager.ts`
- [ ] Implement `SessionManager` class
- [ ] `createSession(type, clientInfo)` - create new session
- [ ] `getSession(sessionId)` - retrieve session
- [ ] `deleteSession(sessionId)` - cleanup session
- [ ] `upgradeToLowLevel(sessionId, cookies)` - upgrade session
- [ ] `downgradeToHighLevel(sessionId)` - downgrade session
- [ ] `getAllSessions()` - list all sessions
- [ ] `getActiveSessions()` - list active sessions
- [ ] Event emitters: `on('created')`, `on('closed')`, `on('upgraded')`
- [ ] Map-based storage: `Map<string, ISession>`

#### 5.3 Unit Tests

**File**: `__tests__/unit/session/session.test.ts`
- [ ] Test session creation
- [ ] Test session upgrade/downgrade
- [ ] Test connectionParams assignment

**File**: `__tests__/unit/session/manager.test.ts`
- [ ] Test session CRUD operations
- [ ] Test upgrade/downgrade flow
- [ ] Test event emission
- [ ] Test session isolation

**Deliverables**:
- ✅ Session class implemented
- ✅ SessionManager implemented
- ✅ Upgrade/downgrade logic
- ✅ Event system
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 1 (interfaces)

**Estimated Time**: 2 days

---

## Phase 6: Transports (Week 3, Days 1-3)

### Goals
- Implement all transport types
- Wrap SDK transports with ITransport interface
- Support LOCAL and REMOTE modes

### Tasks

#### 6.1 Base Transport

**File**: `transports/base.ts`
- [ ] Abstract `BaseTransport` class
- [ ] Common event handling logic
- [ ] Common lifecycle methods

#### 6.2 Stdio Transport

**File**: `transports/stdio.ts`
- [ ] Implement `StdioTransport` class
- [ ] Wrap `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio`
- [ ] `bindAddress = '127.0.0.1'` (always LOCAL)
- [ ] Single global session
- [ ] Event forwarding from SDK transport
- [ ] `start()` - initialize SDK transport
- [ ] `stop()` - cleanup
- [ ] `send()` - write to stdout
- [ ] `on('message')` - read from stdin

#### 6.3 SSE Transport

**File**: `transports/sse.ts`
- [ ] Implement `SseTransport` class
- [ ] Wrap `SSEServerTransport` from `@modelcontextprotocol/sdk/server/sse`
- [ ] `bindAddress` from config (127.0.0.1 or 0.0.0.0)
- [ ] Multiple sessions support
- [ ] CORS configuration
- [ ] DNS rebinding protection
- [ ] Event forwarding
- [ ] Session management per connection

#### 6.4 Streamable HTTP Transport

**File**: `transports/streamable-http.ts`
- [ ] Implement `StreamableHttpTransport` class
- [ ] Wrap `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp`
- [ ] `bindAddress` from config (127.0.0.1 or 0.0.0.0)
- [ ] Multiple sessions support
- [ ] CORS configuration
- [ ] DNS rebinding protection
- [ ] JSON response mode support
- [ ] Event forwarding
- [ ] Session management per request

#### 6.5 Unit Tests

**File**: `__tests__/unit/transports/stdio.test.ts`
- [ ] Test transport initialization
- [ ] Test message sending/receiving
- [ ] Mock SDK transport

**File**: `__tests__/unit/transports/sse.test.ts`
- [ ] Test transport initialization
- [ ] Test session creation
- [ ] Test CORS handling

**File**: `__tests__/unit/transports/streamable-http.test.ts`
- [ ] Test transport initialization
- [ ] Test session management
- [ ] Test JSON response mode

**Deliverables**:
- ✅ All three transports implemented
- ✅ SDK integration working
- ✅ Event system working
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 1 (interfaces)

**Estimated Time**: 3 days

---

## Phase 7: Handlers Registry (Week 3, Day 4)

### Goals
- Adapt existing McpHandlers to IHandlersRegistry interface
- Support JSON Schema to Zod conversion
- Register all tools on MCP server

### Tasks

#### 7.1 Handlers Registry Interface

**File**: `handlers/registry.ts`
- [ ] Define `IHandlersRegistry` interface
- [ ] `registerAllTools(server)` method
- [ ] `registerTool(name, definition, handler)` method
- [ ] `getRegisteredTools()` method

#### 7.2 Adapt McpHandlers

**File**: `handlers/mcp-handlers.ts`
- [ ] Adapt existing `McpHandlers` class to implement `IHandlersRegistry`
- [ ] Rename `RegisterAllToolsOnServer()` → `registerAllTools()`
- [ ] Extract `registerTool()` as public method
- [ ] Keep JSON Schema to Zod conversion logic
- [ ] Keep all existing handler imports
- [ ] Keep all existing tool registrations

#### 7.3 Unit Tests

**File**: `__tests__/unit/handlers/registry.test.ts`
- [ ] Test tool registration
- [ ] Test JSON Schema conversion
- [ ] Test error handling

**Deliverables**:
- ✅ IHandlersRegistry interface defined
- ✅ McpHandlers adapted
- ✅ All tools registerable
- ✅ Unit tests pass

**Dependencies**: Phase 1 (interfaces)

**Estimated Time**: 1 day

---

## Phase 8: Protocol Handler (Week 3, Day 5)

### Goals
- Implement protocol handler with session support
- Integrate with HandlersRegistry
- Handle MCP protocol requests

### Tasks

#### 8.1 Protocol Handler Implementation

**File**: `protocol/handler.ts`
- [ ] Implement `ProtocolHandler` class
- [ ] Constructor accepts: `ISessionManager`
- [ ] `initialize(handlersRegistry, mcpServer)` method:
  - Store references
  - Call `handlersRegistry.registerAllTools(mcpServer)`
- [ ] `handleRequest(sessionId, request)` method:
  - Get session from SessionManager
  - Delegate to MCP server from SDK
  - Handle errors
- [ ] `executeTool(sessionId, toolName, params)` method:
  - Get session from SessionManager
  - Delegate to MCP server from SDK
  - Handle errors

#### 8.2 Error Handling

**File**: `protocol/error.ts`
- [ ] Error conversion utilities
- [ ] MCP error format conversion

#### 8.3 Unit Tests

**File**: `__tests__/unit/protocol/handler.test.ts`
- [ ] Test initialization
- [ ] Test request handling
- [ ] Test tool execution
- [ ] Test error handling
- [ ] Mock dependencies

**Deliverables**:
- ✅ ProtocolHandler implemented
- ✅ Integration with HandlersRegistry
- ✅ Integration with MCP SDK
- ✅ Error handling
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 1 (interfaces), Phase 5 (SessionManager), Phase 7 (HandlersRegistry)

**Estimated Time**: 1 day

---

## Phase 9: McpServer Core (Week 4, Days 1-2)

### Goals
- Implement main McpServer class with Dependency Injection
- Implement McpServerFactory
- Add configuration validation

### Tasks

#### 9.1 McpServer Implementation

**File**: `core/server.ts`
- [ ] Implement `McpServer` class
- [ ] Constructor with DI:
  ```typescript
  constructor(
    transport: ITransport,
    sessionManager: ISessionManager,
    connectionProvider: IConnectionProvider,
    protocolHandler: IProtocolHandler,
    handlersRegistry: IHandlersRegistry,
    mcpServer: McpServer,  // from SDK
    logger?: ILogger
  )
  ```
- [ ] `validateConfiguration()` - check transport mode matches connection provider mode
- [ ] `start()` method:
  - Start transport
  - Setup event handlers
  - Initialize protocol handler
- [ ] `stop()` method:
  - Stop transport
  - Cleanup sessions
  - Cleanup brokers
- [ ] Event handler setup:
  - `transport.on('session:created')` → create session, get connection params
  - `transport.on('message')` → handle via protocol handler
  - `transport.on('session:closed')` → cleanup session

#### 9.2 McpServerFactory Implementation

**File**: `core/factory.ts`
- [ ] Implement `McpServerFactory` class
- [ ] `createLocal(config)` static method:
  - Create transport (local)
  - Create ServiceKeyStore
  - Create SessionStore
  - Create TokenProvider
  - Create AuthBrokerFactory
  - Create LocalConnectionProvider
  - Create SessionManager
  - Create MCP server (SDK)
  - Create HandlersRegistry
  - Create ProtocolHandler
  - Create and return McpServer
- [ ] `createRemote(config)` static method:
  - Create transport (remote)
  - Create HeaderValidator
  - Create RemoteConnectionProvider
  - Create SessionManager
  - Create MCP server (SDK)
  - Create HandlersRegistry
  - Create ProtocolHandler
  - Create and return McpServer
- [ ] Helper methods: `createLocalTransport()`, `createRemoteTransport()`

#### 9.3 Unit Tests

**File**: `__tests__/unit/core/server.test.ts`
- [ ] Test server creation
- [ ] Test configuration validation
- [ ] Test start/stop lifecycle
- [ ] Test event handling
- [ ] Mock all dependencies

**File**: `__tests__/unit/core/factory.test.ts`
- [ ] Test createLocal()
- [ ] Test createRemote()
- [ ] Test transport creation
- [ ] Test dependency injection

**Deliverables**:
- ✅ McpServer class implemented
- ✅ McpServerFactory implemented
- ✅ Configuration validation
- ✅ Lifecycle management
- ✅ Unit tests with >80% coverage

**Dependencies**: All previous phases

**Estimated Time**: 2 days

---

## Phase 10: CLI and YAML Configuration (Week 4, Days 3-4)

### Goals
- Implement CLI arguments parser
- Implement YAML configuration loader
- Support configuration merging (CLI overrides YAML)

### Tasks

#### 10.1 CLI Arguments Parser

**File**: `cli/parser.ts`
- [ ] Implement `ArgumentsParser` class
- [ ] `parseArguments()` method:
  - Parse `process.argv`
  - Support `--key=value` format
  - Support `--key value` format
  - Support boolean flags (`--flag`)
  - Return `ParsedArguments` object
- [ ] `getArgument(name)` method
- [ ] `hasFlag(name)` method
- [ ] Handle all server options:
  - `--transport`, `--config`, `--mcp`, `--env`
  - `--auth-broker`, `--auth-broker-path`, `--unsafe`
  - `--http-port`, `--http-host`, `--http-json-response`, etc.
  - `--sse-port`, `--sse-host`, etc.

#### 10.2 YAML Config Loader

**File**: `yaml/loader.ts`
- [ ] Implement `YamlConfigLoader` class
- [ ] `loadConfig(path)` method:
  - Read YAML file
  - Parse with `yaml` package
  - Return `YamlConfig` object
- [ ] `validateConfig(config)` method:
  - Validate transport type
  - Validate ports (1-65535)
  - Validate hosts
  - Return validation result with errors
- [ ] `generateTemplateIfNeeded(path)` method:
  - Check if file exists
  - If not, generate template YAML
  - Return `true` if generated, `false` if exists
- [ ] `applyConfigToArgs(config, args)` method:
  - Merge YAML config into args
  - CLI args have priority (don't override if CLI arg exists)
  - Return merged arguments

#### 10.3 YAML Template

**File**: `yaml/template.ts`
- [ ] Generate default YAML template
- [ ] Include all configuration options
- [ ] Include comments/documentation

#### 10.4 Unit Tests

**File**: `__tests__/unit/cli/parser.test.ts`
- [ ] Test argument parsing
- [ ] Test different formats
- [ ] Test boolean flags

**File**: `__tests__/unit/yaml/loader.test.ts`
- [ ] Test YAML loading
- [ ] Test validation
- [ ] Test template generation
- [ ] Test config merging

**Deliverables**:
- ✅ ArgumentsParser implemented
- ✅ YamlConfigLoader implemented
- ✅ Template generation
- ✅ Config merging (CLI priority)
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 1 (types)

**Estimated Time**: 2 days

---

## Phase 11: Server Launcher (Week 4, Day 5)

### Goals
- Implement server launcher that ties everything together
- Support CLI arguments and YAML configuration
- Determine LOCAL/REMOTE mode automatically
- Handle graceful shutdown

### Tasks

#### 11.1 Server Launcher Implementation

**File**: `launcher/launcher.ts`
- [ ] Implement `ServerLauncher` class
- [ ] Constructor accepts:
  - `IArgumentsParser`
  - `IYamlConfigLoader`
  - `McpServerFactory` (static class)
- [ ] `launch()` method:
  1. Parse CLI arguments
  2. If `--config` specified:
     - Generate template if needed (exit if generated)
     - Load YAML config
     - Validate config (exit if invalid)
     - Merge YAML into args (CLI priority)
  3. Determine mode (LOCAL/REMOTE) based on transport host
  4. Create server via Factory (createLocal or createRemote)
  5. Start server
  6. Setup signal handlers
- [ ] `determineMode(args)` method:
  - Check transport type and host
  - Return 'LOCAL' or 'REMOTE'
- [ ] `buildLocalConfig(args)` method
- [ ] `buildRemoteConfig(args)` method
- [ ] `buildTransportConfig(args)` method
- [ ] `setupSignalHandlers(server)` method:
  - Handle SIGTERM
  - Handle SIGINT
  - Graceful shutdown

#### 11.2 Entry Point

**File**: `bin/mcp-abap-adt.js` (update existing)
- [ ] Import ServerLauncher
- [ ] Import ArgumentsParser
- [ ] Import YamlConfigLoader
- [ ] Import McpServerFactory
- [ ] Create launcher instance
- [ ] Call `launcher.launch()`
- [ ] Error handling

#### 11.3 Unit Tests

**File**: `__tests__/unit/launcher/launcher.test.ts`
- [ ] Test launch() with CLI args only
- [ ] Test launch() with YAML config
- [ ] Test mode determination
- [ ] Test signal handlers
- [ ] Mock all dependencies

**Deliverables**:
- ✅ ServerLauncher implemented
- ✅ Entry point updated
- ✅ Graceful shutdown
- ✅ Unit tests with >80% coverage

**Dependencies**: Phase 9 (McpServer), Phase 10 (CLI/YAML)

**Estimated Time**: 1 day

---

## Phase 12: Integration Testing (Week 5, Days 1-3)

### Goals
- Test complete flows
- Test all transport types
- Test LOCAL and REMOTE modes
- Test session lifecycle

### Tasks

#### 12.1 Integration Tests Setup

**File**: `__tests__/integration/setup.ts`
- [ ] Test environment setup
- [ ] Mock SAP system (if needed)
- [ ] Test data preparation

#### 12.2 Transport Integration Tests

**File**: `__tests__/integration/transports/stdio.test.ts`
- [ ] Test stdio transport end-to-end
- [ ] Test message sending/receiving
- [ ] Test session creation

**File**: `__tests__/integration/transports/sse.test.ts`
- [ ] Test SSE transport end-to-end
- [ ] Test multiple sessions
- [ ] Test reconnect

**File**: `__tests__/integration/transports/http.test.ts`
- [ ] Test HTTP transport end-to-end
- [ ] Test multiple sessions
- [ ] Test CORS

#### 12.3 Mode Integration Tests

**File**: `__tests__/integration/modes/local.test.ts`
- [ ] Test LOCAL mode with stdio
- [ ] Test LOCAL mode with SSE
- [ ] Test LOCAL mode with HTTP
- [ ] Test AuthBroker integration
- [ ] Test service key reading
- [ ] Test token management

**File**: `__tests__/integration/modes/remote.test.ts`
- [ ] Test REMOTE mode with SSE
- [ ] Test REMOTE mode with HTTP
- [ ] Test header validation
- [ ] Test no AuthBroker usage

#### 12.4 Session Lifecycle Tests

**File**: `__tests__/integration/session/lifecycle.test.ts`
- [ ] Test HighLevel session creation
- [ ] Test upgrade to LowLevel
- [ ] Test downgrade to HighLevel
- [ ] Test session cleanup
- [ ] Test multiple sessions

#### 12.5 End-to-End Tests

**File**: `__tests__/integration/e2e/full-flow.test.ts`
- [ ] Test complete request flow
- [ ] Test tool execution
- [ ] Test error handling
- [ ] Test session persistence

**Deliverables**:
- ✅ All transports tested
- ✅ Both modes tested
- ✅ Session lifecycle tested
- ✅ End-to-end flows tested
- ✅ Integration tests pass

**Dependencies**: All previous phases

**Estimated Time**: 3 days

---

## Phase 13: Migration and Backward Compatibility (Week 5, Days 4-5)

### Goals
- Create migration adapter
- Maintain backward compatibility
- Update documentation

### Tasks

#### 13.1 Migration Adapter

**File**: `migration/adapter.ts`
- [ ] Create adapter for old server interface
- [ ] Map old API to new API
- [ ] Support gradual migration

#### 13.2 Backward Compatibility

- [ ] Ensure CLI arguments still work
- [ ] Ensure YAML config format compatible
- [ ] Ensure environment variables still work
- [ ] Test with existing client configurations

#### 13.3 Documentation

**File**: `docs/migration-guide.md`
- [ ] Migration steps
- [ ] Breaking changes (if any)
- [ ] Configuration changes
- [ ] Examples

**File**: `docs/architecture.md`
- [ ] Update architecture documentation
- [ ] Add diagrams
- [ ] Add examples

**Deliverables**:
- ✅ Migration adapter (if needed)
- ✅ Backward compatibility maintained
- ✅ Documentation updated

**Dependencies**: All previous phases

**Estimated Time**: 2 days

---

## Phase 14: Performance and Optimization (Week 6, Days 1-2)

### Goals
- Performance testing
- Memory leak detection
- Optimization if needed

### Tasks

#### 14.1 Performance Tests

**File**: `__tests__/performance/load.test.ts`
- [ ] Test with multiple concurrent sessions
- [ ] Test with high request rate
- [ ] Measure response times
- [ ] Measure memory usage

#### 14.2 Memory Leak Detection

- [ ] Run long-running tests
- [ ] Monitor memory usage
- [ ] Check for leaks in:
  - Session storage
  - Broker storage
  - Event listeners
  - Transport connections

#### 14.3 Optimization

- [ ] Optimize session lookup
- [ ] Optimize broker creation
- [ ] Optimize token caching
- [ ] Profile and optimize hot paths

**Deliverables**:
- ✅ Performance benchmarks
- ✅ No memory leaks detected
- ✅ Optimizations applied (if needed)

**Dependencies**: All previous phases

**Estimated Time**: 2 days

---

## Phase 15: Final Testing and Documentation (Week 6, Days 3-5)

### Goals
- Complete test coverage
- Final documentation
- Release preparation

### Tasks

#### 15.1 Test Coverage

- [ ] Achieve >85% code coverage
- [ ] Test all edge cases
- [ ] Test error scenarios
- [ ] Test security scenarios

#### 15.2 Documentation

- [ ] API documentation
- [ ] Architecture documentation
- [ ] User guide
- [ ] Developer guide
- [ ] Migration guide

#### 15.3 Release Preparation

- [ ] Code review
- [ ] Final testing
- [ ] Release notes
- [ ] Version bump (if needed)

**Deliverables**:
- ✅ >85% test coverage
- ✅ Complete documentation
- ✅ Ready for release

**Dependencies**: All previous phases

**Estimated Time**: 3 days

---

## Summary

### Total Estimated Time: 4-6 weeks

### Phase Breakdown:
- **Week 1**: Foundation, Stores, AuthBroker (5 days)
- **Week 2**: Connection Providers, Session Manager (5 days)
- **Week 3**: Transports, Handlers, Protocol (5 days)
- **Week 4**: Core Server, CLI/YAML, Launcher (5 days)
- **Week 5**: Integration Tests, Migration (5 days)
- **Week 6**: Performance, Final Testing, Documentation (5 days)

### Key Milestones:
1. ✅ **Week 1 End**: All interfaces and stores working
2. ✅ **Week 2 End**: Connection providers and session management working
3. ✅ **Week 3 End**: All transports working
4. ✅ **Week 4 End**: Complete server with CLI/YAML support
5. ✅ **Week 5 End**: Integration tests passing
6. ✅ **Week 6 End**: Ready for production

### Risk Mitigation:
- Start with interfaces and types (Phase 1) - foundation for everything
- Implement stores early (Phase 2) - needed by AuthBroker
- Test each phase independently before moving to next
- Keep backward compatibility in mind throughout
- Regular code reviews after each phase

### Success Criteria:
- ✅ All unit tests pass (>85% coverage)
- ✅ All integration tests pass
- ✅ Both LOCAL and REMOTE modes work
- ✅ All transports work (stdio, SSE, HTTP)
- ✅ YAML configuration works
- ✅ Backward compatibility maintained
- ✅ No memory leaks
- ✅ Performance acceptable
- ✅ Documentation complete
