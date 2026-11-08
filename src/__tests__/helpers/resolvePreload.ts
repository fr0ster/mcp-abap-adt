/**
 * The preload of the node:test runner (D27): registers the resolve hook
 * (`resolveHook.ts`) in the process it is loaded into, so a compiled test
 * importing a sibling package by name gets its compiled file in the test
 * build, and every other name is Node's own.
 *
 * Loaded from the test build, it finds the repository root as the nearest
 * directory above it that holds the package-name table, never by the depth
 * of its own directory; the build directory is `.test-build/` there.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as path from 'node:path';
import { NAME_TABLE, readNameTable } from './nameTable';
import { tableResolve } from './resolveHook';

/** The nearest directory from `start` up that holds the name table. */
function repositoryRoot(start: string): string {
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

const root = repositoryRoot(__dirname);
registerHooks({
  resolve: tableResolve(readNameTable(root), path.join(root, '.test-build')),
});
