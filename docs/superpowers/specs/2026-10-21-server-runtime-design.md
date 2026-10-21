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

- Dependencies: the union of what `server`, `http` and `sse` declare today
  (`@mcp-abap-adt/lib`, `background-runs-memory`, `responsible-rules`, the auth chain,
  `connection`, `logger`, `@modelcontextprotocol/sdk`, `express`, `dotenv`), the sibling
  ranges at `^19.2.0`.
- Development resolution as `server`, `http` and `sse` resolve `lib` today (tsconfig
  `paths` into `../dist`); no workspace links.

## 2. The twelve binary packages

Every binary package depends on `@mcp-abap-adt/server-runtime`, on `@mcp-abap-adt/lib`
and on its own parts (`compact-readonly-entries`, `compact-modify`) — and on **no other
binary package**.

- **`core`, `http`, `sse`** keep their `bin`, their version module and their exports, as
  re-exports, so an importer of today's paths sees no change:
  `@mcp-abap-adt/core` re-exports `server-runtime/stdio/server`, `core/launcher`
  re-exports `server-runtime/stdio`, `core/auth` re-exports `server-runtime/auth`; `http`
  and `sse` likewise. Their `bin` calls the runtime's `main` with their tool set, program
  name and own version, as today.
- **The nine wrappers** (`compact`, `compact-ro`, `core-ro`, `compact-http`,
  `compact-http-ro`, `http-ro`, `compact-sse`, `compact-sse-ro`, `sse-ro`) import the
  runtime's paths instead of their base's (`@mcp-abap-adt/core/launcher` →
  `@mcp-abap-adt/server-runtime/stdio`, …) and drop the dependency on `core`, `http` or
  `sse`. Their `bin` takes `launcherFailedLine` from the runtime too. Each keeps passing
  its own version.

## 3. The second-copy guard

- **`lib` registers each loaded instance**: a module `src/lib/instance.ts` adds the
  realpath of its package root to a set on
  `globalThis[Symbol.for('@mcp-abap-adt/lib/instances')]` when it loads, and exports
  `libInstances(): readonly string[]`. Every public entry of `lib` (each path in its
  `exports` map) imports it for its side effect. `lib` itself never refuses anything, so
  an embedder sees no change.
- **The runtime checks at start**: each transport's `main` calls
  `libInstances()` first, before it reads its parameters. More than one path stops the
  start with exit code `1` and one line on stderr:
  `Two copies of @mcp-abap-adt/lib are loaded in this process (<path>, <path>): install <program> on its own (npm install -g <package>), not in one command with another mcp-abap-adt server.`
  The two paths are the installed package roots; nothing else is printed.

## 4. Tests

- The moved tests run where they move, unchanged except import paths.
- **Guard**: a unit test registers two fake package roots and asserts each transport's
  `main` exits `1` with exactly the line above and reads no parameter; one registered
  root starts as today. Every `lib` export entry imports `instance.ts` (a test over the
  `exports` map: loading each entry in a fresh module registry registers one root).
- **The dependency rule** (`packageSet.test.ts`): no binary package lists another
  binary package in `dependencies`; every binary package lists
  `@mcp-abap-adt/server-runtime`; `server-runtime` has no `bin`.
- **The install proof** (`binSmoke`, which already packs every package and installs the
  binaries): additionally, `npm install -g --prefix <tmp>` of each wrapper **together with
  its former base**, from the packed tarballs, in one command; then the wrapper's process
  loads no file outside its own install tree (its `require.cache` after requiring its
  launcher, checked by a child `node`), and its `--version` answers its own version.

## 5. Release and build plumbing

- `scripts/publish-all.sh`: `./server-runtime` after `./responsible-rules` and
  `./compact-modify`, before `./server`; the comment's "seventeen" becomes "eighteen".
- `docs/deployment/RELEASE.md`: the package table (eighteen, `server-runtime` with no
  binary and its dependencies), the steps' package list, the order.
- CI and release workflows: `server-runtime`'s `lint:check` and `test:check` beside the
  others; the transports' `test:check` steps move to it.
- Docker (`docker/Dockerfile`): the tarball stage includes `server-runtime`; the
  variants are unchanged. `scripts/portable/build.mjs`: entry paths follow the move.
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
