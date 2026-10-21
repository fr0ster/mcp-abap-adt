# server-runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every server process loads exactly one `@mcp-abap-adt/lib`, for any install layout (#303).

**Architecture:** the launch code of the three transports moves into a new package without a binary, `@mcp-abap-adt/server-runtime`; every binary package depends on it and on no other binary package; `lib` is a `dependency` only of the binary packages and a `peerDependency` of everything else; `lib` registers each loaded copy and the runtime refuses to start with more than one.

**Tech Stack:** TypeScript (node16 modules, CommonJS output), Jest, npm (no workspaces; tsconfig `paths` into sibling `dist/` for development), Biome.

**Spec:** `docs/superpowers/specs/2026-10-21-server-runtime-design.md` (goal: `docs/superpowers/2026-10-21-server-runtime-goal.md`).

## Global Constraints

- Code moves with `git mv`, so history follows; a moved file changes only in its import paths and what the spec says (version defaults).
- No package with a `bin` lists another package with a `bin` in `dependencies`.
- `@mcp-abap-adt/lib` is in `dependencies` of the twelve binary packages only; `server-runtime`, `compact-readonly-entries`, `compact-modify`, `background-runs-memory`, `responsible-rules` list it in `peerDependencies` and `devDependencies`. `server-runtime` lists `background-runs-memory` and `responsible-rules` the same way.
- `server-runtime`: license `AGPL-3.0-only`, no `bin`, sibling ranges `^19.2.0`.
- Registry-only ranges; no `file:`, `link:`, `workspace:`; lockfiles changed by npm only.
- **Every commit leaves the repo green**: `npm run build`, `npm run lint:check`, `npm run test:check`, and the full `npm test` (after the build, so `binSmoke` has `dist`) pass at the end of every task, and a moved suite must report its tests as run (jest's `--passWithNoTests` hides a suite nobody finds: check the count, not the exit code).
- **Resolution is wired in the task that needs it**, never later: root `package.json` `jest.roots` and exact `jest.moduleNameMapper` entries (one per export path — a wildcard cannot map `/stdio` to `stdio/launcher.ts`), `tsconfig.test.json` `paths` and `include`, and each package's own `tsconfig.json` `paths` (built declarations in `../server-runtime/dist/...`), for every import the task introduces or retargets.
- What a user runs does not change: twelve binaries, names, options, tool sets, `--version` and `serverInfo.version` (each binary's own version).
- `lib` refuses nothing; only the runtime's `main` acts on a second copy.
- The guard's line, verbatim: `Two copies of @mcp-abap-adt/lib are loaded in this process (<file>, <file>): reinstall <package> (npm install -g <package>).`
- No timeouts introduced; no `npx` in scripts; tool descriptions untouched.
- CHANGELOG: lines go into the current top entry (`## [19.2.0]`, shared with #305); earlier entries never change; the entry's date is set on each change.
- `CLAUDE.md` / `SCOPE.md` are not edited by implementers (controller, with the owner's approval of the text).

## Review Focus

1. A global install of a wrapper **together with its former base in one command** — the reported case — must load one `lib` (Task 9, layout 1).
2. `npm install --install-strategy=nested` of a binary — the layout ordinary dependencies do not deduplicate — must load one `lib` (Task 9, layout 4).
3. The portable SEA binaries (no `node_modules` on the target) must start and register one copy (Task 9, portable).
4. A direct `new StdioServer(...)` from `@mcp-abap-adt/core` without `opts.version` must still answer core's version (Task 3).
5. An embedder that installs `lib` plus `compact-readonly-entries` (no binary) must see no refusal and no missing peer (Task 6 packageSet rules; Task 9 layout 3).

---

### Task 1: the release's versions

**Files:**
- Modify: the 17 manifests (`package.json` of `.`, `background-runs-memory`, `responsible-rules`, `compact-readonly-entries`, `compact-modify`, `server`, `http`, `sse`, `compact`, `compact-http`, `compact-sse`, `core-ro`, `http-ro`, `sse-ro`, `compact-ro`, `compact-http-ro`, `compact-sse-ro`), `package-lock.json` (by npm), the twelve `server*.json`, `docker/Dockerfile.inspect`

- [ ] **Step 1:** every manifest at `19.2.0`, every sibling range `^19.2.0` (as `docs/deployment/RELEASE.md` step 1–2 says); `npm install --package-lock-only`; registry entries and `CORE_VERSION` at 19.2.0.
- [ ] **Step 2:** `releaseMetadata.test.ts`, `packageSet.test.ts` and the full gate list pass; no foreign `"link": true`.
- [ ] **Step 3:** commit `release: 19.2.0 versions (#303)`. (If #305 lands first with the same bump, this task shrinks to what is left.)

### Task 2: `lib` registers each loaded copy

**Files:**
- Create: `src/lib/instance.ts`
- Modify: every module named in the root `exports` map (`src/index.ts`, `src/lib/handlers/index.ts`, `src/lib/utils.ts`, `src/embeddable/index.ts`, `src/lib/config/index.ts`, `src/lib/auth/index.ts`, `src/lib/handlerLogger.ts`, `src/lib/requestContext.ts`, `src/lib/handlers/read.ts`, `src/lib/handlers/write.ts`, `src/lib/compact/index.ts`, `src/lib/httpTransport/index.ts`, `src/lib/debugger/index.ts`, `src/lib/state/index.ts`, `src/lib/toolSet.ts`, `src/lib/adtHeaders/index.ts`, `src/lib/toolSearch/index.ts`)
- Test: `src/__tests__/unit/libInstance.test.ts`

**Interfaces:**
- Produces: `libInstances(): readonly { file: string }[]` from `@mcp-abap-adt/lib/config` and the root; registry key `Symbol.for('@mcp-abap-adt/lib/instances')`.

- [ ] **Step 1: Failing tests** — (a) loading `instance.ts` once registers one entry, `file` = its `__filename`; (b) a second load in `jest.isolateModules` registers a second entry; (c) each path of the root `exports` map (read from `package.json`, `dist/…js` mapped to `src/…ts`), loaded in a fresh isolated registry with the array reset, registers exactly one entry; (d) `file` is `bundled` where `__filename` is not a string.
- [ ] **Step 2:** they fail.
- [ ] **Step 3:** `instance.ts` per spec §3 (push on load, no file system access, no exported mutator); a side-effect `import './instance'` (relative) at the top of every entry; `libInstances` exported from `config` and the root.
- [ ] **Step 4:** green; drop one entry's import, see (c) red, revert.
- [ ] **Step 5:** commit `feat(lib): each loaded copy registers itself (#303)`.

### Task 3: `server-runtime` and the stdio transport, end to end

**Files:**
- Create: `server-runtime/package.json`, `server-runtime/tsconfig.json`, `server-runtime/README.md`, `server-runtime/LICENSE` (copy of `server/LICENSE`), `server-runtime/src/runtimeVersion.ts`
- Modify: `.gitignore` — `!/server-runtime/package.json` beside the other packages' manifest exceptions (the bare `package.json` rule ignores a new manifest); `packageSet.test.ts`' manifest-exception check covers it; the Task 3 commit must show the manifest tracked (`git ls-files server-runtime/package.json`)
- Move (`git mv`): `server/src/{launcher.ts,StdioServer.ts,destinationSource.ts,shutdown.ts,config/,auth/,index.ts}` → `server-runtime/src/stdio/…` (`index.ts` → `stdio/server.ts`); `server/src/__tests__/` → `server-runtime/src/stdio/__tests__/`
- Keep in `server/`: `src/coreVersion.ts`, `bin/`; Create: `server/src/index.ts`, `server/src/launcher.ts`, `server/src/auth/index.ts` as re-export modules
- Modify: `server/package.json`, `server/tsconfig.json`; `compact/`, `compact-ro/`, `core-ro/` — `src/launcher.ts`, `bin/*.js`, `package.json`, `tsconfig.json`
- Modify: root `package.json` (`build` order: runtime after `compact-modify`, before `server`; `prebuild` clean list; `jest.roots` + `<rootDir>/server-runtime/src`; exact `moduleNameMapper` for `@mcp-abap-adt/server-runtime/stdio`, `/stdio/server`, `/auth`), `tsconfig.test.json` (`paths` for the same three, `include` of `server-runtime/src/**/*`), `scripts/publish-all.sh` (`./server-runtime` after `./compact-modify`, before `./server`; "eighteen")
- Modify: `src/__tests__/unit/packages/dependencyRule.test.ts` (runtime among the sibling dirs; the `core` rows: core reaches the runtime's stdio paths and the auth chain through it; `compactOver` / `readOnlyOver` rows for compact, compact-ro, core-ro: they reach `server-runtime/stdio`, not `core`)
- Modify: `src/__tests__/unit/binSmoke.test.ts` and `src/__tests__/helpers/installedRelease.ts` — the packed-package inventory gains `server-runtime` (the first task where a package depends on it, so the packed install takes it from this checkout, never from the registry)
- Test: `server/src/__tests__/exports.test.ts`

**Interfaces:**
- Produces: `@mcp-abap-adt/server-runtime/stdio` (`main`, `launcherFailedLine`, `StdioLauncherEdges`, `LauncherOptions`, `coreHelp`, …), `/stdio/server` (`StdioServer`, core's parameter table, env resolution, destination source), `/auth`; `RUNTIME_VERSION`; unchanged `@mcp-abap-adt/core`, `/launcher`, `/auth`.

- [ ] **Step 1:** the runtime manifest: `AGPL-3.0-only`, no `bin`, `exports` `./stdio`, `./stdio/server`, `./auth`, `files: ["dist/", "README.md", "LICENSE"]`, `dependencies` = `server/package.json`'s minus `lib`, `background-runs-memory`, `responsible-rules`, which are peers + devDependencies (`^19.2.0`); `tsconfig.json` mirrors `server/tsconfig.json` (`paths` into `../dist`, `../background-runs-memory/dist`, `../responsible-rules/dist`).
- [ ] **Step 2:** `git mv`; relative imports fixed inside the moved tree; `StdioServer` defaults to `RUNTIME_VERSION` (`runtimeVersion.ts` reads `../package.json`, as `coreVersion.ts` does).
- [ ] **Step 3: Failing test** `server/src/__tests__/exports.test.ts`: every name 19.1.0's `@mcp-abap-adt/core`, `/launcher` and `/auth` exported is still exported (the list written into the test from the 19.1.0 `dist`); `new StdioServer({...})` from `@mcp-abap-adt/core` without `version` answers `CORE_VERSION` with the runtime's version module mocked to another value.
- [ ] **Step 4:** core's re-export modules; `StdioServer` exported as a subclass defaulting `opts.version` to `CORE_VERSION`; `server/tsconfig.json` `paths` for the three runtime exports into `../server-runtime/dist/…`; `server/package.json` depends on `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules`, nothing it no longer imports; core's bin calls the runtime's `main` with its tool set, program, own version and package name.
- [ ] **Step 5:** the three stdio wrappers import `@mcp-abap-adt/server-runtime/stdio` (bin: `launcherFailedLine` from it); their `tsconfig.json` `paths` map it into `../server-runtime/dist/stdio/…`; manifests drop `core`, add `server-runtime`, `background-runs-memory`, `responsible-rules`.
- [ ] **Step 6:** `dependencyRule.test.ts` rows for stdio migrated (Files above); `binSmoke`'s inventory includes the runtime; the moved stdio suites report their tests run; full gate list green, `binSmoke` included.
- [ ] **Step 7:** commit `refactor: stdio launch code in @mcp-abap-adt/server-runtime; core and its wrappers on it (#303)`.

### Task 4: the http transport, end to end

**Files:**
- Move (`git mv`): `http/src/{launcher.ts,StreamableHttpServer.ts,InstancePool.ts,config/,index.ts}` → `server-runtime/src/http/…` (`index.ts` → `http/server.ts`), `http/src/__tests__/` → `server-runtime/src/http/__tests__/`
- Keep in `http/`: `src/httpVersion.ts`, `bin/`; Create re-export `http/src/index.ts`, `http/src/launcher.ts`
- Modify: `server-runtime/package.json` (`./http`, `./http/server`; `express`), `http/package.json`, `http/tsconfig.json`; `compact-http/`, `compact-http-ro/`, `http-ro/` (`src/launcher.ts`, `bin`, `package.json`, `tsconfig.json`); root `jest.moduleNameMapper` and `tsconfig.test.json` for the two new paths; `dependencyRule.test.ts` http rows (http reaches no stdio module and no auth-broker / auth-stores / interfaces-auth-broker; its wrappers reach `server-runtime/http`)
- Test: `http/src/__tests__/exports.test.ts`

- [ ] **Step 1:** as Task 3 steps 2–6 for http: move, `RUNTIME_VERSION` default in `StreamableHttpServer`, failing exports test (19.1.0's names; `HTTP_VERSION` default via subclass), re-exports, `paths`, manifests, wrappers, rows.
- [ ] **Step 2:** no moved http source reaches another transport's directory by a relative path; full gate list green; moved suites report their tests run.
- [ ] **Step 3:** commit `refactor: http launch code in server-runtime; http and its wrappers on it (#303)`.

### Task 5: the sse transport, end to end

**Files:** as Task 4 with `sse/src/{launcher.ts,SseServer.ts,config/,index.ts}`, `sseVersion.ts`, `compact-sse/`, `compact-sse-ro/`, `sse-ro/`, `./sse`, `./sse/server`.

- [ ] **Step 1:** as Task 4 step 1 for sse (`SSE_VERSION` via subclass).
- [ ] **Step 2:** as Task 4 step 2.
- [ ] **Step 3:** commit `refactor: sse launch code in server-runtime; sse and its wrappers on it (#303)`.

### Task 6: `lib` is a peer below the binaries

**Files:**
- Modify: `background-runs-memory/package.json`, `responsible-rules/package.json`, `compact-readonly-entries/package.json`, `compact-modify/package.json`, `package-lock.json` (npm)
- Modify: `src/__tests__/unit/packages/packageSet.test.ts`, `src/__tests__/unit/packages/dependencyRule.test.ts` (the rows that required `lib` in those packages' `dependencies` require it in `peerDependencies`; "declared" accepts a peer where spec §2a makes it one)

- [ ] **Step 1: Failing rules** in `packageSet.test.ts` (spec §4): no binary depends on a binary; the twelve list runtime, `lib`, the two state packages in `dependencies`; the five list `lib` (runtime also the two state packages) in `peerDependencies`, not `dependencies`; the runtime has no `bin`.
- [ ] **Step 2:** move `lib` to `peerDependencies` + `devDependencies` in the four manifests; lockfile by npm.
- [ ] **Step 3:** green; break each rule once (a binary-to-binary edge; `lib` back in `compact-modify`'s `dependencies`) and see red; revert.
- [ ] **Step 4:** commit `build: lib is a peer of everything below the binaries (#303)`.

### Task 7: the runtime refuses a second copy

**Files:**
- Create: `server-runtime/src/secondCopy.ts`
- Modify: `server-runtime/src/{stdio,http,sse}/launcher.ts` (the package name in `LauncherOptions` beside `program`, if absent), the twelve bins pass it
- Test: `server-runtime/src/__tests__/secondCopy.test.ts`

**Interfaces:**
- Consumes: `libInstances()` (Task 2). Produces: `secondCopyLine(instances, packageName): string | undefined`.

- [ ] **Step 1: Failing tests** — each transport's `main` with injected edges: two registered entries → exit `1`, stderr exactly the Global Constraints line, the edges' parameter reader never called, nothing listens; one entry → starts as today; `secondCopyLine` with one entry → `undefined`.
- [ ] **Step 2:** implement; call it first in each `main`.
- [ ] **Step 3:** green; remove the call from one `main`, see red, revert.
- [ ] **Step 4:** commit `feat: the runtime refuses a second copy of lib at start (#303)`.

### Task 8: pipelines

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `src/__tests__/unit/releaseMetadata.test.ts`, `scripts/ci/check-images.mjs`, `scripts/portable/build.mjs`

- [ ] **Step 1:** workflows: the runtime's `lint:check` and `test:check`; the transports' `test:check` steps point at the runtime; `./server-runtime` in both `npm pack` lists and in every hard-coded package inventory of the install and Docker steps.
- [ ] **Step 2:** `releaseMetadata.test.ts`: the runtime has no registry entry; `check-images.mjs` verifies the runtime in each image came from the tarball; `build.mjs` substitutes `runtimeVersion` as it substitutes `coreVersion`.
- [ ] **Step 3:** full gate list green; commit `ci: server-runtime in the pipelines (#303)`.

### Task 9: the install matrix and the portable check

**Files:**
- Create: `src/__tests__/unit/installMatrix.test.ts`
- Modify: `scripts/portable/smoke.mjs`

- [ ] **Step 1: The matrix** (tarballs only, temp prefixes): layouts 1–5 of spec §4; in each a child `node` requires the binary's launcher and its tool set's packages and asserts `libInstances().length === 1` and that `runWithRequestContext` entered through the runtime's resolved `lib` is seen by the handler packages' resolved `lib`; each binary's `--version` is its own; `npm ls --json` shows every `@mcp-abap-adt/*` package of the release from its tarball. Layout 5 packs a copy of the runtime at a later patch in a temp dir.
- [ ] **Step 2:** prove it red where the defect is: run layout 1 against the published 19.1.0 (registry, read-only) and record two copies — the assertion fails there.
- [ ] **Step 3:** `smoke.mjs` starts both portable binaries with the staging `node_modules` removed and asserts one registered copy, `file: bundled`.
- [ ] **Step 4:** commit `test: install matrix proves one lib per process (#303)`.

### Task 10: documentation and release notes

**Files:**
- Modify: `README.md`, `server/README.md`, `http/README.md`, `sse/README.md`, `server-runtime/README.md`, `docs/deployment/RELEASE.md`, `docs/architecture/*` (package diagram, dependency rule), `CHANGELOG.md`

- [ ] **Step 1:** README package table gains `server-runtime` (no command, installed with each server); install section: each server on its own command; the three base READMEs say where the code lives.
- [ ] **Step 2:** `RELEASE.md`: eighteen packages, the table with the runtime, its dependencies and peers, publish order, step 9 adds the post-publish proof (a clean global install of each wrapper with its former base, from the registry, starts and answers `--version`).
- [ ] **Step 3:** architecture docs: the dependency rule and the guard.
- [ ] **Step 4:** CHANGELOG `## [19.2.0]`: `### Changed` — the runtime package, the rule, `lib` as a peer below the binaries; `### Fixed` — #303 with the remedy for an existing double install (reinstall each server on its own).
- [ ] **Step 5:** full gate list; `npm run docs:tools` output unchanged; commit `docs: server-runtime (#303)`.

### Task 11: delete the working documents

- [ ] **Step 1:** after the final review approves, delete the goal, the spec and this plan; move what they still owe into the PR description.
- [ ] **Step 2:** commit `docs: remove #303's goal, spec and plan`.
