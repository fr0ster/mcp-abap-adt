# @mcp-abap-adt/connection

ABAP connection layer for MCP ABAP ADT server. Provides a unified interface for connecting to SAP ABAP systems via ADT (ABAP Development Tools) protocol, supporting both on-premise (Basic Auth) and cloud (JWT/OAuth2) authentication methods.

## Features

- 🔐 **Multiple Authentication Methods**: Basic Auth for on-premise systems, JWT/OAuth2 for SAP BTP ABAP Environment
- 🔄 **Stateful Sessions**: Support for persistent sessions with CSRF token and cookie management
- 📝 **Custom Logging**: Pluggable logger interface for integration with any logging system
- 🛠️ **CLI Tool**: Built-in authentication helper for SAP BTP service key authentication
- 📦 **TypeScript**: Full TypeScript support with type definitions included
- ⚡ **Timeout Management**: Configurable timeouts for different operation types

## Installation

```bash
npm install @mcp-abap-adt/connection
```

## Quick Start

### Basic Usage (On-Premise)

```typescript
import { createAbapConnection, SapConfig } from "@mcp-abap-adt/connection";

const config: SapConfig = {
  url: "https://your-sap-system.com",
  client: "100",
  authType: "basic",
  username: "your-username",
  password: "your-password",
};

// Create a simple logger
const logger = {
  info: (msg: string, meta?: any) => console.log(msg, meta),
  error: (msg: string, meta?: any) => console.error(msg, meta),
  warn: (msg: string, meta?: any) => console.warn(msg, meta),
  debug: (msg: string, meta?: any) => console.debug(msg, meta),
};

// Create connection
const connection = createAbapConnection(config, logger);

// Make ADT request
const response = await connection.makeAdtRequest({
  method: "GET",
  url: "/sap/bc/adt/programs/programs/your-program",
});
```

### Cloud Usage (JWT/OAuth2)

```typescript
import { createAbapConnection, SapConfig } from "@mcp-abap-adt/connection";

// First, obtain JWT token using the CLI tool or OAuth2 flow
// Then use it in the config:
const config: SapConfig = {
  url: "https://your-instance.abap.cloud.sap",
  client: "100", // Optional
  authType: "jwt",
  jwtToken: "your-jwt-token-here", // Obtained via OAuth2 flow
};

const logger = {
  info: (msg: string, meta?: any) => console.log(msg, meta),
  error: (msg: string, meta?: any) => console.error(msg, meta),
  warn: (msg: string, meta?: any) => console.warn(msg, meta),
  debug: (msg: string, meta?: any) => console.debug(msg, meta),
};

const connection = createAbapConnection(config, logger);

const response = await connection.makeAdtRequest({
  method: "GET",
  url: "/sap/bc/adt/programs/programs/your-program",
});
```

### Stateful Sessions

For operations that require session state (e.g., object modifications), you can enable stateful sessions:

```typescript
import {
  createAbapConnection,
  ISessionStorage,
  SessionState,
} from "@mcp-abap-adt/connection";

// Implement session storage (e.g., file system, database, memory)
class FileSessionStorage implements ISessionStorage {
  async save(sessionId: string, state: SessionState): Promise<void> {
    // Save to file system
    await fs.writeFile(
      `sessions/${sessionId}.json`,
      JSON.stringify(state, null, 2)
    );
  }

  async load(sessionId: string): Promise<SessionState | null> {
    // Load from file system
    const data = await fs.readFile(`sessions/${sessionId}.json`, "utf-8");
    return JSON.parse(data);
  }

  async delete(sessionId: string): Promise<void> {
    // Delete from file system
    await fs.unlink(`sessions/${sessionId}.json`);
  }
}

const connection = createAbapConnection(config, logger);
const sessionStorage = new FileSessionStorage();

// Enable stateful session
await connection.enableStatefulSession("my-session-id", sessionStorage);

// Now CSRF tokens and cookies are automatically managed
await connection.makeAdtRequest({
  method: "POST",
  url: "/sap/bc/adt/objects/domains",
  data: { /* domain data */ },
});
```

### Custom Logger

```typescript
import { ILogger } from "@mcp-abap-adt/connection";

class MyLogger implements ILogger {
  info(message: string, meta?: any): void {
    // Your logging implementation
  }

  error(message: string, meta?: any): void {
    // Your logging implementation
  }

  warn(message: string, meta?: any): void {
    // Your logging implementation
  }

  debug(message: string, meta?: any): void {
    // Your logging implementation
  }

  csrfToken(action: "fetch" | "retry" | "success" | "error", message: string, meta?: any): void {
    // CSRF token specific logging
  }

  tlsConfig(rejectUnauthorized: boolean): void {
    // TLS configuration logging
  }
}

const logger = new MyLogger();
const connection = createAbapConnection(config, logger);
```

## CLI Tool

The package includes a CLI tool for authenticating with SAP BTP using service keys:

### Installation

After installing the package, the CLI tool is available via `npx`:

```bash
npx sap-abap-auth auth -k path/to/service-key.json
```

### Global Installation

```bash
npm install -g @mcp-abap-adt/connection
sap-abap-auth auth -k path/to/service-key.json
```

### Usage

```bash
# Show help
sap-abap-auth --help

# Authenticate with service key
sap-abap-auth auth -k service-key.json

# Specify browser
sap-abap-auth auth -k service-key.json --browser chrome

# Custom output file
sap-abap-auth auth -k service-key.json --output .env.production
```

### Options

- `-k, --key <path>` - Path to service key JSON file (required)
- `-b, --browser <name>` - Browser to open (chrome, edge, firefox, system, none)
- `-o, --output <path>` - Path to output .env file (default: .env)
- `-h, --help` - Show help message

## API Reference

### Types

#### `SapConfig`

Configuration for SAP ABAP connection.

```typescript
type SapConfig = {
  url: string;
  client?: string;
  authType: "basic" | "jwt";
  // For basic auth
  username?: string;
  password?: string;
  // For JWT auth
  jwtToken?: string;
};
```

#### `AbapConnection`

Main interface for ABAP connections.

```typescript
interface AbapConnection {
  makeAdtRequest(options: AbapRequestOptions): Promise<AxiosResponse>;
  reset(): void;
  enableStatefulSession(sessionId: string, storage: ISessionStorage): Promise<void>;
  disableStatefulSession(): void;
  getSessionMode(): "stateless" | "stateful";
}
```

#### `ILogger`

Logger interface for custom logging implementations.

```typescript
interface ILogger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  csrfToken?(action: "fetch" | "retry" | "success" | "error", message: string, meta?: any): void;
  tlsConfig?(rejectUnauthorized: boolean): void;
}
```

#### `ISessionStorage`

Interface for session state persistence.

```typescript
interface ISessionStorage {
  save(sessionId: string, state: SessionState): Promise<void>;
  load(sessionId: string): Promise<SessionState | null>;
  delete(sessionId: string): Promise<void>;
}
```

### Functions

#### `createAbapConnection(config, logger, sessionStorage?, sessionId?)`

Factory function to create an ABAP connection instance.

```typescript
function createAbapConnection(
  config: SapConfig,
  logger: ILogger,
  sessionStorage?: ISessionStorage,
  sessionId?: string
): AbapConnection;
```

## Requirements

- Node.js >= 18.0.0
- Access to SAP ABAP system (on-premise or BTP)

## License

MIT

## Repository

https://github.com/fr0ster/mcp-abap-adt

## Related Projects

- [mcp-abap-adt](https://github.com/fr0ster/mcp-abap-adt) - Main MCP server for ABAP ADT

