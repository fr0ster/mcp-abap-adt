# mcp-abap-adt: Your Gateway to ABAP Development Tools (ADT)

[![smithery badge](https://smithery.ai/badge/@mario-andreschak/mcp-abap-adt)](https://smithery.ai/server/@mario-andreschak/mcp-abap-adt)

This project provides a server that allows you to interact with SAP ABAP systems using the Model Context Protocol (MCP). Think of it as a bridge that lets tools like [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) (a VS Code extension) talk to your ABAP system and retrieve information like source code, table structures, and more. It's like having a remote control for your ABAP development environment!

<a href="https://glama.ai/mcp/servers/gwkh12xlu7">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gwkh12xlu7/badge" alt="ABAP ADT MCP server" />
</a>

## Batch ABAP Object Type Detection Tools

Two tools are available for batch detection of ABAP object types:

- **DetectObjectTypeListArray**: Accepts an array of objects via the `objects` parameter.
- **DetectObjectTypeListJson**: Accepts a JSON payload with an `objects` array via the `payload` parameter.

See [doc/DetectObjectTypeListTools.md](doc/DetectObjectTypeListTools.md) for details and usage examples.

## 🆕 What's New in BTP Branch

### Centralized In-Memory Caching (July 2025)

- All handler modules now use a unified in-memory caching mechanism via `objectsListCache`. This allows for consistent, easily swappable cache logic across the codebase.
- The `filePath` parameter and all file write logic have been removed from all handlers. Results are no longer saved to disk from handler logic; only in-memory caching is used.
- This change improves maintainability, testability, and performance by eliminating redundant file operations and centralizing cache management.

This branch includes several powerful new features:

- **🔍 Enhancement Analysis Tools**: `GetEnhancements`, `GetEnhancementByName` - Comprehensive enhancement discovery and analysis
- **📋 Include Management**: `GetIncludesList` - Recursive include discovery and hierarchy mapping  
- **🚀 SAP BTP Support**: JWT/XSUAA authentication with browser-based token helper
- **💾 Freestyle SQL**: `GetSqlQuery` - Execute custom SQL queries via ADT Data Preview API
- **⚙️ Advanced Configuration**: Configurable timeouts, flexible .env loading, enhanced logging
- **🛠️ Developer Tools**: New testing utilities and improved error handling
- **🧩 Dependency Injection Ready**: Inject a preconfigured `AbapConnection` instance when constructing the MCP server to bypass global configuration/state during tests or advanced integrations.

> ℹ️ **ABAP Cloud limitation**: Direct ADT data preview of database tables (e.g. via `GetTableContents` or freestyle SQL) is blocked by SAP BTP backend policies. When you authenticate with JWT/XSUAA the server will now return a descriptive error rather than attempting the forbidden request. The same tools continue to work against on-premise systems that still allow datapreview.

This guide is designed for beginners, so we'll walk through everything step-by-step. We'll cover:

1.  **Prerequisites:** What you need before you start.
2.  **Installation and Setup:** Getting everything up and running.
3.  **Running the Server:** Starting the server in different modes.
4.  **Integrating with Cline:** Connecting this server to the Cline VS Code extension.
5.  **Troubleshooting:** Common problems and solutions.
6.  **Available Tools:** A list of the commands you can use.

## Testing

- Run `npm test` to execute the Jest suite. The configuration relies on `jest.setup.js` to disable automatic MCP server startup via `MCP_SKIP_AUTO_START`, preventing transport initialization during unit tests.
- Only files following the `*.test.[tj]s` naming pattern are collected, ensuring CLI helpers do not run as part of the Jest suite.
- Use `npm test -- --detectOpenHandles` when you need to track pending asynchronous resources after the tests finish.

## Developer Tools

The project includes utility scripts for maintaining tool definitions and documentation:

### Generate Tool Documentation

Automatically generate `doc/AVAILABLE_TOOLS.md` from all handler `TOOL_DEFINITION` exports:

```bash
npm run docs:tools
# or
node tools/generate-tools-docs.js [--help]
```

This scans all handlers, extracts tool definitions, and generates comprehensive documentation with descriptions, parameters, and examples.

### Update Handler Definitions

Check and help add `TOOL_DEFINITION` to handler files:

```bash
node tools/update-handlers-with-tool-definitions.js [--help]
```

**Note:** This is primarily for new handlers. All existing handlers already have `TOOL_DEFINITION`.

See [tools/README.md](tools/README.md) for complete documentation of all developer tools.

### HTTP Server Mode

- Build once with `npm run build`, then launch via `npm run start:http` to expose the MCP server over Streamable HTTP (`0.0.0.0:3000` by default).
- Override host/port and transport options directly: `node dist/index.js --transport streamable-http --http-port 4000 --http-host 127.0.0.1`.
- The helper script `node tools/run-http.js --http-port 4000 --http-json-response` forwards all `--http-*` flags and loads the expected `.env` file automatically.
- Set `MCP_TRANSPORT=streamable-http` (and optional `MCP_HTTP_*` variables) if you prefer configuring the mode via environment variables.

#### Debugging with MCP Inspector

- Run `npm run build`, then start `npm run dev:http -- --env=./e23.env --http-port 3000` (your flags pass straight through).
- The helper script `tools/dev-http.js` boots the MCP server with `DEBUG=true` and, after ~1.2 s, launches `@modelcontextprotocol/inspector` pointing at `http://localhost:<port>` with auth disabled.
- Closing the Inspector tab does not stop the server. Press `Ctrl+C` in the terminal to terminate both processes.
- Need a longer warm-up? Set `MCP_DEV_HTTP_INSPECTOR_DELAY=2000` (milliseconds) before running the command.

### SSE Mode

- Launch `npm run start:sse` or `node tools/run-sse.js --sse-port 4100` to expose the stream endpoints (GET `/mcp/events`, POST `/mcp/messages`).
- Pass any `--sse-*` switches on the CLI or through `MCP_SSE_*` environment variables (`MCP_TRANSPORT=sse`).
- Enable `--sse-enable-dns-protection` (or the matching ENV) when you need host/origin checks for untrusted clients.
- Only one SSE session is active at a time; additional connections receive HTTP 409 until the previous session ends.
- MCP Inspector does not expose an SSE test UI, so use Cline or a custom EventSource client when debugging this transport.

## Dependency Injection for ABAP Connections

Advanced runtimes or test harnesses can now inject a ready-made connection instead of relying on global environment variables.

```ts
import { mcp_abap_adt_server, setAbapConnectionOverride } from "@orchestraight.co/mcp-abap-adt";
import { createAbapConnection } from "./lib/connection/connectionFactory";

const connection = createAbapConnection({
  url: "https://my-system.example",
  authType: "basic",
  client: "100",
  username: process.env.SAP_USERNAME!,
  password: process.env.SAP_PASSWORD!,
});

const server = new mcp_abap_adt_server({ connection });

// Optional: swap connections at runtime
setAbapConnectionOverride(undefined); // fallback to env-configured factory
```

- `ServerOptions.connection` takes precedence over any `.env` or CLI configuration.
- Use `setAbapConnectionOverride(connection)` to swap implementations dynamically (e.g. for multi-tenant gateways).
- Call `cleanup()` when tests finish to release interceptors/caches that the connection might hold.

