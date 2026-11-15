/**
 * What `expectAbsent` reads as "not found" (`isNotFound`): SAP's `404`, or
 * the strategies' explicit not-found verdict — a refusal of code
 * `ADT_OBJECT_NOT_FOUND`, which a message class message's read answers with
 * SAP's `200` for its parent class. No other refusal and no other origin.
 *
 * What `deleteRecorded` also reads as already gone (`isGoneOnDelete`): SAP's
 * deletion check refusing the object with only `E` messages reading
 * `<name>: Object does not exist` for a name of the record — the answer
 * measured on the cloud system (2026-11-15).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isGoneOnDelete,
  isNotFound,
  type LiveAnswer,
} from '../../integration/helpers/live';

/** An error answer carrying `payload` as its JSON text. */
function errorOf(payload: Record<string, unknown>): LiveAnswer {
  const text = JSON.stringify(payload);
  return { isError: true, content: [{ type: 'text', text }], text };
}

describe('isNotFound', () => {
  it("SAP's 404 is not found", () => {
    assert.equal(
      isNotFound(errorOf({ origin: 'connection', status: 404 })),
      true,
    );
  });

  it('the ADT_OBJECT_NOT_FOUND refusal is not found', () => {
    assert.equal(
      isNotFound(
        errorOf({
          origin: 'refusal',
          status: 200,
          code: 'ADT_OBJECT_NOT_FOUND',
        }),
      ),
      true,
    );
  });

  it('a refusal of another code is not', () => {
    assert.equal(
      isNotFound(
        errorOf({
          origin: 'refusal',
          status: 200,
          code: 'DOCUMENT_NOT_PATCHED',
        }),
      ),
      false,
    );
  });

  it('the not-found code from another origin is not', () => {
    assert.equal(
      isNotFound(
        errorOf({
          origin: 'connection',
          status: 200,
          code: 'ADT_OBJECT_NOT_FOUND',
        }),
      ),
      false,
    );
  });

  it('an answer that is no error is not', () => {
    const text = JSON.stringify({ status: 404 });
    assert.equal(
      isNotFound({ isError: false, content: [{ type: 'text', text }], text }),
      false,
    );
  });
});

/** SAP's deletion-check refusal, as the delete tools answer it (measured). */
function checkRefusal(
  messages: Array<{ type: string; text: string }>,
  overrides: Record<string, unknown> = {},
): LiveAnswer {
  return errorOf({
    message: 'ADT refuses to delete ZMCP_SBB_1D0D',
    origin: 'refusal',
    step: 'delete check',
    status: 200,
    request: { method: 'POST', url: '/sap/bc/adt/deletion/check' },
    messages,
    ...overrides,
  });
}

const GONE = { type: 'E', text: 'ZMCP_SBB_1D0D: Object does not exist' };

describe('isGoneOnDelete', () => {
  it("SAP's check saying the recorded object does not exist is gone", () => {
    assert.equal(
      isGoneOnDelete(checkRefusal([GONE]), ['zmcp_sbb_1d0d', 'K900001']),
      true,
    );
  });

  it('the same words about another object are not', () => {
    assert.equal(
      isGoneOnDelete(checkRefusal([GONE]), ['ZMCP_SBB_OTHER']),
      false,
    );
  });

  it('another refusal of the check is not', () => {
    assert.equal(
      isGoneOnDelete(
        checkRefusal([
          { type: 'E', text: 'ZMCP_SBB_1D0D: Object is still published' },
        ]),
        ['ZMCP_SBB_1D0D'],
      ),
      false,
    );
  });

  it('a gone message beside another refusal is not', () => {
    assert.equal(
      isGoneOnDelete(
        checkRefusal([
          GONE,
          { type: 'E', text: 'ZMCP_SBB_1D0D: You are already editing' },
        ]),
        ['ZMCP_SBB_1D0D'],
      ),
      false,
    );
  });

  it('the words as a warning are not', () => {
    assert.equal(
      isGoneOnDelete(checkRefusal([{ ...GONE, type: 'W' }]), ['ZMCP_SBB_1D0D']),
      false,
    );
  });

  it('the words from another step, origin or status are not', () => {
    for (const overrides of [
      { step: 'delete' },
      { origin: 'connection' },
      { status: 500 },
    ]) {
      assert.equal(
        isGoneOnDelete(checkRefusal([GONE], overrides), ['ZMCP_SBB_1D0D']),
        false,
      );
    }
  });

  it('a refusal without messages is not', () => {
    assert.equal(isGoneOnDelete(checkRefusal([]), ['ZMCP_SBB_1D0D']), false);
  });

  it('an answer that is no error is not', () => {
    const text = JSON.stringify({ messages: [GONE] });
    assert.equal(
      isGoneOnDelete(
        { isError: false, content: [{ type: 'text', text }], text },
        ['ZMCP_SBB_1D0D'],
      ),
      false,
    );
  });
});
