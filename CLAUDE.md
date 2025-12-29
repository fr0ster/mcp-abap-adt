# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mcp-abap-adt** is an MCP (Model Context Protocol) server for SAP ABAP ADT (ABAP Development Tools). It serves as a bridge allowing LLM tools like Cline to interact with SAP ABAP systems - retrieving source code, table structures, and performing CRUD operations on ABAP objects.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build (includes biome linting + TypeScript)
npm run build

# Build without lint check (faster)
npm run build:fast

# Run all tests
npm test

# Run specific test categories
npm run test:integration      # Integration tests only
npm run test:high            # High-level handler tests
npm run test:low             # Low-level handler tests

# Lint and format
npm run lint                 # Biome check with auto-fix
npm run lint:check           # Biome check (read-only)
npm run format               # Format with biome

# Development servers
npm run dev                  # Build + run with MCP Inspector (stdio)
npm run dev:http             # Build + run HTTP dev server
npm run dev:sse              # Build + run SSE dev server

# Production modes
npm start                    # Run server (HTTP default)
npm run start:http           # HTTP mode
npm run start:sse            # SSE mode
```

## Architecture

### Server Patterns

The project supports two usage patterns:

1. **Standalone MCP Server** - Run via CLI with stdio, HTTP, or SSE transport
2. **Handler Exporter** - Embed handlers into existing servers (e.g., SAP CAP/CDS):
   ```typescript
   import { HandlerExporter } from '@fr0ster/mcp-abap-adt/handlers';
   const exporter = new HandlerExporter();
   exporter.registerOnServer(mcpServer, () => getConnection());
   ```

### Key Source Directories

- `src/handlers/` - MCP tool handlers organized by ABAP object type (class, program, table, etc.)
- `src/server/` - Server implementations (launcher.ts, BaseMcpServer, StdioServer, StreamableHttpServer, SseServer)
- `src/lib/` - Core libraries (config, auth, handlers registry, stores, types, utils)

### Handler Structure

Each handler type (e.g., `src/handlers/class/`) has subdirectories:
- `high/` - High-level handlers (create, update, delete)
- `low/` - Low-level ADT handlers
- `readonly/` - Read operations (get)
- `common/` - Shared operations (activate, lock, validate)

Each handler exports a `TOOL_DEFINITION` with name, description, and schema.

### Handler Groups (DI)

Handlers are organized into groups registered via `CompositeHandlersRegistry`:
- **ReadOnlyHandlersGroup** - Get operations
- **HighLevelHandlersGroup** - Create, update, delete
- **LowLevelHandlersGroup** - Low-level ADT operations
- **SystemHandlersGroup** - System info (inactive objects)
- **SearchHandlersGroup** - Where-used, quick fix

### Connection Types

- **JwtAbapConnection** - SAP BTP Cloud (JWT/XSUAA auth)
- **OnPremAbapConnection** - On-premise (Basic auth, OAuth2)
- **BaseAbapConnection** - Common base functionality

## Key Packages

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `@mcp-abap-adt/adt-clients` - Builder-based ADT clients
- `@mcp-abap-adt/connection` - Connection layer
- `@mcp-abap-adt/auth-broker` - OAuth2/XSUAA token management

## Testing

Tests use Jest with YAML-based configuration (`test-config.yaml`). Test timeout is 10 minutes due to SAP system latency.

```bash
# Environment variables for test logging
TEST_LOG_LEVEL=error|warn|info|debug
TEST_LOG_SILENT=true              # Disable test logs
DEBUG_HANDLERS=true               # Verbose handler logs
```

## Configuration

Configuration precedence: CLI args → Environment variables → .env file → YAML config → Defaults

Key environment variables:
```bash
SAP_URL=<system-url>
SAP_CLIENT=100
SAP_AUTH_TYPE=basic|jwt
SAP_USERNAME=<user>              # For basic auth
SAP_PASSWORD=<pass>
SAP_JWT_TOKEN=<token>            # For JWT auth
```

## Language Requirements

- **Repository artifacts** (code, comments, documentation, commit messages): English only
- **Communication with user**: Ukrainian

## Fundamental Rules

From `.clinerules/`:
- **No assumptions about object existence** unless explicitly present in retrieved code or listed by GetIncludesList
- **No reliance on unspecified standards** unless explicitly specified
- **Context over abstract standards** - user's context overrides abstract standards
- **Evidence-based analysis** - all statements must reference real code artifacts
