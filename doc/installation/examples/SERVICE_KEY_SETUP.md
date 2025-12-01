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

### Step 2: Start Server with --auth-broker

**IMPORTANT**: You must use the `--auth-broker` flag to enable service key authentication:

```bash
# With NPX (recommended)
npx @fr0ster/mcp-abap-adt --transport=http --http-port=3000 --auth-broker

# Or with global install
mcp-abap-adt --transport=http --http-port=3000 --auth-broker

# With custom path for service keys and sessions
mcp-abap-adt --transport=http --http-port=3000 --auth-broker --auth-broker-path=~/prj/tmp/
```

**Why --auth-broker is required:**
- By default, the server checks for `.env` in current directory first
- If `.env` exists, it uses it instead of service keys
- `--auth-broker` forces use of service keys, ignoring `.env` file

**Using --auth-broker-path:**
- `--auth-broker-path=<path>` specifies custom location for service keys and sessions
- Creates `service-keys` and `sessions` subdirectories automatically
- Example: `--auth-broker-path=~/prj/tmp/` uses `~/prj/tmp/service-keys/` and `~/prj/tmp/sessions/`
- Directories are created automatically if they don't exist

### Step 3: Configure Cline

Use the configuration from `cline-http-service-key-npx-config.json`:

```json
{
  "mcpServers": {
    "mcp-abap-adt-service-key": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": {
        "x-sap-destination": "TRIAL"
      },
      "disabled": false
    }
  }
}
```

**Replace `"TRIAL"`** with your actual destination name (must **exactly** match the service key filename without `.json` extension, **case-sensitive**).

**Examples:**
- File: `sk.json` → Header: `"sk"` (lowercase)
- File: `SK.json` → Header: `"SK"` (uppercase)  
- File: `TRIAL.json` → Header: `"TRIAL"`
- File: `trial.json` → Header: `"trial"` (lowercase)

### Step 4: First-Time Authentication

When you make the first request:
1. Server reads service key from `TRIAL.json`
2. Browser opens for OAuth2 authentication
3. After successful login, tokens are saved to `~/.config/mcp-abap-adt/sessions/TRIAL.env`
4. Subsequent requests use cached tokens automatically

## Troubleshooting

### Error: "getaddrinfo ENOTFOUND placeholder"

**Cause**: Server is using placeholder configuration instead of service keys.

**Solution**:
1. Make sure you started server with `--auth-broker` flag
2. Check that service key file exists in correct location
3. Verify destination name in Cline config matches service key filename

### Error: "AuthBroker not initialized"

**Cause**: Server was started without `--auth-broker` and found `.env` file.

**Solution**: 
- Remove `.env` file from current directory, OR
- Start server with `--auth-broker` flag

### Error: "Failed to get SAP URL from destination"

**Cause**: Service key file is missing or invalid.

**Solution**:
1. Check service key file exists: `~/.config/mcp-abap-adt/service-keys/TRIAL.json`
2. Verify JSON format is correct
3. Ensure `url` or `abap.url` field is present in service key

## Alternative: Using x-mcp-destination

If you need to specify URL explicitly:

```json
{
  "mcpServers": {
    "mcp-abap-adt-service-key": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": {
        "x-mcp-destination": "TRIAL",
        "x-sap-url": "https://your-sap-url.com"
      },
      "disabled": false
    }
  }
}
```

## Multiple Destinations

You can use different destinations by creating multiple service key files:

```bash
# Create multiple service keys
~/.config/mcp-abap-adt/service-keys/DEV.json
~/.config/mcp-abap-adt/service-keys/PROD.json
~/.config/mcp-abap-adt/service-keys/TRIAL.json
```

Then configure multiple servers in Cline:

```json
{
  "mcpServers": {
    "mcp-abap-dev": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": { "x-sap-destination": "DEV" },
      "disabled": false
    },
    "mcp-abap-prod": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": { "x-sap-destination": "PROD" },
      "disabled": false
    }
  }
}
```

