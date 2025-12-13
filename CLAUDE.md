# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mcp-abap-adt** is a Model Context Protocol (MCP) server that provides a bridge between LLM tools (like Cline VS Code extension) and SAP ABAP systems via ABAP Development Tools (ADT) API. It enables AI assistants to interact with SAP systems - retrieving source code, creating/updating ABAP objects, managing transports, and more.

## Build & Development Commands

```bash
# Build TypeScript
npm run build

# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run high-level handler integration tests
npm run test:high

# Run low-level handler integration tests
npm run test:low

# Type-check tests without running
npm run test:check

# Run a single test file
npx jest path/to/test.ts --passWithNoTests

# Generate tool documentation
npm run docs:tools

# Start server (HTTP mode - default)
npm start
npm run start:http

# Start server (SSE mode)
npm run start:sse

# Development with MCP Inspector
npm run dev
```

## Architecture

### Handler Organization

Handlers are the core API implementation, organized under `src/handlers/` by ABAP object type:

```
src/handlers/
├── class/           # ABAP class handlers
├── program/         # ABAP program handlers
├── interface/       # ABAP interface handlers
├── function/        # Function group/module handlers
├── table/           # Database table handlers
├── structure/       # Structure handlers
├── view/            # CDS view handlers
├── domain/          # Domain handlers
├── data_element/    # Data element handlers
├── behavior_definition/  # BDEF handlers
├── ddlx/            # Metadata extension handlers
├── package/         # Package handlers
├── transport/       # Transport request handlers
├── common/          # Generic handlers (activate, delete, lock, unlock, check, validate)
├── system/          # System info handlers (GetTypeInfo, GetInactiveObjects, etc.)
├── search/          # Search/query handlers
├── include/         # Include handlers
└── enhancement/     # Enhancement handlers
```

Each object type has subdirectories:
- `readonly/` - Read-only operations (Get*)
- `low/` - Low-level CRUD operations (Lock, Unlock, Create, Update, Delete, Check, Validate, Activate)
- `high/` - High-level operations that orchestrate low-level operations with full workflow

### Handler Pattern

Each handler exports a `TOOL_DEFINITION` constant and a handler function:

```typescript
export const TOOL_DEFINITION = {
  name: "CreateClass",
  description: "Create a new ABAP class...",
  inputSchema: {
    type: "object",
    properties: { /* ... */ },
    required: ["class_name", "package_name"]
  }
} as const;

export async function handleCreateClass(params: CreateClassArgs) {
  // Implementation
}
```

### Tool Registry

`src/lib/toolsRegistry.ts` aggregates all `TOOL_DEFINITION` exports into `ALL_TOOLS` array. When adding a new handler:
1. Create handler file with `TOOL_DEFINITION` and handler function
2. Import and add to `ALL_TOOLS` in `toolsRegistry.ts`
3. Add case to `CallToolRequestSchema` handler in `index.ts`
4. Run `npm run docs:tools` to regenerate documentation

### Connection Management

- `src/lib/utils.ts` - Core connection management (`getManagedConnection()`, `makeAdtRequest()`)
- `src/lib/clients.ts` - ADT client factories (`getReadOnlyClient()`, `getCrudClient()`)
- Connection types: `CloudAbapConnection` (JWT/BTP), `OnPremAbapConnection` (basic auth)
- External packages: `@mcp-abap-adt/connection`, `@mcp-abap-adt/adt-clients`

### High-Level Handler Workflow

High-level handlers (in `high/` directories) typically follow this workflow:
```
validate -> create -> lock -> check -> update -> unlock -> check(inactive) -> activate
```

They use `createAbapConnection()` to create isolated connections and `CrudClient` for operations.

## Testing

Tests are located in `src/__tests__/`:
- `handlers.test.ts`, `index.test.ts`, `utils.test.ts` - Unit tests
- `integration/` - Integration tests requiring SAP system connection

Integration test structure:
```
src/__tests__/integration/
├── helpers/           # Test utilities (testHelpers.ts, configHelpers.ts, etc.)
├── class/             # Class handler tests
├── domain/            # Domain handler tests
├── dataElement/       # Data element handler tests
└── ...                # Other object type tests
```

### Test Environment Variables

```bash
# Enable debug logging for tests
DEBUG_TESTS=true
DEBUG_ADT_TESTS=true
DEBUG_CONNECTORS=true
DEBUG_HANDLERS=true

# Test logger configuration
TEST_LOG_LEVEL=debug     # error|warn|info|debug
TEST_LOG_FILE=/path/to/log
TEST_LOG_SILENT=true     # Disable test logging
TEST_LOG_COLOR=true      # Colored output
```

### Running Integration Tests

Integration tests require SAP system connection. Configure via `.env` file or environment variables:
```bash
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=basic  # or jwt for BTP
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
```

## Code Standards

- All code, comments, error messages, and documentation must be in English
- Comments should explain "why" not "what"
- Handlers return structured results via `return_response()` and `return_error()` from `src/lib/utils.ts`
- Use centralized caching via `objectsListCache` where appropriate
- Transport request validation: Use `validateTransportRequest()` for transportable packages

## Key Files

- `src/index.ts` - Main MCP server entry point and request routing (large file - use search/grep)
- `src/lib/toolsRegistry.ts` - Central tool registration
- `src/lib/utils.ts` - Connection management, error handling utilities
- `src/lib/clients.ts` - ADT client factories
- `bin/mcp-abap-adt.js` - CLI entry point
