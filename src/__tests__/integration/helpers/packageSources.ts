/**
 * Resolves this repository's own package names (`@mcp-abap-adt/lib/auth`,
 * `@mcp-abap-adt/core/auth`, …) to their sources while Jest loads
 * `globalSetup`, and a source's relative `./x.js` import to its `./x.ts`, as
 * the mapper's own rule does.
 *
 * Jest loads `globalSetup` outside the test runtime, where `moduleNameMapper`
 * does not apply: an import of a sibling package by name reaches Node's own
 * resolution, and a checkout has no such package installed. This reads the
 * root manifest's mapper and answers its exact package names only, so the two
 * cannot drift. Imported first, for its effect, before anything that imports
 * a sibling by name; `globalSetup` restores Node's own resolution when it ends
 * (`restoreResolution`), so the hook lives no longer than the setup.
 */
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const ROOT_DIR = '<rootDir>';

/** `^@mcp-abap-adt/lib/auth$` → `@mcp-abap-adt/lib/auth`; anything else is not an exact name. */
function exactName(key: string): string | undefined {
  if (!key.startsWith('^@mcp-abap-adt/') || !key.endsWith('$')) {
    return undefined;
  }
  return key.slice(1, -1);
}

const mapper: Record<string, string> = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).jest.moduleNameMapper;

const sources = new Map<string, string>();
for (const [key, target] of Object.entries(mapper)) {
  const name = exactName(key);
  if (name === undefined || !target.startsWith(ROOT_DIR)) continue;
  sources.set(name, path.join(ROOT, target.slice(ROOT_DIR.length)));
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
