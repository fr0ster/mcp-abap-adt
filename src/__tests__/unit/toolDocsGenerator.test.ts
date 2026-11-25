import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { assertMatchObject } from '../helpers/assertions';
import { repositoryRoot } from '../helpers/repoRoot';

const GENERATOR = path.join(
  repositoryRoot(__dirname),
  'tools',
  'generate-tools-docs.js',
);

/**
 * The generator reads what the server builds — the handler groups' built
 * definitions and the built modules that hold them — and never parses
 * source text: a reader of source text documented a parameter out of a
 * comment, cut descriptions at a `+`, and missed every spread-in property.
 */
describe('the tool-docs generator reads no source text', () => {
  const text = fs.readFileSync(GENERATOR, 'utf8');

  it('opens no file to read it', () => {
    assert.ok(!text.includes('readFileSync'));
    assert.ok(!text.includes('readFile('));
  });

  it('exports no source parser', () => {
    const exported = Object.keys(require(GENERATOR));
    assert.ok(!exported.includes('parseTopLevelProperties'));
    assert.ok(!exported.includes('extractToolDefinition'));
  });
});

/**
 * The reference shows what the server registers: every tool's parameters
 * come from its built definition, so a property a schema spreads in
 * (`...TABLE_TYPE_DEFINITION_PROPERTIES`, `...DETAIL_PROPERTY`), which the
 * text reader cannot follow, is listed with its type, enum and words.
 */
describe('the tool-docs generator lists the built schema', () => {
  const { loadToolsFromHandlers, renderParams } = require(
    path.join(repositoryRoot(__dirname), 'tools', 'generate-tools-docs.js'),
  );
  const tools: ReadonlyArray<{
    name: string;
    level: string;
    objectFolder: string;
    filePath: string;
    inputSchema: { properties: Record<string, { enum?: readonly string[] }> };
  }> = loadToolsFromHandlers();
  const named = (name: string) => {
    const tool = tools.find((t) => t.name === name && t.level === 'high');
    if (tool === undefined) throw new Error(`no high tool ${name}`);
    return tool;
  };

  it('lists a spread-in property of CreateTableType with its enum', () => {
    const tool = named('CreateTableType');
    assert.ok(
      tool.inputSchema.properties.row_type_kind?.enum?.includes(
        'dictionaryType',
      ),
    );
    const text: string = renderParams(tool);
    assert.ok(
      text.includes(
        '- `row_type_kind` (string, optional, one of: `predefinedAbapType`, `dictionaryType`,',
      ),
    );
    assert.ok(text.includes('- `key_kind` (string, optional, one of:'));
  });

  it('lists every tool the full stdio binary serves, and no other', () => {
    const { fullToolSet } = require(
      path.join(repositoryRoot(__dirname), 'dist', 'lib', 'toolSet.js'),
    );
    const served: string[] = fullToolSet
      // The pages document every set with the data tools served.
      .groups({ connection: null }, 'stdio', { dataTools: true })
      .flatMap(
        (group: { getHandlers(): { toolDefinition: { name: string } }[] }) =>
          group.getHandlers().map((entry) => entry.toolDefinition.name),
      );
    const listed = new Set(tools.map((tool) => tool.name));
    assert.deepStrictEqual([...listed].sort(), [...new Set(served)].sort());
  });

  it('files a tool under the object and source of the module that holds it', () => {
    assertMatchObject(named('ActivateClass'), {
      objectFolder: 'class',
      filePath: 'src/handlers/class/low/handleActivateClass.ts',
    });
  });

  it('lists the spread-in detail property', () => {
    assert.ok(
      renderParams(named('CreateTableType')).includes(
        '- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`)',
      ),
    );
  });
});

/**
 * A tool whose module sits under no level folder is listed under its handler
 * group's level, from the generator's hand table: a group missing there must
 * fail here, not only when the generator runs.
 */
describe('every handler group the docs read has a page level', () => {
  const { GROUP_LEVELS, servedEntries } = require(GENERATOR);
  const { fullToolSet, fullReadOnlyToolSet } = require(
    path.join(repositoryRoot(__dirname), 'dist', 'lib', 'toolSet.js'),
  );
  const groups: string[] = [
    ...new Set<string>(
      [fullToolSet, fullReadOnlyToolSet]
        .flatMap((set) => servedEntries(set))
        .map((entry: { group: string }) => entry.group),
    ),
  ];

  it('reads at least one group', () => {
    assert.ok(groups.length > 0);
  });

  for (const group of groups) {
    it(format('%s has a level', group), () => {
      assert.equal(typeof GROUP_LEVELS[group], 'string');
    });
  }
});

/**
 * Each tool page's prompt pointer names exactly the prompts whose steps call
 * that tool, as `listed-prompts.json` carries them (`tools`, read from the
 * instruction data), on every page `npm run docs:tools` writes.
 */
describe('the prompt pointers on the tool pages name the prompts that call each tool', () => {
  const root = repositoryRoot(__dirname);
  const listed: {
    prompts: Record<string, ReadonlyArray<{ value: { tools: string[] } }>>;
  } = JSON.parse(
    fs.readFileSync(
      path.join(root, 'tests', 'fixtures', 'tools', 'listed-prompts.json'),
      'utf8',
    ),
  );
  const expected = new Map<string, Set<string>>();
  for (const [prompt, entries] of Object.entries(listed.prompts)) {
    for (const { value } of entries) {
      for (const tool of value.tools) {
        const names = expected.get(tool) ?? new Set<string>();
        names.add(prompt);
        expected.set(tool, names);
      }
    }
  }

  /** Tool name -> the prompts its section's pointer line names, on one page. */
  const pointersOf = (page: string): Map<string, string[]> => {
    const byTool = new Map<string, string[]>();
    let tool: string | undefined;
    for (const line of page.split('\n')) {
      if (line.startsWith('#### ')) {
        tool = line.slice('#### '.length).split(' (')[0];
        if (tool !== undefined) byTool.set(tool, []);
      } else if (tool !== undefined && line.startsWith('**Prompt:**')) {
        byTool.set(
          tool,
          line
            .split('(')[0]
            ?.split('`')
            .filter((_, index) => index % 2 === 1) ?? [],
        );
      }
    }
    return byTool;
  };

  for (const page of [
    'AVAILABLE_TOOLS.md',
    'AVAILABLE_TOOLS_HIGH.md',
    'AVAILABLE_TOOLS_READONLY.md',
  ]) {
    it(page, () => {
      const pointers = pointersOf(
        fs.readFileSync(path.join(root, 'docs', 'user-guide', page), 'utf8'),
      );
      assert.ok(pointers.size > 0, `${page} lists tools`);
      for (const [tool, named] of pointers) {
        assert.deepEqual(
          named,
          [...(expected.get(tool) ?? [])].sort(),
          `${page} ${tool}`,
        );
      }
    });
  }

  it('the update and unit_test prompts point from the tools they write and run', () => {
    for (const [tool, prompt] of [
      ['UpdateClass', 'update'],
      ['RunAbapUnit', 'unit_test'],
    ] as const) {
      assert.ok(expected.get(tool)?.has(prompt), `${prompt} calls ${tool}`);
    }
  });
});
