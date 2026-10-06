# Roadmap: building a portable executable for another platform

Not started. Today a portable build is made on the platform it is for
([Portable Build](../../installation/PORTABLE.md)): Windows on Windows, macOS on macOS, Linux on Linux.

## What stands in the way

The executable carries the RFC module of `@mcp-abap-adt/sap-rfc-lite`, and that module is compiled
during the build, on the building machine, against its SAP NW RFC SDK. Everything else in the build is
already platform-independent: the servers come from npm, the Node.js runtime of the target is downloaded,
and esbuild, postject and the archive step run anywhere.

## What it takes

1. **`sap-rfc-lite` ships prebuilt RFC modules** — one per platform (`win32-x64`, `darwin-arm64`,
   `linux-x64`), built in its CI against each platform's SDK and published with the package, the way
   `node-gyp-build` expects them in `prebuilds/`. The SDK itself is not published; only the module that
   links against it.
2. **The portable build takes the module of the target** from those prebuilds instead of compiling one,
   and the SDK libraries of the target from a folder the builder names (an SDK for that platform, as
   downloaded from SAP).
3. **Platform steps that need the target's tools** stay with it: on macOS the module and the executable
   are signed (`codesign`), and the RUNPATH rewrite is Linux-only. A macOS executable built elsewhere
   would need an ad-hoc signature from a tool that runs off macOS, or signing on first use.

## Open questions

- Where `sap-rfc-lite`'s CI gets each platform's SDK (it is licensed through the SAP Support Portal and
  cannot sit in a public repository).
- Whether signing a macOS executable off macOS is acceptable for a personal build.
