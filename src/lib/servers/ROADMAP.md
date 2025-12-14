# MCP Server v2 Implementation Roadmap

Concise roadmap for implementing the new architecture with Dependency Injection.

## Status

- ✅ **Completed**: Handler Groups system (ReadOnly, HighLevel, LowLevel, System, Search)
- 🔄 **In Progress**: -
- ⏳ **Planned**: Remaining v2 architecture components

---

## Phase 1: Core Interfaces & Types

### 1.1 Transport Layer
- [ ] `ITransport` interface
- [ ] `StdioTransport` implementation
- [ ] `SseTransport` implementation
- [ ] `StreamableHttpTransport` implementation

### 1.2 Connection & Auth
- [ ] `IConnectionProvider` interface
- [ ] `LocalConnectionProvider` (LOCAL mode)
- [ ] `RemoteConnectionProvider` (REMOTE mode)
- [ ] `IServiceKeyStore` interface
- [ ] `ISessionStore` interface
- [ ] `ITokenProvider` interface

### 1.3 Session Management
- [ ] `ISessionManager` interface
- [ ] `ISession` type (unified: clientSessionId + abapSession)
- [ ] `SessionManager` implementation

### 1.4 Protocol & Handlers
- [ ] `IProtocolHandler` interface
- [ ] `IHandlersRegistry` interface (✅ already exists)
- [ ] `CompositeHandlersRegistry` (✅ already exists)
- [ ] Handler Groups (✅ already exists: ReadOnly, HighLevel, LowLevel, System, Search)

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
- [ ] `IAuthBrokerFactory` interface
- [ ] `SessionBasedAuthBrokerFactory` implementation
- [ ] `AuthBroker` integration with DI
- [ ] Token management (get, refresh)

### 3.3 Local Connection Provider
- [ ] `LocalConnectionProvider` implementation
- [ ] Service key lookup
- [ ] Auth broker creation
- [ ] Connection params building

---

## Phase 4: REMOTE Mode Implementation

### 4.1 Header Validator
- [ ] `IHeaderValidator` interface
- [ ] Header validation logic
- [ ] Connection params extraction from headers

### 4.2 Remote Connection Provider
- [ ] `RemoteConnectionProvider` implementation
- [ ] Header-based connection params
- [ ] No auth broker (proxy only)

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
