/**
 * The package-name table (D27): `tsconfig.paths.json` at the repository root,
 * `compilerOptions.paths` alone — each of this repository's package names
 * (`@mcp-abap-adt/lib/auth`, `@mcp-abap-adt/core/auth`, …) and its source
 * entry, relative to the root (`./src/lib/auth/index.ts`).
 *
 * The one copy of that list: the type checker reads it through `extends`
 * (`tsconfig.test.json`), Jest's `moduleNameMapper` is built from it
 * (`jest.config.js`), and the node:test resolve hook answers its names
 * (`resolveHook.ts`). This reads it for the TypeScript side; the file is data
 * from outside the type system, so its shape is checked here.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

/** The table's file name, at the repository root. */
export const NAME_TABLE = 'tsconfig.paths.json';

function refused(why: string): Error {
  return new Error(`${NAME_TABLE}: ${why}`);
}

/**
 * Each name of the table and its one source entry, as written (`./…`), in
 * the table's order.
 */
export function readNameTable(repoRoot: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(
    readFileSync(path.join(repoRoot, NAME_TABLE), 'utf8'),
  );
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('compilerOptions' in parsed)
  ) {
    throw refused('no compilerOptions');
  }
  const options = parsed.compilerOptions;
  if (
    typeof options !== 'object' ||
    options === null ||
    !('paths' in options)
  ) {
    throw refused('no compilerOptions.paths');
  }
  const paths = options.paths;
  if (typeof paths !== 'object' || paths === null) {
    throw refused('compilerOptions.paths is not an object');
  }
  const table = new Map<string, string>();
  for (const [name, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length !== 1) {
      throw refused(`${name} does not name exactly one target`);
    }
    const [target] = targets;
    if (typeof target !== 'string' || !target.startsWith('./')) {
      throw refused(`${name}: its target is not a ./ path`);
    }
    table.set(name, target);
  }
  return table;
}
