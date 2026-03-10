# Integration Testing Guide

Integration tests run against a real SAP system using Jest. All test parameters are configured via `tests/test-config.yaml`.

## Quick Start

### 1. Environment file

Create `.env` in the project root:

```env
SAP_BASE_URL=https://your-sap-system.com:port
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_CLIENT=100
```

For non-unicode legacy systems add `SAP_UNICODE=false`.

### 2. Test configuration

```bash
cp tests/test-config.yaml.template tests/test-config.yaml
```

The template works out of the box with sensible defaults. Edit **only** the lines marked `# <- CHANGE`:

| Parameter | Description | Example |
|---|---|---|
| `environment.default_package` | Dev package for test objects | `ZMCP_TEST`, `$TMP` |
| `environment.default_transport` | Transport request (or `""` for local) | `E19K900001` |
| `shared_dependencies.package` | Package for shared test objects | `ZMCP_SHARED` |
| `shared_dependencies.software_component` | Software component | `LOCAL`, `HOME` |

Optional (cloud/BTP only):

| Parameter | Description |
|---|---|
| `auth_broker.abap.destination` | Auth broker destination (`TRIAL`, `mcp`) |
| `auth_broker.service_keys_dir` | Path to service keys dir |

All other values (object names, timeouts, CDS sources, unit test code) have working defaults.

### 3. Run tests

```bash
# Build first
npm run build

# Run all integration tests (soft mode)
npm run test:integration

# Run specific object type
npm test -- --testPathPatterns=class

# Run selective tests (e.g. class + unit test + CDS)
npm test -- --testPathPatterns="class|unitTest|cds"
```

## Test Modes

- **Soft mode** (default, `integration_hard_mode.enabled: false`): calls handlers directly, no MCP subprocess. Use for mass regression testing.
- **Hard mode** (`integration_hard_mode.enabled: true`): spawns full MCP server via stdio, calls tools through MCP protocol. Use for targeted verification.

## Test Levels

Each object type has up to three test levels:

- **HIGH** (`HighTester`): Tests full handler workflow (create -> update -> activate -> delete)
- **LOW** (`LowTester`): Tests low-level ADT client operations
- **Lambda** (`LambdaTester`): Tests individual handler functions in isolation

## Cleanup Behavior

Tests run cleanup automatically in `afterEach` (even on failure), unless disabled via `cleanup_after: false` in config. Pre-test cleanup (`ensureObjectReady`) deletes leftover objects from previous runs.

## Shared Dependencies

Persistent SAP objects used across multiple tests (tables, CDS views, classes). Created lazily, never deleted automatically.

```bash
npm run shared:setup     # Create all shared objects
npm run shared:teardown  # Delete all shared objects
npm run shared:check     # Verify shared objects exist
```

## Debugging

```bash
# Connection debug logs
DEBUG_TESTS=true npm test -- --testPathPatterns=class

# ADT operation logs
DEBUG_ADT_TESTS=true npm test -- --testPathPatterns=view
```

## Troubleshooting

1. **"Object already exists"** — previous test run left objects. Run the test again (pre-cleanup will handle it) or delete manually.
2. **Connection errors** — check `.env` credentials and SAP system availability.
3. **Timeout errors** — increase `test_settings.timeout` in `test-config.yaml`.
4. **"Resource is not locked"** — session management issue, retry or check stateful session support.
