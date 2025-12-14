# MCP Server v2 Implementation Roadmap

Concise roadmap for implementing the new architecture with Dependency Injection.

## Status

- ✅ **Completed**: Handler Groups system (ReadOnly, HighLevel, LowLevel, System, Search)
- ✅ **Completed**: Phase 1 - Core Interfaces & Types (all interfaces and implementations)
- ✅ **Completed**: Phase 1.2 & 1.3 - Connection Providers and SessionManager implementations
- 🔄 **In Progress**: Phase 2 - Core Server Implementation
- ⏳ **Planned**: Remaining v2 architecture components (Phase 3-7)

---

## Phase 1: Core Interfaces & Types

### 1.1 Transport Layer
- [x] `ITransport` interface
- [x] `StdioTransport` implementation
- [x] `SseTransport` implementation
- [x] `StreamableHttpTransport` implementation

### 1.2 Connection & Auth
- [x] `IConnectionProvider` interface
- [x] `LocalConnectionProvider` (LOCAL mode)
- [x] `RemoteConnectionProvider` (REMOTE mode)
- [x] `IServiceKeyStore` interface
- [x] `ISessionStore` interface
- [x] `ITokenProvider` interface
- [x] `IAuthBrokerFactory` interface
- [x] `IHeaderValidator` interface

### 1.3 Session Management
- [x] `ISessionManager` interface
- [x] `ISession` type (unified: clientSessionId + abapSession)
- [x] `SessionManager` implementation

### 1.4 Protocol & Handlers
- [x] `IProtocolHandler` interface
- [x] `IHandlersRegistry` interface (✅ already exists)
- [x] `CompositeHandlersRegistry` (✅ already exists)
- [x] Handler Groups (✅ already exists: ReadOnly, HighLevel, LowLevel, System, Search)

---

## Phase 2: Core Server Implementation

### 2.1 McpServer Class
- [ ] `McpServer` class with DI constructor
- [ ] Integration with `ITransport`
- [ ] Integration with `ISessionManager`
- [ ] Integration with `IConnectionProvider`
- [ ] Integration with `IProtocolHandler`
- [ ] Integration with `IHandlersRegistry`

### 2.2 Request Processing
- [ ] Request routing
- [ ] Session extraction
- [ ] Connection params resolution
- [ ] Handler execution
- [ ] Error handling

---

## Phase 3: LOCAL Mode Implementation

### 3.1 Service Key Store
- [ ] `FileSystemServiceKeyStore` implementation
- [ ] Service key loading
- [ ] Service key validation

### 3.2 Auth Broker
- [x] `IAuthBrokerFactory` interface
- [ ] `SessionBasedAuthBrokerFactory` implementation (implementation in @mcp-abap-adt/auth-broker)
- [ ] `AuthBroker` integration with DI (implementation in @mcp-abap-adt/auth-broker)
- [ ] Token management (get, refresh) (implementation in @mcp-abap-adt/auth-broker)

### 3.3 Local Connection Provider
- [x] `LocalConnectionProvider` implementation
- [x] Service key lookup (via AuthBroker)
- [x] Auth broker creation (via Factory)
- [x] Connection params building

---

## Phase 4: REMOTE Mode Implementation

### 4.1 Header Validator
- [x] `IHeaderValidator` interface
- [ ] Header validation logic (implementation in @mcp-abap-adt/header-validator)
- [ ] Connection params extraction from headers (implementation in @mcp-abap-adt/header-validator)

### 4.2 Remote Connection Provider
- [x] `RemoteConnectionProvider` implementation
- [x] Header-based connection params
- [x] No auth broker (proxy only)

---

## Phase 5: Factory & Configuration

### 5.1 Server Factory
- [ ] `McpServerFactory` class
- [ ] `createLocal()` method
- [ ] `createRemote()` method
- [ ] Transport configuration
- [ ] DI container setup

### 5.2 Configuration
- [ ] `IArgumentsParser` interface
- [ ] CLI arguments parsing
- [ ] `IYamlConfigLoader` interface
- [ ] YAML config loading
- [ ] `IServerLauncher` interface
- [ ] Server launcher implementation

---

## Phase 6: Testing & Integration

### 6.1 Unit Tests
- [ ] Transport tests
- [ ] Connection provider tests
- [ ] Session manager tests
- [ ] Protocol handler tests
- [ ] Factory tests

### 6.2 Integration Tests
- [ ] LOCAL mode integration tests
- [ ] REMOTE mode integration tests
- [ ] End-to-end request flow tests

### 6.3 Migration
- [ ] Migration from v1 to v2
- [ ] Backward compatibility (if needed)

---

## Phase 7: Documentation & Polish

### 7.1 Documentation
- [ ] API documentation
- [ ] Usage examples
- [ ] Migration guide
- [ ] Architecture diagrams update

### 7.2 Performance
- [ ] Performance testing
- [ ] Memory leak detection
- [ ] Optimization (if needed)

---

## Priorities

**High Priority:**
1. Phase 1: Core Interfaces & Types
2. Phase 2: Core Server Implementation
3. Phase 3: LOCAL Mode Implementation

**Medium Priority:**
4. Phase 4: REMOTE Mode Implementation
5. Phase 5: Factory & Configuration

**Low Priority:**
6. Phase 6: Testing & Integration
7. Phase 7: Documentation & Polish

---

## Notes

- Handler Groups system is already implemented and ready to use
- Architecture is described in `ARCHITECTURE.md`
- Detailed roadmap in `IMPLEMENTATION_ROADMAP.md`
- Some implementations depend on external packages:
  - `AuthBroker` and `SessionBasedAuthBrokerFactory` - in `@mcp-abap-adt/auth-broker`
  - `IHeaderValidator` implementation - in `@mcp-abap-adt/header-validator`
  - `IServiceKeyStore`, `ISessionStore`, `ITokenProvider` implementations - in `@mcp-abap-adt/auth-stores` and `@mcp-abap-adt/auth-providers`
- Some implementations depend on external packages:
  - `AuthBroker` and `SessionBasedAuthBrokerFactory` - in `@mcp-abap-adt/auth-broker`
  - `IHeaderValidator` implementation - in `@mcp-abap-adt/header-validator`
  - `IServiceKeyStore`, `ISessionStore`, `ITokenProvider` implementations - in `@mcp-abap-adt/auth-stores` and `@mcp-abap-adt/auth-providers`
