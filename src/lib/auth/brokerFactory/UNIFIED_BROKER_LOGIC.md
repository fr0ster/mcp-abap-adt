# Unified AuthBroker Creation Logic

## Principles

1. **One broker per destination**: brokers are stored in a map keyed by `destination` (or `'default'` for the default broker).
2. **Default broker**: a special broker with key `'default'` used when destination is not provided in headers.
3. **Token retrieval happens only in MCP handlers**: the broker is not invoked by transport/server before a tool executes. The MCP server passes destination/broker to handlers; token is fetched only when a tool runs.

## Default Broker Creation (by transport)

### Streamable HTTP
- Start without a mandatory default broker.
- If `--mcp=destination` → create broker with key `'default'` (or destination), with serviceKeyStore + sessionStore (safe/file depending on `--unsafe`), tokenProvider = `AuthorizationCodeProvider`.
- If `--env=path/to/.env` → create `'default'` broker without serviceKeyStore, sessionStore from the same directory, tokenProvider = `AuthorizationCodeProvider`.
- If none of the above, no default broker is created; connection is possible only via headers or destination in request (broker can be created on demand).

### SSE
- Same as HTTP, but a default broker is useful for local scenarios:
  - `--mcp=destination` → `'default'` broker with serviceKeyStore + sessionStore.
  - `.env` in current directory without `--auth-broker` → `'default'` broker without serviceKeyStore, sessionStore from current directory.
  - `--env=path/to/.env` → `'default'` broker without serviceKeyStore, sessionStore from .env directory.
  - If none of the above, no default broker is created; connection works only if the client provides destination/headers and the broker is created on demand.

### stdio
- Requires a default broker at startup, otherwise error.
- Variants:
  - `--mcp=destination` → `'default'` broker with serviceKeyStore + sessionStore.
  - `.env` in current directory without `--auth-broker` → `'default'` broker without serviceKeyStore, sessionStore from current directory.
  - `--env=path/to/.env` → `'default'` broker without serviceKeyStore, sessionStore from .env directory.
- Other cases: no broker → server does not start (stdio without default source is not allowed).

## Broker Usage (by transport)

### Streamable HTTP
- **Map key**: `destination` (+ stable client identifier if isolation needed; options: `sessionId` or `clientId:port`).
- **Behavior**:
  1. In PUT/POST handler (before MCP server creation), read destination from headers.
  2. If destination is present: get broker from map, create if missing; if creation fails return error.
  3. If destination is absent: use default broker; if missing, read direct headers; if also missing, return error.
  4. Create MCP server instance, pass destination/broker (or direct header params) to handlers. **Token is fetched only in the handler before tool execution.**

### SSE
- **Map key**: same as Streamable HTTP.
- **Behavior**:
  1. In GET handler (before MCP server creation for a session), read destination from headers.
  2. If destination is present: get/create broker; if fail, return error.
  3. If destination is absent: try default broker; if missing, read direct headers; if missing, return error.
  4. Create MCP server for the session, pass destination/broker (or direct header params). **Token is fetched only in the handler.**

### stdio
- **Map key**: single broker at startup (`default` or destination from `--mcp`).
- **Behavior**:
  1. At startup create broker from `--mcp` / config / ENV. If none, error and do not start.
  2. Create MCP server once.
  3. Handlers receive destination/broker and fetch token only during tool execution.

## Broker Map Structure

```typescript
Map<string, AuthBroker> {
  'default' => AuthBroker {
    serviceKeyStore?: IServiceKeyStore,
    sessionStore: ISessionStore,
    tokenProvider: AuthorizationCodeProvider
  },
  'trial' => AuthBroker {
    serviceKeyStore: IServiceKeyStore,
    sessionStore: ISessionStore,
    tokenProvider: AuthorizationCodeProvider
  },
  'production' => AuthBroker {
    serviceKeyStore: IServiceKeyStore,
    sessionStore: ISessionStore,
    tokenProvider: AuthorizationCodeProvider
  }
}
```

## Shared Stores

- **ServiceKeyStore**: separate per destination (each destination has its own service key file).
- **SessionStore**: shared for all destinations with the same directory and type.
  - Shared store key: `${storeType}::${sessionsDir}::${unsafe}`
  - Each destination has its own session file in the directory: `{destination}.env`

## Algorithm

### Initialization (at server startup):

```
1. Check CLI parameters:
   - If --mcp=destination → create default broker with serviceKeyStore for destination
   - If --env=path → create default broker with sessionStore from path (no serviceKeyStore)
   - If stdio/sse + .env in current folder + NOT --auth-broker → create default broker with sessionStore (no serviceKeyStore)

2. For stdio:
   - If default broker is NOT created → error, do not start
   - If default broker is created → use it for connections

3. For SSE/HTTP:
   - Server starts regardless
   - Default broker is used only when destination is not provided in headers
```

### Request handling (SSE/HTTP):

```
1. Read destination from headers (x-mcp-destination or X-MCP-Destination).
2. If destination is provided:
   a. Get broker from map (destination [+ clientId/sessionId], if used).
   b. If missing, create and store; if creation fails, return error.
3. If destination is NOT provided:
   a. Try default broker.
   b. If no default broker, read direct headers; if missing, return error.
4. Create MCP server for the request/session, pass destination/broker to handlers.
5. Handler calls broker.getToken(destination) before tool execution to create connection.
```

## Examples

### Example 1: stdio with --mcp=trial
```bash
npm run dev -- --mcp=trial
```
- Creates default broker with serviceKeyStore for 'trial'
- Connects via default broker

### Example 2: stdio with --env=./.env.local
```bash
npm run dev -- --env=./.env.local
```
- Creates default broker with sessionStore from ./.env.local (no serviceKeyStore)
- Connects via default broker

### Example 3: HTTP with --mcp=trial, client does NOT pass destination
```bash
npm run dev:http -- --mcp=trial
```
- Creates default broker with serviceKeyStore for 'trial'
- Uses default broker

### Example 4: HTTP with --mcp=trial, client passes destination=production
```bash
npm run dev:http -- --mcp=trial
```
- Creates default broker for 'trial'
- Creates separate broker for 'production'
- Uses broker for 'production'

### Example 5: HTTP without --mcp and without .env, client provides all headers
```bash
npm run dev:http
```
- No default broker
- Connection works only via headers (no broker)

### Example 6: stdio without parameters and without .env
- No default broker → server does not start
