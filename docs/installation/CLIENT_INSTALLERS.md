# Client Auto-Configure

This helper writes MCP configuration entries for popular clients.

## Install

```bash
npm install -g @mcp-abap-adt/core
```

## Usage

```bash
mcp-abap-adt-configure --client cline --env /path/to/.env --name abap
mcp-abap-adt-configure --client cline --mcp TRIAL --name abap
mcp-abap-adt-configure --client cline --env /path/to/.env --name abap --transport stdio
mcp-abap-adt-configure --client claude --mcp TRIAL --name abap --project /home/user/prj/myproj
mcp-abap-adt-configure --client codex --name abap --remove
mcp-abap-adt-configure --client cline --name direct-jwt-test-001 --transport http --url http://localhost:4004/mcp/stream/http --header x-sap-url=https://... --header x-sap-client=210 --header x-sap-auth-type=jwt --header x-sap-jwt-token=...
mcp-abap-adt-configure --client cline --name local-mcp-sse --transport sse --url http://localhost:3001/sse
mcp-abap-adt-configure --client codex --name abap-http --transport http --url http://localhost:3000/mcp/stream/http
mcp-abap-adt-configure --client codex --name abap-http --transport http --url http://localhost:3000/mcp/stream/http --header x-mcp-destination=trial
mcp-abap-adt-configure --client opencode --name abap --transport http --url http://localhost:3000/mcp/stream/http
```

## Common Tasks

Add MCP:
```bash
mcp-abap-adt-configure --client codex --mcp TRIAL --name abap
mcp-abap-adt-configure --client cline --env /path/to/.env --name abap
mcp-abap-adt-configure --client claude --mcp TRIAL --name abap --project /home/user/prj/myproj
```

Disable MCP:
```bash
mcp-abap-adt-configure --client codex --name abap --disable
mcp-abap-adt-configure --client cline --name abap --disable
```

Enable MCP:
```bash
mcp-abap-adt-configure --client codex --name abap --enable
mcp-abap-adt-configure --client cline --name abap --enable
```

Remove MCP:
```bash
mcp-abap-adt-configure --client codex --name abap --remove
mcp-abap-adt-configure --client cline --name abap --remove
mcp-abap-adt-configure --client claude --name abap --project /home/user/prj/myproj --remove
```

Options:
- `--client <name>` (repeatable): `cline`, `codex`, `claude`, `goose`, `cursor`, `windsurf`, `opencode`
- `--env <path>`: use a specific `.env` file
- `--mcp <destination>`: use service key destination
- `--name <serverName>`: MCP server name (required)
- `--transport <type>`: `stdio`, `sse`, or `http` (`http` maps to `streamableHttp`)
- `--command <bin>`: command to run (default: `mcp-abap-adt`)
- `--project <path>`: project path for Claude/OpenCode (defaults to current directory). If the path is a symlink, the configurator matches existing Claude project entries by real path.
- `--config <path>`: override client config path (Claude Desktop or custom; OpenCode uses it as `opencode.json` path)
- `--url <http(s)://...>`: required for `sse` and `http`
- `--header key=value`: add request header (repeatable)
- `--timeout <seconds>`: timeout value for client entries (default: 60)
- `--disable`: disable server entry (Codex/OpenCode: `enabled = false`, Cline/Windsurf: `disabled = true`, Claude: moves name to `disabledMcpServers`)
- `--enable`: enable server entry (Codex/OpenCode: `enabled = true`, Cline/Windsurf: `disabled = false`, Claude: moves name to `enabledMcpServers`)
- `--remove`: remove server entry from client config

Notes:
- `--disable` and `--remove` do not require `--env` or `--mcp`.
- `--env`/`--mcp` are only valid for `stdio` transport. For `sse/http`, use `--url` and optional `--header`.
- Cursor ignores enable/disable via `mcp.json`; use `--remove` instead.
- Claude stores enable/disable state under `enabledMcpServers` and `disabledMcpServers` for each project.
- New entries for Cline, Codex, Windsurf, Goose, Claude, and OpenCode are added **disabled by default**. Use `--enable` to turn them on.
- Windsurf follows `disabled` like Cline. The configurator sets `disabled = true` for default-disabled entries.
- `--enable`/`--disable` only work if the server entry already exists. Use add commands with `--env` or `--mcp` first.
- Non-stdio transports are supported for Cline/Cursor/Windsurf/Claude/Goose. Codex supports `http` (streamable HTTP) but not `sse`.
- Codex writes custom headers under `http_headers` in `~/.codex/config.toml`.
- Codex HTTP entries include `startup_timeout_sec` (default: 60).
- `--dry-run`: print changes without writing files
- `--force`: overwrite existing server entry if it exists

## Config Locations

Paths are client-specific and OS-dependent. The installer writes config files in:

- **Cline**:
  - Linux/macOS: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
  - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- **Codex**:
  - Linux/macOS: `~/.codex/config.toml`
  - Windows: `%USERPROFILE%\.codex\config.toml`
- **Claude Code (CLI)**:
  - Linux default: `~/.claude.json` (per-project entries under `projects.<path>.mcpServers`)
  - Use `--config` to target a specific file (e.g. `.mcp.json`)
- **Claude Desktop**:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- **Goose**:
  - Linux/macOS: `~/.config/goose/config.yaml`
  - Windows: `%APPDATA%\Block\goose\config\config.yaml`
- **Cursor**:
  - Linux/macOS: `~/.cursor/mcp.json`
  - Windows: `%USERPROFILE%\.cursor\mcp.json`
- **Windsurf**:
  - Linux/macOS: `~/.codeium/windsurf/mcp_config.json`
  - Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`
- **OpenCode**:
  - Project: `./opencode.json` (uses `mcp.<name>` entries with `enabled: true|false`)
