/**
 * The line match is a strategy the orchestrator is given (DO14): it receives
 * each source's lines and the call's terms, its hits are the answer's, on the
 * sequential path and on the batched path alike; the orchestrator has no
 * match of its own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  LineMatchStrategy,
  ScanInput,
} from '../../../lib/search-source/lineMatch';
import {
  runSearchSource,
  runSearchSourceWithContext,
} from '../../../lib/search-source/orchestrator';
import {
  contextOn,
  nodeKey,
  type Repository,
  standOn,
} from '../../helpers/searchSourceStand';
import {
  exactPackages,
  listing,
  sourcesFrom,
} from '../../helpers/sourceReaderFake';

process.env.SAP_SYSTEM_TYPE = 'onprem';

interface Seen {
  lines: readonly string[];
  input: ScanInput;
}

/** A strategy answering one hit on each source's second line, its own words. */
function recording(): { strategy: LineMatchStrategy; seen: Seen[] } {
  const seen: Seen[] = [];
  return {
    seen,
    strategy: {
      match(lines, input) {
        seen.push({ lines, input });
        return {
          hits: [{ line: 2, snippet: 'chosen by the strategy' }],
          capped: false,
        };
      },
    },
  };
}

const ASKED = {
  query: 'never-in-the-source',
  query2: 'second',
  exclude: ['dropped'],
  exclude_comments: true,
  packages: ['ZPKG'],
  max_hits_per_object: 7,
};

describe('the orchestrator matches lines through the strategy it is given', () => {
  it('on the sequential path', async () => {
    const { strategy, seen } = recording();
    const result = await runSearchSource(
      {
        lineMatch: strategy,
        fetchPackageContents: async (name) =>
          listing(name, [
            {
              name: 'ZPROG',
              type: 'PROG/P',
              packageName: 'ZPKG',
              isPackage: false,
            },
          ]),
        sourceReader: sourcesFrom({ 'PROG:ZPROG': 'first\nsecond' }),
        resolvePackages: exactPackages,
      },
      ASKED,
    );
    expect(seen).toEqual([
      {
        lines: ['first', 'second'],
        input: {
          query: 'never-in-the-source',
          query2: 'second',
          exclude: ['dropped'],
          exclude_comments: true,
          max_hits: 7,
        },
      },
    ]);
    expect(result.results).toEqual([
      expect.objectContaining({
        object_name: 'ZPROG',
        line: 2,
        snippet: 'chosen by the strategy',
      }),
    ]);
  });

  it('on the batched path', async () => {
    const repository: Repository = {
      nodes: {
        [nodeKey('ZPKG')]: { types: [{ type: 'PROG/P', nodeId: '000020' }] },
        [nodeKey('ZPKG', '20')]: {
          objects: [{ type: 'PROG/P', name: 'ZPROG' }],
        },
      },
      sources: { 'PROGRAM ZPROG': 'first\nsecond' },
      fugrChildren: {},
      masks: {},
    };
    const fake = standOn(repository);
    const { strategy, seen } = recording();
    const result = await runSearchSourceWithContext(
      contextOn(fake),
      ASKED,
      strategy,
    );
    expect(fake.envelopes.length).toBeGreaterThan(0);
    expect(fake.directs).toHaveLength(0);
    expect(seen.map((s) => s.lines)).toEqual([['first', 'second']]);
    expect(seen[0]?.input).toEqual({
      query: 'never-in-the-source',
      query2: 'second',
      exclude: ['dropped'],
      exclude_comments: true,
      max_hits: 7,
    });
    expect(result.results.map((h) => h.snippet)).toEqual([
      'chosen by the strategy',
    ]);
  });
});

describe('the orchestrator has no line match of its own', () => {
  it('imports no matcher', () => {
    const source = readFileSync(
      join(__dirname, '../../../lib/search-source/orchestrator.ts'),
      'utf8',
    );
    expect(source.includes("from './lineScanner'")).toBe(false);
    expect(source.includes('scanLines')).toBe(false);
  });
});
