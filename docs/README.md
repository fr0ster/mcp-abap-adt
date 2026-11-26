# Documentation

This directory contains all documentation for the `mcp-abap-adt` project, organized by audience.

## Features, and where each is described

- **Read and analyse**: where-used, object and source search, every object's source and metadata, outlines, versions and diffs — [Read-only tools](user-guide/AVAILABLE_TOOLS_READONLY.md)
- **Develop and change**: create, update, delete, check and activate the ABAP, DDIC, CDS and RAP objects — [High-level tools](user-guide/AVAILABLE_TOOLS_HIGH.md)
- **Test and quality**: ATC runs and results, ABAP Unit per class, program, function group, CDS view or package — [ATC](user-guide/AVAILABLE_TOOLS.md#high-level-atc), [Unit tests](user-guide/AVAILABLE_TOOLS.md#high-level-unit-test)
- **Transports**: requests and tasks, their objects and logs, moving objects — [Transport tools](user-guide/AVAILABLE_TOOLS.md#high-level-transport)
- **Debugger**: ABAP and AMDP debug sessions in the write binaries — [Debugger](user-guide/DEBUGGER.md)
- **abapGit** (new in 24.2.0): link, pull, stage and push a package with a git host, full and compact — [abapGit](../README.md#abapgit-the-git-loop-on-a-package)
- **Access restrictions**: deny tools, allow only listed packages, requests or tables; draft detection — [Access restrictions](user-guide/ACCESS_RESTRICTIONS.md)
- **Read-only and compact binaries**: the twelve binaries and the tools each serves — [Handler sets](user-guide/HANDLERS_MANAGEMENT.md), [Compact tools](../compact/docs/AVAILABLE_TOOLS.md)
- **MCP prompts** (new in 24.2.0): nine slash-command prompts per binary and kind — [Prompts](user-guide/PROMPTS.md)
- **Batch mode**: independent calls sent to SAP together (compact binaries) — [Batch Mode](user-guide/BATCH_MODE.md)
- **Background long reads**: a handle at once, the result read or cancelled later — [Background runs](user-guide/README.md#background-runs-of-the-long-reads)
- **Terse answers** (new in 24.2.0): TSV for a list, every row answered; `detail` (`terse`, `medium`, `full`, `raw`) chooses the reading — [Answers](../README.md#answers)
- **Tool search**: keywords and semantic texts per tool — [Tool Search](user-guide/TOOL_SEARCH.md)
- **Long session over Streamable HTTP**: one SAP session across calls by `state_handle` — [`@mcp-abap-adt/http`](../http/README.md#held-state-and-the-long-session)
- **Data tools, off by default**: freestyle SQL and table preview only with `--enable-data-tools` — [The data tools](../README.md#the-data-tools-off-unless-enabled)
- **Authentication**: basic, SNC, JWT with browser login; destinations — [Authentication](user-guide/AUTHENTICATION.md)

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
- `AUTHENTICATION.md` - The three stdio authentications, destinations, service key locations, the HTTP/SSE headers, what a client sees when a call fails, and the abapGit remotes' credentials (approved endpoints, any git host over HTTPS)
- Configurator (auto-config): `@mcp-abap-adt/configurator` (repo: `mcp-abap-adt-conf`)
- `AVAILABLE_TOOLS.md` - Complete list of available MCP tools and their descriptions
- `CLI_OPTIONS.md` - Complete command-line options reference
- `BATCH_MODE.md` - Batch mode (the compact binaries' `HandlerBatch`): independent calls recorded, sent together at the batch's end, answered by number; which calls are recorded
- `PROMPTS.md` - The MCP prompts (`create`, `get`, `update`, `delete`, `activate`, `check`, `unit_test`, `where_used`, `transport`) per binary and kind, their `object_type` values, how a client shows them, the refusal (generated)
- `ACCESS_RESTRICTIONS.md` - Access restrictions: denied actions, allowed packages, requests and tables, the refusals, and `GetObjectDraft`
- `HANDLERS_MANAGEMENT.md` - The twelve binaries and the tools each serves
- `TOOL_SEARCH.md` - Tool search: the three texts per tool (`description`, `keywords` for BM25, `semantic` for vectors), where a client reads them
- `DEBUGGER.md` - The debugger (the write binaries; no `-ro` one): debug sessions and their handle, the SAP ids, transports, what ends a session
- abapGit - the git loop on a package (link, pull, stage, push, branches, checks, the run log), full and compact, per system: the tools in the [README](../README.md#abapgit-the-git-loop-on-a-package), the git credentials and approved endpoints per transport in `AUTHENTICATION.md` and `CLI_OPTIONS.md`, the link and pull refusal under restrictions in `ACCESS_RESTRICTIONS.md`

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
- `SYSTEM_DESCRIPTION.md` - What S/4HANA 2025, ABAP cloud and SAP_BASIS 7.40 answer to Eclipse's logon requests, measured from the corpus
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
- **Upgrading from 23.x**: [Migration to 24.0](MIGRATION-24.0.md)
- **Upgrading from 22.x**: [Migration to 23.0](MIGRATION-23.0.md)
- **Upgrading from 21.x**: [Migration to 22.0](MIGRATION-22.0.md)
- **Upgrading from 19.x**: [Migration to 20.0](MIGRATION-20.0.md)
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
