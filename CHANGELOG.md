# Changelog

## [Unreleased]

## [2.1.5] - 2026-01-28
### Added
- **Startup diagnostics**: Display SAP connection configuration at server startup when using `--env` parameter
  - Shows source file, SAP URL, client, auth type, and UAA URL
  - Tokens and secrets are safely masked (first/last 4 chars for long values, full mask for short)
  - Helps diagnose auth issues by showing which config is actually used

## [2.1.4] - 2026-01-21
### Fixed
- **CreateLocalTestClass**: Return full SAP error details on failure (including the original response payload).

## [2.1.3] - 2026-01-02
### Changed
- **Documentation**: Restored the stateful ADT flow guide without file-based session persistence references.
- **Available tools**: Regenerated `docs/user-guide/AVAILABLE_TOOLS.md` and restored links across docs.

### Removed
- **Lock/session persistence**: Removed filesystem lock registry and session persistence helpers/config from core and tests.
- **CLI commands**: `adt-lock-object`, `adt-unlock-object`, `adt-manage-locks`, `adt-manage-sessions`, and `adt-unlock-objects` removed from package bins.
- **User guides**: Removed usage/scenario docs tied to legacy session flows.

## [2.1.2] - 2026-01-02
### Changed
- **Lock registry types**: `LockState.objectType` now uses `AdtObjectType` with normalization for legacy entries.
- **adt-lock-object**: No longer registers lock handles in `.locks/active-locks.json`; session save only.

### Removed
- **CLI commands**: `adt-unlock-object`, `adt-manage-locks`, `adt-manage-sessions`, and `adt-unlock-objects` removed from package bins.

## [2.1.1] - 2025-12-31
### Changed
- **@mcp-abap-adt/auth-broker**: bumped to `^0.3.0` - auto-detect service key format, credentials wrapper support, debug logging
- **@mcp-abap-adt/auth-stores**: bumped to `^0.3.0`

## [2.1.0] - 2025-12-31
### Fixed
- Updated `@mcp-abap-adt/auth-broker` so installs now pull `0.2.17` instead of the stale `0.2.14` release that was hiding upstream fixes.
- Removed the accidental `@mcp-abap-adt/core` dependency that caused consumers to download the old `1.4.1` tarball.

## [2.0.3] - 2025-12-31
### Changed
- **@mcp-abap-adt/auth-broker**: bumped to `0.2.15` so the locked dependency pulls in the latest fixes referenced by the release.

### Fixed
- **CI workflow package install**: `.github/workflows/ci.yml` now looks for `mcp-abap-adt-core-*.tgz`, matching the actual npm pack output before testing global install.

## [2.0.2] - 2025-12-30
### Changed
- **GetWhereUsed handler**: Now uses `getWhereUsedList()` from adt-clients and returns parsed JSON with structured references instead of raw XML

### Fixed
- **Release workflow**: Simplified to use npm registry instead of uploading tgz artifacts

## [2.0.1] - 2025-12-30
### Documentation
- Added glama.ai badge with security/license/quality grades
- Updated README example to use `EmbeddableMcpServer` instead of deprecated `HandlerExporter.registerOnServer()`

## [2.0.0] - 2025-12-30
### Added
- **EmbeddableMcpServer**: New server class for external integration (e.g., cloud-llm-hub)
  - Accepts injected `AbapConnection` from consumer
  - Extends `BaseMcpServer` with proper handler registration
  - Configurable exposition levels: `readonly`, `high`, `low`, `system`, `search`
  - Export via `@mcp-abap-adt/core/server`

### Changed
- **HandlerExporter**: Now serves only as registry factory
  - Use `createRegistry()` to get `IHandlersRegistry` for custom scenarios
  - `getHandlerEntries()` and `getToolNames()` still available for inspection

### Removed
- **BREAKING**: `HandlerExporter.registerOnServer()` method removed
  - Had bug with handler signature (passed context twice)
  - Replace with `EmbeddableMcpServer` for cleaner architecture

### Migration Guide
```typescript
// Before (v1.x - broken)
import { HandlerExporter } from '@mcp-abap-adt/core/handlers';
const exporter = new HandlerExporter({ includeReadOnly: true, includeHighLevel: true });
const mcpServer = new McpServer({ name: 'mcp-abap-adt', version: '1.0.0' });
exporter.registerOnServer(mcpServer, () => connection, logger);

// After (v2.x)
import { EmbeddableMcpServer } from '@mcp-abap-adt/core/server';
const server = new EmbeddableMcpServer({
  connection,
  logger,
  exposition: ['readonly', 'high'],
});
await server.connect(transport);
```

