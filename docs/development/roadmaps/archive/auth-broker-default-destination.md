# Roadmap: AuthBroker Refactoring for Default Destination Support

## Implementation Status: ✅ Core Features Completed + Security & UX Improvements

**Last Updated**: Implementation completed for core features (Stages 1-5) + Security improvements and YAML enhancements

### What's Done:
- ✅ Default destination support at consumer level
- ✅ Broker initialization on startup for stdio/SSE
- ✅ Automatic connection for stdio mode
- ✅ Support for .env file without service keys
- ✅ Client values priority over default destination
- ✅ Error handling for stdio when no destination/.env
- ✅ `--config` YAML support (for easier testing)
- ✅ **Default transport changed to stdio** (per user request)
- ✅ **Security: Host binding options (127.0.0.1 vs 0.0.0.0)**
- ✅ **YAML template generation with command exit**
- ✅ **YAML validation on load**

### What's Next:
- ⏳ Testing all scenarios
- ⏳ Final documentation review

---

## Current Situation Analysis

### Current Implementation:
1. **Lazy initialization**: AuthBroker is created on first request with destination
2. **Broker key**: `${destination || 'default'}::${clientKey || 'global'}`
3. **Transport modes**:
   - **stdio/SSE**: `clientKey = 'global'` (one broker for entire server)
   - **HTTP/streamable-http**: `clientKey = sessionId` (separate broker per client)
4. **Broker creation**: Always with `serviceKeyStore` + `sessionStore` (even if no service key exists)

### Current Implementation Issues (RESOLVED):
1. ✅ Broker has no concept of "default destination" → **FIXED**: Default destination stored at consumer level
2. ✅ Cannot create broker with only sessionStore (for .env case) → **FIXED**: Broker supports optional serviceKeyStore
3. ✅ When request has no connection parameters - default destination is not used → **FIXED**: `applyAuthHeaders()` uses default destination
4. ✅ In stdio mode - no automatic connection on startup → **FIXED**: `run()` initializes broker and connects automatically

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
- **✅ Answer**: 
  - **stdio**: Error on startup (must have destination or .env)
  - **SSE/HTTP**: Wait for connection parameters in headers. If header has destination → use token from broker, if no destination → use what's available. If token invalid or broker can't return valid token → return error

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

## New Feature: `--config` YAML Support ✅

### Problem
- Too many command-line parameters make testing complex
- Hard to manage different test scenarios with different configurations
- Command-line becomes unwieldy with many options

### Solution ✅
- ✅ Add `--config=<path>` parameter that points to YAML file with configuration values
- ✅ If `--config` is specified but file doesn't exist → generate template YAML file
- ✅ User can fill in startup parameters in the YAML template
- ✅ For tests: create different YAML files with different configurations

### Benefits
- Cleaner command-line interface
- Easy to create test scenarios with different YAML configs
- Template generation helps users understand available options
- Configuration can be version-controlled and shared

### Implementation Status ✅
- ✅ YAML file contains all startup parameters (transport, destination, ports, etc.)
- ✅ Command-line arguments override YAML values (for flexibility)
- ✅ Template includes comments explaining each option
- ✅ Auto-generates template if file doesn't exist
- ✅ **Command exits after template generation** (user can edit before running server)
- ✅ **YAML validation on load** (validates transport, ports, host, etc.)
- ✅ Documentation: `docs/configuration/YAML_CONFIG.md`
- ✅ Implementation: `src/lib/yamlConfig.ts`

---

## New Features: Security & Defaults ✅

### Feature 1: Default Transport Changed to stdio ✅

**Problem**: Users requested default transport to be stdio (for MCP clients like Cline, Cursor, Claude Desktop)

**Solution** ✅:
- Changed default transport from `streamable-http` to `stdio` in `runtimeConfig.ts`
- Updated help text and documentation
- Updated YAML template to use `stdio` as default

**Implementation**:
- `src/lib/runtimeConfig.ts`: Default transport = `stdio`
- `src/index.ts`: Updated help text
- `src/lib/yamlConfig.ts`: Updated template default
- Documentation updated

### Feature 2: Security - Host Binding Options ✅

**Problem**: Need to control whether server accepts connections from localhost only (127.0.0.1) or all interfaces (0.0.0.0) for security

