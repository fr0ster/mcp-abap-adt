# Portable Build

A portable build is one executable per server — the full one (`mcp-abap-adt`) or the compact one
(`mcp-abap-adt-compact`) — with Node.js inside and, beside it, the SAP NW RFC SDK of the machine that
built it. Unpack it anywhere and point an MCP client at it: no Node.js, no npm, no compiler, no
`SAPNWRFC_HOME`.

**It is a personal build.** You build it yourself, from this repository, with your own SDK, and the
archive carries that SDK. SAP licenses the SDK through its Support Portal, so a portable archive is
never published or handed on — whoever needs one builds their own. The README inside the archive
says so.

| Platform | Connections | Archive |
|---|---|---|
| Windows x64 | HTTP, RFC, SNC | `<server>-<version>-win-x64.zip` |
| macOS arm64 | HTTP, RFC, SNC | `<server>-<version>-macos-arm64.zip` |
| Linux x64 | HTTP, RFC | `<server>-<version>-linux-x64.tar.gz` |

The installed variants — npm, RFC, SNC — are in [Installation variants](INSTALLATION.md#installation-variants).

## What the building machine needs

The same as building the RFC module of the npm install ([RFC Setup](RFC_SETUP.md)):

- the SAP NW RFC SDK of this platform, with `SAPNWRFC_HOME` pointing at it;
- a C++ toolchain (Windows: Visual Studio Build Tools, "Desktop development with C++"; macOS: Xcode
  Command Line Tools; Linux: `g++`, `make`, Python 3);
- Node.js 22 or 24 and a checkout of this repository with its production dependencies:
  `npm ci --omit=dev --ignore-scripts` is enough — the build installs the two tools it runs (esbuild and
  postject, at the versions the repository declares) into its cache, so the linter, the test runner and the
  rest of the development dependencies are not needed;
- on Windows, the system `tar` (`%SystemRoot%\System32\tar.exe`, present since Windows 10) — the build
  calls it by that path, so a GNU tar earlier on the `PATH` (Git Bash) does not get in the way;
- on Linux, `readelf` (binutils, part of the toolchain) to cross-check the RFC module after its
  `RUNPATH` is rewritten — without it the build says the check was skipped.

Only these machines can build: Linux x64, Windows x64, macOS arm64 (Apple silicon). Another one —
Linux on ARM, an Intel Mac — is refused with that list.

The Node.js 24 runtime that goes inside the executable is downloaded from nodejs.org and its SHA-256
checksum verified. The servers themselves are installed from npm at the repository's version.

## Building

The command chooses what is built, always for the platform it runs on:

| Command | Builds |
|---|---|
| `npm run portable:build:full` | the full server |
| `npm run portable:build:compact` | the compact server |
| `npm run portable:build` | both |

`--version=<version>` builds another published version — a semver or a dist-tag such as `latest`:
`npm run portable:build -- --version=<version>`.

```text
dist-portable/
  mcp-abap-adt-<version>-<platform>/
    mcp-abap-adt[.exe]        ← the server, Node.js inside
    nwrfcsdk/lib/             ← your SDK's runtime libraries and the RFC module
    README.txt
  mcp-abap-adt-<version>-<platform>.zip | .tar.gz
```

Building for another platform (Windows on Linux, for example) is not supported yet: it needs the RFC
module of the target platform built in advance.

**The build cache.** The servers installed from npm, the RFC module compiled against your SDK and the
downloaded Node.js are kept in `<temp>/mcp-abap-adt-portable/<version>/<platform>/`, the build tools in
`<temp>/mcp-abap-adt-portable/tools/` (`<temp>` is the
system's temporary folder: `/tmp` on Linux, `%TEMP%` on Windows, `$TMPDIR` on macOS). A build reuses it
only for the same version and the same `SAPNWRFC_HOME`, and only when the RFC module was really built
there; a changed SDK, or a first run without a compiler, is rebuilt. The tools are reinstalled when the
repository declares other versions of them. To start from nothing, delete `<temp>/mcp-abap-adt-portable/`.

Then check what was built:

```bash
npm run portable:smoke
```

For each executable it checks the version, MCP `initialize` and `tools/list` over stdio, and an RFC call
to an unreachable host, which must answer an RFC error — proof that the module and the SDK load from
`nwrfcsdk/lib`. It runs them without `SAPNWRFC_HOME` and without the `PATH` / `LD_LIBRARY_PATH` /
`DYLD_LIBRARY_PATH` folders that hold an SDK library, so the archive's own SDK is what is checked. On
Windows it warns when `System32` holds `sapnwrfc.dll`, which Windows could load first.

## Running it

Unpack the archive anywhere and start it as an MCP client would start the npm server:

```bash
mcp-abap-adt --env-path=<your .env>
```

Everything else — destinations, `.env`, authentications, HTTP/SSE transports — is the npm server's: see
[Authentication](../user-guide/AUTHENTICATION.md). SNC also needs the SNC product (SAP Secure Login
Client), as with the npm install.

**Which SDK is used.** `SAPNWRFC_HOME`, when set, wins over `nwrfcsdk/lib`. On a machine where it is set
globally, clear it for the terminal or the MCP client's `env` block to use the archive's folder. The
archive's README shows how, and how to see which folder the SDK was loaded from (process modules on
Windows, `/proc/<pid>/maps` on Linux, `vmmap` on macOS). If the library is missing from the chosen
folder, the first RFC call is refused naming the folder it looked in.

**Signing.** The macOS executable is signed ad hoc. The Windows executable is Node.js's own `node.exe`
with the server injected, which invalidates its Authenticode signature: Windows treats it as unsigned,
and SmartScreen asks once. Enough for a build that stays on your machine.

## Verified

- **Linux x64:** in a clean container with no Node.js, the archive mounted read-only — version, MCP
  `initialize`, `tools/list`, and the RFC stack loading from `nwrfcsdk/lib` (`npm run portable:smoke`).
- **Windows 11 x64:** built with `npm run portable:build` and used with SNC; the RFC module and the SDK
  DLLs load from the archive's `nwrfcsdk/lib`. Rebuilt after the build switched to `System32\\tar.exe` and npm
  without a shell (2026-10-06): builds and works.
- **macOS arm64:** built with `npm run portable:build` on Apple silicon (2026-10-06) — `npm run
  portable:smoke` passes for both servers, the RFC module's only `LC_RPATH` is `@loader_path` and it
  links the SDK libraries beside it; the signed executables start. SNC is not verified on macOS: no SAP
  system was reachable from that Mac.
