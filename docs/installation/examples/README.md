# Cline Configuration Examples

Quick configuration files for connecting Cline to MCP ABAP ADT server.

## 📦 For NPM Package Users (Recommended)

### STDIO with NPX (No Installation)
**File**: `cline-stdio-npx-config.json`
- ✅ Always uses latest version
- ✅ No installation needed
- ✅ Works on all platforms

**Setup**:
1. Copy `cline-stdio-npx-config.json`
2. Replace `/REPLACE/WITH/PATH/TO/.env` with your `.env` file path
3. Paste into Cline settings

### STDIO with Global Install
**File**: `cline-stdio-global-config.json`
- Requires: `npm install -g @mcp-abap-adt/core`
- Faster startup than npx
- Version controlled by you

## 🌐 For Remote/Server Deployment

### HTTP Transport
**Files**: 
- `cline-http-npx-config.json` - for NPX/NPM package
- `cline-http-config.json` - for local development
- `cline-http-service-key-npx-config.json` - **for Service Keys (a named destination)**

**Setup**:
1. Start server in separate terminal:
   ```bash
   # With NPX (recommended); a .env in the working directory is the default destination
   npx @mcp-abap-adt/core --transport=http --port=3000
   
   # Or a named destination (the .env is not loaded)
   npx @mcp-abap-adt/core --transport=http --port=3000 --mcp=TRIAL
   
   # Or with global install
   mcp-abap-adt --transport=http --port=3000
   
   # Or local dev
   npm run start:http
   ```
2. Use config in Cline
3. Server runs independently, Cline connects via HTTP

**Benefits**:
- ✅ No `.env` path in Cline config
- ✅ Multiple clients can connect
- ✅ Server stays running

**Service Key Configuration**:
Use `cline-http-service-key-npx-config.json` for destination-based authentication:

1. **Create service key** (Unix):
   ```bash
   mkdir -p ~/.config/mcp-abap-adt/service-keys
   cat > ~/.config/mcp-abap-adt/service-keys/TRIAL.json << 'EOF'
   {
     "uaa": {
       "url": "https://your-uaa-url.com",
       "clientid": "your-client-id",
       "clientsecret": "your-client-secret"
     },
     "url": "https://your-sap-url.com"
   }
   EOF
   ```

2. **Start the server, allowing the destination header**:
   ```bash
   # With NPX (recommended)
   npx @mcp-abap-adt/core --transport=http --port=3000 --allow-destination-header
   
   # Or with global install
   mcp-abap-adt --transport=http --port=3000 --allow-destination-header
   ```
   
   **Note**: 
   - `x-mcp-destination` is honoured only with `--allow-destination-header`; use `--mcp=TRIAL` instead to serve one destination without a header
   - Without `--mcp`, `--env` or `--env-path`, the server uses the `.env` in the working directory if there is one
   - An XSUAA service key needs `XSUAA_MCP_URL` in `sessions/TRIAL.env`

3. **Use config** with destination header:
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

**First-time authentication**: The browser opens for the login (callback port `61001`). The token is kept in memory, or saved to `sessions/TRIAL.env` with `--unsafe`.

### SSE Transport  
**Files**:
- `cline-sse-npx-config.json` - for NPX/NPM package
- `cline-sse-config.json` - for local development

**Setup**:
1. Start server in separate terminal:
   ```bash
   # With NPX (recommended)
   npx @mcp-abap-adt/core --transport=sse --port=3001 --env=/path/to/.env
   
   # Or with global install
   mcp-abap-adt --transport=sse --port=3001 --env=/path/to/.env
   
   # Or local dev
   npm run start:sse
   ```
2. Use config in Cline
3. Good for long-running connections with real-time updates

## 🛠️ For Local Development

### STDIO with Local Repository
**File**: `cline-stdio-config.json`
- For developers working on mcp-abap-adt source code
- Points to cloned repository path
- Need to run `npm run build` first

## Quick Start (Most Common)

**Copy this** into Cline settings (macOS/Linux):
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-abap-adt/core",
        "--transport=stdio",
        "--env=/Users/YOUR_USERNAME/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

**Windows**:
```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "npx",
      "args": [
        "-y",
        "@mcp-abap-adt/core",
        "--transport=stdio",
        "--env=C:/Users/YOUR_USERNAME/.env"
      ],
      "env": {},
      "disabled": false
    }
  }
}
```

## .env File Template

Create `.env` file with your SAP credentials:
```env
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_USERNAME=your-username
SAP_PASSWORD=your-password
```

Or for a JWT you hold:
```env
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_GRANT_TYPE=none
SAP_JWT_TOKEN=your-jwt-token
```

## Testing

After adding config to Cline:
1. Restart Cline
2. Check available tools
3. Try: "Get the source code of class ZCL_TEST"

## More Info

See [CLINE_CONFIGURATION.md](../CLINE_CONFIGURATION.md) for detailed documentation.
