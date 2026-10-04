# MCP Registry Publishing

This project is published in the official MCP Registry.

## Prerequisites
- Install `mcp-publisher` (see official docs).
- Ensure `@mcp-abap-adt/core` at the version `server.json` names is already on npm: the registry
  reads `mcpName` from the published package, so `npm publish` comes first.

## Required Metadata

- `server.json` in the repository root
- `mcpName` in `server/package.json` — the manifest of `@mcp-abap-adt/core`, the package
  `server.json` points at. Not in the root `package.json`: that is `@mcp-abap-adt/lib`, which the
  registry never reads.

Expected values:
- Registry name: `io.github.fr0ster/mcp-abap-adt`
- npm package: `@mcp-abap-adt/core` (stdio)

## Publish

```bash
mcp-publisher validate      # schema check only; it does not look at npm
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
- `mcpName` stayed in the root manifest when the server moved to `server/` (10.x), so no published
  `core` from 10.0.1 to 16.0.0 carried it and the registry stopped at 8.8.1; 16.0.1 is the first
  version that can be published there again.
