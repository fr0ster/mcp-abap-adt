import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { return_answer } from '../../lib/answer';

function success<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

const ctx = { tool: 'GetClass', detail: 'terse' as const };

describe('return_answer — success', () => {
  it('passes a string projection through verbatim', () => {
    const result = return_answer(success('CLASS zcl_x.'), (v) => v, ctx);

    assert.equal(result.isError, false);
    assert.equal(result.content[0].text, 'CLASS zcl_x.');
  });

  it('serialises anything else as minified JSON', () => {
    const result = return_answer(
      success({ a: 1, b: { c: [2, 3] } }),
      (v) => v,
      ctx,
    );

    assert.equal(result.content[0].text, '{"a":1,"b":{"c":[2,3]}}');
  });

  it('treats an undefined projection as a failure, never as SUCCESS', () => {
    const result = return_answer(success('anything'), () => undefined, ctx);

    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.error, 'projection_failed');
    assert.equal(payload.tool, 'GetClass');
    assert.equal(payload.detail, 'terse');
    assert.equal(payload.origin, undefined);
  });
});
