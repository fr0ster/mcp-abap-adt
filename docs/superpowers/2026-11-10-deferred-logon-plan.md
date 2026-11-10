# Plan: stdio starts without the SAP system

Goal: `2026-11-10-deferred-logon-goal.md`. Spec: `2026-11-10-deferred-logon-spec.md`. The
spec binds; each step names the spec section it carries out. A plan of steps, not code:
the code is written in the step, test first.

## Rules for the implementer

- **npm scripts only.** Never `npx`, `npm exec`, `node --test`, `tsc` or anything in
  `node_modules/.bin` directly. A single test file runs through the repository's test
  scripts.
- **Commit by path.** `git commit -- <path>…`, never `git add -A` or `git commit -a`.
- **No `--no-verify`.** The pre-commit hook (lint-staged, `npm run build`) runs on every
  commit. Nothing is pushed until the controller says so.
- **Waiting.** A long command runs with `~/.claude/scripts/start-detached <log> <cmd>` and
  is waited for with `~/.claude/scripts/wait-pid <pid> 30`. Never `pgrep -f`, never a
  polling loop of your own.
- **Never print secrets.** No password, token, cookie, session file or `.env` value in a
  log, a commit, a test name, a report or a PR text.
- **No SAP system names, ids or users in a committed file.** A live case reads its system
  from a variable or the ignored test configuration; a commit message, a test name, a
  fixture and a doc name none.
- **No SAP-facing command** except the live runs of steps 14 and 15, each on the
  controller's go.
- **Static first.** No cast, no `any`, no `@ts-ignore`, no regular expression in
  production code (goal, Static first).

## Every code step ends green

Before its commit, each code step runs, in this order, and all pass:

- `npm run build`
- `npm run lint:check`
- `npm run test:check`
- `npm test` (the full unit suite)

**Every pinning test is shown load-bearing.** The test is written first and seen red
against today's code; then the code makes it green; then the step's mutation is applied
once, the test is seen red, and the mutation is reverted. A rule made of several
conditions gets one mutation per condition, each with a case only that condition guards.
The mutations and what turned red are named in the commit message.

## The open checks (no production code)

1. **What the live run's global setup does for a suite that needs no system** (spec §6,
   Live). Read `src/__tests__/integration/globalSetup.ts` (`setUp`) and
   `src/__tests__/integration/helpers/liveScripts.ts`, and answer, in this plan's
   appendix A:
   - for a script in `LIVE_SCRIPTS`: what runs with no test configuration (today `setUp`
     returns after `startRunDirectory` when `loadRunConfig` gives none: Code, to be
     confirmed), and what runs with one present (the realm check and the logon);
   - whether `liveScripts.test.ts` lets a script that runs a file under
     `src/__tests__/integration/` stay out of `LIVE_SCRIPTS` (today it does not: Code, to
     be confirmed);
   - so where the closed-port case runs without touching a system: in
     `test:live-deferred-logon` listed in `LIVE_SCRIPTS`, run with no test configuration
     (`MCP_TEST_CONFIG` pointing nowhere, if the setup honours it), or another way the
     machinery already allows.

   If the closed-port case cannot run without a realm check and a logon unless the live
   machinery changes, the step stops and the finding goes to the controller; nothing in
   the machinery is changed without an answer. Commit: the appendix, by path.
