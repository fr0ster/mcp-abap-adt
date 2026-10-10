/**
 * Provider sources (H0): a connector holds a credential from exactly one of
 * three sources — a destination (`getProvider`), the request headers
 * (`credentialFromHeaders`), or a caller's `SapConfig`
 * (`credentialFromSapConfig`) — and nothing else in the server builds one.
 *
 * Read from the source tree with the TypeScript parser: every call of
 * `createAbapConnection` outside `connectionFactory.ts` is checked for where
 * its credential argument comes from, following a `credential` binding to
 * its initialiser within the file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const REPO = path.resolve(__dirname, '../../..');
const ROOTS = [
  'src',
  'server/src',
  'http/src',
  'compact/src',
  'compact-readonly/src',
  'compact-modify/src',
].map((root) => path.join(REPO, root));

const FACTORY_FILE = path.join(REPO, 'src/lib/connectionFactory.ts');
/** Where credentials may be constructed: the sources, and the broker's handlers. */
const CREDENTIAL_HOMES = [
  path.join(REPO, 'src/lib/credentialSources.ts'),
  path.join(REPO, 'src/lib/auth') + path.sep,
  path.join(REPO, 'server/src/auth') + path.sep,
];

/** A path relative to the repository, with POSIX separators on every platform. */
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

function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

function strip(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** A credential straight from one of the three sources. */
function isSource(raw: ts.Expression): boolean {
  const expr = strip(raw);
  // 1. a destination: await <destinations>.getProvider(destination)
  if (ts.isAwaitExpression(expr)) {
    const inner = strip(expr.expression);
    return (
      ts.isCallExpression(inner) &&
      ts.isPropertyAccessExpression(inner.expression) &&
      inner.expression.name.text === 'getProvider'
    );
  }
  if (ts.isCallExpression(expr)) {
    // 3. a caller's SapConfig
    return calleeName(expr) === 'credentialFromSapConfig';
  }
  // 2. the headers: credentialFromHeaders(headers).credential
  if (
    ts.isPropertyAccessExpression(expr) &&
    expr.name.text === 'credential' &&
    ts.isCallExpression(strip(expr.expression)) &&
    calleeName(strip(expr.expression) as ts.CallExpression) ===
      'credentialFromHeaders'
  ) {
    return true;
  }
  return false;
}

/** The names bound to `siblingRecordOf(...)` in a file. */
function siblingRecords(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  walk(file, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(strip(node.initializer)) &&
      calleeName(strip(node.initializer) as ts.CallExpression) ===
        'siblingRecordOf'
    ) {
      names.add(node.name.text);
    }
  });
  return names;
}

/**
 * Every value a `credential` binding takes in the file — a variable, a
 * destructured name, an object property — must be a source. Answers the
 * offending lines; an empty list when every binding is a source and there is
 * at least one.
 */
function credentialBindingOffences(
  file: ts.SourceFile,
  requireBinding = true,
): string[] {
  const offences: string[] = [];
  let bindings = 0;
  const where = (node: ts.Node) =>
    `${rel(file.fileName)}:${
      file.getLineAndCharacterOfPosition(node.getStart()).line + 1
    }`;

  walk(file, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'credential'
    ) {
      bindings += 1;
      if (!node.initializer || !isSource(node.initializer)) {
        offences.push(
          `${where(node)} credential = ${node.initializer?.getText()}`,
        );
      }
    }
    if (
      ts.isBindingElement(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'credential'
    ) {
      bindings += 1;
      const declaration = node.parent.parent;
      const init =
        ts.isVariableDeclaration(declaration) && declaration.initializer
          ? strip(declaration.initializer)
          : undefined;
      if (
        !init ||
        !ts.isCallExpression(init) ||
        calleeName(init) !== 'credentialFromHeaders'
      ) {
        offences.push(`${where(node)} { credential } = ${init?.getText()}`);
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'credential' &&
      ts.isObjectLiteralExpression(node.parent)
    ) {
      bindings += 1;
      if (!isSource(node.initializer)) {
        offences.push(
          `${where(node)} credential: ${node.initializer.getText()}`,
        );
      }
    }
  });
  if (requireBinding && bindings === 0) {
    offences.push(
      `${rel(file.fileName)}: a credential reference with no binding in the file`,
    );
  }
  return offences;
}

