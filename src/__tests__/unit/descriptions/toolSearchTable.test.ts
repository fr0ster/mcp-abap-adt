/**
 * `tools/tool-search.json`, the search texts of every tool: an entry for
 * every tool any set serves (every transport, every system type), none for a
 * tool no set serves, each with keywords and a semantic sentence; shipped in
 * the package, read through one literal `require` (a bundler carries it), and
 * served by `tools/list` on each tool as `_meta["mcp-abap-adt/search"]`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TOOL_SEARCH_META_KEY,
  toolSearchText,
  toolSearchTexts,
} from '../../../lib/toolSearch';
import {
  SETS,
  type ServedTool,
  SYSTEM_TYPES,
  servedCatalog,
  TRANSPORTS,
} from './catalog';

const REPO = path.join(__dirname, '..', '..', '..', '..');

async function everyServedTool(): Promise<Map<string, ServedTool>> {
  const served = new Map<string, ServedTool>();
  for (const [, set] of SETS) {
    for (const transport of TRANSPORTS) {
      for (const systemType of SYSTEM_TYPES) {
        for (const tool of await servedCatalog(set, transport, systemType)) {
          if (!served.has(tool.name)) served.set(tool.name, tool);
        }
      }
    }
  }
  return served;
}

describe('tools/tool-search.json', () => {
  let served: Map<string, ServedTool>;
  beforeAll(async () => {
    served = await everyServedTool();
  });

  it('has an entry for every tool a set serves, and none for a tool no set serves', () => {
    const table = toolSearchTexts();
    const missing = [...served.keys()].filter((name) => !table.has(name));
    const unknown = [...table.keys()].filter((name) => !served.has(name));
    expect({ missing, unknown }).toEqual({ missing: [], unknown: [] });
  });

  it('gives each tool keywords and one or two semantic sentences', () => {
    const malformed: string[] = [];
    for (const [name, text] of toolSearchTexts()) {
      const keywords = text.keywords.filter(
        (keyword) => typeof keyword === 'string' && keyword.trim() !== '',
      );
      if (keywords.length < 3 || keywords.length !== text.keywords.length) {
        malformed.push(`${name}: keywords`);
      }
      if (new Set(text.keywords).size !== text.keywords.length) {
        malformed.push(`${name}: repeated keyword`);
      }
      const sentences = text.semantic
        .split('. ')
        .flatMap((part) => part.split('? '))
        .flatMap((part) => part.split('! '))
        .filter((part) => part.trim() !== '');
      if (
        text.semantic.trim() === '' ||
        !text.semantic.endsWith('.') ||
        sentences.length > 2
      ) {
        malformed.push(`${name}: semantic`);
      }
    }
    expect(malformed).toEqual([]);
  });

  it('is what tools/list carries on each tool, under _meta["mcp-abap-adt/search"]', () => {
    expect(TOOL_SEARCH_META_KEY).toBe('mcp-abap-adt/search');
    const differing: string[] = [];
    for (const [name, tool] of served) {
      const text = toolSearchText(name);
      if (
        text === undefined ||
        JSON.stringify(tool.search) !==
          JSON.stringify({ keywords: text.keywords, semantic: text.semantic })
      ) {
        differing.push(name);
      }
    }
    expect(differing).toEqual([]);
  });

  it('ships in the package', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    ) as { files: string[] };
    expect(manifest.files).toContain('tools/tool-search.json');
  });

  // The portable build bundles the bin into a single executable, where no
  // file lies beside the code: the table must travel inside the bundle.
  it('is read through one require of a literal path, which a bundler inlines', () => {
    const source = fs.readFileSync(
      path.join(REPO, 'src/lib/toolSearch/index.ts'),
      'utf8',
    );
    const literal = "require('../../../tools/tool-search.json')";
    expect(source.split(literal)).toHaveLength(2);
    expect(source).not.toContain('readFileSync');
    expect(
      path.resolve(
        REPO,
        'src/lib/toolSearch',
        '../../../tools/tool-search.json',
      ),
    ).toBe(path.join(REPO, 'tools', 'tool-search.json'));
  });
});