2. **An RFC tool call against an unreachable system** (spec §4, RFC). Measure today's
   answer before anything is built: a case in the new
   `src/__tests__/integration/live/deferredLogon.test.ts` that starts a `StdioServer` for an
   RFC destination whose host does not resolve (`unreachable.invalid`, credentials that
   exist nowhere, as `PORTABLE.md`'s smoke check), opens the transport without
   `connectAtStart` (the path `StdioServer.start` already allows), and makes one tool
   call. It needs `@mcp-abap-adt/sap-rfc-lite` and the SAP NW RFC library and skips, with
   its reason, where they do not load. It asserts the answer carries
   `RFC_COMMUNICATION_FAILURE` and no host. Run it on this machine.
   - Green: record the result in appendix A; the case stays in the suite and pins the RFC
     answer for steps 7 and 8.
   - Red (the key is missing, or the host shows): the step stops, and the answer as it
     came (no host, no credential) goes to the owner. Steps 7 onward wait for the answer.

## The code

3. **The cause list moves to lib** (spec §4, The answer). New
   `src/lib/auth/connectionCause.ts`: the network codes and interfaces-auth's
   `TLS_FAILURE_CODES` as one `const` tuple, its element type `ConnectionCauseCode`, and
   `connectionCauseOf(thrown)`; exported through `@mcp-abap-adt/lib/auth`.
   `server-runtime/src/stdio/launcher.ts` drops its private copies (`:627-659`) and imports
   them; `startConnectionWords`' words do not change.
   - Tests first: `connectionCause.test.ts` beside the lib's auth tests, with part 1's cases
     (each listed code, an unlisted one, a throwing `code` getter); part 1's cases in
     `startConnector.test.ts` stay and pass unchanged.
   - Mutations: the TLS codes left out (the TLS cases red); any string accepted (the
     unlisted case red); the read unguarded (the getter case red).
4. **The deferred-logon flag** (spec §2). A flag row in `CORE_ROWS`
   (`server-runtime/src/stdio/config/coreParameters.ts`), `CoreConfig.deferredLogon`, read
   in `readCoreConfig`; `MCP_DEFERRED_LOGON` in `V2_HELP_SECTIONS` (`launcher.ts:111-228`).
   Nothing else reads it yet.
   - Tests first, in `server-runtime/src/stdio/__tests__/config/coreParameters.test.ts`:
     CLI `false` over env `true`; CLI `true` over env `false`; env `true` over YAML
     `false`; env `false` over YAML `true`; YAML alone; a bare `--deferred-logon`; none is
     `false`; an empty env value falls through to YAML; an invalid word refused in each
     form, naming it; the destination's `.env` stating `MCP_DEFERRED_LOGON` is not read;
     `--help` lists the parameter and the variable.
   - Mutations: the row's env form removed (the env cases red); the YAML key removed (the
     YAML cases red); the default made `true` (the none case red); `readRow`'s env and YAML
     order swapped (the env-over-YAML cases red) — reverted at once, it is shared code.
5. **The restore flag and its refusal** (spec §5). A flag row in `CORE_ROWS`,
   `CoreConfig.restoreSession` (no default) and `restoreSessionSource`; in
   `readCoreConfig`, a `ParameterRefusal` when it is stated without `--deferred-logon`,
   naming the form used and `--deferred-logon`; `MCP_RESTORE_SESSION` in the help.
   - Tests first, same file, and through `main` for the exit: the precedence cases of
     step 4 for the restore flag; not stated is `undefined`; the source names its form;
     `--restore-session`, `--restore-session=false`, `MCP_RESTORE_SESSION=true` and YAML
     `restore-session: false`, each without the deferred logon, refused with exit `1` and
     nothing read or sent; each accepted with `--deferred-logon` in each of its forms;
     neither flag starts as today.
   - Mutations: refuse only a `true` (the `=false` case red); the refusal skipped for a
     YAML source (the YAML case red); a `false` default instead of none (the not-stated
     case red); the refusal's deferred check inverted (the accepted cases red).
