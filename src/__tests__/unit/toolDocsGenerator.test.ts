const {
  parseTopLevelProperties,
} = require('../../../tools/generate-tools-docs.js');

/**
 * The generator reads a `TOOL_DEFINITION` as text, and text includes
 * comments.
 *
 * A sentence inside an `inputSchema` — "a refinement a caller may or may not
 * want:" — put a parameter called `want` into three published documentation
 * files: typed `any`, described with nothing, and impossible to pass. Prose
 * belongs in a schema block as much as anywhere else; it was this reader that
 * had to learn to step over it.
 */
describe('the tool-docs generator reads properties, not prose', () => {
  it('invents no parameter out of a line comment', () => {
    const properties = `
      name: {
        type: 'string',
        description: 'Metadata extension name.',
      },
      // The one knob that is not a knob: a refinement a caller may or may not
      // want: ask for the version an extension does not have and the endpoint
      // answers notProcessed.
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        default: 'active',
        description: 'Which version to check.',
      },
    `;

    const parsed = parseTopLevelProperties(properties);

    expect(Object.keys(parsed).sort()).toEqual(['name', 'version']);
    expect(parsed.version.type).toBe('string');
    expect(parsed.version.default).toBe('active');
  });

  it('invents none out of a block comment either', () => {
    const properties = `
      /* a note: mentioning anything: here must not become a parameter */
      only_one: { type: 'boolean', description: 'The only one.' },
    `;

    expect(Object.keys(parseTopLevelProperties(properties))).toEqual([
      'only_one',
    ]);
  });

  it('still reads a property whose description contains a colon', () => {
    // The scanner steps over comments, not over content.
    const properties = `
      detail: {
        type: 'string',
        description: 'How much to return: terse, full or raw.',
      },
    `;
    const parsed = parseTopLevelProperties(properties);
    expect(parsed.detail.description).toContain('terse, full or raw');
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

  it('lists the spread-in detail property', () => {
    expect(renderParams(named('CreateTableType'))).toContain(
      '- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`)',
    );
  });
});
