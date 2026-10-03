# Service Key Setup for Cline

## Quick Setup Guide

### Step 1: Save Service Key File

**Linux:**
```bash
mkdir -p ~/.config/mcp-abap-adt/service-keys
# Download service key from SAP BTP (from the corresponding service instance)
# and copy it to: ~/.config/mcp-abap-adt/service-keys/TRIAL.json
```

**macOS:**
```bash
mkdir -p ~/.config/mcp-abap-adt/service-keys
# Download service key from SAP BTP (from the corresponding service instance)
# and copy it to: ~/.config/mcp-abap-adt/service-keys/TRIAL.json
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\Documents\mcp-abap-adt\service-keys"
# Download service key from SAP BTP (from the corresponding service instance)
# and copy it to: %USERPROFILE%\Documents\mcp-abap-adt\service-keys\TRIAL.json
```

**Windows (Command Prompt):**
```cmd
mkdir "%USERPROFILE%\Documents\mcp-abap-adt\service-keys"
# Download service key from SAP BTP (from the corresponding service instance)
# and copy it to: %USERPROFILE%\Documents\mcp-abap-adt\service-keys\TRIAL.json
```

**Important:** Download the service key JSON file from SAP BTP (from the corresponding service instance) and save it with the destination name (e.g., `TRIAL.json`). The filename without `.json` extension becomes the destination name (case-sensitive).

### Step 2: Start the Server with the Destination

The server serves one default destination, named with `--mcp`. (`--auth-broker` makes it ignore a `.env` in the working directory.)

```bash
# With NPX (recommended)
npx @mcp-abap-adt/core --transport=http --port=3000 --mcp=TRIAL

# Or with global install
mcp-abap-adt --transport=http --port=3000 --mcp=TRIAL

# With custom path for service keys and sessions
mcp-abap-adt --transport=http --port=3000 --mcp=TRIAL --auth-broker-path=~/prj/tmp/
```

**What `--mcp=TRIAL` does:**
- The destination is read field by field from `sessions/TRIAL.env` (wins) and `service-keys/TRIAL.json`
- The working directory's `.env` is not loaded
- Without `--unsafe` the session is kept in memory: one browser login per process. With `--unsafe` it is written to `sessions/TRIAL.env`

**An XSUAA service key** (a key whose root has `url`, `clientid` and `clientsecret`) carries the UAA, not the ABAP system. State the system's URL as `XSUAA_MCP_URL` in `sessions/TRIAL.env`.

**Using --auth-broker-path:**
- `--auth-broker-path=<path>` specifies the base directory of the `service-keys` and `sessions` subdirectories
- Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`

### Step 3: Configure Cline

With `--mcp=TRIAL` the client needs no headers:

```json
{
  "mcpServers": {
    "mcp-abap-adt-service-key": {
      "url": "http://localhost:3000",
      "transport": "http",
      "disabled": false
    }
  }
}
```

To choose the destination per request, start the server with `--allow-destination-header` and send `x-mcp-destination`:

```json
{
  "mcpServers": {
    "mcp-abap-adt-service-key": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": {
        "x-mcp-destination": "TRIAL"
      },
      "disabled": false
    }
  }
}
```

The destination name must **exactly** match the service key filename without `.json` (**case-sensitive**) and may use only letters, digits, `_`, `.` and `-`.

**Examples:**
- File: `sk.json` → Header: `"sk"` (lowercase)
- File: `SK.json` → Header: `"SK"` (uppercase)
- File: `TRIAL.json` → Header: `"TRIAL"`

### Step 4: First-Time Authentication

When you make the first request:
1. The server reads the destination
2. The browser opens for the login; the server waits for the redirect on port `61001` (`--browser-auth-port` changes it)
3. The token is stored: in memory, or in `~/.config/mcp-abap-adt/sessions/TRIAL.env` with `--unsafe`
4. Subsequent requests use the stored token, and the server renews it

## Troubleshooting

### Error: `Destination "TRIAL" lacks: <fields>`

**Cause**: The destination states less than its authentication needs. The message names the fields and, where the server knows the remedy, one hint.

**Solution**:
- `grantType`: the `.env` is a `jwt` one without `SAP_GRANT_TYPE`. Add it, or regenerate with `mcp-auth generate-env --grant <grant>` (`@mcp-abap-adt/auth-broker-cli`)
- `XSUAA_MCP_URL`: an XSUAA key needs the system's URL in `sessions/TRIAL.env`
- `SAP_URL`: state the system's URL

### Error: `Destination "TRIAL" uses <type> / <grant>, which this server does not support`

**Cause**: The destination states an authentication outside the four the server supports (basic, SNC, `jwt` / `authorization_code`, `jwt` / `none`).

### Error: the key is not found

**Cause**: Service key file is missing or invalid.

**Solution**:
1. Check service key file exists: `~/.config/mcp-abap-adt/service-keys/TRIAL.json`
2. Verify JSON format is correct
3. Verify the destination name matches the file name exactly

### The browser login does not finish

**Cause**: The callback port is taken, or the redirect is registered for another port.

**Solution**: Free port `61001`, or set `--browser-auth-port` to the port the client's redirect allows.

## Multiple Destinations

Create multiple service key files:

```bash
~/.config/mcp-abap-adt/service-keys/DEV.json
~/.config/mcp-abap-adt/service-keys/PROD.json
~/.config/mcp-abap-adt/service-keys/TRIAL.json
```

Either run one server per destination (`--mcp=DEV`, `--mcp=PROD`, each on its own `--port`), or run one server with `--allow-destination-header` and send the destination per request. A destination is built the first time a request asks for it and kept for the life of the process:

```json
{
  "mcpServers": {
    "mcp-abap-dev": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": { "x-mcp-destination": "DEV" },
      "disabled": false
    },
    "mcp-abap-prod": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": { "x-mcp-destination": "PROD" },
      "disabled": false
    }
  }
}
```
