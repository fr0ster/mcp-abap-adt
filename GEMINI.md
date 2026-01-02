# mcp-abap-adt

## Project Overview
**mcp-abap-adt** is a Model Context Protocol (MCP) server that acts as a gateway to SAP ABAP systems using ABAP Development Tools (ADT). It enables AI assistants and other MCP clients to interact with SAP systems to retrieve source code, manage repository objects (classes, tables, CDS views, etc.), and perform system checks.

## Architecture & Tech Stack
*   **Language:** TypeScript (Node.js)
*   **Core Protocol:** Model Context Protocol (MCP)
*   **Key Libraries:**
    *   `@mcp-abap-adt/connection`: Handles authentication and sessions.
    *   `@mcp-abap-adt/adt-clients`: Provides builder-based clients for ADT requests.
*   **Transport Modes:**
    *   **Stdio:** Default, for CLI/local integration.
    *   **HTTP:** For remote access.
    *   **SSE:** Server-Sent Events for streaming updates.

## Communication & Language
*   **Communication:** Communication with the user is conducted in **Ukrainian**.
*   **Artifacts:** All technical artifacts, including code, comments, documentation, and commit messages, must be in **English**.

## Key Directories
*   `bin/`: Executable entry points for the CLI (`mcp-abap-adt.js`, lock management).
*   `src/`: Source code.
    *   `handlers/`: Implementations of MCP tool handlers (e.g., `CreateClass`, `GetTable`).
    *   `lib/`: Core logic, logging, and configuration utilities.
    *   `server/`: Server setup and transport configurations.
*   `docs/`: Extensive documentation (Architecture, User Guide, Installation).
*   `tools/`: Helper scripts for development and maintenance.

## Development & Usage

### Setup
1.  **Install Dependencies:** `npm install`
2.  **Configuration:** Create a `.env` file (see `.env.example`) with SAP system credentials.
    *   Supports Basic Auth and JWT (SAP BTP).
    *   Can use Service Keys via `sap-abap-auth`.

### Build & Run
*   **Build:** `npm run build` (Outputs to `dist/`)
*   **Run (Stdio):** `npm start` (or `node bin/mcp-abap-adt.js`)
*   **Run (HTTP):** `npm run start:http`
*   **Run (SSE):** `npm run start:sse`
*   **Test:** `npm test`

### Coding Conventions
*   **TypeScript:** Target ES2022, Node16 modules.
*   **Strict Mode:** Enabled (`strict: true`), though `noImplicitAny` is currently `false`.
*   **Logging:** Controlled via environment variables (e.g., `DEBUG_HANDLERS=true`, `HANDLER_LOG_SILENT=true`).
*   **Handler Pattern:** Handlers are modular and can be exported/embedded in other applications.

## Documentation
Refer to the `docs/` directory for detailed guides:
*   `docs/architecture/`: Deep dive into system design.
*   `docs/development/`: Guides for contributing and testing.