**Solution** ✅:
- Default host changed from `0.0.0.0` to `127.0.0.1` (localhost only, secure)
- When listening on `0.0.0.0` (non-local interface):
  - Client must provide all connection headers
  - Server does NOT use default destination (security measure)
  - Server acts as simple proxy - all responsibility on client
- When listening on `127.0.0.1` (local interface):
  - Can use default destination from auth-broker or .env
  - Safe for local development

**Implementation**:
- `src/index.ts`: 
  - Default host = `127.0.0.1` for HTTP and SSE
  - Added `isListeningOnNonLocalInterface()` method
  - Updated `applyAuthHeaders()` to skip default destination for non-local connections
- `src/lib/yamlConfig.ts`: Updated template defaults
- Documentation updated with security notes

### Feature 3: YAML Template Generation with Exit ✅

**Problem**: After generating YAML template, command continued execution instead of exiting

**Solution** ✅:
- `generateConfigTemplateIfNeeded()` now returns boolean (true if template was generated)
- If template was generated, command exits with code 0
- User can edit the file before running the server

**Implementation**:
- `src/lib/yamlConfig.ts`: Function returns boolean
- `src/index.ts`: Check return value and exit if template was generated

### Feature 4: YAML Validation on Load ✅

**Problem**: Invalid YAML configurations could cause runtime errors

**Solution** ✅:
- Added `validateYamlConfig()` function that validates:
  - Transport type (stdio, http, streamable-http, sse)
  - Port ranges (1-65535)
  - HTTP and SSE ports must be different
  - Allowed-origins format (array or string)
- Validation runs automatically when loading YAML config
- On validation errors: command exits with code 1 and shows error list

**Implementation**:
- `src/lib/yamlConfig.ts`: Added `validateYamlConfig()` function
- `loadYamlConfig()` calls validation before returning config
- Error messages are clear and informative

---

## Implementation Roadmap

### Stage 1: AuthBroker Extension (if needed) ✅

**✅ Question 1.1**: Does AuthBroker support "default destination" concept?
- **Answer**: Default destination exists only at consumer level (mcp_abap_adt_server), not in broker itself
- **Solution**: Store `defaultDestination` in `mcp_abap_adt_server` class
- Default destination is any destination that consumer uses when request has no connection headers/parameters or when transport is stdio

**✅ Question 1.2**: Can AuthBroker work without serviceKeyStore?
- **Answer**: Yes, broker can be created with only sessionStore (without serviceKeyStore)
- **Solution**: When destination is not specified but .env file exists, create broker with only sessionStore
- SessionStore will have default destination and will be used for connection

**✅ Question 1.3**: How does sessionStore load configuration from .env file?
- **Answer**: When creating broker, sessionStore is injected:
  - `FileSessionStore` - points to .env file path (used with `--unsafe` flag)
  - Or create session from .env and store in `SafeSessionStore` (default behavior)
- **Solution**: In mcp-abap-adt, use `--unsafe` parameter to choose FileSessionStore, otherwise use SafeSessionStore
- .env has simple format (standard environment variables)

**Status**: All questions answered. No changes needed in AuthBroker API - it already supports required functionality.

### Stage 2: Broker Initialization Refactoring ✅

#### 2.1. Create `initializeDefaultBroker()` method ✅
```typescript
private async initializeDefaultBroker(): Promise<void> {
  // Logic to determine: destination in parameters or .env
  // Create broker with correct stores
  // Set default destination
}
```
**Status**: ✅ Implemented in `src/index.ts` (lines 1427-1466)

#### 2.2. Call on server startup ✅
- ✅ stdio: call in `run()` before connecting transport
- ✅ SSE: call in `run()` before creating SSE server
- ✅ HTTP: do not call (lazy initialization on first request)

### Stage 3: Refactor `getOrCreateAuthBroker()` ✅

#### 3.1. Support default destination ✅
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
**Status**: ✅ Implemented in `src/index.ts` (lines 1472-1557)

#### 3.2. Create broker with only sessionStore ✅
```typescript
// If no service key, but .env exists
if (!hasServiceKey && hasEnvFile) {
  const sessionStore = createSessionStoreFromEnv();
  // Create broker without serviceKeyStore
}
```
**Status**: ✅ Implemented - AuthBroker supports optional serviceKeyStore, broker created with sessionStore when .env exists

### Stage 4: Refactor `applyAuthHeaders()` ✅

