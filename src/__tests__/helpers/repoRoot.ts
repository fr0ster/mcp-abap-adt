/**
 * The repository root, for a test that runs from its source (Jest) or from
 * the node:test build (`.test-build/`), where a compiled file lives one
 * directory deeper than its source (D27). It is the nearest directory from
 * `start` up that holds the package-name table, never a count of `..` from
 * `__dirname`.
 */
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { NAME_TABLE } from './nameTable';

/** The nearest directory from `start` up that holds the name table. */
export function repositoryRoot(start: string): string {
  let dir = start;
  while (!existsSync(path.join(dir, NAME_TABLE))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`no ${NAME_TABLE} above ${start}`);
    }
    dir = parent;
  }
  return dir;
}
