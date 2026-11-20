import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
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
    assert.equal(result.isError, false);
    assert.equal(result.content[0].text, 'source');
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
    assert.equal(result.isError, true);
    assert.equal(payload.error, 'client_threw');
    assert.equal(payload.message, 'unsupported operation');
    assert.equal(payload.origin, undefined);
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
    assert.equal(payload.error, 'adapter_threw');
    assert.equal(payload.message, 'unexpected shape');
    assert.equal(payload.origin, undefined);
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
    assert.equal(payload.error, 'adapter_threw');
    assert.equal(payload.message, 'the strategy could not build its error');
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
    assert.equal(payload.tool, 'DeleteInterface');
    assert.equal(payload.detail, 'raw');
  });

  it('survives a thrown value that is not an Error', async () => {
    const result = await answer(
      ctx,
      async () => {
        throw 'a bare string';
      },
      (v) => v,
    );
    assert.equal(JSON.parse(result.content[0].text).message, 'a bare string');
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
    assert.equal(payload.origin, 'refusal');
    assert.equal(payload.error, undefined);
  });
});
