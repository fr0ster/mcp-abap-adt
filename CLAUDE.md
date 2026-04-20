# MCP ABAP ADT - Development Guide

## Testing

### Integration Tests

Integration tests run against a real SAP system. Two modes:

- **Soft mode** (default, `integration_hard_mode.enabled: false`): calls handlers directly, no MCP subprocess.
- **Hard mode** (`integration_hard_mode.enabled: true`): spawns full MCP server via stdio, calls tools through MCP protocol.

**Strategy**: Run soft mode for mass regression testing. Use hard mode only for targeted verification of recent changes.

**Shared objects**: Before the first test run, create shared SAP objects (tables, CDS views, service definitions, classes) that some tests depend on:
```bash
npm run shared:setup     # first run only, persists across test runs
npm run shared:check     # verify they exist
```

**Important**: Shared object setup and SAP environment verification require collaboration with the user. Don't try to automate everything — run `shared:setup` once, show the result, and ask the user to verify activation in ADT. If activation fails, ask the user what they see rather than retrying blindly.

**Running integration tests**: Always save full output to a log file — do NOT truncate with `tail`. Tests take 15-25 minutes; use `timeout 1800` (30 min) or `run_in_background` with no timeout truncation. This avoids re-running long tests just to see errors.

```bash
# Soft mode (mass run) — save full log
npm run test:integration 2>&1 | tee /tmp/integration-test.log

# Hard mode (targeted, in test-config.yaml set integration_hard_mode.enabled: true)
npm test -- --testPathPatterns=<specific-test>
```

### Test Configuration

All test parameters live in `tests/test-config.yaml` (gitignored). The template (`tests/test-config.yaml.template`) works out of the box with sensible defaults.

**Setup:**
```bash
cp tests/test-config.yaml.template tests/test-config.yaml
# Edit ONLY the lines marked "# ← CHANGE"
```

**Required changes** (marked `# ← CHANGE`):
- `environment.env` — session .env file name (`"e19.env"`, `"mdd.env"`) from standard sessions folder
- `environment.system_type` — `"onprem"`, `"cloud"`, or `"legacy"`
- `environment.connection_type` — `"http"` (default) or `"rfc"`
- `environment.default_package` — dev package (`ZMCP_TEST`, `$TMP`)
- `environment.default_transport` — transport request or `""` for local packages
- `shared_dependencies.package` — package for shared test objects
- `shared_dependencies.software_component` — `"LOCAL"`, `"HOME"`, etc.

Everything else (object names, timeouts, CDS sources, unit test code) has working defaults. See `docs/development/tests/TESTING_GUIDE.md` for full details.

### available_in

`available_in` in `TOOL_DEFINITION` restricts tool to specific SAP environments. If omitted, the tool is available everywhere. Only set it when a tool genuinely doesn't work on some platform (e.g., Programs are onprem-only):

```typescript
available_in: ['onprem', 'legacy'] as const,  // not available on cloud
```

Values: `'onprem'` | `'cloud'` | `'legacy'`. If omitted, tool is available everywhere. Test-level `available_in` is controlled separately in `test-config.yaml.template`.

### Cloud vs On-Prem

- Programs are NOT available on ABAP Cloud (`available_in: ['onprem', 'legacy']`)
- Runtime profiling (class-based) and dumps work on both cloud and onprem
- `RuntimeRunProgramWithProfiling` is onprem-only (no programs on cloud)

## npm Package Verification

When checking whether an installed npm package contains specific code, always search inside `node_modules/` directly (e.g., `grep -r "pattern" node_modules/@scope/package/`). VS Code search and ripgrep skip `node_modules` by default due to `.gitignore`, which leads to false "not found" conclusions. The code may be there — you're just not looking in the right place.

## Plans and Specs

After a plan under `docs/superpowers/plans/` or spec under `docs/superpowers/specs/` has been fully implemented, delete the file. Keep only active (not yet implemented) plans and specs in the tree — implementation history lives in git, not in these directories.
