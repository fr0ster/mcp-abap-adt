# MCP Server Architecture v2

## Overview

Simple architecture based on `@modelcontextprotocol/sdk` `McpServer` class. Each transport type has its own server class that injects handlers and provides hooks for connection setup.

## Core Architecture

### Base Server Class

Base class that extends `McpServer` from SDK and provides context for handlers:

```typescript
abstract class BaseMcpServer extends McpServer {
  protected connectionContext: ConnectionContext | null = null;

  constructor(options: { name: string; version: string }) {
    super(options);
  }

  /**
   * Sets the connection context of a destination.
   * For stdio: called once on startup
   * For SSE/HTTP: called per session or request
   *
   * No token is read and no authentication type is branched on: the context
   * holds the destination's settings and its credential (an IAuthProvider),
   * and the credential renews itself.
   */
  protected async setConnectionContext(
    destination: string,
    destinations: IDestinations // settingsFor(destination), getProvider(destination)
  ): Promise<void> {
    const settings = await destinations.settingsFor(destination);
    const credential = await destinations.getProvider(destination);

    this.connectionContext = {
      sessionId: destination,
      connectionParams: settings, // URL, client, auth type, connection type -- no secret
      credential,                 // what the connector presents
    };
  }

  /**
   * Gets current connection context
   * Handlers can access this via `this.connectionContext` in their class
   */
  protected getConnectionContext(): ConnectionContext | null {
    return this.connectionContext;
  }
  
  /**
   * Gets ABAP connection from connection context:
   * a connector built from the context's settings and credential, then connected
   */
  protected async getConnection(): Promise<AbapConnection> {
    if (!this.connectionContext?.connectionParams) {
      throw new Error('Connection context not set');
    }

    const connection = createAbapConnection(
      this.connectionContext.connectionParams,
      this.connectionContext.credential
    );
    await connection.connect();
    return connection;
  }

  /**
   * Registers handlers from registry
   * Wraps handlers to inject connection as first parameter
   * Handlers signature: (connection: AbapConnection, args: any) => Promise<any>
   * Registered as: (args: any) => handler(getConnection(), args)
   */
  protected registerHandlers(handlersRegistry: IHandlersRegistry): void {
    // Get handler groups from registry
    if (handlersRegistry instanceof CompositeHandlersRegistry) {
      const groups = handlersRegistry.getHandlerGroups();
      
      for (const group of groups) {
        const handlers = group.getHandlers();
        for (const entry of handlers) {
          // Wrap handler to inject connection from context
          // Original handler: (connection: AbapConnection, args: any) => Promise<any>
          // Wrapped handler: (args: any) => handler(getConnection(), args)
          const wrappedHandler = async (args: any) => {
            // Get connection from context (this.connectionContext)
            const connection = await this.getConnection();
            
            // Call original handler with connection as first parameter
            return await entry.handler(connection, args);
          };
          
          // Register wrapped handler
          this.registerTool(
            entry.toolDefinition.name,
            entry.toolDefinition,
            wrappedHandler
          );
        }
      }
    } else {
      // Fallback: use registerAllTools directly (handlers won't have connection injected)
      handlersRegistry.registerAllTools(this);
    }
  }
}

interface ConnectionContext {
  // The connector's settings: URL, client, authentication type, connection type.
  // They hold no secret.
  connectionParams: SapConfig;

  // The credential the connector presents: a destination's provider
  // (IDestinations.getProvider) or the one the request headers carry
  credential: IAuthProvider;

  // Session information
  sessionId: string;

  // Additional metadata
  metadata?: Record<string, any>;
}
```

### Configuration

Server can be configured via:
1. **CLI arguments**: `--mcp=destination --conf=path/to/config.yaml`
2. **YAML config file**: configuration only (transport, destination name, ports); a secret-looking key is refused
3. **Environment and `.env` files**: secrets and the session

```yaml
# config.yaml
transport: stdio
mcp: trial
browser-auth-port: 61001
```

A destination -- `service-keys/trial.json` and `sessions/trial.env` -- is read field by field, once per process.

### Destinations Setup

