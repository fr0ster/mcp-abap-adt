# Portable builds — design

Status: draft for review (2026-10-05). Deleted once implemented or cancelled.

## Goal

A user copies one archive to a machine, unpacks it and runs the server — the full one or the compact
one, each its own archive. Nothing else is installed:
no Node.js, no npm, no compiler, no `SAPNWRFC_HOME` at install time. **A portable build is a personal build** (stated 2026-10-06): whoever needs one builds it on their own
machine with their own SAP NW RFC SDK, and the build copies that SDK's runtime libraries into the archive,
so HTTP, RFC and SNC need nothing more. The archives are never published or handed on — SAP licenses the
SDK through its Support Portal — and say so in their README.

Two archives per platform, one per server (`<server>` is `mcp-abap-adt` — the full server,
`@mcp-abap-adt/core` — or `mcp-abap-adt-compact`, `@mcp-abap-adt/compact`):

| Platform | Connections | Archives |
|---|---|---|
| Windows x64 | HTTP, RFC, SNC | `<server>-<version>-win-x64.zip` |
| macOS arm64 | HTTP, RFC, SNC | `<server>-<version>-macos-arm64.zip` |
| Linux x64 | HTTP, RFC | `<server>-<version>-linux-x64.tar.gz` |

Six archives per platform set. The two servers share everything below; only the bundled entry point and
the executable's name differ.

Out of scope: macOS x64 (no Intel SDK at hand), SNC on Linux, bundling the SDK, an RFC client
without the SDK (`open-rfc` has no SNC and no transport encryption, beta), installers, auto-update.

## What the user does

```text
mcp-abap-adt-17.x.y-win-x64/
  mcp-abap-adt.exe          ← the server (Node.js inside); mcp-abap-adt-compact.exe in the compact archive
  README.txt                ← these steps, short
  nwrfcsdk/lib/             ← the SDK's runtime libraries (.dll/.dylib/.so) and the RFC addon, put there by the build
```

1. Unpack.
2. Point the MCP client at `mcp-abap-adt.exe --env-path=…`. HTTP, RFC and SNC work as they are; SNC
   needs the SNC product (Secure Login Client), exactly as with the npm install.

`SAPNWRFC_HOME`, when set, is honoured instead of `nwrfcsdk/` (its `lib/`).

## Architecture

### One executable per server and platform: Node SEA

The executable is the official Node.js single executable application: the Node binary of the target
platform with our bundled program injected as a blob (`postject`). Node **24** (LTS, on SAP BTP's
list; SEA "active development" on 22 and 24). `--build-sea` exists only from Node 25.5, so the build
uses `--experimental-sea-config` + `postject`. Each platform is built on its own runner — the docs
advise against cross-generation, and the RFC addon is native anyway.

### The program inside: one bundle

`esbuild` bundles one entry point with `@mcp-abap-adt/lib` and every dependency into one CommonJS
file, the SEA's main script: `server/` (the `mcp-abap-adt` launcher) for the full server,
`compact/` (`mcp-abap-adt-compact`, which hands its tool list to the same launcher) for the compact
one. Dynamic requires that must survive bundling
are listed and handled explicitly (the build fails if an unexpected one remains):

- `@mcp-abap-adt/sap-rfc-lite` (required lazily by `@mcp-abap-adt/connection` when an RFC
  conversation opens) is bundled; its native loader is replaced, see below.
- `open` (browser login) and similar optional paths are bundled as they are.

### The RFC addon: built with the user's SDK, embedded, placed beside it

- The build installs the published `@mcp-abap-adt/core` and `@mcp-abap-adt/compact` of the version from
  npm; `npm install` compiles `sapnwrfc.node` of `@mcp-abap-adt/sap-rfc-lite` (N-API 8) against the SDK at
  `SAPNWRFC_HOME`. The addon is embedded as a SEA asset **and** copied into the archive's
  `nwrfcsdk/lib/`, beside the SDK's runtime libraries.
- `sap-rfc-lite`'s `lib/binding.js` loads the addon through `node-gyp-build` relative to its package
  directory, which does not exist inside a SEA. An esbuild plugin replaces `node-gyp-build` with
  `scripts/portable/sea-rfc-loader.cjs`, which on the first RFC call:
  1. resolves the SDK folder: `SAPNWRFC_HOME/lib` when set, else `<exe dir>/nwrfcsdk/lib`;
  2. refuses, naming that folder, when the SDK's library is not there (`sapnwrfc.dll` /
     `libsapnwrfc.dylib` / `libsapnwrfc.so`);
  3. writes the embedded addon there only when no identical copy is present (never, for the archive as
     built), and `process.dlopen`s it.
