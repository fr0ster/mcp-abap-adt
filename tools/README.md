# Developer Tools

This directory contains utility scripts for development and maintenance of the MCP ABAP ADT server.

## Available Tools

### 1. Documentation Generator

**`generate-tools-docs.js`** - Automatically generates tool documentation from handler files.

**Purpose:** Creates `doc/user-guide/AVAILABLE_TOOLS.md` by extracting `TOOL_DEFINITION` from all handler files.

**Usage:**
```bash
npm run docs:tools
# or
node tools/generate-tools-docs.js [--help]
```

**What it does:**
- Scans all handler files in `src/handlers/`
- Extracts `TOOL_DEFINITION` from each handler
- Groups tools by category (Programs, Tables, Enhancements, etc.)
- Generates markdown documentation with:
  - Tool descriptions
  - Parameter lists with types and descriptions
  - Example JSON for each tool
  - Special notes (e.g., ABAP Cloud limitations)

**Output:** `doc/user-guide/AVAILABLE_TOOLS.md`

**When to use:**
- After adding new tools
- After updating tool descriptions
- Before releasing a new version
- To keep documentation in sync with code

---

### 2. TOOL_DEFINITION Helper

**`update-handlers-with-tool-definitions.js`** - Helps add `TOOL_DEFINITION` to handler files.

**Purpose:** Checks handler files and assists in adding `TOOL_DEFINITION` exports if missing.

**Usage:**
```bash
node tools/update-handlers-with-tool-definitions.js [--help]
```

**What it does:**
- Scans all handler files in `src/handlers/`
- Checks if each handler has `TOOL_DEFINITION`
- If missing, suggests a basic `TOOL_DEFINITION` based on:
  - Handler function name
  - JSDoc comments (if available)
- Adds the definition to the file

**⚠️ Important:** Auto-generated `TOOL_DEFINITION` is incomplete! You must:
- Review and update the description
- Complete `inputSchema.properties` to match handler parameters
- Set the `required` array correctly
- Add default values if needed

**When to use:**
- When creating a new handler file
- When migrating old handlers to new architecture
- To verify all handlers have `TOOL_DEFINITION`

**Best practice:** Manually add `TOOL_DEFINITION` following existing patterns. Use this script only as a starting point.

---

### 3. SAP ABAP Authentication CLI

The authentication utility is now provided by the `@mcp-abap-adt/connection` package.

## Requirements

- Node.js (>= 14.x)
- Service key file in JSON format from SAP BTP ABAP Environment

## Creating a Service Key

1. Log in to SAP BTP Cockpit
2. Go to your ABAP Environment (or Trial)
3. Select "Service Keys" (or create a service instance if you don't have one yet)
4. Create a new Service Key with the required parameters
5. Copy the JSON data and save it to a file (e.g., `abap-service-key.json`)

## Usage

```bash
# Using the CLI tool from @mcp-abap-adt/connection package
npx sap-abap-auth auth -k path/to/service-key.json

# Or if installed globally
sap-abap-auth auth -k path/to/service-key.json
```

## Result

The CLI utility will:

1. Read the service key file
2. Obtain an OAuth2 JWT token via XSUAA (or use basic)
3. Extract the URL and client of the SAP ABAP system
4. Update the `.env` file with the required values for JWT (xsuaa) or basic authentication, including refresh token and UAA credentials
5. Display the operation status in the console

## Example service key file structure

```json
{
  "uaa": {
    "clientid": "...",
    "clientsecret": "...",
    "url": "https://...",
    "tokenendpoint": "https://..."
  },
  "abap": {
    "url": "https://...",
    "sapClient": "100"
  },
  "endpoints": {
    "api": "https://..."
  }
}
```

## Example .env for JWT (xsuaa) and basic

```
SAP_URL=https://your-abap-url
SAP_CLIENT=100
SAP_AUTH_TYPE=xsuaa
SAP_JWT_TOKEN=your_jwt_token_here
SAP_REFRESH_TOKEN=your_refresh_token_here
SAP_UAA_URL=https://your-uaa-url
SAP_UAA_CLIENT_ID=your_client_id
SAP_UAA_CLIENT_SECRET=your_client_secret
# or for basic
# SAP_AUTH_TYPE=basic
# SAP_USERNAME=your_username
# SAP_PASSWORD=your_password
```

## For developers

- The authentication CLI tool is available via `npx sap-abap-auth` (from `@mcp-abap-adt/connection` package).
- The MCP server automatically uses JWT or basic according to the .env.
- The server supports refresh token in HTTP headers (`X-SAP-Refresh-Token`, `SAP-Refresh-Token`, or `X-Refresh-Token`) for dynamic token updates.
