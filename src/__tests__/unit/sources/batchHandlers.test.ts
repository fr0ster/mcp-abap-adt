/**
 * `tools/batch-handlers.json` is the one place batch eligibility comes from
 * (spec §4.2): every entry names a tool its set serves, a handler that exists,
 * and the requests it sends — none of which needs another's answer (the
 * owner, 2026-10-16); no entry lists a long read whose requests chain; and
 * every entry is proven by sample calls in `batchEntryCases.ts`, which
 * `oneRequestPerEntry.test.ts` runs held open and answered.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { CompactModifyHandlersGroup } from '../../../../compact-modify/src/group';
import {
  CompactDataHandlersGroup,
  CompactReadOnlyHandlersGroup,
} from '../../../../compact-readonly-entries/src/group';
import {
  BATCH_HANDLERS_FILE,
  type BatchEntry,
  batchEntries,
  whenHolds,
} from '../../../lib/batch/eligibility';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import { DataHandlersGroup } from '../../../lib/handlers/groups/DataHandlersGroup';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { LONG_TOOLS } from '../../../lib/longTools';
import { BATCH_ENTRY_CASES, SAMPLE_CALLS } from '../../helpers/batchEntryCases';
import { repositoryRoot } from '../../helpers/repoRoot';

const REPO = repositoryRoot(__dirname);
// Where the running code lives, and eligible() with it: `.test-build/tree/`,
// the build placing tools/batch-handlers.json beside the compiled code.
const CODE_ROOT = path.resolve(__dirname, '../../../..');

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
  })
    .getHandlerEntries()
    .map((e) => e.toolDefinition.name)
    // What the exporter leaves out (no store, no debugger, the data tools
    // unless asked for): the groups' own.
    .concat(
      [
        new BackgroundRunHandlersGroup(noConnectionContext()),
        new DataHandlersGroup(noConnectionContext()),
        new DebugHandlersGroup(noConnectionContext()),
      ].flatMap((group) =>
        group.getHandlers().map((e) => e.toolDefinition.name),
      ),
    );
  const compact = [
    ...new CompactReadOnlyHandlersGroup(placeholder).getHandlers(),
    ...new CompactDataHandlersGroup(placeholder).getHandlers(),
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
  ListTransports: 'independent',
  GetSqlQuery: 'independent',
  GetTableContents: 'independent',
  GetATCFindings: 'independent',
  ListATCResults: 'independent',
  GetATCResult: 'independent',
  RuntimeGetProfilerTraceData: 'independent',
  RuntimeAnalyzeProfilerTrace: 'independent',
  HandlerGetData: 'independent',
  HandlerProfileView: 'independent',
  HandlerGet: 'by-arguments',
  HandlerSystem: 'by-arguments',
  GetWhereUsed: 'by-arguments',
  RuntimeListFeeds: 'by-arguments',
  GetPackageContents: 'chained',
  GetPackageTree: 'chained',
  GetObjectsList: 'chained',
  GetStructuresList: 'chained',
  GetIncludesList: 'chained',
  GetObjectInfo: 'chained',
  DescribeByList: 'chained',
  SearchSource: 'chained',
  HandlerDumpList: 'independent',
};

const GROUPS_DIR = path.join(REPO, 'src/lib/handlers/groups');

/**
 * Whether a group registers `tool` with handler `fn`: a tool the full set
 * names in its group (`name: 'ActivateDomain'`) over a low handler's
 * definition, `defineTool({ ...definition, name }, fn)` — the handler the
 * argument after that definition, before the next tool's name.
 */
