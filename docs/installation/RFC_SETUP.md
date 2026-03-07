# RFC Connection Setup (Legacy Systems)

RFC connections are required for legacy SAP systems (BASIS < 7.50) where HTTP stateful sessions are not supported. Without RFC, lock handles are lost between requests, causing update/unlock operations to fail.

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

### 3. node-rfc Package

```bash
npm install node-rfc
```

`node-rfc` is loaded dynamically at runtime — it is not a declared dependency.

Verify installation:

```bash
node -e "try { require('node-rfc'); console.log('OK'); } catch(e) { console.log(e.message); }"
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
- `SAP_CONNECTION_TYPE` — transport layer (`http` or `rfc`). Set to `rfc` for legacy systems.

## How It Works

1. `SAP_CONNECTION_TYPE=rfc` tells the server to create an `RfcAbapConnection` instead of HTTP
2. The connection calls SAP function module `SADT_REST_RFC_ENDPOINT` for every ADT request
3. The RFC session is inherently stateful — lock handles persist across calls
4. Host and system number are derived from `SAP_URL` (port 80XX -> system number XX)

## Troubleshooting

### "node-rfc is not available"

SAP NW RFC SDK is not installed or not in PATH. Check:

```bash
echo $SAPNWRFC_HOME
node -e "require('node-rfc')"
```

### "The specified module could not be found: sapnwrfc.node"

The native module exists but can't load SDK DLLs. Ensure `SAPNWRFC_HOME/lib` is in PATH **before** starting Node.js. Restart your terminal after setting variables.

### "RFC connection is not open"

The server failed to connect via RFC. Check SAP system availability, credentials, and `S_RFC` authorization.
