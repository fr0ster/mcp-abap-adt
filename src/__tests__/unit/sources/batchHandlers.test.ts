/**
 * `tools/batch-handlers.json` is the one place batch eligibility comes from
 * (spec §4.2): every entry names a tool its set serves, a handler that exists,
 * and the requests it sends — none of which needs another's answer (the
 * owner, 2026-10-16); no entry lists a long read whose requests chain; and
 * every entry is proven by sample calls in `batchEntryCases.ts`, which
 * `oneRequestPerEntry.test.ts` runs held open and answered.
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

/** An HTTP method, as a `sends` names a request. */
const METHODS = ['GET ', 'POST ', 'PUT ', 'DELETE '];

/**
 * Every long tool by whether a request of one call needs an earlier answer:
 * `independent` (none does), `chained` (a walk, a page, a fallback, a scope
 * read first), or `by-arguments` (chained unless the arguments pick a mode
 * that is not — listed only under `when`). Measured by the probe this table
 * was written from; the entries themselves are proven by
 * `oneRequestPerEntry.test.ts`.
 */
const LONG_BY_REQUESTS: Readonly<
  Record<string, 'independent' | 'chained' | 'by-arguments'>
> = {
  SearchObject: 'independent',
  GetSqlQuery: 'independent',
  GetTableContents: 'independent',
  GetATCFindings: 'independent',
  RuntimeGetProfilerTraceData: 'independent',
  RuntimeAnalyzeProfilerTrace: 'independent',
  HandlerSearch: 'independent',
  HandlerGetData: 'independent',
  HandlerProfileView: 'independent',
  HandlerWhereUsed: 'independent',
  HandlerGet: 'by-arguments',
  GetWhereUsed: 'by-arguments',
  RuntimeListFeeds: 'by-arguments',
  SearchSource: 'chained',
  GetPackageContents: 'chained',
  GetPackageTree: 'chained',
  GetObjectsList: 'chained',
  GetStructuresList: 'chained',
  GetIncludesList: 'chained',
  ListTransports: 'chained',
  GetObjectInfo: 'chained',
  DescribeByList: 'chained',
  GetAbapSystemSymbols: 'chained',
  HandlerDumpList: 'independent',
};

const GROUPS_DIR = path.join(REPO, 'src/lib/handlers/groups');

/**
 * Whether a group registers `tool` with handler `fn`: a tool the full set
 * names in its group (`name: 'ActivateDomain'`) over a low handler's
 * definition, `handler: withContext(fn)` in the same registration.
 */
function groupRegisters(tool: string, fn: string): boolean {
  for (const file of fs.readdirSync(GROUPS_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const source = fs.readFileSync(path.join(GROUPS_DIR, file), 'utf8');
    const at = source.indexOf(`name: '${tool}',`);
    if (at === -1) continue;
    const handlerAt = source.indexOf('handler:', at);
    const nextName = source.indexOf('name:', at + 1);
    const registration = source.slice(
      handlerAt,
      source.indexOf('\n', handlerAt),
    );
    if (
      handlerAt !== -1 &&
      (nextName === -1 || handlerAt < nextName) &&
      registration.includes(`(${fn})`)
    ) {
      return true;
    }
  }
  return false;
}

/** Whether a handler file names `tool`: as a literal, through the per-type version template, or its group's registration. */
function namesTool(source: string, tool: string, fn: string): boolean {
  if (source.includes(`name: '${tool}'`)) return true;
  if (groupRegisters(tool, fn)) return true;
  for (const suffix of ['Versions', 'VersionSource', 'VersionDiff']) {
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

  // The portable build bundles the bin into a single executable, where no
  // file lies beside the code: the table must travel inside the bundle. A
  // `require` of a literal path is what a bundler inlines; a file read at
  // run time is not.
  it('is read through one require of a literal path, which a bundler inlines — no file read at run time', () => {
    const source = fs.readFileSync(
      path.join(REPO, 'src/lib/batch/eligibility.ts'),
      'utf8',
    );
    const literal = "require('../../../tools/batch-handlers.json')";
    expect(source.split(literal)).toHaveLength(2);
    expect(source).not.toContain('readFileSync');
    expect(source).not.toContain("from 'node:fs'");
    expect(
      path.resolve(REPO, 'src/lib/batch', '../../../tools/batch-handlers.json'),
    ).toBe(path.resolve(BATCH_HANDLERS_FILE));
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
        named: namesTool(source, entry.tool, fn ?? ''),
      }).toEqual({ tool: entry.tool, exported: true, named: true });
    }
  });

  it('no tool name is served by both sets: eligible() keys entries by name alone', () => {
    const both = [...served.full].filter((name) => served.compact.has(name));
    expect(both).toEqual([]);
    const sets = new Map<string, Set<string>>();
    for (const entry of entries) {
      sets.set(entry.tool, (sets.get(entry.tool) ?? new Set()).add(entry.set));
    }
    expect(
      [...sets].filter(([, s]) => s.size > 1).map(([tool]) => tool),
    ).toEqual([]);
  });

  it("every entry's sends names what it sends", () => {
    const offending = entries
      .filter((e) => !METHODS.some((m) => e.sends.includes(m)))
      .map((e) => `${e.tool}: ${e.sends}`);
    expect(offending).toEqual([]);
  });

  it('classifies every long tool', () => {
    expect(Object.keys(LONG_BY_REQUESTS).sort()).toEqual(
      [...LONG_TOOLS].sort(),
    );
  });

  it("no entry's tool is a long read whose requests chain", () => {
    const offending = entries
      .filter((e) => LONG_BY_REQUESTS[e.tool] === 'chained')
      .map((e) => e.tool);
    expect(offending).toEqual([]);
    // A long read that is chained in some modes is listed only under the others.
    for (const entry of entries) {
      if (LONG_BY_REQUESTS[entry.tool] === 'by-arguments') {
        expect({
          tool: entry.tool,
          when: (entry.when ?? []).length > 0,
        }).toEqual({ tool: entry.tool, when: true });
      }
    }
  });

  it('lists every long read whose requests do not chain (spec §4.4)', () => {
    const tools = new Set(entries.map((e) => e.tool));
    for (const [tool, kind] of Object.entries(LONG_BY_REQUESTS)) {
      if (kind === 'chained') continue;
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
});
