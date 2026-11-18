/**
 * The parity tool's comparison (`tools/test-parity.mjs`, `compareTitles`;
 * spec §8, "Counts"): two records are equal only with the same count, the
 * same titles in the same order and the same status per title, and every
 * difference is named.
 *
 * The tool is a JavaScript module outside the type system: it is loaded
 * from the repository at run time and its export checked before use.
 */
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO } from './toolRuns';

type Status = 'passed' | 'failed' | 'skipped';
interface ParityRecord {
  count: number;
  tests: { title: string; status: Status }[];
}
type Compare = (before: ParityRecord, after: ParityRecord) => string[];

/** `compareTitles` of the tool, its answer checked to be a list of strings. */
async function loadCompare(): Promise<Compare> {
  const loaded: unknown = await import(
    pathToFileURL(path.join(REPO, 'tools', 'test-parity.mjs')).href
  );
  const compare: unknown =
    typeof loaded === 'object' && loaded !== null
      ? Reflect.get(loaded, 'compareTitles')
      : undefined;
  if (typeof compare !== 'function') {
    throw new Error('tools/test-parity.mjs exports no compareTitles function');
  }
  return (beforeRecord, afterRecord) => {
    const lines: unknown = Reflect.apply(compare, undefined, [
      beforeRecord,
      afterRecord,
    ]);
    if (
      !Array.isArray(lines) ||
      !lines.every((line): line is string => typeof line === 'string')
    ) {
      throw new Error('compareTitles answered something other than strings');
    }
    return lines;
  };
}

const recordOf = (...tests: [string, Status][]): ParityRecord => ({
  count: tests.length,
  tests: tests.map(([title, status]) => ({ title, status })),
});

describe('test:parity compareTitles', () => {
  let compareTitles: Compare = () => {
    throw new Error('not loaded');
  };

  before(async () => {
    compareTitles = await loadCompare();
  });

  const base = recordOf(
    ['suite > a', 'passed'],
    ['suite > b', 'skipped'],
    ['suite > c', 'failed'],
  );

  it('equal records pass', () => {
    assert.deepEqual(
      compareTitles(
        base,
        recordOf(
          ...base.tests.map((t): [string, Status] => [t.title, t.status]),
        ),
      ),
      [],
    );
  });

  it('a dropped title fails naming it', () => {
    const lines = compareTitles(
      base,
      recordOf(['suite > a', 'passed'], ['suite > c', 'failed']),
    );
    assert.ok(lines.includes('count: 3 before, 2 after'), lines.join('\n'));
    assert.ok(lines.includes('missing: "suite > b"'), lines.join('\n'));
  });

  it('an added title fails', () => {
    const lines = compareTitles(
      base,
      recordOf(
        ...base.tests.map((t): [string, Status] => [t.title, t.status]),
        ['suite > d', 'passed'],
      ),
    );
    assert.ok(lines.includes('extra: "suite > d"'), lines.join('\n'));
  });

  it('a title differing only in a rendered placeholder fails the check', () => {
    const lines = compareTitles(
      recordOf(['reads %s', 'passed']),
      recordOf(['reads PROG', 'passed']),
    );
    assert.deepEqual(lines, ['renamed at #1: "reads %s" → "reads PROG"']);
  });

  it('a status change from passed to skipped fails', () => {
    const lines = compareTitles(
      base,
      recordOf(
        ['suite > a', 'skipped'],
        ['suite > b', 'skipped'],
        ['suite > c', 'failed'],
      ),
    );
    assert.deepEqual(lines, [
      'status: "suite > a" passed before, skipped after',
    ]);
  });

  it('order matters', () => {
    const lines = compareTitles(
      base,
      recordOf(
        ['suite > b', 'skipped'],
        ['suite > a', 'passed'],
        ['suite > c', 'failed'],
      ),
    );
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.ok(lines[0]?.startsWith('order: '), lines.join('\n'));
  });
});