function groupRegisters(tool: string, fn: string): boolean {
  for (const file of fs.readdirSync(GROUPS_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const source = fs.readFileSync(path.join(GROUPS_DIR, file), 'utf8');
    const at = source.indexOf(`name: '${tool}',`);
    if (at === -1) continue;
    const nextName = source.indexOf('name:', at + 1);
    const registration = source.slice(
      at,
      nextName === -1 ? undefined : nextName,
    );
    if (
      registration.includes(`},\n        ${fn},\n`) ||
      registration.includes(`}, ${fn})`)
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
    assert.equal(
      path.resolve(BATCH_HANDLERS_FILE),
      path.join(CODE_ROOT, 'tools/batch-handlers.json'),
    );
    assert.deepStrictEqual(
      batchEntries(), // eligible() keeps file order within a tool.
      [...new Set(entries.map((e) => e.tool))].flatMap((tool) =>
        entries.filter((e) => e.tool === tool),
      ),
    );
    assert.ok(entries.length > 40);
  });

  it('ships with the package, so eligible() finds it in dist too', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
    ) as { files: string[] };
    assert.ok(manifest.files.includes('tools/batch-handlers.json'));
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
    assert.equal(source.split(literal).length, 2);
    assert.ok(!source.includes('readFileSync'));
    assert.ok(!source.includes("from 'node:fs'"));
    assert.equal(
      path.resolve(
        CODE_ROOT,
        'src/lib/batch',
        '../../../tools/batch-handlers.json',
      ),
      path.resolve(BATCH_HANDLERS_FILE),
    );
  });

  it('every entry has the shape: tool, set, handler, sends, and a well-formed when / connection', () => {
    for (const entry of entries) {
      const keys = Object.keys(entry).filter(
        (k) =>
          !['tool', 'set', 'handler', 'sends', 'when', 'connection'].includes(
            k,
          ),
      );
      assert.deepStrictEqual(
        { tool: entry.tool, extra: keys },
        {
          tool: entry.tool,
          extra: [],
        },
      );
      assert.ok(entry.set === 'compact' || entry.set === 'core', entry.tool);
      if (entry.connection !== undefined)
        assert.equal(entry.connection, 'http');
      for (const rule of entry.when ?? []) {
        assert.equal(typeof rule.argument, 'string');
        assert.equal(
          rule.equals !== undefined ||
            rule.notEquals !== undefined ||
            rule.present !== undefined,
          true,
        );
      }
    }
  });

  it('every entry names a tool its set serves and a handler that exists', () => {
    for (const entry of entries) {
      assert.deepStrictEqual(
        {
          tool: entry.tool,
          served: served[entry.set === 'core' ? 'full' : 'compact'].has(
            entry.tool,
          ),
        },
        { tool: entry.tool, served: true },
      );
      const [file, fn] = entry.handler.split('#');
      const source = fs.readFileSync(path.join(REPO, file ?? ''), 'utf8');
      assert.deepStrictEqual(
        {
          tool: entry.tool,
          exported:
            source.includes(`export async function ${fn}(`) ||
            source.includes(`export function ${fn}(`),
          named: namesTool(source, entry.tool, fn ?? ''),
        },
        { tool: entry.tool, exported: true, named: true },
      );
    }
  });

  it('no tool name is served by both sets: eligible() keys entries by name alone', () => {
    const both = [...served.full].filter((name) => served.compact.has(name));
    assert.deepStrictEqual(both, []);
    const sets = new Map<string, Set<string>>();
    for (const entry of entries) {
      sets.set(entry.tool, (sets.get(entry.tool) ?? new Set()).add(entry.set));
    }
    assert.deepStrictEqual(
      [...sets].filter(([, s]) => s.size > 1).map(([tool]) => tool),
      [],
    );
  });

  it("every entry's sends names what it sends", () => {
    const offending = entries
      .filter((e) => !METHODS.some((m) => e.sends.includes(m)))
      .map((e) => `${e.tool}: ${e.sends}`);
    assert.deepStrictEqual(offending, []);
  });

  it('classifies every long tool', () => {
    assert.deepStrictEqual(
      Object.keys(LONG_BY_REQUESTS).sort(),
      [...LONG_TOOLS].sort(),
    );
  });

  it("no entry's tool is a long read whose requests chain", () => {
    const offending = entries
      .filter((e) => LONG_BY_REQUESTS[e.tool] === 'chained')
      .map((e) => e.tool);
    assert.deepStrictEqual(offending, []);
    // A long read that is chained in some modes is listed only under the others.
    for (const entry of entries) {
      if (LONG_BY_REQUESTS[entry.tool] === 'by-arguments') {
        assert.deepStrictEqual(
          {
            tool: entry.tool,
            when: (entry.when ?? []).length > 0,
          },
          { tool: entry.tool, when: true },
        );
      }
    }
  });

  it("lists every compact long read whose requests do not chain (spec §4.4): batch mode is the compact sets'", () => {
    const tools = new Set(entries.map((e) => e.tool));
    for (const [tool, kind] of Object.entries(LONG_BY_REQUESTS)) {
      if (kind === 'chained' || !served.compact.has(tool)) continue;
      assert.deepStrictEqual(
        { tool, listed: tools.has(tool) },
        { tool, listed: true },
      );
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
    assert.deepStrictEqual(missing, []);
  });

  it("every sample call of a compact tool is in the batch proof; the others are the full set's", () => {
    const tools = new Set(entries.map((e) => e.tool));
    const unlisted = SAMPLE_CALLS.filter((c) => !tools.has(c.tool));
    assert.deepStrictEqual(
      unlisted.filter((c) => served.compact.has(c.tool)).map((c) => c.tool),
      [],
    );
    assert.deepStrictEqual(
      unlisted.filter((c) => !served.full.has(c.tool)).map((c) => c.tool),
      [],
    );
  });
});
