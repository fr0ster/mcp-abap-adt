/**
 * No production source imports `timers` or `node:timers` (or their
 * `/promises` forms): `mock.timers` fakes what such an import returns, but
 * the fake-time helper counts only the globals it wraps
 * (`helpers/fakeTime.ts`, `getTimerCount`), so a production timer made
 * through an import would be faked and not counted. Measured: none today.
 *
 * Every production source of every root is read — the regex scan's
 * discovery (`productionSources()`: `src`, `scripts`, `tools` and each
 * package, outside `__tests__`, fixtures and docs) — with the TypeScript
 * parser, so a comment or a string naming the module does not count, and an
 * `import`, `export … from`, `import … = require`, `require(…)` and
 * `import(…)` all do.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as ts from 'typescript';
import { REPO } from '../sources/helpers/failureScan';
import { productionSources } from '../sources/helpers/regexScan';

const TIMERS = new Set([
  'timers',
  'node:timers',
  'timers/promises',
  'node:timers/promises',
]);

/** `file:line module` of each import of a timers module in `text`. */
function timersImports(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const note = (node: ts.Node, specifier: ts.Node | undefined) => {
    if (
      specifier !== undefined &&
      ts.isStringLiteralLike(specifier) &&
      TIMERS.has(specifier.text)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${file}:${line + 1} ${specifier.text}`);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      note(node, node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      note(node, node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      note(node, node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('no production import of node:timers', () => {
  it('no production source imports timers, node:timers or their /promises forms', () => {
    const files = productionSources();
    assert.ok(files.includes('src/index.ts'), 'the discovery reads src');
    assert.ok(
      files.includes('tools/run-tests.mjs'),
      'the discovery reads tools',
    );
    const found = files.flatMap((file) =>
      timersImports(file, fs.readFileSync(path.join(REPO, file), 'utf8')),
    );
    assert.deepEqual(found, []);
  });

  it('each import form of each timers module is refused', () => {
    const forms = (name: string) => [
      `import { setTimeout } from '${name}';`,
      `import * as t from '${name}';`,
      `export { setTimeout } from '${name}';`,
      `import t = require('${name}');`,
      `const t = require('${name}');`,
      `const t = await import('${name}');`,
    ];
    // Named here, not read from TIMERS: a name dropped from the set fails.
    for (const name of [
      'timers',
      'node:timers',
      'timers/promises',
      'node:timers/promises',
    ]) {
      forms(name).forEach((text, i) => {
        assert.deepEqual(
          timersImports('fixture.ts', text),
          [`fixture.ts:1 ${name}`],
          `form ${i}: ${text}`,
        );
      });
    }
  });

  it('a comment or a string naming the module is not an import', () => {
    const text = [
      "import * as fs from 'node:fs';",
      "// import { setTimeout } from 'node:timers';",
      'const words = "require(\'timers\')";',
      "require('node:timers-like');",
    ].join('\n');
    assert.deepEqual(timersImports('fixture.ts', text), []);
  });
});
