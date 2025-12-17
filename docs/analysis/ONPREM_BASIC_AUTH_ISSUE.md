# Issue: JWT token has expired for on-premise systems with --mcp parameter

## Problem

When connecting to an on-premise system using `--mcp=e19 --unsafe`, the request to ABAP returns an error "JWT token has expired". For on-premise systems, only password and login are needed without service keys, but the system attempts to use a JWT token.

## Code Analysis

### 1. Creating AuthBroker with --mcp parameter

When using `--mcp=e19 --unsafe`:
- `AuthBroker` is created with `sessionStore` and `serviceKeyStore` (lines 1097-1212 in `src/index.ts`)
- `sessionStore` loads data from `.env` files for destination `e19`

### 2. Processing MCP destination in applyAuthHeaders()

In `applyAuthHeaders()` for `AuthMethodPriority.MCP_DESTINATION` (lines 1309-1372):
```typescript
// Get token from AuthBroker
const jwtToken = await authBroker.getToken(config.destination);
```

**Problem**: The code always attempts to get a JWT token, even for on-premise systems that use basic auth.

### 3. Session Store does not support basic auth

`AbapSessionStore.getConnectionConfig()` (lines 274-293):
```typescript
if (!sessionConfig.jwtToken || !sessionConfig.sapUrl) {
  this.log?.warn(`Connection config for ${destination} missing required fields: jwtToken(${!!sessionConfig.jwtToken}), sapUrl(${!!sessionConfig.sapUrl})`);
  return null;
}
```

**Problem**: Session store expects a JWT token and returns `null` if it's not present. For on-premise systems, a JWT token is not needed.

### 4. envLoader does not load username/password

`envLoader.ts` (lines 31-98):
- Only loads JWT tokens and UAA configuration
- Does not load `SAP_USERNAME` and `SAP_PASSWORD` for basic auth

### 5. Header Validator assumes MCP destination always uses JWT

`headerValidator.ts` (line 172):
```typescript
authType: AUTH_TYPE_JWT, // MCP destination always uses JWT
```

**Problem**: The validator assumes that `x-mcp-destination` always uses JWT, but on-premise systems require basic auth.

## Solution (Updated)

### New store creation logic

According to requirements:
1. **Normal situation (with AuthBroker)**: When protocol is stdio and:
   - `--mcp` is NOT specified
   - OR `--env` is specified
   - OR neither `--mcp` nor `--env` is specified, but `.env` is found in current folder
   → Create serviceKeyStore, sessionStore, and tokenProvider for injection into broker

2. **Special situation (only serviceKeyStore)**: When `--mcp` is specified (for on-premise)
   → Create only serviceKeyStore (without sessionStore and tokenProvider)
   → Data is loaded from destination in `--mcp` or from file via `--env` or from `.env` in current folder

### Option 1: Add basic auth support in session store

1. **Extend `EnvConfig` interface** in `envLoader.ts`:
   - Add `username?: string`
   - Add `password?: string`
   - Add `authType?: 'basic' | 'jwt'`

2. **Update `loadEnvFile()`** to load username/password:
   ```typescript
   if (parsed['SAP_USERNAME']) {
     config.username = parsed['SAP_USERNAME'].trim();
   }
   if (parsed['SAP_PASSWORD']) {
     config.password = parsed['SAP_PASSWORD'].trim();
   }
   // Determine authType: if username/password exists and no jwtToken, then basic
   if (config.username && config.password && !config.jwtToken) {
     config.authType = 'basic';
   } else if (config.jwtToken) {
     config.authType = 'jwt';
   }
   ```

3. **Update `AbapSessionStore.getConnectionConfig()`** to support basic auth:
   ```typescript
   async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
     const sessionConfig = await this.loadRawSession(destination);
     if (!sessionConfig) {
       return null;
     }

     // For basic auth: check username/password
     if (sessionConfig.authType === 'basic' || (!sessionConfig.jwtToken && sessionConfig.username && sessionConfig.password)) {
       return {
         serviceUrl: sessionConfig.sapUrl,
         username: sessionConfig.username,
         password: sessionConfig.password,
         sapClient: sessionConfig.sapClient,
         language: sessionConfig.language,
         authType: 'basic',
       };
     }

     // For JWT auth: check jwtToken
     if (!sessionConfig.jwtToken || !sessionConfig.sapUrl) {
       return null;
     }
     return {
       serviceUrl: sessionConfig.sapUrl,
       authorizationToken: sessionConfig.jwtToken,
       sapClient: sessionConfig.sapClient,
       language: sessionConfig.language,
       authType: 'jwt',
     };
   }
   ```

4. **Update `applyAuthHeaders()`** to support basic auth with MCP destination:
   ```typescript
   case AuthMethodPriority.MCP_DESTINATION: {
     // ...
     const connConfig = await authBroker.getConnectionConfig(config.destination);
     if (!connConfig || !connConfig.serviceUrl) {
       return;
     }
     const sapUrl = connConfig.serviceUrl;

     // Check authType from connection config
     if (connConfig.authType === 'basic' || (connConfig.username && connConfig.password)) {
       // Basic auth for on-premise
       this.processBasicAuthConfigUpdate(
         sapUrl,
         connConfig.username!,
         connConfig.password!,
         sessionId
       );
     } else {
       // JWT auth for cloud
       const jwtToken = await authBroker.getToken(config.destination);
       this.processJwtConfigUpdate(sapUrl, jwtToken, undefined, config.destination, sessionId);
     }
     return;
   }
   ```

