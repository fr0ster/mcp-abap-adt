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
- `environment.env` — session .env file name (`"your-system.env"`, `"another-system.env"`) from standard sessions folder
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

A newer Node on a development machine is fine; nothing here may require it —
this one runs 26.7.0, and that changes nothing here.

**Node 26 is not a third supported version. Checked 2026-09-27:**

- SAP's own docs for the Cloud Foundry environment list exactly three for
  `nodejs_buildpack` — **20** (end of life 2026-04-30), **22**, **24** — and say
  nothing about 26. A `nodejs 26` app has nothing to be staged on.
- Node 26 is in **Current**, not LTS: released 2026-05-05, LTS in October 2026,
  and Node's own guidance is Active or Maintenance LTS for production.
- `@sap/cds` 10.1.1, `@sap/cds-compiler` 7.1.1 and `@cap-js/cds-typer` 0.41.1
  declare `engines.node >=22`. A floor, not a statement that 26 was tested — the
  same open range admitted 25, which the platform never had.

**One thing 26 does change, and it is about installing rather than running.**
`@mcp-abap-adt/auth-broker` 3.0.2 and `auth-providers` 4.2.1 widened `engines` to
`"^22 || ^24 || ^26"` because under Node 26 npm skips a release whose `engines`
does not admit it and installs the newest one that does — silently an older
major (measured: `npm i -g @mcp-abap-adt/proxy` on 26.7.0 took 4.2.0 while 5.0.1
was `latest`). This project declares `engines.node: ">=22.0.0"`, an open range, so
it was never subject to that; keep it open for the same reason.

So the matrices stay **22 and 24**, and the question reopens when the buildpack
lists 26, not when Node releases it.

### The TypeScript major follows SAP

Stay on `typescript@^6.x`. Take 6.x patches and minors; leave 7 alone until the
CAP toolchain moves, and treat it as a decision already made rather than an
upgrade waiting to happen. Measured 2026-09-24:

- `@sap/cds` 10.1.0, `@sap/cds-dk` 10.1.0, `@sap/cds-compiler` 7.1.0,
  `@cap-js/cds-typer` 0.41.1 and `@cap-js/cds-types` 0.19.0 declare no
  `typescript` peer at all, and CAP's docs name no version — `cds watch` runs
  `cds-tsx`, which transpiles without type checking. But cds-typer and cds-types
  both devDepend on `typescript ^6.0.3`, so 6 is what SAP tests.
- `ts-jest` caps it: the latest, 29.4.14, declares
  `peerDependencies.typescript: ">=4.3 <7"`, and every suite here runs through
  it. `.npmrc` sets `legacy-peer-deps=true`, so npm would install the conflict
  silently rather than refuse it.
- cloud-llm-hub type-checks against this project's `.d.ts` on TypeScript 6 with
  `moduleResolution: node`.

The cheap signal, if the question ever comes back:
`npm view ts-jest peerDependencies.typescript`. Even then SAP moving is the
deciding condition, not ts-jest.

## The SAP errata: ambiguity we account for, not defects we fix

`node_modules/@mcp-abap-adt/adt-clients/docs/usage/ERRATA.md` — 25 entries of
measured SAP behaviour, each with Symptom, Cause, Rule, Workaround, Evidence and
"where it bites", and an object tree saying which types answer something the
others do not. Read it **before** measuring a surprising ADT answer again.

**What it is.** Not our bug list, and not a to-do. It records where the platform
is *ambiguous*, and the ambiguity is ours to account for. The canonical case:
`403` on the LOCK before a service binding's publication. It is neither an error
nor a success — it means an editing session holds the binding — and Eclipse ADT
ignores it and posts the job, because the job needs no lock of the caller's. The
errata even hands the choice over: *"If the `403` should stop you, pass
`analyseException` instead."*

**Where the choice lives: the `analyse` at the call site.** Three shapes of it:

- **treat as no failure what looks like one** — `analysePublicationLock` on that
  `403`; `activationExecuted="false"` with no messages ("nothing to do"); an
  untyped `S::000` beside `isDeleted="true"`;
- **treat as a failure what looks like success** — `200` with
  `isDeleted="false"`, `activationExecuted="false"` with `<msg type="E">`, `200`
  with an empty body where a `404` was meant;
