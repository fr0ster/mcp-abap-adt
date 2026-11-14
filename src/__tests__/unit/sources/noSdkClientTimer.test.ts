/**
 * No MCP SDK `Client` on a live path. The SDK's `Client` arms a request
 * timer on every call (60 s by default) and rejects the call when it fires:
 * a live step that waits on SAP — a debugger listen for its debuggee on the
 * cloud — was cut there (`MCP error -32001: Request timed out`). A live
 * test has no bound (`noLiveBounds.test.ts`), so the live sources, and the
 * in-process server they call tools through (`helpers/pinServer.ts`), speak
 * MCP through `McpSession` (`testers/hardMode.ts`), which arms no timer.
 *
 * The sources are parsed with TypeScript: a `new X(…)` counts when `X` is
 * imported from the SDK's client module.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as ts from 'typescript';
import { repositoryRoot } from '../../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);
const LIVE_ROOTS = ['src/__tests__/integration', 'src/__tests__/admin'];
const LIVE_HELPERS = ['src/__tests__/helpers/pinServer.ts'];
const SDK_CLIENT = '@modelcontextprotocol/sdk/client/index.js';

/** Every `.ts` file under `root`, relative to the repository, `/`-separated. */
function sourcesUnder(root: string): string[] {
  return fs
    .readdirSync(path.join(REPO, root), {
      withFileTypes: true,
      recursive: true,
    })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) =>
      path
        .relative(REPO, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    );
}

/** The `file:line` of each SDK `Client` constructed in `text`. */
function sdkClientsIn(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imported = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== SDK_CLIENT
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === 'Client') {
          imported.add(element.name.text);
        }
      }
    }
  }
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      imported.has(node.expression.text)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${file}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('no MCP SDK Client on a live path', () => {
  it('the scan finds a Client constructed from the SDK, under an alias too', () => {
    const text = [
      `import { Client as Sdk } from '${SDK_CLIENT}';`,
      `const a = new Sdk({ name: 'x', version: '1' });`,
    ].join('\n');
    assert.deepEqual(sdkClientsIn('fixture.ts', text), ['fixture.ts:2']);
    assert.deepEqual(
      sdkClientsIn('other.ts', 'class Client {}\nconst b = new Client();'),
      [],
    );
  });

  it('the live sources and the in-process server construct none', () => {
    const files = [...LIVE_ROOTS.flatMap(sourcesUnder), ...LIVE_HELPERS];
    const found = files.flatMap((file) =>
      sdkClientsIn(file, fs.readFileSync(path.join(REPO, file), 'utf8')),
    );
    assert.deepEqual(found, []);
  });
});
