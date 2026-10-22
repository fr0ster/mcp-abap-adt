# Migrating to 20.0.0

20.0.0 moves the RFC transport onto `@mcp-abap-adt/connection` 19 and `@mcp-abap-adt/sap-rfc-lite`
0.3.2, which compiles nothing when it is installed. Go through the section that fits how you run the
server. Another change of 20.0.0, the long HTTP session ([#308](https://github.com/fr0ster/mcp-abap-adt/issues/308)),
lands through its own pull request
([#309](https://github.com/fr0ster/mcp-abap-adt/pull/309)), which adds its own section to this note.

The packages are the eighteen of 19.2.0, all at **20.0.0**. Their dependencies change:

| Package | Was | Now |
|---|---|---|
| `@mcp-abap-adt/connection` (`lib`, `server-runtime`) | `^18.0.1` | `^19.0.0` — no API change: it moves its own RFC dependency to sap-rfc-lite `^0.3.2` |
| `@mcp-abap-adt/sap-rfc-lite` (optional, `lib`) | `^0.2.3` (connection's own copy `^0.2.2`) | `^0.3.2` — one copy in the tree, the one connection loads |

## HTTP and stdio users without RFC

Nothing to do. sap-rfc-lite is loaded only when an RFC (or SNC) destination makes its first RFC
call; an HTTP destination never loads it.

## BREAKING — RFC and SNC users: nothing is compiled on install

19.x installed sap-rfc-lite 0.2.x, which built its RFC binding during `npm install` where it had no
prebuilt one, with the SAP NW RFC SDK, `SAPNWRFC_HOME` and a C++ toolchain. sap-rfc-lite 0.3 has no
install script: `npm install` and `npm ci` compile and download nothing for it, also under
`--ignore-scripts`. It loads a prebuilt binding at run time.

- **Prebuilt for Linux x64 (glibc), Windows x64 and macOS ARM64.** On these, the install needs no
  SDK, no `SAPNWRFC_HOME` and no compiler. If you set `SAPNWRFC_HOME` or installed a toolchain only
  for the install, neither is needed for it any more.
- **Anywhere else there is no binding after the install** — Linux on ARM, an Intel Mac, Linux with
  musl (Alpine), any other platform or architecture. The install succeeds (the dependency is
  optional), the server starts and serves HTTP, and the first RFC call is refused with
  `@mcp-abap-adt/sap-rfc-lite is not available`, its details naming `No native build was found`.
  Build the binding from sap-rfc-lite's repository and install the package you built, as its
  [README, "Installation"](https://github.com/fr0ster/sap-rfc-lite#installation) describes
  (`SAPNWRFC_HOME` and a C++ toolchain on the building machine):

  ```bash
  git clone https://github.com/fr0ster/sap-rfc-lite.git && cd sap-rfc-lite
  git checkout v0.3.2
  npm ci
  npm run prebuild:native      # -> prebuilds/<platform>-<arch>/
  npm pack                     # install the .tgz beside the server
  ```

  Building inside the installed package is not possible: the published package carries neither
  `binding.gyp` nor the C++ sources.

## RFC and SNC users: the RFC library at run time

The binding does not look for the SAP NW RFC library itself; the operating system's loader finds it
when the first RFC call loads the binding, and the prebuilt binding carries no path of the machine
it was built on. So the library must be loadable **by the server process**:

- **Windows where SAP GUI installed its 64-bit RFC library** (`sapnwrfc.dll` in
  `C:\Windows\System32`; `where.exe sapnwrfc.dll` lists it): nothing more — no SDK.
- **Anywhere else** — Windows without it, Linux, macOS, Docker images: the SAP NW RFC SDK, its `lib`
  directory on `PATH` (Windows), `LD_LIBRARY_PATH` (Linux) or `DYLD_LIBRARY_PATH` (macOS) of the
  server process — in an MCP client, its `env` block.

19.x on Linux needed no `LD_LIBRARY_PATH` when the binding was compiled on the machine, because the
build recorded `$SAPNWRFC_HOME/lib` in it. The prebuilt one records nothing: set the library path.
The steps per platform: [RFC Setup](installation/RFC_SETUP.md).

## Portable build: sap-rfc-lite 0.3.0 or later only

`npm run portable:build` refuses a stage holding any copy of sap-rfc-lite older than 0.3.0, naming
each: such a copy reads its own `package.json` at run time, which an executable does not have, so RFC
would not load in it. Every version published before 20.0.0 installs 0.2.x, so **`--version=19.2.0`
and older can no longer be built**; build 20.0.0 or later. `--build-from-source` is gone: npm compiles
nothing for sap-rfc-lite. See [Portable Build](installation/PORTABLE.md).

## Docker users

Nothing changes in the images: they carry no SAP NW RFC SDK and install with `--omit=optional`, so
RFC and SNC are not available in them, as before. An RFC image of your own no longer compiles
anything on install; it needs the SDK inside it, its `lib` directory on `LD_LIBRARY_PATH`, and an x64
glibc base for the prebuilt binding. See [Docker](deployment/DOCKER.md#rfc-and-snc).
