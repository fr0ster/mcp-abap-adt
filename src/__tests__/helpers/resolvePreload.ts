/**
 * The preload of the node:test runner (D27): registers the resolve hook
 * (`resolveHook.ts`) in the process it is loaded into, so a compiled test
 * importing a sibling package by name gets its compiled file in the test
 * build, and every other name is Node's own.
 *
 * Loaded from the test build, it finds the repository root through
 * `repoRoot.ts`, never by the depth of its own directory; the build
 * directory is `.test-build/tree/` there.
 */
import { registerHooks } from 'node:module';
import * as path from 'node:path';
import { readNameTable } from './nameTable';
import { repositoryRoot } from './repoRoot';
import { tableResolve } from './resolveHook';

const root = repositoryRoot(__dirname);
registerHooks({
  resolve: tableResolve(
    readNameTable(root),
    path.join(root, '.test-build', 'tree'),
  ),
});
