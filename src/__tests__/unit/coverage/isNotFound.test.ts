/**
 * What `expectAbsent` reads as "not found" (`isNotFound`): SAP's `404`, or
 * the strategies' explicit not-found verdict — a refusal of code
 * `ADT_OBJECT_NOT_FOUND`, which a message class message's read answers with
 * SAP's `200` for its parent class. No other refusal and no other origin.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNotFound, type LiveAnswer } from '../../integration/helpers/live';

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
