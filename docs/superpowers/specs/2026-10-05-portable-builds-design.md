# Portable builds — design

Status: draft for review (2026-10-05). Deleted once implemented or cancelled.

## Goal

A user copies one archive to a machine, unpacks it and runs the server. Nothing else is installed:
no Node.js, no npm, no compiler, no `SAPNWRFC_HOME` at install time. For HTTP that is the whole
story. For RFC and SNC the only extra is the SAP NW RFC SDK's `lib` folder, dropped into the unpacked
archive — SAP distributes the SDK through its Support Portal, so we do not ship it.

| Platform | Connections | Archive |
|---|---|---|
| Windows x64 | HTTP, RFC, SNC | `mcp-abap-adt-<version>-win-x64.zip` |
| macOS arm64 | HTTP, RFC, SNC | `mcp-abap-adt-<version>-macos-arm64.zip` |
| Linux x64 | HTTP, RFC | `mcp-abap-adt-<version>-linux-x64.tar.gz` |

Out of scope: macOS x64 (no Intel SDK at hand), SNC on Linux, bundling the SDK, an RFC client
without the SDK (`open-rfc` has no SNC and no transport encryption, beta), installers, auto-update.

## What the user does

```text
mcp-abap-adt-17.x.y-win-x64/
  mcp-abap-adt.exe          ← the server (Node.js inside)
  README.txt                ← these steps, short
  nwrfcsdk/lib/             ← empty; for RFC/SNC copy the SDK's lib/ contents here
```

1. Unpack.
2. HTTP: done — point the MCP client at `mcp-abap-adt.exe --env-path=…`.
3. RFC/SNC: copy the files of the SDK's `lib/` folder into `nwrfcsdk/lib/`. SNC additionally needs
   the SNC product (Secure Login Client), exactly as with the npm install.

`SAPNWRFC_HOME`, when set, is honoured instead of `nwrfcsdk/` (its `lib/`), so a machine that already
has the SDK installed needs no copy.

## Architecture

### One executable per platform: Node SEA

The executable is the official Node.js single executable application: the Node binary of the target
platform with our bundled program injected as a blob (`postject`). Node **24** (LTS, on SAP BTP's
list; SEA "active development" on 22 and 24). `--build-sea` exists only from Node 25.5, so the build
uses `--experimental-sea-config` + `postject`. Each platform is built on its own runner — the docs
advise against cross-generation, and the RFC addon is native anyway.

### The program inside: one bundle

`esbuild` bundles `server/` (the `mcp-abap-adt` launcher) with `@mcp-abap-adt/lib` and every
dependency into one CommonJS file, the SEA's main script. Dynamic requires that must survive bundling
are listed and handled explicitly (the build fails if an unexpected one remains):

- `@mcp-abap-adt/sap-rfc-lite` (required lazily by `@mcp-abap-adt/connection` when an RFC
  conversation opens) is bundled; its native loader is replaced, see below.
- `open` (browser login) and similar optional paths are bundled as they are.

The compact server is **not** in the first version — see *Decisions to confirm*.

### The RFC addon: prebuilt, embedded, extracted next to the SDK

- CI builds `sapnwrfc.node` of `@mcp-abap-adt/sap-rfc-lite` (N-API 8: one build per platform serves
  any Node version) against that platform's SDK and embeds it as a SEA asset.
- `sap-rfc-lite`'s `lib/binding.js` loads the addon through `node-gyp-build` relative to its package
  directory, which does not exist inside a SEA. The bundle replaces that module (an esbuild plugin)
  with a loader that, on first use only:
  1. resolves the SDK folder: `SAPNWRFC_HOME/lib` when set, else `<exe dir>/nwrfcsdk/lib`;
  2. refuses, naming that folder, when the SDK's library is not there (`sapnwrfc.dll` /
     `libsapnwrfc.dylib` / `libsapnwrfc.so`) — the same point at which an npm install without the
     module refuses today, the first RFC call; HTTP never reaches it;
  3. writes the embedded addon into that folder (skipped when an identical copy is there) and
     `process.dlopen`s it.

  Placing the addon beside the SDK libraries is what makes them resolvable on all three systems:
  the addon is linked with an rpath of `$ORIGIN` (Linux) / `@loader_path` (macOS), set at build time
  (`patchelf` / `install_name_tool`). On Windows the expectation is that dependent DLLs are found in
  the addon's own folder (libuv's `LoadLibraryExW` flags) — **not yet verified**: measured on the
  Windows runner, with the fallback of prepending the folder to the process `PATH` before the
  `dlopen`. The Linux prototype measures the rpath path first. If a folder the user supplied is not
  writable, the refusal says so.

### SNC

Unchanged: the SNC provider resolves the Secure Login Client's library (`SNC_LIB_64`, `SNC_LIB`, the
Windows registry, the macOS app bundle) and hands it to the RFC SDK. The portable build changes only
how the RFC addon and the SDK are found.

## Build and release

- `scripts/portable/` — bundle (esbuild), SEA config, inject (postject), addon patching, archive.
  `npm run portable:build` builds the current platform; it needs the SDK at `SAPNWRFC_HOME` (for the
  addon) and a C++ toolchain, the same prerequisites as building `sap-rfc-lite` today.
- `.github/workflows/portable.yml` — three jobs (`windows-latest`, `macos-latest` (arm64),
  `ubuntu-latest`). Each fetches its SDK archive from private storage, builds, smoke-tests and uploads
  the archive. On a `v*.*.*` tag the archives are attached to the GitHub Release; on a pull request
  they are build artifacts only.
- **SDK in CI:** the three SDK archives live as assets of a release in a private repository; the job
  downloads its own with `gh release download` and a fine-grained token stored as the secret
  `NWRFC_SDK_TOKEN`. The SDK is never written to a public artifact: the portable archive carries an
  empty `nwrfcsdk/lib/`.
- New dev dependencies, from the registry: `esbuild`, `postject`.
- **Signing:** macOS executables are ad-hoc signed (`codesign --sign -`) after injection; Windows
  executables are unsigned. Both are stated in the archive's README (Gatekeeper / SmartScreen prompt
  on first run).

## Testing

- **Unit:** the SEA loader's folder resolution and refusals (`SAPNWRFC_HOME` vs `<exe dir>`, missing
  library, unwritable folder), with the filesystem stubbed.
- **CI smoke, every platform:** the built executable answers `--version`, MCP `initialize` and
  `tools/list` over stdio (the tool count equal to the npm server's); with the SDK copied into
  `nwrfcsdk/lib/` the addon loads (no SAP system needed — an RFC open to an unreachable host must fail
  with an RFC error, not a load error); without the SDK the first RFC call is refused naming the folder.
- **Manual, before the first release:** SNC on Windows and macOS against a real system (read, create,
  LOCK/UNLOCK), as verified for the npm install.

## Documentation

`docs/installation/INSTALLATION.md#installation-variants` gains the portable row;
`docs/installation/PORTABLE.md` holds the steps above per platform; the archive's `README.txt` is
generated from it. `RELEASE.md`: the portable workflow runs on the tag.

## Decisions to confirm

1. **The compact server.** Leave it out of the first version (one executable, ~100 MB), or ship it as
   a second executable (doubles the archive), or one executable selecting the surface with an option.
   Proposed: out of the first version.
2. **SDK storage for CI:** a private repository's release assets + `NWRFC_SDK_TOKEN`, as above.
3. **Signing:** ad-hoc on macOS, none on Windows, for now.
