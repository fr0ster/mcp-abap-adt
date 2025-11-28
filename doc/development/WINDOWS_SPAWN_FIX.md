# Windows Cross-Platform Spawn Fix

## Problem Analysis

### Error
```
Error: spawn EINVAL
    at ChildProcess.spawn (node:internal/child_process:420:11)
    at spawn (node:child_process:753:9)
    at spawnInspector (C:\Users\...\tools\dev-http.js:104:17)
```

### Root Cause

On Windows, when using `spawn()` to execute `.cmd` files (like `npx.cmd`), the `shell: true` option is required. Without it, Windows cannot properly interpret the `.cmd` file, resulting in `EINVAL` error.

**Key Issues:**
1. `npx.cmd` on Windows requires `shell: true` for `spawn()`
2. Missing `cwd` option in `spawnServer` in `dev-sse.js` (inconsistency with `dev-http.js`)
3. Missing error handling for `spawnInspector` in both files
4. Missing `cwd` option in `spawnInspector` calls

### Why It Works on Mac/Linux

On Unix-like systems (Mac, Linux), `npx` is a shell script that can be executed directly without shell wrapper. Windows uses `.cmd` batch files which require shell interpretation.

## Solution

### Changes Made

1. **`tools/dev-http.js`**:
   - Added `shell: true` for Windows in `spawnInspector()`
   - Added `cwd: process.cwd()` to `spawnInspector()` options
   - Added error handling for `spawnInspector()` with detailed error messages

2. **`tools/dev-sse.js`**:
   - Added `shell: true` for Windows in `spawnInspector()`
   - Added `cwd: process.cwd()` to `spawnInspector()` options
   - Added error handling for `spawnInspector()` with detailed error messages
   - Added `cwd: process.cwd()` and `shell: false` to `spawnServer()` for consistency
   - Added error handling for `spawnServer()` with detailed error messages

### Code Pattern

```javascript
function spawnInspector(port) {
  const inspectorCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = [
    '@modelcontextprotocol/inspector',
    '--transport',
    'http',
    '--server-url',
    `http://localhost:${port}`,
  ];

  // On Windows, .cmd files require shell: true for proper execution
  const spawnOptions = {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
    ...(process.platform === 'win32' ? { shell: true } : {}),
  };

  const child = spawn(inspectorCmd, args, spawnOptions);

  // Handle spawn errors (especially important on Windows)
  child.on('error', (error) => {
    process.stderr.write(`[dev-http] ✗ Failed to spawn inspector: ${error.message}\n`);
    if (error.code === 'EINVAL') {
      process.stderr.write(`[dev-http] EINVAL error - check npx installation and PATH\n`);
      process.stderr.write(`[dev-http] Inspector command: ${inspectorCmd}\n`);
    }
  });

  // ... rest of the code
}
```

## Testing

### Test Commands

1. **HTTP mode**:
```bash
npm run dev:http -- --env .\mdd.env
```

2. **SSE mode**:
```bash
npm run dev:sse -- --env .\mdd.env
```

### Expected Results

- ✅ Server spawns successfully on Windows
- ✅ Inspector spawns successfully on Windows
- ✅ No `EINVAL` errors
- ✅ Proper error messages if npx is not found
- ✅ Works on Mac/Linux (backward compatible)

## Platform-Specific Behavior

### Windows
- Uses `npx.cmd` with `shell: true`
- Requires explicit `cwd` option
- More detailed error handling for debugging

### Mac/Linux
- Uses `npx` without shell wrapper
- Works with or without `shell: true`
- Standard error handling

## Related Issues

This fix addresses cross-platform compatibility issues that were causing:
- `spawn EINVAL` errors on Windows
- Inconsistent behavior between `dev-http.js` and `dev-sse.js`
- Missing error handling for inspector spawn failures

## Future Improvements

1. ✅ Fixed Windows spawn issues - **Done**
2. ⏳ Add Windows CI/CD tests
3. ⏳ Consider using `cross-spawn` package for better cross-platform support
4. ⏳ Add integration tests for all transport modes on Windows

## Changelog

- **2025-01-XX**: Fixed `spawn EINVAL` error on Windows for `dev-http.js` and `dev-sse.js`
- **2025-01-XX**: Added proper error handling and `cwd` options for cross-platform compatibility

