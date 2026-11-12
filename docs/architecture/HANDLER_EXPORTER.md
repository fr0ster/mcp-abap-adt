# Handler Exporter Guide

This guide explains how to use the `HandlerExporter` class to integrate ABAP ADT handlers into your own MCP server.

## Overview

The `HandlerExporter` class registers the ABAP ADT tools on an `McpServer` of your own, each call on a connection your provider picks for it from the connections you hold. This is useful when you want to:

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

// Connect once and hold the connection: its lifetime is yours
const connection = createConnection({
  system: "onprem",
  transport: "http",
  config: { url: "https://your-sap-system.com", client: "100", authType: "basic" },
  credential: new BasicAuthProvider("user", "pass"),
});
await connection.connect();

// Register the tools: every call runs on the connection you hold
exporter.registerOnServer(mcpServer, () => connection);

// When you are done with it (your shutdown): log it off
await connection.disconnect();
```

### What is listed

`registerOnServer` lists exactly what a plain registration of the exporter's groups lists
(`createRegistry().registerAllTools(mcpServer)`, see
[the handlers README](../../src/lib/handlers/README.md#which-variant-a-plain-registration-lists)),
through the same code: the tools, descriptions, schemas and search members of the variant
`systemType` states. With no `systemType`, every definition is listed as it is, and every call
that would reach a system is refused `system_type_required` before anything is sent.
`SAP_SYSTEM_TYPE` is not read on this path, for the listing or for a call.

The exporter keeps no background-run store and no debugger, so it hands out neither, on every
path (`getHandlerEntries()`, `createRegistry()`, `registerOnServer`): no background-run tool
(`GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`), no `background` parameter on
`RuntimeRunClass` / `RuntimeRunProgram` or on a listed long tool (its read runs in the call), and
no debugger tool (its options have no
`includeDebug`). A server instance (`EmbeddableMcpServer`) serves them.

## Connection Provider

The `connectionProvider` (`ConnectionProvider`: `() => IAbapConnection | Promise<IAbapConnection>`,
exported from `@mcp-abap-adt/lib/handlers`) is called for **each tool call**. It returns a
connection you already connected and hold — one per system and user, say — chosen for the
request from what you hold; the call runs on it.

The connection is used as the provider returns it. The server never connects it, logs it off or
disconnects it: its lifetime — `connect()`, `disconnect()` (the logoff) — is yours. A call that
relies on what an earlier call left in the SAP session (a lock above all) needs the provider to
return the same connection for both. Nothing waits on a clock and nothing is retried.

Each call:

1. awaits the provider. A provider that throws or rejects is the call's answer, and the handler
   does not run. A failure the server's failure reader knows passes through as it came: a chain
   failure of the credential (`@mcp-abap-adt/auth-errors`, or the connection's own auth
   refusal), a `ServerRefusal`, a `401`. Anything else is `connection_provider_failed` — "the
   embedder's connection provider failed, so this call has no connection; the tool did not run"
   — with nothing of what it threw;
2. states the exporter's `systemType` on that connection (none stated: none, and
   `SAP_SYSTEM_TYPE` is not read for it);
3. with a `systemContextResolver` (and `systemContextRules`), fills the connection's parameters
   before the handler runs, as `getHandlerEntries()` does;
4. calls the entry with the call's context — `entry.call(context, args)` — so calls at once
   each run on their own connection. The entry parses the arguments with the tool's schema
   before its handler runs.

A listed long tool's read runs in the call on a connection of its own, opened from the call's, as
on a plain registration. For long reads in the background, an embedder serves its groups from a
server instance with a strategy: an `EmbeddableMcpServer` given `backgroundRuns` serves the
background-run tools beside every long tool its registry carries (`createRegistry()` included),
whatever the exposition. Without a strategy, or on a plain registration, no background-run tool is
listed. A server instance with a strategy that registers the exporter's registry
(`createRegistry()`) without the background-run tools lists its long tools without `background`
too: nothing there could read a run.

### Async Connection Provider

The provider may answer asynchronously — for instance from a pool of your own, which connects a
connection once per user and holds it:

```typescript
import type { IAbapConnection } from "@mcp-abap-adt/interfaces-adt-connection";

// Your pool: hands out the connected connection it holds for a user
interface ConnectionPool {
  connectionFor(user: string): Promise<IAbapConnection>;
}

exporter.registerOnServer(mcpServer, async () => {
  const user = currentUser();
  return pool.connectionFor(user);
});
```

### Per-Request Context (AsyncLocalStorage)

For web servers (a SAP CAP/CDS application among them), hold one connected connection per user
and let each request say whose it is:

```typescript
import { AsyncLocalStorage } from "node:async_hooks";

