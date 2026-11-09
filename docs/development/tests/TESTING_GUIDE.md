# Integration Testing Guide

Integration tests run against a real SAP system using Jest. All test parameters are configured via `tests/test-config.yaml`.

## Quick Start

### 1. Session .env file

Place your SAP credentials in the standard sessions folder (`~/Documents/mcp-abap-adt/sessions/` on Windows, `~/.config/mcp-abap-adt/sessions/` on Unix):

```env
# e.g., ~/Documents/mcp-abap-adt/sessions/your-system.env
SAP_URL=http://your-sap-system.com:8000
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_MASTER_SYSTEM=DEV
SAP_RESPONSIBLE=your-username
```

### 2. Test configuration

```bash
cp tests/test-config.yaml.template tests/test-config.yaml
```

The template works out of the box with sensible defaults. Edit **only** the lines marked `# ← CHANGE`:

| Parameter | Description | Example |
|---|---|---|
| `environment.env` | Session .env file name from sessions folder | `"your-system.env"`, `"another-system.env"` |
| `environment.system_type` | SAP system type | `"onprem"`, `"cloud"`, `"legacy"` |
| `environment.connection_type` | Connection protocol | `"http"` (default), `"rfc"` |
| `environment.realm_check_url` | RFC only, test-only (never part of the destination): the system's HTTP URL the realm check (the `401` and its realm) runs against, since an RFC destination states no `SAP_URL`. Required over RFC — without it the run is refused before anything is sent; over HTTP the session's `SAP_URL` is checked and this is not read | `"https://saphost.example:44300"` |
| `environment.ashost`, `sysnr`, `client`, `language` (and `mshost`, `msserv`, `sysid`, `group`, `saprouter`) | RFC only: the destination's address, client and logon language, over the session `.env`'s — an RFC destination states one address, `SAP_CLIENT` and `SAP_LANGUAGE`, and no `SAP_URL` | `"saphost.example"`, `"00"`, `"100"`, `"EN"` |
| `environment.default_package` | Dev package for test objects | `ZMCP_TEST`, `$TMP` |
| `environment.default_transport` | Transport request (or `""` for local) | `SIDK900001` |
| `shared_dependencies.package` | Package for shared test objects | `ZMCP_SHARED` |
| `shared_dependencies.software_component` | Software component | `LOCAL`, `HOME` |

Optional (cloud/BTP, JWT token refresh):

| Parameter | Description |
|---|---|
| `auth_broker.abap.destination` | Auth broker destination (`TRIAL`, `mcp`) |

All other values (object names, timeouts, CDS sources, unit test code) have working defaults.

### 3. Create shared objects (first run only)

Some tests depend on shared SAP objects (tables, CDS views, classes). Create them before running tests for the first time:

```bash
npm run shared:setup
```

Verify with `npm run shared:check` (it reads every shared object from the system and lists the absent ones by name). These objects persist across test runs — no need to re-create unless deleted via `npm run shared:teardown`.

### 4. Run tests

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

### One Jest configuration for every package

The root `jest.config.js` holds the repository's only Jest configuration: its `roots` name the root `src` and every
package's `src` (`server-runtime`, `server`, `http`, `sse`, `background-runs-memory`, `responsible-rules`, the compact packages and
the six `-ro` packages), and its `moduleNameMapper` resolves every sibling package to its sources. The mapper is built
from the package-name table, `tsconfig.paths.json` (each name and its source entry), which `tsconfig.test.json` also
extends for the type checker; the table is the only list of those names. Jest ignores every file listed in
`tools/node-test-files.json`, the test files that run on node:test instead. The root
`npm test` runs every package's suites once. A package's own `npm test` runs that same configuration for its folder
only (`npm --prefix .. test -- --roots <package>/src`), so it works from inside the package:

```bash
cd server-runtime && npm test   # the runtime's suites alone (the three transports' launchers and servers)
npm --prefix http test          # http's own suites (its exports), from the repository root
```

A package's `test:check` still type-checks its tests against its own `tsconfig.test.json`.

**Node for the tests: 22.15 or later.** The files on node:test load the same names through a
resolve hook registered with `module.registerHooks`, which Node has since 22.15. The package's
`engines` (`>=22.0.0`) is what the server needs to run and is unchanged; developing and running
the tests needs Node 22.15 or later (CI takes the latest 22 and 24).

### Two runners: Jest and node:test

The tests are moving from Jest to Node's own runner, `node:test`. Until the last one moves,
`npm test` (`tools/npm-test.mjs`) runs both: Jest over its files, then the node:test build and
`tools/run-tests.mjs` over the files of `tools/node-test-files.json`. Both run even when the
first fails, and `npm test` fails when either does.