The destinations are an `AuthBrokerFactory` (`@mcp-abap-adt/lib/auth`), built once. It builds one `AuthBroker` per destination on first use; the stores come from the destination's mode (an env file, or a named destination) and the browser login strategy is passed in -- the library has no default:

```typescript
import { AuthBrokerFactory } from '@mcp-abap-adt/lib/auth';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';

const destinations = new AuthBrokerFactory({
  mcpDestination: 'trial',   // or envFile: { path, source } for one .env file
  unsafe: false,             // true: write named sessions to disk
  browser: 'system',
  browserAuthPort: 61001,
  browserStrategy: browserCallbackStrategy,
});

const settings = await destinations.settingsFor('trial');
const credential = await destinations.getProvider('trial');
```

The four supported authentications -- basic, SNC, `jwt` / `authorization_code`, `jwt` / `none` -- are the handlers in `server/src/auth/handlers/` (`@mcp-abap-adt/core`).

## Server Classes

### StdioServer

**Pattern**: Single global server instance, one transport, connection setup on startup

```typescript
class StdioServer extends BaseMcpServer {
  constructor(
    private handlersRegistry: IHandlersRegistry,
    private destinations: IDestinations
  ) {
    super({
      name: "mcp-abap-adt",
      version: "1.0.0",
    });
  }
  
  async start(destination: string): Promise<void> {
    // 1. Set connection context from the destination's settings and credential
    // Context is available in handlers via this.connectionContext
    await this.setConnectionContext(destination, this.destinations);
    
    // 2. Register handlers from registry
    // Handlers will have access to this.connectionContext
    this.registerHandlers(this.handlersRegistry);
    
    // 3. Create transport
    const transport = new StdioServerTransport();
    
    // 4. Connect transport to server
    await this.server.connect(transport);
  }
}
```

**Usage**:
```typescript
// From CLI: --mcp=trial
// Or from YAML config
const destination = args.mcp || config.defaultDestination;

// Destinations: an AuthBrokerFactory (see "Destinations Setup")
// Create and start server
const server = new StdioServer(handlersRegistry, destinations);
await server.start(destination);
```

**Flow**:
- Create `StdioServer` instance (extends `BaseMcpServer` which extends `McpServer`)
- Inject `IHandlersRegistry` and `IDestinations`
- Call `start(destination)` where destination comes from CLI (`--mcp=...`) or YAML config
- `setConnectionContext()` takes the destination's settings and credential (`settingsFor`, `getProvider`)
- Context is available as `this.connectionContext` in handlers
- Register handlers from `IHandlersRegistry` via `registerHandlers()`
- Create `StdioServerTransport` and connect
- SDK handles all requests automatically

**Sequence Diagram**:

```mermaid
sequenceDiagram
    participant Client
    participant STDIO as StdioServerTransport
    participant SDK as McpServer SDK
    participant Hook as IRequestHook
    participant Handler as Tool Handler
    
    Note over Client,Handler: Server Startup
    SDK->>SDK: new StdioServer() extends BaseMcpServer
    SDK->>SDK: setConnectionContext(context)
    SDK->>SDK: registerHandlers() - handlers have access to this.connectionContext
    SDK->>STDIO: new StdioServerTransport()
    SDK->>STDIO: server.server.connect(transport)
    
    Note over Client,Handler: Request Processing
    Client->>STDIO: JSON-RPC request (stdin)
    STDIO->>SDK: Parse & route message
    SDK->>Handler: Call handler (this.connectionContext available)
    Handler->>Handler: Use this.connectionContext
    Handler-->>SDK: Return result
    SDK->>STDIO: JSON-RPC response
    STDIO->>Client: Response (stdout)
```

### SseServer

**Pattern**: HTTP server with GET endpoint for SSE stream, POST endpoint for messages, per-request server instance

