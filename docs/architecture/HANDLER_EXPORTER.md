# Handler Exporter Guide

This guide explains how to use the `HandlerExporter` class to integrate ABAP ADT handlers into your own MCP server.

## Overview

The `HandlerExporter` class allows you to register all ABAP ADT handlers on any `McpServer` instance. This is useful when you want to:

- Embed ABAP ADT functionality into an existing server (e.g., SAP CAP/CDS application)
- Use your own connection management logic
- Customize which handlers are available

## Installation

```bash
npm install @fr0ster/mcp-abap-adt
```

## Basic Usage

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HandlerExporter } from "@fr0ster/mcp-abap-adt/handlers";
import { createAbapConnection } from "@mcp-abap-adt/connection";

// Create your MCP server
const mcpServer = new McpServer({ name: "my-server", version: "1.0.0" });

// Create handler exporter
const exporter = new HandlerExporter();

// Register handlers with a connection provider
exporter.registerOnServer(mcpServer, () => {
  return createAbapConnection({
    url: "https://your-sap-system.com",
    authType: "basic",
    username: "user",
    password: "pass",
  });
});
```

## Connection Provider

The `connectionProvider` function is called for **each handler invocation**. This allows you to:

- Return different connections for different requests
- Implement per-request authentication (e.g., different JWT tokens)
- Use connection pooling

### Async Connection Provider

```typescript
exporter.registerOnServer(mcpServer, async () => {
  // Get fresh token for each request
  const token = await getJwtToken();
  return createAbapConnection({
    url: sapUrl,
    authType: "jwt",
    jwtToken: token,
  });
});
```

### Per-Request Context (AsyncLocalStorage)

For web servers, you can use AsyncLocalStorage to pass request-specific config:

```typescript
import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  sapConfig: SapConfig;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

exporter.registerOnServer(mcpServer, () => {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("No request context");
  return createAbapConnection(ctx.sapConfig);
});

// In your request handler:
app.post("/mcp", (req, res) => {
  const sapConfig = extractSapConfigFromHeaders(req);
  requestContext.run({ sapConfig }, async () => {
    await handleMcpRequest(req, res);
  });
});
```

## Handler Groups

By default, all handler groups are included. You can customize this:

```typescript
const exporter = new HandlerExporter({
  includeReadOnly: true,   // getProgram, getClass, getTable, etc.
  includeHighLevel: true,  // createProgram, updateClass, etc.
  includeLowLevel: true,   // low-level ADT operations
  includeSystem: true,     // getInactiveObjects, etc.
  includeSearch: true,     // whereUsed, quickFix, etc.
});
```

### Read-Only Mode

For a read-only server:

```typescript
const exporter = new HandlerExporter({
  includeReadOnly: true,
  includeHighLevel: false,
  includeLowLevel: false,
  includeSystem: true,
  includeSearch: true,
});
```

## Inspecting Handlers

```typescript
// Get all tool names
const toolNames = exporter.getToolNames();
console.log("Available tools:", toolNames);

// Get handler entries for custom registration
const entries = exporter.getHandlerEntries();
for (const entry of entries) {
  console.log(`Tool: ${entry.toolDefinition.name}`);
  console.log(`Description: ${entry.toolDefinition.description}`);
}
```

## Creating Registry for v2 Servers

If you're using v2 server classes directly:

```typescript
import { StreamableHttpServer } from "@fr0ster/mcp-abap-adt/server/v2";

const exporter = new HandlerExporter();
const registry = exporter.createRegistry();

const server = new StreamableHttpServer(registry, authBrokerFactory, {
  path: "/mcp",
});
```

## Integration with SAP CAP/CDS

Example for cloud-llm-hub style integration:

```typescript
import cds from "@sap/cds";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HandlerExporter } from "@fr0ster/mcp-abap-adt";
import { createConnection } from "./connections/connectionFactory";

// Create MCP server instance
const mcpServer = new McpServer({ name: "cloud-llm-hub", version: "1.0.0" });

// Create handler exporter
const exporter = new HandlerExporter();

// Register handlers with CAP-aware connection provider
exporter.registerOnServer(mcpServer, async () => {
  const sapContext = await extractSapContext(req);
  return createConnection({
    sapConfig: sapContext.sapConfig,
    destinationName: sapContext.destination?.destinationName,
  });
});
```

## Logging

Pass a custom logger:

```typescript
import { createLogger } from "@mcp-abap-adt/logger";

const logger = createLogger({ level: "debug" });
const exporter = new HandlerExporter({ logger });
```

## Migration from v1 Server

If you were using `mcp_abap_adt_server` directly:

```typescript
// Old way (still works via legacy import)
import { mcp_abap_adt_server } from "@fr0ster/mcp-abap-adt";
const server = new mcp_abap_adt_server({ connection });
await server.run();

// New way (recommended for embedding)
import { HandlerExporter } from "@fr0ster/mcp-abap-adt/handlers";
const exporter = new HandlerExporter();
exporter.registerOnServer(yourMcpServer, () => connection);
```

## See Also

- [Architecture Overview](README.md)
- [Tools Architecture](TOOLS_ARCHITECTURE.md)
- [Connection Isolation](CONNECTION_ISOLATION.md)
