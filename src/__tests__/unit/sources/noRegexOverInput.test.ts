/**
 * D26: no regular expression over untrusted input in the touched files —
 * `errorClassOf` (errors.ts), `return_error` (utils.ts), the destination name
 * (destinationName.ts) and the parameter parsers (authParameters.ts, the
 * config file reader, and each binary's table) are
 * plain code. A scan with the TypeScript parser: no regex literal, no
 * `RegExp` in each file, or — for utils.ts — in `return_error` and the
 * helpers it calls.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const REPO = path.resolve(__dirname, '../../../..');

/** A file, and the functions scanned in it (`undefined`: the whole file). */
const SCANNED: ReadonlyArray<[string, readonly string[] | undefined]> = [
  ['src/lib/auth/errors.ts', undefined],
  ['src/lib/auth/destinationName.ts', undefined],
  ['src/lib/config/authParameters.ts', undefined],
  ['src/lib/config/yamlConfig.ts', undefined],
  ['src/lib/config/binaries.ts', undefined],
  ['src/lib/config/startup.ts', undefined],
  ['server/src/config/coreParameters.ts', undefined],
  ['http/src/config/httpParameters.ts', undefined],
  ['sse/src/config/sseParameters.ts', undefined],
  [
    'src/lib/utils.ts',
    [
      'return_error',
      'hostAfterNotFound',
      'mcpErrorPrefixAt',
      'withoutMcpErrorPrefixes',
      'isSpace',
    ],
  ],
];

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(path.join(REPO, file), 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function regexesIn(root: ts.Node, source: ts.SourceFile): string[] {
  const found: string[] = [];
  walk(root, (node) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      found.push(`${source.fileName}:${line} ${node.getText()}`);
    }
    if (ts.isIdentifier(node) && node.text === 'RegExp') {
      found.push(`${source.fileName}:${line} RegExp`);
    }
  });
  return found;
}

describe('no regular expression over input in the touched files (D26)', () => {
  it.each(SCANNED.map(([file, fns]) => [file, fns] as const))(
    '%s',
    (file, functions) => {
      const source = parse(file);
      if (functions === undefined) {
        expect(regexesIn(source, source)).toEqual([]);
        return;
      }
      const seen = new Set<string>();
      for (const statement of source.statements) {
        if (
          ts.isFunctionDeclaration(statement) &&
          statement.name &&
          functions.includes(statement.name.text)
        ) {
          seen.add(statement.name.text);
          expect(regexesIn(statement, source)).toEqual([]);
        }
      }
      // Every named function is still there: a rename cannot empty the scan.
      expect([...seen].sort()).toEqual([...functions].sort());
    },
  );
});
