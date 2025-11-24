# Changelog

## [Unreleased]

## [1.1.8] - 2025-11-24

### Added
- **DDLX (Metadata Extension) Management Tools**:
  - `CreateMetadataExtension`: Create new ABAP Metadata Extensions (DDLX) with automatic activation
  - `UpdateMetadataExtension`: Update source code of existing Metadata Extensions
  - Full CRUD workflow: Create → Lock → Check → Unlock → Activate
  - Support for transport request validation
  - Integrated with CrudClient API for consistent behavior

- **BDEF (Behavior Definition) Management Tools**:
  - `CreateBehaviorDefinition`: Create new ABAP Behavior Definitions (BDEF) with support for Managed, Unmanaged, Abstract, and Projection implementation types
  - `UpdateBehaviorDefinition`: Update source code of existing Behavior Definitions
  - Full CRUD workflow: Create → Lock → Check → Unlock → Activate
  - Support for root entity specification and implementation type selection
  - Transport request validation integrated

- **System Management Tools**:
  - `GetInactiveObjects`: Retrieve list of inactive ABAP objects (objects that have been modified but not activated)
  - Provides count and detailed list of objects waiting for activation
  - Useful for monitoring development progress and identifying objects requiring attention

### Changed
- **Handler Organization Refactoring**: All handlers reorganized into categorized subdirectories for better maintainability:
  - `bdef/` - Behavior Definition handlers (GetBdef, CreateBehaviorDefinition, UpdateBehaviorDefinition)
  - `class/` - Class handlers (GetClass, CreateClass, UpdateClass, ValidateClass, CheckClass)
  - `common/` - Common handlers (ActivateObject, DeleteObject, CheckObject, LockObject, UnlockObject, ValidateObject)
  - `data_element/` - Data Element handlers (GetDataElement, CreateDataElement, UpdateDataElement)
  - `ddlx/` - Metadata Extension handlers (CreateMetadataExtension, UpdateMetadataExtension)
  - `domain/` - Domain handlers (GetDomain, CreateDomain, UpdateDomain)
  - `enhancement/` - Enhancement handlers (GetEnhancements, GetEnhancementImpl, GetEnhancementSpot)
  - `function/` - Function handlers (GetFunction, GetFunctionGroup, CreateFunctionGroup, CreateFunctionModule, UpdateFunctionModule, ValidateFunctionModule, CheckFunctionModule)
  - `include/` - Include handlers (GetInclude, GetIncludesList)
  - `interface/` - Interface handlers (GetInterface, CreateInterface, UpdateInterface)
  - `package/` - Package handlers (GetPackage, CreatePackage)
  - `program/` - Program handlers (GetProgram, CreateProgram, UpdateProgram)
  - `search/` - Search handlers (SearchObject, GetObjectsByType, GetObjectsList)
  - `structure/` - Structure handlers (GetStructure, CreateStructure)
  - `system/` - System handlers (GetTypeInfo, GetTransaction, GetSqlQuery, GetWhereUsed, GetObjectInfo, GetSession, GetAbapAST, GetAbapSemanticAnalysis, GetAbapSystemSymbols, GetAllTypes, GetObjectStructure, GetObjectNodeFromCache, GetInactiveObjects)
  - `table/` - Table handlers (GetTable, GetTableContents, CreateTable, ValidateTable, CheckTable)
  - `transport/` - Transport handlers (GetTransport, CreateTransport)
  - `view/` - View handlers (GetView, CreateView, UpdateView)
  - This reorganization improves code navigation, reduces merge conflicts, and makes the codebase more maintainable

- **Dependencies Updated**:
  - `@mcp-abap-adt/adt-clients`: ^0.1.9 → ^0.1.12
  - `@mcp-abap-adt/connection`: ^0.1.4 → ^0.1.9
  - Updated to leverage new CrudClient methods for DDLX and BDEF operations

- **Index and Tools Registry Updates**:
  - `src/index.ts`: Updated all handler imports to reflect new subdirectory structure
  - `src/lib/toolsRegistry.ts`: Updated tool definitions imports to match new handler locations
  - All 81 handler files moved and imports updated consistently

### Documentation
- Added `implementation_plan.md`: Plan for future refactoring of read handlers to `src/readers` directory
- Added `roadmap.md`: Roadmap for implementing missing handlers and extending generic handlers to support new object types

## [1.1.6] - 2025-11-21

### Documentation
- **Comprehensive CLI documentation**: Added detailed documentation for all command line options and configuration
  - Updated README.md with global installation guide and CLI usage examples
  - Enhanced INSTALLATION.md with complete CLI options reference
  - Created new CLI_OPTIONS.md with comprehensive command line reference
  - Documented environment file priority and auto-discovery behavior
  - Added troubleshooting section for common CLI issues

