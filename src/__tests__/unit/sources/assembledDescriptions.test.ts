/**
 * Plan step 10.6: every tool's description is assembled — the `description`
 * of every tool definition is a `toolDescription(…)` call, never a string
 * literal, a template or a concatenation — except for a tool still listed in
 * `NOT_YET_ASSEMBLED`, which is refused once it is assembled, so the list
 * only shrinks. One rule: the description is a call of `toolDescription`
 * itself (its parts made by any helper: `toolDescription(runParts(…))`), or
 * of a factory exported from `src/lib/description/` whose every `return` is
 * such a call (`createTool`, `checkTool`, …); anything else is written whole.
 * Read from the source with the TypeScript parser.
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

/** The builder every assembled description is made by. */
const BUILDER = 'toolDescription';

/** Every `return` expression of a function's own body (not of a function nested in it). */
function returnsOf(body: ts.Node): (ts.Expression | undefined)[] {
  const found: (ts.Expression | undefined)[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

/**
 * The factories of the given sources that assemble a description: every
 * exported function whose every `return` is a call of the builder or of
 * another such function of these sources (a private helper included, as
 * `kinds.ts`'s `kind`), found to a fixed point.
 */
function factoriesOf(sources: readonly ts.SourceFile[]): Set<string> {
  const functions = sources.flatMap((source) =>
    source.statements.flatMap((statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      statement.body !== undefined
        ? [
            {
              name: statement.name.text,
              exported:
                ts
                  .getModifiers(statement)
                  ?.some(
                    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
                  ) === true,
              returns: returnsOf(statement.body),
              source,
            },
          ]
        : [],
    ),
  );
  const assembling = new Set<string>([BUILDER]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const each of functions) {
      if (assembling.has(each.name) || each.returns.length === 0) continue;
      const all = each.returns.every(
        (expression) =>
          expression !== undefined &&
          ts.isCallExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          assembling.has(expression.expression.text),
      );
      if (all) {
        assembling.add(each.name);
        grown = true;
      }
    }
  }
  return new Set(
    [
      BUILDER,
      ...functions.filter((each) => each.exported).map((each) => each.name),
    ].filter((name) => assembling.has(name)),
  );
}

/** The files of the builder and its factories. */
const DESCRIPTION_SOURCES = globSync('src/lib/description/*.ts').map((file) =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  ),
);

/** The calls that assemble a description: the builder, and each factory that returns its call. */
const ASSEMBLING: ReadonlySet<string> = factoriesOf(DESCRIPTION_SOURCES);

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
              ts.isIdentifier(description.expression) &&
              ASSEMBLING.has(description.expression.text),
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

  it('finds the factories that return a toolDescription call: exported, through a private helper, and only those', () => {
    const source = ts.createSourceFile(
      'factories.ts',
      [
        'function kind(p) { return toolDescription(p); }',
        'export function createTool(t) { return kind(t); }',
        'export function direct(t) { return toolDescription(t); }',
        'export function runParts(t) { return { purpose: t }; }',
        'export function mixed(t) { if (t) return toolDescription(t); return words(t); }',
        'export function wrapped(t) { const f = () => words(t); return toolDescription(t); }',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );
    assert.deepStrictEqual([...factoriesOf([source])].sort(), [
      'createTool',
      'direct',
      'toolDescription',
      'wrapped',
    ]);
  });

  it('finds the shipped factories: each kind factory, and no parts maker', () => {
    for (const name of [
      'toolDescription',
      'createTool',
      'updateTool',
      'deleteTool',
      'checkTool',
      'activateTool',
      'validateTool',
    ]) {
      assert.ok(ASSEMBLING.has(name), name);
    }
    for (const name of [
      'runParts',
      'sourceReader',
      'partsOfDescription',
      'purpose',
    ]) {
      assert.ok(!ASSEMBLING.has(name), name);
    }
  });

  it('reads a factory call and a toolDescription call over made parts as assembled, and any other call as written whole', () => {
    const file = 'kind.ts';
    const source = ts.createSourceFile(
      file,
      [
        "export const A = { name: 'ToolA', description: createTool(parts) };",
        "export const B = { name: 'ToolB', description: wordsOf(parts) };",
        "export const C = { name: 'ToolC', description: toolDescription(runParts(tool)) };",
        "export const D = { name: 'ToolD', description: runParts(tool) };",
        "export const E = { name: 'ToolE', description: kinds.createTool(parts) };",
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );
    assert.deepStrictEqual(
      definitionsOfSource(file, source).map((each) => [
        each.name,
        each.assembled,
      ]),
      [
        ['ToolA', true],
        ['ToolB', false],
        ['ToolC', true],
        ['ToolD', false],
        ['ToolE', false],
      ],
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
