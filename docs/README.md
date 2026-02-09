# Documentation

This directory contains all documentation for the `mcp-abap-adt` project, organized by audience.

## 📁 Structure

### [installation/](installation/) - For Administrators
Complete installation instructions for different platforms and environments.

- `INSTALLATION.md` - Main installation guide with quick links
- `platforms/` - Platform-specific installation guides
  - `INSTALL_WINDOWS.md` - Windows installation
  - `INSTALL_MACOS.md` - macOS installation
  - `INSTALL_LINUX.md` - Linux installation

### [user-guide/](user-guide/) - For Users
Documentation for end users: configuration, usage, and available tools.

- `CLIENT_CONFIGURATION.md` - How to configure MCP clients to connect to the server
- `AVAILABLE_TOOLS.md` - Complete list of available MCP tools and their descriptions
- `CLI_OPTIONS.md` - Complete command-line options reference

### [configuration/](configuration/) - Configuration Guides
Documentation for server configuration options.

- `YAML_CONFIG.md` - YAML configuration file guide (alternative to command-line arguments)

### [architecture/](architecture/) - For Developers
Technical documentation about the system architecture, design decisions, and internal structure.

- `TOOLS_ARCHITECTURE.md` - MCP tools architecture and handler structure
- `README.md` - Architecture documentation index

### [development/](development/) - For Developers
Documentation for developers: testing, development guides, and internal documentation.

- `ASSISTANT_GUIDELINES.md` - Guidelines for AI assistants working on this project
- `TEST_SYSTEM_SETUP.md` - Test system setup guide
- `DetectObjectTypeListTools.md` - Documentation for object type detection tools
- `tests/` - Test documentation and configuration
  - `TESTING_GUIDE.md` - Testing guide
  - `TEST_INFRASTRUCTURE.md` - Test infrastructure documentation
  - `ORGANIZATION.md` - Test organization
  - `test-config.yaml.template` - Test configuration template

## 🔗 Quick Links

- **Getting Started**: [Installation Guide](installation/INSTALLATION.md)
- **User Configuration**: [Client Configuration](user-guide/CLIENT_CONFIGURATION.md)
- **Server Configuration**: [YAML Config](configuration/YAML_CONFIG.md) | [CLI Options](user-guide/CLI_OPTIONS.md)
- **Deployment**: [MCP Registry](deployment/MCP_REGISTRY.md) | [Docker](deployment/DOCKER.md)
- **Client Configuration**: [Auto-Configure](installation/CLIENT_INSTALLERS.md)
- **Available Tools**: [Tools List](user-guide/AVAILABLE_TOOLS.md)
- **Architecture**: [Stateful Sessions](architecture/STATEFUL_SESSION_GUIDE.md) | [Architecture Docs](architecture/README.md)
- **Development**: [Development Documentation](development/)

## 📝 Package-Specific Documentation

Package-specific documentation is available in the respective npm packages:

- `@mcp-abap-adt/adt-clients` - ADT clients package documentation
- `@mcp-abap-adt/connection` - Connection package documentation
