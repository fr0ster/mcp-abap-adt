import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `@mcp-abap-adt/sse`'s own version, read from its own manifest: the version
 * the transport reports in `serverInfo` and on `/health` when its caller
 * passes none.
 *
 * One step up from this file is `sse/` in a checkout (`src/` under test,
 * `dist/` when built) and the package root when installed — in every layout it
 * is this package's `package.json`.
 */
const manifest: { name: string; version: string } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);

export const SSE_VERSION: string = manifest.version;

/** `@mcp-abap-adt/sse`'s own package name, from the same manifest: what a second copy of lib asks to reinstall. */
export const SSE_PACKAGE: string = manifest.name;
