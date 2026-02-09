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
- `--client <name>` (repeatable): `cline`, `codex`, `claude`, `goose`, `cursor`, `windsurf`
- `--env <path>`: use a specific `.env` file
- `--mcp <destination>`: use service key destination
- `--name <serverName>`: MCP server name (required)
- `--transport <type>`: `stdio`, `sse`, or `http` (`http` maps to `streamableHttp`)
- `--command <bin>`: command to run (default: `mcp-abap-adt`)
- `--project <path>`: project path for Claude Desktop (defaults to current directory)
- `--config <path>`: override client config path (optional for Claude on Linux; default: `~/.claude.json`)
- `--url <http(s)://...>`: required for `sse` and `http`
- `--header key=value`: add request header (repeatable)
- `--timeout <seconds>`: request timeout for http/sse (default: 60)
- `--disable`: disable server entry (Codex: `enabled = false`, Cline: `disabled = true`)
- `--enable`: enable server entry (Codex: `enabled = true`, Cline: `disabled = false`)
- `--remove`: remove server entry from client config

Notes:
- `--disable` and `--remove` do not require `--env` or `--mcp`.
- `--env`/`--mcp` are only valid for `stdio` transport. For `sse/http`, use `--url` and optional `--header`.
- Cursor ignores enable/disable via `mcp.json`; use `--remove` instead.
- New entries for Cline, Codex, Windsurf, and Goose are added **disabled by default**. Use `--enable` to turn them on.
- `--enable`/`--disable` only work if the server entry already exists. Use add commands with `--env` or `--mcp` first.
- Non-stdio transports are supported for Cline/Cursor/Windsurf/Claude/Goose. Codex is stdio-only.
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
