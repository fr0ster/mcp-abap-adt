/**
 * The regular-expression scan: every regular expression a source builds,
 * read from its syntax tree and the type checker — never from a pattern
 * over its text.
 *
 * Refused:
 * - a regular-expression literal (`/…/flags`);
 * - any reference to `RegExp` — `new RegExp(…)`, `RegExp(…)`,
 *   `globalThis.RegExp`, `globalThis['RegExp']`, an alias of it, a type
 *   reference;
 * - a call of `match`, `matchAll` or `search` — by name or by a string key
 *   (`s['match'](…)`) — on a receiver the checker types as a string (or
 *   `any`), whatever its argument: a string's `match` compiles its argument
 *   to a regular expression; and on any receiver when the argument is a
 *   string literal or a template.
 *
 * The production sources are every git-tracked (or new, not ignored) `.ts`,
 * `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` file of the repository outside
 * tests, fixtures, typechecks and docs — `src`, `scripts`, `tools` and every
 * package's sources — so a new directory cannot be left out.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, sourcePaths } from './failureScan';

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

/**
 * Every production source on disk under `root` (the repository by default),
 * git-tracked or new, relative to `root`. A fixture tree laid out as a
 * repository is discovered the same way.
 */
export function productionSources(root: string = REPO): string[] {
  // Tracked files, and new ones not yet added that git does not ignore.
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
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
        fs.existsSync(path.join(root, file)),
    )
    .sort();
}

const INFRASTRUCTURE_DIRECTORIES = new Set(['helpers', 'testers']);
const NEVER_SCANNED = new Set(['__fixtures__', 'node_modules', 'dist']);

/**
 * Every source of the test infrastructure on disk under `root` (the
 * repository by default), git-tracked or new, relative to `root`: a file in
 * a `helpers` or `testers` directory inside a `__tests__` tree, outside
 * fixtures; a test file there is a test, not infrastructure. A fixture tree
 * laid out as a repository is discovered the same way.
 */
export function testInfrastructureSources(root: string = REPO): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  return listed
    .split('\0')
    .filter((file) => {
      const directories = file.split('/').slice(0, -1);
      const tests = directories.indexOf('__tests__');
      return (
        tests >= 0 &&
        directories
          .slice(tests + 1)
          .some((segment) => INFRASTRUCTURE_DIRECTORIES.has(segment)) &&
        !directories.some((segment) => NEVER_SCANNED.has(segment)) &&
        SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
        !TEST_SUFFIXES.some((suffix) => file.endsWith(suffix)) &&
        fs.existsSync(path.join(root, file))
      );
    })
    .sort();
}

/** One program over `files`, JavaScript included, for the checker's types. */
function programOver(files: readonly string[]): ts.Program {
  return ts.createProgram({
    rootNames: [...files],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: REPO,
      paths: sourcePaths(),
      strict: true,
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      types: ['node'],
      typeRoots: [path.join(REPO, 'node_modules/@types')],
    },
  });
}

/** The name an access names: `x.name`, or `x['name']` with a string key. */
function accessedName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return undefined;
}

const isStringArgument = (node: ts.Expression | undefined): boolean =>
  node !== undefined &&
  (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node));

/** A type the checker reads as a string, or `any` (an untyped receiver). */
function isStringOrAny(type: ts.Type): boolean {
  const members = type.isUnion() ? type.types : [type];
  return members.some(
    (member) =>
      (member.flags & ts.TypeFlags.StringLike) !== 0 ||
      (member.flags & ts.TypeFlags.Any) !== 0,
  );
}

function isStringCompilingCall(
  node: ts.Node,
  checker: ts.TypeChecker,
): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  const name = accessedName(callee);
  if (name === undefined || !STRING_COMPILING.has(name)) return false;
  if (isStringArgument(node.arguments[0])) return true;
  if (
    !ts.isPropertyAccessExpression(callee) &&
    !ts.isElementAccessExpression(callee)
  ) {
    return false;
  }
  return isStringOrAny(checker.getTypeAtLocation(callee.expression));
}

function isRegExpReference(node: ts.Node): boolean {
  if (ts.isIdentifier(node)) return node.text === 'RegExp';
  return ts.isElementAccessExpression(node) && accessedName(node) === 'RegExp';
}

/** Every regular expression in `files` (relative to `root`), in file order. */
export function regexSitesIn(
  files: readonly string[],
  root: string = REPO,
): RegexSite[] {
  const program = programOver(files.map((file) => path.join(root, file)));
  const checker = program.getTypeChecker();
  const found: RegexSite[] = [];
  for (const file of files) {
    const source = program.getSourceFile(path.join(root, file));
    if (source === undefined) {
      found.push({ where: `${file}:0`, text: 'not read' });
      continue;
    }
    const visit = (node: ts.Node) => {
      if (
        node.kind === ts.SyntaxKind.RegularExpressionLiteral ||
        isRegExpReference(node) ||
        isStringCompilingCall(node, checker)
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
  }
  return found;
}
