/**
 * The construction scan of `ISapConfig` (24.0.0, spec §9): how production
 * code builds the union, read with the compiler API and its type checker —
 * never a pattern over the text.
 *
 * Reported:
 * - `assertion` — `x as T` / `<T>x` whose target type is `ISapConfig` or one
 *   of its members (`SapConfig` and connection's aliases included);
 * - `pre-narrowing` — an object literal whose contextual type is the whole
 *   union (HTTP and RFC members both), or a `config` property whose value's
 *   type is the whole union: a config built before its wire is narrowed;
 * - `forbidden-key` — a value that becomes a config while its type carries
 *   a key the target shape forbids (`url` for RFC, an RFC key for HTTP),
 *   `undefined` included. Decided on types, not on syntax: at every place a
 *   value becomes a config (`BECOMES`) the checker gives the target (the
 *   place's contextual type) and the source (the expression's type); each
 *   constituent of a union source must fit some member of the target. Where
 *   the value comes from — a literal, a variable, a call, parentheses, a
 *   chain, a spread — does not matter.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export type ConstructionRule = 'assertion' | 'pre-narrowing' | 'forbidden-key';

export interface ConstructionFinding {
  readonly rule: ConstructionRule;
  /** `file:line`, the file relative to `root`. */
  readonly where: string;
}

/**
 * Where a value becomes a config: a variable initializer (a declared type),
 * a class property initializer, a parameter's default, an assignment, a call
 * or `new` argument, a return statement, an arrow function's expression
 * body, `satisfies`, an array element, an object element (a property or a
 * shorthand).
 */
export type BecomesForm =
  | 'variable'
  | 'property'
  | 'parameter-default'
  | 'assignment'
  | 'argument'
  | 'return'
  | 'arrow-body'
  | 'satisfies'
  | 'array-element'
  | 'object-element'
  | 'shorthand';

export const BECOMES: readonly BecomesForm[] = [
  'variable',
  'property',
  'parameter-default',
  'assignment',
  'argument',
  'return',
  'arrow-body',
  'satisfies',
  'array-element',
  'object-element',
  'shorthand',
];

/** The contract's own declarations, by name: the HTTP member and the RFC ones. */
const HTTP_MEMBERS = new Set(['ISapHttpConfig']);
const RFC_MEMBERS = new Set(['ISapRfcLogon', 'ISapRfcApplicationServer']);
const CONTRACT_PACKAGE = `${path.sep}interfaces-auth-sap${path.sep}`;

type Shape = 'http' | 'rfc';

/** The shapes a type is made of: each member of a union, read by its declaration. */
function shapesOf(type: ts.Type): Set<Shape> {
  const shapes = new Set<Shape>();
  const visit = (each: ts.Type) => {
    if (each.isUnion() || each.isIntersection()) {
      for (const part of each.types) visit(part);
      return;
    }
    const symbol = each.getSymbol();
    if (symbol === undefined) return;
    const fromContract = (symbol.getDeclarations() ?? []).some((declaration) =>
      declaration
        .getSourceFile()
        .fileName.split('/')
        .join(path.sep)
        .includes(CONTRACT_PACKAGE),
    );
    if (!fromContract) return;
    if (HTTP_MEMBERS.has(symbol.getName())) shapes.add('http');
    if (RFC_MEMBERS.has(symbol.getName())) shapes.add('rfc');
  };
  visit(type);
  return shapes;
}

/** A union with an HTTP and an RFC member: the whole `ISapConfig`. */
function isWholeUnion(shapes: Set<Shape>): boolean {
  return shapes.has('http') && shapes.has('rfc');
}

/** The members of `type`, a union distributed: each a config member or not. */
function membersOf(type: ts.Type): ts.Type[] {
  return type.isUnion() ? [...type.types] : [type];
}

/** Whether `property` is held: required, or of a type besides `undefined`. */
function carries(checker: ts.TypeChecker, property: ts.Symbol): boolean {
  if ((property.getFlags() & ts.SymbolFlags.Optional) === 0) return true;
  const type = checker.getNonNullableType(checker.getTypeOfSymbol(property));
  return (type.flags & ts.TypeFlags.Never) === 0;
}

function propertyName(
  element: ts.ObjectLiteralElementLike,
): string | undefined {
  const name = element.name;
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

/** The form in which `node` becomes the value of its place; `undefined` when none. */
function formOf(node: ts.Node): BecomesForm | undefined {
  const parent = node.parent;
  if (parent === undefined) return undefined;
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
    return 'variable';
  }
  if (ts.isPropertyDeclaration(parent) && parent.initializer === node) {
    return 'property';
  }
  if (ts.isParameter(parent) && parent.initializer === node) {
    return 'parameter-default';
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === node
  ) {
    return 'assignment';
  }
  if (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    ts.isExpression(node) &&
    (parent.arguments ?? []).some((argument) => argument === node)
  ) {
    return 'argument';
  }
  if (ts.isReturnStatement(parent) && parent.expression === node) {
    return 'return';
  }
  if (ts.isArrowFunction(parent) && parent.body === node) return 'arrow-body';
  if (ts.isSatisfiesExpression(parent) && parent.expression === node) {
    return 'satisfies';
  }
  if (
    ts.isArrayLiteralExpression(parent) &&
    ts.isExpression(node) &&
    parent.elements.some((element) => element === node)
  ) {
    return 'array-element';
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return 'object-element';
  }
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
    return 'shorthand';
  }
  return undefined;
}

