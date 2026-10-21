# Design: `@mcp-abap-adt/server-runtime` — one `lib` per server process

Answers [the goal](../2026-10-21-server-runtime-goal.md) (#303).

## 1. The new package

- Directory `server-runtime/`, package `@mcp-abap-adt/server-runtime`, license
  `AGPL-3.0-only` (the code it holds is AGPL today), **no `bin`**, version aligned with the
  release (19.2.0).
- It holds the server code that is today in `server/src`, `http/src` and `sse/src`,
  except each binary's own version module (`coreVersion.ts`, `httpVersion.ts`,
  `sseVersion.ts`), which stays with its binary. Moved as it is, by `git mv`, so history
  follows; no behaviour change.
- **Version defaults.** `StdioServer`, `StreamableHttpServer` and `SseServer` default
  `opts.version` to a version module of their own package today. In the runtime they
  default to **`RUNTIME_VERSION`**, the runtime's own version (`src/runtimeVersion.ts`,
  read from its manifest as `coreVersion.ts` reads core's; the portable build substitutes
  it as it substitutes `coreVersion`). A binary always passes its own version through
  `main`, as today, so `--version` and `serverInfo.version` stay the binary's.
- Layout: `server-runtime/src/stdio/` (today's `server/src`: `launcher.ts`,
  `StdioServer.ts`, `destinationSource.ts`, `shutdown.ts`, `config/`, `auth/`),
  `server-runtime/src/http/` (today's `http/src`), `server-runtime/src/sse/` (today's
  `sse/src`). Their tests move with them (`server/src/__tests__` →
  `server-runtime/src/stdio/__tests__`, and so on).
- Exports, one import path per transport and one for the destination layer:

  | Path | What | Was |
  |---|---|---|
  | `@mcp-abap-adt/server-runtime/stdio` | stdio launcher: `main`, `launcherFailedLine`, `StdioLauncherEdges`, … | `@mcp-abap-adt/core/launcher` |
  | `@mcp-abap-adt/server-runtime/stdio/server` | `StdioServer`, core's parameter table, env resolution, destination source | `@mcp-abap-adt/core` |
  | `@mcp-abap-adt/server-runtime/auth` | the destination layer | `@mcp-abap-adt/core/auth` |
  | `@mcp-abap-adt/server-runtime/http` | Streamable HTTP launcher | `@mcp-abap-adt/http/launcher` |
  | `@mcp-abap-adt/server-runtime/http/server` | `StreamableHttpServer`, http's parameter table | `@mcp-abap-adt/http` |
  | `@mcp-abap-adt/server-runtime/sse` | SSE launcher | `@mcp-abap-adt/sse/launcher` |
  | `@mcp-abap-adt/server-runtime/sse/server` | `SseServer`, sse's parameter table | `@mcp-abap-adt/sse` |

- Dependencies: the union of what `server`, `http` and `sse` declare today (the auth
  chain, `connection`, `logger`, `@modelcontextprotocol/sdk`, `express`, `dotenv`),
  except `@mcp-abap-adt/lib`, `background-runs-memory` and `responsible-rules`, which it
  takes as **peer dependencies** (§2a); the sibling ranges at `^19.2.0`.
- Development resolution as `server`, `http` and `sse` resolve `lib` today (tsconfig
  `paths` into `../dist`); no workspace links.

## 2a. Who owns `lib`: one `dependencies` entry per install tree

Matching ranges let npm deduplicate `lib`, but do not make it: with
`--install-strategy=nested`, or a range one package cannot share, each dependent gets
its own copy. So exactly one package of a server's tree declares `@mcp-abap-adt/lib` in
`dependencies`: **the binary package**. Every other package of the server that uses
`lib` or its state declares it in `peerDependencies` (and in `devDependencies` for its
own build and tests): `server-runtime`, `compact-readonly-entries`, `compact-modify`,
`background-runs-memory`, `responsible-rules`. npm then resolves each of them to the
binary's one copy, in every layout. The same holds for `background-runs-memory` and
`responsible-rules` towards `server-runtime`: the binary package declares them, the
runtime takes them as peers. An embedder that installs `compact-readonly-entries` with
`lib` (as today) sees no change: npm 7+ installs a missing peer, and a present one is
used.