- **The build.** `npm run test:build` removes `.test-build/` and compiles the listed files, with
  what they import, into `.test-build/tree/` (one level down, so the repository root holds no
  package-shaped directory when the build places the root manifest), with the options of `tsconfig.node-test.json` (`types` is `node`
  alone, so a listed file that reaches a Jest global does not compile; `noEmitOnError`, so a
  failed compile emits nothing). `npm test` runs it after Jest.
- **One process per file.** node:test's default; the runner refuses `--test-isolation`.
- **Concurrency is a setting, with no default.** The runner takes `--concurrency <N>`, or the
  variable `TEST_CONCURRENCY` when no option is given; with neither it refuses to run. The
  number is the resources' of the machine running it, so each run states it: `npm test` passes
  `2` (a developer machine), and CI passes its own per cell after it
  (`npm test -- --concurrency <N>`; given twice, the last one wins) — `2` on every runner
  kind, from `ci.yml`'s matrix, and `2` in `release.yml`. The figures are below.
- **Variables without a shell.** `--env NAME=VALUE` sets a variable for the run on every
  platform.
- **Selecting files.** `npm test -- <path>.test.ts` sends a listed file to the runner; every other
  positional argument (a file or a pattern) goes to Jest — as exact paths (`--runTestsByPath`)
  when every one of them is an existing file, else all as Jest's patterns, as before (Jest reads
  all its positional arguments one way). A runner, or Jest, given none of the named files is
  skipped. By path, Jest's `--roots`, `testMatch` and `testPathIgnorePatterns` still apply: a
  named file outside every root, under an ignored live directory or on the node:test list does
  not run under Jest. `--roots <dir>` (the sub-packages' `npm test`) selects that root on both
  runners; a root with no listed file runs Jest alone, with a line saying the runner was skipped.
  With `--roots`, a named file outside every root runs on neither runner.
- **Jest's options.** Other arguments are Jest's, read by Jest's own parser (`jest-cli`'s
  `buildArgv`, the function `jest` reads its command line with), and handed to Jest as given:
  the files and patterns are the positional arguments it reads. An option's value is never taken
  for a file or a pattern (`-t <name>`, `--config <file>`, `--testNamePattern=<x>`, `-it=<x>`);
  a boolean option takes a following `true` / `false`, its `--no-` form none, as yargs reads
  them (`--cache false x` is `cache: false` and a pattern `x`; `--no-cache false x` is
  `cache: false` and two patterns, `false` and `x`); an array option
  (`--reporters`, `--testPathIgnorePatterns`, …) takes every argument after it up to the next
  option — so name files and patterns before such an option. The tool's own options (`--roots`,
  `--concurrency`, `--repo`, `--list`) end such an option as any option does, though Jest never
  sees them. What Jest refuses (an option it does not know, a failed check of its own) is refused
  before anything runs, in Jest's words. A named node:test file reaches Jest too, which ignores
  every file of the list. `--help` and `--version` print Jest's answer and end the run, with
  `--list` too (no JSON).
