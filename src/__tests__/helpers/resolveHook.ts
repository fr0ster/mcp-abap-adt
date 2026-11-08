/**
 * The resolve hook of the node:test build (D27): answers exactly the names of
 * the package-name table (`nameTable.ts`) with their compiled files in the
 * test build, and hands every other specifier to Node's own resolution.
 *
 * A table target is a source path from the repository root (`./src/index.ts`);
 * its compiled file is the same path under the build directory, `.js` for
 * `.ts` (`<build>/src/index.js`). Registered by `resolvePreload.ts`, which the
 * runner preloads in every file's process.
 */
import type { ResolveHookSync } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

/** `./src/index.ts` → `<buildDir>/src/index.js`. */
function compiledFile(buildDir: string, target: string): string {
  if (!target.startsWith('./') || !target.endsWith('.ts')) {
    throw new Error(`not a ./….ts source entry: ${target}`);
  }
  const source = target.slice('./'.length, -'.ts'.length);
  return path.join(buildDir, `${source}.js`);
}

/** The hook over `table`, with the compiled files under `buildDir`. */
export function tableResolve(
  table: ReadonlyMap<string, string>,
  buildDir: string,
): ResolveHookSync {
  const compiled = new Map<string, string>();
  for (const [name, target] of table) {
    compiled.set(name, pathToFileURL(compiledFile(buildDir, target)).href);
  }
  return (specifier, context, nextResolve) => {
    const url = compiled.get(specifier);
    if (url === undefined) return nextResolve(specifier, context);
    return { url, shortCircuit: true };
  };
}
