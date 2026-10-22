# RFC Connection Setup

RFC is an alternative connection transport to HTTP. It works with any SAP system supported by the SAP NW RFC SDK. The RFC session is inherently stateful, so lock handles persist across calls without requiring HTTP stateful sessions. SNC — passwordless logon — runs over RFC and needs everything on this page first.

This applies to both servers, `@mcp-abap-adt/core` (`mcp-abap-adt`) and `@mcp-abap-adt/compact` (`mcp-abap-adt-compact`): the RFC module comes with either. The variants side by side: [Installation variants](INSTALLATION.md#installation-variants).

## What RFC needs

The RFC module, `@mcp-abap-adt/sap-rfc-lite`, is an optional dependency with **no install script**: `npm install` compiles nothing and downloads nothing for it, and installs it with the server.

- **A prebuilt binding** comes with it for **Linux x64 (glibc), Windows x64 and macOS ARM64**, loaded when the first RFC call needs it. No C++ toolchain and no `SAPNWRFC_HOME` are needed for the install.
- **Anywhere else** — another platform or architecture, or Linux with musl (Alpine and the like) — there is no binding until you build one, as the [sap-rfc-lite README, "Installation"](https://github.com/fr0ster/sap-rfc-lite#installation) describes (a C++ toolchain and `SAPNWRFC_HOME`). Until then the server installs, starts and lists every tool, and the first RFC call is refused with `@mcp-abap-adt/sap-rfc-lite is not available`.

The binding needs the **SAP NetWeaver RFC library** at run time, which SAP does not allow redistributing, so it never comes with the package:

- **Windows where SAP GUI installed its 64-bit RFC library**: nothing to install. SAP GUI, when its RFC libraries are installed, puts a 64-bit `sapnwrfc.dll` into `C:\Windows\System32` (`where.exe sapnwrfc.dll` lists it), and the binding loads it.
- **Anywhere else** — Windows with no 64-bit `sapnwrfc.dll` in `System32`, Linux, macOS, Docker images: the **SAP NW RFC SDK**, steps 1 and 2.

## 1. SAP NW RFC SDK

Download from [SAP Support Portal](https://support.sap.com/en/product/connectors/nwrfcsdk.html) (requires S-user) — the package for your platform and architecture (Windows x64, Linux x64, macOS ARM or x64).

Extract to a directory that stays where it is, e.g. `C:\nwrfcsdk\nwrfcsdk` (Windows) or `~/nwrfcsdk` (Linux/macOS).

## 2. Make the SDK loadable

The binding does not look for the SDK itself: the operating system's loader finds its libraries when the server makes its first RFC call, so the SDK's `lib` directory must be on the library search path **of the process that runs the server**. These are process-level variables — a destination's `.env` does not set them. An MCP client that starts the server needs them in its `env` block, or must itself be started from such an environment.

**Windows (PowerShell, current window):**

```powershell
$env:SAPNWRFC_HOME = "C:\nwrfcsdk\nwrfcsdk"
$env:PATH = "$env:SAPNWRFC_HOME\lib;$env:PATH"
```

To keep them, add the same two lines to `$PROFILE`, or set them in **System Properties** > **Environment Variables** (`SAPNWRFC_HOME`, and `%SAPNWRFC_HOME%\lib` appended to `PATH`) — then open a new terminal: a running one does not see the change. Windows searches `System32` before `PATH`, so where SAP GUI's `sapnwrfc.dll` is there too, that one is loaded.

**Linux (bash/zsh):**

```bash
export SAPNWRFC_HOME=~/nwrfcsdk
export LD_LIBRARY_PATH="$SAPNWRFC_HOME/lib:$LD_LIBRARY_PATH"
# or, system-wide:
echo "$SAPNWRFC_HOME/lib" | sudo tee /etc/ld.so.conf.d/nwrfcsdk.conf && sudo ldconfig
```

**macOS (zsh):**

```bash
export SAPNWRFC_HOME=~/nwrfcsdk
export DYLD_LIBRARY_PATH="$SAPNWRFC_HOME/lib"
```

The prebuilt binding carries no path of the machine it was built on, so it needs this wherever the SDK is installed.

## 3. Install and check

```bash
npm install -g @mcp-abap-adt/core        # or @mcp-abap-adt/compact
npm ls -g @mcp-abap-adt/sap-rfc-lite
```

`npm ls` must show `@mcp-abap-adt/sap-rfc-lite@<version>`. **`(empty)` means it was left out**: an install with `--no-optional` / `--omit=optional` leaves RFC out on purpose — install again without it. Installing `@mcp-abap-adt/sap-rfc-lite` on its own (`npm install -g @mcp-abap-adt/sap-rfc-lite`) also works: the server finds a globally installed copy.

The order no longer matters: the install needs neither the SDK nor `SAPNWRFC_HOME`, so the SDK can come before or after it — it must be loadable when the server runs.

## 4. SAP authorization

The SAP user needs `S_RFC` authorization for function module `SADT_REST_RFC_ENDPOINT`. See SAP Note 3569684.

## .env Configuration

For RFC connections, use two separate variables — one for authentication, one for connection type:

```env
SAP_URL=http://saphost:8000
SAP_USERNAME=DEVELOPER
SAP_PASSWORD=secret
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_CONNECTION_TYPE=rfc
```

- `SAP_AUTH_TYPE` — authentication (`basic` or `snc` over RFC; the JWT authentications are HTTP).
- The transport layer (`http` or `rfc`): `SAP_CONNECTION_TYPE=rfc` in the `--env` / `--env-path` `.env` or the process environment, `--connection-type=rfc`, or YAML `connection-type: rfc`. Precedence: CLI, then the environment (the `.env` value joins it, never over one already set), then YAML.
- **The address comes from `SAP_URL`**: the host is the application server RFC connects to directly (not a message server), and the system number is derived from the port — `80NN` → `NN`, so `:8000` is `00` and `:8001` is `01`. A port that follows no such rule — an `https` port such as `44300` — gives a wrong number: set **`SAP_SYSNR`** (two digits) in the **process environment**; it is not read from the `.env`.

## Through a message server and a logon group

For load-balanced logon, the message server chooses the application server:

```env
SAP_URL=http://saphost:8000
SAP_USERNAME=DEVELOPER
SAP_PASSWORD=secret
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_CONNECTION_TYPE=rfc
SAP_MSHOST=msghost.example
SAP_SYSID=ABC
# Optional:
# SAP_MSSERV=sapmsABC
# SAP_GROUP=PUBLIC
# SAP_SAPROUTER=/H/router.example/S/3299/H/
```

- `SAP_MSHOST` — the message server host. With it, the RFC wire takes **no host and no system number from `SAP_URL`**, and `SAP_SYSNR` is not read. `SAP_URL` is still the system's URL.
- `SAP_MSSERV` (the message server service, a name or a port) or `SAP_SYSID` (the system id) — **one of the two is required** beside `SAP_MSHOST`. With neither, `@mcp-abap-adt/connection` refuses the connection naming both, and that refusal reaches you as it came.
- `SAP_GROUP` — the logon group. When absent, connection uses `PUBLIC`; the server adds no default of its own.
- `SAP_SAPROUTER` — a SAProuter string. It works with either addressing (message server or application server).
- Each is also a CLI option (`--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter`) and a YAML key of the same name. Precedence is that of the connection type: CLI, then the environment (the `--env` / `--env-path` `.env` value joins it, never over one already set), then YAML. The server passes them to connection as configured and decides nothing.
- **Implemented and unit-tested; not yet measured on a live system** (as of 2026-10-20: none of the systems available for the check has a reachable message server). The address follows the SAP NW RFC SDK's own parameters. `SAP_MSHOST` + `SAP_MSSERV` without `SAP_SYSID` is accepted but unconfirmed; if the SDK refuses it, add `SAP_SYSID`.

## SNC (passwordless logon)

SNC logs on over RFC with the credential of an installed SNC product (for example SAP Secure Login Client). **The `.env` has no user and no password**: the system maps the client's SNC name to an ABAP user.

```env
SAP_URL=http://saphost:8000
SAP_CLIENT=100
SAP_CONNECTION_TYPE=rfc
SAP_AUTH_TYPE=snc
SAP_SNC_PARTNERNAME=p:CN=<system>, O=<org>, C=<country>
# Creates need a responsible person, and over SNC no login is known:
SAP_RESPONSIBLE=<your ABAP user>
# Optional:
# SAP_SNC_QOP=9
# SAP_SNC_LIB=/path/to/the/snc/library
# SAP_SNC_MYNAME=p:CN=<client name>
```

- `SAP_SNC_PARTNERNAME` — the system's SNC name (required). SAP Logon shows it in the system entry's properties, on the **Network** tab, as the SNC name.
- `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` — optional: quality of protection (default `9`), the SNC library, and the client's own SNC name (otherwise taken from the credential).
- **The SNC library is found without `SAP_SNC_LIB`**, in this order: `SNC_LIB_64` (64-bit process), `SNC_LIB`, the Secure Login Client's install path in the Windows registry, then the macOS bundle `/Applications/Secure Login Client.app/Contents/MacOS/lib/libsapcrypto.dylib`. A candidate that is missing or built for the wrong architecture is skipped — the Secure Login Client installer sets `SNC_LIB` to its 32-bit library, and the registry then supplies the 64-bit one. Nothing usable is refused with `no usable SNC library was found`, listing each candidate tried; set `SAP_SNC_LIB` then.
- **The Secure Login Client need not be running.** The library starts it when the first RFC connection opens, and that call can wait on its logon window until you answer it. Logged out and the window closed, the call is refused with `A2200019`.
- `SAP_RESPONSIBLE` — the server names the responsible person from the system (`systeminformation`, asked once at the start). Where an on-premise system gives no information (it answers `404`), it takes `SAP_RESPONSIBLE`, else the login — and over SNC there is no login, so without `SAP_RESPONSIBLE` the start ends with `system_user_unknown` (exit `1`).
- SNC needs `SAP_CONNECTION_TYPE=rfc` (see above). With `http` the destination is refused at startup, naming `connection-type`.
- A destination that states `snc` without `SAP_SNC_PARTNERNAME` is refused with `Destination "X" cannot be used: sncPartnerName`.
- Prerequisites on the system side: SNC enabled on the application server, and the client's SNC name mapped to an ABAP user (user maintenance, SNC tab). If SAP GUI logs on to this system through SNC without a password, both are in place.

## How It Works

1. `SAP_CONNECTION_TYPE=rfc` (or `--connection-type=rfc`) tells the server to connect over the RFC transport instead of HTTP
2. The connection calls SAP function module `SADT_REST_RFC_ENDPOINT` for every ADT request
3. The RFC session is inherently stateful — lock handles persist across calls
4. Host and system number are derived from `SAP_URL` (port 80NN → system number NN), `SAP_SYSNR` overriding the number — unless `SAP_MSHOST` is set: then the message server, with `SAP_MSSERV` or `SAP_SYSID` and `SAP_GROUP`, chooses the application server
5. The RFC module is loaded when the first RFC connection opens, not at startup

## Known limitation: a package cannot be changed by the session that created or changed it

Over RFC every call goes through one ABAP session, and a package created or
updated in it cannot be updated or deleted by that same session. SAP refuses
with:

```
PUT /sap/bc/adt/packages/<name>?lockHandle=<ours>&corrNr=<request>
  400  ExceptionResourceAlreadyExists   PAK/058  "Package <name> is already locked"
POST /sap/bc/adt/deletion/delete
  200  isDeleted="false"                PAK/058  "Package <name> is already locked"
```

It is not an enqueue lock and not the lock handle: the `LOCK` right before the
`PUT` answers 200 with a handle, and the `UNLOCK` after it answers 200. Traced on
premise (2026-09-26) through the ABAP code:

- `PAK/058` is raised in exactly one place — `CL_PACKAGE`, method
  `IF_PACKAGE~SET_CHANGEABLE` (include `CM01A`, line 39), when the package
  instance's `m_lock_state` is already `created`, `requested`, `modified` or
  `deleted` (`MESSAGE e058(pak)`, `RAISE object_already_changeable`).
- `CL_PACKAGE` keeps its instances in a static buffer (`s_package_dir`).
  `IF_PACKAGE~LOAD_PACKAGE` answers the buffered instance when there is one and
  does not re-read the database.
- The ADT package persistence `CL_PAK_ADT_PERSIST`:
  - `save` in insert mode creates through `create_new_package` and saves; after
    a save `M_SAVE` leaves the instance in `m_lock_state = requested`;
  - `lock` / `unlock` call only `RS_ACCESS_PERMISSION` (enqueue) and never touch
    the buffer;
  - `save` in modify mode and `delete` call `load_package` and then
    `set_changeable( abap_true )` — which meets the buffered `requested`
    instance and raises `PAK/058`.
- Nothing in the ADT package classes (`CL_PAK_ADT_*`) ever calls
  `set_changeable( abap_false )` or `undo_all_changes`, the only paths that
  reset the state. SAP's own unit test `CL_PAK_ADT_PERSIST=>simulate_save`
  meets the same state and passes only because `save` tolerates
  `object_already_changeable` for access mode `CHECK` — not for a real modify.

The buffer lives as long as the ABAP session. Over HTTP a create is a stateless
request, so its buffer is gone before the stateful lock/update/unlock runs;
over RFC the create and the update share the session. The same rule holds on
HTTP inside one stateful session: a delete after an update in that session is
refused with `PAK/058` (measured, adt-clients `docs/development/RFC_TESTING.md`),
and so is a second update (measured over RFC, below).

**Workaround:** change or delete the package from a new ABAP session — a new
RFC connection, or a new stateful HTTP session. There is no ADT call that
resets the buffered state from inside the session. Measured over RFC on premise
(2026-09-26), one connection per session:

| session | call | answer |
|---|---|---|
| A | create | `201` |
| B (new) | lock → `PUT` → unlock | `PUT` `200` |
| B | the same update again | `PUT` `400`, `PAK/058` |
| B | delete | `isDeleted="false"`, `PAK/058` |
| C (new, A and B still open) | lock → `PUT` → unlock | `PUT` `200` |
| D (new) | delete | `isDeleted="true"` |

So an update leaves the buffer as a create does, and the state belongs to the
session, not to an enqueue: C updates while A and B are still open.
`DeletePackage` takes `force_new_connection: true` for exactly this; the
package integration test creates, updates and deletes on three connections.

**Over HTTP too.** One stateful HTTP session cannot save a package twice either.
Measured on premise (2026-09-27) on one connection held across calls, as the
server holds it:

- the create is a stateless request and does not count;
- the first lock → update → unlock in the stateful session succeeds;
- the second update in that session gets `400`, `PAK/058`;
- a delete in that session also gets `PAK/058`.

Each lock chain on a new connection succeeds.

**The rule:** a package can be saved (created, updated or deleted) only once
per ABAP session.

**Where it is handled.**

- **HTTP: in the connection** (`@mcp-abap-adt/connection`, fr0ster/mcp-abap-connection#60).
  - The stateful context a `LOCK` opens is named by the `sap-contextid` cookie. The connection used to send that cookie on every request, so the `PUT` after a `LOCK` ran in the lock's context.
  - With #60, only stateful requests (`LOCK`, `UNLOCK`) carry `x-sap-adt-sessiontype: stateful` and `sap-contextid`. Everything else runs outside the context, as Eclipse ADT does. The `PUT`'s save then ends with its own ABAP session, and one connection can update and delete a package repeatedly.
  - Measured on BASIS 816 and on BASIS 756. Before, the older release answered every package `PUT` on the same connection with `423` "invalid lock handle".
- **RFC: in this server** (`src/lib/packageSessions.ts`). An RFC connection has no stateless request: every call shares its one ABAP session. So over RFC:
  - `CreatePackage`, `UpdatePackage` and compact `HandlerCreate` of a `PACKAGE` run on a new connection, closed when they answer.
  - Compact `HandlerLock` of a `PACKAGE` opens a new connection, locks on it, and keeps it under the lock handle. `HandlerUpdate` with that handle runs on it, and `HandlerUnlock` unlocks there and closes it, whatever the unlock answered.
- **`DeletePackage`:** `force_new_connection: true` still deletes from a new session, for a package saved elsewhere through the same connection.

The package integration test (create, two updates through the tools on one connection, delete) passes on RFC and on HTTP.

## Troubleshooting

### "@mcp-abap-adt/sap-rfc-lite is not available … Cannot find module"

The RFC module is not installed: the install left it out (`--no-optional` / `--omit=optional`). Check:

```bash
npm ls -g @mcp-abap-adt/sap-rfc-lite     # (empty) = not installed
```

Install again without that option. Do not test with `node -e "require(...)"`: it resolves from the current directory, and fails for a global install even when the module is there.

### "@mcp-abap-adt/sap-rfc-lite is not available … No native build was found"

There is no binding for this platform: the package carries prebuilt ones for Linux x64 (glibc), Windows x64 and macOS ARM64 only. Build one as the [sap-rfc-lite README, "Installation"](https://github.com/fr0ster/sap-rfc-lite#installation) describes. On a musl distribution other than Alpine the glibc binding is found and fails to load instead.

### "@mcp-abap-adt/sap-rfc-lite is not available … cannot open shared object file" / "The specified module could not be found"

The binding is there but a library it links cannot be loaded. The message still says to install the module — it is installed; the `Details:` part names what is missing.

- **Windows** (`The specified module could not be found: sapnwrfc.node`): no 64-bit `sapnwrfc.dll` in `System32`, and `%SAPNWRFC_HOME%\lib` is not on `PATH` in the server process. Set it (step 2) and restart the terminal or the MCP client.
- **Linux/macOS, an SDK library** (`libsapnwrfc`, `libsapucum`): the SDK's `lib` directory is not on `LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH` in the server process (step 2), or the SDK was moved.
- **Linux, a system library** (`libuuid.so.1`, measured 2026-10-05): seen with a Node.js from Linuxbrew, which runs on Linuxbrew's own loader and C library and does not search the system's library directories — and pointing `LD_LIBRARY_PATH` at them breaks Node.js itself. Use a Node.js built for the system (the distribution's package, NodeSource or nvm), or expose that one library alone as the [sap-rfc-lite README, "Runtime library loading"](https://github.com/fr0ster/sap-rfc-lite#runtime-library-loading) shows.

### "no usable SNC library was found"

No candidate of the discovery order (see SNC above) was usable. Install the SNC product, or set `SAP_SNC_LIB` to its 64-bit library.

### "the SNC library has no credential to present (A2200019)"

The Secure Login Client is not logged on: log on to the profile used for SAP applications and retry.

### "RFC connection is not open"

The server failed to connect via RFC. Check that the host in `SAP_URL` is an application server reachable from this machine, the system number (`SAP_SYSNR`), the credentials, and `S_RFC` authorization. Through a message server, check `SAP_MSHOST`, `SAP_MSSERV` / `SAP_SYSID` and the logon group `SAP_GROUP` instead of the host and the system number.
