# Unified Configuration System

Unified configuration system for both old and new servers.

## Components

### ArgumentsParser
Parses command-line arguments and environment variables.

```typescript
import { ArgumentsParser } from './config';

const args = ArgumentsParser.parse();
// args.mcp, args.env, args.transport, etc.
```

### ConfigLoader
Loads YAML configuration and merges with CLI arguments (CLI takes priority).

```typescript
import { ConfigLoader } from './config';

const config = ConfigLoader.load();
// config.defaultMcpDestination, config.transport, etc.
```

### ServerConfig
Unified server configuration interface.

```typescript
import { ServerConfig } from './config';

const config: ServerConfig = {
  defaultMcpDestination: 'trial',
  transport: { type: 'stdio' },
  unsafe: false,
  useAuthBroker: true,
  // ...
};
```

## Usage with AuthBrokerFactory

```typescript
import { ConfigLoader } from './config';
import { AuthBrokerFactory } from '../authBrokerFactory';

// Load configuration
const serverConfig = ConfigLoader.load();

// Create AuthBrokerFactory from configuration
const authBrokerFactory = AuthBrokerFactory.fromServerConfig(serverConfig);

// Get AuthBroker for destination
const authBroker = await authBrokerFactory.getOrCreateAuthBroker('trial');
```

## Integration in Old Server

```typescript
// In mcp_abap_adt_server
import { ConfigLoader } from './lib/config';
import { AuthBrokerFactory } from './lib/authBrokerFactory';

async run() {
  // Load configuration
  const serverConfig = ConfigLoader.load();
  
  // Create AuthBrokerFactory
  const authBrokerFactory = AuthBrokerFactory.fromServerConfig(serverConfig);
  
  // Use as before
  const authBroker = await authBrokerFactory.getOrCreateAuthBroker(serverConfig.defaultMcpDestination);
}
```

## Integration in New Server (StdioServer, SseServer, StreamableHttpServer)

```typescript
// In BaseMcpServer or specific servers
import { ConfigLoader } from './lib/config';
import { AuthBrokerFactory } from './lib/authBrokerFactory';

class StdioServer extends BaseMcpServer {
  async start() {
    // Load configuration
    const serverConfig = ConfigLoader.load();
    
    // Create AuthBrokerFactory
    const authBrokerFactory = AuthBrokerFactory.fromServerConfig(serverConfig);
    
    // Get AuthBroker
    const authBroker = await authBrokerFactory.getOrCreateAuthBroker(serverConfig.defaultMcpDestination);
    
    // Set connection context
    await this.setConnectionContext(serverConfig.defaultMcpDestination!, authBroker);
    
    // Register handlers
    this.registerHandlers(handlersRegistry);
    
    // Start transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

## Benefits

1. **Unified Logic** - Single configuration system for both old and new servers
2. **CLI Priority** - Command-line arguments override YAML values
3. **YAML Support** - Use configuration file instead of long command-line arguments
4. **Type Safety** - TypeScript interfaces for all configurations
5. **Backward Compatibility** - Old code continues to work

