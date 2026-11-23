/**
 * Completeness by construction (plan step 9.8): a terse or medium list is
 * written only by the listing writers of `src/lib/detail`. No source
 * outside it reaches the line renderer (`detail/complete`) or the cell
 * escapes (`detail/tsvCells`) to build terse text of its own, and none
 * names the guard this design replaced.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { REPO, rel, tsFiles } from './helpers/failureScan';

const SOURCES = [
  'src',
  'compact-readonly-entries/src',
  'compact-modify/src',
  'server-runtime/src',
].flatMap((dir) => tsFiles(path.join(REPO, dir)));

const DETAIL = path.join(REPO, 'src', 'lib', 'detail') + path.sep;

describe('terse text is written by the listing writers alone', () => {
  it('no source outside src/lib/detail imports the renderer or the cell escapes', () => {
    const found = SOURCES.filter((file) => !file.startsWith(DETAIL)).filter(
      (file) => {
        const text = fs.readFileSync(file, 'utf8');
        return (
          text.includes("detail/complete'") || text.includes("detail/tsvCells'")
        );
      },
    );
    assert.deepStrictEqual(found.map(rel), []);
  });

  it('no source names the guard it replaced', () => {
    const found = SOURCES.filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return [
        'completeAnswer',
        'IncompleteAnswerError',
        'incomplete_answer',
        'listedText',
      ].some((name) => text.includes(name));
    });
    assert.deepStrictEqual(found.map(rel), []);
  });
});
