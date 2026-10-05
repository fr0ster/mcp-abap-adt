# Testing Platform-Specific Auth Stores

## Storage Paths

### Unix (Linux/macOS):
- **Service keys**: `~/.config/mcp-abap-adt/service-keys/{destination}.json`
- **Sessions (.env)**: `~/.config/mcp-abap-adt/sessions/{destination}.env`

### Windows:
- **Service keys**: `%USERPROFILE%\Documents\mcp-abap-adt\service-keys\{destination}.json`
- **Sessions (.env)**: `%USERPROFILE%\Documents\mcp-abap-adt\sessions\{destination}.env`

## Search Priority:

1. **Custom path** (if provided in constructor)
2. **AUTH_BROKER_PATH** (environment variable)
3. **Platform-specific paths** (listed above)

Never the working directory: nothing is looked up where the server happens to start.

## How to Test:

### 1. Create a test service key:

```bash
# Create directory (if not already created)
mkdir -p ~/.config/mcp-abap-adt/service-keys

# Create test service key (example)
cat > ~/.config/mcp-abap-adt/service-keys/TRIAL.json << 'EOF'
{
  "uaa": {
    "url": "https://your-uaa-url.com",
    "clientid": "your-client-id",
    "clientsecret": "your-client-secret"
  },
  "url": "https://your-sap-url.com",
  "abap": {
    "url": "https://your-sap-url.com"
  }
}
EOF
```

### 2. Start the server:

With an installed server (a checkout is not runnable by itself — see
[Installation — from source](../../installation/INSTALLATION.md#from-source-development)):

```bash
npx @modelcontextprotocol/inspector mcp-abap-adt --mcp=<destination>   # stdio, in the MCP Inspector
# or
mcp-abap-adt --transport=http --allow-destination-header
# or
mcp-abap-adt --transport=sse --allow-destination-header
```

### 3. Test via MCP Inspector or client:

Send a request with header:
```
x-mcp-destination: TRIAL
x-sap-url: https://your-sap-url.com
```

Or:
```
x-mcp-destination: TRIAL
```

### 4. Verify that .env file was created:

```bash
ls -la ~/.config/mcp-abap-adt/sessions/
# TRIAL.env should appear after successful authentication
```

### 5. Check .env file contents:

```bash
cat ~/.config/mcp-abap-adt/sessions/TRIAL.env
# Should contain:
# SAP_URL=...
# SAP_JWT_TOKEN=...
# SAP_REFRESH_TOKEN=...
# SAP_UAA_URL=...
# SAP_UAA_CLIENT_ID=...
# SAP_UAA_CLIENT_SECRET=...
```

## Alternative: A Directory of Your Own

To keep the stores elsewhere, name the base directory (it holds `service-keys/` and `sessions/`):

```bash
mkdir -p ~/prj/tmp/service-keys
# put TRIAL.json in ~/prj/tmp/service-keys/
mcp-abap-adt --mcp=TRIAL --auth-broker-path=~/prj/tmp/
```

## Debug Mode:

To enable debug logs for auth-broker:

```bash
DEBUG_AUTH_LOG=true mcp-abap-adt --transport=http --allow-destination-header
```

## Test Logging Switches

- `TEST_LOG_LEVEL=error|warn|info|debug` — sets verbosity for integration tests (DEBUG_TESTS/DEBUG_ADT_TESTS/DEBUG_CONNECTORS imply `debug`).
- `TEST_LOG_FILE=/tmp/adt-tests.log` — optional file sink for test logs (best-effort).
- `TEST_LOG_SILENT=true` — disable test logging pipeline entirely.
- `TEST_LOG_COLOR=true` — enable colored/prefixed tags in stdout.
