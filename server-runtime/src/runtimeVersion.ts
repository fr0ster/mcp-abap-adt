import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `@mcp-abap-adt/server-runtime`'s own version, read from its own manifest, as
 * `coreVersion.ts` reads core's.
 *
 * One step up from this file is `server-runtime/` in a checkout (`src/` under
 * test, `dist/` when built) and the package root when installed — in every
 * layout it is the runtime's `package.json`.
 *
 * It is only the servers' default when no version is given: every binary passes
 * its own version through `main`, so `--version` and `serverInfo.version` stay
 * the binary's.
 */
export const RUNTIME_VERSION: string = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
).version;
