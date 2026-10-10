import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `@mcp-abap-adt/http`'s own version, read from its own manifest: the version
 * a transport reports in `serverInfo` and on `/health` when its caller passes
 * none.
 *
 * One step up from this file is `http/` in a checkout (`src/` under test,
 * `dist/` when built) and the package root when installed — in every layout it
 * is this package's `package.json`.
 */
export const HTTP_VERSION: string = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
).version;
