# MCP Registry Publishing

The repository publishes **two** entries to the official MCP Registry, one per server command —
a different tool list is a different server:

| Metadata file | Registry name | npm package (stdio) | Command |
|---|---|---|---|
| `server.json` | `io.github.fr0ster/mcp-abap-adt` | `@mcp-abap-adt/core` (`server/`) | `mcp-abap-adt` |
| `server-compact.json` | `io.github.fr0ster/mcp-abap-adt-compact` | `@mcp-abap-adt/compact` (`compact/`) | `mcp-abap-adt-compact` |

Both files sit in the repository root and follow the schema their `$schema` names
(`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`).

## Required metadata

- **Versions.** Each file carries the version twice — the top-level `version` and
  `packages[0].version` — and both must name the version of that npm package **as published on
  npm**. Bump them with the package manifests on every release.
- **`description`** — at most 100 characters (`maxLength: 100` on `ServerDetail.description` in
  the schema).
- **`mcpName`** in the manifest of the package the file points at, equal to the file's `name`:
  - `server/package.json` (`@mcp-abap-adt/core`): `"mcpName": "io.github.fr0ster/mcp-abap-adt"`.
    Not the root `package.json`: that is `@mcp-abap-adt/lib`, which the registry never reads.
  - `compact/package.json` (`@mcp-abap-adt/compact`):
    `"mcpName": "io.github.fr0ster/mcp-abap-adt-compact"`.

The registry reads `mcpName` from the package **published on npm**, so it can only be checked in
the tarball:

```bash
tar -xOf <package>.tgz package/package.json | grep mcpName
```

## Prerequisites

- `mcp-publisher` installed (see the registry's documentation).
- The npm packages at the versions the two files name are already on npm (`npm run
  release:publish`, see [RELEASE.md](./RELEASE.md)). **`npm publish` comes first**, the registry
  second.

## Publish

```bash
mcp-publisher validate server.json            # schema check only; it does not look at npm
mcp-publisher validate server-compact.json
mcp-publisher login github
mcp-publisher publish server.json
mcp-publisher publish server-compact.json
```

`mcp-publisher publish` without an argument reads `./server.json` only.

## Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.fr0ster/mcp-abap-adt"
```

## Notes

- If publish fails with "missing mcpName", the published package lacks `mcpName`: add it to that
  package's manifest and publish a new npm version.
- `mcpName` stayed in the root manifest when the server moved to `server/` (10.x), so no published
  `core` from 10.0.1 to 16.0.0 carried it and the registry entry stopped at 8.8.1; 16.0.1 is the
  first `core` that can be published there again.