## [1.1.5] - 2025-11-21

### Added
- **--help flag**: Added comprehensive help message showing all CLI options, environment variables, and usage examples
  - Shows transport options (stdio, http, sse)
  - Lists all HTTP and SSE configuration options
  - Documents SAP connection environment variables
  - Includes practical usage examples

### Fixed
- **Global installation .env loading**: Fixed .env file discovery for globally installed packages
  - Now correctly prioritizes `process.cwd()/.env` (user's working directory) over package directory
  - Works correctly when installed via `npm install -g`
  - Better error messages showing current directory and suggesting --env flag
- **--env argument parsing**: Fixed custom .env file path support
  - Both `--env=/path/to/.env` and `--env /path/to/.env` formats now work correctly
  - Relative paths are resolved from current working directory
  - Clear feedback messages showing which .env file is being used
- **Runtime dependencies**: Moved `dotenv` from devDependencies to dependencies
  - Fixes "Cannot find module 'dotenv'" error when installed globally
  - Ensures all runtime dependencies are available in production

### Changed
- **All handlers refactored to use CrudClient** – replaced Builder pattern with unified CrudClient API
  - **18 handlers converted**: Create (Program, DataElement, Domain, FunctionGroup, FunctionModule, Package, Structure, Table, Transport, View), Update (ClassSource, DataElement, InterfaceSource), Check (Class, FunctionModule, Table, Object), Validate (Class, Object), Lock/Unlock (Object)
  - Removed direct Builder instantiation from all handlers
  - All CRUD operations now use CrudClient methods (createProgram, lockClass, updateInterface, etc.)
  - Session ID no longer exposed - internal to CrudClient implementation
  - Simplified error handling with try-catch around lock/update/unlock sequences

### Fixed
- **utils.ts deprecated methods** – added TODO comments for missing ReadOnlyClient methods
  - `fetchNodeStructure()` - marked for future implementation
  - `getSystemInformation()` - marked for future implementation
  - Both throw errors with clear TODO messages instead of attempting non-existent method calls

## [1.1.3] - 2025-11-21

### Added
- **Parameter Optionality Sync Tool**: Created `tools/sync-optional-from-interfaces.js` to extract optional parameter information from TypeScript interfaces
  - Extracts required vs optional fields from `@mcp-abap-adt/adt-clients` builder interfaces
  - Provides single source of truth for parameter optionality
  - Prevents drift between TypeScript interfaces and MCP tool definitions
  - Documentation added in `doc/development/SYNC_OPTIONAL_PARAMS.md`

### Changed
- **CreateDomain Handler**: Synced parameter optionality with `DomainBuilderConfig` interface
  - Only `domain_name` is required (was incorrectly requiring `package_name`)
  - Marked all optional parameters with `(optional)` prefix in descriptions
  - Ensures consistency with TypeScript interface definitions

## [1.1.2] - 2025-11-21

### Fixed
- **STDIO Transport**: Fixed STDIO transport broken by mixing old `Server` and new `McpServer` APIs
  - Removed legacy `Server` class and `setupHandlers()` method
  - Unified all transports (STDIO, HTTP, SSE) to use single `McpServer` instance
  - Fixed STDIO connection to use `mcpServer.server.connect(transport)` pattern
  - Removed unused imports: `Server`, `CallToolRequestSchema`, `ListToolsRequestSchema`

### Added
- **SSE Development Tool**: Created `tools/dev-sse.js` for proper SSE server development workflow
  - Launches SSE server on port 3001 (default)
  - Automatically starts MCP Inspector with correct SSE endpoint (`http://localhost:3001/sse`)
  - Mirrors `dev-http.js` functionality for consistent development experience
  - Updated `npm run dev:sse` to use new development script

## [Unreleased]

> Package-specific changes (e.g., `@mcp-abap-adt/adt-clients`) are tracked in their respective repositories and npm packages.

### Changed
- **Dependencies**: Project now uses published npm packages instead of local workspace dependencies:
  - `@mcp-abap-adt/adt-clients` and `@mcp-abap-adt/connection` are now installed from npm
  - Removed workspace configuration and git submodules
  - Updated documentation to reflect npm package usage

### Added
- **Documentation Restructure**:
  - New platform-specific installation guides: `INSTALL_WINDOWS.md`, `INSTALL_MACOS.md`, `INSTALL_LINUX.md`
  - Main entry point: `INSTALLATION.md` with quick links to platform guides
  - SSE/HTTP transport mode documentation for web-based clients
  - nvm (Node Version Manager) as recommended installation method for all platforms
  - Server transport modes documentation: stdio (default for Cline/Cursor) and SSE/HTTP (for web interfaces)
  - SSE server options: `--sse-port`, `--sse-host`, `--sse-allowed-origins`, `--sse-enable-dns-protection`
  - Examples for running server in SSE mode: `npm run start:sse`, `npm run start:http`
- **Transport Request Validation**:
  - New utility function `validateTransportRequest()` for consistent validation across all Create handlers
  - Transport request is now optional for `$TMP` (local) package only
  - Transport request is required for all transportable (non-`$TMP`) packages
  - Clear error messages guide users to use `package_name: "$TMP"` for local development
  - Test configuration updated with `$TMP` example in `test-config.yaml.template`
  - Note: `$TMP` is the only local package in SAP - each user has their own `$TMP`
- **Domain Management Tools**:
  - `GetDomain`: Retrieve ABAP domain structure and properties
  - `CreateDomain`: Create new ABAP domains with automatic activation
  - Simplified workflow: POST with all properties + Activate + Verify
  - SAP handles locking automatically on transport
  - Full test coverage with `test-create-domain.js` and `test-get-domain.js`
- **Data Element Management Tools**:
  - `GetDataElement`: Retrieve ABAP data element information including type definition, field labels, and metadata
  - `CreateDataElement`: Create new ABAP data elements with domain references and field labels
  - Simplified workflow: POST with full body + Activate + Verify (similar to CreateDomain)
  - Support for all field labels: short (10), medium (20), long (40), heading (55)
  - Support for search help, change document, and other data element properties
  - Full test coverage with `test-create-data-element.js` and `test-get-data-element.js`
- **Transport Management Tools**:
  - `CreateTransport`: Create new ABAP transport requests with automatic task creation
  - `GetTransport`: Retrieve comprehensive transport information with objects and tasks
  - Eclipse-compatible XML structure with proper Content-Type headers
  - Support for workbench (K) and customizing (T) transport types
  - Complete transport metadata parsing and validation
  - Full test coverage with `test-create-transport.js` and `test-get-transport.js`
- **Dictionary Objects Management Tools**:
  - `CreateTable`: Create new ABAP tables with fields, keys, and technical settings
  - `CreateStructure`: Create new ABAP structures with fields and type references
  - `GetView`: Retrieve ABAP database view definition including tables, fields, joins, and selection conditions
  - Comprehensive field definitions with data types, lengths, decimals, key flags, NOT NULL constraints
  - Support for domain and data element references in field definitions
  - Table delivery classes (A/C/L/G) and data categories (APPL0/APPL1/APPL2) configuration
  - Structure includes and field type references (domains, data elements, structures, tables)
  - View analysis with tables, joins, selection conditions, and optional data retrieval
  - Full test coverage with `test-create-table.js`, `test-create-structure.js`, and `test-get-view.js`
- Domain creation creates and activates domain in one operation (3 steps vs Eclipse's 7 steps)
- Data element creation follows same simplified approach (3 steps vs Eclipse's multiple LOCK/UNLOCK operations)
- All domain properties (datatype, length, decimals, lowercase, sign, conversion exit, value table) supported
- All data element properties (domain reference, field labels, type info, search help) supported

### Changed
- `CreateTable` handler now mirrors Eclipse ADT workflow: status check, `abapCheckRun`, lock cleanup, activation retry, and post-activation ident checks matching SAP behaviour.
- `BaseAbapConnection` merges session cookies across responses to keep SAP ADT sequences authenticated and clears them on reset.
- Added dedicated `jest.setup.js` to skip automatic MCP server bootstrap during Jest runs, eliminating TDZ errors in the test environment.
- Narrowed Jest `testMatch` patterns to `*.test.[tj]s` and removed legacy CLI scripts from the suite to prevent false negatives.
- Updated `tests/integration/handleGetFunction.int.test.js` to accept either JSON or plain-text payloads and perform case-insensitive source assertions.
- Translated legacy inline comments and documentation references to English for consistency with project guidelines.
- MCP protocol compliance: All handler responses now strictly follow the MCP protocol.
- Removed all `mimeType` and `data` fields from handler responses.
- For type `"text"` in `content`, only the `text` field is used.
- For type `"json"` in `content`, only the `json` field is used.
- Unified response format for all handlers: `{ isError, content: [{ type: "text", text: ... }] }` or `{ isError, content: [{ type: "json", json: ... }] }`.
- Fixed all MCP client errors related to invalid response format.
- Updated documentation and handler tables to reflect new response format.
- Added two new tools for batch ABAP object type detection:
  - DetectObjectTypeListArray: accepts array of objects via 'objects' parameter.
  - DetectObjectTypeListJson: accepts JSON payload with 'objects' array via 'payload' parameter.
- Added documentation for both tools: see [doc/DetectObjectTypeListTools.md](doc/DetectObjectTypeListTools.md).
- Repository URL changed from `mario-andreschak/mcp-abap-adt` to `fr0ster/mcp-abap-adt`
- Added acknowledgment to original project in README.md
- **All Create handlers updated**:
  - `CreateDomain`, `CreateDataElement`, `CreateClass`, `CreateProgram`, `CreateInterface`
  - `CreateFunctionGroup`, `CreateTable`, `CreateStructure`, `CreateView`
  - All now validate transport_request based on package type ($TMP vs transportable)
  - `transport_request` parameter removed from `required` fields in tool schemas where applicable

### Removed
- **Deprecated Documentation Files**:
  - Removed `INSTALLATION_GUIDE_EN.md`, `INSTALLATION_GUIDE_UA.md`, `INSTALLATION_GUIDE_BY.md` (replaced by platform-specific guides)
  - Removed Smithery automatic installation instructions (not supported)
  - Removed Smithery badge from README.md
  - Removed all references to `@mario-andreschak/mcp-abap-adt` package

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- New MCP tool: `DetectObjectTypeList`
  - Batch detection of ABAP object types by a list of names.
  - Input: `{ global: [{ name: string, type?: string }] }`
  - Output: `{ isError: boolean, content: Array<{ name, detectedType, description, shortText, longText, text, package, uri }> }`
  - Available via MCP API and web interface.
  - All comments and documentation in English.

### Changed
- All handler modules now use a unified in-memory caching mechanism via `objectsListCache`. This provides consistent, easily swappable cache logic across the codebase.
- The `filePath` parameter and all file write logic have been removed from all handlers. Handler results are now only cached in memory, not written to disk.
- This refactor improves maintainability, testability, and performance by eliminating redundant file operations and centralizing cache management.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2025-07-08

### Added
- All MCP handler functions now support an optional `filePath` parameter. If provided, the handler will save the result to the specified file path (any absolute or relative path, with any extension).
- All CLI test scripts now accept the `--filePath=...` argument to save the result to a file.
- The result written to file is exactly what is returned to the user (no extra formatting or caching).
- Improved error logging and debug output for file writing operations.
- Updated documentation and usage examples in README.md to reflect new file output support.
- Implemented utility `writeResultToFile` for safe file writing with directory restriction and logging.

## [1.3.0] - 2025-07-08

### Added
- Added integration test `tests/integration/handleGetFunction.int.test.js` for handleGetFunction.
- Significantly expanded integration test coverage in `src/index.test.ts` for all main tools (GetProgram, GetClass, GetFunctionGroup, GetFunction, GetTable, GetStructure, GetTableContents, GetPackage, GetInclude, GetTypeInfo, GetInterface, GetTransaction, GetEnhancements, GetSqlQuery, SearchObject).
- Added new checks for advanced scenarios (e.g., SQL generation, error handling, enhancement XML parsing).

### Changed
- Updated documentation regarding testing and integration scenarios.

## [1.2.0] - 2025-07-02

### Changed
- `GetWhereUsed` now supports any ADT object type (e.g. table/TABL, bdef/BDEF, etc.), not just class, program, include, function, interface, package.
- Updated documentation in README.md and jsdoc for supported object types and usage examples.

## [1.1.0] - 2025-02-19

### Added
- New `GetTransaction` tool to retrieve ABAP transaction details.
  - Allows fetching transaction details using the ADT endpoint `/sap/bc/adt/repository/informationsystem/objectproperties/values`.
  - Added documentation in README.md.

## [0.1.2] - 2025-02-18

### Changed
- Added Jest Test Script `index.test.ts` available through `npm test`
- Enhanced `makeAdtRequest` method to support:
  - Custom headers through an optional parameter
  - Query parameters through an optional `params` parameter
- Improved `handleGetPackage` method to use ADT's nodeContent API
  - Now uses POST request with proper XML payload
  - Added specific content type headers for nodeContent endpoint
  - Added filtering to return only objects with URI 
- Improved CSRF token handling in utils.ts
  - Added automatic CSRF token fetching for POST/PUT requests
  - Enhanced token extraction to work with error responses
  - Added cookie management for better session handling
  - Implemented singleton axios instance for consistent state
  - Added proper cleanup for test environments

## [0.1.1] - 2025-02-13

### Added
- New `GetInterface` tool to retrieve ABAP interface source code
  - Allows fetching source code of ABAP interfaces using the ADT endpoint `/sap/bc/adt/oo/interfaces/`
  - Similar functionality to GetClass but for interfaces
  - Added documentation in README.md

## [0.1.0] - Initial Release

### Added
- Initial release of the MCP ABAP ADT server
- Basic ABAP object retrieval functionality
- Support for programs, classes, function modules, and more
- Documentation and setup instructions
