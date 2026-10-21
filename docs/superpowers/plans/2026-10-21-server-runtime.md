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
- What a user runs does not change: twelve binaries, names, options, tool sets, `--version` and `serverInfo.version` (each binary's own version).
- `lib` refuses nothing; only the runtime's `main` acts on a second copy.
- The guard's line, verbatim: `Two copies of @mcp-abap-adt/lib are loaded in this process (<file>, <file>): reinstall <package> (npm install -g <package>).`
- No timeouts introduced; no `npx` in scripts; tool descriptions untouched.
- CHANGELOG: lines go into the current top entry (`## [19.2.0]`, shared with #305); earlier entries never change; the entry's date is set on each change.
- `CLAUDE.md` / `SCOPE.md` are not edited by implementers (controller, with the owner's approval of the text).

## Review Focus

1. A global install of a wrapper **together with its former base in one command** — the reported case — must load one `lib` (Task 8, layout 1).
2. `npm install --install-strategy=nested` of a binary — the layout ordinary dependencies do not deduplicate — must load one `lib` (Task 8, layout 4).
3. The portable SEA binaries (no `node_modules` on the target) must start and register one copy (Task 8, portable).
4. A direct `new StdioServer(...)` from `@mcp-abap-adt/core` without `opts.version` must still answer core's version (Task 4).
5. An embedder that installs `lib` plus `compact-readonly-entries` (no binary) must see no refusal and no missing peer (Task 4, packageSet + a local install case in Task 8).

---

### Task 1: `lib` registers each loaded copy

**Files:**
- Create: `src/lib/instance.ts`
- Modify: every module named in the root `package.json` `exports` map (`src/index.ts`, `src/lib/handlers/index.ts`, `src/lib/utils.ts`, `src/embeddable/index.ts`, `src/lib/config/index.ts`, `src/lib/auth/index.ts`, `src/lib/handlerLogger.ts`, `src/lib/requestContext.ts`, `src/lib/handlers/read.ts`, `src/lib/handlers/write.ts`, `src/lib/compact/index.ts`, `src/lib/httpTransport/index.ts`, `src/lib/debugger/index.ts`, `src/lib/state/index.ts`, `src/lib/toolSet.ts`, `src/lib/adtHeaders/index.ts`, `src/lib/toolSearch/index.ts`)
- Test: `src/__tests__/unit/libInstance.test.ts`

**Interfaces:**
- Produces: `libInstances(): readonly { file: string }[]` exported from `@mcp-abap-adt/lib/config` (and the root); the registry key `Symbol.for('@mcp-abap-adt/lib/instances')`.

- [ ] **Step 1: Failing tests** — `libInstance.test.ts`: (a) loading `instance.ts` once registers one entry whose `file` is the module's `__filename`; (b) loading it again in an isolated module registry (`jest.isolateModules`) registers a second entry — two copies, two entries; (c) every path of the root `exports` map, loaded in a fresh isolated registry with the global array reset, registers exactly one entry (reads the map from `package.json`, maps `dist/…js` to the `src/…ts` module); (d) `file` is `bundled` when `__filename` is not a string (simulate by evaluating the module source in a context without it).
- [ ] **Step 2:** run `npm test -- src/__tests__/unit/libInstance.test.ts` — fails (module missing).
- [ ] **Step 3:** implement `instance.ts` per spec §3 (push `{ file }` on load; no file system access; no export of a mutator); add `import './instance'` (relative path from each entry) as a side-effect import at the top of every entry listed above; export `libInstances` from `config` and the root.
- [ ] **Step 4:** the test passes; `npm run test:check`, `npm run lint:check`.
- [ ] **Step 5:** break the side-effect import of one entry, see (c) red, revert; commit `feat(lib): each loaded copy registers itself (#303)`.

### Task 2: the `server-runtime` package and the stdio move

**Files:**
- Create: `server-runtime/package.json`, `server-runtime/tsconfig.json`, `server-runtime/README.md`, `server-runtime/LICENSE` (copy of `server/LICENSE`), `server-runtime/src/runtimeVersion.ts`
- Move (`git mv`): `server/src/{launcher.ts,StdioServer.ts,destinationSource.ts,shutdown.ts,config/,auth/,index.ts}` → `server-runtime/src/stdio/…` (`index.ts` becomes `stdio/server.ts`, the `stdio/server` export); `server/src/__tests__/` → `server-runtime/src/stdio/__tests__/`
- Keep: `server/src/coreVersion.ts`, `server/bin/`
- Modify: root `package.json` (`build`, `prebuild` clean list, `lint:check`/`test:check` if they list package dirs), `scripts/publish-all.sh`
- Modify: `src/__tests__/integration/helpers/packageSources.ts` (jest mapping of package names to sources)

**Interfaces:**
- Produces: exports `@mcp-abap-adt/server-runtime/stdio` (`main`, `launcherFailedLine`, `StdioLauncherEdges`, `LauncherOptions`, `coreHelp`, …), `/stdio/server` (`StdioServer`, core's parameter table, env resolution, destination source), `/auth`; `RUNTIME_VERSION: string`.

- [ ] **Step 1:** create the package manifest: name, `AGPL-3.0-only`, no `bin`, `exports` for `./stdio`, `./stdio/server`, `./auth` (Task 3 adds the others), `files: ["dist/", "README.md", "LICENSE"]`, `dependencies` = what `server/package.json` declares minus `lib`, `background-runs-memory`, `responsible-rules`, which go to `peerDependencies` and `devDependencies` (`^19.2.0`). `tsconfig.json` mirrors `server/tsconfig.json` (`paths` into `../dist`, `../background-runs-memory/dist`, `../responsible-rules/dist`).
- [ ] **Step 2:** `git mv` the files above; fix relative imports inside the moved tree only.
- [ ] **Step 3:** `runtimeVersion.ts` reads `../package.json` (as `coreVersion.ts` does); `StdioServer` defaults `opts.version` to `RUNTIME_VERSION` instead of `CORE_VERSION`. The moved tests that assert the default version expect `RUNTIME_VERSION`.
- [ ] **Step 4:** root build compiles `server-runtime` after `responsible-rules` and before `server`; the clean list includes `server-runtime/dist`; `publish-all.sh` lists `./server-runtime` after `./compact-modify`, before `./server`, and its comment says eighteen; `packageSources.ts` maps `@mcp-abap-adt/server-runtime/*` to `server-runtime/src/*`.
- [ ] **Step 5:** `server/` temporarily re-exports from `../server-runtime` sources so it still builds (Task 4 makes it final) — or Task 4 is done in the same commit if simpler; either way `npm run build` and the moved tests pass: `npm test -- server-runtime/src/stdio`.
- [ ] **Step 6:** commit `refactor: stdio launch code moves to @mcp-abap-adt/server-runtime (#303)`.

### Task 3: the http and sse moves

**Files:**
- Move (`git mv`): `http/src/{launcher.ts,StreamableHttpServer.ts,InstancePool.ts,config/,index.ts}` → `server-runtime/src/http/…` (`index.ts` → `http/server.ts`); `sse/src/{launcher.ts,SseServer.ts,config/,index.ts}` → `server-runtime/src/sse/…`; their `__tests__/` alongside
- Keep: `http/src/httpVersion.ts`, `sse/src/sseVersion.ts`, `http/bin/`, `sse/bin/`
- Modify: `server-runtime/package.json` (exports `./http`, `./http/server`, `./sse`, `./sse/server`; `express` dependency)

**Interfaces:**
- Consumes: Task 2's package and `RUNTIME_VERSION`.
- Produces: `@mcp-abap-adt/server-runtime/http` (`main`), `/http/server` (`StreamableHttpServer`, http's parameter table), `/sse` (`main`), `/sse/server` (`SseServer`, sse's parameter table).

- [ ] **Step 1:** `git mv`; fix relative imports in the moved trees; `StreamableHttpServer` and `SseServer` default `opts.version` to `RUNTIME_VERSION`.
- [ ] **Step 2:** no moved source reaches another transport's directory by a relative path (grep; the dependencyRule test in Task 7 enforces it).
- [ ] **Step 3:** `npm run build`, `npm test -- server-runtime/src/http server-runtime/src/sse` pass.
- [ ] **Step 4:** commit `refactor: http and sse launch code move to server-runtime (#303)`.

### Task 4: `core`, `http`, `sse` become thin; peers per §2a

**Files:**
- Modify: `server/src/index.ts`, `server/src/launcher.ts`, `server/src/auth/index.ts` (re-export modules), `http/src/index.ts`, `http/src/launcher.ts`, `sse/src/index.ts`, `sse/src/launcher.ts`, their `bin/*.js`, `server/package.json`, `http/package.json`, `sse/package.json`
- Modify: `background-runs-memory/package.json`, `responsible-rules/package.json`, `compact-readonly-entries/package.json`, `compact-modify/package.json` (lib → peer + dev)
- Test: `server/src/__tests__/exports.test.ts`, `http/src/__tests__/exports.test.ts`, `sse/src/__tests__/exports.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3 exports.
- Produces: unchanged public paths `@mcp-abap-adt/core`, `/launcher`, `/auth`; `@mcp-abap-adt/http`, `/launcher`; `@mcp-abap-adt/sse`, `/launcher`.

- [ ] **Step 1: Failing tests** — each `exports.test.ts`: every name today's `index`/`launcher`/`auth` exported is still exported (compare against the list in `dist` of the 19.1.0 package, written into the test); `new StdioServer({...})` from `@mcp-abap-adt/core` without `version` reports `CORE_VERSION` (and `HTTP_VERSION` / `SSE_VERSION` likewise), with the runtime's version module mocked to another value to prove the subclass decides.
- [ ] **Step 2:** re-export modules; each server class exported as a subclass defaulting `opts.version` to the package's own version (spec §2); bins call the runtime's `main` with the tool set, program and own version, `launcherFailedLine` from the runtime.
- [ ] **Step 3:** manifests: each base depends on `server-runtime`, `lib`, `background-runs-memory`, `responsible-rules` (`^19.2.0`) and on nothing it no longer imports; the four packages above move `lib` to `peerDependencies` (+ `devDependencies`).
- [ ] **Step 4:** tests pass; `npm run build`; `npm --prefix server run test:check` and the same for `http`, `sse` (or their replacement in Task 7's CI change).
- [ ] **Step 5:** commit `refactor: core, http and sse re-export the runtime; lib is a peer below the binaries (#303)`.

### Task 5: the nine wrappers

**Files:**
- Modify: `compact/`, `compact-ro/`, `core-ro/`, `compact-http/`, `compact-http-ro/`, `http-ro/`, `compact-sse/`, `compact-sse-ro/`, `sse-ro/` — each `src/launcher.ts`, `bin/*.js`, `package.json`

**Interfaces:**
- Consumes: `@mcp-abap-adt/server-runtime/stdio|http|sse` (`main`, `launcherFailedLine`, `StdioLauncherEdges`).

- [ ] **Step 1:** imports `@mcp-abap-adt/core/launcher` → `@mcp-abap-adt/server-runtime/stdio` (http, sse likewise); `bin` takes `launcherFailedLine` from the runtime.
- [ ] **Step 2:** manifests drop `core` / `http` / `sse`; add `server-runtime`, `background-runs-memory`, `responsible-rules` (`^19.2.0`); `lib` stays in `dependencies`.
- [ ] **Step 3:** each wrapper's existing tests pass; `node <wrapper>/bin/<bin>.js --version` from the built tree answers the wrapper's version.
- [ ] **Step 4:** commit `refactor: wrappers depend on the runtime, not on another binary (#303)`.

### Task 6: the runtime refuses a second copy

**Files:**
- Modify: `server-runtime/src/stdio/launcher.ts`, `server-runtime/src/http/launcher.ts`, `server-runtime/src/sse/launcher.ts`
- Create: `server-runtime/src/secondCopy.ts`
- Test: `server-runtime/src/__tests__/secondCopy.test.ts`

**Interfaces:**
- Consumes: `libInstances()` (Task 1).
- Produces: `secondCopyLine(instances, packageName): string | undefined`.

- [ ] **Step 1: Failing tests** — for each transport's `main` with injected edges: two registered entries → exit `1`, stderr exactly the Global Constraints line (files and package substituted), no parameter read (the edges' config reader is never called), nothing listens; one entry → starts as today. `secondCopyLine` with one entry → `undefined`.
- [ ] **Step 2:** implement `secondCopy.ts`; call it first in each `main`, before parameters; the package name is the one the binary passes in (add it to `LauncherOptions` beside `program` if absent).
- [ ] **Step 3:** tests pass; break the call in one `main`, see red, revert.
- [ ] **Step 4:** commit `feat: the runtime refuses a second copy of lib at start (#303)`.

### Task 7: dependency gates

**Files:**
- Modify: `src/__tests__/unit/packages/packageSet.test.ts`, `src/__tests__/unit/packages/dependencyRule.test.ts`, `src/__tests__/unit/releaseMetadata.test.ts`
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1:** `packageSet.test.ts` per spec §4 (no binary depends on a binary; binaries list runtime, lib, the two state packages; the five list lib as peer, not dependency; runtime has no bin); `releaseMetadata.test.ts` knows `server-runtime` has no registry entry.
- [ ] **Step 2:** `dependencyRule.test.ts` migrated per spec §4 (runtime among the sibling dirs; wrapper rows require reaching the runtime path of their transport; peers accepted as declared where §2a makes them peers; isolation checks over the moved sources and `dist`).
- [ ] **Step 3:** prove each new rule load-bearing: add a binary-to-binary dependency in a scratch manifest edit → red; move `lib` back to `dependencies` of `compact-modify` → red; revert both.
- [ ] **Step 4:** workflows: `server-runtime`'s `lint:check` and `test:check`; the transports' `test:check` steps point at the runtime; `./server-runtime` in both `npm pack` lists and in every hard-coded package inventory of the install and Docker steps.
- [ ] **Step 5:** commit `test: dependency gates for server-runtime and lib peers (#303)`.

### Task 8: the install matrix and the portable check

**Files:**
- Modify: `src/__tests__/helpers/installedRelease.ts`, `src/__tests__/unit/binSmoke.test.ts`
- Create: `src/__tests__/unit/installMatrix.test.ts`
- Modify: `scripts/portable/smoke.mjs`, `scripts/ci/check-images.mjs`

- [ ] **Step 1: The matrix test** (packs every package once, installs from the tarballs only into temp prefixes): layouts 1–5 of spec §4; in each, a child `node` requires the binary's launcher and its tool set's packages, then asserts `libInstances().length === 1` and that `runWithRequestContext` entered through the runtime's resolved `lib` is seen by the handler packages' resolved `lib`; each binary's `--version` answers its own version; every `@mcp-abap-adt/*` package of the release resolves to a tarball (`npm ls --json`), none from the registry. Layout 5 builds a runtime tarball at a later patch by packing a copy with its version bumped in a temp dir.
- [ ] **Step 2:** see it fail on 19.1.0's layout first: run layout 1 against the tarballs of `origin/main` before Task 4–5 (or against the published 19.1.0 from the registry, read-only) and record the two copies — the test must be red there.
- [ ] **Step 3:** `binSmoke` / `installedRelease.ts` pack `server-runtime` too.
- [ ] **Step 4:** portable: `smoke.mjs` starts both portable binaries with the staging `node_modules` removed and asserts one registered copy with `file: bundled`; `build.mjs` substitutes `runtimeVersion` as it substitutes `coreVersion`.
- [ ] **Step 5:** `check-images.mjs` verifies the runtime in each image came from the tarball.
- [ ] **Step 6:** commit `test: install matrix proves one lib per process (#303)`.

### Task 9: documentation and release notes

**Files:**
- Modify: `README.md`, `server/README.md`, `http/README.md`, `sse/README.md`, `server-runtime/README.md`, `docs/deployment/RELEASE.md`, `docs/architecture/*` (package diagram, dependency rule), `CHANGELOG.md`

- [ ] **Step 1:** README package table gains `server-runtime` (no command, installed with each server); install section: each server is installed on its own command; the three base READMEs say where the code lives.
- [ ] **Step 2:** `RELEASE.md`: eighteen packages, the table with `server-runtime` and its dependencies and peers, publish order, step 9 adds the post-publish proof (a clean global install of each wrapper together with its former base, from the registry, starts and answers `--version`).
- [ ] **Step 3:** architecture docs: the dependency rule and the guard.
- [ ] **Step 4:** CHANGELOG `## [19.2.0]`: `### Changed` — the new package, the dependency rule, lib as a peer below the binaries; `### Fixed` — #303 with the remedy for an existing double install (reinstall each server on its own).
- [ ] **Step 5:** full gate list (CI's), `npm run docs:tools` unchanged output, commit `docs: server-runtime (#303)`.

### Task 10: delete the working documents

- [ ] **Step 1:** after the final review approves, delete `docs/superpowers/2026-10-21-server-runtime-goal.md`, the spec and this plan; move anything they still owe into the PR description.
- [ ] **Step 2:** commit `docs: remove #303's goal, spec and plan`.
