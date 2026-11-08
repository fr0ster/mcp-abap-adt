/**
 * Resolves this repository's own package names (`@mcp-abap-adt/lib/auth`,
 * `@mcp-abap-adt/core/auth`, …) to their sources while Jest loads
 * `globalSetup`, and a source's relative `./x.js` import to its `./x.ts`, as
 * the mapper's own rule does.
 *
 * Jest loads `globalSetup` outside the test runtime, where `moduleNameMapper`
 * does not apply: an import of a sibling package by name reaches Node's own
 * resolution, and a checkout has no such package installed. This reads the
 * package-name table (`tsconfig.paths.json`, which the mapper is built from)
 * and answers its names only, so the two cannot drift. Imported first, for its
 * effect, before anything that imports a sibling by name; `globalSetup`
 * restores Node's own resolution when it ends (`restoreResolution`), so the
 * hook lives no longer than the setup.
 */
import Module from 'node:module';
import * as path from 'node:path';
import { readNameTable } from '../../helpers/nameTable';

const ROOT = path.resolve(__dirname, '../../../..');

const sources = new Map<string, string>();
for (const [name, target] of readNameTable(ROOT)) {
  sources.set(name, path.join(ROOT, target));
}

type Resolve = (request: string, ...rest: unknown[]) => string;
const loader = Module as unknown as { _resolveFilename: Resolve };
const original = loader._resolveFilename;
/** A relative import with a `.js` extension: the mapper's other rule. */
function isRelativeJs(request: string): boolean {
  return (
    (request.startsWith('./') || request.startsWith('../')) &&
    request.endsWith('.js')
  );
}

const resolveSibling: Resolve = function resolveSibling(
  this: unknown,
  request: string,
  ...rest: unknown[]
): string {
  const mapped = sources.get(request) ?? request;
  try {
    return original.call(this, mapped, ...rest);
  } catch (error) {
    // The mapper's `^(\\.{1,2}/.*)\\.js$` → `$1`: a source imports a sibling
    // TypeScript file by its compiled name.
    if (!isRelativeJs(mapped)) throw error;
    return original.call(this, mapped.slice(0, -'.js'.length), ...rest);
  }
};
loader._resolveFilename = resolveSibling;

/** Puts Node's own resolution back, unless something else replaced the hook since. */
export function restoreResolution(): void {
  if (loader._resolveFilename === resolveSibling) {
    loader._resolveFilename = original;
  }
}
