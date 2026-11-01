import fs from 'node:fs';
import path from 'node:path';

const GENERATOR = path.join(__dirname, '../../../tools/generate-tools-docs.js');

/**
 * The generator reads what the server builds — the handler groups' built
 * definitions and the built modules that hold them — and never parses
 * source text: a reader of source text documented a parameter out of a
 * comment, cut descriptions at a `+`, and missed every spread-in property.
 */
describe('the tool-docs generator reads no source text', () => {
  const text = fs.readFileSync(GENERATOR, 'utf8');

  it('opens no file to read it', () => {
    expect(text).not.toContain('readFileSync');
    expect(text).not.toContain('readFile(');
  });

  it('exports no source parser', () => {
    const exported = Object.keys(require(GENERATOR));
    expect(exported).not.toContain('parseTopLevelProperties');
    expect(exported).not.toContain('extractToolDefinition');
  });
});

/**
 * The reference shows what the server registers: every tool's parameters
 * come from its built definition, so a property a schema spreads in
 * (`...TABLE_TYPE_DEFINITION_PROPERTIES`, `...DETAIL_PROPERTY`), which the
 * text reader cannot follow, is listed with its type, enum and words.
 */
describe('the tool-docs generator lists the built schema', () => {
  const {
    loadToolsFromHandlers,
    renderParams,
  } = require('../../../tools/generate-tools-docs.js');
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
    expect(tool.inputSchema.properties.row_type_kind?.enum).toContain(
      'dictionaryType',
    );
    const text: string = renderParams(tool);
    expect(text).toContain(
      '- `row_type_kind` (string, optional, one of: `predefinedAbapType`, `dictionaryType`,',
    );
    expect(text).toContain('- `key_kind` (string, optional, one of:');
  });

  it('lists every tool the full stdio binary serves, and no other', () => {
    const { fullToolSet } = require('../../../dist/lib/toolSet.js');
    const served: string[] = fullToolSet
      .groups({ connection: null }, 'stdio')
      .flatMap(
        (group: { getHandlers(): { toolDefinition: { name: string } }[] }) =>
          group.getHandlers().map((entry) => entry.toolDefinition.name),
      );
    const listed = new Set(tools.map((tool) => tool.name));
    expect([...listed].sort()).toEqual([...new Set(served)].sort());
  });

  it('files a tool under the object and source of the module that holds it', () => {
    expect(named('ActivateClass')).toMatchObject({
      objectFolder: 'class',
      filePath: 'src/handlers/class/low/handleActivateClass.ts',
    });
  });

  it('lists the spread-in detail property', () => {
    expect(renderParams(named('CreateTableType'))).toContain(
      '- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`)',
    );
  });
});
