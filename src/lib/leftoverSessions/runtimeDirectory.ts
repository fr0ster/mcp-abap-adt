/**
 * Where a process keeps the files of the SAP sessions it holds:
 * `<config dir>/runtime` — the config dir the server resolves for its
 * `sessions/` and `service-keys/` (`server/src/config/platformPaths.ts`):
 * the given base (`--auth-broker-path`), else the first entry of
 * `AUTH_BROKER_PATH`, else `~/.config/mcp-abap-adt` on Unix and
 * `Documents\mcp-abap-adt` on Windows. Never the working directory.
 */

import * as os from 'node:os';
import * as path from 'node:path';

export const RUNTIME_SUBFOLDER = 'runtime';

export function runtimeDirectory(
  base?: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string {
  const isWindows = platform === 'win32';
  const stated =
    base ??
    (env.AUTH_BROKER_PATH ?? '')
      .split(isWindows ? ';' : /[:;]/)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
  const root =
    stated !== undefined
      ? path.resolve(stated)
      : isWindows
        ? path.join(home, 'Documents', 'mcp-abap-adt')
        : path.join(home, '.config', 'mcp-abap-adt');
  return path.join(root, RUNTIME_SUBFOLDER);
}
