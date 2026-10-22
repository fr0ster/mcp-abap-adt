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
npx @modelcontextprotocol/inspector mcp-abap-adt --mcp=TRIAL --system-type=cloud   # stdio, in the MCP Inspector
```

The MCP Inspector is not a dependency of this repository: the command above fetches and runs it
from npm on your own machine, outside the checkout and its install policy.

Destinations, service keys and the browser login are served only by `mcp-abap-adt` (stdio);
`mcp-abap-adt-http` / `mcp-abap-adt-sse` take credentials from `x-sap-*` headers and answer a
request carrying `x-mcp-destination` with `400`.

### 3. Test via MCP Inspector or client:

The server connects at its start, before the MCP transport opens: with no valid session the browser login opens then, and the Inspector lists the tools once it is done. Call any tool.

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
# SAP_ISSUED_FOR=...   (the binding auth-stores 5 requires beside a token;
# SAP_ISSUED_BY=...     write sessions with mcp-auth or the server, never by hand)
# SAP_UAA_URL=...
# SAP_UAA_CLIENT_ID=...
# SAP_UAA_CLIENT_SECRET=...
```

## Alternative: A Directory of Your Own

To keep the stores elsewhere, name the base directory (it holds `service-keys/` and `sessions/`):

```bash
mkdir -p ~/prj/tmp/service-keys
# put TRIAL.json in ~/prj/tmp/service-keys/
mcp-abap-adt --mcp=TRIAL --auth-broker-path=~/prj/tmp/ --system-type=cloud
```

## Debug Mode:

To enable debug logs for auth-broker:

```bash
DEBUG_AUTH_LOG=true mcp-abap-adt --mcp=TRIAL --system-type=cloud
```

## Test Logging Switches

- `TEST_LOG_LEVEL=error|warn|info|debug` — sets verbosity for integration tests (DEBUG_TESTS/DEBUG_ADT_TESTS/DEBUG_CONNECTORS imply `debug`).
- `TEST_LOG_FILE=/tmp/adt-tests.log` — optional file sink for test logs (best-effort).
- `TEST_LOG_SILENT=true` — disable test logging pipeline entirely.
- `TEST_LOG_COLOR=true` — enable colored/prefixed tags in stdout.

## Live measurements of 19.0.0 (2026-10-15)

Run against an on-premise system (BASIS 816) and an SAP BTP ABAP trial system, with the release's own packages packed
from the branch and installed outside the repository. Linux, Node.js 26.7.0, unless stated; SNC on Windows.

| What | How | Result |
|---|---|---|
| stdio, trial, a session file | `--env=<name>` (resolves `sessions/<name>.env`), `--system-type=cloud`, `--browser=none` | Started without a login; a read answered; a second start reused the session file unchanged. |
| stdio, trial, a browser login | `--mcp=<name>`, `--system-type=cloud`, `--browser=system` | Logged in (the browser's SSO session answered at once); 236 tools; a read answered; port 61001 free after exit. |
| Renewal | a copy of the session file with the access token's signature broken | The system refused, the provider renewed with the refresh token, the read answered, the new token and expiry written back (the refresh token unchanged). A copy whose `SAP_EXPIRES_AT` lay in the past with a still valid token was not renewed: the expiry is the token's own. |
| stdio, on premise, basic over HTTP | `--env-path=<file>`, `--system-type=onprem` | The connector was born at the start; a read answered; with `SAP_RESPONSIBLE` / `SAP_MASTER_SYSTEM` removed from the file, `systeminformation` filled both. |
| stdio, on premise, basic over RFC | `SAP_CONNECTION_TYPE=rfc`, the gateway port forwarded | 251 tools; `GetClass` answered. |
| stdio, on premise, SNC over RFC (Windows) | Secure Login Client, no password and no `SAP_RESPONSIBLE` in the `.env` | 251 tools; `GetClass` answered. |
| `mcp-abap-adt-http`, `mcp-abap-adt-compact-http` | `x-sap-*` headers: basic on premise, a token on the trial | A read answered on both. |
| `mcp-abap-adt-sse`, `mcp-abap-adt-compact-sse` | the same headers on the opening `GET` | A read answered on both. |
| A logoff releases the locks | compact `HandlerLock`, then a stdio shutdown (SIGTERM) and, separately, an SSE stream close | Before: another session's lock refused `403`. After: a fresh connection took the lock about 0.8–0.9 s later (the logoff is written at once; the system releases the lock when it has processed it). |
| A long read's `timeout` | `HandlerWhereUsed`, `timeout=1`, a lock held across it | Answered `timed_out` after 1.14 s; the instance answered the next read and the held lock unlocked with its handle. |
| The stdio start takes up its leftover session | a lock taken, the process killed with SIGKILL, a new start | The one leftover file was taken up; the old lock handle unlocked. With the leftover logged off first, the start logged on anew. |
| The enhancement reads (adt-clients 32) | on premise: `GetEnhancements` on a function group's include, the function group, a class; `GetEnhancementSpot` on a BAdI spot and a plain spot; `GetEnhancementImpl` on a source plug-in and a BAdI implementation. Trial: `GetEnhancementSpot` on a BAdI spot | The include's one source plug-in returned with its source, its context taken from the function group; the function group and the class: none. The BAdI spot's definitions read on both systems; the plain spot refused as not served through ADT; the source plug-in's source read; the BAdI implementation refused before any request (it has no source). No source plug-in exists on the trial, so a cloud host's elements were not read with data. |
| A shutdown during the start's browser login | SIGTERM while the login waited | Found hanging (the login held the connection's `connect()` the logoff queued behind) and fixed: `the authorization was aborted`, the start failed, exit `1`, port 61001 free. |