#### 4.1. Use default destination ✅
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
**Status**: ✅ Implemented in `src/index.ts` (lines 1559-1650) - Uses default destination when no headers, client values have priority

### Stage 5: Automatic Connection for stdio ✅

#### 5.1. Connect on startup ✅
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
**Status**: ✅ Implemented in `src/index.ts` (lines 2861-2908):
- ✅ Error handling when no destination/.env exists
- ✅ Initialize default broker
- ✅ Automatic connection to ABAP with default destination
- ✅ SSE also updated (lines 3301-3331)

---

## Questions for Clarification

### Questions about AuthBroker API

**✅ Q1**: Does `AuthBroker` support "default destination" concept?
- **Answer**: Default destination exists only at consumer level (mcp_abap_adt_server), not in broker itself
- **Solution**: Store `defaultDestination` in `mcp_abap_adt_server` class
- Default destination is any destination that consumer uses when request has no connection headers/parameters or when transport is stdio

**✅ Q2**: Can `AuthBroker` work without `serviceKeyStore`?
- **Answer**: Yes, broker can be created with only sessionStore (without serviceKeyStore)
- **Solution**: When destination is not specified but .env file exists, create broker with only sessionStore
- SessionStore will have default destination and will be used for connection

**✅ Q3**: How does `sessionStore` load configuration from .env file?
- **Answer**: When creating broker, sessionStore is injected:
  - `FileSessionStore` - points to .env file path (used with `--unsafe` flag)
  - Or create session from .env and store in `SafeSessionStore` (default behavior)
- **Solution**: In mcp-abap-adt, use `--unsafe` parameter to choose FileSessionStore, otherwise use SafeSessionStore
- .env has simple format (standard environment variables)

**✅ Q4**: Can `AuthBroker.getConnectionConfig(destination)` work without service key?
- **Answer**: Yes, it can work without service key
- When refreshing token, UAA will be taken from session
- If it fails → return error
- This logic should already be in broker

### Questions about Workflow Logic

**✅ Q5**: What to do if neither destination nor .env file exists at startup?
- **Answer**:
  - **stdio**: Error on startup (must have destination or specified .env or .env in current folder)
  - **SSE/HTTP**: Wait for connection parameters in headers:
    - If header has destination → use token from broker for that destination
    - If no destination in header → use what's available (no token or invalid token → return error)
    - If broker can't return valid authorization token for destination → return error on request

**Q6**: How to handle situation when .env file appears after server startup?
- **Analysis**: Based on Q5 answer, for SSE/HTTP we wait for headers on each request
- **Conclusion**: Ignore .env changes after startup (only load on startup)
- **Reasoning**: Configuration is loaded once at startup, runtime changes would require complex reloading logic

**✅ Q7**: For HTTP mode: if client sends request without destination, but default destination exists:
- **Answer**: Default destination is the destination to use when client doesn't specify which one they need
- **Behavior**: When client sends request without destination header, but server has default destination (from `--mcp` or .env):
  - Use default destination automatically
  - Create broker for this client with default destination
  - Each client has its own broker (`clientKey = sessionId`), but uses default destination if not specified in headers

**✅ Q8**: Can we have multiple default destinations for different clients (HTTP)?
- **Answer**: Each client/session has its own broker
- **SSE**: One session = one broker (global broker for the session)
- **HTTP**: Each session has its own broker (separate broker per client session)
- **Default destination**: One global default destination determined at server startup (from `--mcp` parameter or .env file)
- **Behavior**: All clients without destination in headers will use the same global default destination, but each gets their own broker instance
- **Note**: If client specifies different destination in headers, that destination will be used instead of default

### Questions about Compatibility

**✅ Q9**: How to maintain compatibility with current implementation?
- **Answer**: Will think about compatibility after version 1.0.0
- **Status**: Deferred until post-1.0.0
- **Note**: For now, focus on implementing the feature, compatibility concerns will be addressed later

**✅ Q10**: How to handle case when client sends destination different from default?
- **Answer**: Client values have priority - if client specified connection parameters in headers, they know what they're doing
- **Implementation**: Each destination gets its own broker instance (broker key: `${destination}::${clientKey}`)
- **Behavior**: If client sends destination in header → create/use broker for that destination, not default one
- **Priority**: Client-provided headers/parameters take precedence over default destination

