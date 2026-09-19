import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../lib/answer';

function success<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

const ctx = { tool: 'GetClass', detail: 'full' as const };

describe('answer — the boundary covers the whole pipeline', () => {
  it('adapts a normal answer', async () => {
    const result = await answer(
      ctx,
      async () => success('source'),
      (v) => v,
    );
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('source');
  });

  it('names a throw from the client member client_threw', async () => {
    const result = await answer(
      ctx,
      async () => {
        throw new Error('unsupported operation');
      },
      (v) => v,
    );
    const payload = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(payload.error).toBe('client_threw');
    expect(payload.message).toBe('unsupported operation');
    expect(payload.origin).toBeUndefined();
  });

  it('names a throw from anything after the call adapter_threw', async () => {
    const result = await answer(
      ctx,
      async () => success('source'),
      () => {
        throw new Error('unexpected shape');
      },
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('adapter_threw');
    expect(payload.message).toBe('unexpected shape');
    expect(payload.origin).toBeUndefined();
  });

  it('names a throw from reading the failure adapter_threw too', async () => {
    const exploding = {
      ok: false,
      getResult: () => {
        throw new Error('not a success');
      },
      getError: () => {
        throw new Error('the strategy could not build its error');
      },
    } as unknown as IAdtResponse<string, IAdtError>;

    const result = await answer(
      ctx,
      async () => exploding,
      (v) => v,
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('adapter_threw');
    expect(payload.message).toBe('the strategy could not build its error');
  });

  it('names the tool and the detail, so a local failure says where it happened', async () => {
    const result = await answer(
      { tool: 'DeleteInterface', detail: 'raw' },
      async () => {
        throw new Error('boom');
      },
      (v) => v,
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.tool).toBe('DeleteInterface');
    expect(payload.detail).toBe('raw');
  });

  it('survives a thrown value that is not an Error', async () => {
    const result = await answer(
      ctx,
      async () => {
        throw 'a bare string';
      },
      (v) => v,
    );
    expect(JSON.parse(result.content[0].text).message).toBe('a bare string');
  });

  it('still answers a server refusal as a refusal, not as a local failure', async () => {
    const refused = {
      ok: false,
      getResult: () => {
        throw new Error('not a success');
      },
      getError: () => ({ origin: 'refusal', message: 'SAP said no' }),
    } as unknown as IAdtResponse<string, IAdtError>;

    const payload = JSON.parse(
      (
        await answer(
          ctx,
          async () => refused,
          (v) => v,
        )
      ).content[0].text,
    );
    expect(payload.origin).toBe('refusal');
    expect(payload.error).toBeUndefined();
  });
});
