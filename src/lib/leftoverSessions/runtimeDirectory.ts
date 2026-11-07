/**
 * Where a process keeps the files of the SAP sessions it holds:
 * `<config dir>/runtime` — the config dir the server resolves for its
 * `sessions/` and `service-keys/` (`server-runtime/src/stdio/config/platformPaths.ts`):
 * the given base (`--auth-broker-path`), else the first entry of
 * `AUTH_BROKER_PATH`, else `~/.config/mcp-abap-adt` on Unix and
 * `Documents\mcp-abap-adt` on Windows. Never the working directory.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { splitOnAny } from '../plainText';

export const RUNTIME_SUBFOLDER = 'runtime';

export function runtimeDirectory(
  base?: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string {
  const isWindows = platform === 'win32';
  // The paths of the platform named, not the host's: the same answer for a
  // platform passed in as for the one this process runs on.
  const paths = isWindows ? path.win32 : path.posix;
  const stated =
    base ??
    splitOnAny(env.AUTH_BROKER_PATH ?? '', isWindows ? ';' : ':;')
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
  const root =
    stated !== undefined
      ? paths.resolve(stated)
      : isWindows
        ? paths.join(home, 'Documents', 'mcp-abap-adt')
        : paths.join(home, '.config', 'mcp-abap-adt');
  return paths.join(root, RUNTIME_SUBFOLDER);
}
