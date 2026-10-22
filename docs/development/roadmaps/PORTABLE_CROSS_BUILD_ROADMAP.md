# Roadmap: building a portable executable for another platform

Not started. Today a portable build is made on the platform it is for
([Portable Build](../../installation/PORTABLE.md)): Windows on Windows, macOS on macOS, Linux on Linux.

## What stands in the way

The executable carries the RFC module of `@mcp-abap-adt/sap-rfc-lite` and, beside it, the SAP NW RFC
SDK libraries. The package already carries a prebuilt module for each of the three platforms (0.3.0 and
later install them without compiling anything), but the build takes the one its own loader picks — the
building machine's — and the SDK libraries from that machine's `SAPNWRFC_HOME`. Everything else in the
build is already platform-independent: the servers come from npm, the Node.js runtime of the target is
downloaded, and esbuild, postject and the archive step run anywhere.

## What it takes

1. **`sap-rfc-lite` ships prebuilt RFC modules** — done: one per platform (`win32-x64`, `darwin-arm64`,
   `linux-x64` glibc) under `prebuilds/`, each built on its own platform against that platform's SDK.
   The SDK itself is not published; only the module that links against it.
2. **The portable build takes the module of the target** from those prebuilds instead of the building
   machine's, and the SDK libraries of the target from a folder the builder names (an SDK for that
   platform, as downloaded from SAP).
3. **Platform steps that need the target's tools** stay with it: on macOS the module and the executable
   are signed (`codesign`), and the RUNPATH step is Linux-only. A macOS executable built elsewhere
   would need an ad-hoc signature from a tool that runs off macOS, or signing on first use.

## Open questions

- Whether signing a macOS executable off macOS is acceptable for a personal build.