- **leave to a second read what no single answer settles** — acceptance is not
  completion: `/activation/runs` answers a run id, and `GetInactiveObjects` is
  the only answer to "is it active now".

**How to apply.** New call → look for an entry on that endpoint and pass the
strategy it names. Choosing differently from Eclipse is allowed, and then the
reason belongs in a comment at the call site, because it is our decision about an
ambiguous answer, not the system's behaviour.

Two entries are the connector's, not a reading's: **PAK/058** ("a package can be
saved only once per ABAP session" — the message says *locked*, but it is
`CL_PACKAGE`'s in-memory instance buffer) and the session-type header.
`@mcp-abap-adt/connection` handles both — HTTP from 9.3.1, RFC from 9.3.2, and
from 9.3.4 on a reused conversation whose server context is reset after each
call, which needs `@mcp-abap-adt/sap-rfc-lite` **0.2.1** — 0.2.0 was published from
a stale `lib/` with no `resetServerContext` in it, so the connector silently fell
back to a new RFC connection per stateless call (correct, and half again as slow:
~1010 s against ~684 s for a full RFC run). PR #230's on-premise RFC run
measured the same thing from our side: a stateless read after a create on one RFC
connection answered `400 SADT_RESOURCE 007`, and a fresh connection answered
`200`.

## Seeing the wire

`DEBUG_HTTP_WIRE=true` prints every HTTP exchange on stderr — method, URL,
params, headers with their values redacted by name, and bodies clipped at
`DEBUG_HTTP_BODY_CHARS` (default 2000, `0` for the size alone, `Infinity` for all
of it). `DEBUG_RFC_WIRE` is its RFC twin.

**Reach for it before writing a probe.** `DEBUG_CONNECTORS` and `DEBUG_ADT_LIBS`
do NOT answer "what did we send and what came back": `@mcp-abap-adt/connection`
logs the session, the CSRF token and the critical section and nothing about a
request, and `logWire` is an RFC transport option the HTTP transports do not
take. That gap cost a diagnostic cycle on 2026-09-28 — `CheckPackage` answered
`isError: true` with no message and no request, and the cause (a guard refusing
before the wire) was only visible after wrapping `makeAdtRequest` by hand.

And when a suite reports `Expected: false / Received: true`, the payload is what
is missing, not the wire: a handler's envelope carries `message`, `origin` and
`request`. A test that asserts `isError` should raise that payload — see
`CheckHighHandlers.test.ts`'s `expectAccepted`.

## A release is not verified until an installed copy runs

`release:dry` reporting `Published: 2  Skipped: 0` says the tarballs build. It
says nothing about whether anything inside them runs: paths that resolve in a
checkout resolve differently under `node_modules`.

13.0.0 shipped with `mcp-abap-adt --version` dead on every installed copy — the
launcher read `__dirname/../../package.json`, which is the repo root in a checkout
and the *scope directory* `node_modules/@mcp-abap-adt/` from npm. The sibling
packages had fixed exactly this one release earlier (`auth-broker` 3.0.4:
`mcp-sso` importing a dev-only dependency), and their changelog even said how they
found it — *installing the tarball into an empty directory and running each bin.*
We took the fix and skipped the check.

`src/__tests__/unit/binSmoke.test.ts` performs it now. Before a release, make sure
it ran; when adding a bin, add it there. And treat any `__dirname`-relative path
in `server/` as suspect: count the levels for both layouts.

## What we write names nothing concrete

**The rule: a description is read by a model and indexed by a vector search, so it
names nothing concrete.** We say `class`; we do not say which class. It holds for
tool descriptions, parameter descriptions, code comments, test data and captured
fixtures alike, and the reason is retrieval, not taste: ask for a report in `$TMP`
and a search over the descriptions returns everything whose text mentions `$TMP`,
whatever the rest of the sentence says. Issue #241 measured it in cloud-llm-hub's
tool-RAG — `Delete*` went from 12 of the top 15 to 1 once the literal left their
text. In a PARAMETER description it is worse in a second way: the model fills the
argument from what it reads there, and an example transport request addressed a
real one.

**A consumer who wants names is not stuck.** They import `@mcp-abap-adt/lib`,
inherit, and override the descriptions to suit their own retrieval. What we ship
stays agnostic because we do not know who indexes it, where, or how.

- **What a description says**: the operation, then the parameters and the answer,
  most important first, plus the constraints that change THIS call ("must already
  exist", "required for validation", "not a task", "up to 26 characters"). Never an
  example object, package, transport, software component or search prefix. A bare
  mask (`Z*`, `Y*`, any-namespace) and a format placeholder (`YYYYMMDDHHMMSS`) name
  nothing and stay.
- **A description is not an ABAP tutorial.** A tool works with any object the
  caller is authorised for, whatever it is called, so naming conventions are not
  ours to state: "must follow SAP naming conventions", "start with Z or Y", "for
  the customer namespace", how a behaviour pool is conventionally named and a
  worked ABAP snippet are all out (stated by the user 2026-09-28). The CONSUMER's
  skill carries the naming rules and its own requirements, and the consumer is
  responsible for the validity of the parameters it sends. The same cut removed
  the CTS lesson from 104 `transport_request` descriptions: `request` is a word a
  description may use, a number like `ER121235` never is, so the text keeps `not a
  task` — the one fact that decides whether THIS call succeeds — and drops how CTS
  works, which tool to call next and the SAP message it answers. The transport
  tools themselves keep their full text: there, request against task is the
  subject of the tool, not a general lesson.
- **A measurement note records the platform and the date, not the landscape.**
  `on premise (2026-09-26)` and `BASIS 816`, never a system id: the release is what
  made the behaviour, and the SID means nothing to anyone else reading it.
- **Captured fixtures are sanitised** — `SAPUSER01`, `SID`, a placeholder transport
  prefix — and the note says so. Test data keeps its numbers under a placeholder
  prefix so assertions still pair with their inputs.
- `src/__tests__/unit/toolDescriptionsCarryNoLiterals.test.ts` keeps the rule over
  **both** tool and parameter descriptions, in three classes: a package (`$TMP`), a
  customer object (`ZCL_…`, and `L…`/`SAPL…` for a function group's generated
  includes), a transport number. Add a class rather than an exception when a new
  kind of literal appears; the generated prefixes are there because the first
  version of the pattern missed `LZOK_FG_…F01` and the test found it.

## The state handle

`state_handle` identifies an LLM session's state — not a user, not an MCP
session. Whoever continues the LLM session presents it; protecting it (HTTPS,
isolation, logs) is the deployer's, and SECURITY.md says so. There is no owner:
no caller proof, no per-user listing, no per-user registry of ours.

What bounds parallel debug sessions is SAP's listener conflict, measured on
premise (2026-10-10, both conflict modes, all four combinations of the ids):

- the same `ideId` never conflicts, whatever the `terminalId`: both listeners
  stay, and the newer one catches;
- another `ideId` of the same SAP user conflicts: under refuse
  (`checkConflict=true&isNotifiedOnConflict=true`) the newcomer gets `409
  conflictDetected` and the first one keeps listening; under take-over the
  newcomer is accepted and the first one's poll returns `409
  conflictNotification`;
- the `terminalId` changed nothing in either mode;
- a breakpoint caught for whichever listener of that user was active — under
  take-over the newcomer caught a breakpoint only the first one had set.

Both ids are random per instance by default, so a second instance of the same
SAP user meets the conflict and its answer reaches the model as it is; a shared
id is the consumer's explicit choice. The idle bound on waiting for the user
(not under 30 minutes, the user's exception to "no timeouts") ends a forgotten
session.

The debugger here debugs what it starts itself, under `debuggingMode=user`.
Request-based (terminal) debugging, other users' requests and attaching to a
process we did not start wait on adt-clients (fr0ster/mcp-abap-adt-clients#217).

This holds for this repository (stated by the user 2026-10-10); a handle in
another project may mean something else, and the global MCP rules still apply
there.

## Plans and Specs

Plans under `docs/superpowers/plans/` and specs under `docs/superpowers/specs/` are kept in the tree only while active — i.e. not yet implemented and not cancelled. Once a plan/spec has been fully implemented OR cancelled, delete the file. History lives in git; these directories hold only work in progress.
