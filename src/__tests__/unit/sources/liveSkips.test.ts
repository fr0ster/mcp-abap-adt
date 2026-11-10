/**
 * A live case that skips is reported skipped (D27; measured on E77, SAP_BASIS
 * 7.40: 175 cases that logged a skip and returned were counted as passes).
 * The one way a live helper or suite skips the case it runs in is
 * `skipRunningTest(reason)` (`integration/helpers/runningTest.ts`), which
 * marks the case skipped with its reason and logs it. So in the live sources
 * (`src/__tests__/integration`, `src/__tests__/admin`), outside that module:
 *
 * - no `testSkip` logger call, and no message that says it skips —
 *   "Skipping", "SKIPPED", or one that starts with ⏭️ — is written: such a
 *   line beside a `return` was the defect, and a part a case leaves out
 *   while it runs on is said in other words;
 * - no `skipRunningTest` is called in a hook (`before`, `after`,
 *   `beforeEach`, `afterEach`): there is no case to mark there.
 *
 * Parsed with TypeScript; comments are not read.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as ts from 'typescript';
import { repositoryRoot } from '../../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);
const LIVE_ROOTS = ['src/__tests__/integration', 'src/__tests__/admin'];
const THE_HELPER = 'src/__tests__/integration/helpers/runningTest.ts';
const HOOKS = ['before', 'after', 'beforeEach', 'afterEach'];

/** Whether a message's text says it skips. */
function saysSkip(text: string): boolean {
  return (
    text.includes('Skipping') ||
    text.includes('SKIPPED') ||
    text.trimStart().startsWith('⏭️')
  );
}

/** The enclosing hook's name, when `node` sits in a hook's callback. */
function hookOf(node: ts.Node): string | undefined {
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if (
      ts.isCallExpression(at) &&
      ts.isIdentifier(at.expression) &&
      HOOKS.includes(at.expression.text)
    ) {
      return at.expression.text;
    }
    if (
      ts.isCallExpression(at) &&
      ts.isIdentifier(at.expression) &&
      at.expression.text === 'it'
    ) {
      return undefined;
    }
  }
  return undefined;
}

function findings(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (node: ts.Node) =>
    `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'testSkip'
    ) {
      found.push(`${at(node)} calls testSkip`);
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      saysSkip(node.text)
    ) {
      found.push(`${at(node)} says it skips: ${node.text.slice(0, 60)}`);
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ];
      if (parts.some(saysSkip)) {
        found.push(`${at(node)} says it skips: ${node.head.text.slice(0, 60)}`);
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'skipRunningTest'
    ) {
      const hook = hookOf(node);
      if (hook !== undefined) found.push(`${at(node)} skips in ${hook}()`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function liveSources(): string[] {
  return LIVE_ROOTS.flatMap((root) =>
    fs
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
      ),
  ).filter((file) => file !== THE_HELPER);
}

describe('a live skip is a marked skip', () => {
  it('no live source logs a skip of its own, or skips in a hook', () => {
    const found = liveSources().flatMap((file) =>
      findings(file, fs.readFileSync(path.join(REPO, file), 'utf8')),
    );
    assert.deepEqual(found, []);
  });

  it('refuses a logged skip, a testSkip call and a skip in a hook', () => {
    const file = 'src/__tests__/integration/x.test.ts';
    assert.equal(
      findings(
        file,
        [
          "it('a', () => {",
          "  logger?.info('⏭️  Skipping test: no system');",
          '  logger?.testSkip(`not on ${kind}`);',
          '});',
          "before(() => { skipRunningTest('no config'); });",
          "it('b', () => { skipRunningTest('fine'); });",
        ].join('\n'),
      ).length,
      3,
    );
  });
});
