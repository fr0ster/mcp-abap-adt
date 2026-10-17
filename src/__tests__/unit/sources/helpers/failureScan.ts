/**
 * The failure-reading scan, on the TypeScript program with its type
 * checker — what a name resolves to, never what it is called.
 *
 * Rule `instanceof`: an `instanceof` whose right-hand side resolves (through
 * aliases, namespace imports, re-exports, a `const` holding the class) to a
 * class declared in a chain package (`@mcp-abap-adt/auth-*`, `connection`,
 * `adt-clients`, `interfaces-*`).
 *
 * Rule `thrown`: a thrown value is a `catch` binding, the rejection
 * parameter of a `.catch(…)` / `.then(_, …)` callback, anything assigned,
 * aliased (`const x = caught as Error`) or destructured from one, and a
 * parameter of a function of the program called with one. Refused on it:
 * reading `message`, `stack`, `cause` or `name` (dot, literal element access,
 * destructuring); `String(v)`; `JSON.stringify(…v…)`; `v` in a template or a
 * string `+`; `v` passed to `console.*`, `process.stderr.write` or a logger
 * call (`*.error|warn|info|debug|log|trace|fatal(…)`). Taint flows through the
 * whole program; findings are reported only in the files the caller names.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export const REPO = path.resolve(__dirname, '../../../../..');

export interface Finding {
  readonly rule: 'instanceof' | 'thrown';
  /** `file:line`, the file relative to the repository. */
  readonly where: string;
  /** The offending expression's text, whitespace collapsed. */
  readonly text: string;
}

const CHAIN_PACKAGES = [
  '/node_modules/@mcp-abap-adt/auth-',
  '/node_modules/@mcp-abap-adt/connection/',
  '/node_modules/@mcp-abap-adt/adt-clients/',
  '/node_modules/@mcp-abap-adt/interfaces-',
];

const FORBIDDEN_PROPERTIES = new Set(['message', 'stack', 'cause', 'name']);
const LOG_METHODS = new Set([
  'error',
  'warn',
  'info',
  'debug',
  'log',
  'trace',
  'fatal',
]);

export function rel(file: string): string {
  return path.relative(REPO, file).split(path.sep).join('/');
}

/** Every `.ts` source under `dir`, tests and fixtures excluded. */
export function tsFiles(dir: string, out: string[] = []): string[] {
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

/** `@mcp-abap-adt/<pkg>[/sub]` → its source, from each package's `exports` (types → src). */
function sourcePaths(): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const dir of ['.', 'server', 'http', 'sse']) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO, dir, 'package.json'), 'utf8'),
    ) as { name: string; exports?: Record<string, { types?: string }> };
    for (const [sub, target] of Object.entries(pkg.exports ?? {})) {
      const types = target?.types;
      if (typeof types !== 'string' || !types.startsWith('./dist/')) continue;
      const source = path.join(
        dir,
        'src',
        `${types.slice('./dist/'.length, -'.d.ts'.length)}.ts`,
      );
      const name = sub === '.' ? pkg.name : `${pkg.name}/${sub.slice(2)}`;
      paths[name] = [source];
    }
  }
  return paths;
}

export function createProgram(files: readonly string[]): ts.Program {
  return ts.createProgram({
    rootNames: [...files],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: REPO,
      paths: sourcePaths(),
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      types: ['node'],
      typeRoots: [path.join(REPO, 'node_modules/@types')],
    },
  });
}

function strip(expression: ts.Expression): ts.Expression {
  let current = expression;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

function isChainDeclaration(declaration: ts.Declaration): boolean {
  const file = declaration.getSourceFile().fileName.split(path.sep).join('/');
  return CHAIN_PACKAGES.some((marker) => file.includes(marker));
}

function resolved(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  let current = symbol;
  for (let i = 0; i < 10 && current.flags & ts.SymbolFlags.Alias; i += 1) {
    current = checker.getAliasedSymbol(current);
  }
  return current;
}

/** Whether `expression` names, or holds, a class of a chain package. */
function isChainClass(
  checker: ts.TypeChecker,
  expression: ts.Expression,
): boolean {
  const candidates: ts.Symbol[] = [];
  const symbol = checker.getSymbolAtLocation(strip(expression));
  if (symbol) candidates.push(resolved(checker, symbol));
  const typeSymbol = checker.getTypeAtLocation(expression).getSymbol();
  if (typeSymbol) candidates.push(resolved(checker, typeSymbol));
  return candidates.some((candidate) =>
    (candidate.declarations ?? []).some(
      (d) => ts.isClassDeclaration(d) && isChainDeclaration(d),
    ),
  );
}

/** Whether `callee` resolves to one of `names` of Node's `util` module. */
function isNodeUtil(
  checker: ts.TypeChecker,
  callee: ts.Expression,
  names: readonly string[],
): boolean {
  const symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(callee) ? callee.name : callee,
  );
  if (!symbol) return false;
  const target = resolved(checker, symbol);
  if (!names.includes(target.getName())) return false;
  return (target.declarations ?? []).some((d) => {
    const file = d.getSourceFile().fileName.split(path.sep).join('/');
    return file.includes('/@types/node/util.d.ts');
  });
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function isFunctionLike(
  node: ts.Node | undefined,
): node is ts.SignatureDeclaration & {
  parameters: ts.NodeArray<ts.ParameterDeclaration>;
} {
  return (
    node !== undefined &&
    (ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node))
  );
}