- The SDK resolves beside the addon: on Linux the addon's RUNPATH is rewritten to `$ORIGIN` in place
  (the build machine's SDK path, NUL-padded — no `patchelf`); on macOS `install_name_tool` swaps the rpath
  for `@loader_path` and the addon is re-signed ad hoc; on Windows the folder is prepended to the process
  `PATH` before the `dlopen`.
- `@mcp-abap-adt/core` reads its version from `../package.json` at run time; the bundle fixes it at build.
- The nested `npm install` runs with colour off: `sap-rfc-lite`'s `binding.gyp` reads its N-API version
  through `node -p`, which `FORCE_COLOR` turns into ANSI codes and an empty `NAPI_VERSION` (to fix in
  `sap-rfc-lite`).

### SNC

Unchanged: the SNC provider resolves the Secure Login Client's library (`SNC_LIB_64`, `SNC_LIB`, the
Windows registry, the macOS app bundle) and hands it to the RFC SDK. The portable build changes only
how the RFC addon and the SDK are found.

## Building

`scripts/portable/build.mjs`; **what is built is chosen by the command**, for the platform it runs on:

| Command | Builds |
|---|---|
| `npm run portable:build:full` | the full server: `dist-portable/mcp-abap-adt-<version>-<platform>` + archive |
| `npm run portable:build:compact` | the compact server: `dist-portable/mcp-abap-adt-compact-<version>-<platform>` + archive |
| `npm run portable:build` | both |

An unknown server or platform is refused, naming the valid ones. Prerequisites on the building machine:
the SAP NW RFC SDK at `SAPNWRFC_HOME`, a C++ toolchain and Node 22/24 — the ones building `sap-rfc-lite`
already needs. The Node 24 runtime inside the executable is downloaded from nodejs.org (SHA-256 checked).
New dev dependencies, from the registry: `esbuild`, `postject`. `dist-portable/` is ignored by git.

- **No publication.** The archives contain the SDK: they are not attached to releases, not uploaded as CI
  artifacts and not handed on; the README inside says so.
- **Cross-building** (e.g. Windows on Linux) needs the target's addon prebuilt, i.e. `sap-rfc-lite`
  prebuilds, and the target's SDK libraries — a follow-up, not in this version.
- **Signing:** macOS executables are ad-hoc signed after injection; Windows executables are unsigned
  (SmartScreen on first run). Enough for a personal build.

## Verified

- **Linux x64** (2026-10-05), in a clean `debian:bookworm-slim` container with no Node, the archive
  mounted read-only: `--version` 17.0.1; MCP `initialize` and `tools/list` — 218 tools (full), 25
  (compact); an RFC call to an unreachable host answers `RFC_COMMUNICATION_FAILURE`, i.e. the addon and
  the SDK load from `nwrfcsdk/lib`; with an empty `nwrfcsdk/lib` the first RFC call is refused naming
  the folder. Executable ~129 MB; archive ~43 MB without the SDK, ~64 MB with it.
- **Windows x64** (2026-10-06, Windows 11, the user's laptop): built with `npm run portable:build` and
  working, SNC included. With `SAPNWRFC_HOME` unset and no SDK on `PATH`, after one RFC call
  `sapnwrfc.node`, `sapnwrfc.dll` and `icu*57.dll` were loaded from the build's `nwrfcsdk/lib`, not from an
  SDK elsewhere or `System32` — the `PATH` prepend works. The archive README says which folder wins
  (`SAPNWRFC_HOME` over `nwrfcsdk/lib`) and how to check the loaded path per platform. Rebuilt after the review fixes (system `tar.exe`, npm
  without a shell): builds and works.
- **macOS arm64:** not yet built.

## Testing

- **Unit:** the loader's folder resolution and refusals (`SAPNWRFC_HOME` vs `<exe dir>`, missing library,
  unwritable folder), with the filesystem stubbed; the build script's argument parsing.
- **Smoke, after a build** (`npm run portable:smoke`): each executable answers `--version`, MCP
  `initialize` and `tools/list` over stdio, and an RFC call to an unreachable host fails with an RFC
  error, not a load error.
- **Manual:** SNC against a real system on Windows and macOS (read, create, LOCK/UNLOCK).

## Documentation

`docs/installation/PORTABLE.md`: building one's own portable server per platform, and the personal-build
rule; `docs/installation/INSTALLATION.md#installation-variants` gains the portable row and links it.

## Decided

- The compact server is its own archive per platform (2026-10-05).
- A portable build is personal and carries the builder's SDK; nothing is published (2026-10-06).
- Signing: ad-hoc on macOS, none on Windows.
- Open, not in this version: cross-building through `sap-rfc-lite` prebuilds; CI.