## 2. The twelve binary packages

Every binary package depends on `@mcp-abap-adt/server-runtime`, `@mcp-abap-adt/lib`,
`background-runs-memory`, `responsible-rules` and its own parts
(`compact-readonly-entries`, `compact-modify`) — and on **no other binary package**.

- **`core`, `http`, `sse`** keep their `bin`, their version module and their exports, as
  re-exports, so an importer of today's paths sees no change:
  `@mcp-abap-adt/core` re-exports `server-runtime/stdio/server`, `core/launcher`
  re-exports `server-runtime/stdio`, `core/auth` re-exports `server-runtime/auth`; `http`
  and `sse` likewise. The one export that is not a plain re-export is each server class:
  `core` exports `StdioServer` as a subclass of the runtime's that defaults
  `opts.version` to `CORE_VERSION` (and `http` / `sse` likewise with `HTTP_VERSION` /
  `SSE_VERSION`), so a direct constructor call without a version answers the package's
  version as today, even when the runtime is at another patch. Their `bin` calls the runtime's `main` with their tool set, program
  name and own version, as today.
- **The nine wrappers** (`compact`, `compact-ro`, `core-ro`, `compact-http`,
  `compact-http-ro`, `http-ro`, `compact-sse`, `compact-sse-ro`, `sse-ro`) import the
  runtime's paths instead of their base's (`@mcp-abap-adt/core/launcher` →
  `@mcp-abap-adt/server-runtime/stdio`, …) and drop the dependency on `core`, `http` or
  `sse`. Their `bin` takes `launcherFailedLine` from the runtime too. Each keeps passing
  its own version.

## 3. The second-copy guard

- **`lib` registers each loaded copy**: a module `src/lib/instance.ts`, when it loads,
  pushes one entry `{ file }` onto an array on
  `globalThis[Symbol.for('@mcp-abap-adt/lib/instances')]` and exports
  `libInstances(): readonly { file: string }[]`. The identity is the loaded module
  itself: each copy of the module pushes once, so the array's length is the number of
  copies. `file` is the module's `__filename` when there is one, `bundled` otherwise; it
  is only shown, never resolved, read or compared — no package directory is looked up,
  so a bundle (`scripts/portable`, a Node SEA executable with no `node_modules`) holds
  one copy and registers once. Every public entry of `lib` (each path in its `exports`
  map) imports it for its side effect. `lib` itself never refuses anything, so an
  embedder sees no change.
- **The runtime checks at start**: each transport's `main` calls
  `libInstances()` first, before it reads its parameters. More than one path stops the
  start with exit code `1` and one line on stderr:
  `Two copies of @mcp-abap-adt/lib are loaded in this process (<file>, <file>): reinstall <package> (npm install -g <package>).`
  The files are the registered ones; nothing else is printed. With §2a a supported
  layout never reaches it; it names a defect (a hand-made tree, a broken install) instead
  of letting it surface as a refused tool call.

## 4. Tests

- The moved tests run where they move, unchanged except import paths.
- **Guard**: a unit test registers two fake package roots and asserts each transport's
  `main` exits `1` with exactly the line above and reads no parameter; one registered
  root starts as today. Every `lib` export entry imports `instance.ts` (a test over the
  `exports` map: loading each entry in a fresh module registry registers one root).
- **The dependency rule** (`packageSet.test.ts`): no binary package lists another
  binary package in `dependencies`; every binary package lists
  `@mcp-abap-adt/server-runtime`, `lib`, `background-runs-memory` and
  `responsible-rules` in `dependencies`; `server-runtime`, `compact-readonly-entries`,
  `compact-modify`, `background-runs-memory` and `responsible-rules` list `lib` (and the
  runtime its two sibling state packages) in `peerDependencies`, not in `dependencies`;
  `server-runtime` has no `bin`.