```typescript
class SseServer {
  private transports: { [sessionId: string]: SSEServerTransport } = {};
  
  constructor(
    private handlersRegistry: IHandlersRegistry,
    private port: number = 8084
  ) {}
  
  async start(): Promise<void> {
    const app = express();
    
    // GET /sse - create SSE connection
    app.get("/sse", async (req, res) => {
      // Create new server instance for this session (extends BaseMcpServer)
      const server = new (class extends BaseMcpServer {
        constructor() {
          super({ name: "mcp-abap-adt-sse", version: "1.0.0" });
        }
      })();
      
      // Register handlers from registry
      server.registerHandlers(this.handlersRegistry);
      
      // Create SSE transport
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      
      // Store transport in map
      this.transports[sessionId] = transport;
      
      // Connect transport to server
      await server.server.connect(transport);
      
      // Cleanup on close
      res.on("close", () => {
        delete this.transports[sessionId];
        server.server.close();
      });
    });
    
    // POST /messages - handle client messages
    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = this.transports[sessionId];
      
      if (!transport) {
        res.status(400).json({ error: "Invalid sessionId" });
        return;
      }
      
      // Setup connection context from request
      // Note: We need to get server instance - this requires storing server in map too
      // For now, simplified: context is set per-request before handlePostMessage
      const connectionContext = await this.buildConnectionContext(sessionId, req);
      
      // Set context on server instance (if we stored it)
      // Then handle message through transport
      await transport.handlePostMessage(req, res, req.body);
    });
    
    app.listen(this.port);
  }
  
  private async buildConnectionContext(sessionId: string, req: any): Promise<ConnectionContext> {
    // Build connection context from request
    // This will be used to set context on server instance
    return {
      sessionId,
      connectionParams: {
        // Extract from req.headers or req.body
      },
    };
  }
}
```

**Flow**:
- Start HTTP server
- **GET /sse**: For each request, create new server instance (extends `BaseMcpServer`), register handlers, create `SSEServerTransport`, store in map, connect
- **POST /messages**: Look up transport by `sessionId`, build connection context from request, set on server instance, call `transport.handlePostMessage()`
- Connection context is available in handlers via `this.connectionContext`

**Sequence Diagram**:

```mermaid
sequenceDiagram
    participant Client
    participant HTTP as HTTP Server
    participant Map as Transport Map
    participant SSE as SSEServerTransport
    participant SDK as McpServer SDK
    participant Hook as IRequestHook
    participant Handler as Tool Handler
    
    Note over Client,Handler: GET /sse - Establish SSE Connection
    Client->>HTTP: GET /sse
    HTTP->>SDK: new McpServer()
    HTTP->>SDK: registerTool() with wrapped handler
    HTTP->>SSE: new SSEServerTransport("/messages", res)
    SSE->>SSE: Generate sessionId
    HTTP->>Map: Store transport[sessionId]
    HTTP->>SSE: server.server.connect(transport)
    SSE->>Client: SSE stream established
    
    Note over Client,Handler: POST /messages - Handle Client Message
    Client->>HTTP: POST /messages?sessionId=xxx
    HTTP->>Map: Lookup transport[sessionId]
    Map->>HTTP: Return transport
    HTTP->>HTTP: buildConnectionContext(sessionId, req)
    HTTP->>Server: setConnectionContext(context)
    HTTP->>SSE: handlePostMessage(req, res, body)
    SSE->>SDK: Parse & route message
    SDK->>Handler: Call handler (this.connectionContext available)
    Handler->>Handler: Use this.connectionContext
    Handler-->>SDK: Return result
    SDK->>SSE: JSON-RPC response
    SSE->>Client: Response via SSE stream
```

### StreamableHttpServer

**Pattern**: HTTP server with POST endpoint, per-request transport, single server instance

