# Team Setup

Install guide for this fork (`anggakharisma/mcp-abap-adt`). It adds two things
upstream does not have:

- **`ListSystems` / `SwitchSystem`** — point the running server at a different
  SAP system without restarting your MCP client.
- **`SAP_SAPROUTER`** — RFC connections through a SAProuter.

If you only need one system over HTTP, upstream `@mcp-abap-adt/core` works fine
and you can ignore this document.

## 1. Prerequisites

| | Needed for |
|---|---|
| Node.js 22, 24, or 25 | everything |
| SAP NW RFC SDK | RFC systems only (`kalog`, `swi.sim`) |

Skip the SDK if every system you use is `SAP_CONNECTION_TYPE=http` (e.g. `abl`).

### SAP NW RFC SDK

SAP licenses the SDK per customer, so it cannot be bundled here. Download
`nwrfc750*.zip` from the [SAP Software Download
Center](https://support.sap.com/swdc) (S-user required), unpack it anywhere,
and note the path to the `nwrfcsdk` directory.

> **This is the step that silently goes wrong.** `@mcp-abap-adt/sap-rfc-lite`
> is an *optional* dependency that compiles against the SDK. If the SDK
> variables are not exported **at install time**, npm drops the package without
> an error, and RFC fails much later with `Cannot find module
> '@mcp-abap-adt/sap-rfc-lite'`.

## 2. Install

Export the SDK variables **first**, in the same shell as the install:

```bash
export SAPNWRFC_HOME=/path/to/nwrfcsdk
export LD_LIBRARY_PATH=$SAPNWRFC_HOME/lib

npm i git+ssh://git@github.com/anggakharisma/mcp-abap-adt.git
```

The install builds `dist/` (`prepare`) and enables SAProuter support
(`postinstall`). Both must run — if your npm blocks install scripts you will
see an `npm warn allow-scripts` line, and you need `npm approve-scripts
@mcp-abap-adt/core` before the server will start.

Verify:

```bash
node -e "require('@mcp-abap-adt/sap-rfc-lite'); console.log('RFC ok')"
```

## 3. Connection profiles

One `.env.<name>` file per SAP system, in one directory. The filename is the
system name `SwitchSystem` uses — `.env.kalog` is `kalog`, plain `.env` is
`default`.

HTTP system:

```bash
SAP_URL=https://host:port/
SAP_CLIENT=120
SAP_AUTH_TYPE=basic
SAP_USERNAME=YOUR_USER
SAP_PASSWORD=YOUR_PASSWORD
SAP_SYSTEM_TYPE=onprem      # onprem | cloud | legacy
TLS_REJECT_UNAUTHORIZED=0   # only for self-signed certs
```

RFC through a SAProuter:

```bash
SAP_URL=http://10.0.0.1:8030   # host + port; sysnr derived as port-8000 → 30
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=YOUR_USER
SAP_PASSWORD=YOUR_PASSWORD
SAP_CONNECTION_TYPE=rfc
SAP_SYSTEM_TYPE=onprem
SAP_MASTER_SYSTEM=KAD
SAP_SAPROUTER=/H/router.example.com/H/
SAP_SYSNR=00                   # only if the port is not 80XX
```

> **These files hold plaintext SAP passwords.** `.gitignore` covers `.env.*`,
> but never move them into a repo that does not, and never paste them into
> chat or tickets. Each teammate uses their own SAP user.

## 4. MCP client config

```json
{
  "mcpServers": {
    "sap-adt": {
      "command": "npx",
      "args": ["mcp-abap-adt", "--env-path=/abs/path/to/.env"],
      "env": {
        "SAPNWRFC_HOME": "/path/to/nwrfcsdk",
        "LD_LIBRARY_PATH": "/path/to/nwrfcsdk/lib"
      }
    }
  }
}
```

The `env` block is required for RFC — the server process needs the SDK on its
library path at runtime, not just at install time. Drop it for HTTP-only setups.

`--env-path` picks the system the server starts on. Every `.env.*` file in that
same directory is then discoverable by `ListSystems`.

## 5. Switching systems

```
ListSystems                    → names, URLs, client, type, which is active
SwitchSystem { "system": "kalog" }
```

`SwitchSystem` closes the current connection, loads the new profile, reconnects
and verifies it. **If any of that fails it restores the previous system**, so a
bad switch cannot leave you disconnected. The tool list can change across a
switch, since some tools are restricted by system type — Programs, for example,
do not exist on ABAP Cloud.

Discovery order for profiles (first match wins on a name collision):

1. `MCP_SYSTEMS_PATH` (colon/semicolon separated dirs)
2. the directory of the `--env-path` file
3. the current working directory
4. `~/.config/mcp-abap-adt/sessions`

## 6. Troubleshooting

**`Cannot find module '@mcp-abap-adt/sap-rfc-lite'`**
The SDK variables were not exported when you installed. Re-export them and
reinstall — see step 2.

**`RFC_COMMUNICATION_FAILURE ... partner '<ip>:<port>' not reached`**
The connection went straight to the app server instead of through the router.
Check `SAP_SAPROUTER` is set in the profile, then confirm the SAProuter fix is
present:

```bash
grep -c SAP_SAPROUTER \
  node_modules/@mcp-abap-adt/connection/dist/connection/RfcAbapConnection.js
```

`0` means `postinstall` did not run (see the `allow-scripts` note in step 2).
Re-run it with `node node_modules/@mcp-abap-adt/core/scripts/apply-saprouter-patch.js`.

Upstream `@mcp-abap-adt/connection` has never implemented SAProuter — verified
against 1.10.0 and 5.0.0 — so this fix is reapplied on every install and must
be re-checked after any bump of that dependency.

**`ListSystems` / `SwitchSystem` missing from the tool list**
`dist/` is stale or was never built. Run `npm run build` in the package
directory and reconnect your MCP client.

**Tools missing on a system that should have them**
Check `SAP_SYSTEM_TYPE` in that profile. Setting `legacy` on a system that is
really `onprem` hides the SQL, search, and table tools.
