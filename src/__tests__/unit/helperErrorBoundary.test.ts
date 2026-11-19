import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleGetTransport } from '../../handlers/transport/readonly/handleGetTransport';

const payload = (result: any) => {
  const text = result.content?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

describe('helper failures never become success results (#155)', () => {
  it('GetTransport: unparseable XML → isError, never success:true', async () => {
    const context: any = {
      connection: {
        makeAdtRequest: async () => ({
          status: 200,
          statusText: 'OK',
          data: '<nonsense/>',
          headers: {},
          config: {},
        }),
      },
      logger: undefined,
    };

    const result: any = await handleGetTransport(context, {
      transport_number: 'TRLK900001',
    });

    assert.equal(result.isError, true);
    assert.notEqual(payload(result).success, true);
    assert.doesNotMatch(
      result.content[0].text,
      /\bMcpError:\s|\bMCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /,
    );
  });
});
