import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const SRC = path.resolve(__dirname, '../..');

// The single permitted home of the `McpError` identifier: the compatibility
// re-export in this file, and only in an `export` declaration.
const COMPAT_REEXPORT_FILE = path.resolve(SRC, 'lib/utils.ts');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** True when the identifier lives inside an `export { … } from …` declaration. */
function inExportDeclaration(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isExportDeclaration(current)) return true;
    current = current.parent;
  }
  return false;
}

describe('McpError is confined to the compat re-export in src (#155)', () => {
  it('McpError appears in src only in the utils.ts re-export — no imports, no uses', () => {
    // Rationale: permitting the identifier in *any* import/export declaration
    // reopens the aliasing hole — `import { McpError as E }` writes `McpError`
    // in an import specifier (permitted) while the dangerous use is spelled `E`
    // (invisible to a name check). By allowing it ONLY in the export declaration
    // of lib/utils.ts, every other occurrence — including any import, aliased or
    // not, in any production file — is an offence. To bind the SDK symbol you
    // must write `McpError` in an import specifier, which is now forbidden
    // everywhere but the one re-export. (Residual, shared with any name-based
    // check: a computed access like obj['Mcp'+'Error'] is not detected; none
    // exists, and catching it needs full type resolution.)
    const offenders: string[] = [];

    for (const file of tsFiles(SRC)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('McpError')) continue;

      const sf = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );

      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && node.text === 'McpError') {
          const permitted =
            file === COMPAT_REEXPORT_FILE && inExportDeclaration(node);
          if (!permitted) {
            const { line } = sf.getLineAndCharacterOfPosition(
              node.getStart(sf),
            );
            offenders.push(`${path.relative(SRC, file)}:${line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }

    expect(offenders).toEqual([]);
  });
});
