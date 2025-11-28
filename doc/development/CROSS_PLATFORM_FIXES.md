# Cross-Platform Compatibility Fixes

## Problem

When running `npm run dev`, the following error occurred:
```
Error from MCP server: SyntaxError: Unexpected token 'd', "[dotenv@17."... is not valid JSON
```

### Root Cause

1. **dotenv package** was installed as "extraneous" dependency in `node_modules/`, but was not listed in `package.json`
2. When Node.js starts via stdio (as MCP Inspector does), dotenv outputs its version `[dotenv@17.2.3]` to stdout
3. MCP protocol over stdio **requires only clean JSON** in stdout - any other text breaks the protocol

### Solution

#### 1. Removing dotenv
```bash
npm uninstall dotenv
```

This removed the extraneous package that was causing the problem.

#### 2. Manual .env File Parsing

Code in `src/index.ts` already uses **manual .env parsing** (starting from line ~620):
- Reads .env file via `fs.readFileSync()`
- Parses lines manually
- Sets variables in `process.env`
- **Outputs nothing to stdout** in stdio mode

#### 3. Cross-Platform Support

Code includes special handling for Windows:
```typescript
// Aggressive cleaning for Windows compatibility
// Step 1: Remove ALL control characters (including \r from Windows line endings)
let unquotedValue = String(value).replace(/[\x00-\x1F\x7F-\x9F]/g, '');
// Step 2: Trim whitespace
unquotedValue = unquotedValue.trim();
// Step 3: Remove quotes (handle nested quotes)
unquotedValue = unquotedValue.replace(/^["']+|["']+$/g, '');
```

## Testing

### Testing All Transports:

1. **stdio mode (for MCP Inspector, Cline, Cursor, Claude Desktop)**
```bash
npm run dev
# або
node ./bin/mcp-abap-adt.js --transport=stdio --env=.env
```

2. **HTTP mode (default)**
```bash
npm run start:http
# or
node ./bin/mcp-abap-adt.js --transport=http
```

3. **SSE mode (Server-Sent Events)**
```bash
npm run start:sse
# or
node ./bin/mcp-abap-adt.js --transport=sse --env=.env
```

### Expected Results:

- ✅ **stdio**: Server starts without errors, MCP Inspector connects
- ✅ **http**: HTTP server listens on port 3000
- ✅ **sse**: SSE server listens on port 3001

## Cross-Platform Support

### Tested Platforms:

- ✅ **macOS** (currently working)
- ⏳ **Windows** (should work thanks to \r character cleanup)
- ⏳ **Linux** (should work)

### Windows-Specific Features:

1. **bin/mcp-abap-adt.js** uses `spawn()` instead of `require()` for better network support
2. **Control character cleanup** including `\r` (Windows line endings)
3. **Timeouts before exit()** on Windows so user can see errors
4. **Using `process.execPath`** instead of 'node' to avoid PATH issues

### .npmrc Configuration:

The `.npmrc` file contains cross-platform settings:
- `legacy-peer-deps=true` - prevents warning output
- `install-strategy=nested` - consistent node_modules structure across platforms
- `loglevel=error` - minimal output
- `audit=false`, `fund=false` - no extra noise

### Session Storage:

Session storage is **disabled by default** (stateless mode - each request creates fresh connection).

To enable persistent sessions (cookies, CSRF tokens):
```bash
# Enable with default location (OS temp dir)
MCP_ENABLE_SESSION_STORAGE=true mcp-abap-adt --transport=stdio

# Or specify custom directory
MCP_SESSION_DIR=/path/to/sessions mcp-abap-adt --transport=stdio
```

Session directories by OS:
- **Windows**: `C:\Users\username\AppData\Local\Temp\mcp-abap-adt-sessions`
- **Linux**: `/tmp/mcp-abap-adt-sessions`
- **macOS**: `/var/folders/.../mcp-abap-adt-sessions`

## Important

### ❌ DO NOT install:
```bash
# DON'T do this!
npm install dotenv
```

### ✅ Use:
Code already has built-in .env parser that:
- Works on all platforms
- Outputs nothing to stdout
- Properly handles Windows line endings (\r\n)
- Removes comments (#)
- Handles quotes

## Future Improvements

1. ✅ Remove dotenv - **Done**
2. ⏳ Add Windows tests via GitHub Actions
3. ⏳ Add Linux tests via GitHub Actions
4. ⏳ Create cross-platform integration tests

## Changelog

- **2025-11-28**: Removed dotenv, fixed stdio transport for MCP Inspector
- **2025-11-28**: Created cross-platform compatibility documentation