const requestContext = new AsyncLocalStorage<{ user: string }>();

// The connections you hold, connected when you open them; you log them off
const held = new Map<string, IAbapConnection>();

exporter.registerOnServer(mcpServer, () => {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("No request context");
  const connection = held.get(ctx.user);
  if (!connection) throw new Error("No connection held for this user");
  return connection;
});

// In your request handler:
app.post("/mcp", (req, res) => {
  requestContext.run({ user: userOf(req) }, async () => {
    await handleMcpRequest(req, res);
  });
});
```

A call without a request context, or for a user you hold no connection for, is answered
`connection_provider_failed`; the words you threw stay with you.

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
  await entry.call(context, {}); // the call's HandlerContext and its arguments
}
```

### What `getHandlerEntries()` hands back

Each entry is `{ toolDefinition, call(context, args), connectionless? }`
(`HandlerEntry`); its `toolDefinition.inputSchema` is the tool's zod schema.
Its `call` is wrapped. The wrapper, before the handler runs:

- states the exporter's `systemType` on the call's connection — the
  connection of the `context` it is called with. The handler runs on that kind; with no
  `systemType` stated, the connection has none, and a call that would reach a
  system is refused `system_type_required` before anything is sent.
  `SAP_SYSTEM_TYPE` is not read for it;
- runs it in the call-transport scope with its call's own
  `transport_request` (the failure renderer's transport hint);
- with a `systemContextResolver` (none by default since 19.0.0), fills the
  connection's parameters — the responsible and master system, made once by
  the `systemContextRules` you pass (`@mcp-abap-adt/responsible-rules`), else
  the system's information.

`registerOnServer` gives each of its calls the same scope.

Two things follow for an embedder that calls the handlers itself:

- `entry.call(context, args)` parses `args` with the tool's schema, as the SDK does
  over MCP: arguments that do not parse are refused — an `Error` whose message starts
  `Input validation error: Invalid arguments for tool <Tool>:` and names each
  issue — and the handler does not run. A schema default reaches the handler as if given.
- The wrapper is built per call, so two calls to `getHandlerEntries()` return
  functions that are not identity-equal. Compare tool names, not functions.

The options reach `getHandlerEntries()` and `registerOnServer`. `createRegistry()` returns the
groups themselves, built on a context with no connection: registered on a plain `McpServer` with
`registerAllTools`, they list the tools, but a call has no connection to run on. On a server of
your own use `registerOnServer`; hand the registry to a server instance otherwise.

## A Server Instance Instead

`EmbeddableMcpServer` holds one connection you give it — used as given, its lifetime yours too —
and serves the exporter's registry as a server instance:

```typescript
import { EmbeddableMcpServer } from "@mcp-abap-adt/lib/embeddable";

const server = new EmbeddableMcpServer({
  connection,
  systemType: "onprem",
  handlersRegistry: new HandlerExporter({ systemType: "onprem" }).createRegistry(),
});
```

## SearchSource's strategies

`SearchSource` takes two strategies, both the consumer's, both optional, given
only as options — `HandlerExporter`'s, or the hosting server's:

- **`sapAnswerStrategy`** (`SapAnswerStrategy`): what a SAP answer to a failed
  read leads to — `'skip'`, `'end'` (the call ends with the failure) or
  `'throw'` — asked once per SAP answer with its place (`'mask'`, `'package'`,
  `'level'`, `'structure'`, `'source'`). Only SAP answers reach it: a failure
  carrying a response with an HTTP status, whatever its `origin`, or an ADT
  refusal. A credential refusal always ends the call; a failed batch envelope
  and anything else are always thrown. Absent: `skipSapAnswers`.
- **`lineMatchStrategy`** (`LineMatchStrategy`): which lines of a source are
  hits (`ScanInput` in, `ScanResult` out). Absent: `substringLineMatch`.

Both contracts and both shipped strategies are exported from
`@mcp-abap-adt/lib/embeddable`. On `getHandlerEntries()` and
`registerOnServer` the exporter's options apply, and an embedder's own
context is not a way to pass them (the exporter sets the context's fields
from its options). On `createRegistry()` the tools run in the contexts of the
server the registry is handed to: there the server's own
`sapAnswerStrategy` / `lineMatchStrategy` options apply.

## Logging

Pass a logger (`Logger` from `@mcp-abap-adt/logger`):

```typescript
const exporter = new HandlerExporter({ systemType: "onprem", logger });
```

## See Also

- [Architecture Overview](README.md)
- [Tools Architecture](TOOLS_ARCHITECTURE.md)
- [Connection Isolation](CONNECTION_ISOLATION.md)
