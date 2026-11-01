# Handler Exporter Guide

This guide explains how to use the `HandlerExporter` class to integrate ABAP ADT handlers into your own MCP server.

## Overview

The `HandlerExporter` class registers the ABAP ADT tools on an `McpServer` of your own, each call on the connection your provider returns for it. This is useful when you want to:

- Embed ABAP ADT functionality into an existing server (e.g., SAP CAP/CDS application)
- Use your own connection management logic
- Customize which handlers are available

Every example below is compiled against the real API by
`src/__tests__/typecheck/handlerExporterGuide.typecheck.ts` (`npm run test:check`).

## Installation

```bash
npm install @mcp-abap-adt/lib @mcp-abap-adt/connection @mcp-abap-adt/auth-providers
```

## Basic Usage

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HandlerExporter } from "@mcp-abap-adt/lib/handlers";
import { createConnection } from "@mcp-abap-adt/connection";
import { BasicAuthProvider } from "@mcp-abap-adt/auth-providers";

// Create your MCP server
const mcpServer = new McpServer({ name: "my-server", version: "1.0.0" });

// Create handler exporter: the system kind its tools are listed and called on
const exporter = new HandlerExporter({ systemType: "onprem" });

const connection = createConnection({
  system: "onprem",
  transport: "http",
  config: { url: "https://your-sap-system.com", client: "100", authType: "basic" },
  credential: new BasicAuthProvider("user", "pass"),
});

// Register the tools with a connection provider
exporter.registerOnServer(mcpServer, () => connection);
```

### What is listed

`registerOnServer` lists exactly what a plain registration of the exporter's groups lists
(`createRegistry().registerAllTools(mcpServer)`, see
[the handlers README](../../src/lib/handlers/README.md#which-variant-a-plain-registration-lists)),
through the same code: the tools, descriptions, schemas and search members of the variant
`systemType` states. With no `systemType`, every definition is listed as it is, and every call
that would reach a system is refused `system_type_required` before anything is sent.
`SAP_SYSTEM_TYPE` is not read on this path, for the listing or for a call.

## Connection Provider

The `connectionProvider` (`ConnectionProvider`: `() => IAbapConnection | Promise<IAbapConnection>`,
exported from `@mcp-abap-adt/lib/handlers`) is called for **each tool call**, and the call runs on
what it returns. This allows you to:

- Return different connections for different requests
- Implement per-request authentication (e.g., different JWT tokens)
- Hand out connections from a pool of your own

The connection is used as given: nothing connects it, logs it off or disconnects it — its
lifetime is yours. Each call uses what the provider returns, so a call that relies on what an
earlier call left in the SAP session (a lock above all) needs the provider to return the same
connection for both. Nothing waits on a clock and nothing is retried.

Each call:

1. awaits the provider. A provider that throws or rejects is the call's answer, and the handler
   does not run: a credential failure (a chain failure, a `401`) as it came; anything else
   `connection_provider_failed` — "the embedder's connection provider failed, so this call has no
   connection; the tool did not run" — with nothing of what it threw;
2. states the exporter's `systemType` on that connection (none stated: none, and
   `SAP_SYSTEM_TYPE` is not read for it; a connection built by `createAbapConnection` keeps the
   kind it was built for);
3. with a `systemContextResolver` (and `systemContextRules`), fills the connection's parameters
   before the handler runs, as `getHandlerEntries()` does;
4. calls the handler in the form it takes: `handler(context, args)`, or — for an args-only
   handler (`(args) => handleX(this.context, args)`) — `handler(args)` with its group's context
   set to the call's for exactly that call, so calls at once each run on their own connection.

A listed long tool's read runs on a connection of its own, opened from the call's, as on a plain
registration.

The exporter keeps no background-run store and no debugger, so it hands out neither, on every
path (`getHandlerEntries()`, `createRegistry()`, `registerOnServer`): no background-run tool
(`GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`), no `background` parameter on
`RuntimeRunClass` / `RuntimeRunProgram`, and no debugger tool — `includeDebug: true` is refused
when the exporter is constructed. A server instance (`EmbeddableMcpServer`) serves them.

### Async Connection Provider

```typescript
exporter.registerOnServer(mcpServer, async () => {
  // Get fresh token for each request
  const connection = createConnection({
    system: "cloud",
    transport: "http",
    config: { url: sapUrl, authType: "jwt" },
    credential: TokenAuthProvider.fixed(await getJwtToken()),
  });
  await connection.connect();
  return connection;
});
```

Each such call opens a new SAP session; disconnect the connections you no longer need.

### Per-Request Context (AsyncLocalStorage)

For web servers (a SAP CAP/CDS application among them), you can use AsyncLocalStorage to pass
request-specific config:

```typescript
import { AsyncLocalStorage } from "node:async_hooks";
import type { ISapConfig } from "@mcp-abap-adt/interfaces-auth-sap";