```typescript
class StreamableHttpServer extends BaseMcpServer {
  constructor(
    private handlersRegistry: IHandlersRegistry,
    private destinations: IDestinations,
    private port: number = 8083
  ) {
    super({
      name: "mcp-abap-adt",
      version: "1.0.0",
    });
  }
  
  async start(): Promise<void> {
    // Register handlers from registry
    this.registerHandlers(this.handlersRegistry);
    
    // HTTP server setup
    const app = express();
    app.use(express.json());
    
    // POST /mcp - handle requests
    app.post("/mcp", async (req, res) => {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      
      // Get destination from request (headers or body)
      const destination = req.headers['x-destination'] || req.body?.destination || 'default';
      
      
      // Setup connection context from the destination (settings + credential)
      await this.setConnectionContext(destination, this.destinations);
      
      try {
        // Create new transport for each request
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        
        // Cleanup on close
        res.on("close", () => {
          transport.close();
        });
        
        // Connect transport to server
        await this.connect(transport);
        
        // Handle request (handlers have access to this.connectionContext)
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        // Error handling
        throw error;
      }
    });
    
    app.listen(this.port);
  }
}
```

**Usage**:
```typescript
// From CLI: --port=8083
// Or from YAML config
const port = args.port || config.port || 8083;

// Destinations: an AuthBrokerFactory (see "Destinations Setup")
// Create and start server
const server = new StreamableHttpServer(handlersRegistry, destinations, port);
await server.start();
```

**Flow**:
- Create `StreamableHttpServer` instance (extends `BaseMcpServer` which extends `McpServer`)
- Inject `IHandlersRegistry` and `IDestinations`
- Register handlers from `IHandlersRegistry` via `registerHandlers()`
- Start HTTP server
- **POST /mcp**: For each request, get the destination, set connection context via `setConnectionContext()`, create new `StreamableHTTPServerTransport`, connect, call `handleRequest`
- Connection context is available in handlers via `this.connectionContext`

**Sequence Diagram**:

```mermaid
sequenceDiagram
    participant Client
    participant HTTP as HTTP Server
    participant Transport as StreamableHTTPServerTransport
    participant SDK as McpServer SDK
    participant Hook as IRequestHook
    participant Handler as Tool Handler
    
    Note over Client,Handler: Server Startup
    SDK->>SDK: new McpServer() (single instance)
    SDK->>SDK: registerTool() with wrapped handler
    HTTP->>HTTP: Start HTTP server
    
    Note over Client,Handler: POST /mcp - Handle Request
    Client->>HTTP: POST /mcp (JSON-RPC)
    HTTP->>HTTP: Determine clientId
    HTTP->>HTTP: buildConnectionContext(clientId, req)
    HTTP->>SDK: setConnectionContext(context)
    HTTP->>Transport: new StreamableHTTPServerTransport()
    HTTP->>SDK: server.connect(transport)
    HTTP->>Transport: handleRequest(req, res, body)
    Transport->>SDK: Parse & route message
    SDK->>Handler: Call handler (this.connectionContext available)
    Handler->>Handler: Use this.connectionContext
    Handler-->>SDK: Return result
    SDK->>Transport: JSON-RPC response
    Transport->>Client: Response (JSON)
    HTTP->>Transport: transport.close() (on res.close)
```

## Handler Registration System

The architecture uses the existing handler registration system:

- **`IHandlersRegistry`**: Interface for handler registry
  - `registerAllTools(server: McpServer)`: Registers all tools on MCP server
  - `getRegisteredTools()`: Gets list of registered tool names
  
- **`CompositeHandlersRegistry`**: Implementation that works with handler groups
  - `getHandlerGroups()`: Returns array of `IHandlerGroup` instances
  - Accepts handler groups via constructor or `addHandlerGroup()`
  
- **`IHandlerGroup`**: Interface for handler groups
  - `getName()`: Returns group name
  - `getHandlers()`: Returns array of `HandlerEntry` (tool definition + handler)
  - `registerHandlers(server: McpServer)`: Registers handlers directly on server

**Handler Groups**:
- `ReadOnlyHandlersGroup`: Read-only operations
- `HighLevelHandlersGroup`: High-level operations
- `LowLevelHandlersGroup`: Low-level operations
- `SystemHandlersGroup`: System operations
- `SearchHandlersGroup`: Search operations

## Handler Registration with Connection Injection

### Handler Signature

Handlers have `connection` as first parameter, which is automatically injected during registration:

