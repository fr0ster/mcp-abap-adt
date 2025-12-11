# mcp-abap-adt: Your Gateway to ABAP Development Tools (ADT)

> **Acknowledgment**: This project was originally inspired by [mario-andreschak/mcp-abap-adt](https://github.com/mario-andreschak/mcp-abap-adt). We started with the core concept and then evolved it into an independent project with our own architecture and features.

This project provides a server that allows you to interact with SAP ABAP systems using the Model Context Protocol (MCP). Think of it as a bridge that lets tools like [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) (a VS Code extension) talk to your ABAP system and retrieve information like source code, table structures, and more.

## Quick Start

1. **Install**: See [Installation Guide](doc/installation/INSTALLATION.md)
2. **Configure**: See [Client Configuration](doc/user-guide/CLIENT_CONFIGURATION.md)
3. **Use**: See [Available Tools](doc/user-guide/AVAILABLE_TOOLS.md)

## Features

- **🏗️ Domain Management**: `GetDomain`, `CreateDomain`, `UpdateDomain` - Create, retrieve, and update ABAP domains
- **📊 Data Element Management**: `GetDataElement`, `CreateDataElement`, `UpdateDataElement` - Create, retrieve, and update ABAP data elements
- **📦 Table Management**: `GetTable`, `CreateTable`, `GetTableContents` - Create and retrieve ABAP database tables with data preview
- **🏛️ Structure Management**: `GetStructure`, `CreateStructure` - Create and retrieve ABAP structures
- **👁️ View Management**: `GetView`, `CreateView`, `UpdateView` - Create and manage CDS Views and Classic Views
- **🎓 Class Management**: `GetClass`, `CreateClass`, `UpdateClass` - Create, retrieve, and update ABAP classes
- **📝 Program Management**: `GetProgram`, `CreateProgram`, `UpdateProgram` - Create, retrieve, and update ABAP programs
- **🔧 Behavior Definition (BDEF) Management**: `GetBdef`, `CreateBehaviorDefinition`, `UpdateBehaviorDefinition` - Create and manage ABAP Behavior Definitions with support for Managed, Unmanaged, Abstract, and Projection types
- **📋 Metadata Extension (DDLX) Management**: `CreateMetadataExtension`, `UpdateMetadataExtension` - Create and manage ABAP Metadata Extensions
- **⚡ Activation**: `ActivateObject` - Universal activation for any ABAP object
- **🚚 Transport Management**: `CreateTransport`, `GetTransport` - Create and retrieve transport requests
- **🔍 Enhancement Analysis**: `GetEnhancements`, `GetEnhancementImpl`, `GetEnhancementSpot` - Enhancement discovery and analysis
- **📋 Include Management**: `GetIncludesList` - Recursive include discovery
- **🔍 System Tools**: `GetInactiveObjects` - Monitor inactive objects waiting for activation
- **🚀 SAP BTP Support**: JWT/XSUAA authentication with browser-based token helper
- **🔑 Destination-Based Authentication**: Service key-based authentication with automatic token management (see [Client Configuration](doc/user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication))
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

### Global Installation (Recommended)
After installing globally with `npm install -g`, you can run from any directory:

```bash
# Show help
mcp-abap-adt --help

# Default HTTP mode (works without .env file)
mcp-abap-adt

# HTTP mode on custom port
mcp-abap-adt --http-port=8080

# Use stdio mode (for MCP clients, requires .env file or --mcp parameter)
mcp-abap-adt --transport=stdio

# Use stdio mode with auth-broker (--mcp parameter)
mcp-abap-adt --transport=stdio --mcp=TRIAL

# Use custom .env file
mcp-abap-adt --env=/path/to/my.env

# SSE mode (requires .env file or --mcp parameter)
mcp-abap-adt --transport=sse --sse-port=3001

# SSE mode with auth-broker (--mcp parameter)
mcp-abap-adt --transport=sse --mcp=TRIAL
```

### Development Mode
```bash
# Build and run locally
npm run build
npm start

# HTTP mode
npm run start:http

# SSE mode
npm run start:sse
```

### Environment Configuration

The server automatically looks for `.env` file in this order:
1. Path specified via `--env` argument
2. `.env` in current working directory (where you run the command)
3. `.env` in package installation directory

**Example .env file:**
```bash
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
```

For JWT authentication (SAP BTP):
```bash
SAP_URL=https://your-btp-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=your-jwt-token
```

**Generate .env from Service Key (JWT):**
```bash
# Install the connection package globally (one-time setup)
npm install -g @mcp-abap-adt/connection

# Generate .env file from service key JSON
sap-abap-auth auth -k path/to/service-key.json
```

This will automatically create/update `.env` file with JWT tokens and connection details.

### Command-Line Options

**Authentication:**
- `--auth-broker` - Force use of auth-broker (service keys), ignore .env file
- `--auth-broker-path=<path>` - Custom path for auth-broker service keys and sessions
- `--unsafe` - Enable file-based session storage (persists tokens to disk). By default, sessions are stored in-memory (secure, lost on restart)

**Examples:**
```bash
# Use auth-broker with file-based session storage (persists tokens)
mcp-abap-adt --auth-broker --unsafe

# Use auth-broker with in-memory session storage (default, secure)
mcp-abap-adt --auth-broker

# Custom path for service keys and sessions
mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/ --unsafe
```

See [Client Configuration](doc/user-guide/CLIENT_CONFIGURATION.md) for complete configuration options.

### Handler logging switches
- `AUTH_LOG_LEVEL=error|warn|info|debug` — sets base log level for handler logger; `DEBUG_AUTH_LOG=true` also enables `debug`.
- `HANDLER_LOG_SILENT=true` — fully disables handler logging.
- `DEBUG_CONNECTORS=true` — verbose connection logging in high-level handlers.
- `DEBUG_HANDLERS=true` — enables verbose logs for selected read-only/system handlers.

## Development

### Testing
```bash
npm test
```

#### Test logging switches
- `TEST_LOG_LEVEL=error|warn|info|debug` — controls test logger verbosity (DEBUG_TESTS/DEBUG_ADT_TESTS/DEBUG_CONNECTORS force `debug`).
- `TEST_LOG_FILE=/tmp/adt-tests.log` — writes test logs to a file (best-effort).
- `TEST_LOG_SILENT=true` — disables test logging pipeline (console output muted).
- `TEST_LOG_COLOR=true` — adds colored/prefixed tags to test log lines.
- All `console.*` in tests are routed through the test logger with a `[test]` prefix.

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
