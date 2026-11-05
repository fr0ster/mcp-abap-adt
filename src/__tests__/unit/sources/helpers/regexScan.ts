/**
 * The regular-expression scan: every regular expression a source builds,
 * read from its syntax tree — never from a pattern over its text.
 *
 * Refused:
 * - a regular-expression literal (`/…/flags`);
 * - any reference to `RegExp` — `new RegExp(…)`, `RegExp(…)`,
 *   `globalThis.RegExp`, an alias of it;
 * - a call of `match`, `matchAll` or `search` with a string literal or a
 *   template: the string is compiled to a regular expression.
 *
 * The production sources are every git-tracked (or new, not ignored) `.ts`, `.mts`, `.cts`, `.js`,
 * `.mjs` and `.cjs` file of the repository outside tests, fixtures,
 * typechecks and docs — `src`, `scripts`, `tools` and every package's
 * sources — so a new directory cannot be left out.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO } from './failureScan';

export interface RegexSite {
  /** `file:line`, the file relative to the scanned root. */
  readonly where: string;
  /** The node's text, its first line only. */
  readonly text: string;
}

const SOURCE_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const TEST_SUFFIXES = ['.d.ts', '.test.ts', '.spec.ts', '.typecheck.ts'];
const EXCLUDED_SEGMENTS = new Set([
  '__tests__',
  '__fixtures__',
  '__typechecks__',
  'node_modules',
  'dist',
  'docs',
]);
const STRING_COMPILING = new Set(['match', 'matchAll', 'search']);

/** Every production source on disk, git-tracked or new, relative to the repository. */
export function productionSources(): string[] {
  // Tracked files, and new ones not yet added that git does not ignore.
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: REPO,
      encoding: 'utf8',
    },
  );
  return listed
    .split('\0')
    .filter(
      (file) =>
        file.length > 0 &&
        SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
        !TEST_SUFFIXES.some((suffix) => file.endsWith(suffix)) &&
        !file.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment)) &&
        fs.existsSync(path.join(REPO, file)),
    )
    .sort();
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function isStringCompilingCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !STRING_COMPILING.has(callee.name.text)
  ) {
    return false;
  }
  const first = node.arguments[0];
  return (
    first !== undefined &&
    (ts.isStringLiteral(first) ||
      ts.isNoSubstitutionTemplateLiteral(first) ||
      ts.isTemplateExpression(first))
  );
}

function isRegExpReference(node: ts.Node): boolean {
  return ts.isIdentifier(node) && node.text === 'RegExp';
}

/** Every regular expression in one source; `file` is relative to `root`. */
export function regexSites(file: string, root: string = REPO): RegexSite[] {
  const full = path.join(root, file);
  const source = ts.createSourceFile(
    full,
    fs.readFileSync(full, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const found: RegexSite[] = [];
  const visit = (node: ts.Node) => {
    if (
      node.kind === ts.SyntaxKind.RegularExpressionLiteral ||
      isRegExpReference(node) ||
      isStringCompilingCall(node)
    ) {
      const start = node.getStart(source);
      const line = source.getLineAndCharacterOfPosition(start).line + 1;
      const text = node.getText(source);
      const end = text.indexOf('\n');
      found.push({
        where: `${file}:${line}`,
        text: end === -1 ? text : text.slice(0, end),
      });
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}
