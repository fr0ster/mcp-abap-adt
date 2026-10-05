# Developer Tools

Utility scripts for developing and maintaining the server. Run them from the repository root with
`node tools/<script>` after `npm run build` (most of them load `dist/`).

Scripts that need a server process do not start one from a checkout by themselves: the server
command lives in `server/` (`@mcp-abap-adt/core`), see
[Installation — from source](../docs/installation/INSTALLATION.md#from-source-development). Start
it there, or use an installed `mcp-abap-adt`, and point the script at its HTTP or SSE URL.

## Runtime Debug Explorer

**`debug-runtime-explorer.js`** — interactive research script for the debugger and trace runtime
APIs: prepares a probe class with a local ABAP Unit test class, runs a baseline test execution and
walks debugger operations step by step.

```bash
node tools/debug-runtime-explorer.js
```

It loads `dist/lib/` and reads its connection from the environment (and a `.env` in the current
directory, through `dotenv`):

- `SAP_URL`, optional `SAP_CLIENT`
- `SAP_AUTH_TYPE` — `basic` (default) with `SAP_USERNAME`, `SAP_PASSWORD`; any other value takes
  `SAP_JWT_TOKEN`

Optional: `DEBUG_PROBE_CLASS` (default: a generated name), `DEBUG_PROBE_PACKAGE` (default:
`environment.default_package` of `tests/test-config.yaml`), `DEBUG_PROBE_TRANSPORT`,
`DEBUG_PROBE_TEST_CLASS` (must start with `LTC_` or `LCL_`), `DEBUG_PROBE_VERBOSE=true` for
request-level logs.

## Runtime Profiling + Dumps Explorer

**`runtime-profiling-dumps-explorer.js`** — interactive script for profiling and dump analysis: create
or update an executable class, run it with profiling, list and read profiler traces
(`hitlist` / `statements` / `dbaccesses`), list dumps (an ABAP user filter is required) and read one.

```bash
node tools/runtime-profiling-dumps-explorer.js --mcp=<destination>
node tools/runtime-profiling-dumps-explorer.js --env=<name>          # sessions store: <sessions>/<name>.env
node tools/runtime-profiling-dumps-explorer.js --env-path=/path/to/.env
```

Optional: `--abap-user=<your ABAP user>` (alias `--user`; default filter for dumps and traces,
otherwise taken from the system information or the basic login), `--package=<package>` (default for
the create/update prompt), `--auth-broker-path=<dir>`, `--browser-auth-port=<port>`,
`--browser=<browser>`, `--verbose`, `--help`.

## MCP CRUD Smoke Runner

**`mcp-crud-smoke.js`** — a real MCP client that runs `CreateProgram -> GetProgram -> UpdateProgram
-> GetProgram -> DeleteProgramLow` against a running server, from the YAML cases in
`tests/test-config.yaml` (`create_program.test_cases`).

```bash
node tools/mcp-crud-smoke.js --transport=http      # default URL http://127.0.0.1:3000/mcp/stream/http
node tools/mcp-crud-smoke.js --transport=sse --url=http://127.0.0.1:3001/sse
node tools/mcp-crud-smoke.js --case=<case> --fail-fast --suffix=<suffix>
node tools/mcp-crud-smoke.js --help
```

Defaults not given on the command line come from `tests/test-config.yaml` →
`environment.integration_hard_mode`. For `--transport=stdio` pass the server command with
`--stdio-command=` and `--stdio-arg=` (repeat); the default is the installed `mcp-abap-adt`
(`--transport=stdio --env-path=.env`).

**`mcp-crud-matrix.js`** — runs the same smoke cases over one protocol from the YAML
(`--protocol=http|sse|stdio` to override) or, explicitly, several (`--protocols=http,sse,stdio`).

`npm run smoke:mcp:crud` and `npm run smoke:mcp:matrix` run them from the repository root.

## Documentation generator

**`generate-tools-docs.js`** — generates the tool lists from `TOOL_DEFINITION` in
`src/handlers/**`: `docs/user-guide/AVAILABLE_TOOLS.md` and its `_READONLY`, `_HIGH`, `_LOW` and
`_LEGACY` variants. Never edit those files by hand.

```bash
npm run docs:tools            # builds first
node tools/generate-tools-docs.js --help
```

Run it after adding, removing or redescribing tools. The compact tool list is generated separately
(`compact/docs/AVAILABLE_TOOLS.md`, `compact/tools/generate-docs.js`).

## Smaller scripts

- `show-storage-paths.js` — prints where service keys and sessions are looked up on this platform.
- `check-exports.js` — prints what `@mcp-abap-adt/connection` exports.
- `check-todos.js` — lists TODO comments in `src/` (`npm run check-todos`).
- `version-stats.sh [count]` — version statistics from the git tags (`npm run chrono`).
- `test-package-read.js`, `run-program-hard-test.js` — one-off probes against a system.
- `bulk-update-interface-handlers.sh` — a one-time migration script, kept for history.
- `sample-service-key.json` — the shape of a service key, with placeholder values.

## Service keys and the `sap-abap-auth` CLI

`npx sap-abap-auth` (from `@mcp-abap-adt/connection`; `npm run auth`) logs in through a browser and
writes a `.env` from a service key. How a destination states its authentication — `basic`, `snc`, or `jwt` with
`SAP_GRANT_TYPE` — is in [Authentication](../docs/user-guide/AUTHENTICATION.md).
