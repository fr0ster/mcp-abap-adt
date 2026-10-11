/**
 * D14: a failure is read by structure through auth-errors — never by
 * `instanceof` of a chain class, never by a thrown value's `message` or
 * `name`. A scan, with the TypeScript parser, of the auth and transport
 * sources (tests excluded):
 *
 * - no `instanceof X` where `X` is imported from a chain package
 *   (`@mcp-abap-adt/auth-*`, `connection`, `adt-clients`, `interfaces-*`);
 * - no read of `.message` or `.name` (nor `['message']` / `['name']`) on a
 *   value that holds a thrown value: a `catch` binding, or an identifier
 *   named as one (`error`, `err`, `e`, `thrown`, `cause`, `failure`,
 *   `refusal`). A write (`this.name = …`) is not a read; a class's own name
 *   (`error.constructor.name`) is not the error's.
 *
 * The one exception is listed with its reason; a finding is fixed in the
 * code, never by widening the list.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const REPO = path.resolve(__dirname, '../../../..');
const SCANNED = [
  'src/lib/auth',
  'src/lib/httpTransport',
  'server/src/auth',
  'http/src',
  'sse/src',
];

/**
 * `file: the enclosing function` → why it may read a message. Main's
 * instance pool, carried as it is (ruling 16): its disposal report quotes
 * the held state's own undo words; A10 owns that report.
 */
const ALLOWED_MESSAGE_READS: Readonly<Record<string, string>> = {
  'http/src/InstancePool.ts: messageOf':
    "the held state's own undo words, in the pool's shutdown report (A10)",
};

const CHAIN_MODULE_PREFIXES = [
  '@mcp-abap-adt/auth-',
  '@mcp-abap-adt/connection',
  '@mcp-abap-adt/adt-clients',
  '@mcp-abap-adt/interfaces-',
];

const THROWN_NAMES = new Set([
  'error',
  'err',
  'e',
  'thrown',
  'cause',
  'failure',
  'refusal',
]);

function rel(file: string): string {
  return path.relative(REPO, file).split(path.sep).join('/');
}

function tsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsFiles(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** Local names bound to an import from a chain package. */
function chainImports(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = (statement.moduleSpecifier as ts.StringLiteral).text;
    if (!CHAIN_MODULE_PREFIXES.some((prefix) => from.startsWith(prefix))) {
      continue;
    }
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) names.add(element.name.text);
    }
    if (bindings && ts.isNamespaceImport(bindings)) {
      names.add(bindings.name.text);
    }
  }
  return names;
}

/** The name of the function, method or variable holding the function around `node`. */
function enclosingFunction(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) &&
      current.name
    ) {
      return current.name.getText();
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent)
    ) {
      return current.parent.name.getText();
    }
    current = current.parent;
  }
  return '<top>';
}

/** Catch bindings in scope of `node`. */
function catchBindings(node: ts.Node): Set<string> {
  const names = new Set<string>();
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isCatchClause(current) &&
      current.variableDeclaration &&
      ts.isIdentifier(current.variableDeclaration.name)
    ) {
      names.add(current.variableDeclaration.name.text);
    }
    current = current.parent;
  }
  return names;
}

/** Whether `node` is the target of an assignment (`x.name = …`). */
function isWritten(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

/** The receiver's identifier when it names a thrown value. */
function thrownReceiver(receiver: ts.Expression, node: ts.Node): boolean {
  let target = receiver;
  while (
    ts.isParenthesizedExpression(target) ||
    ts.isAsExpression(target) ||
    ts.isNonNullExpression(target)
  ) {
    target = target.expression;
  }
  if (!ts.isIdentifier(target)) return false;
  return THROWN_NAMES.has(target.text) || catchBindings(node).has(target.text);
}

interface Finding {
  where: string;
  what: string;
}

function scan(): { findings: Finding[]; allowedSeen: Set<string> } {
  const findings: Finding[] = [];
  const allowedSeen = new Set<string>();
  for (const root of SCANNED) {
    for (const file of tsFiles(path.join(REPO, root))) {
      const source = parse(file);
      const chain = chainImports(source);
      walk(source, (node) => {
        const line =
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const where = `${rel(file)}:${line}`;
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
          ts.isIdentifier(node.right) &&
          chain.has(node.right.text)
        ) {
          findings.push({ where, what: `instanceof ${node.right.text}` });
        }
        let property: string | undefined;
        let receiver: ts.Expression | undefined;
        if (ts.isPropertyAccessExpression(node)) {
          property = node.name.text;
          receiver = node.expression;
        } else if (
          ts.isElementAccessExpression(node) &&
          ts.isStringLiteralLike(node.argumentExpression)
        ) {
          property = node.argumentExpression.text;
          receiver = node.expression;
        }
        if (
          receiver !== undefined &&
          (property === 'message' || property === 'name') &&
          !isWritten(node) &&
          thrownReceiver(receiver, node)
        ) {
          const key = `${rel(file)}: ${enclosingFunction(node)}`;
          if (property === 'message' && key in ALLOWED_MESSAGE_READS) {
            allowedSeen.add(key);
            return;
          }
          findings.push({
            where,
            what: `${node.getText()} (a ${property} read)`,
          });
        }
      });
    }
  }
  return { findings, allowedSeen };
}

describe('no chain instanceof, no message or name read (D14)', () => {
  const { findings, allowedSeen } = scan();

  it('the scanned directories exist and hold sources', () => {
    for (const root of SCANNED) {
      expect(tsFiles(path.join(REPO, root)).length).toBeGreaterThan(0);
    }
  });

  it('finds nothing', () => {
    expect(findings).toEqual([]);
  });

  it('every listed exception still exists (a stale entry is removed)', () => {
    expect([...allowedSeen].sort()).toEqual(
      Object.keys(ALLOWED_MESSAGE_READS).sort(),
    );
  });
});
