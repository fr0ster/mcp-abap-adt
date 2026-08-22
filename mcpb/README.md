# Claude Desktop bundle (.mcpb)

Packages this server as a single file consultants install by double-clicking.
Claude Desktop supplies its own Node.js, generates a settings form from
`manifest.json`, and runs everything locally — so there is nothing for them to
install, no config file to edit, and no terminal.

Each person enters their own SAP user, so SAP's authorisation checks and audit
log work exactly as they do in SAP GUI.

Consultant-facing instructions: [`../docs/installation/CLAUDE_DESKTOP.md`](../docs/installation/CLAUDE_DESKTOP.md).

## Layout

```
manifest.json        extension metadata + the settings form (user_config)
server/index.js      wrapper: form values -> .env profiles -> launcher
server/systems.json  the systems, without credentials
build.mjs            builds and packs the bundle
```

## How it fits together

The ADT server is configured by `.env` files, but Claude Desktop hands
configuration over as environment variables. `server/index.js` bridges the two:

1. reads the non-secret profiles from `systems.json`
2. merges in the `MCPB_*_USERNAME` / `MCPB_*_PASSWORD` values from the form
3. writes one `.env.<system>` per filled-in system to
   `~/.mcp-abap-adt/systems` (mode `0600`, outside the bundle so a reinstall
   does not wipe it, and stale profiles are cleared each start)
4. sets `MCP_SYSTEMS_PATH` there so `ListSystems` / `SwitchSystem` see them all
5. puts the bundled NW RFC SDK on the DLL search path
6. requires the launcher by absolute path

Step 6 matters: the package's `exports` map does not publish
`./dist/server/launcher.js`, so it has to be resolved as a filesystem path.

## Building

### Prerequisites on the build machine

`sap-rfc-lite` publishes no prebuilt binaries, so it is compiled from source at
install time. The build machine needs a C++ toolchain — this is the single most
common reason a build fails:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools   # "Desktop development with C++"
winget install Python.Python.3.12
```

Open a **new** terminal afterwards so `PATH` picks them up. Consultants do not
need any of this — only whoever builds the bundle does.

**Build on Windows.** The bundle embeds the compiled `sap-rfc-lite` binary and
the NW RFC SDK libraries — both platform-specific, and `manifest.json` declares
`win32`. Building on Linux or macOS produces a bundle that fails on the
consultant's machine.

From the **repository root**:

```cmd
set SAPNWRFC_HOME=C:\sap\nwrfcsdk
npm run build:mcpb
```

Or from **inside this `mcpb` directory**:

```cmd
set SAPNWRFC_HOME=C:\sap\nwrfcsdk
node build.mjs
```

(`node mcpb\build.mjs` only works from the repository root — from in here it
looks for `mcpb\mcpb\build.mjs`.)

In PowerShell, set the variable with `$env:SAPNWRFC_HOME = "C:\sap\nwrfcsdk"`
instead of `set`.

Produces `mcpb/sap-abap-adt.mcpb`. The script fails loudly rather than shipping
something broken — it aborts if `sap-rfc-lite` was silently dropped (it is an
`optionalDependency`, so npm discards it without erroring when the native build
fails) or if the SAProuter fix did not get applied.

By default it installs from the GitHub fork. To build from a local checkout:

```cmd
set MCPB_SOURCE=file:../..
node mcpb\build.mjs
```

## Licensing

`build.mjs` copies the SAP NW RFC SDK into the bundle. SAP licenses that SDK to
your organisation — keep the resulting `.mcpb` inside it. Do not publish it or
send it to another company.

To distribute without embedding the SDK, drop the "embedding" step from
`build.mjs` and add a `directory` field to `user_config` so each person points
at their own SDK folder.

## Adding a system

1. Add an entry to `server/systems.json` with a `credentialsKey`.
2. Add `<key>_username` / `<key>_password` to `user_config` in
   `manifest.json`.
3. Add matching `MCPB_<KEY>_USERNAME` / `MCPB_<KEY>_PASSWORD` to
   `server.mcp_config.env`.
4. Bump `version` in `manifest.json` and rebuild.

Consultants install the new file over the old one; their saved settings carry
over.

## Testing before you hand it out

Install your own build, then in Claude Desktop ask "which SAP systems can you
see?" and "switch to kalog". Check the extension log if it misbehaves — the
wrapper writes diagnostics to stderr, including which profiles it wrote and
which system it started on.
