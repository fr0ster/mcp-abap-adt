/**
 * Every `JSON.stringify` that indents, read from a source's syntax tree
 * (`ts.createSourceFile`; no regular expression): a call of
 * `JSON.stringify` — written as `JSON.stringify` or `JSON['stringify']` —
 * given a third argument, whatever it is (`2`, `'\t'`, a variable).
 *
 * An answer is minified: its indent alone is a quarter of a JSON answer, and
 * the model gains nothing from it. A log line or a file written to disk may
 * keep its indent; those sites are named in the test's allowlist, each by
 * its file and enclosing function.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

export interface IndentedStringify {
  /** `file#function`, the file relative to the scanned root; `<top>` outside any function. */
  readonly site: string;
  /** `file:line`. */
  readonly where: string;
}

/** `JSON.stringify` or `JSON['stringify']`, as written. */
function isJsonStringify(node: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      node.name.text === 'stringify' &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'JSON'
    );
  }
  if (ts.isElementAccessExpression(node)) {
    return (
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'stringify' &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'JSON'
    );
  }
  return false;
}

/** The name of the function a node sits in, or `<top>`. */
function enclosingFunction(node: ts.Node): string {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (
      (ts.isFunctionDeclaration(at) ||
        ts.isMethodDeclaration(at) ||
        ts.isGetAccessorDeclaration(at)) &&
      at.name !== undefined
    ) {
      return at.name.getText();
    }
    if (
      (ts.isArrowFunction(at) || ts.isFunctionExpression(at)) &&
      ts.isVariableDeclaration(at.parent)
    ) {
      return at.parent.name.getText();
    }
  }
  return '<top>';
}

/** Every indenting `JSON.stringify` in `files` (relative to `root`). */
export function indentedStringifiesIn(
  files: readonly string[],
  root: string,
): IndentedStringify[] {
  const found: IndentedStringify[] = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        isJsonStringify(node.expression) &&
        node.arguments.length >= 3
      ) {
        const { line } = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        found.push({
          site: `${file}#${enclosingFunction(node)}`,
          where: `${file}:${line + 1}`,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
