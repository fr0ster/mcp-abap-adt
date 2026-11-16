/**
 * The committed template (`tests/test-config.yaml.template`) and the live
 * sources agree on the top-level sections — a cheap, partial guard:
 *
 * - **Every handler section a tester reads is in the template:** the first
 *   argument of `new LambdaTester(…)`, `new HighTester(…)`, `getTestCase(…)`,
 *   `getTestCaseDefinition(…)` and `getEnabledTestCase(…)`, when it is a
 *   string literal. A section named through a variable is not seen.
 * - **Every top-level section of the template is read by something:** a
 *   live source names it as a property (`config.environment`) or as a string
 *   (a tester's section, `configText(config, 'access', …)`). Naming is not
 *   reading, so a stale mention keeps a section alive.
 *
 * The live sources are `src/__tests__/integration` and `src/__tests__/admin`,
 * parsed with TypeScript, so a comment cannot fake a read; the template is
 * read with js-yaml, as the harness reads a config.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as yaml from 'js-yaml';
import * as ts from 'typescript';
import { repositoryRoot } from '../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);
const TEMPLATE = 'tests/test-config.yaml.template';
const LIVE_ROOTS = ['src/__tests__/integration', 'src/__tests__/admin'];

/** The calls whose first argument is a handler section of the test config. */
const SECTION_READERS = new Set([
  'LambdaTester',
  'HighTester',
  'getTestCase',
  'getTestCaseDefinition',
  'getEnabledTestCase',
]);

/** Every `.ts` file under `root`, relative to the repository, `/`-separated. */
function sourcesUnder(root: string): string[] {
  return fs
    .readdirSync(path.join(REPO, root), {
      withFileTypes: true,
      recursive: true,
    })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) =>
      path
        .relative(REPO, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    );
}

/** What the live sources name: the sections testers read, every property name and every string. */
interface Named {
  readonly sections: Map<string, string>;
  readonly properties: Set<string>;
  readonly strings: Set<string>;
}

function namedIn(files: readonly string[]): Named {
  const named: Named = {
    sections: new Map(),
    properties: new Set(),
    strings: new Set(),
  };
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(REPO, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (
        (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
        ts.isIdentifier(node.expression) &&
        SECTION_READERS.has(node.expression.text)
      ) {
        const first = node.arguments?.[0];
        if (first !== undefined && ts.isStringLiteralLike(first)) {
          named.sections.set(first.text, file);
        }
      }
      if (ts.isPropertyAccessExpression(node)) {
        named.properties.add(node.name.text);
      }
      if (ts.isStringLiteralLike(node)) named.strings.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return named;
}

/** The top-level keys of the template. */
function templateSections(): string[] {
  const parsed: unknown = yaml.load(
    fs.readFileSync(path.join(REPO, TEMPLATE), 'utf8'),
  );
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${TEMPLATE} is not a mapping`);
  }
  return Object.keys(parsed);
}

describe('the test-config template and the live sources', () => {
  const named = namedIn(LIVE_ROOTS.flatMap(sourcesUnder));
  const sections = templateSections();

  it('finds the sections the testers read', () => {
    assert.ok(named.sections.size > 40, `${named.sections.size} sections`);
  });

  it('holds every handler section a tester reads', () => {
    const inTemplate = new Set(sections);
    assert.deepEqual(
      [...named.sections]
        .filter(([section]) => !inTemplate.has(section))
        .map(([section, file]) => `${section} (read by ${file})`),
      [],
    );
  });

  it('holds no top-level section that nothing reads', () => {
    assert.deepEqual(
      sections.filter(
        (section) =>
          !named.properties.has(section) && !named.strings.has(section),
      ),
      [],
    );
  });
});
