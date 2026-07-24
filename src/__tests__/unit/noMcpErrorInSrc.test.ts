import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const SRC = path.resolve(__dirname, '../..');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('McpError is absent from src (#155)', () => {
  it('no source file outside __tests__ references the identifier', () => {
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
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          offenders.push(`${path.relative(SRC, file)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }

    expect(offenders).toEqual([]);
  });
});
