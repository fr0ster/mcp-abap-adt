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
- Node.js 22 or 24 and a checkout of this repository (`npm ci`).

The Node.js 24 runtime that goes inside the executable is downloaded from nodejs.org and its SHA-256
checksum verified. The servers themselves are installed from npm at the repository's version.

## Building

The command chooses what is built, always for the platform it runs on:

| Command | Builds |
|---|---|
| `npm run portable:build:full` | the full server |
| `npm run portable:build:compact` | the compact server |
| `npm run portable:build` | both |

`--version=<version>` builds another published version:
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

Then check what was built:

```bash
npm run portable:smoke
```

For each executable it checks the version, MCP `initialize` and `tools/list` over stdio, and an RFC call
to an unreachable host, which must answer an RFC error — proof that the module and the SDK load from
`nwrfcsdk/lib`. It ignores `SAPNWRFC_HOME`, so the archive's own SDK is what is checked.

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

**Signing.** The macOS executable is signed ad hoc; the Windows executable is unsigned, so SmartScreen
asks once. Enough for a build that stays on your machine.

## Verified

- **Linux x64:** in a clean container with no Node.js, the archive mounted read-only — version, MCP
  `initialize`, `tools/list`, and the RFC stack loading from `nwrfcsdk/lib` (`npm run portable:smoke`).
- **Windows 11 x64:** built with `npm run portable:build` and used with SNC; the RFC module and the SDK
  DLLs load from the archive's `nwrfcsdk/lib`.
- **macOS arm64:** build and run `npm run portable:smoke` on a Mac; not verified yet.