interface RequestContext {
  sapConfig: ISapConfig;
  token: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

exporter.registerOnServer(mcpServer, async () => {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("No request context");
  const connection = createConnection({
    system: "cloud",
    transport: "http",
    config: ctx.sapConfig,
    credential: TokenAuthProvider.fixed(ctx.token),
  });
  await connection.connect();
  return connection;
});

// In your request handler:
app.post("/mcp", (req, res) => {
  const { sapConfig, token } = extractSapConfigFromHeaders(req);
  requestContext.run({ sapConfig, token }, async () => {
    await handleMcpRequest(req, res);
  });
});
```

A call without a request context is answered `connection_provider_failed`; the words you threw
stay with you.

## Handler Groups

By default, every handler group the exporter serves is included. You can customize this:

```typescript
const exporter = new HandlerExporter({
  systemType: "cloud",
  includeReadOnly: true,   // getProgram, getClass, getTable, etc.
  includeHighLevel: true,  // createProgram, updateClass, etc.
  includeSystem: true,     // system and runtime-run tools
  includeSearch: true,     // search and where-used tools
});
```

### Read-Only Mode

For a read-only server:

```typescript
const exporter = new HandlerExporter({
  systemType: "cloud",
  includeReadOnly: true,
  includeHighLevel: false,
  includeSystem: true,
  includeSearch: true,
});
```

## Inspecting Handlers

```typescript
// Get all tool names
const toolNames = exporter.getToolNames();

// Get handler entries for custom registration
const entries = exporter.getHandlerEntries();
for (const entry of entries) {
  console.error(`Tool: ${entry.toolDefinition.name}`);
}
```

### What `getHandlerEntries()` hands back

Each entry's `handler` is wrapped. The wrapper, before the handler runs:

- states the exporter's `systemType` on the call's connection — the
  connection of the `context` it is called with, or, for an args-only handler,
  of its group's context at call time. The handler runs on that kind; with no
  `systemType` stated, the connection has none, and a call that would reach a
  system is refused `system_type_required` before anything is sent.
  `SAP_SYSTEM_TYPE` is not read for it. A connection built by
  `createAbapConnection` keeps the kind it was built for;
- runs it in the call-transport scope with its call's own
  `transport_request` (the failure renderer's transport hint);
- with a `systemContextResolver` (none by default since 19.0.0), fills the
  connection's parameters — the responsible and master system, made once by
  the `systemContextRules` you pass (`@mcp-abap-adt/responsible-rules`), else
  the system's information.

`registerOnServer` gives each of its calls the same scope.

Two things follow for an embedder that calls the handlers itself:

- The wrapper preserves the handler's arity: `isArgsOnly(handler)` tells the
  two forms apart, and `callInItsForm(handler, context, args, inGroupContext)`
  (both from `@mcp-abap-adt/lib/handlers`) calls a handler in the form it takes.
- The wrapper is built per call, so two calls to `getHandlerEntries()` return
  functions that are not identity-equal. Compare tool names, not functions.

The options reach `getHandlerEntries()` and `registerOnServer`. `createRegistry()` returns the
groups themselves, built on a context with no connection: registered on a plain `McpServer` with
`registerAllTools`, they list the tools, but a call has no connection to run on. On a server of
your own use `registerOnServer`; hand the registry to a server instance otherwise.

## A Server Instance Instead

`EmbeddableMcpServer` holds one connection and serves the exporter's registry as a server
instance:

```typescript
import { EmbeddableMcpServer } from "@mcp-abap-adt/lib/embeddable";

const server = new EmbeddableMcpServer({
  connection,
  systemType: "onprem",
  handlersRegistry: new HandlerExporter({ systemType: "onprem" }).createRegistry(),
});
```

## Logging

Pass a logger (`Logger` from `@mcp-abap-adt/logger`):

```typescript
const exporter = new HandlerExporter({ logger });
```

## See Also

- [Architecture Overview](README.md)
- [Tools Architecture](TOOLS_ARCHITECTURE.md)
- [Connection Isolation](CONNECTION_ISOLATION.md)
