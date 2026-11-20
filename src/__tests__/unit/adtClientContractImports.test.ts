/**
 * The server's client contract is composed from the contract package alone
 * (#216): `src/lib/adtClientContract.ts` imports from
 * `@mcp-abap-adt/interfaces-adt` and from nothing else — never from
 * `@mcp-abap-adt/adt-clients`, the implementation the server takes and
 * assigns to it in `clients.ts`.
 *
 * The imports are read with TypeScript's own pre-processor, so an
 * `export … from`, a dynamic `import()` and a `require` count too.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { repositoryRoot } from '../helpers/repoRoot';

const CONTRACT = join(
  repositoryRoot(__dirname),
  'src',
  'lib',
  'adtClientContract.ts',
);

function importsOf(file: string): string[] {
  const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
  return info.importedFiles.map((imported) => imported.fileName);
}

describe('the server client contract', () => {
  it('imports from @mcp-abap-adt/interfaces-adt only', () => {
    const imports = importsOf(CONTRACT);
    assert.ok(imports.length > 0);
    assert.deepStrictEqual(
      imports.filter((name) => name !== '@mcp-abap-adt/interfaces-adt'),
      [],
    );
  });
});
