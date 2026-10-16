/**
 * `tools/batch-handlers.json` is the one place batch eligibility comes from
 * (spec §4.2): every entry names a tool its set serves, a handler that exists,
 * and the one request it sends; no entry lists a long read whose
 * `tools/long-handlers.json` `sends` names several requests; and every entry
 * is proven by sample calls in `batchEntryCases.ts`, which
 * `oneRequestPerEntry.test.ts` runs against a counting connection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import {
  BATCH_HANDLERS_FILE,
  type BatchEntry,
  batchEntries,
  whenHolds,
} from '../../../lib/batch/eligibility';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { LONG_TOOLS } from '../../../lib/longTools';
import { BATCH_ENTRY_CASES } from '../../helpers/batchEntryCases';

const REPO = path.resolve(__dirname, '../../../..');

const listed = (): BatchEntry[] =>
  JSON.parse(
    fs.readFileSync(path.join(REPO, 'tools/batch-handlers.json'), 'utf8'),
  ) as BatchEntry[];

const longListed = (): Array<{ tool: string; sends: string }> =>
  JSON.parse(
    fs.readFileSync(path.join(REPO, 'tools/long-handlers.json'), 'utf8'),
  );

/** The tool names each set serves. */
function servedBySet(): Record<'full' | 'compact', Set<string>> {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  const full = new HandlerExporter({
    systemType: 'onprem',
    includeReadOnly: true,
    includeHighLevel: true,
    includeSystem: true,
    includeSearch: true,
    includeDebug: true,
  })
    .getHandlerEntries()
    .map((e) => e.toolDefinition.name);
  const compact = [
    ...new CompactReadOnlyHandlersGroup(placeholder).getHandlers(),
    ...new CompactModifyHandlersGroup(placeholder).getHandlers(),
  ].map((e) => e.toolDefinition.name);
  return { full: new Set(full), compact: new Set(compact) };
}

const METHOD = /\b(GET|POST|PUT|DELETE)\b/g;
/** Words a `sends` uses for more than one request. */
const SEVERAL_WORDS = [
  ' per ',
  ' each ',
  'GETs',
  'POSTs',
  'walk',
  'recurs',
  'paged',
  'up to',
];

/** Whether a `sends` names exactly one request: one HTTP method, no word for several. */
function namesOneRequest(sends: string): boolean {
  return (
    (sends.match(METHOD) ?? []).length === 1 &&
    !SEVERAL_WORDS.some((w) => sends.includes(w))
  );
}

/** A long tool's `sends`, "as X or Y" read as X's and Y's. */
function longSends(tool: string): string[] {
  const all = longListed();
  const own = all.find((l) => l.tool === tool)?.sends ?? '';
  if (!own.startsWith('as ')) return [own];
  return own
    .slice('as '.length)
    .split(' or ')
    .map((name) => all.find((l) => l.tool === name.trim())?.sends ?? '');
}

/**
 * Every long tool by what one call sends: one request, several, or several
 * unless its arguments pick a single-request mode (listed only under `when`).
 * Checked against each tool's `sends` both ways below.
 */
const LONG_BY_REQUESTS: Readonly<
  Record<string, 'one' | 'several' | 'by-arguments'>
> = {
  SearchObject: 'one',
  GetSqlQuery: 'one',
  GetTableContents: 'one',
  GetATCFindings: 'one',
  RuntimeGetProfilerTraceData: 'one',
  RuntimeAnalyzeProfilerTrace: 'one',
  HandlerSearch: 'one',
  HandlerGetData: 'one',
  HandlerProfileView: 'one',
  HandlerGet: 'by-arguments',
  GetWhereUsed: 'several',
  SearchSource: 'several',
  GetPackageContents: 'several',
  GetPackageTree: 'several',
  GetObjectsList: 'several',
  GetStructuresList: 'several',
  GetIncludesList: 'several',
  RuntimeListFeeds: 'several',
  ListTransports: 'several',
  GetObjectInfo: 'several',
  DescribeByList: 'several',
  GetAbapSystemSymbols: 'several',
  HandlerWhereUsed: 'several',
  HandlerDumpList: 'several',
};

/** Whether a handler file names `tool`: as a literal, or through the per-type version template. */
function namesTool(source: string, tool: string): boolean {
  if (source.includes(`name: '${tool}'`)) return true;
  for (const suffix of ['Versions', 'VersionSource']) {
    if (
      tool.startsWith('Get') &&
      tool.endsWith(suffix) &&
      source.includes(`name: \`Get\${row.display}${suffix}\``) &&
      source.includes(`display: '${tool.slice(3, -suffix.length)}'`)
    ) {
      return true;
    }
  }
  return false;
}

