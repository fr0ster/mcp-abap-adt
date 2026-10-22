# Documentation

This directory contains all documentation for the `mcp-abap-adt` project, organized by audience.

## 📁 Structure

### [installation/](installation/) - For Administrators
Complete installation instructions for different platforms and environments.

- `INSTALLATION.md` - Main installation guide: the installation variants (full or compact server; HTTP, RFC or SNC) and the commands for each
- `RFC_SETUP.md` - RFC and SNC: the SAP NW RFC library at run time, the prebuilt RFC module and where to build one
- `platforms/` - Platform-specific installation guides
  - `INSTALL_WINDOWS.md` - Windows installation
  - `INSTALL_MACOS.md` - macOS installation
  - `INSTALL_LINUX.md` - Linux installation

### [user-guide/](user-guide/) - For Users
Documentation for end users: configuration, usage, and available tools.

- `CLIENT_CONFIGURATION.md` - How to configure MCP clients to connect to the server
- `AUTHENTICATION.md` - The three stdio authentications, destinations, service key locations, the HTTP/SSE headers, and what a client sees when a call fails
- Configurator (auto-config): `@mcp-abap-adt/configurator` (repo: `mcp-abap-adt-conf`)
- `AVAILABLE_TOOLS.md` - Complete list of available MCP tools and their descriptions
- `CLI_OPTIONS.md` - Complete command-line options reference
- `BATCH_MODE.md` - Batch mode: independent calls recorded, sent together at `BatchEnd`, answered by number; which calls are recorded
- `TOOL_SEARCH.md` - Tool search: the three texts per tool (`description`, `keywords` for BM25, `semantic` for vectors), where a client reads them
- `DEBUGGER.md` - The debugger (the write binaries; no `-ro` one): debug sessions and their handle, the SAP ids, transports, what ends a session

### [configuration/](configuration/) - Configuration Guides
Documentation for server configuration options.

- `YAML_CONFIG.md` - YAML configuration file guide (alternative to command-line arguments)

### [deployment/](deployment/) - Deployment & Releases
Documentation for deployment, Docker, and release flow.

- `README.md` - Deployment docs index
- `MCP_REGISTRY.md` - MCP Registry publishing
- `DOCKER.md` - Docker deployment guide
- `RELEASE.md` - Release process

### [architecture/](architecture/) - For Developers
Technical documentation about the system architecture, design decisions, and internal structure.

- `TOOLS_ARCHITECTURE.md` - MCP tools architecture and handler structure
- `REQUEST_HEADERS.md` - The request header pairs the server sends, its one-shot `406`/`415` correction kept per system, and `@mcp-abap-adt/lib/adt-headers` for embedders
- `README.md` - Architecture documentation index

### [development/](development/) - For Developers
Documentation for developers: testing, development guides, and internal documentation.

- `ASSISTANT_GUIDELINES.md` - Guidelines for AI assistants working on this project
- `TEST_SYSTEM_SETUP.md` - Test system setup guide
- `tests/` - Test documentation and configuration
  - `TESTING_GUIDE.md` - Testing guide
  - `TEST_INFRASTRUCTURE.md` - Test infrastructure documentation
  - `ORGANIZATION.md` - Test organization
  - `test-config.yaml.template` - Test configuration template

## 🔗 Quick Links

- **Getting Started**: [Installation Guide](installation/INSTALLATION.md)
- **User Configuration**: [Client Configuration](user-guide/CLIENT_CONFIGURATION.md)
- **Authentication**: [Destinations & Auth](user-guide/AUTHENTICATION.md)
- **Installation variants** (full or compact; HTTP, RFC or SNC): [Installation Guide](installation/INSTALLATION.md#installation-variants) | [RFC Setup](installation/RFC_SETUP.md)
- **Upgrading from 18.x**: [Migration to 19.0](MIGRATION-19.0.md)
- **Upgrading from 17.x**: [Migration to 18.0](MIGRATION-18.0.md)
- **Upgrading from 16.x**: [Migration to 17.0](MIGRATION-17.0.md)
- **Upgrading from 15.x**: [Migration to 16.0](MIGRATION-16.0.md)
- **Terminology**: [Project Terms](user-guide/TERMINOLOGY.md)
- **Handlers Management**: [Handler Groups](user-guide/HANDLERS_MANAGEMENT.md)
- **Batch mode**: [Batch Mode](user-guide/BATCH_MODE.md)
- **Tool search**: [Tool Search](user-guide/TOOL_SEARCH.md)
- **Debugger**: [Debug Sessions](user-guide/DEBUGGER.md)
- **Server Configuration**: [YAML Config](configuration/YAML_CONFIG.md) | [CLI Options](user-guide/CLI_OPTIONS.md)
- **Deployment**: [MCP Registry](deployment/MCP_REGISTRY.md) | [Docker](deployment/DOCKER.md)
- **Available Tools**: [Tools List](user-guide/AVAILABLE_TOOLS.md)
- **Architecture**: [Stateful Sessions](architecture/STATEFUL_SESSION_GUIDE.md) | [Architecture Docs](architecture/README.md)
- **Development**: [Development Documentation](development/)

## 📦 Artifacts

- `adt-discovery.xml` - ADT discovery snapshot
- `discovery.json` - ADT discovery JSON snapshot

## 📝 Package-Specific Documentation

Package-specific documentation is available in the respective npm packages:

- `@mcp-abap-adt/adt-clients` - ADT clients package documentation
- `@mcp-abap-adt/connection` - Connection package documentation
