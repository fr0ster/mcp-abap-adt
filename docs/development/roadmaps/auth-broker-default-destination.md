# Roadmap: AuthBroker Refactoring for Default Destination Support

## Current Situation Analysis

### Current Implementation:
1. **Lazy initialization**: AuthBroker is created on first request with destination
2. **Broker key**: `${destination || 'default'}::${clientKey || 'global'}`
3. **Transport modes**:
   - **stdio/SSE**: `clientKey = 'global'` (one broker for entire server)
   - **HTTP/streamable-http**: `clientKey = sessionId` (separate broker per client)
4. **Broker creation**: Always with `serviceKeyStore` + `sessionStore` (even if no service key exists)

### Current Implementation Issues:
1. ❌ Broker has no concept of "default destination"
2. ❌ Cannot create broker with only sessionStore (for .env case)
3. ❌ When request has no connection parameters - default destination is not used
4. ❌ In stdio mode - no automatic connection on startup

---

## Requirements for New Implementation

### 1. Broker Creation on Server Startup

#### Scenario A: Destination specified at startup (`--mcp=<destination>`)
- ✅ Create broker with `serviceKeyStore` + `sessionStore`
- ✅ Set default destination = specified one
- ✅ For stdio/SSE: one default broker (`clientKey = 'global'`)
- ✅ For HTTP: create broker for each client on first request

#### Scenario B: No destination specified, but .env file exists
- ✅ Create broker with only `sessionStore` (without serviceKeyStore)
- ✅ Default destination = `.env` (or `default`)
- ✅ Broker must be able to load configuration from .env via sessionStore

#### Scenario C: Neither destination nor .env
- ⚠️ Question: What to do? Error on startup? Or create "empty" broker?

### 2. Handling Requests Without Connection Parameters

#### Logic:
1. If request has connection parameters (headers) → use them
2. If no parameters → use default destination from broker
3. Broker must:
   - Get configuration from stores (serviceKeyStore or sessionStore)
   - Get token via `getToken(defaultDestination)`
   - Return `IConnectionConfig`

### 3. Transport Modes

#### stdio:
- ✅ On startup: create default broker
- ✅ Immediately connect to ABAP using default destination
- ✅ All requests use default destination (unless specified otherwise)

#### SSE:
- ✅ On startup: create default broker (if destination/.env exists)
- ✅ On client connection: use default broker
- ✅ Ability to override destination via headers

#### HTTP/streamable-http:
- ✅ On startup: do not create broker (wait for first request)
- ✅ On first request from client:
  - If destination in parameters → create broker for this client with this destination
  - If no destination → create broker with default destination (if exists)
- ✅ Each client has its own broker (`clientKey = sessionId`)

---

## Implementation Roadmap

### Stage 1: AuthBroker Extension (if needed)

**Question 1.1**: Does AuthBroker support "default destination" concept?
- If not → need to add method `setDefaultDestination(destination: string)`
- Or pass defaultDestination in constructor

**Question 1.2**: Can AuthBroker work without serviceKeyStore?
- If not → need to allow `serviceKeyStore: undefined` in configuration
- Or create "dummy" serviceKeyStore for .env case

**Question 1.3**: Can sessionStore load configuration from .env file?
- If not → need to add .env loading logic to sessionStore
- Or create separate "EnvSessionStore" that reads .env

### Stage 2: Broker Initialization Refactoring

#### 2.1. Create `initializeDefaultBroker()` method
```typescript
private async initializeDefaultBroker(): Promise<void> {
  // Logic to determine: destination in parameters or .env
  // Create broker with correct stores
  // Set default destination
}
```

#### 2.2. Call on server startup
- stdio: call in `run()` before connecting transport
- SSE: call in `run()` before creating SSE server
- HTTP: do not call (lazy initialization on first request)

### Stage 3: Refactor `getOrCreateAuthBroker()`

#### 3.1. Support default destination
```typescript
private async getOrCreateAuthBroker(
  destination?: string, 
  clientKey?: string
): Promise<AuthBroker | undefined> {
  // If destination not specified → use default
  const actualDestination = destination || this.defaultDestination;
  
  // Broker creation/retrieval logic
}
```

