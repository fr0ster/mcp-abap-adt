/**
 * The JSON input schema every tool lists, read from each of the twelve
 * binaries' servers as a client reads it (`tools/list`): stdio over an
 * in-memory transport, SSE over a real SSE stream, Streamable HTTP over real
 * HTTP — per declared system type (`SAP_SYSTEM_TYPE`, which a launcher
 * requires), so the variant projection (`listedTool`), the declared
 * `state_handle` of the HTTP binaries and every other edit a server makes
 * to a tool's schema before it lists it are in what is compared.
 *
 * Beside the schemas, the search texts every binary lists under
 * `_meta["mcp-abap-adt/search"]`, and a check of them against
 * `tools/tool-search.json`, the file they are projected from: every listed
 * tool has its entry, and every listed keyword is the file's.
 *
 * The fixture holds, per tool, each distinct value listed and every
 * `<system type> <binary>` that lists it: every listing, each value once.
 * Each server gets the background-run store where its launcher hands one
 * over; none strips `background` from a schema (only `HandlerExporter`, an
 * embedder's path, does, and it is not one of the twelve binaries).
 *
 * The fixture is the baseline of the move of the tool definitions to zod: a
 * difference after it is a defect of the migration, unless it is a stated fix.
 *
 * `WRITE_LISTED_SCHEMAS=1 npm test -- src/__tests__/unit/toolSet/listedSchemas.test.ts`
 * writes the fixture first (refused under CI).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { TOOL_SEARCH_META_KEY } from '../../../lib/toolSearch';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import {
  type ListedTool,
  type Listing,
  listBinaries,
  type SystemType,
} from '../../helpers/servedTools';

jest.setTimeout(300_000);

const REPO = path.join(__dirname, '..', '..', '..', '..');
const FIXTURE = path.join(
  REPO,
  'tests',
  'fixtures',
  'tools',
  'listed-schemas.json',
);
const TOOL_SEARCH_FILE = path.join(REPO, 'tools', 'tool-search.json');

const SYSTEM_TYPES: readonly SystemType[] = ['onprem', 'cloud', 'legacy'];

/** One distinct listed value of a tool, and every `<system type> <binary>` listing it. */
interface Listed {
  readonly listedBy: string[];
  readonly value: unknown;
}

/** Tool → its distinct listed values, in listing order. */
type Grouped = Record<string, Listed[]>;

/** `value[key]` when `value` is an object, read as data from outside the types. */
function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The keys of `value` when it is an object, `[]` else. */
const keysOf = (value: unknown): string[] =>
  typeof value === 'object' && value !== null ? Object.keys(value) : [];

const searchOf = (tool: ListedTool): unknown =>
  tool._meta?.[TOOL_SEARCH_META_KEY];

/**
 * Tool → each distinct value `pick` reads from it, with every listing that
 * lists that value: the listings of all binaries on all system types, each
 * tool's values once. Tools sorted by name; values in listing order.
 */
function grouped(
  listings: readonly Listing[],
  pick: (tool: ListedTool) => unknown,
): Grouped {
  const byTool = new Map<string, Map<string, Listed>>();
  for (const { systemType, bin, tools } of listings) {
    for (const tool of tools) {
      const value = pick(tool);
      const key = JSON.stringify(value) ?? 'undefined';
      const values = byTool.get(tool.name) ?? new Map<string, Listed>();
      byTool.set(tool.name, values);
      const known = values.get(key);
      if (known === undefined) {
        values.set(key, { listedBy: [`${systemType} ${bin}`], value });
      } else {
        known.listedBy.push(`${systemType} ${bin}`);
      }
    }
  }
  return Object.fromEntries(
    [...byTool]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, values]) => [name, [...values.values()]]),
  );
}

/** A fixture: one line per distinct value of a tool, so a change reads as that line. */
function render(fixture: { schemas: Grouped; search: Grouped }): string {
  const section = (values: Grouped): string =>
    Object.entries(values)
      .map(([name, listed]) => {
        const lines = listed.map((each) => `      ${JSON.stringify(each)}`);
        return `    ${JSON.stringify(name)}: [\n${lines.join(',\n')}\n    ]`;
      })
      .join(',\n');
  return `{\n  "schemas": {\n${section(fixture.schemas)}\n  },\n  "search": {\n${section(fixture.search)}\n  }\n}\n`;
}

