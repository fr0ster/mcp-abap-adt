# RFC Connection Setup

RFC is an alternative connection transport to HTTP. It works with any SAP system supported by the SAP NW RFC SDK. The RFC session is inherently stateful, so lock handles persist across calls without requiring HTTP stateful sessions.

## Prerequisites

### 1. SAP NW RFC SDK

Download from [SAP Support Portal](https://support.sap.com/en/product/connectors/nwrfcsdk.html) (requires S-user).

Extract to a local directory, e.g. `C:\nwrfcsdk\nwrfcsdk` (Windows) or `~/nwrfcsdk` (Linux/macOS).

### 2. Environment Variables

The SDK requires two shell-level environment variables. These **must** be set in the shell before starting Node.js — `.env` files do not work for this.

**Windows (PowerShell profile — persistent):**

Add to `$PROFILE` (usually `~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`):

```powershell
$env:SAPNWRFC_HOME = "C:\nwrfcsdk\nwrfcsdk"
$env:PATH = "C:\nwrfcsdk\nwrfcsdk\lib;$env:PATH"
```

**Windows (System Environment Variables — persistent):**

1. Open **System Properties** > **Environment Variables**
2. Add `SAPNWRFC_HOME` = `C:\nwrfcsdk\nwrfcsdk`
3. Append `C:\nwrfcsdk\nwrfcsdk\lib` to `PATH`

**Linux/macOS (bash/zsh profile — persistent):**

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export SAPNWRFC_HOME=~/nwrfcsdk
export PATH=$SAPNWRFC_HOME/lib:$PATH
# Linux only:
export LD_LIBRARY_PATH=$SAPNWRFC_HOME/lib:${LD_LIBRARY_PATH:-}
```

### 3. @mcp-abap-adt/sap-rfc-lite Package

```bash
npm install @mcp-abap-adt/sap-rfc-lite
```

`@mcp-abap-adt/sap-rfc-lite` is a lightweight fork of the archived `node-rfc` package, containing only the API surface needed for ADT RFC connections. It is loaded dynamically at runtime — it is not a declared dependency.

Verify installation:

```bash
node -e "try { require('@mcp-abap-adt/sap-rfc-lite'); console.log('OK'); } catch(e) { console.log(e.message); }"
```

### 4. SAP Authorization

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

- `SAP_AUTH_TYPE` — authentication method (`basic` or `jwt`). RFC uses basic auth with username/password.
- `SAP_CONNECTION_TYPE` — transport layer (`http` or `rfc`).

## How It Works

1. `SAP_CONNECTION_TYPE=rfc` tells the server to create an `RfcAbapConnection` instead of HTTP
2. The connection calls SAP function module `SADT_REST_RFC_ENDPOINT` for every ADT request
3. The RFC session is inherently stateful — lock handles persist across calls
4. Host and system number are derived from `SAP_URL` (port 80XX -> system number XX)

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
`DeletePackageLow` takes `force_new_connection: true` for exactly this; the
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
  - `CreatePackage` / `CreatePackageLow` run on a new connection, closed when they answer.
  - `LockPackageLow` opens a new connection, locks on it, and keeps it under the lock handle. `UpdatePackageLow` with that handle runs on it, and `UnlockPackageLow` unlocks there and closes it, whatever the unlock answered.
- **`DeletePackageLow`:** `force_new_connection: true` still deletes from a new session, for a package saved elsewhere through the same connection.

The package integration test (create, two updates through the tools on one connection, delete) passes on RFC and on HTTP.

## Troubleshooting

### "@mcp-abap-adt/sap-rfc-lite is not available"

SAP NW RFC SDK is not installed or not in PATH. Check:

```bash
echo $SAPNWRFC_HOME
node -e "require('@mcp-abap-adt/sap-rfc-lite')"
```

### "The specified module could not be found: sapnwrfc.node"

The native module exists but can't load SDK DLLs. Ensure `SAPNWRFC_HOME/lib` is in PATH **before** starting Node.js. Restart your terminal after setting variables.

### "RFC connection is not open"

The server failed to connect via RFC. Check SAP system availability, credentials, and `S_RFC` authorization.