### Questions about Testing

**✅ Q11**: How to test new logic?
- **Answer**: Test through inspector by running in different modes with different destination options
- **Testing approach**: Use inspector to test various scenarios
- **New feature for testing**: Add `--config` parameter that points to YAML file with configuration values
  - If `--config` is specified but file doesn't exist → generate template YAML file
  - User can fill in startup parameters in the YAML template
  - For tests: create different YAML files with different configurations
  - This avoids drowning in command-line parameters
- **Scenarios to test**:
  - stdio with `--mcp=<destination>`
  - stdio with .env file
  - stdio without destination/.env (should error)
  - SSE/HTTP with default destination, client sends request without headers
  - SSE/HTTP with default destination, client sends request with different destination
  - SSE/HTTP without default, client sends request with destination in headers
  - SSE/HTTP without default, client sends request without headers (should error)
  - Different YAML config files for different test scenarios

---

## Action Plan

### ✅ Completed
1. ✅ **Answer all questions Q1-Q11** - All answered:
   - Q1: Default destination at consumer level ✅
   - Q2: Broker can work with only sessionStore ✅
   - Q3: SessionStore loads from .env via FileSessionStore/SafeSessionStore ✅
   - Q4: getConnectionConfig works without service key ✅
   - Q5: stdio requires destination/.env (error), SSE/HTTP wait for headers ✅
   - Q6: Ignore .env changes after startup ✅
   - Q7: Use default destination when client doesn't specify ✅
   - Q8: Each client/session has its own broker (SSE: one, HTTP: per session) ✅
   - Q9: Compatibility deferred until post-1.0.0 ✅
   - Q10: Client values have priority over default ✅
   - Q11: Test via inspector with different configs, add --config YAML support ✅
2. ✅ **Update roadmap based on answers** - Roadmap updated with all answers
3. ✅ **Implement changes in AuthBroker (if needed)**
   - Status: No changes needed - AuthBroker already supports required functionality ✅
4. ✅ **Refactor `mcp_abap_adt_server`** - All changes implemented:
   - ✅ Add `defaultDestination` field
   - ✅ Add `initializeDefaultBroker()` method
   - ✅ Update `getOrCreateAuthBroker()` to support default destination
   - ✅ Update `applyAuthHeaders()` to use default when no headers (client values have priority)
   - ✅ Update `run()` for stdio to initialize default broker and connect automatically
   - ✅ Update `run()` for SSE to initialize default broker if destination/.env exists
   - ✅ Handle .env file case: create broker with only sessionStore (without serviceKeyStore)
   - ✅ Add error handling for stdio mode when no destination/.env exists

### 📋 Next Steps
5. ✅ **Implement `--config` YAML support** (new feature for testing) - COMPLETED:
   - ✅ Add `--config=<path>` parameter that points to YAML file with configuration values
   - ✅ If `--config` specified but file doesn't exist → generate template YAML file
   - ✅ User can fill in startup parameters in the YAML template
   - ✅ For tests: create different YAML files with different configurations
   - ✅ This avoids drowning in command-line parameters
   - ✅ Command-line arguments override YAML values
   - ✅ **Command exits after template generation** (user can edit before running)
   - ✅ **YAML validation on load** (validates all parameters)
   - ✅ Documentation created: `docs/configuration/YAML_CONFIG.md`
6. ✅ **Security & Defaults Improvements** - COMPLETED:
   - ✅ Changed default transport to stdio (per user request)
   - ✅ Changed default host to 127.0.0.1 (localhost only, secure)
   - ✅ Added security logic: non-local connections (0.0.0.0) don't use default destination
   - ✅ Updated all documentation with security notes
7. ⏳ **Test all scenarios** (see Q11 for test scenarios, use --config YAML files):
   - stdio with `--mcp=<destination>`
   - stdio with .env file
   - stdio without destination/.env (should error)
   - SSE/HTTP with default destination, client sends request without headers
   - SSE/HTTP with default destination, client sends request with different destination
   - SSE/HTTP without default, client sends request with destination in headers
   - SSE/HTTP without default, client sends request without headers (should error)
7. ⏳ **Update documentation**

---

## Notes

- All changes must maintain compatibility with current implementation (if possible)
- Logic must be clear and predictable
- Errors must be informative
- Logging must help in problem diagnosis