5. **Update `IConnectionConfig` interface** to support basic auth:
   ```typescript
   export interface IConnectionConfig {
     serviceUrl: string;
     authorizationToken?: string; // For JWT
     username?: string; // For basic auth
     password?: string; // For basic auth
     authType?: 'basic' | 'jwt'; // Authentication type
     sapClient?: string;
     language?: string;
   }
   ```

### Option 2: Use .env file directly for on-premise

If `--mcp` points to an on-premise system, configuration can be loaded directly from the `.env` file without using AuthBroker for JWT tokens.

## Current Issue Analysis (Continued)

### Problem persists during request

Even after implementing the above changes, the issue persists because:

1. **`applyAuthHeaders()` always calls `getToken()`**: In the current implementation (lines 1309-1379 in `src/index.ts`), the code always calls `authBroker.getToken(config.destination)` on line 1356 without checking if basic auth is needed:

```typescript
// Line 1336: Get connection config (may contain basic auth info)
const connConfig = await authBroker.getConnectionConfig(config.destination);
// ...
// Line 1356: ALWAYS calls getToken() - PROBLEM!
const jwtToken = await authBroker.getToken(config.destination);
// Line 1362: Always uses JWT
this.processJwtConfigUpdate(sapUrl, jwtToken, undefined, config.destination, sessionId);
```

**Root cause**: The code assumes MCP destination always uses JWT, but `connConfig` may already contain `username` and `password` for basic auth.

2. **`getToken()` fails for basic auth destinations**: The `getToken()` method in AuthBroker throws an error or returns null for on-premise systems that don't have JWT tokens, causing the request to fail.

3. **Header validator hardcodes JWT**: The validator sets `authType: AUTH_TYPE_JWT` for MCP destinations (line 172 in `headerValidator.ts`), which prevents basic auth from being detected at validation stage.

4. **Missing check before `getToken()` call**: The code should check `connConfig.authType` or presence of `username/password` before calling `getToken()`.

### Exact fix needed

The fix must be applied in `applyAuthHeaders()` method, case `AuthMethodPriority.MCP_DESTINATION`:

**Current code (lines 1336-1362)**:
```typescript
const connConfig = await authBroker.getConnectionConfig(config.destination);
if (!connConfig || !connConfig.serviceUrl) {
  return;
}
const sapUrl = connConfig.serviceUrl;

// PROBLEM: Always calls getToken() without checking auth type
const jwtToken = await authBroker.getToken(config.destination);
this.processJwtConfigUpdate(sapUrl, jwtToken, undefined, config.destination, sessionId);
```

**Fixed code**:
```typescript
const connConfig = await authBroker.getConnectionConfig(config.destination);
if (!connConfig || !connConfig.serviceUrl) {
  return;
}
const sapUrl = connConfig.serviceUrl;

// Check authType from connection config BEFORE calling getToken()
if (connConfig.authType === 'basic' || (connConfig.username && connConfig.password)) {
  // Basic auth for on-premise
  this.processBasicAuthConfigUpdate(
    sapUrl,
    connConfig.username!,
    connConfig.password!,
    sessionId
  );
  
  logger?.info("Updated SAP configuration using MCP destination (Basic Auth)", {
    type: "SAP_CONFIG_UPDATED_MCP_DESTINATION_BASIC",
    destination: config.destination,
    url: sapUrl,
    sessionId: sessionId?.substring(0, 8),
  });
} else {
  // JWT auth for cloud
  const jwtToken = await authBroker.getToken(config.destination);
  
  // Register AuthBroker in global registry for connection to use during token refresh
  const { registerAuthBroker } = require('./lib/utils');
  registerAuthBroker(config.destination, authBroker);
  
  this.processJwtConfigUpdate(sapUrl, jwtToken, undefined, config.destination, sessionId);
  
  logger?.info("Updated SAP configuration using MCP destination (JWT Auth)", {
    type: "SAP_CONFIG_UPDATED_MCP_DESTINATION_JWT",
    destination: config.destination,
    url: sapUrl,
    sessionId: sessionId?.substring(0, 8),
  });
}
```

## Recommendations

1. **Add basic auth support in session store** (Option 1) - this will allow using `--mcp` for on-premise systems
2. **Update header validator** to support basic auth with MCP destination
3. **Update `applyAuthHeaders()`** to check `getConnectionConfig()` first and determine auth type before calling `getToken()`
4. **Add tests** to verify basic auth with `--mcp` parameter
5. **Update documentation** about basic auth support with `--mcp` parameter

## Files to modify

1. `mcp-abap-adt-auth-stores/src/storage/abap/envLoader.ts` - add loading of username/password
2. `mcp-abap-adt-auth-stores/src/stores/abap/AbapSessionStore.ts` - add basic auth support in getConnectionConfig
3. `mcp-abap-adt/src/index.ts` - update applyAuthHeaders() to support basic auth with MCP destination
4. `mcp-abap-adt-header-validator/src/headerValidator.ts` - update validation to support basic auth with MCP destination
5. `mcp-abap-adt-interfaces/src/session/ISessionStore.ts` - update IConnectionConfig interface
