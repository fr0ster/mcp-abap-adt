import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as z from 'zod';
import { DETAIL_SHAPE, detailOf } from '../../lib/strategies/detail';
import { jsonAt, listedJson } from '../helpers/listedJson';

describe('detailOf', () => {
  it('defaults to terse', () => {
    assert.equal(detailOf({}), 'terse');
    assert.equal(detailOf({ detail: undefined }), 'terse');
  });

  it('takes the three levels the schema declares', () => {
    assert.equal(detailOf({ detail: 'full' }), 'full');
    assert.equal(detailOf({ detail: 'raw' }), 'raw');
    assert.equal(detailOf({ detail: 'terse' }), 'terse');
  });

  it('anything else is refused by the schema, before detailOf reads it', () => {
    const schema = z.object(DETAIL_SHAPE);
    assert.equal(schema.safeParse({ detail: 'verbose' }).success, false);
    assert.equal(schema.safeParse({ detail: 7 }).success, false);
  });

  it('declares exactly the three levels it accepts', () => {
    const detail = jsonAt(listedJson(z.object(DETAIL_SHAPE)), 'detail');
    assert.deepStrictEqual(detail.enum, ['terse', 'full', 'raw']);
    assert.equal(detail.default, 'terse');
  });
});