describe('tools/batch-handlers.json', () => {
  const entries = listed();
  const served = servedBySet();

  it('is the file eligible() reads, each entry in it', () => {
    expect(path.resolve(BATCH_HANDLERS_FILE)).toBe(
      path.join(REPO, 'tools/batch-handlers.json'),
    );
    expect(batchEntries()).toEqual(
      // eligible() keeps file order within a tool.
      [...new Set(entries.map((e) => e.tool))].flatMap((tool) =>
        entries.filter((e) => e.tool === tool),
      ),
    );
    expect(entries.length).toBeGreaterThan(50);
  });

  it('ships with the package, so eligible() finds it in dist too', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    ) as { files: string[] };
    expect(manifest.files).toContain('tools/batch-handlers.json');
  });

  it('every entry has the shape: tool, set, handler, sends, and a well-formed when / connection', () => {
    for (const entry of entries) {
      const keys = Object.keys(entry).filter(
        (k) =>
          !['tool', 'set', 'handler', 'sends', 'when', 'connection'].includes(
            k,
          ),
      );
      expect({ tool: entry.tool, extra: keys }).toEqual({
        tool: entry.tool,
        extra: [],
      });
      expect(['full', 'compact']).toContain(entry.set);
      if (entry.connection !== undefined) expect(entry.connection).toBe('http');
      for (const rule of entry.when ?? []) {
        expect(typeof rule.argument).toBe('string');
        expect(
          rule.equals !== undefined ||
            rule.notEquals !== undefined ||
            rule.present !== undefined,
        ).toBe(true);
      }
    }
  });

  it('every entry names a tool its set serves and a handler that exists', () => {
    for (const entry of entries) {
      expect({
        tool: entry.tool,
        served: served[entry.set].has(entry.tool),
      }).toEqual({ tool: entry.tool, served: true });
      const [file, fn] = entry.handler.split('#');
      const source = fs.readFileSync(path.join(REPO, file ?? ''), 'utf8');
      expect({
        tool: entry.tool,
        exported:
          source.includes(`export async function ${fn}(`) ||
          source.includes(`export function ${fn}(`),
        named: namesTool(source, entry.tool),
      }).toEqual({ tool: entry.tool, exported: true, named: true });
    }
  });

  it("every entry's sends names one request", () => {
    const offending = entries
      .filter((e) => !namesOneRequest(e.sends))
      .map((e) => `${e.tool}: ${e.sends}`);
    expect(offending).toEqual([]);
  });

  it('classifies every long tool, each as its sends says', () => {
    expect(Object.keys(LONG_BY_REQUESTS).sort()).toEqual(
      [...LONG_TOOLS].sort(),
    );
    for (const [tool, kind] of Object.entries(LONG_BY_REQUESTS)) {
      const one = longSends(tool).every(namesOneRequest);
      expect({ tool, one }).toEqual({ tool, one: kind === 'one' });
    }
  });

  it("no entry's tool is a long read whose sends names more than one request", () => {
    const offending = entries
      .filter((e) => LONG_BY_REQUESTS[e.tool] === 'several')
      .map((e) => e.tool);
    expect(offending).toEqual([]);
    // A long read that picks its single-request modes by arguments is listed only under them.
    for (const entry of entries) {
      if (LONG_BY_REQUESTS[entry.tool] === 'by-arguments') {
        expect({
          tool: entry.tool,
          when: (entry.when ?? []).length > 0,
        }).toEqual({ tool: entry.tool, when: true });
      }
    }
  });

  it('lists every long read that sends one request (spec §4.4)', () => {
    const tools = new Set(entries.map((e) => e.tool));
    for (const [tool, kind] of Object.entries(LONG_BY_REQUESTS)) {
      if (kind === 'several') continue;
      expect({ tool, listed: tools.has(tool) }).toEqual({ tool, listed: true });
    }
  });

  it('every entry has a case in oneRequestPerEntry.test.ts, each value it names sampled', () => {
    const missing: string[] = [];
    for (const entry of entries) {
      const admitted = BATCH_ENTRY_CASES.filter(
        (c) =>
          c.tool === entry.tool &&
          whenHolds(entry.tool, entry.when, c.args) &&
          (entry.connection === undefined ||
            (c.connection ?? 'http') === entry.connection),
      );
      if (admitted.length === 0) {
        missing.push(`${entry.tool} ${JSON.stringify(entry.when ?? [])}`);
        continue;
      }
      for (const rule of entry.when ?? []) {
        for (const value of rule.equals ?? []) {
          const sampled = admitted.some((c) =>
            whenHolds(
              entry.tool,
              [{ argument: rule.argument, equals: [value] }],
              c.args,
            ),
          );
          if (!sampled) missing.push(`${entry.tool} ${rule.argument}=${value}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every case is of a listed tool', () => {
    const tools = new Set(entries.map((e) => e.tool));
    expect(
      BATCH_ENTRY_CASES.filter((c) => !tools.has(c.tool)).map((c) => c.tool),
    ).toEqual([]);
  });

  it('the one-request check reads a sends both ways (load-bearing)', () => {
    expect(namesOneRequest('GET /sap/bc/adt/x')).toBe(true);
    expect(namesOneRequest('GET /a, then GET /b')).toBe(false);
    expect(namesOneRequest('POST /a per node')).toBe(false);
    expect(namesOneRequest('one source GET per include')).toBe(false);
    expect(namesOneRequest('the nodestructure walk')).toBe(false);
  });
});