/** `tools/tool-search.json` as the file states it: tool → every keyword it names. */
function fileKeywords(): Map<string, Set<string>> {
  const parsed: unknown = JSON.parse(fs.readFileSync(TOOL_SEARCH_FILE, 'utf8'));
  const out = new Map<string, Set<string>>();
  if (typeof parsed !== 'object' || parsed === null) return out;
  for (const [name, entry] of Object.entries(parsed)) {
    const words = new Set<string>();
    const keywords = field(entry, 'keywords');
    if (Array.isArray(keywords)) for (const k of keywords) words.add(String(k));
    const members = field(entry, 'members');
    if (typeof members === 'object' && members !== null) {
      for (const list of Object.values(members)) {
        if (Array.isArray(list)) for (const k of list) words.add(String(k));
      }
    }
    out.set(name, words);
  }
  return out;
}

/** The keywords a listed search text names, `[]` when it names none. */
function listedKeywords(search: unknown): string[] {
  const keywords = field(search, 'keywords');
  return Array.isArray(keywords) ? keywords.map(String) : [];
}

describe('the input schema every binary lists, per system type (WRITE_LISTED_SCHEMAS=1 rewrites the fixture)', () => {
  let standIn: AdtStandIn;
  const listings: Listing[] = [];
  let schemas: Grouped = {};
  let search: Grouped = {};
  let savedSystemType: string | undefined;

  beforeAll(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    resetProcessLatchForTests();
    savedSystemType = process.env.SAP_SYSTEM_TYPE;
    standIn = await adtStandIn();
    listings.push(...(await listBinaries(SYSTEM_TYPES, standIn)));
    schemas = grouped(listings, (tool) => tool.inputSchema);
    search = grouped(listings, searchOf);
    if (process.env.WRITE_LISTED_SCHEMAS === '1') {
      if (process.env.CI) {
        throw new Error('WRITE_LISTED_SCHEMAS is refused under CI');
      }
      fs.writeFileSync(FIXTURE, render({ schemas, search }));
    }
  });

  afterAll(async () => {
    await standIn?.close();
    if (savedSystemType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = savedSystemType;
    resetProcessLatchForTests();
    jest.restoreAllMocks();
  });

  /** The fixture's `section`, as the file states it. */
  const frozen = (section: 'schemas' | 'search'): unknown =>
    field(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')), section);

  it('lists all twelve binaries on every system type, and many tools on onprem and cloud, so the comparison is not vacuous', () => {
    for (const systemType of SYSTEM_TYPES) {
      const bins = listings
        .filter((listing) => listing.systemType === systemType)
        .map((listing) => listing.bin);
      expect({ systemType, bins: new Set(bins).size }).toEqual({
        systemType,
        bins: 12,
      });
    }
    for (const listing of listings) {
      if (listing.systemType === 'legacy') continue;
      expect(listing.tools.length).toBeGreaterThan(10);
    }
  });

  it('every binary on every system type lists exactly the input schemas of the fixture', () => {
    const fixture = frozen('schemas');
    for (const [tool, listed] of Object.entries(schemas)) {
      expect({ tool, listed }).toEqual({ tool, listed: field(fixture, tool) });
    }
    expect(Object.keys(schemas)).toEqual(keysOf(fixture));
  });

  it('every binary on every system type lists exactly the search texts of the fixture', () => {
    const fixture = frozen('search');
    for (const [tool, listed] of Object.entries(search)) {
      expect({ tool, listed }).toEqual({ tool, listed: field(fixture, tool) });
    }
    expect(Object.keys(search)).toEqual(keysOf(fixture));
  });

  it('every listed tool has its entry in tools/tool-search.json, and every keyword it lists is the file’s', () => {
    const file = fileKeywords();
    const missing = new Set<string>();
    const foreign = new Set<string>();
    for (const { tools } of listings) {
      for (const tool of tools) {
        const words = file.get(tool.name);
        if (words === undefined) {
          missing.add(tool.name);
          continue;
        }
        for (const keyword of listedKeywords(searchOf(tool))) {
          if (!words.has(keyword)) foreign.add(`${tool.name}: ${keyword}`);
        }
      }
    }
    expect({ missing: [...missing], foreign: [...foreign] }).toEqual({
      missing: [],
      foreign: [],
    });
    expect(
      listings.some(({ tools }) =>
        tools.some((t) => searchOf(t) !== undefined),
      ),
    ).toBe(true);
  });
});
