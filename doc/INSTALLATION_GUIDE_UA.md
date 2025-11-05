# MCP ABAP ADT Server Installation Guide

This guide helps you install and configure the MCP ABAP ADT Server so you can work with SAP ABAP systems through the Model Context Protocol (MCP). The server integrates ABAP development with AI tools such as Cline, Cursor, and GitHub Copilot.

## 📋 Table of Contents

1. [Prerequisites](#-prerequisites)
2. [Installation](#-installation)
3. [On-Premise SAP Configuration](#-on-premise-sap-configuration)
4. [SAP BTP Cloud Configuration](#-sap-btp-cloud-configuration)
5. [Connecting to Cline](#-connecting-to-cline)
6. [Connecting to Cursor](#-connecting-to-cursor)
7. [Connecting to GitHub Copilot](#-connecting-to-github-copilot)
8. [Testing](#-testing)
9. [Troubleshooting](#-troubleshooting)
10. [Available Tools](#-available-tools)

## 🔧 Prerequisites

### System Requirements
- **Node.js** version 18 or later
- **npm** (bundled with Node.js)
- **Git** for cloning the repository
- Access to a SAP ABAP system (on-premise or BTP)

### SAP System Requirements
- Activate ADT services in transaction `SICF`:
  - `/sap/bc/adt`
- The `GetTableContents` tool requires the custom service `/z_mcp_abap_adt/z_tablecontent`
- Provide appropriate authorizations to the SAP user

### Installing Node.js
1. Download the Node.js LTS release from [nodejs.org](https://nodejs.org/)
2. Follow the OS-specific installer instructions
3. Verify the installation:
   ```bash
   node -v
   npm -v
   ```

## 📦 Installation

### Automatic Installation via Smithery

```bash
npx -y @smithery/cli install @mario-andreschak/mcp-abap-adt --client cline
```

### Manual Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mario-andreschak/mcp-abap-adt.git
   cd mcp-abap-adt
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## 🏢 On-Premise SAP Configuration

### 1. Create the configuration file

Add a `.env` file to the project root:

```env
# SAP system URL
SAP_URL=https://your-sap-system.com:8000

# SAP client
SAP_CLIENT=100

# Language (optional, defaults to 'en')
SAP_LANGUAGE=en

# Authentication type
SAP_AUTH_TYPE=basic

# Credentials
SAP_USERNAME=your_username
SAP_PASSWORD=your_password

# TLS options (set to 0 for self-signed certificates)
TLS_REJECT_UNAUTHORIZED=0

# Timeouts in milliseconds
SAP_TIMEOUT_DEFAULT=45000
SAP_TIMEOUT_CSRF=15000
SAP_TIMEOUT_LONG=60000
```

### 2. Verify the connection

Start the server to test connectivity:
```bash
npm run start
```

## ☁️ SAP BTP Cloud Configuration

### 1. Obtain a service key

1. Sign in to the SAP BTP Cockpit
2. Open your ABAP Environment instance
3. Create a Service Key for the communication arrangement
4. Download the JSON file with credential details

### 2. Automatic authorization (recommended)

Use the bundled tool to fetch a JWT token automatically:

```bash
node tools/sap-abap-auth-browser.js auth --key path/to/your/service-key.json --browser chrome
```

**Parameters:**
- `--key <path>`: Path to the JSON service key
- `--browser <browser>`: Browser to launch (chrome, edge, firefox, system, none)

**What the tool does:**
1. Reads the SAP BTP service key
2. Opens a browser window for the OAuth2 authorization
3. Exchanges the authorization code for a JWT token
4. Generates or updates the `.env` file with the correct configuration

### 3. Manual configuration

If the automatic flow fails, create `.env` manually:

```env
# URL from the service key
SAP_URL=https://your-account-abap-trial.eu10.abap.cloud.sap

# SAP client from the service key
SAP_CLIENT=100

# Authentication type
SAP_AUTH_TYPE=xsuaa

# JWT token obtained via OAuth2
SAP_JWT_TOKEN=your_jwt_token_here

# Timeout settings
SAP_TIMEOUT_DEFAULT=45000
SAP_TIMEOUT_CSRF=15000
SAP_TIMEOUT_LONG=60000
```

## 🔌 Connecting to Cline

### 1. Install Cline

Install the "Cline" extension for VS Code from the Marketplace.

### 2. Configure the MCP server

1. Open VS Code settings (Ctrl+,)
2. Search for "Cline MCP Settings"
3. Click "Edit in settings.json"
4. Add the server configuration:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Important:** Replace `C:/PATH_TO/mcp-abap-adt/` with the absolute path to your project directory.

### 3. Restart VS Code

Restart VS Code to apply the configuration.

## 🎯 Connecting to Cursor

### 1. Install Cursor

Download and install Cursor from [cursor.sh](https://cursor.sh/).

### 2. Configure MCP

1. Launch Cursor
2. Open Settings → Features → Model Context Protocol
3. Add a new server:

```json
{
  "mcp-abap-adt": {
    "command": "node",
    "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"],
    "env": {}
  }
}
```

### 3. Enable the server

Enable the server in the MCP settings and restart Cursor.

## 🐙 Connecting to GitHub Copilot

### 1. GitHub Copilot extensions

GitHub Copilot supports MCP through its extensions. To integrate:

1. Install the GitHub Copilot extension for VS Code
2. Configure the MCP server inside the extension
3. Update `settings.json`:

```json
{
  "github.copilot.advanced": {
    "mcp": {
      "servers": {
        "mcp-abap-adt": {
          "command": "node",
          "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"]
        }
      }
    }
  }
}
```

### 2. Using Claude Desktop

You can also connect via Claude Desktop:

1. Install Claude Desktop
2. Add the MCP server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-abap-adt": {
      "command": "node",
      "args": ["C:/PATH_TO/mcp-abap-adt/dist/index.js"]
    }
  }
}
```

## 🧪 Testing

### 1. Connectivity test

Run the server in development mode:
```bash
npm run dev
```

Open the browser at the URL shown in the output (typically `http://localhost:5173`).

### 2. Tool testing

In MCP Inspector:
1. Click "Connect"
2. Navigate to "Tools"
3. Click "List Tools"
4. Invoke the `GetProgram` tool with parameter `SAPMV45A`

### 3. Testing in Cline

Ask Cline:
```
Retrieve the source code of program SAPMV45A
```

Cline should call the MCP server and return the code.

## 🔧 Troubleshooting

### Node.js issues
- **"node" is not recognized:** Ensure Node.js is added to the PATH environment variable
- **`npm install` fails:** Remove `node_modules` and rerun `npm install`

### SAP connectivity issues
- **Authorization error:** Verify credentials in `.env`
- **Timeouts:** Increase the timeout values in `.env`
- **SSL errors:** Set `TLS_REJECT_UNAUTHORIZED=0` when using self-signed certificates

### MCP client issues
- **Cline cannot find the server:** Confirm the path in `cline_mcp_settings.json`
- **Server fails to start:** Ensure the project is built (`npm run build`)

### Logging and debugging

Use verbose logging when needed:
```bash
set DEBUG=mcp-abap-adt:*
npm run start
```

## 📚 Available Tools

| Tool | Description | Parameters | Example Usage |
|------|-------------|------------|----------------|
| `GetProgram` | Fetch ABAP program source code | `program_name` (string) | Retrieve program SAPMV45A |
| `GetClass` | Fetch ABAP class source code | `class_name` (string) | Show class ZCL_MY_CLASS |
| `GetFunction` | Fetch function module source | `function_name`, `function_group` | Get function Z_MY_FUNCTION |
| `GetTable` | Inspect database table structure | `table_name` (string) | Show table MARA |
| `GetTableContents` | Read database table data | `table_name`, `max_rows` (optional) | Fetch data from MARA |
| `GetEnhancements` | Analyze enhancements | `object_name`, `include_nested` (optional) | List enhancements for SAPMV45A |
| `GetSqlQuery` | Execute SQL queries | `sql_query`, `row_number` (optional) | Run SELECT * FROM mara WHERE matnr LIKE 'TEST%' |
| `SearchObject` | Search ABAP objects | `query`, `maxResults` (optional) | Find objects starting with Z* |

### Examples in Cline

```
# Retrieve a program
Retrieve the source code of program SAPMV45A

# Analyze enhancements
List all enhancements in SAPMV45A including nested includes

# Search objects
Find classes starting with ZCL_SALES

# SQL query
Run SQL query: SELECT matnr, maktx FROM mara INNER JOIN makt ON mara~matnr = makt~matnr WHERE mara~matnr LIKE 'TEST%'
```

## 🔐 Security

### Protecting credentials
- Never commit the `.env` file to source control
- Prefer JWT tokens over passwords for BTP
- Rotate access tokens regularly

### Network security
- Use HTTPS for every connection
- Configure firewall rules to limit access
- Monitor access logs and alerts

## 📞 Support

If issues occur:
1. Inspect server logs
2. Review SAP ADT documentation
3. Open an issue in the GitHub repository
4. Contact your SAP Basis administrator for authorization questions

## 📄 License

This project is distributed under the MIT License. See the LICENSE file for details.
