# mcp-abap-adt: Your Gateway to ABAP Development Tools (ADT)

> **Acknowledgment**: This project was originally inspired by [mario-andreschak/mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt). We started with the core concept and then evolved it into an independent project with our own architecture and features.

This project provides a server that allows you to interact with SAP ABAP systems using the Model Context Protocol (MCP). Think of it as a bridge that lets tools like [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) (a VS Code extension) talk to your ABAP system and retrieve information like source code, table structures, and more.

<a href="https://glama.ai/mcp/servers/gwkh12xlu7">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gwkh12xlu7/badge" alt="ABAP ADT MCP server" />
</a>

## Quick Start

1. **Install**: See [Installation Guide](doc/installation/INSTALLATION.md)
2. **Configure**: See [Client Configuration](doc/user-guide/CLIENT_CONFIGURATION.md)
3. **Use**: See [Available Tools](doc/user-guide/AVAILABLE_TOOLS.md)

## Features

- **🏗️ Domain Management**: `GetDomain`, `CreateDomain` - Create and manage ABAP domains
- **📊 Data Element Management**: `GetDataElement`, `CreateDataElement` - Create and retrieve ABAP data elements
- **📦 Table Management**: `GetTable`, `CreateTable` - Create and retrieve ABAP database tables
- **🏛️ Structure Management**: `GetStructure`, `CreateStructure` - Create and retrieve ABAP structures
- **👁️ View Management**: `GetView`, `CreateView` - Create CDS Views and Classic Views
- **🎓 Class Management**: `GetClass`, `CreateClass` - Create and retrieve ABAP classes
- **📝 Program Management**: `GetProgram`, `CreateProgram` - Create and retrieve ABAP programs
- **⚡ Activation**: `ActivateObject` - Universal activation for any ABAP object
- **🚚 Transport Management**: `CreateTransport`, `GetTransport` - Create and retrieve transport requests
- **🔍 Enhancement Analysis**: `GetEnhancements`, `GetEnhancementByName` - Enhancement discovery
- **📋 Include Management**: `GetIncludesList` - Recursive include discovery
- **🚀 SAP BTP Support**: JWT/XSUAA authentication with browser-based token helper
- **💾 Freestyle SQL**: `GetSqlQuery` - Execute custom SQL queries via ADT Data Preview API

> ℹ️ **ABAP Cloud limitation**: Direct ADT data preview of database tables is blocked by SAP BTP backend policies. The server returns a descriptive error when attempting such operations. On-premise systems continue to support data preview.

## Documentation

### For Users
- **[Installation Guide](doc/installation/INSTALLATION.md)** - Installation instructions for all platforms
- **[Client Configuration](doc/user-guide/CLIENT_CONFIGURATION.md)** - How to configure MCP clients
- **[Available Tools](doc/user-guide/AVAILABLE_TOOLS.md)** - Complete list of available MCP tools

### For Administrators
- **[Installation Guide](doc/installation/INSTALLATION.md)** - Platform-specific installation guides

### For Developers
- **[Architecture Documentation](doc/architecture/)** - System architecture and design decisions
- **[Development Documentation](doc/development/)** - Testing guides and development resources
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes

## Dependencies

This project uses two npm packages:

- **[@mcp-abap-adt/connection](https://www.npmjs.com/package/@mcp-abap-adt/connection)** – connection/auth/session layer
- **[@mcp-abap-adt/adt-clients](https://www.npmjs.com/package/@mcp-abap-adt/adt-clients)** – Builder-first ADT clients

These packages are automatically installed via `npm install` and are published to npm.

## Running the Server

### Standard Mode (stdio)
```bash
npm run build
npm start
```

### HTTP Mode
```bash
npm run build
npm run start:http
```

### SSE Mode
```bash
npm run build
npm run start:sse
```

See [Client Configuration](doc/user-guide/CLIENT_CONFIGURATION.md) for details on configuring MCP clients.

## Development

### Testing
```bash
npm test
```

### Building
```bash
npm run build
```

### Developer Tools
```bash
# Generate tool documentation
npm run docs:tools

# See tools/README.md for more developer utilities
```

## Contributors

Thank you to all contributors! See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the complete list.
