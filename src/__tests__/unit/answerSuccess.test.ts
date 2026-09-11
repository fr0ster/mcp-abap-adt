import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
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

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('CLASS zcl_x.');
  });

  it('serialises anything else as indented JSON', () => {
    const result = return_answer(success({ a: 1 }), (v) => v, ctx);

    expect(result.content[0].text).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('treats an undefined projection as a failure, never as SUCCESS', () => {
    const result = return_answer(success('anything'), () => undefined, ctx);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('projection_failed');
    expect(payload.tool).toBe('GetClass');
    expect(payload.detail).toBe('terse');
    expect(payload.origin).toBeUndefined();
  });
});
