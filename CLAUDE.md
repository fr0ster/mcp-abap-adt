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

## Dependencies

**The rule over this whole section: on runtime and toolchain versions we follow
SAP.** Not the newest release, not what the developer's machine happens to run —
what SAP builds and runs against. Two cases are settled below; a third that looks
like them is decided the same way.

### Node follows what SAP BTP actually runs

`engines.node` is `>=22`, the CI and release matrices are **22 and 24**, and
`@types/node` is `^22`.

SAP BTP Cloud Foundry supports Node **22** and **24**; 20 reached end of life on
2026-04-30 and was removed, so restaging a Node 20 app fails. Odd-numbered
releases (21, 23, 25) are not on the platform at all, and `@sap/cds` 10.1.0,
`@sap/cds-compiler` 7.1.0 and `@cap-js/cds-typer` 0.41.1 all declare
`engines.node >=22`.

`@types/node` tracks the **oldest** runtime we claim to support, not the newest
available: types a major or two ahead describe API that is not there on 22, and
the compiler would wave it through. `^22` was measured clean across
`tsconfig.json`, `tsconfig.test.json`, `server/tsconfig.json` and the full suite.

A newer Node on a development machine is fine; nothing here may require it.

### The TypeScript major follows SAP

Stay on `typescript@^6.x`. Take 6.x patches and minors; leave 7 alone until the
CAP toolchain moves, and treat it as a decision already made rather than an
upgrade waiting to happen. Measured 2026-09-24:

- `@sap/cds` 10.1.0, `@sap/cds-dk` 10.1.0, `@sap/cds-compiler` 7.1.0,
  `@cap-js/cds-typer` 0.41.1 and `@cap-js/cds-types` 0.19.0 declare no
  `typescript` peer at all, and CAP's docs name no version — `cds watch` runs
  `cds-tsx`, which transpiles without type checking. But cds-typer and cds-types
  both devDepend on `typescript ^6.0.3`, so 6 is what SAP tests.
- `ts-jest` caps it: the latest, 29.4.13, declares
  `peerDependencies.typescript: ">=4.3 <7"`, and every suite here runs through
  it. `.npmrc` sets `legacy-peer-deps=true`, so npm would install the conflict
  silently rather than refuse it.
- cloud-llm-hub type-checks against this project's `.d.ts` on TypeScript 6 with
  `moduleResolution: node`.

The cheap signal, if the question ever comes back:
`npm view ts-jest peerDependencies.typescript`. Even then SAP moving is the
deciding condition, not ts-jest.

## Plans and Specs

Plans under `docs/superpowers/plans/` and specs under `docs/superpowers/specs/` are kept in the tree only while active — i.e. not yet implemented and not cancelled. Once a plan/spec has been fully implemented OR cancelled, delete the file. History lives in git; these directories hold only work in progress.