6. **The deferred start** (spec §3). In `launchStdio`, with `deferredLogon`: the server
   is built with `deferredLogon` (and `restoreAtFirstBirth` from step 5's value) in its
   options, `connectAtStart` is not called, the one stderr line is written, the transport
   opens. `StdioServerOptions` gains both fields; nothing reads them yet.
   - Tests first, beside `startConnector.test.ts` (the whole launcher over an
     `InMemoryTransport`, the ADT stand-in): with the flag and nothing listening the
     transport opens and the process does not exit; the stderr line is the deferred one,
     with no URL; `tools/list` equals the list a start without the flag gives for the same
     declared type; a listener that counts and resets connections counts `0` through the
     start; a missing system type or connection type is still refused, exit `1`; a
     configuration the startup check refuses is still refused; without the flag every case
     of `startConnector.test.ts` passes unchanged; inspection mode with the flag starts as
     without it.
   - Mutations: `connectAtStart` called with the flag (the start exits `1`, the counter
     case red); the system-type check skipped with the flag (that case red); the stderr
     line dropped (its case red).
7. **The `no_connection` answer** (spec §4, The answer). `no_connection` in
   `ServerRefusalCode` (`src/lib/auth/serverRefusal.ts`) and `FailureCode`
   (`src/lib/auth/failures.ts`); the typed overload taking a `ConnectionCauseCode`, its
   fixed words; `StdioServer.getConnection` turns a throw into it with `deferredLogon`
   when the reader does not read it, SAP gave no answer and the code is listed.
   - Tests first, in the step 6 file: a call with nothing listening answers `isError`,
     `error: "no_connection"`, `ECONNREFUSED`; the counting listener gives `ECONNRESET`;
     no answer holds the URL, the host, the port, the user or the password; a second call
     makes one new attempt (counter `1` → `2`); two calls sent at once make one attempt
     between them; the stand-in then listens on the port and the next call logs on and
     answers, the one after sends no logon; a `401` is answered as today; without the flag
     an unreachable system is answered as today; a call after the system went away again
     answers `no_connection`. One synthetic thrown value per condition: one the reader
     reads although its code is listed; one carrying SAP's answer and a listed code; one
     with an unlisted code — each answered as today.
   - Mutations, one per condition: the reader check dropped (its synthetic case red); the
     SAP-answer check dropped (its case red); the code check dropped (the unlisted case
     red); the flag check dropped (the without-flag case red); the words given the
     thrown value's message (the no-address case red).
8. **The take-up at the first call** (spec §4, The connection; §5). `bornAtStart`'s
   choice between `resumedSession` and `logOn` (`src/embeddable/BaseMcpServer.ts:1409-1430`)
   moves into one private method used by `bornAtStart` and by `getConnection`'s first
   build; `getConnection` takes up only while no birth has succeeded and
   `restoreAtFirstBirth` is set (passed from `StdioServer` to `BaseMcpServer`).
   - Tests first, in the step 6 file, with a killed process's leftover
     (`src/__tests__/helpers/leftoverSession.ts`): with the deferred flag alone, and with
     `--restore-session=false`, the start claims nothing, the first call logs on and the
     leftover stays listed; with both flags the start claims nothing, the first call takes
     the session up (its cookies, no logon, the file this process's under the same
     handle) and the next call sends no logon; unreachable, the first call answers
     `no_connection`, the file is listed again, and once the stand-in listens the next
     call takes it up; SAP answering the old session ended, the first call logs on and
     adopts the file under the same handle; several leftovers, none taken up; after a
     take-up, a session SAP lost is replaced by a logon. Today's start take-up cases
     (`leftoverSessions.test.ts`, `startBirth.test.ts`) pass unchanged. Step 2's RFC case
     passes with the flag.
   - Mutations: the take-up used on every birth (the lost-session case red); the take-up
     done at the start (the start-claims-nothing case red); `restoreAtFirstBirth` ignored
     (the take-up case red); the release on a failed take-up removed (the listed-again
     case red).
9. **The live suite** (spec §6, Live). `src/__tests__/integration/live/deferredLogon.test.ts`
   (begun in step 2) gains, and its npm script is registered as step 1 decided:
   - the closed-port case: the packed release installed (`installPackedRelease`), a
     temporary `.env` to a port bound and closed, basic credentials that exist nowhere,
     `--deferred-logon`; the process stays up, `tools/list` is not empty, two calls answer
     `no_connection` with `ECONNREFUSED`, the shutdown exits `0`, every stdout byte is a
     JSON-RPC frame; no path, value or answer text reported;
   - the case where the system becomes reachable mid-session, and the take-up case (spec
     §6), each run only where its variable names an HTTP `.env` of a real system, skipped
     with the reason elsewhere; the take-up case's cleanup logs off a leftover it left.
   - The unit guards of the live machinery (`liveScripts.test.ts`, the coverage ledger)
     pass; the suite runs once with nothing configured and every real-system case is
     reported skipped with its reason.

## Docs, release, review

10. **The docs of spec §7**: `CLI_OPTIONS.md` (both rows, the refusal, a section),
    `YAML_CONFIG.md`, `user-guide/README.md`, `HANDLERS_MANAGEMENT.md`,
    `CONNECTION_ISOLATION.md`, `ARCHITECTURE.md`, `TESTING_AUTH.md` (also the live suite
    and its script), `SERVICE_KEY_SETUP.md`, `PORTABLE.md`, `CLIENT_CONFIGURATION.md` (the
    two-systems example). Each claim checked against the code as built. Commit by path.
11. **The CHANGELOG** under `## [24.0.0]`, with today's date set on the heading: the two
    flags, their forms and precedence, `no_connection`, the restore flag's refusal, the
    take-up at the first call. Earlier entries are not touched. The date is checked again
    on the release day.
12. **CI's whole step list, locally** (`.github/workflows/ci.yml`): `npm ci --ignore-scripts`
    (the lockfile unchanged); `npm run lint:check -- --diagnostic-level=error`; every
    package's `lint:check` (`npm --prefix <package> run lint:check`, each package CI
    names); `npm run build`; `npm run test:check`; `npm test`; `npm run test:install`;
    every package's `test:check` CI names; `npm audit --audit-level=moderate`; the pack and
    install checks and the Docker image builds as CI runs them. A step that cannot run
    here says why in the PR description.
