# Handler Exporter Guide

This guide explains how to use the `HandlerExporter` class to integrate ABAP ADT handlers into your own MCP server.

## Overview

The `HandlerExporter` class registers the ABAP ADT tools on an `McpServer` of your own, each call on a connection your provider picks for it from the connections you hold. This is useful when you want to:

- Embed ABAP ADT functionality into an existing server (e.g., SAP CAP/CDS application)
- Use your own connection management logic
- Customize which handlers are available

The exporter serves the full tools only. The compact tools are registered from
`CompactReadOnlyHandlersGroup` (`@mcp-abap-adt/compact-readonly-entries`) and
`CompactModifyHandlersGroup` (`@mcp-abap-adt/compact-modify`) on an `EmbeddableMcpServer`
(background runs, given a strategy) or on a plain `McpServer` (answered in the call).

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
`systemType` states. With no `systemType` stated, every definition is listed as it is; a tool stated per variant is refused
`system_type_required` before anything is sent, and a tool listed alike on every variant runs on the
connection's recorded kind (the factory's record) or declared kind (`declareSystemKind`), whatever
`SAP_SYSTEM_TYPE` says. The kind a registration was listed for is the one kind of its calls: a
provided context (`registerHandlersOnCall`, `registerOnServer`) stating another kind — or any kind,
where the registration was listed for none — is refused `system_type_conflict`, never run on its kind.
`SAP_SYSTEM_TYPE` is not read on this path, for the listing or for a call.

The exporter keeps no background-run store and no debugger, so on its own paths
(`getHandlerEntries()`, `registerOnServer`, `createRegistry()` registered on a plain `McpServer`)
it hands out neither: no background-run tool (`GetBackgroundRun`, `ListBackgroundRuns`,
`DiscardBackgroundRun`), no `background` parameter on `RuntimeRunClass` / `RuntimeRunProgram` or
on a listed long tool (its read runs in the call), and no debugger tool. A `createRegistry()`
registry handed to a server runs its run tools as the server's own: with `background` on a server
given `backgroundRuns` (24.0.0) (its options have no
`includeDebug`). A server instance (`EmbeddableMcpServer`) serves them.

abapGit tools are served by the MCP server only. Every abapGit call goes through `BaseMcpServer`'s
admission (the import refusal, the system's discovery, the repository-list pre-read, the package
check, the approved git endpoints); without it every call is refused `abapgit_not_admitted`. So the
exporter hands out no abapGit tool (`ListAbapGitRepos` … `GetAbapGitErrorLog`, compact
`HandlerAbapGitGet` / `HandlerAbapGit`) on `getHandlerEntries()`, `getToolNames()`,
`createRegistry()` or `registerOnServer`. Serve them with `EmbeddableMcpServer`, adding
`AbapGitHandlersGroup` from `@mcp-abap-adt/lib/handlers` to its registry.

### Prompts

The prompt module is `@mcp-abap-adt/lib/prompts` (`src/lib/prompts/`): the nine MCP prompts
(`create`, `get`, `update`, `delete`, `activate`, `check`, `unit_test`, `where_used`,
`transport`), built from the entries the registry lists on its kind, after the deny list.

- **A server instance** (`BaseMcpServer`, `EmbeddableMcpServer`, and so every binary) registers
  the prompts after its tools, from the same listing; a `createRegistry()` registry handed to
  either gets them. The option `prompts: false` registers none.
- **A plain registration** (`registerOnServer`, `createRegistry().registerAllTools(mcpServer)`)
  registers no prompt, so the embedder's own prompt names stay its own. `registerAbapPrompts(mcpServer, registry)`
  (`@mcp-abap-adt/lib/prompts`) registers them, from the registry's groups and the kind they
  state, with no background-run strategy and no `state_handle`:

  ```typescript
  import { registerAbapPrompts } from "@mcp-abap-adt/lib/prompts";

  const registry = exporter.createRegistry();
  registry.registerAllTools(mcpServer);
  registerAbapPrompts(mcpServer, registry);
  ```

  `registerAbapPrompts` is the module's one export. `createRegistry()` returns a
  `CompositeHandlersRegistry` (`@mcp-abap-adt/lib/handlers`), the type the function takes. On a
  legacy kind none is registered; a second call on the same server throws the SDK's
  `Prompt <name> is already registered`.

See [PROMPTS.md](../user-guide/PROMPTS.md) for what each binary lists.

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
listed.

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
  includeSystem: false, // the system group carries the class and program runs, which run code
  includeSearch: true,
});
```

`includeSystem` brings the system reads together with the runs (`RuntimeRunClass`,
`RuntimeRunProgram` and the profiler's), which run code in the system, so a server that must
change nothing leaves it off; the `-ro` binaries' set (`fullReadOnlyToolSet` of
`@mcp-abap-adt/lib/tool-set`) serves the system reads without the runs.

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

- parses `args` with the tool's schema first — on the kind the exporter states, whose schema
  holds that variant's type lists (24.0.0): a refused call is rejected with the schema's words
  before any scope, resolver, access check or request;
- states the exporter's `systemType` on the call's connection — the
  connection of the `context` it is called with — and the handler runs on that kind. A
  connection `createAbapConnection` built for the other kind, or declared for it
  (`declareSystemKind`), is refused `system_type_conflict` (24.0.0), naming both kinds. With
  no `systemType` stated, a tool stated per variant is refused `system_type_required` before
  anything is sent, and the others run on the connection's recorded or declared kind.
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
  hits (`ScanInput` in, `ScanResult` out). Absent: `substringLineMatch`. A
  strategy whose hits are only lines holding `query` may say so
  (`hitsHoldQuery: true`, as the shipped one does): with `max_hits`, a step
  whose sources hold no query is then not scanned again.

Both contracts and both shipped strategies are exported from
`@mcp-abap-adt/lib/embeddable`. On `getHandlerEntries()` and
`registerOnServer` the exporter's options apply, and an embedder's own
context is not a way to pass them (the exporter sets the context's fields
from its options). On `createRegistry()` the tools run in the contexts of the
server the registry is handed to: there the server's own `systemType`, resolver,
rules, logger and `sapAnswerStrategy` / `lineMatchStrategy` options apply, never the
exporter's.

## Reads per batch envelope

`readsPerEnvelope` (a whole number from 2, else the constructor throws) is
the consumer's bound on the reads one ADT batch envelope of a call carries,
where a tool reads several objects at once (`GetEnhancements`,
`SearchSource`, the package listings and walks, the function module group
checks): more go in consecutive envelopes of balanced size. Absent: no
bound — a phase's independent reads go in one envelope, and SAP's answer to
it is the answer. It applies as the strategies above do: the exporter's on
`getHandlerEntries()` and `registerOnServer`, the hosting server's
(`EmbeddableMcpServer`'s `readsPerEnvelope`) on `createRegistry()`.

## Logging

Pass a logger (`Logger` from `@mcp-abap-adt/logger`):

```typescript
const exporter = new HandlerExporter({ systemType: "onprem", logger });
```

The handlers `getHandlerEntries()` hands out run with it, over the logger of the context you
call them with (24.0.0); without one, your context's logger stays.

## See Also

- [Architecture Overview](README.md)
- [Tools Architecture](TOOLS_ARCHITECTURE.md)
- [Connection Isolation](CONNECTION_ISOLATION.md)
