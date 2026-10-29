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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const CONTRACT = join(__dirname, '..', '..', 'lib', 'adtClientContract.ts');

function importsOf(file: string): string[] {
  const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
  return info.importedFiles.map((imported) => imported.fileName);
}

describe('the server client contract', () => {
  it('imports from @mcp-abap-adt/interfaces-adt only', () => {
    const imports = importsOf(CONTRACT);
    expect(imports.length).toBeGreaterThan(0);
    expect(
      imports.filter((name) => name !== '@mcp-abap-adt/interfaces-adt'),
    ).toEqual([]);
  });
});
