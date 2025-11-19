# Assistant Interaction Guidelines

## Core Rules

### Language Requirements

- **All repository artifacts authored by the assistant** (source code, documentation, comments, commit messages, etc.) **must be written in English**.
- **Direct communication with the user** must follow the language used by the user in the current conversation.
- **Code comments and documentation** must be in English, regardless of conversation language.

### Key Principles

1. **Keep repository artifacts in English** while mirroring the user's language in conversation.
2. **Capture essential project context** so new sessions recover quickly.
3. **Maintain consistency** across all code, documentation, and repository artifacts.
4. **Follow fundamental Cline rules** (see `.clinerules/` directory) - no assumptions about object existence unless explicitly present.

## Project Snapshot

- **Name:** mcp-abap-adt – MCP server for SAP ABAP ADT (ABAP Development Tools).
- **Purpose:** Provides a Model Context Protocol (MCP) server that allows tools like Cline to interact with SAP ABAP systems, retrieve source code, table structures, and perform CRUD operations on ABAP objects.
- **Key Modules:**
  - `src/handlers/` - MCP tool handlers (GetClass, CreateClass, GetTable, etc.)
  - `src/lib/connection/` - ABAP connection implementations (Cloud, OnPrem, Base)
  - `src/lib/` - Core utilities (logger, toolsRegistry, utils, etc.)
  - `tests/` - Test scripts and YAML-based test configuration
- **Primary Commands:**
  - `npm install` - Install dependencies
  - `npm run build` - Build TypeScript to `dist/`
  - `npm test` - Run tests
  - `node tests/test-*.js` - Run individual test scripts
  - `node tests/run-all-tests.js` - Run all enabled tests
- **Build Output:** Compiled JavaScript and type definitions in `dist/`
- **Testing:** YAML-based test configuration in `tests/test-config.yaml` (created from `tests/test-config.yaml.template`)
- **Configuration:** Environment variables loaded from `.env` files (e.g., `e19.env`)

Use this snapshot to rehydrate context quickly when a new chat session starts.

## Code and Documentation Standards

### Code Artifacts

- **Source code** (`.ts`, `.js` files): English only
- **Comments**: English only, explain "why" not "what"
- **Variable/function/class names**: English only, use camelCase for variables/functions, PascalCase for classes
- **Error messages**: English only
- **Log messages**: English only

### Documentation

- **README files**: English only
- **API documentation**: English only
- **Code examples**: English only
- **Commit messages**: English only, follow conventional commits format
- **CHANGELOG entries**: English only
- **Test documentation**: English only

### User Communication

- **Conversation responses**: Match user's language (Ukrainian, English, etc.)
- **Explanations**: Match user's language
- **Questions**: Match user's language
- **Error explanations**: Match user's language

## Fundamental Cline Rules

This project has specific rules in `.clinerules/` directory:

### 01. Fundamental Rule

- **No assumptions about object existence** unless explicitly present in retrieved code or listed by GetIncludesList
- **No reliance on unspecified standards** (SAP, ABAP, documentation standards) unless explicitly specified
- **Context over abstract standards** - never ignore user's context in favor of abstract standards
- **Clarification requirement** - always ask for clarification if language, format, structure are not specified
- **Default language**: English (unless otherwise specified)

### When Working with ABAP Objects

- Only access objects explicitly present in retrieved code
- Use GetIncludesList (or equivalent) to discover dependencies
- Never assume existence of includes, classes, functions, or structures
- Always confirm assumptions with the user before acting

## Architecture Notes

### Connection Types

- **JwtAbapConnection** (formerly CloudAbapConnection): For SAP BTP Cloud ABAP systems (JWT/XSUAA authentication)
- **OnPremAbapConnection**: For on-premise ABAP systems (Basic auth, OAuth2)
- **BaseAbapConnection**: Base class with common functionality

### Handler Structure

- Each handler is a separate file in `src/handlers/`
- Handlers follow MCP tool protocol
- Handlers use centralized caching via `objectsListCache`
- Handlers return structured results (no file writes from handler logic)

### Testing Infrastructure

- **YAML-based configuration**: `tests/test-config.yaml` (created from template)
- **Test helper**: `tests/test-helper.js` provides utilities for loading config
- **Test scripts**: Individual test files (e.g., `test-create-domain.js`)
- **Test execution**: `tests/run-all-tests.js` runs all enabled tests

### Transport and Package Management

- Tests can use `$TMP` package (no transport required)
- Tests can use transportable packages (transport request required)
- Transport requests must be configured in `test-config.yaml`
- See `TEST_SYSTEM_SETUP.md` for detailed setup instructions

## Error Handling

- **Error messages**: English only
- **Log messages**: English only
- **User-facing errors**: Can be translated based on user's language preference
- **Technical errors**: Always in English for debugging

## Code Review Checklist

When reviewing code or documentation:

- [ ] All code comments are in English
- [ ] All variable/function/class names are in English
- [ ] All documentation is in English
- [ ] All commit messages are in English
- [ ] Error messages are in English
- [ ] Log messages are in English
- [ ] Code follows TypeScript best practices
- [ ] No hardcoded credentials or secrets
- [ ] Types are properly defined (avoid `any`)
- [ ] Handlers use centralized caching
- [ ] No file writes from handler logic (only in-memory caching)
- [ ] Fundamental Cline rules are followed (no assumptions about object existence)

## Testing Guidelines

### Test Configuration

- **Template file**: `tests/test-config.yaml.template` (committed to Git)
- **Actual config**: `tests/test-config.yaml` (NOT committed, in `.gitignore`)
- **Required setup**: Copy template and fill in real values (transport requests, package names, etc.)

### Test Execution

- Enable tests by setting `enabled: true` in test configuration
- Run individual tests: `node tests/test-*.js`
- Run all enabled tests: `node tests/run-all-tests.js`
- List available tests: `node tests/run-all-tests.js --list`

### Test Data

- Use realistic ABAP object names (following naming conventions)
- Use `$TMP` package for tests that don't require transport
- Use transportable packages for tests that require transport
- Clean up test objects after testing (if `cleanup_after_test: true`)

## Integration with cloud-llm-hub

This submodule is used by the main `cloud-llm-hub` project:

- **Import path**: `@fr0ster/mcp-abap-adt`
- **Build output**: `dist/` directory
- **Usage**: Imported in `srv/mcp-proxy.ts` and `srv/mcp-manager.ts`
- **MCP Endpoints**: Exposed via CAP service at `/mcp/stream/http` and `/mcp/sse`

When making changes:
1. Build the submodule: `npm run build`
2. Changes are automatically picked up by the main project (if using `file:` dependency)
3. For production, the main project's build process handles submodule compilation

## Additional Resources

- **Testing Guide**: `doc/tests/TESTING_GUIDE.md`
- **Test Infrastructure**: `doc/tests/TEST_INFRASTRUCTURE.md`
- **Test System Setup**: `TEST_SYSTEM_SETUP.md`
- **Testing Roadmap**: `TESTING_ROADMAP.md`
- **Cline Rules**: `.clinerules/` directory