13. **Push and CI.** On the controller's word: push the branch, and watch the PR's CI to
    its end on every platform and Node version.
14. **The closed-port live run.** The step 9 script, with nothing configured: the
    closed-port case green, every real-system case skipped with its reason. Needs no SAP.
    The counts go into the PR description.
15. **The real-system live runs, only on the owner's go.** First the realm check: an
    unauthenticated `GET` of the system's ADT discovery URL must answer `401` with the
    system's expected realm, without a logon; the controller names the URL and the realm at
    the go, and neither is written into a committed file. Any other answer stops the run.
    Then the case where the system becomes reachable mid-session and the take-up case.
    Results go into the PR description, with no system name.
16. **A Codex review** of the whole PR, with the approved goal and spec quoted to it.
    Its findings go to the controller, checked against the goal and the spec; only what
    they cover is fixed, in this PR.
17. **The goal, the spec and this plan are deleted** before the release that ships the
    work, by path, in this PR. What they still owe the future goes into the PR
    description first.

## Appendix A — the open checks

### Step 1: the live global setup for a suite that needs no system

- A script whose runner command names a file under `src/__tests__/integration/` must be in
  `LIVE_SCRIPTS`: `liveScripts.test.ts` asserts the declared set equals the scripts that
  select live suites (Code, `src/__tests__/unit/coverage/liveScripts.test.ts:44-52`), and
  every listed script runs `--concurrency 1` (`:54-62`).
- Under a live script, `setUp` starts the run directory, then reads the test config
  (`loadRunConfig`): none (no `tests/test-config.yaml`, `MCP_TEST_CONFIG` unset) returns at
  once — no realm check, no factory, no logon (Code,
  `src/__tests__/integration/globalSetup.ts:110-121`; `helpers/runConfig.ts:15-29`). A
  config whose YAML is empty loads as `undefined` and returns the same way (Code,
  `loadRunConfig` returns `yaml.load` of the file). `MCP_TEST_CONFIG` set to a blank value
  or a missing file is refused (Code, `helpers/testConfigPath.ts:20-34`).
- With a config holding a destination, the setup runs the realm check and logs on once
  (Code, `globalSetup.ts:123-180`).
- The teardown of a live script other than `test:integration` and
  `test:coverage-family` checks only the refusal marker (Code,
  `src/__tests__/integration/globalTeardown.ts:6-12`).
- This worktree holds no `tests/test-config.yaml` (Measured, `ls`).

Decision: the suite runs under its own script `test:live-deferred-logon`, listed in
`LIVE_SCRIPTS`, `--concurrency 1`. The closed-port run (step 14) runs with no test config:
in this worktree as it is, `MCP_TEST_CONFIG` unset — so the setup neither checks a realm
nor logs on. No change to the live machinery is needed.

### Step 2: an RFC tool call against an unreachable system

Measured, on this machine (Linux x64, Node 26.7.0, `@mcp-abap-adt/sap-rfc-lite` 0.3.2, the
SAP NW RFC SDK 7500 PL18 with `SAPNWRFC_HOME` and the library path set), with the case
`an RFC tool call against an unreachable system` of
`src/__tests__/integration/live/deferredLogon.test.ts` under
`npm run test:live-deferred-logon`, no test config: a `StdioServer` for an RFC destination
on `unreachable.invalid`, opened without `connectAtStart`, answered its first tool call
`isError` through the failure reader, `error: authentication_failed`, kind
`system-refused`, words `the RFC logon failed (RFC_COMMUNICATION_FAILURE), not as a
credential refusal`; the answer names no host. So the RFC answer is the start line's key,
as the spec expects; it is not turned into `no_connection`. The case stays and pins it.