- **`dependencyRule.test.ts` migrates to the new graph**: `server-runtime` joins its
  sibling directories and is walked from its `exports`; the rows requiring a wrapper to
  declare and reach its former base (`compactOver` / `readOnlyOver`) require it to reach
  the runtime's path of its transport instead; the rows requiring `lib` in
  `background-runs-memory`'s and `responsible-rules`' `dependencies` require it in
  `peerDependencies`; "declared" accepts a peer where §2a makes it one. The isolation
  checks keep their meaning over the moved sources and the built `dist`: the HTTP and
  SSE transports reach no stdio module and no auth-broker / auth-stores /
  interfaces-auth-broker; only the stdio path and `auth` reach those; the read-only
  packages reach the half that changes nothing and never the modifying half or another
  transport; no source reaches another transport's directory by a relative path.
- **The install matrix** (`binSmoke.test.ts` / `helpers/installedRelease.ts`, which pack
  every package and install from the tarballs): every layout below, from the packed
  tarballs only. In each, a child `node` started in the install requires the binary's
  launcher and the packages its tool set loads, then asserts **`libInstances().length ===
  1`** and **shared state**: inside `runWithRequestContext` entered through the
  runtime's `lib`, the handler packages' `lib` reads the same context. Dependencies
  outside the wrapper's directory (hoisting) are allowed; only the count and the shared
  state are asserted. Each binary also answers `--version` with its own version.
  1. global, each wrapper **in one command with its former base** (all nine);
  2. global, wrapper and base in two commands, either order (one per transport);
  3. local, default (hoisted) install of all twelve binaries;
  4. local, `--install-strategy=nested` (one per transport, compact and plain);
  5. a version skew the ranges allow: the binary at the release version with a
     runtime tarball of a later patch (one case), still one copy.
- **No registry fetch of the release's own packages** in any of these installs: every
  `@mcp-abap-adt/*` package of the release resolves to its tarball (checked in the
  install's lockfile / `npm ls --json` resolved fields).
- **Portable**: `scripts/portable/smoke.mjs` starts both portable binaries with the
  staging `node_modules` removed and asserts one registered copy (`file: bundled`).
- **After publishing** (a release step, `RELEASE.md` step 9): a clean global install of
  each wrapper together with its former base, from the registry, starts, and its
  `--version` answers.

## 5. Release and build plumbing

- `scripts/publish-all.sh`: `./server-runtime` after `./responsible-rules` and
  `./compact-modify`, before `./server`; the comment's "seventeen" becomes "eighteen".
- `docs/deployment/RELEASE.md`: the package table (eighteen, `server-runtime` with no
  binary and its dependencies), the steps' package list, the order.
- CI and release workflows (`.github/workflows/ci.yml`, `release.yml`):
  `server-runtime`'s `lint:check` and `test:check` beside the others, the transports'
  `test:check` steps moved to it; **`./server-runtime` in both `npm pack` lists** and in
  every hard-coded package inventory of the install and Docker steps, so the install and
  the images take the runtime from this checkout's tarball, never from the registry.
- `binSmoke` / `installedRelease.ts`: the packed package list includes `server-runtime`.
- Docker (`docker/Dockerfile`) consumes every supplied tarball already; the image check
  (`scripts/ci/check-images.mjs`) verifies the runtime in each image came from the
  tarball. `scripts/portable/build.mjs`: the bundle's entry still is each binary's bin;
  the `coreVersion` substitution stays (the module stays in `core`).
- `releaseMetadata.test.ts`: `server-runtime` has no registry entry (it is not a server);
  the twelve entries unchanged.
- Root `package.json` build: `tsc -p server-runtime/tsconfig.json` before the binary
  packages; jest's module mapping for package sources (`packageSources.ts`) gains the
  runtime's paths.
- Every manifest of the release at 19.2.0, the sibling ranges at `^19.2.0`.

## 6. Documentation

- `README.md`: the package table gains `server-runtime` (no command, installed with
  each server); the install section says each server is installed on its own command.
- `server/`, `http/`, `sse/` READMEs: where the code now lives.
- `docs/architecture/`: the package diagram and the dependency rule.
- `CHANGELOG.md` 19.2.0, `### Changed`: the new package and the rule; `### Fixed`: #303,
  with the remedy for an existing double install (reinstall each server on its own).

## 7. Not in this change

Sharing `lib` state between copies; dropping HTTP or SSE; any tool change; the
`lib` API.
