/**
 * `@mcp-abap-adt/lib` — the ADT tool library, Apache-2.0.
 *
 * Handlers, their registries and the embeddable MCP server. The standalone
 * server is `@mcp-abap-adt/core`, a separate package under AGPL-3.0-only.
 *
 * This barrel exists because `main` pointed at a `dist/index.js` that was never
 * built: `require('@mcp-abap-adt/core')` had been failing for anyone who tried
 * the package's own root entry. The subpath exports are the documented way in,
 * and they keep working.
 */
export * from './embeddable/index.js';
export * from './lib/handlers/index.js';
