# MCP Registry Publishing

This project is published in the official MCP Registry.

## Prerequisites
- Install `mcp-publisher` (see official docs).
- Ensure the npm package is published and contains `mcpName` in `package.json`.

## Required Metadata

- `server.json` in the repository root
- `mcpName` in `package.json`

Expected values:
- Registry name: `io.github.fr0ster/mcp-abap-adt`
- npm package: `@mcp-abap-adt/core` (stdio)

## Publish

```bash
mcp-publisher login github
mcp-publisher publish
```

## Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.fr0ster/mcp-abap-adt"
```

## Notes

- Keep `server.json` version in sync with the npm package version.
- If publish fails with “missing mcpName”, publish a new npm version that includes `mcpName`.