## [1.4.3] - 2025-12-29
### Documentation
- **CLI Help**: Extended `--help` output with comprehensive environment variables documentation
  - Added MCP Server Configuration section (`MCP_TRANSPORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_SSE_HOST`, `MCP_SSE_PORT`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_USE_AUTH_BROKER`, `MCP_BROWSER`)
  - Added Debug Options section (`DEBUG_HANDLERS`, `DEBUG_CONNECTORS`, `DEBUG_CONNECTION_MANAGER`, `HANDLER_LOG_SILENT`)
  - Extended SAP Connection section with JWT/OAuth2 variables (`SAP_REFRESH_TOKEN`, `SAP_UAA_URL`, `SAP_UAA_CLIENT_ID`, `SAP_UAA_CLIENT_SECRET`, `SAP_LANGUAGE`)
- **CLI_OPTIONS.md**: Added missing environment variables documentation
  - Added `MCP_UNSAFE`, `MCP_USE_AUTH_BROKER`, `MCP_BROWSER` to General section
  - Added JWT/OAuth2 authentication variables to SAP Connection section
  - New Auth-Broker section with `AUTH_BROKER_PATH` and debug variables
  - New Debug section with handler and connector logging options
- **INSTALLATION.md**: Expanded Environment Variables section with full reference and link to CLI_OPTIONS.md

## [1.4.2] - 2025-12-29
### Fixed
- **Version path**: Fixed incorrect path to package.json in `--version` command

## [1.4.1] - 2025-12-29
### Changed
- **Package renamed**: Changed from `@fr0ster/mcp-abap-adt` to `@mcp-abap-adt/core` for npm publishing
- **Package now public**: Removed `private: true` flag to allow npm publishing

### Added
- **Inspection-only mode**: Server can now start in stdio mode without connection parameters for tool inspection (used by glama.ai)
- **MockAbapConnection**: Added mock connection class for inspection-only mode that returns descriptive error when tools are executed
- **Docker inspection support**: Added `Dockerfile.inspect` and `docker-compose.inspect.yml` for local testing of inspection mode
- **CLAUDE.md**: Added project documentation for Claude Code assistance

## [1.3.0] - 2025-12-29
### Added
- **glama.json**: Added configuration for compatibility with the Glama platform.
- **Node.js Debugging**: Added `--inspect` support to Docker container and exposed port 9229.
- **MCP_TRANSPORT Environment Variable**: Added support for selecting transport mode via environment variable.

### Changed
- **@mcp-abap-adt/adt-clients Updated**: Upgraded to version 0.3.13, bringing fixes for recursion and 406 Accept errors.
- **GetPackageTree Optimized**: Simplified implementation by using the library's `getPackageHierarchy` method, ensuring correct recursive traversal of subpackages.
- **GetPackageContents Enhanced**: Added support for `include_subpackages`, `max_depth`, and `include_descriptions` parameters.
- **Docker Defaults**: Changed default transport to `stdio` in Docker and updated healthcheck logic.

## [1.2.9] - 2025-12-29
### Changed
- **v1 McpHandlers Refactoring**: Rewrote `McpHandlers` to use `HandlerExporter` internally. This ensures the legacy embeddable server (v1) stays in sync with all tools available in v2 while reducing code duplication.
- **Shared Schema Utilities**: Replaced duplicated `jsonSchemaToZod` logic in `v1` with a central implementation from `src/lib/handlers/utils/schemaUtils.ts`.
- **Documentation Generator**: Updated `tools/generate-tools-docs.js` category mapping to support the standardized `GetBehaviorDefinition` naming.

### Removed
- **GetBdef compatibility adapter**: Removed the manual adapter for `GetBdef` in v1 server. All tools now use standard names (e.g., `GetBehaviorDefinition`).

### Added
- **tsx** added to `devDependencies` for improved TypeScript execution and testing.

## [1.2.8] - 2025-12-29
### Added
- **GetPackageContents** tool: New read-only tool to retrieve objects inside an ABAP package (moved from legacy `GetPackage`).

### Changed
- **GetPackage** tool: Migrated to high-level API (`AdtClient.getPackage().read()`). Now returns package metadata and supports `version` parameter (`active`/`inactive`).
- **GetFunction** tool: Updated to support `version` parameter and migrated to new `adt-clients` signature.
- **High-level handlers**: Improved parameter handling and consistency with new `adt-clients` versioning requirements.
- Test cleanup documentation updated to clarify `afterEach` behavior and multi-object cleanup requirements.
- Test runners (`LowTester`/`HighTester`) now emit step-level flow logs for validate/create/lock/update/unlock/activate.
- Package cleanup can use a fresh connection with optional `connection_config` for locked session cases.

### Fixed
- Package create now treats ADT "import" 404 as success when the package is readable.
- Function group/module low-level create handles transient 400/empty responses with read verification.
- Table create now validates and creates with explicit descriptions to satisfy ADT requirements.
- Package low-level tests avoid double-unlock during cleanup.

## [1.2.7] - 2025-12-27
### Changed
- GetPackageTree now builds the tree from node-structure traversal to preserve package/subpackage hierarchy and ordering.
- Package tree nodes now include `adtType`, normalized `type`, `codeFormat`, and `restoreStatus` for parity with backup tooling.
- Migrated handler usage to `AdtClient` now that `CrudClient`/`ReadOnlyClient` are removed in `@mcp-abap-adt/adt-clients`.

### Fixed
- Updated handler typings to match `@mcp-abap-adt/adt-clients@0.3.2` (I* config/state interfaces).
- SearchObject now uses `AdtUtils.searchObjects` instead of the removed `SharedBuilder` export.
- Restored `encodeSapObjectName` helper in `utils` to avoid relying on unstable client exports.

## [1.2.6] - 2025-12-23
### Fixed
- Fixed LICENSE file - corrected copyright attribution (removed incorrect fork author)
- Fixed TypeScript compilation errors in test files:
  - Updated `handlers.test.ts` to use high-level handlers instead of removed readonly handlers
  - Removed non-existent `getAuthHeaders` import from `utils.test.ts`
  - Fixed `sessionHelpers.ts` - added type assertions for connection methods not in `IAbapConnection` interface (`getConfig`, `connect`)
  - Fixed `ClassCrudClientDirect.test.ts` - added type assertions for `connect()` and `reset()` methods
  - Fixed `BehaviorImplementationLowHandlers.test.ts` - removed invalid `session_id` and `session_state` parameters from `UnlockClassArgs`

## [1.2.5] - 2025-12-23
### Removed
- **Removed duplicate readonly handlers that duplicate high-level CRUD operations**
  - Deleted `handleGetClass.ts` (replaced by high-level `GetClass`)
  - Deleted `handleGetDomain.ts` (replaced by high-level `GetDomain`)
  - Deleted `handleGetDataElement.ts` (replaced by high-level `GetDataElement`)
  - Deleted `handleGetTable.ts` (replaced by high-level `GetTable`)
  - Deleted `handleGetStructure.ts` (replaced by high-level `GetStructure`)
  - Deleted `handleGetView.ts` (replaced by high-level `GetView`)
  - Deleted `handleGetServiceDefinition.ts` (replaced by high-level `GetServiceDefinition`)
  - Deleted `handleGetProgram.ts` (replaced by high-level `GetProgram`)
  - Deleted `handleGetInterface.ts` (replaced by high-level `GetInterface`)
  - Deleted `handleGetFunctionGroup.ts` (replaced by high-level `GetFunctionGroup`)
  - Deleted `handleGetBdef.ts` (replaced by high-level `GetBehaviorDefinition`)

### Changed
- **v1 server now uses high-level handlers instead of readonly duplicates**
  - `GetClass`, `GetDomain`, `GetDataElement`, `GetTable`, `GetStructure`, `GetView`, `GetServiceDefinition`, `GetProgram`, `GetInterface`, `GetFunctionGroup` now use high-level handlers internally
  - `GetBdef` now uses `GetBehaviorDefinition` high-level handler with parameter adapter for backward compatibility
  - All high-level handlers support `version` parameter (active/inactive) for better flexibility

### Fixed
- Fixed TypeScript type errors in `handleGetAbapSystemSymbols.ts`
  - Added proper JSON parsing for `GetClass` and `GetInterface` responses
  - Fixed type assertions for class and interface data
- Fixed TypeScript type error in `utils.ts`
  - Added type assertion for `makeAdtRequest` return type
- Fixed documentation generator (`tools/generate-tools-docs.js`)
  - Updated regex pattern to support multi-line imports in handler groups
  - Now correctly detects all handlers including system and search handlers
  - Documentation now includes all 219 tools (76 high-level, 116 low-level, 27 read-only)

## [1.2.4] - 2025-12-22
### Changed
- **Migrated from ESLint+Prettier to Biome**
  - Removed ESLint and Prettier dependencies
  - Added @biomejs/biome for faster linting and formatting
  - Configured Biome with strict rules for production code
  - Relaxed rules for test files (noImplicitAnyLet, noExplicitAny)
  - Updated package.json scripts: `lint`, `lint:check`, `format`
  - Updated `npm run build` to include Biome check before TypeScript compilation

### Fixed
- Fixed TypeScript errors in production code:
  - `handleGetAbapAST.ts` - Fixed regex match types and while loop patterns in 4 methods
  - `handleGetObjectInfo.ts` - Added type annotation for `packageName`
  - `handleDescribeByList.ts` - Added type annotation for `parsed`
  - `handleValidateDataElement.ts` - Added type assertion for `AxiosResponse`
  - `handleCreateClass.ts` - Added `ClassBuilderState` type import
  - `handleDeleteObject.ts` - Changed `any` to `unknown` for response
  - `handleGetEnhancementSpot.ts` - Fixed array types and while loops
  - `handleGetProgFullCode.ts` - Fixed 3 while loops with regex.exec() pattern
- All production code now passes strict Biome rules (no implicit any, no assignments in expressions)

### Added
- Added Biome check to CI workflow (`.github/workflows/ci.yml`)
- Added Biome check to Release workflow (`.github/workflows/release.yml`)

### Dependencies
- Updated `@mcp-abap-adt/adt-clients` to ^0.2.6
- Updated `@mcp-abap-adt/adt-interfaces` to ^0.2.6
- Added `@biomejs/biome` ^2.3.10 as devDependency
- Removed `eslint` and `prettier` dependencies

## [1.2.3] - 2025-12-22
### Fixed
- Removed unused import of `IAbapConnectionExtended` from `@mcp-abap-adt/interfaces`
  - Interface was removed in interfaces package v1.1.0

## [1.2.2] - 2025-12-22
### Changed
- **BREAKING: Removed legacy-server.ts**
  - Full removal of 3000+ line legacy server with CLI, AuthBroker, .env parsing, etc.
  - v1 module now exports only lightweight `EmbeddableMcpServer` class

### Added
- **EmbeddableMcpServer** - lightweight MCP server for embedding
  - Minimal class (~100 lines) for external HTTP server integration
  - Constructor takes `context: HandlerContext` with connection and logger
  - Handlers registered immediately in constructor - no `run()` method needed
  - Access underlying `McpServer` via `.mcpServer` getter
  - Configurable `exposition` levels: `readonly`, `high`, `low`, `system`
  
### Removed
- `mcp_abap_adt_server` class (was 3000+ lines with CLI, transports, AuthBroker)
- `setAbapConnectionOverride()` function
- `ServerOptions` interface
- All CLI argument parsing
- All transport management (stdio, SSE, streamable-http)
- AuthBroker integration
- .env file loading logic

### Migration Guide
**For embedding in external servers (cloud-llm-hub, etc.):**
```typescript
// Before (1.2.x)
import { mcp_abap_adt_server } from '@fr0ster/mcp-abap-adt/server/v1';
const server = new mcp_abap_adt_server({ connection, allowProcessExit: false });
server.registerHandlers({ connection, logger });

// After (1.2.2)
import { EmbeddableMcpServer } from '@fr0ster/mcp-abap-adt/server/v1';
const server = new EmbeddableMcpServer({
  context: { connection, logger },
  exposition: ['readonly', 'high']
});
const mcpServer = server.mcpServer; // Use with transport
```

## [1.2.1] - 2025-12-22
### Added
- **Subpath export `./utils`** for internal utilities access
  - `@fr0ster/mcp-abap-adt/utils` - exports `sessionContext`, `getManagedConnection`, and other utilities
  - Required for cloud-llm-hub integration to access session context

## [1.2.0] - 2025-12-21
### Changed
- **BREAKING: v2 is now the default server**
  - `mcp-abap-adt` command now runs v2 server (was v1)
  - v1 server moved to `legacy-server.ts`, accessible via `npm run start:legacy`
  - Removed separate `mcp-abap-adt-v2` binary

- **v1 becomes Handler Exporter**
  - v1/index.ts now exports `HandlerExporter` class for external server integration
  - Allows registering ABAP ADT handlers on any McpServer instance
  - Designed for embedding into existing Express/CDS/CAP servers (e.g., cloud-llm-hub)

### Added
- **Subpath exports** for modular imports
  - `@fr0ster/mcp-abap-adt` - main package (unchanged)
  - `@fr0ster/mcp-abap-adt/handlers` - HandlerExporter and handler groups
  - `@fr0ster/mcp-abap-adt/server/v1` - v1 module (exporter + legacy server)
  - v2 server is internal, not exported as subpath

- **HandlerExporter class** for programmatic handler registration
  - `new HandlerExporter(options?)` - create exporter with configurable handler groups
  - `registerOnServer(mcpServer, connectionProvider)` - register handlers with connection injection
  - `getHandlerEntries()` - get raw handler entries for custom registration
  - `getToolNames()` - list all available tool names
  - `createRegistry()` - create IHandlersRegistry for v2 servers

- **Handler Groups** - modular handler organization
  - `ReadOnlyHandlersGroup` - read-only handlers (getProgram, getClass, etc.)
  - `HighLevelHandlersGroup` - high-level operations
  - `LowLevelHandlersGroup` - low-level operations
  - `SystemHandlersGroup` - system handlers
  - `SearchHandlersGroup` - search handlers

### Migration Guide
**For CLI users:**
- No changes needed - `mcp-abap-adt` command works the same
- To use legacy v1 server: `npm run start:legacy`

**For library users (cloud-llm-hub, etc.):**
```typescript
// Old way (v1 server class) - still works via legacy import
import { mcp_abap_adt_server } from '@fr0ster/mcp-abap-adt';

// New way (handler exporter) - recommended
import { HandlerExporter } from '@fr0ster/mcp-abap-adt/handlers';

const exporter = new HandlerExporter();
exporter.registerOnServer(mcpServer, () => getConnection());
```

**For CAP/CDS projects with file: dependency:**
Add path mapping to tsconfig.json:
```json
{
  "paths": {
    "@fr0ster/mcp-abap-adt/handlers": ["./submodules/mcp-abap-adt/dist/lib/handlers/index"]
  }
}
```

## [1.1.32] - 2025-12-21
### Added
- **v2 HTTP Server Injection**: Added support for external HTTP application injection in v2 servers
  - New `IHttpApplication` interface for Express-like HTTP applications
  - `StreamableHttpServer` and `SseServer` now support `app` option in constructor
  - New `registerRoutes(app, options?)` method for embedding into existing Express/CDS/CAP servers
  - Enables integration with cloud-llm-hub and other CAP-based applications
  - Helper methods: `getPath()`, `getSsePath()`, `getPostPath()`

## [1.1.31] - 2025-12-21
### Fixed
- **CLI `--version` flag**: Fixed package.json path resolution for both v1 and v2 servers
  - Path now correctly resolves from `dist/server/v1/` and `dist/server/v2/` to root `package.json`

## [1.1.30] - 2025-12-21
### Added
- **MCP Server v2 Architecture**:
  - New modular server architecture with `BaseMcpServer`, `StdioServer`, `StreamableHttpServer`
  - Handler registration system with Dependency Injection pattern
  - `HandlerContext` for unified connection and logging access in handlers
  - `ServerConfigManager` for centralized configuration management
  - `AuthBrokerConfig` for V2 server configuration
  - `StdioLogger` for minimal logging in stdio transport
  - Transport-specific server implementations (stdio, SSE, HTTP)

- **Headless Browser Mode**: Added `--browser` CLI parameter for SSH and remote sessions
  - `--browser=headless`: Logs authentication URL and waits for manual callback
  - `--browser=none`: Logs URL and rejects immediately (for automated tests)
  - `--browser=system`: Opens system default browser (default)
  - `--browser=chrome|edge|firefox`: Opens specific browser
  - Environment variable: `MCP_BROWSER`
  - Ideal for SSH sessions, Docker containers, and CI/CD environments

- **YAML Configuration Support**:
  - Load server configuration from YAML files
  - Enhanced command-line transport handling
  - Improved configuration validation

- **Structured Logging**:
  - Handler logging with configurable options and integration
  - Structured logging for handler functions
  - Logger cleanup and enhanced handler implementations

- **Testing Improvements**:
  - Jest configuration and enhanced testing framework
  - Unified test refactoring roadmap with base tester classes
  - Integration tests for low-level view handlers
  - Read-only handler tests for WhereUsed analysis
  - `AuthBrokerFactory` for test configuration

- **Infrastructure & Handlers**:
  - Added `tabletypes` to integrated terminal profiles
  - Handler migration to infrastructure module
  - Basic auth support in MCP destination handling

### Changed
- **Token Refresh Architecture (Breaking)**:
  - Removed legacy `createDestinationAwareConnection()` wrapper (~150 lines)
  - Token refresh now handled internally by `JwtAbapConnection` via DI `ITokenRefresher`
  - `getConnectionForSession()` creates `tokenRefresher` from `AuthBroker` and passes to `createAbapConnection()`
  - Removed all `reset()` calls from 23+ handler files (no longer needed)
  - Removed unused `disposeConnection()` and `getAuthHeaders()` functions
  - Simplified `HandlerContext` to use `IAbapConnection` instead of deprecated `IAbapConnectionExtended`

- **Handler Refactoring**:
  - All handlers updated to utilize `HandlerContext` for connection and logging
  - Standardized import statements across handlers
  - Enhanced error handling and logging across all handlers
  - Replaced direct connection creation with managed connection

- **Configuration Module**:
  - Extracted configuration logic into dedicated module
  - Improved YAML configuration loading and command line parsing
  - Enhanced connection handling and configuration validation

### Fixed
- Network error handling in `createDestinationAwareConnection`
- Handler results properly awaited and errors handled in `BaseMcpServer`
- Basic auth support in MCP destination handling
### Removed
- Legacy test files and deprecated test scripts (85 files)
- Obsolete v2 components from earlier iterations
- Deprecated tools: `update-crudclient-api.js`, `update-handlers-with-tool-definitions.js`, etc.

### Documentation
- Comprehensive documentation for various components and usage scenarios
- MCP Server architecture and implementation roadmap
- Handler refactoring roadmap
- YAML configuration support documentation
- Issue roadmap system for structured issue tracking
- Updated development guidelines

### Dependencies
- `@mcp-abap-adt/interfaces`: `^0.2.3` → `^0.2.6`
  - Removed deprecated `IAbapConnectionExtended` interface
  - Added `ITokenRefresher` interface for DI
- `@mcp-abap-adt/connection`: `^0.2.3` → `^0.2.5`
  - `createAbapConnection()` now accepts 4th parameter `tokenRefresher`
  - `JwtAbapConnection` handles token refresh internally
- `@mcp-abap-adt/auth-providers`: `^0.2.1` → `^0.2.3` (headless mode, cross-platform fixes)
- `@mcp-abap-adt/auth-broker`: `^0.2.4` → `^0.2.9`
  - Added `createTokenRefresher()` factory method
  - Headless mode passthrough
- `@mcp-abap-adt/auth-stores`: `^0.2.5` → `^0.2.8` (EnvFileSessionStore with JWT persistence)
- `@mcp-abap-adt/clients`: `^0.2.4` → `^0.2.5`

## [1.1.29] - 2025-12-08

### Added
- **Parameter Passing Unit Tests Roadmap**: Added comprehensive roadmap for unit tests to verify parameter passing
  - Created `doc/roadmaps/parameter_passing_unit_tests_roadmap.md`
  - Detailed test strategy for verifying all parameters pass correctly from MCP handlers through CrudClient to Builder classes and finally to low-level functions
  - Test implementation plan with 4 phases covering infrastructure, individual object types, and integration tests
  - Test examples for ViewBuilder, CrudClient, and low-level functions
  - Coverage goals (100% for parameter passing) and success criteria
  - Addresses issue where parameters like `transportRequest` can be lost during the call chain

### Documentation
- **Roadmap Documentation**: Added roadmap for future unit test development
  - Comprehensive plan for preventing parameter loss regression
  - Test file structure and organization guidelines
  - Maintenance and CI/CD integration recommendations

## [1.1.28] - 2025-01-XX

### Changed
- **Header Constants Migration**: Replaced all hardcoded header strings with constants from `@mcp-abap-adt/interfaces`
  - All header references now use constants (e.g., `HEADER_SAP_URL`, `HEADER_SAP_AUTH_TYPE`, `HEADER_MCP_DESTINATION`, etc.)
  - Improved type safety and consistency across packages
  - Updated error messages and hints to use header constants
- **Updated dependencies**:
  - `@mcp-abap-adt/header-validator`: `^0.1.6` → `^0.1.7`
    - Added comprehensive header sets documentation
    - Enhanced validation for Basic Auth and UAA refresh token sets
    - All header references migrated to constants from `@mcp-abap-adt/interfaces`
  - `@mcp-abap-adt/interfaces`: `^0.1.1` → `^0.1.2`
    - Added HTTP header constants for all headers used across packages
    - Added header groups and authentication type constants

### Technical
- **Code Quality**: Improved maintainability by centralizing header name definitions
- **Type Safety**: Better compile-time checking for header names

## [1.1.27] - 2025-12-07

### Changed
- **Updated dependencies**:
  - `@mcp-abap-adt/auth-broker`: `^0.1.9` → `^0.1.10`
    - Added constructor validation for stores and tokenProvider parameters
    - Ensures required dependencies are present upon AuthBroker instantiation

## [1.1.26] - 2025-12-06

### Added
- **Comprehensive usage documentation** – Added complete MCP function call documentation:
  - Created `doc/user-guide/usage/` directory with structured documentation
  - **Simple Objects** (22 files): High-level and low-level handlers for 11 object types:
    - Classes, Interfaces, Programs, Function Groups, Function Modules
    - Tables, Structures, CDS Views, Domains, Data Elements, Service Definitions
    - Each object has separate `-high.md` and `-low.md` files with exact MCP call examples
  - **RAP Business Objects** documentation:
    - Complete workflow for creating RAP BO with all components
    - Deferred group activation guide
    - Step-by-step examples with exact MCP function calls
  - All documentation uses compact, laconic format with only exact MCP calls and parameters
  - No unnecessary descriptions, maximum clarity
- **Test syntax checking** – Added `npm run test:check` command:
  - Performs TypeScript syntax check on test files without running tests
  - Uses `tsc --noEmit -p tsconfig.test.json`
  - Helps catch type errors before running tests

### Changed
- **Updated dependencies to latest versions**:
  - `@mcp-abap-adt/adt-clients`: `^0.1.35` → `^0.1.36`
  - `@mcp-abap-adt/auth-broker`: `^0.1.8` → `^0.1.9`
  - `@mcp-abap-adt/auth-providers`: `^0.1.1` → `^0.1.2`
  - `@mcp-abap-adt/auth-stores`: `^0.1.3` → `^0.1.4`
  - `@mcp-abap-adt/connection`: `^0.1.14` → `^0.1.15`
  - `@mcp-abap-adt/header-validator`: `^0.1.4` → `^0.1.6`
  - `@mcp-abap-adt/interfaces`: `^0.1.1` (unchanged)
  - `@mcp-abap-adt/logger`: `^0.1.0` → `^0.1.1`

### Fixed
- **TypeScript type errors in TableLowHandlers.test.ts** – Fixed type inference issues:
  - Corrected `lockSessionForCleanup` variable declaration and usage
  - Fixed type narrowing in catch and finally blocks

## [1.1.25] - 2025-12-12

### Added
- **`--mcp=<destination>` parameter** – Default MCP destination name for auth-broker:
  - Allows using auth-broker (service keys) with stdio and SSE transports
  - When specified, this destination is used when `x-mcp-destination` header is not provided in requests
  - For stdio transport: Server initializes auth-broker with the specified destination at startup
  - For SSE transport: Server uses the specified destination as fallback when header is missing
  - For HTTP transport: Server uses the specified destination as fallback when header is missing
  - Example: `mcp-abap-adt --transport=stdio --mcp=TRIAL`
  - This enables auth-broker usage with stdio and SSE transports, which previously required `.env` file configuration

### Changed
- **Auth-broker support for stdio and SSE transports** – Extended `getOrCreateAuthBroker()` to support stdio and SSE transports:
  - Previously, auth-broker was only available for HTTP/streamable-http transport
  - Now works with all transport types when `--mcp` parameter is specified
  - For stdio: Auth-broker is initialized at server startup with the destination from `--mcp` parameter
  - For SSE: Auth-broker works the same way as HTTP transport (via headers or `--mcp` fallback)

### Fixed
- **`--mcp` parameter now skips `.env` file loading** – When `--mcp` is specified:
  - `.env` file is not automatically loaded (even if it exists in current directory)
  - `.env` file is not considered mandatory for stdio and SSE transports
  - Auth-broker configuration takes precedence over `.env` file
  - This ensures that `--mcp` parameter works correctly without conflicts from `.env` file settings
- **SSE transport with `--mcp` parameter** – Fixed issue where SSE transport was using `.env` configuration instead of auth-broker when `--mcp` was specified:
  - Server now initializes auth-broker at startup for SSE transport when `--mcp` is provided
  - `applyAuthHeaders()` now handles empty headers correctly when `defaultMcpDestination` is set
  - Configuration from auth-broker takes precedence over `.env` file

### Documentation
- Updated `CLI_OPTIONS.md` with `--mcp` parameter documentation and examples
- Updated `CLIENT_CONFIGURATION.md` with information about using `--mcp` parameter for stdio and SSE transports
- Added examples for Cline configuration with stdio transport and `--mcp` parameter
- Updated help text in both `src/index.ts` and `bin/mcp-abap-adt.js` with `--mcp` parameter information

## [1.1.24] - 2025-12-02

### Changed
- **Safe session storage by default** – Session data is now stored in-memory using `SafeSessionStore` by default:
  - Session tokens are no longer persisted to disk by default (secure by default)
  - Session data is lost after server restart (requires re-authentication)
  - Use `--unsafe` flag to enable file-based session storage (legacy behavior)
  - File-based storage (`UnixFileSessionStore`/`WindowsFileSessionStore`) is only used when `--unsafe` is specified

### Added
- **`--unsafe` flag** – Enables file-based session storage (persists tokens to disk):
  - When specified, session data is saved to platform-specific locations:
    - Unix: `~/.config/mcp-abap-adt/sessions/{destination}.env`
    - Windows: `%USERPROFILE%\Documents\mcp-abap-adt\sessions\{destination}.env`
  - Can be set via environment variable: `MCP_UNSAFE=true`
  - Use this flag if you need session persistence across server restarts

### Dependencies
- Updated `@mcp-abap-adt/auth-broker` to `^0.1.5`:
  - Benefits from new `SafeSessionStore` implementation (in-memory, secure)
  - Updated to use new `ISessionStore` interface (replaces `SessionStore`)

## [1.1.23] - 2025-12-02

### Fixed
- **Help text correction** – fixed incorrect help message for `x-mcp-destination` header:
  - Removed incorrect statement that `x-mcp-destination` requires `x-sap-url` header
  - Updated help text to correctly state that URL is automatically derived from service key (same as `x-sap-destination`)
  - Help text now accurately reflects that `x-sap-url` is not required and will be ignored if provided

## [1.1.22] - 2025-12-01

### Dependencies
- Updated `@mcp-abap-adt/adt-clients` to `^0.1.33`:
  - Benefits from optimized CSRF token endpoint (`/sap/bc/adt/core/discovery`)
  - Faster connection initialization for all CRUD operations
- Updated `@mcp-abap-adt/auth-broker` to `^0.1.4`:
  - Benefits from optimized CSRF token endpoint in connection layer
  - Faster authentication flows when managing JWT tokens

### Added
- **ABAP Unit class test tools**: Added `[low-level]` handlers to cover the new CrudClient APIs for class test includes and ABAP Unit orchestration:
  - `LockClassTestClassesLow`, `UpdateClassTestClassesLow`, `UnlockClassTestClassesLow`, `ActivateClassTestClassesLow`
  - `RunClassUnitTestsLow`, `GetClassUnitTestStatusLow`, `GetClassUnitTestResultLow`
  - All new tools live in `class/low/` and are registered with the server and documentation generator.
- **Package creation options**: `CreatePackage` (high- and low-level) now accepts optional `package_type`, `software_component`, `transport_layer`, `application_component`, and `responsible` parameters and forwards them directly to `CrudClient`, enabling Cloud systems to pass values such as `ZLOCAL` while keeping the transport layer empty.

## [1.1.21] - 2025-12-01

### Fixed
- **x-mcp-destination validation** – fixed issue where `x-mcp-destination` header was incorrectly requiring `x-sap-url`:
  - `x-mcp-destination` now works identically to `x-sap-destination` - URL is automatically derived from service key
  - `x-sap-url` is now optional for `x-mcp-destination` (and will be ignored with a warning if provided)
  - Fixed issue on Windows where `x-mcp-destination` was being ignored
  - Updated header validator to check headers in both lowercase and original case for better compatibility

### Added
- **Custom auth-broker path** – added `--auth-broker-path` command-line option:
  - Allows specifying custom base path for service keys and sessions
  - Automatically creates `service-keys` and `sessions` subdirectories in the specified path
  - Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
  - Directories are created automatically if they don't exist
  - Can be used together with `--auth-broker` flag

- **Automatic directory creation** – service keys and sessions directories are now created automatically:
  - Directories are created at server startup if they don't exist
  - Prevents errors when saving sessions for the first time
  - Works for both default platform paths and custom `--auth-broker-path`

- **Enhanced startup information** – improved auth-broker path display at server startup:
  - Shows all search paths for service keys (in order of priority)
  - Shows all save paths for sessions
  - Formatted with clear visual separators for better readability
  - Only displayed when `--auth-broker` flag is used

- **Diagnostic logging** – added platform-aware logging for better debugging:
  - Logs platform information when processing authentication headers
  - Logs all header keys that start with `x-sap` or `x-mcp`
  - Logs search paths when creating AuthBroker instances
  - Helps diagnose issues on different platforms (especially Windows)

### Changed
- **Header validation logic** – improved validation order and case handling:
  - `x-mcp-destination` is now checked immediately after `x-sap-destination`, regardless of `x-sap-url` presence
  - Added case-insensitive header checking for better compatibility
  - Both `x-sap-destination` and `x-mcp-destination` now check headers in both lowercase and original case

- **Documentation updates** – comprehensive documentation improvements:
  - Added `--auth-broker-path` parameter documentation in help text
  - Updated `CLIENT_CONFIGURATION.md` with custom path examples
  - Updated `INSTALLATION.md` with new command-line option
  - Updated `SERVICE_KEY_SETUP.md` with custom path usage examples
  - Added Cline configuration example in help text

### Dependencies
- **Updated `@mcp-abap-adt/auth-broker` to `^0.1.3`** – upgraded to latest version
- **Updated `@mcp-abap-adt/header-validator` to `^0.1.3`** – upgraded to latest version

## [1.1.20] - 2025-12-01

### Changed
- **Help documentation improvements** – updated help messages with detailed instructions for saving service keys:
  - Added platform-specific instructions for Linux, macOS, and Windows
  - Replaced example JSON structure with instructions to copy service key from SAP BTP
  - Fixed backslash escaping in Windows PowerShell commands
  - Updated both launcher help (`bin/mcp-abap-adt.js`) and server help (`src/index.ts`)
  - Updated documentation files: `SERVICE_KEY_SETUP.md` and `CLIENT_CONFIGURATION.md`

## [1.1.19] - 2025-11-30

### Changed
- **Handler refactoring** – migrated handlers to use `CrudClient` and `SharedBuilder` from `@mcp-abap-adt/adt-clients`:
  - `handleSearchObject` now uses `SharedBuilder.search()` instead of manual URL construction
  - Eliminates redundant URL concatenation and potential duplication errors
  - Better code reuse and consistency across handlers

- **URL handling simplification** – removed unnecessary URL cleaning logic:
  - URLs from `.env` files and service keys are expected to be clean
  - Removed aggressive URL cleaning that was causing issues
  - Only basic trimming is performed where needed

- **Transport-specific auth-broker handling** – `auth-broker` is now ignored for `stdio` and `sse` transports:
  - AuthBroker initialization is skipped for non-HTTP transports
  - Prevents unnecessary errors and resource usage
  - `.env` file is used directly for `stdio` and `sse` transports

### Fixed
- **URL duplication in stdio transport** – fixed incorrect URL formation when using `stdio` transport:
  - Resolved `getaddrinfo ENOTFOUND ...comhttps` errors
  - Proper URL handling in connection initialization
  - Correct `.env` file parsing for `stdio` mode

### Added
- **Lazy AuthBroker initialization** – AuthBroker instances are now created on-demand per destination:
  - AuthBroker is only created when a destination is actually needed (not at server startup)
  - Each destination gets its own AuthBroker instance, cached in a map for reuse
  - Reduces memory usage and startup time when auth-broker is not needed
  - Default AuthBroker instance for non-destination requests

- **Improved method filtering** – only `tools/call` requires SAP configuration:
  - All other MCP methods (`tools/list`, `tools/get`, `initialize`, `ping`, `notifications/initialized`, etc.) work without SAP config
  - Prevents unnecessary authentication errors for metadata requests
  - Better separation between metadata operations and actual tool execution

### Changed
- **AuthBroker instance management** – switched from single instance to per-destination map:
  - `authBrokers` map stores AuthBroker instances keyed by destination name
  - `defaultAuthBroker` for requests without specific destination
  - Lazy initialization via `getOrCreateAuthBroker()` method
  - Better isolation between different destinations

- **Platform store imports** – fixed ES module compatibility:
  - Replaced `require()` with static imports in `getPlatformStores()`
  - Fixes "UnixFileSessionStore is not a constructor" error
  - Proper ES module support for platform-specific stores

### Fixed
- **ES module compatibility** – fixed "UnixFileSessionStore is not a constructor" error:
  - Changed `getPlatformStores()` to use static imports instead of `require()`
  - Properly handles ES module exports for Unix/Windows store implementations
  - AuthBroker now correctly initializes on Unix systems

- **Request processing logic** – improved handling of requests that don't require SAP connection:
  - Only `tools/call` method triggers SAP configuration validation
  - All other methods bypass authentication checks
  - Prevents false errors for metadata and initialization requests

## [1.1.17] - 2025-11-28

### Added
- **Cross-platform session storage** – optional persistent session management:
  - Session storage now disabled by default (stateless mode)
  - Enable via `MCP_ENABLE_SESSION_STORAGE=true` environment variable
  - Custom session directory via `MCP_SESSION_DIR=/path/to/sessions`
  - Platform-specific defaults: Windows temp dir, `/tmp` on Linux, `/var/folders` on macOS
  - Prevents `ENOENT` errors when running from different working directories

- **Cline configuration documentation** – comprehensive setup guide:
  - Created `doc/installation/CLINE_CONFIGURATION.md` with detailed configuration for all transport types
  - Added example configs in `doc/installation/examples/` for NPX, global install, and local development
  - Platform-specific notes for macOS, Linux, and Windows
  - Session storage configuration examples and best practices
  - Troubleshooting guide for common connection issues

- **Cross-platform fixes documentation** – created `doc/development/CROSS_PLATFORM_FIXES.md`:
  - Documented dotenv removal and stdio transport fixes
  - Cross-platform path handling with `os.tmpdir()` and `path.join()`
  - Platform-specific session storage locations
  - Testing instructions for all three transports (stdio, HTTP, SSE)

### Changed
- **Session storage architecture** – improved reliability and cross-platform support:
  - Moved from relative `.sessions` path to absolute paths using `os.tmpdir()`
  - Session storage now optional and controlled by environment variables
  - Removed `FileSessionStorage` usage from individual handlers (e.g., `handleDeletePackage`)
  - All session management now centralized in connection manager (`utils.ts`)

- **Environment variable documentation** – comprehensive env var reference:
  - Added table of all available environment variables in Cline configuration docs
  - Documented `MCP_ENABLE_SESSION_STORAGE` and `MCP_SESSION_DIR` usage
  - Platform-specific default values and examples
  - Guidance on when to enable/disable session storage

### Fixed
- **Session directory creation errors** – fixed `ENOENT: no such file or directory, mkdir '/.sessions'`:
  - Replaced relative `.sessions` path with absolute paths
  - Session directory now uses OS-specific temp directory by default
  - Works correctly when running as global npm package or via npx
  - No longer depends on current working directory

- **Handler session management** – simplified connection handling:
  - Removed custom `FileSessionStorage` creation in `handleDeletePackage`
  - Deprecated `force_new_connection` parameter (now ignored)
  - All connections use centralized session management
  - Restart server to force new session instead of per-handler sessions

### Dependencies
- No dependency changes in this release

## [1.1.16] - 2025-01-XX

### Removed
- **dotenv dependency** – completely removed `dotenv` package from dependencies:
  - Eliminated `dotenv` as a dependency to prevent stdout pollution in stdio mode
  - Resolved `"[dotenv@17."... is not valid JSON` error that was breaking stdio transport
  - Server now uses manual `.env` file parsing for all transport modes

### Changed
- **.env file parsing** – replaced `dotenv` library with manual parsing:
  - Manual `.env` file parsing for all transport modes (stdio, http, sse)
  - Supports both Unix (`\n`) and Windows (`\r\n`) line endings
  - Handles comments, quoted values, and empty lines correctly
  - Cross-platform compatible (works on Linux, Windows, macOS)
  - No external dependencies for environment variable loading

- **stdio mode auto-detection** – improved stdio mode detection:
  - Auto-detects stdio mode when `stdin` is not a TTY (piped by MCP Inspector or other tools)
  - Checks `!process.stdin.isTTY` in addition to command-line arguments and environment variables
  - Allows seamless connection from MCP Inspector and other stdio-based clients without explicit `--transport=stdio` flag

- **stderr handling in stdio mode** – restored stderr for error logging:
  - Following reference implementation pattern, stderr is now available for error logging in stdio mode
  - stdout remains reserved exclusively for MCP JSON-RPC protocol
  - console.error() and console.warn() now work correctly in stdio mode (write to stderr)

### Fixed
- **stdio transport connection** – fixed issue where server was not connecting properly in stdio mode:
  - Server now correctly detects stdio mode when launched by MCP Inspector
  - Tools are properly registered and available when connecting via stdio
  - Resolved connection issues that prevented tools from being listed

### Dependencies
- Updated `@mcp-abap-adt/connection` to `^0.1.12`:
  - Connection package no longer reads `.env` files or depends on `dotenv`
  - Consumers must pass `SapConfig` directly to connection constructors
- Updated `@mcp-abap-adt/adt-clients` to `^0.1.27`:
  - Updated to work with connection@0.1.12
  - Fixed example scripts to use manual `.env` parsing

## [1.1.15] - 2025-01-27

### Fixed
- **Git tag management** – fixed issues with release tag creation and management:
  - Corrected tag placement on the latest commit with CHANGELOG updates
  - Ensured proper tag synchronization between local and remote repositories
  - Fixed tag deletion and recreation workflow for release management

## [1.1.14] - 2025-01-27

### Added
- **Command-line flags --version/-v and --help/-h** – added support for standard command-line flags:
  - `--version` or `-v` – displays package version and exits
  - `--help` or `-h` – displays help message and exits
  - Flags are processed before any other initialization, allowing quick version/help checks

### Changed
- **.env file search logic** – improved .env file discovery and loading:
  - **Search location:** Now searches for `.env` file only in the current working directory (where the command is executed)
  - **No recursive search:** Removed fallback searches in parent directories or project root
  - **Explicit path support:** Still supports `--env=/path/to/.env` or `MCP_ENV_PATH` environment variable for custom locations
  - **Cross-platform paths:** Uses `path.resolve()` and `path.join()` for proper path handling on Windows, Linux, and macOS

- **Transport mode and .env file relationship** – refined logic for transport mode selection and .env file requirements:
  - **Default behavior:** If transport is not explicitly specified and no `.env` file is found, server starts in HTTP mode (no .env required)
  - **Explicit transport with .env:** If transport is explicitly set to `stdio` or `sse` but `.env` file is missing, server exits with clear error message
  - **Explicit transport without .env:** If transport is explicitly set to `http` or `streamable-http`, server starts without .env file (as expected)
  - **Error messages:** Improved error messages that clearly indicate what transport mode requires .env file and how to specify custom .env location

### Fixed
- **Cross-platform compatibility** – ensured all file path operations work correctly on Windows, Linux, and macOS:
  - All path operations use Node.js `path` module methods (`path.join()`, `path.resolve()`, `path.isAbsolute()`)
  - Proper handling of Windows path separators (`\`) vs Unix path separators (`/`)
  - Version reading from `package.json` uses cross-platform path resolution

## [1.1.13] - 2025-01-27

### Fixed
- **Handler parameter schemas alignment with CrudClient** – comprehensive fix to ensure all handler input schemas match actual CrudClient method parameters:
  - **Data Element handlers:**
    - Added `type_name` parameter to `handleCreateDataElement` schema (was missing but used in code)
    - Added `search_help`, `search_help_parameter`, `set_get_parameter` to `handleUpdateDataElement` schema (now properly passed to builder)
    - Updated field label descriptions to clarify they are applied during update step after creation
  - **Domain handlers:**
    - Removed unsupported parameters from `handleCreateDomain` low-level handler: `domain_type`, `application`, `master_system`, `responsible`
  - **Program handlers:**
    - Removed `master_system` and `responsible` from both high and low-level handlers (these are set automatically by system)
  - **Class handlers:**
    - Removed `master_system` and `responsible` from high-level handler schema (set automatically by system)
    - Removed `master_system` and `responsible` from low-level handler schema and code
  - **Interface handlers:**
    - Removed `master_system` and `responsible` from both high and low-level handlers (set automatically by system)
  - **Structure, View, Table handlers:**
    - Removed `master_system` and `responsible` from low-level create handlers (set automatically by system)
  - **Behavior Definition, Metadata Extension handlers:**
    - Removed `master_system` and `responsible` from low-level create handlers (set automatically by system)
  - **Impact:** All handler schemas now accurately reflect what parameters are actually supported and used by CrudClient methods, preventing confusion and ensuring correct API usage

### Changed
- **Data Element handlers – search help support** – enhanced data element handlers to support search help configuration:
  - `handleCreateDataElement` now accepts `search_help`, `search_help_parameter`, `set_get_parameter` parameters
  - `handleUpdateDataElement` now accepts `search_help`, `search_help_parameter`, `set_get_parameter` parameters
  - These parameters are properly passed through to `DataElementBuilder` and included in update operations
  - Enables full configuration of search help and parameter settings for data elements

### Dependencies
- **Updated `@mcp-abap-adt/adt-clients` to `^0.1.26`** – upgraded to latest version which includes:
  - Added `searchHelp`, `searchHelpParameter`, `setGetParameter` to `DataElementBuilderConfig`
  - Updated `DataElementBuilder.update()` to pass search help parameters to `UpdateDataElementParams`
  - Full support for search help configuration in data element operations

## [1.1.11] - 2025-11-28

### Fixed
- **DomainHighHandlers - Update workflow detection bug** – fixed critical issue where domain update operations were incorrectly using CREATE workflow instead of UPDATE workflow:
  - **Root cause:** `DomainBuilder.update()` method determines which workflow to use (CREATE vs UPDATE) by checking if `this.state.createResult` exists. When `CrudClient.getDomainBuilder()` reuses a builder instance from a previous `createDomain()` call, the builder still has `createResult` in its state, causing `update()` to incorrectly use CREATE workflow (`upload()` function) instead of UPDATE workflow (`updateDomain()` function).
  - **Solution:** Modified `handleUpdateDomain` to pass `packageName` directly to `lockDomain()` call, ensuring the builder is created with correct configuration from the start. This prevents builder reuse issues and ensures proper workflow detection.
  - **Additional fix:** Removed redundant validation step from `handleUpdateDomain` handler. The validation was checking if domain exists, but `lockDomain()` will fail if domain doesn't exist anyway, making the validation step unnecessary and potentially causing confusion.
  - **Impact:** Domain update operations now correctly use UPDATE workflow for existing domains, preventing "Domain already exists" errors that were occurring when the system tried to create an already-existing domain.

### Changed
- **DomainHighHandlers test logging** – completely refactored test logging system for better information density and clarity:
  - **Removed verbose `debugLog()` system** – eliminated all `debugLog()` calls that were cluttering test output with verbose JSON structures and nested data objects
  - **Introduced concise logging** – replaced with simple, informative `console.log()` statements that provide clear, actionable information:
    - Clear operation names (e.g., "High Create: Creating domain...", "High Update: Updating domain...")
    - Success/failure status with object names
    - Skip reasons when tests are skipped
    - Visual infographics (emojis) for quick visual scanning of test output
  - **Simplified error handling** – removed redundant try-catch blocks and verbose error logging, now relies on Jest's native error handling which provides better stack traces
  - **More informative output** – each log statement now provides essential information (operation type, object name, status) without JSON noise
  - **Consistent with other tests** – matches logging patterns used in BehaviorDefinitionHighHandlers, PackageHighHandlers, and other high-level handler tests
  - **Better maintainability** – removed ~50 lines of verbose debug logging code, making tests easier to read and maintain
  - **Improved debugging** – concise logs make it easier to identify which operation failed and why, without scrolling through JSON dumps

### Dependencies
- **Updated `@mcp-abap-adt/adt-clients` to `^0.1.25`** – upgraded to latest version which includes:
  - Improved `DomainBuilder.update()` workflow detection logic
  - Better handling of CREATE vs UPDATE workflow selection based on builder state
  - Enhanced error messages for domain operations

### Documentation
- **Test Issues Roadmap** – comprehensive update to development roadmap:
  - **Issue #10 (DomainHighHandlers)** – changed status from "Expected Skip" to "Fixed" with detailed explanation
  - **Updated statistics:** 8 fixed issues (was 7), 1 expected skip (was 3)
  - **Added detailed problem analysis:** Documented root cause, solution approach, and code changes
  - **Improved issue tracking:** Better categorization of issues vs expected skips vs cloud limitations

### Development Process
- **Issue Roadmap System** – introduced systematic problem analysis and resolution tracking:
  - **New workflow:** Test failures are now systematically analyzed and documented in `doc/development/TEST_ISSUES_ROADMAP_*.md`
  - **Issue classification:** Problems are categorized as Simple (⚡) or Complex (🔍), with clear distinction between real issues and expected skips
  - **Problem analysis:** Each issue includes detailed error messages, root cause analysis, solution approach, and code references
  - **Progress tracking:** Roadmap maintains statistics on fixed vs pending vs expected issues, providing clear visibility into test suite health
  - **Solution documentation:** All fixes are documented with code references, making it easier to understand what was changed and why
  - **Continuous improvement:** Roadmap is updated after each test run, ensuring it reflects current state and helps prioritize future work
  - **Benefits:** Enables faster problem resolution, prevents duplicate work, and provides historical context for similar issues

## [1.1.10] - 2025-11-27

### Added
- **Behavior Implementation integration tests** – added comprehensive integration tests for Behavior Implementation handlers:
  - `BehaviorImplementationLowHandlers.test.ts` – full workflow test: Validate → Create → Check → Lock → Update → Unlock → Activate
  - `BehaviorImplementationHighHandlers.test.ts` – high-level handler test: CreateClass → Update implementations include → DeleteClass
  - Both tests include detailed step-by-step logging for better visibility and debugging
  - Tests use `implementationCode` parameter for custom implementations include code
  - Proper cleanup logic ensures test objects are deleted only if successfully created
- **Test configuration parameter for Behavior Implementation** – added `implementation_code` parameter:
  - Separate parameter for updating implementations include (local handler class) in low-level handler tests
  - `update_source_code` parameter for high-level handler tests
  - Updated test templates with correct implementation code structure
  - Improved test configuration clarity and maintainability

### Changed
- **Behavior Implementation HighHandlers test** – simplified test implementation:
  - Removed manual session state management (save/restore) – CrudClient now manages session internally
  - Removed low-level handler imports (`handleLockClass`, `handleUnlockClass`, `handleActivateClass`)
  - Test now uses only CrudClient methods for lock → update → unlock → activate workflow
  - Aligns with high-level handler pattern where each handler manages its own session and lock/unlock operations
- **Behavior Implementation handlers** – updated to use types from `@mcp-abap-adt/adt-clients`:
  - All handler parameter types now imported from `adt-clients` package
  - Ensures type consistency across handlers and client library
  - `handleCreateBehaviorImplementation` now correctly uses `BehaviorImplementationBuilderConfig` type

### Fixed
- **Behavior Implementation test configuration** – fixed test configuration for managed behavior definitions:
  - Removed `read FOR READ` method from implementation code examples in `test-config.yaml` and `test-config.yaml.template`
  - For managed behavior definitions, `read` method is auto-generated and should not be included in custom implementation code
  - Updated both low-level and high-level test configurations with correct implementation code structure
  - Tests now correctly handle managed behavior implementation classes without superfluous `read` method errors

## [1.1.10] - 2025-11-26

### Added
- **Client Connection Isolation**: Implemented per-session connection isolation to prevent data mixing between different clients
  - Each client session now maintains its own isolated SAP connection based on `sessionId` and configuration hash
  - Connections are cached per unique combination of `sessionId` + `sapUrl` + authentication parameters
  - Uses `AsyncLocalStorage` to pass session context to handlers, ensuring each request uses the correct connection
  - Prevents race conditions where concurrent requests from different clients could overwrite each other's connection settings
  - Backward compatible: falls back to global connection cache for non-HTTP transports (stdio)

- **Non-Local Connection Restrictions**: Added security restrictions for non-local connections
  - **SSE Transport**: Always restricted to localhost connections only (127.0.0.1, ::1, localhost)
  - **HTTP Transport**: Non-local connections are restricted when:
    - `.env` file exists (was found at startup)
    - AND request does not include SAP connection headers (`x-sap-url`, `x-sap-auth-type`)
  - Non-local connections with SAP headers are allowed (enables multi-tenant scenarios)
  - Local connections are always allowed regardless of `.env` file presence
  - Clear error messages guide users when connections are rejected

### Changed
- **Connection Management**: Refactored `getManagedConnection()` to support session-based connection caching
  - Added `generateConnectionCacheKey()` function to create unique cache keys from sessionId and config signature
  - Implemented `getConnectionForSession()` to retrieve or create session-specific connections
  - Added automatic cleanup of old connection cache entries (older than 1 hour)
  - Each session uses unique `sessionId` for its `AbapConnection` to prevent session mixing

- **Session Tracking**: Enhanced `streamableHttpSessions` to store SAP configuration per session
  - Added `sapConfig` field to session objects to track configuration per client
  - `applyAuthHeaders()` now stores configuration in session object
  - Session cleanup automatically removes associated connection from cache

### Security
- **Connection Isolation**: Prevents one client from receiving another client's data when multiple clients connect to different SAP systems
- **Access Control**: Restricts non-local access when `.env` file is present, requiring explicit SAP headers for remote connections

## [1.1.9] - 2025-11-24

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
- **Full Low-Level CRUD Coverage**:
  - Added dedicated `create`, `lock`, `unlock`, `check`, `validate`, `delete`, and `update` handlers for classes, programs, interfaces, function groups/modules, domains, data elements, packages, tables, views, structures, transports, and more to cover every `CrudClient` method.
  - Each handler now has a consistent naming scheme (`CreateX`, `UpdateX`, etc.) to match the high-level counterparts.

- **System Management Tools**:
  - `GetInactiveObjects`: Retrieve list of inactive ABAP objects (objects that have been modified but not activated)
  - Provides count and detailed list of objects waiting for activation
  - Useful for monitoring development progress and identifying objects requiring attention

### Changed
- **Handler Organization Refactoring**: All handlers reorganized into categorized subdirectories with explicit `high/`, `low/`, and `readonly/` layers for better maintainability. Each low-level handler description now starts with `[low-level]`, and every read handler was moved to the new `readonly/` folders and tagged `[read-only]`. This improves discoverability, enforces single-responsibility boundaries, and makes it clear which tools mutate SAP data.
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
- **Tooling Improvements**:
  - `tools/generate-tools-docs.js` now outputs a navigation tree that mirrors the document structure, separates high-/low-/read-only tools, and adds summary counts for each level.
  - `doc/user-guide/AVAILABLE_TOOLS.md` regenerated to include the new navigation, level-specific anchors, and the `[read-only]` marker.
  - Test suite, configs, and helper scripts updated to follow the new directory layout and renamed high-level handlers (`UpdateClass`, `UpdateProgram`, etc.).
- **Low-Level Tool Names**:
  - Every low-level handler now advertises a unique MCP tool name suffixed with `Low` (e.g., `CreateClassLow`, `UpdateDomainLow`, `LockPackageLow`). This prevents `Tool <name> is already registered` errors when both low/high versions exist and keeps the server compatible with clients that look up tools by name.

### Documentation
- Added `implementation_plan.md`: Plan for future refactoring of read handlers to `src/readers` directory
- Removed `roadmap.md`: Work items are complete, so the standalone roadmap is no longer required

## [1.1.8] - 2025-11-24

_Documentation for this tag is intentionally minimal; see the Git tag `v1.1.8` for its exact contents._

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
- Added documentation for both tools: see [DetectObjectTypeListTools.md](docs/development/DetectObjectTypeListTools.md).
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
