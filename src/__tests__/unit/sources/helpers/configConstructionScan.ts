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
 * - `forbidden-property` — a property of a config literal that every member
 *   of its contextual type forbids (`?: never`), `undefined` included —
 *   written in the literal or carried by a spread into it;
 * - `cross-spread` — a spread inside a config literal whose source's type is
 *   the other shape, or the whole union, as the checker types it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export type ConstructionRule =
  | 'assertion'
  | 'pre-narrowing'
  | 'forbidden-property'
  | 'cross-spread';

export interface ConstructionFinding {
  readonly rule: ConstructionRule;
  /** `file:line`, the file relative to `root`. */
  readonly where: string;
}

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

/** Whether every member of `context` forbids `name` (`?: never`). */
function forbiddenInAll(
  checker: ts.TypeChecker,
  context: ts.Type,
  name: string,
): boolean {
  const members = membersOf(context).filter((each) => shapesOf(each).size > 0);
  if (members.length === 0) return false;
  return members.every((member) => {
    const property = member.getProperty(name);
    if (property === undefined) return false;
    const declared = checker.getNonNullableType(
      checker.getTypeOfSymbol(property),
    );
    return (declared.flags & ts.TypeFlags.Never) !== 0;
  });
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

/** Every finding of the program's `files`. */
export function scanConstruction(
  files: readonly string[],
  options: ts.CompilerOptions,
  root: string,
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
        const contextShapes =
          context === undefined ? new Set<Shape>() : shapesOf(context);
        if (isWholeUnion(contextShapes)) report('pre-narrowing', node);
        for (const element of node.properties) {
          if (
            ts.isPropertyAssignment(element) &&
            propertyName(element) === 'config' &&
            isWholeUnion(
              shapesOf(checker.getTypeAtLocation(element.initializer)),
            )
          ) {
            report('pre-narrowing', element);
          }
          if (
            ts.isShorthandPropertyAssignment(element) &&
            element.name.text === 'config' &&
            isWholeUnion(shapesOf(checker.getTypeAtLocation(element.name)))
          ) {
            report('pre-narrowing', element);
          }
          if (context === undefined || contextShapes.size === 0) continue;
          const name = propertyName(element);
          if (
            name !== undefined &&
            (ts.isPropertyAssignment(element) ||
              ts.isShorthandPropertyAssignment(element)) &&
            forbiddenInAll(checker, context, name)
          ) {
            report('forbidden-property', element);
          }
          if (ts.isSpreadAssignment(element)) {
            const spreadType = checker.getTypeAtLocation(element.expression);
            // A spread that carries a property the shape forbids: one it
            // holds (a value, or `undefined` set), not an absent `?: never`.
            if (
              checker
                .getPropertiesOfType(spreadType)
                .some(
                  (property) =>
                    carries(checker, property) &&
                    forbiddenInAll(checker, context, property.getName()),
                )
            ) {
              report('forbidden-property', element);
            }
            const spread = shapesOf(spreadType);
            const other =
              isWholeUnion(spread) ||
              (contextShapes.has('rfc') &&
                !contextShapes.has('http') &&
                spread.has('http')) ||
              (contextShapes.has('http') &&
                !contextShapes.has('rfc') &&
                spread.has('rfc'));
            if (other) report('cross-spread', element);
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
