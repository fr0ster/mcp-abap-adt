# Testing Platform-Specific Auth Stores

## Storage Paths

### Unix (Linux/macOS):
- **Service keys**: `~/.config/mcp-abap-adt/service-keys/{destination}.json`
- **Sessions (.env)**: `~/.config/mcp-abap-adt/sessions/{destination}.env`
- **Also searches in**: current working directory (where mcp-abap-adt is launched from)

### Windows:
- **Service keys**: `%USERPROFILE%\Documents\mcp-abap-adt\service-keys\{destination}.json`
- **Sessions (.env)**: `%USERPROFILE%\Documents\mcp-abap-adt\sessions\{destination}.env`
- **Also searches in**: current working directory (where mcp-abap-adt is launched from)

## Search Priority:

1. **Custom path** (if provided in constructor)
2. **AUTH_BROKER_PATH** (environment variable)
3. **Platform-specific paths** (listed above)
4. **Current working directory** (process.cwd())

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

```bash
cd /home/okyslytsia/prj/mcp-abap-adt
npm run dev:stdio
# or
npm run dev:http
# or
npm run dev:sse
```

### 3. Test via MCP Inspector or client:

Send a request with header:
```
x-mcp-destination: TRIAL
x-sap-url: https://your-sap-url.com
```

Or:
```
x-sap-destination: TRIAL
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

## Alternative: Using Current Directory

If you want to use the current directory (where the server is launched from):

```bash
# Create service key in current directory
cat > TRIAL.json << 'EOF'
{
  "uaa": {
    "url": "https://your-uaa-url.com",
    "clientid": "your-client-id",
    "clientsecret": "your-client-secret"
  },
  "url": "https://your-sap-url.com"
}
EOF

# Start server from this directory
npm run dev:stdio
```

## Debug Mode:

To enable debug logs for auth-broker:

```bash
DEBUG_AUTH_LOG=true npm run dev:stdio
```

