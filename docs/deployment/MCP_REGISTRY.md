# MCP Registry Publishing

The repository publishes **twelve** entries to the official MCP Registry, one per server package —
a different tool list or transport is a different server:

| Metadata file | Registry name | npm package | Command | Transport |
|---|---|---|---|---|
| `server.json` | `io.github.fr0ster/mcp-abap-adt` | `@mcp-abap-adt/core` (`server/`) | `mcp-abap-adt` | `stdio` |
| `server-compact.json` | `io.github.fr0ster/mcp-abap-adt-compact` | `@mcp-abap-adt/compact` (`compact/`) | `mcp-abap-adt-compact` | `stdio` |
| `server-ro.json` | `io.github.fr0ster/mcp-abap-adt-ro` | `@mcp-abap-adt/core-ro` (`core-ro/`) | `mcp-abap-adt-ro` | `stdio` |
| `server-compact-ro.json` | `io.github.fr0ster/mcp-abap-adt-compact-ro` | `@mcp-abap-adt/compact-ro` (`compact-ro/`) | `mcp-abap-adt-compact-ro` | `stdio` |
| `server-http.json` | `io.github.fr0ster/mcp-abap-adt-http` | `@mcp-abap-adt/http` (`http/`) | `mcp-abap-adt-http` | `streamable-http` |
| `server-compact-http.json` | `io.github.fr0ster/mcp-abap-adt-compact-http` | `@mcp-abap-adt/compact-http` (`compact-http/`) | `mcp-abap-adt-compact-http` | `streamable-http` |
| `server-http-ro.json` | `io.github.fr0ster/mcp-abap-adt-http-ro` | `@mcp-abap-adt/http-ro` (`http-ro/`) | `mcp-abap-adt-http-ro` | `streamable-http` |
| `server-compact-http-ro.json` | `io.github.fr0ster/mcp-abap-adt-compact-http-ro` | `@mcp-abap-adt/compact-http-ro` (`compact-http-ro/`) | `mcp-abap-adt-compact-http-ro` | `streamable-http` |
| `server-sse.json` | `io.github.fr0ster/mcp-abap-adt-sse` | `@mcp-abap-adt/sse` (`sse/`) | `mcp-abap-adt-sse` | `sse` |
| `server-compact-sse.json` | `io.github.fr0ster/mcp-abap-adt-compact-sse` | `@mcp-abap-adt/compact-sse` (`compact-sse/`) | `mcp-abap-adt-compact-sse` | `sse` |
| `server-sse-ro.json` | `io.github.fr0ster/mcp-abap-adt-sse-ro` | `@mcp-abap-adt/sse-ro` (`sse-ro/`) | `mcp-abap-adt-sse-ro` | `sse` |
| `server-compact-sse-ro.json` | `io.github.fr0ster/mcp-abap-adt-compact-sse-ro` | `@mcp-abap-adt/compact-sse-ro` (`compact-sse-ro/`) | `mcp-abap-adt-compact-sse-ro` | `sse` |

The files sit in the repository root and follow the schema their `$schema` names
(`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`).

## Transports

- **stdio** (`core`, `compact`, `core-ro`, `compact-ro`): the client starts the command; the entry
  lists the environment (`MCP_ENV_PATH`, `AUTH_BROKER_PATH`, `SAP_SYSTEM_TYPE`, …) and `--mcp`.
- **`streamable-http`** (`http`, `compact-http`, `http-ro`, `compact-http-ro`): the client starts
  the command and connects to `http://localhost:{MCP_HTTP_PORT}/mcp/stream/http`; `MCP_HTTP_PORT`
  (default `3000`) and `MCP_HTTP_HOST` are package environment variables.
- **`sse`** (`sse`, `compact-sse`, `sse-ro`, `compact-sse-ro`): the same at
  `http://localhost:{MCP_SSE_PORT}/sse`, `MCP_SSE_PORT` defaulting to `3001`.

A Streamable HTTP or SSE entry declares the transport's `headers` — `x-sap-url` (required),
`x-sap-client`, `x-sap-login`, `x-sap-password` and `x-sap-jwt-token` (the last two secret): the
listener takes its credentials only from them. Every entry declares `SAP_SYSTEM_TYPE` as required,
with no default.

## Required metadata

- **Versions.** Each file carries the version twice — the top-level `version` and
  `packages[0].version` — and both must name the version of that npm package **as published on
  npm** (the packages need not share one version). Bump them with the package manifests on every
  release.
- **`description`** — at most 100 characters (`maxLength: 100` on `ServerDetail.description` in
  the schema).
- **`mcpName`** in the manifest of the package the file points at, equal to the file's `name`,
  which is `io.github.fr0ster/<command>`. `server/package.json` (`@mcp-abap-adt/core`) carries
  `"mcpName": "io.github.fr0ster/mcp-abap-adt"` — not the root `package.json`: that is
  `@mcp-abap-adt/lib`, which the registry never reads.

`src/__tests__/unit/releaseMetadata.test.ts` checks all of it: one entry per server package and no
other, each `name` equal to its package's `mcpName` and its command, the versions, the transport
and its URL, the required `SAP_SYSTEM_TYPE`, the description's length.

The registry reads `mcpName` from the package **published on npm**, so it can only be checked in
the tarball:

```bash
tar -xOf <package>.tgz package/package.json | grep mcpName
```

## Prerequisites

- `mcp-publisher` installed (see the registry's documentation).
- The npm packages at the versions the twelve files name are already on npm (`npm run
  release:publish`, see [RELEASE.md](./RELEASE.md)). **`npm publish` comes first**, the registry
  second.

## Publish

```bash
for entry in server.json server-compact.json server-ro.json server-compact-ro.json \
  server-http.json server-compact-http.json server-http-ro.json server-compact-http-ro.json \
  server-sse.json server-compact-sse.json server-sse-ro.json server-compact-sse-ro.json; do
  mcp-publisher validate "$entry"   # schema check only; it does not look at npm
done
mcp-publisher login github
for entry in server.json server-compact.json server-ro.json server-compact-ro.json \
  server-http.json server-compact-http.json server-http-ro.json server-compact-http-ro.json \
  server-sse.json server-compact-sse.json server-sse-ro.json server-compact-sse-ro.json; do
  mcp-publisher publish "$entry"
done
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