#### 3.2. Create broker with only sessionStore
```typescript
// If no service key, but .env exists
if (!hasServiceKey && hasEnvFile) {
  const sessionStore = createSessionStoreFromEnv();
  // Create broker without serviceKeyStore
}
```

### Stage 4: Refactor `applyAuthHeaders()`

#### 4.1. Use default destination
```typescript
private async applyAuthHeaders(
  headers?: IncomingHttpHeaders, 
  sessionId?: string, 
  clientKey?: string
) {
  // If no headers → use default destination
  if (!headers || Object.keys(headers).length === 0) {
    if (this.defaultDestination) {
      // Get configuration from default broker
      const authBroker = await this.getOrCreateAuthBroker(undefined, clientKey);
      const connConfig = await authBroker.getConnectionConfig(this.defaultDestination);
      // ...
    }
  }
}
```

### Stage 5: Automatic Connection for stdio

#### 5.1. Connect on startup
```typescript
async run() {
  if (this.transportConfig.type === "stdio") {
    // Initialize default broker
    await this.initializeDefaultBroker();
    
    // Get configuration from default destination
    const connConfig = await this.getDefaultConnectionConfig();
    
    // Connect to ABAP
    this.processJwtConfigUpdate(connConfig.serviceUrl, connConfig.jwtToken, ...);
    
    // Connect transport
    const transport = new StdioServerTransport();
    await this.mcpServer.server.connect(transport);
  }
}
```

---

## Questions for Clarification

### Questions about AuthBroker API

**Q1**: Does `AuthBroker` support "default destination" concept?
- If not, can we add method `setDefaultDestination()` or pass in constructor?
- Is it enough to just store `defaultDestination` in `mcp_abap_adt_server`?

**Q2**: Can `AuthBroker` work without `serviceKeyStore`?
- Can we pass `serviceKeyStore: undefined` in configuration?
- Or need to create "dummy" store for .env case?

**Q3**: How does `sessionStore` load configuration from .env file?
- Is there method `loadFromEnvFile(path: string)`?
- Do we need to create separate "EnvSessionStore" that reads .env?

**Q4**: Can `AuthBroker.getConnectionConfig(destination)` work without service key?
- If destination not found in serviceKeyStore, does it search in sessionStore?
- Do we need separate method for loading from .env?

### Questions about Workflow Logic

**Q5**: What to do if neither destination nor .env file exists at startup?
- Error on startup?
- Create "empty" broker and wait for first request with headers?
- For stdio - must have destination or .env?

**Q6**: How to handle situation when .env file appears after server startup?
- Reload configuration?
- Ignore (only on startup)?

**Q7**: For HTTP mode: if client sends request without destination, but default destination exists:
- Create broker for this client with default destination?
- Or use global default broker?

**Q8**: Can we have multiple default destinations for different clients (HTTP)?
- For example, client A → destination A, client B → destination B
- Or always one global default destination?

### Questions about Compatibility

**Q9**: How to maintain compatibility with current implementation?
- Do we need to support old format (without default destination)?
- Can we make breaking change?

**Q10**: How to handle case when client sends destination different from default?
- Create separate broker for this destination?
- Or use existing broker with new destination?

### Questions about Testing

**Q11**: How to test new logic?
- Do we need new integration tests?
- How to simulate different scenarios (with destination, without destination, with .env, without .env)?

---

## Action Plan (after receiving answers)

1. ✅ Answer all questions
2. ✅ Update roadmap based on answers
3. ✅ Implement changes in AuthBroker (if needed)
4. ✅ Refactor `mcp_abap_adt_server`:
   - Add `defaultDestination` field
   - Add `initializeDefaultBroker()` method
   - Update `getOrCreateAuthBroker()`
   - Update `applyAuthHeaders()`
   - Update `run()` for stdio/SSE
5. ✅ Test all scenarios
6. ✅ Update documentation

---

## Notes

- All changes must maintain compatibility with current implementation (if possible)
- Logic must be clear and predictable
- Errors must be informative
- Logging must help in problem diagnosis

