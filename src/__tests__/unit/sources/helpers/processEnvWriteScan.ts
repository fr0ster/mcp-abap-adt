/**
 * Every write to `process.env` in a source, read from its syntax tree
 * (`ts.createSourceFile`; no regular expression): the whole object
 * replaced, a dot or computed-key assignment (compound ones and `++` /
 * `--` included), a `delete`, and `Object.assign` / `Object.defineProperty`
 * / `Reflect.set` / `Reflect.deleteProperty` with it as the target — on
 * `process.env` itself and on an alias of it: a binding in the same file
 * initialised to `process.env`, a parameter defaulted to it, and any binding
 * declared `NodeJS.ProcessEnv` (a function that writes an env-typed
 * parameter can be handed `process.env`).
 *
 * Residual: an untyped alias handed across files is not seen; the type rule
 * covers every alias the code has.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export interface EnvWrite {
  /** `file:line`, the file relative to the scanned root. */
  readonly where: string;
  /** The form: `assignment`, `delete`, `Object.assign`, … */
  readonly form: string;
}

const ASSIGNMENTS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

const TARGET_CALLS = new Set([
  'Object.assign',
  'Object.defineProperty',
  'Object.defineProperties',
  'Reflect.set',
  'Reflect.deleteProperty',
  'Reflect.defineProperty',
]);

/** `process.env`, as written. */
function isProcessEnv(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'env' &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process'
  );
}

/** Whether a type annotation names `NodeJS.ProcessEnv`. */
function isProcessEnvType(type: ts.TypeNode | undefined): boolean {
  return (
    type !== undefined &&
    ts.isTypeReferenceNode(type) &&
    ts.isQualifiedName(type.typeName) &&
    ts.isIdentifier(type.typeName.left) &&
    type.typeName.left.text === 'NodeJS' &&
    type.typeName.right.text === 'ProcessEnv'
  );
}

/** The names bound to `process.env` in a file (see the module's doc). */
function aliasesIn(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      ts.isIdentifier(node.name) &&
      ((node.initializer !== undefined && isProcessEnv(node.initializer)) ||
        isProcessEnvType(node.type))
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

/** Whether `node` is `process.env` or an alias of it. */
function isEnv(node: ts.Expression, aliases: Set<string>): boolean {
  const bare = ts.isParenthesizedExpression(node) ? node.expression : node;
  return (
    isProcessEnv(bare) || (ts.isIdentifier(bare) && aliases.has(bare.text))
  );
}

/** Whether `node` is the environment or one of its members. */
function isEnvOrMember(node: ts.Expression, aliases: Set<string>): boolean {
  if (isProcessEnv(node)) return true;
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return isEnv(node.expression, aliases);
  }
  return false;
}

/** The dotted name of a callee (`Object.assign`), or undefined. */
function calleeName(node: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return `${node.expression.text}.${node.name.text}`;
  }
  return undefined;
}

/** Every write to the environment in `files`, relative to `root`. */
export function envWritesIn(
  files: readonly string[],
  root: string,
): EnvWrite[] {
  const found: EnvWrite[] = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const aliases = aliasesIn(source);
    const report = (node: ts.Node, form: string) => {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      found.push({ where: `${file}:${line}`, form });
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isBinaryExpression(node) &&
        ASSIGNMENTS.has(node.operatorToken.kind) &&
        isEnvOrMember(node.left, aliases) &&
        // A whole alias reassigned is a local, not the environment.
        !(ts.isIdentifier(node.left) && aliases.has(node.left.text))
      ) {
        report(node, 'assignment');
      } else if (
        (ts.isPrefixUnaryExpression(node) ||
          ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken) &&
        isEnvOrMember(node.operand, aliases) &&
        !ts.isIdentifier(node.operand)
      ) {
        report(node, 'increment');
      } else if (
        ts.isDeleteExpression(node) &&
        isEnvOrMember(node.expression, aliases)
      ) {
        report(node, 'delete');
      } else if (ts.isCallExpression(node)) {
        const name = calleeName(node.expression);
        const target = node.arguments[0];
        if (
          name !== undefined &&
          TARGET_CALLS.has(name) &&
          target !== undefined &&
          isEnv(target, aliases)
        ) {
          report(node, name);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