/** The credential argument of one createAbapConnection call, judged. */
function judge(
  arg: ts.Expression | undefined,
  file: ts.SourceFile,
): string | undefined {
  if (!arg) return 'no credential argument';
  const expr = strip(arg);
  if (isSource(expr)) return undefined;

  // A sibling of a connection the factory built: that connection's own
  // credential, else the SapConfig source.
  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    const left = strip(expr.left);
    const records = siblingRecords(file);
    if (
      ts.isPropertyAccessExpression(left) &&
      left.name.text === 'credential' &&
      ts.isIdentifier(left.expression) &&
      records.has(left.expression.text) &&
      isSource(expr.right)
    ) {
      return undefined;
    }
    return `not a source: ${expr.getText()}`;
  }

  // A reference to a credential bound elsewhere in the file.
  const named =
    (ts.isIdentifier(expr) && expr.text === 'credential') ||
    (ts.isPropertyAccessExpression(expr) && expr.name.text === 'credential');
  if (named) {
    const offences = credentialBindingOffences(file);
    return offences.length === 0 ? undefined : offences.join('; ');
  }
  return `not a source: ${expr.getText()}`;
}

interface CallSite {
  where: string;
  verdict: string | undefined;
}

function callSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const root of ROOTS) {
    for (const fileName of tsFiles(root)) {
      if (fileName === FACTORY_FILE) continue;
      const file = parse(fileName);
      walk(file, (node) => {
        if (
          ts.isCallExpression(node) &&
          calleeName(node) === 'createAbapConnection'
        ) {
          sites.push({
            where: `${rel(fileName)}:${
              file.getLineAndCharacterOfPosition(node.getStart()).line + 1
            }`,
            verdict: judge(node.arguments[1], file),
          });
        }
      });
    }
  }
  return sites;
}

describe('provider sources (H0)', () => {
  it('finds the call sites it is meant to judge', () => {
    const files = new Set(callSites().map((site) => site.where.split(':')[0]));
    expect(files).toEqual(
      new Set([
        'src/embeddable/BaseMcpServer.ts',
        'src/lib/packageSessions.ts',
        'src/lib/utils.ts',
      ]),
    );
  });

  it('createAbapConnection is reached only with a credential from getProvider, credentialFromHeaders or credentialFromSapConfig', () => {
    const offences = callSites()
      .filter((site) => site.verdict !== undefined)
      .map((site) => `${site.where}: ${site.verdict}`);
    expect(offences).toEqual([]);
  });

  it('every credential binding in the server is a source', () => {
    const offences: string[] = [];
    for (const root of ROOTS) {
      for (const fileName of tsFiles(root)) {
        if (CREDENTIAL_HOMES.some((home) => fileName.startsWith(home))) {
          continue;
        }
        offences.push(...credentialBindingOffences(parse(fileName), false));
      }
    }
    expect(offences).toEqual([]);
  });

  it('no credential is constructed outside the sources and the broker handlers', () => {
    const offences: string[] = [];
    for (const root of ROOTS) {
      for (const fileName of tsFiles(root)) {
        if (CREDENTIAL_HOMES.some((home) => fileName.startsWith(home))) {
          continue;
        }
        const file = parse(fileName);
        for (const statement of file.statements) {
          if (
            ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier) &&
            statement.moduleSpecifier.text === '@mcp-abap-adt/auth-providers' &&
            !statement.importClause?.isTypeOnly
          ) {
            offences.push(
              `${rel(fileName)}: imports @mcp-abap-adt/auth-providers`,
            );
          }
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
