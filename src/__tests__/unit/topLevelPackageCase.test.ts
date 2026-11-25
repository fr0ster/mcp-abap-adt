/**
 * The top-level package live case's own logic, without SAP
 * (`helpers/topLevelPackage.ts`):
 *
 * - its read check: a `GetPackage` raw read is the top-level package only
 *   when the package document, parsed as the package tools parse it, names
 *   that package and no super package. The recorded package document has a
 *   parent, and the check refuses it.
 * - its teardown: a lock the case still holds is released under its handle
 *   first, then the package is deleted, even when that unlock fails; a
 *   failed unlock fails the teardown after the delete ran.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { corpusBody } from '../helpers/adtCorpus';
import {
  type CaseAnswer,
  releaseThenDelete,
  topLevelReadProblem,
} from '../helpers/topLevelPackage';

const RECORDED = corpusBody('read-metadata-package--01-packages-zmcpshrpkg');
const NAME = 'ZMCP_SHR_PKG';
const PARENT_ELEMENT =
  '<pak:superPackage adtcore:uri="/sap/bc/adt/packages/zadt_bld_pkg03" adtcore:type="DEVC/K" adtcore:name="ZADT_BLD_PKG03" adtcore:description="baseline package probe"/>';

/** The text `GetPackage` answers with `detail: raw` for `document`: SAP's document itself. */
const rawAnswer = (document: string): string => document;

/** The recorded document with its parent element emptied. */
function topLevel(): string {
  const at = RECORDED.indexOf(PARENT_ELEMENT);
  assert.ok(at > 0, 'the recorded document names its parent');
  return (
    RECORDED.slice(0, at) +
    '<pak:superPackage/>' +
    RECORDED.slice(at + PARENT_ELEMENT.length)
  );
}

describe('the read check of the top-level package case', () => {
  it('refuses the recorded package, which has a parent', () => {
    assert.ok(topLevelReadProblem(rawAnswer(RECORDED), NAME) !== undefined);
  });

  it('accepts the package with an empty super package', () => {
    assert.equal(topLevelReadProblem(rawAnswer(topLevel()), NAME), undefined);
  });

  it('refuses a top-level package of another name', () => {
    assert.ok(
      topLevelReadProblem(rawAnswer(topLevel()), 'ZMCP_OTHER') !== undefined,
    );
  });

  it('refuses an answer that is not a raw package read', () => {
    assert.ok(topLevelReadProblem('SUCCESS', NAME) !== undefined);
    // The JSON wrapper of the answers before 24.0.0's raw level.
    assert.ok(
      topLevelReadProblem(JSON.stringify({ metadata: topLevel() }), NAME) !==
        undefined,
    );
  });
});

describe('the teardown of the top-level package case', () => {
  const ok: CaseAnswer = { isError: false, text: 'unlocked' };
  const refused: CaseAnswer = { isError: true, text: 'unlock refused' };

  it('unlocks under the held handle, then deletes', async () => {
    const order: string[] = [];
    await releaseThenDelete(
      'HANDLE',
      async (handle) => {
        order.push(`unlock ${handle}`);
        return ok;
      },
      async () => {
        order.push('delete');
      },
    );
    assert.deepEqual(order, ['unlock HANDLE', 'delete']);
  });

  it('deletes without an unlock when no lock is held', async () => {
    const order: string[] = [];
    await releaseThenDelete(
      undefined,
      async () => {
        order.push('unlock');
        return ok;
      },
      async () => {
        order.push('delete');
      },
    );
    assert.deepEqual(order, ['delete']);
  });

  it('deletes after a failed unlock, then fails naming the unlock', async () => {
    const order: string[] = [];
    await assert.rejects(
      releaseThenDelete(
        'HANDLE',
        async () => {
          order.push('unlock');
          return refused;
        },
        async () => {
          order.push('delete');
        },
      ),
      (error: unknown) =>
        error instanceof Error && error.message.includes('unlock refused'),
    );
    assert.deepEqual(order, ['unlock', 'delete']);
  });

  it('deletes after an unlock that throws, then fails naming it', async () => {
    const order: string[] = [];
    await assert.rejects(
      releaseThenDelete(
        'HANDLE',
        async () => {
          order.push('unlock');
          throw new Error('unlock not sent');
        },
        async () => {
          order.push('delete');
        },
      ),
      (error: unknown) =>
        error instanceof Error && error.message.includes('unlock not sent'),
    );
    assert.deepEqual(order, ['unlock', 'delete']);
  });
});