/** The function a callee resolves to, when the program declares it. */
function calleeFunction(
  checker: ts.TypeChecker,
  callee: ts.Expression,
):
  | (ts.SignatureDeclaration & {
      parameters: ts.NodeArray<ts.ParameterDeclaration>;
    })
  | undefined {
  const symbol = checker.getSymbolAtLocation(callee);
  if (!symbol) return undefined;
  for (const declaration of resolved(checker, symbol).declarations ?? []) {
    if (isFunctionLike(declaration)) return declaration;
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      isFunctionLike(declaration.initializer)
    ) {
      return declaration.initializer;
    }
  }
  return undefined;
}

function oneLine(node: ts.Node): string {
  return node
    .getText()
    .split('\n')
    .map((line) => line.trim())
    .join(' ');
}

/** The scan: findings in `reportIn` (absolute paths) of `program`. */
export function scanProgram(
  program: ts.Program,
  reportIn: ReadonlySet<string>,
  rules: { instanceof: ReadonlySet<string>; thrown: ReadonlySet<string> },
): Finding[] {
  const checker = program.getTypeChecker();
  const sources = program
    .getSourceFiles()
    .filter(
      (s) => !s.isDeclarationFile && !s.fileName.includes('node_modules'),
    );
  const tainted = new Set<ts.Symbol>();
  const findings: Finding[] = [];
  const seen = new Set<string>();

  const report = (rule: Finding['rule'], node: ts.Node) => {
    const file = path.resolve(node.getSourceFile().fileName);
    if (!reportIn.has(file)) return;
    if (!(rule === 'instanceof' ? rules.instanceof : rules.thrown).has(file)) {
      return;
    }
    const line =
      node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line +
      1;
    const finding = {
      rule,
      where: `${rel(file)}:${line}`,
      text: oneLine(node),
    };
    const key = `${finding.where} ${finding.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  const symbolOf = (node: ts.Node): ts.Symbol | undefined => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol ? resolved(checker, symbol) : undefined;
  };

  const isTainted = (expression: ts.Expression | undefined): boolean => {
    if (expression === undefined) return false;
    const target = strip(expression);
    if (!ts.isIdentifier(target)) return false;
    const symbol = symbolOf(target);
    return symbol !== undefined && tainted.has(symbol);
  };

  /**
   * Whether `expression` evaluates to a tainted value: the value itself,
   * either branch of `?:`, either side of `??` / `||` / `&&`, or a property or
   * element read back from a literal that holds one (`{ e: caught }.e`,
   * `[caught][0]`).
   */
  const flowsTainted = (expression: ts.Expression | undefined): boolean => {
    if (expression === undefined) return false;
    const target = strip(expression);
    if (isTainted(target)) return true;
    if (ts.isConditionalExpression(target)) {
      return flowsTainted(target.whenTrue) || flowsTainted(target.whenFalse);
    }
    if (
      ts.isBinaryExpression(target) &&
      (target.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        target.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        target.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    ) {
      return flowsTainted(target.left) || flowsTainted(target.right);
    }
    if (
      ts.isPropertyAccessExpression(target) ||
      ts.isElementAccessExpression(target)
    ) {
      const holder = strip(target.expression);
      return (
        (ts.isObjectLiteralExpression(holder) ||
          ts.isArrayLiteralExpression(holder)) &&
        holdsTainted(holder)
      );
    }
    return false;
  };

  /** A tainted value, or one held in an object or array literal, or either branch of `?:`. */
  const holdsTainted = (expression: ts.Expression): boolean => {
    const target = strip(expression);
    if (flowsTainted(target)) return true;
    if (ts.isObjectLiteralExpression(target)) {
      return target.properties.some((property) => {
        if (ts.isPropertyAssignment(property)) {
          return holdsTainted(property.initializer);
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          const symbol = checker.getShorthandAssignmentValueSymbol(property);
          return symbol !== undefined && tainted.has(resolved(checker, symbol));
        }
        if (ts.isSpreadAssignment(property)) {
          return holdsTainted(property.expression);
        }
        return false;
      });
    }
    if (ts.isArrayLiteralExpression(target)) {
      return target.elements.some((element) =>
        holdsTainted(
          ts.isSpreadElement(element) ? element.expression : element,
        ),
      );
    }
    if (ts.isConditionalExpression(target)) {
      return holdsTainted(target.whenTrue) || holdsTainted(target.whenFalse);
    }
    return false;
  };

  const taintName = (name: ts.BindingName): boolean => {
    if (ts.isIdentifier(name)) {
      const symbol = symbolOf(name);
      if (symbol && !tainted.has(symbol)) {
        tainted.add(symbol);
        return true;
      }
      return false;
    }
    let changed = false;
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      const key = element.propertyName ?? element.name;
      if (
        ts.isObjectBindingPattern(name) &&
        ts.isIdentifier(key) &&
        FORBIDDEN_PROPERTIES.has(key.text)
      ) {
        report('thrown', element);
        continue;
      }
      changed = taintName(element.name) || changed;
    }
    return changed;
  };

  // Seeds, then propagation to a fixed point.
  for (const source of sources) {
    walk(source, (node) => {
      if (ts.isCatchClause(node) && node.variableDeclaration) {
        taintName(node.variableDeclaration.name);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const method = node.expression.name.text;
        const handler =
          method === 'catch'
            ? node.arguments[0]
            : method === 'then'
              ? node.arguments[1]
              : undefined;
        // An inline handler, or a named one the program declares.
        const fn =
          handler === undefined
            ? undefined
            : isFunctionLike(handler)
              ? handler
              : calleeFunction(checker, handler);
        const first = fn?.parameters[0];
        if (first) taintName(first.name);
      }
    });
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const source of sources) {
      walk(source, (node) => {
        if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
          const source = node.initializer;
          // A literal holding one taints every name destructured from it.
          const flows = ts.isIdentifier(node.name)
            ? flowsTainted(source)
            : flowsTainted(source) || holdsTainted(source);
          if (flows) changed = taintName(node.name) || changed;
        }
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          flowsTainted(node.right) &&
          ts.isIdentifier(node.left)
        ) {
          changed = taintName(node.left) || changed;
        }
        if (ts.isCallExpression(node)) {
          const fn = calleeFunction(checker, node.expression);
          if (!fn) return;
          node.arguments.forEach((argument, index) => {
            const parameter = fn.parameters[index];
            if (parameter && flowsTainted(argument)) {
              changed = taintName(parameter.name) || changed;
            }
          });
        }
      });
    }
  }

  // Uses.
  for (const source of sources) {
    walk(source, (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
        isChainClass(checker, node.right)
      ) {
        report('instanceof', node);
      }
      if (
        (ts.isPropertyAccessExpression(node) &&
          FORBIDDEN_PROPERTIES.has(node.name.text)) ||
        (ts.isElementAccessExpression(node) &&
          ts.isStringLiteralLike(node.argumentExpression) &&
          FORBIDDEN_PROPERTIES.has(node.argumentExpression.text))
      ) {
        const written =
          ts.isBinaryExpression(node.parent) &&
          node.parent.left === node &&
          node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        if (!written && flowsTainted(node.expression)) report('thrown', node);
      }
      if (ts.isTemplateSpan(node) && holdsTainted(node.expression)) {
        report('thrown', node.parent);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        (flowsTainted(node.left) || flowsTainted(node.right))
      ) {
        report('thrown', node);
      }
      if (ts.isCallExpression(node)) {
        const callee = strip(node.expression);
        // `v.toString()`.
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'toString' &&
          flowsTainted(callee.expression)
        ) {
          report('thrown', node);
          return;
        }
        const anyTainted = node.arguments.some((a) => holdsTainted(a));
        if (!anyTainted) return;
        const calleeText = callee.getText();
        if (ts.isIdentifier(callee) && callee.text === 'String') {
          report('thrown', node);
        } else if (calleeText === 'JSON.stringify') {
          report('thrown', node);
        } else if (isNodeUtil(checker, callee, ['inspect', 'format'])) {
          report('thrown', node);
        } else if (calleeText === 'process.stderr.write') {
          report('thrown', node);
        } else if (
          ts.isPropertyAccessExpression(callee) &&
          (LOG_METHODS.has(callee.name.text) ||
            callee.expression.getText() === 'console')
        ) {
          report('thrown', node);
        }
      }
    });
  }
  return findings;
}
