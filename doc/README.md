# Documentation Index

This directory contains all documentation for the `mcp-abap-adt` project, organized by category.

## 📁 Directory Structure

### [installation/](installation/) - Installation Guides
Complete installation instructions for different platforms and environments.

- `INSTALLATION.md` - Main installation guide with quick links
- `platforms/` - Platform-specific installation guides
  - `INSTALL_WINDOWS.md` - Windows installation
  - `INSTALL_MACOS.md` - macOS installation
  - `INSTALL_LINUX.md` - Linux installation

### [user-guide/](user-guide/) - User Documentation
Documentation for end users: configuration, usage, and available tools.

- `CLIENT_CONFIGURATION.md` - How to configure MCP clients to connect to the server
- `AVAILABLE_TOOLS.md` - Complete list of available MCP tools and their descriptions

### [architecture/](architecture/) - Architecture Documentation
Technical documentation about the system architecture, design decisions, and internal structure.

- `STATEFUL_SESSION_GUIDE.md` - Stateful session management in SAP ADT API
- `TOOLS_ARCHITECTURE.md` - MCP tools architecture and handler structure
- `ADT_API_RESEARCH.md` - Research on ADT API endpoints and usage
- `HANDLERS_FORMAT_TABLE.md` - Handler format and table structure documentation

### [development/](development/) - Development Documentation
Documentation for developers: testing, development guides, and internal artifacts.

- `ASSISTANT_GUIDELINES.md` - Guidelines for AI assistants working on this project
- `CRUD_COVERAGE_ANALYSIS.md` - Analysis of CRUD operations coverage
- `TEST_SYSTEM_SETUP.md` - Test system setup guide
- `tests/` - Test documentation and configuration
  - `TESTING_GUIDE.md` - Testing guide
  - `TEST_INFRASTRUCTURE.md` - Test infrastructure documentation
  - `ORGANIZATION.md` - Test organization
  - `test-config.yaml.template` - Test configuration template
- `DetectObjectTypeListTools.md` - Documentation for object type detection tools
- `ABAP_PARSER.md` - ABAP parser documentation
- `ACTIVATION_ENDPOINT_UPDATE.md` - Activation endpoint updates
- `NAMESPACE_VERIFICATION_REPORT.md` - Namespace verification report
- `URI_AUTO_GENERATION.md` - URI auto-generation documentation

### [roadmap/](roadmap/) - Roadmaps and Planning
Future plans, roadmaps, and strategic documents.

*(Currently empty - roadmaps are maintained in package-specific locations)*

### [archive/](archive/) - Archived Documents
Deprecated or historical documents kept for reference.

- `mcp_domain_create.txt` - Historical example/log file
- `discovery.xml` - Historical discovery document

## 🔗 Quick Links

- **Getting Started**: [Installation Guide](installation/INSTALLATION.md)
- **User Configuration**: [Client Configuration](user-guide/CLIENT_CONFIGURATION.md)
- **Available Tools**: [Tools List](user-guide/AVAILABLE_TOOLS.md)
- **Architecture**: [Stateful Sessions](architecture/STATEFUL_SESSION_GUIDE.md)
- **Development**: [Development Documentation](development/)

## 📝 Package-Specific Documentation

Package-specific documentation is available in the respective npm packages:

- `@mcp-abap-adt/adt-clients` - ADT clients package documentation
- `@mcp-abap-adt/connection` - Connection package documentation

