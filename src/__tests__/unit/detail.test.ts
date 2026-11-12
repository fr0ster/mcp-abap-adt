import * as z from 'zod';
import { DETAIL_SHAPE, detailOf } from '../../lib/strategies/detail';
import { jsonAt, listedJson } from '../helpers/listedJson';

describe('detailOf', () => {
  it('defaults to terse', () => {
    expect(detailOf({})).toBe('terse');
    expect(detailOf(undefined)).toBe('terse');
  });

  it('takes the three levels the schema declares', () => {
    expect(detailOf({ detail: 'full' })).toBe('full');
    expect(detailOf({ detail: 'raw' })).toBe('raw');
    expect(detailOf({ detail: 'terse' })).toBe('terse');
  });

  it('falls back to terse on anything else rather than throwing', () => {
    expect(detailOf({ detail: 'verbose' })).toBe('terse');
    expect(detailOf({ detail: 7 })).toBe('terse');
  });

  it('declares exactly the three levels it accepts', () => {
    const detail = jsonAt(listedJson(z.object(DETAIL_SHAPE)), 'detail');
    expect(detail.enum).toEqual(['terse', 'full', 'raw']);
    expect(detail.default).toBe('terse');
  });
});