```typescript
// Handler signature
type ToolHandler = (connection: AbapConnection, args: any) => Promise<any>;

// Example handler
async function handleCreateClass(
  connection: AbapConnection,  // Injected automatically
  args: { className: string; package: string }
): Promise<any> {
  // Use connection directly
  const result = await connection.createClass(args.className, args.package);
  return result;
}
```

### Registration Process

During registration, handlers are wrapped to inject connection from context:

```typescript
protected registerHandlers(handlersRegistry: IHandlersRegistry): void {
  if (handlersRegistry instanceof CompositeHandlersRegistry) {
    const groups = handlersRegistry.getHandlerGroups();
    
    for (const group of groups) {
      const handlers = group.getHandlers();
      for (const entry of handlers) {
        // Wrap handler to inject connection
        // Original: (connection, args) => Promise<any>
        // Wrapped: (args) => handler(getConnection(), args)
        const wrappedHandler = async (args: any) => {
          // Get connection from this.connectionContext
          const connection = this.getConnection();
          
          // Call original handler with connection as first parameter
          return await entry.handler(connection, args);
        };
        
        this.registerTool(
          entry.toolDefinition.name,
          entry.toolDefinition,
          wrappedHandler
        );
      }
    }
  }
}
```

### Why This Works

- **One McpServer per request**: For stdio (one server), SSE (one server per GET /sse), HTTP (one server per POST)
- **Context is per-server**: Each server instance has its own `this.connectionContext`
- **Connection is fresh**: `getConnection()` creates connection from current context for each request
- **No manual connection management**: Handlers don't need to get connection themselves

### Example Handler Implementation

```typescript
// src/handlers/class/high/handleCreateClass.ts
export async function handleCreateClass(
  connection: AbapConnection,  // Automatically injected
  args: {
    className: string;
    package: string;
    description?: string;
  }
): Promise<any> {
  // Connection is already available, no need to create it
  const result = await connection.createClass({
    name: args.className,
    package: args.package,
    description: args.description,
  });
  
  return {
    content: [
      {
        type: 'text',
        text: `Class ${args.className} created successfully`,
      },
    ],
  };
}
```

## Key Points

1. **BaseMcpServer Class**: Extends `McpServer` from SDK and provides `connectionContext` property
   - Handlers can access context via `this.connectionContext` in their class
   - Context is set via `setConnectionContext(destination, destinations)`, which takes the destination's settings and credential; no token is read first
   - Handlers can be wrapped during registration to bind to class instance, or defined as class methods
   
2. **Three Server Classes**: 
   - `StdioServer` extends `BaseMcpServer` - single instance, context set once on startup using destination from CLI/YAML
   - `SseServer` - creates new server instance per GET /sse request
   - `StreamableHttpServer` extends `BaseMcpServer` - single instance, context set per-request using destination from request
   
3. **Handler Registration**: 
   - `IHandlersRegistry` (typically `CompositeHandlersRegistry`) is injected into each server class
   - Handlers have signature: `(connection: AbapConnection, args: any) => Promise<any>`
   - During registration, handlers are wrapped to inject `connection` from `this.connectionContext`
   - Wrapped handler: `(args: any) => handler(getConnection(), args)`
   - Each request gets fresh connection from current context
   
4. **Configuration**: 
   - CLI arguments: `--mcp=destination`, `--port=8083`, `--config=path/to/config.yaml`
   - YAML config file: Contains destinations, service keys paths, etc.
   - Configuration is used to create the `AuthBrokerFactory`; secrets live in `.env` files, never in YAML
   
5. **Auth Broker**:
   - Created by `AuthBrokerFactory`, one per destination, on first use
   - `getProvider(destination)` gives the connector its credential; the provider renews its token and the broker stores what it obtains
   - For stdio: one destination (from CLI/YAML)
   - For HTTP/SSE: the default destination, or the one in `x-mcp-destination` when `--allow-destination-header` is set

6. **Connection Setup**: 
   - For stdio: context set once via `setConnectionContext(destination, destinations)` before connecting transport
   - For SSE/HTTP: destination extracted from the request, context set via `setConnectionContext()` per session or request
   
7. **Context Access**: Connection parameters are accessed in handlers via `this.connectionContext` property
