/**
 * Plan step 10.6: every tool's description is assembled — the `description`
 * of every tool definition is a `toolDescription(…)` call, never a string
 * literal, a template or a concatenation — except for a tool still listed in
 * `NOT_YET_ASSEMBLED`, which is refused once it is assembled, so the list
 * only shrinks. Read from the source with the TypeScript parser.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { globSync } from '../../helpers/platform';
import {
  NOT_YET_ASSEMBLED,
  NOT_YET_ASSEMBLED_MOST,
} from '../descriptions/notYetAssembled';

/** The files that define tools: the handlers, and the compact sets' handlers. */
const DEFINING = [
  ...globSync('src/handlers/**/*.ts'),
  ...globSync('src/lib/compact/**/*.ts'),
  ...globSync('compact-*/src/handlers/**/*.ts'),
].filter((file) => !file.includes('__tests__'));

/** One tool definition found: its name, and how its description is made. */
interface Defined {
  readonly file: string;
  readonly name: string;
  readonly assembled: boolean;
  readonly made: string;
}

/**
 * The text of a property's name: a plain identifier, a string, a computed
 * literal (`['description']`) or a computed constant of its file holding
 * one (`[DESCRIPTION]`, `const DESCRIPTION = 'description'`).
 */
function propertyName(
  property: ts.ObjectLiteralElementLike,
): string | undefined {
  const name = property.name;
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (!ts.isComputedPropertyName(name)) return undefined;
  const expression = name.expression;
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  return ts.isIdentifier(expression)
    ? constantText(expression.getSourceFile(), expression.text)
    : undefined;
}

/** The string a `const` of the file holds, by its name; none for another. */
function constantText(source: ts.SourceFile, name: string): string | undefined {
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      found = node.initializer.text;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every `description` property inside `node`, however deep (a variant's own). */
function descriptionsIn(node: ts.Node): ts.Expression[] {
  const found: ts.Expression[] = [];
  const visit = (child: ts.Node): void => {
    if (
      ts.isPropertyAssignment(child) &&
      propertyName(child) === 'description'
    ) {
      found.push(child.initializer);
      return;
    }
    // The input schema's fields are the tool's parameters: one named
    // `description` (a package's, say) is a parameter, not the description.
    if (ts.isPropertyAssignment(child) && propertyName(child) === 'inputSchema')
      return;
    // A nested tool's own definition (a schema field's `describe`) is not
    // this one's description: zod descriptions are calls, never properties.
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

/** Every tool definition of a file: an object literal with a literal `name` and a `description`. */
function definitionsOf(file: string): Defined[] {
  return definitionsOfSource(
    file,
    ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    ),
  );
}

/** Every tool definition of a parsed file. */
function definitionsOfSource(file: string, source: ts.SourceFile): Defined[] {
  const defined: Defined[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const nameProperty = node.properties.find(
        (property) => propertyName(property) === 'name',
      );
      const descriptions = descriptionsIn(node).filter(
        (expression) =>
          // Only this literal's own description, or a variant's spread in.
          expression.parent.parent === node ||
          !ts.isObjectLiteralExpression(expression.parent.parent) ||
          expression.parent.parent.properties.every(
            (property) => propertyName(property) !== 'name',
          ),
      );
      if (
        nameProperty !== undefined &&
        ts.isPropertyAssignment(nameProperty) &&
        ts.isStringLiteral(nameProperty.initializer) &&
        descriptions.length > 0
      ) {
        for (const description of descriptions) {
          defined.push({
            file,
            name: nameProperty.initializer.text,
            assembled:
              ts.isCallExpression(description) &&
              description.expression.getText(source) === 'toolDescription',
            made: description.getText(source).slice(0, 60),
          });
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return defined;
}

describe('every tool description is assembled, or its tool still listed as not yet', () => {
  const defined = DEFINING.flatMap(definitionsOf);

  it('the not-yet list only shrinks: no longer than its committed most', () => {
    assert.ok(
      NOT_YET_ASSEMBLED.size <= NOT_YET_ASSEMBLED_MOST,
      `${NOT_YET_ASSEMBLED.size} listed, at most ${NOT_YET_ASSEMBLED_MOST}`,
    );
  });

  it("reads a computed ['description'] key as the description", () => {
    const file = 'computed.ts';
    const source = ts.createSourceFile(
      file,
      "export const T = { name: 'ToolX', ['description']: 'Written whole.' };",
      ts.ScriptTarget.Latest,
      true,
    );
    assert.deepStrictEqual(
      definitionsOfSource(file, source).map((each) => [
        each.name,
        each.assembled,
      ]),
      [['ToolX', false]],
    );
  });

  it('reads a computed constant key as the description', () => {
    const file = 'constant.ts';
    const source = ts.createSourceFile(
      file,
      "const DESCRIPTION = 'description';\nexport const T = { name: 'ToolY', [DESCRIPTION]: 'Written whole.' };",
      ts.ScriptTarget.Latest,
      true,
    );
    assert.deepStrictEqual(
      definitionsOfSource(file, source).map((each) => [
        each.name,
        each.assembled,
      ]),
      [['ToolY', false]],
    );
  });

  it('reads no input field named description as the description', () => {
    const file = 'field.ts';
    const source = ts.createSourceFile(
      file,
      "export const T = { name: 'ToolZ', description: toolDescription(parts), inputSchema: { description: z.string() } };",
      ts.ScriptTarget.Latest,
      true,
    );
    assert.deepStrictEqual(
      definitionsOfSource(file, source).map((each) => [
        each.name,
        each.assembled,
      ]),
      [['ToolZ', true]],
    );
  });

  it('finds the tool definitions, so the scan is not vacuous', () => {
    assert.ok(defined.length > 200, String(defined.length));
  });

  it('each description is a toolDescription call, unless its tool is listed; a listed tool is not assembled', () => {
    const faults: string[] = [];
    for (const each of defined) {
      const listed = NOT_YET_ASSEMBLED.has(each.name);
      if (!each.assembled && !listed) {
        faults.push(`${each.file} ${each.name}: written whole (${each.made})`);
      }
      if (each.assembled && listed) {
        faults.push(`${each.file} ${each.name}: assembled, still listed`);
      }
    }
    assert.deepStrictEqual(faults, []);
  });
});