/** The constituents of a source type: each member of a union, else the type. */
function constituentsOf(type: ts.Type): ts.Type[] {
  return type.isUnion() ? [...type.types] : [type];
}

/** Whether `member` forbids `name` (`?: never`). */
function forbids(
  checker: ts.TypeChecker,
  member: ts.Type,
  name: string,
): boolean {
  const property = member.getProperty(name);
  if (property === undefined) return false;
  const declared = checker.getNonNullableType(
    checker.getTypeOfSymbol(property),
  );
  return (declared.flags & ts.TypeFlags.Never) !== 0;
}

/**
 * Whether `source` fits `target` by its keys: each constituent of the source
 * fits some config member of the target — carries no key that member
 * forbids.
 */
function fitsByKeys(
  checker: ts.TypeChecker,
  source: ts.Type,
  target: ts.Type,
): boolean {
  const members = membersOf(target).filter((each) => shapesOf(each).size > 0);
  return constituentsOf(source).every((constituent) => {
    const carried = checker
      .getPropertiesOfType(constituent)
      .filter((property) => carries(checker, property));
    return members.some(
      (member) =>
        !carried.some((property) =>
          forbids(checker, member, property.getName()),
        ),
    );
  });
}

/** The type a place gives the value it receives; `undefined` when none. */
function targetOf(
  checker: ts.TypeChecker,
  node: ts.Expression,
  form: BecomesForm,
): ts.Type | undefined {
  const parent = node.parent;
  if (form === 'satisfies' && ts.isSatisfiesExpression(parent)) {
    return checker.getTypeFromTypeNode(parent.type);
  }
  if (form === 'variable' && ts.isVariableDeclaration(parent) && parent.type) {
    return checker.getTypeFromTypeNode(parent.type);
  }
  return checker.getContextualType(node);
}

/**
 * The types of the value a place receives: a conditional's branches each on
 * its own (the checker reduces their union by subtype, which could hide the
 * branch that carries a forbidden key), parentheses looked through,
 * otherwise the expression's type.
 */
function sourcesOf(
  checker: ts.TypeChecker,
  node: ts.Expression,
  form: BecomesForm,
): ts.Type[] {
  if (form === 'shorthand' && ts.isShorthandPropertyAssignment(node.parent)) {
    const value = checker.getShorthandAssignmentValueSymbol(node.parent);
    if (value !== undefined) return [checker.getTypeOfSymbol(value)];
  }
  const branches = (expression: ts.Expression): ts.Expression[] => {
    if (ts.isParenthesizedExpression(expression)) {
      return branches(expression.expression);
    }
    if (ts.isConditionalExpression(expression)) {
      return [
        ...branches(expression.whenTrue),
        ...branches(expression.whenFalse),
      ];
    }
    return [expression];
  };
  return branches(node).map((each) => checker.getTypeAtLocation(each));
}

/** Every finding of the program's `files`; `forms` the places checked (all by default). */
export function scanConstruction(
  files: readonly string[],
  options: ts.CompilerOptions,
  root: string,
  forms: readonly BecomesForm[] = BECOMES,
): ConstructionFinding[] {
  const program = ts.createProgram({ rootNames: files, options });
  const checker = program.getTypeChecker();
  const found: ConstructionFinding[] = [];
  const wanted = new Set(files.map((file) => path.resolve(file)));

  for (const source of program.getSourceFiles()) {
    if (!wanted.has(path.resolve(source.fileName))) continue;
    const where = (node: ts.Node) =>
      `${path.relative(root, source.fileName).split(path.sep).join('/')}:${
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      }`;
    const report = (rule: ConstructionRule, node: ts.Node) =>
      found.push({ rule, where: where(node) });

    const visit = (node: ts.Node) => {
      if (
        (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
        shapesOf(checker.getTypeFromTypeNode(node.type)).size > 0
      ) {
        report('assertion', node);
      }
      if (ts.isObjectLiteralExpression(node)) {
        const context = checker.getContextualType(node);
        if (context !== undefined && isWholeUnion(shapesOf(context))) {
          report('pre-narrowing', node);
        }
        for (const element of node.properties) {
          const value = ts.isPropertyAssignment(element)
            ? element.initializer
            : ts.isShorthandPropertyAssignment(element)
              ? element.name
              : undefined;
          if (
            value !== undefined &&
            propertyName(element) === 'config' &&
            isWholeUnion(shapesOf(checker.getTypeAtLocation(value)))
          ) {
            report('pre-narrowing', element);
          }
        }
      }
      if (ts.isExpression(node)) {
        const form = formOf(node);
        if (form !== undefined && forms.includes(form)) {
          const target = targetOf(checker, node, form);
          if (
            target !== undefined &&
            shapesOf(target).size > 0 &&
            !sourcesOf(checker, node, form).every((each) =>
              fitsByKeys(checker, each, target),
            )
          ) {
            report('forbidden-key', node);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

/** The compiler options of `tsconfig`, as `tsc -p` reads them. */
export function optionsOf(tsconfig: string): ts.CompilerOptions {
  const read = ts.readConfigFile(tsconfig, (file) =>
    fs.readFileSync(file, 'utf8'),
  );
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(tsconfig),
  );
  return { ...parsed.options, noEmit: true };
}