- **Fixture repositories.** `--repo <dir>` (the runner's own tests) builds and runs `<dir>`'s
  node:test list and gives Jest `<dir>/jest.config.js` as its configuration (unless `--config` is
  given), so a fixture's run reaches nothing of this repository's suite; a fixture without its
  own configuration fails.
- **One list, one guard.** A file is on the list or found by Jest, never both and never neither
  (`src/__tests__/unit/runner/partition.test.ts`, which reads Jest's discovery by
  `jest --listTests --json` over its configuration without the live suites' ignores, until
  those move to node:test too).

### The node:test run's concurrency (measured)

**Measured 2026-11-08** (D27). The node:test set of that day — 12 files: the runner's own tests
and the TypeScript-program scans — built with `npm run test:build` and run with
`node tools/run-tests.mjs --concurrency C`. Every run passed. Measured with a hand-run probe:
every node process of the run (the runner, `node --test`, each file and what it starts) sampled
its RSS every 20 ms from a worker thread and recorded `process.resourceUsage().maxRSS` at exit.
The whole-run peak is the highest sum of the live processes' RSS. The probe's own cost per process
(14–20 MB, measured) is subtracted. Each value was run at least three times, the values
interleaved; the figures are min / median / max. Largest file is the median of each run's largest
file process.

| Machine (CPUs / parallelism / RAM) | Node | C | Wall time, s | Whole-run peak RSS, MB | Largest file, MB |
|---|---|---|---|---|---|
| Developer machine, Linux x64 (16 / 16 / 31 GB) | 26 | 1 | 75.9 / 76.5 / 76.9 | 1512 / 1522 / 1535 | 1420 |
| | | 2 | 40.0 / 42.0 / 64.9 | 1996 / 2091 / 2267 | 1425 |
| | | 4 | 32.9 / 42.4 / 46.1 | 3225 / 3487 / 3750 | 1422 |
| | | 16 | 34.2 / 40.5 / 47.3 | 4628 / 5101 / 5212 | 1432 |
| ubuntu-latest (4 / 4 / 15.6 GB) | 22 | 1 | 103.4 / 104.1 / 104.5 | 1218 / 2053 / 2104 | 1948 |
| | | 2 | 66.7 / 67.2 / 68.0 | 1642 / 1797 / 1821 | 1122 |
| | | 4 | 64.7 / 65.3 / 66.0 | 2859 / 2909 / 2928 | 1106 |
| | 24 | 1 | 91.4 / 91.6 / 95.3 | 1281 / 1288 / 1291 | 1188 |
| | | 2 | 58.4 / 59.1 / 59.2 | 1996 / 2014 / 2045 | 1222 |
| | | 4 | 57.1 / 57.1 / 57.5 | 3191 / 3207 / 3270 | 1322 |
| macos-latest, arm64 (3 / 3 / 7 GB) | 22 | 1 | 143.3 / 153.2 / 164.9 | 1127 / 1277 / 1503 | 1200 |
| | | 2 | 77.4 / 78.4 / 80.7 | 1577 / 1641 / 1713 | 1021 |
| | | 3 | 73.7 / 85.1 / 102.8 | 2096 / 2353 / 2491 | 1132 |
| | | 4 | 86.8 / 93.4 / 95.3 | 2629 / 2861 / 2922 | 1047 |
| | 24 | 1 | 98.6 / 114.0 / 137.8 | 1304 / 1437 / 1446 | 1339 |
| | | 2 | 57.4 / 60.2 / 79.2 | 1807 / 1950 / 2198 | 1257 |
| | | 3 | 55.2 / 57.6 / 89.7 | 2747 / 2761 / 2935 | 1295 |
| | | 4 | 61.6 / 67.5 / 85.8 | 2951 / 2999 / 3091 | 1095 |
| windows-latest (4 / 4 / 16 GB) | 22 | 1 | 158.5 / 160.9 / 163.1 | 1043 / 1081 / 1224 | 1005 |
| | | 2 | 107.4 / 108.6 / 109.9 | 1420 / 1606 / 1644 | 1108 |
| | | 4 | 107.4 / 109.3 / 117.8 | 2476 / 2479 / 2694 | 1049 |
| | 24 | 1 | 110.4 / 113.3 / 113.3 | 1261 / 1383 / 1387 | 1303 |
| | | 2 | 74.4 / 74.5 / 76.0 | 1850 / 1996 / 2219 | 1258 |
| | | 4 | 71.1 / 73.2 / 88.7 | 3051 / 3086 / 3130 | 1262 |

On the developer machine at C=1, the TypeScript-program scans each take 0.3–1.4 GB
(`noRegexOverInput` the most, 1420 MB). `npmTest.test.ts` takes 31 s and starts 324 processes,
1.1 GB as a tree.

**What the figures support: 2, everywhere.**
- From 2 on, `npmTest.test.ts`, the longest file at every setting, bounds the wall time.
- 1 is 1.5–2× slower on every machine.
- 4 costs 0.9–1.4 GB more than 2 (medians) for at most 2 s, and on the developer machine
  nothing beyond the noise.
- On macos-latest (3 cores, 7 GB) wall time rises above 2: on Node 22, 3 and 4 are slower than 2;
  on Node 24, 3 is within the noise of 2 and 4 is slower.
- At 2 the whole run peaks at 1.6–2.3 GB, safe on every runner kind.

The figures belong to this list: when files are added to it, measure again and update the
setting.

### The install matrix (`SKIP_INSTALL_MATRIX`)

`src/__tests__/unit/installMatrix.test.ts` proves that every server process loads one copy of
`@mcp-abap-adt/lib` in every install layout: global (a wrapper with its former base, in one command
or in two, either order), local (hoisted, and `--install-strategy=nested`), a runtime at a later
patch than the binary, and an embedder's `compact-readonly-entries` with `lib`. It packs the
eighteen packages once and serves the tarballs from a loopback registry
(`src/__tests__/helpers/tarballRegistry.ts`), which passes every other package request on to
registry.npmjs.org — so it **needs the network**, as `binSmoke.test.ts` does, and never fetches a
package of the release from the registry.

It is the slowest suite of the root `npm test`: **about 100 s** on Linux (measured), about
**20 npm installs** (four at a time). It is part of the full gate list. To leave it out of a local
run, set `SKIP_INSTALL_MATRIX=true`, and the suite prints that it was skipped:

```bash
SKIP_INSTALL_MATRIX=true npm test
```

**Where it runs in CI.** In one cell only: **ubuntu-latest with Node 22**, in `ci.yml` and in
`release.yml`. Every other cell (`ci.yml`: Node 24 on Linux, both macOS cells, both Windows cells;
`release.yml`: Node 24) sets `SKIP_INSTALL_MATRIX: 'true'` on its `npm test` step
(`workflowInventory.test.ts` holds both workflows to that). **Windows is not covered by CI:** with
the suite on, both windows-latest cells hung in `npm test` for over 40 minutes, where the Linux and
macOS cells finished the whole step in 9–11 minutes; the cause is not established. A Windows run
of the install matrix is a local run on a Windows machine.

## Test Modes

- **Soft mode** (default, `integration_hard_mode.enabled: false`): calls handlers directly, no MCP subprocess. Use for mass regression testing.
- **Hard mode** (`integration_hard_mode.enabled: true`): spawns full MCP server via stdio, calls tools through MCP protocol. Use for targeted verification.

## Live Connection Test

`src/__tests__/integration/live/liveConnection.test.ts` packs and installs the library and the core package into a temporary directory (as `binSmoke.test.ts` does), starts the installed server over stdio once per destination, lists tools, calls `GetAdtTypes`, then shuts the server down (`SIGTERM`; end of stdin on Windows) and expects exit code 0 and nothing on stdout but MCP frames. It needs no `test-config.yaml`: set `MCP_LIVE_ENV_PATHS` to one or more session `.env` paths separated by the platform path delimiter (`:` on Linux/macOS, `;` on Windows), optionally `MCP_LIVE_ARGS` for extra launcher arguments (e.g. `--connection-type=rfc`), build, and run it. `MCP_LIVE_ARGS` is split on whitespace with no quoting, so an argument cannot contain a space; a `.env` path that contains the delimiter itself is not supported. Before the parent's logon to each destination it runs the realm check: on premise the `401` realm must equal that destination's entry of `MCP_LIVE_EXPECTED_REALMS` (same delimiter, one entry per `.env`, in order; empty refuses), on the cloud the session's JWT must not have expired. The check runs against the `.env`'s `SAP_URL` over HTTP; an RFC `.env` states no URL, so its check runs against its entry of `MCP_LIVE_REALM_CHECK_URLS` (absolute `http`/`https` URLs separated by whitespace — not the path delimiter, which every URL contains —, one entry per `.env`, in order; an entry that is no such URL is refused before anything is sent), and an RFC destination without one is refused before anything is sent. It runs only under its own live script, never in `npm test`. Without `MCP_LIVE_ENV_PATHS` it skips and prints why.

```bash
npm run build
MCP_LIVE_ENV_PATHS=/path/to/a.env:/path/to/b.env MCP_LIVE_EXPECTED_REALMS='<realm a>:<realm b>' npm run test:live-connection
```

## Test Levels

Each object type has up to two test levels (the low level and `LowTester` left with the low set in 19.0.0; compact's single-step operations are tested against an ADT stand-in in `src/__tests__/unit/lowToCompact.test.ts`):

- **HIGH** (`HighTester`): Tests full handler workflow (create -> update -> activate -> delete)
- **Lambda** (`LambdaTester`): Tests individual handler functions in isolation

## Cleanup Behavior

Tests run cleanup automatically in `afterEach` (even on failure), unless disabled via `cleanup_after: false` in config. Pre-test cleanup (`ensureObjectReady`) deletes leftover objects from previous runs.

## Shared Dependencies

Persistent SAP objects used across multiple tests (tables, CDS views, classes). Created lazily, never deleted automatically.

```bash
npm run shared:setup     # Create all shared objects
npm run shared:teardown  # Delete all shared objects
npm run shared:check     # Config consistency; with a test config, also reads every shared object from the system
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
5. **`PAK/058` "Package … is already locked"** on a package update or delete — the package was already saved in the same ABAP session: over RFC every call shares one, over HTTP lock → update → unlock run in one ABAP session (only LOCK and UNLOCK are sent stateful; the update and everything else are stateless). A package can be saved only once per session; it is `CL_PACKAGE`'s instance buffer, not an enqueue lock. The package tools open a session of their own for this; see [RFC_SETUP.md](../../installation/RFC_SETUP.md#known-limitation-a-package-cannot-be-changed-by-the-session-that-created-or-changed-it).
