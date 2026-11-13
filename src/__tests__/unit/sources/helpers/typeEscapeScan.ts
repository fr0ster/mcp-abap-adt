/**
 * The static-types scan: every way production code steps outside what the
 * compiler checks, read from the syntax tree of each source — never from a
 * pattern over its text.
 *
 * Refused:
 * - `assertion` — a type assertion (`x as T`, `<T>x`), except `as const`
 *   and `<const>`; `satisfies` is not an assertion;
 * - `any` — the `any` type, anywhere a type is written;
 * - `!` — a non-null assertion (`x!`) and a definite-assignment assertion
 *   (`let x!: T`, `field!: T`);
 * - the `ts-ignore`, `ts-expect-error` and `ts-nocheck` directives and
 *   `biome-ignore` — in any comment.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { REPO, rel } from './failureScan';

export type EscapeRule =
  | 'assertion'
  | 'any'
  | '!'
  | '@ts-ignore'
  | '@ts-expect-error'
  | '@ts-nocheck'
  | 'biome-ignore';

export interface Escape {
  readonly rule: EscapeRule;
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  /** The offending node's or comment's text, whitespace collapsed. */
  readonly text: string;
}

const DIRECTIVES = [
  '@ts-ignore',
  '@ts-expect-error',
  '@ts-nocheck',
  'biome-ignore',
] as const;

const SOURCE_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const TEST_SUFFIXES = ['.d.ts', '.test.ts', '.spec.ts', '.typecheck.ts'];
const TEST_DIRECTORIES = new Set([
  '__tests__',
  '__fixtures__',
  '__typechecks__',
  'node_modules',
  'dist',
]);

/**
 * The production directories: the root package's `src`, `scripts`, and the
 * `src` of every package directory at the root (a directory holding a
 * `package.json`). Found on disk, so a new package cannot be left out.
 */
export function productionDirectories(): string[] {
  const packages = fs
    .readdirSync(REPO, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        fs.existsSync(path.join(REPO, entry.name, 'package.json')) &&
        fs.existsSync(path.join(REPO, entry.name, 'src')),
    )
    .map((entry) => `${entry.name}/src`)
    .sort();
  return ['src', 'scripts', ...packages];
}

/** Every production source under `dir`: tests, fixtures and typechecks excluded. */
export function productionFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!TEST_DIRECTORIES.has(entry.name)) productionFiles(full, out);
      continue;
    }
    if (
      SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
      !TEST_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
    ) {
      out.push(full);
    }
  }
  return out;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

function collapse(text: string): string {
  let out = '';
  let gap = false;
  for (const character of text) {
    if (WHITESPACE.has(character)) {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += ' ';
    gap = false;
    out += character;
  }
  return out;
}

function isConstAssertion(type: ts.TypeNode): boolean {
  return (
    ts.isTypeReferenceNode(type) &&
    ts.isIdentifier(type.typeName) &&
    type.typeName.text === 'const'
  );
}

/**
 * A JSDoc type assertion of JavaScript, `/** @type {T} *\/ (value)`: a
 * parenthesized expression carrying a `@type` tag, read as `as T` is.
 */
function isJsDocAssertion(node: ts.Node, javaScript: boolean): boolean {
  if (!javaScript || !ts.isParenthesizedExpression(node)) return false;
  const type = ts.getJSDocTypeTag(node)?.typeExpression.type;
  return type !== undefined && !isConstAssertion(type);
}

function nodeRule(node: ts.Node, javaScript: boolean): EscapeRule | undefined {
  if (
    (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
    !isConstAssertion(node.type)
  ) {
    return 'assertion';
  }
  if (isJsDocAssertion(node, javaScript)) return 'assertion';
  if (node.kind === ts.SyntaxKind.AnyKeyword) return 'any';
  if (ts.isNonNullExpression(node)) return '!';
  if (
    (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
    node.exclamationToken !== undefined
  ) {
    return '!';
  }
  return undefined;
}

/** Every escape in one source file. */
export function scanFile(file: string): Escape[] {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const where = (position: number) =>
    `${rel(file)}:${source.getLineAndCharacterOfPosition(position).line + 1}`;
  const found: Escape[] = [];

  const comments = new Map<number, string>();
  const collect = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      comments.set(range.pos, text.slice(range.pos, range.end));
    }
  };

  const visit = (node: ts.Node) => {
    const rule = nodeRule(node, scriptKind(file) === ts.ScriptKind.JS);
    if (rule !== undefined) {
      found.push({
        rule,
        where: where(node.getStart(source)),
        text: collapse(node.getText(source)),
      });
    }
    collect(ts.getLeadingCommentRanges(text, node.pos));
    collect(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);

  for (const [position, comment] of comments) {
    for (const directive of DIRECTIVES) {
      if (comment.includes(directive)) {
        found.push({
          rule: directive,
          where: where(position),
          text: collapse(comment),
        });
      }
    }
  }
  return found;
}
