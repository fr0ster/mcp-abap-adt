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

This guide is designed for beginners, so we'll walk through everything step-by-step. We'll cover:

1.  **Prerequisites:** What you need before you start.
2.  **Installation and Setup:** Getting everything up and running.
3.  **Running the Server:** Starting the server in different modes.
4.  **Integrating with Cline:** Connecting this server to the Cline VS Code extension.
5.  **Troubleshooting:** Common problems and solutions.
6.  **Available Tools:** A list of the commands you can use.

### HTTP Server Mode

- Build once with `npm run build`, then launch via `npm run start:http` to expose the MCP server over Streamable HTTP (`0.0.0.0:3000` by default).
- Override host/port and transport options directly: `node dist/index.js --transport streamable-http --http-port 4000 --http-host 127.0.0.1`.
- The helper script `node tools/run-http.js --http-port 4000 --http-json-response` forwards all `--http-*` flags and loads the expected `.env` file automatically.
- Set `MCP_TRANSPORT=streamable-http` (and optional `MCP_HTTP_*` variables) if you prefer configuring the mode via environment variables.

### SSE Mode

- Запускай за потреби `npm run start:sse` або `node tools/run-sse.js --sse-port 4100`, щоб відкрити Stream-SSE підключення (GET `/mcp/events` + POST `/mcp/messages`).
- Усі ключі `--sse-*` можна передавати через CLI або задати через змінні оточення `MCP_SSE_*` (`MCP_TRANSPORT=sse`).
- Для клієнтів, що потребують захисту, активуй `--sse-enable-dns-protection` чи відповідний ENV, щоб перевіряти заголовки `Host` та `Origin`.
- Рівно одна активна SSE-сесія підтримується одночасно; нові підключення отримають HTTP 409, доки попереднє не закрито.

[...Оригінальний зміст README.md без змін...]
