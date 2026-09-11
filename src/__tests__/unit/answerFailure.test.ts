import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { return_answer } from '../../lib/answer';

function failure(
  error: Partial<IAdtError> & { messages?: unknown },
): IAdtResponse<never, IAdtError> {
  return {
    ok: false,
    getResult: () => {
      throw new Error('not a success');
    },
    getError: () => error,
  } as unknown as IAdtResponse<never, IAdtError>;
}

const project = (v: unknown) => v;

describe('return_answer — failure', () => {
  it('keeps the allowlist and omits what the strategy did not fill', () => {
    const result = return_answer(
      failure({
        message: 'Object is locked',
        origin: 'refusal',
        code: 'LOCK_FAILED',
      }),
      project,
      { tool: 'UpdateClass', detail: 'terse' },
    );

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      message: 'Object is locked',
      origin: 'refusal',
      code: 'LOCK_FAILED',
    });
  });

  it('carries the server classification and the request when present', () => {
    const result = return_answer(
      failure({
        message: 'No authorization',
        origin: 'refusal',
        adtType: 'CLAS/OC',
        namespace: '/SAP/',
        request: { method: 'POST', url: '/sap/bc/adt/oo/classes' },
      }),
      project,
      { tool: 'CreateClass', detail: 'terse' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.adt_type).toBe('CLAS/OC');
    expect(payload.namespace).toBe('/SAP/');
    expect(payload.request).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/oo/classes',
    });
  });

  it('copies method and url out of request and drops everything else', () => {
    const result = return_answer(
      failure({
        message: 'No authorization',
        origin: 'refusal',
        request: {
          method: 'POST',
          url: '/sap/bc/adt/oo/classes',
          headers: {
            authorization: 'Bearer secret-token',
            cookie: 'SAP_SESSIONID=x',
          },
          data: '<class/>',
        } as never,
      }),
      project,
      { tool: 'CreateClass', detail: 'raw' },
    );

    // Not on the object, and not anywhere in the text either: a nested leak that
    // toEqual would catch on request alone could still ride out on another field.
    expect(JSON.parse(result.content[0].text).request).toEqual({
      method: 'POST',
      url: '/sap/bc/adt/oo/classes',
    });
    expect(result.content[0].text).not.toContain('Bearer');
    expect(result.content[0].text).not.toContain('SAP_SESSIONID');
  });

  it('omits request entirely when it carries neither method nor url', () => {
    const result = return_answer(
      failure({
        message: 'boom',
        origin: 'connection',
        request: { headers: { authorization: 'Bearer secret-token' } } as never,
      }),
      project,
      { tool: 'GetClass', detail: 'terse' },
    );

    const payload = JSON.parse(result.content[0].text);
    expect(payload.request).toBeUndefined();
    expect(result.content[0].text).not.toContain('Bearer');
  });

  it('never serialises the response object', () => {
    const circular: Record<string, unknown> = { headers: { cookie: 'secret' } };
    circular.self = circular;
    const result = return_answer(
      failure({
        message: 'boom',
        origin: 'connection',
        response: circular as never,
      }),
      project,
      { tool: 'GetClass', detail: 'terse' },
    );
    expect(result.content[0].text).not.toContain('cookie');
    expect(JSON.parse(result.content[0].text).response).toBeUndefined();
  });

  it('includes raw_body only at detail raw and only for a string body', () => {
    const error = {
      message: 'boom',
      origin: 'refusal' as const,
      response: { data: '<exc:exception/>' } as never,
    };
    const raw = return_answer(failure(error), project, {
      tool: 'GetClass',
      detail: 'raw',
    });
    expect(JSON.parse(raw.content[0].text).raw_body).toBe('<exc:exception/>');

    const terse = return_answer(failure(error), project, {
      tool: 'GetClass',
      detail: 'terse',
    });
    expect(JSON.parse(terse.content[0].text).raw_body).toBeUndefined();

    const parsed = return_answer(
      failure({
        message: 'boom',
        origin: 'refusal',
        response: { data: { a: 1 } } as never,
      }),
      project,
      { tool: 'GetClass', detail: 'raw' },
    );
    expect(JSON.parse(parsed.content[0].text).raw_body).toBeUndefined();
  });

  it('passes messages through when the strategy supplied them', () => {
    const result = return_answer(
      failure({
        message: 'Check found errors',
        origin: 'refusal',
        messages: [{ type: 'E', text: 'Syntax error in line 3' }],
      }),
      project,
      { tool: 'CheckClass', detail: 'terse' },
    );
    expect(JSON.parse(result.content[0].text).messages).toEqual([
      { type: 'E', text: 'Syntax error in line 3' },
    ]);
  });

  it('carries the T100 key through, on the message it belongs to', () => {
    // The message class, its number and the substituted placeholders are the
    // only thing in the whole corpus a caller can match on without reading
    // English. A payload that dropped them would make every caller parse the
    // sentence instead.
    const result = return_answer(
      failure({
        message:
          'Resource CLASS ZMCP_BLD_ANSCH01 is not locked (invalid lock handle: ZZ)',
        origin: 'refusal',
        messages: [
          {
            type: 'E',
            text: 'Resource CLASS ZMCP_BLD_ANSCH01 is not locked',
            code: 'ExceptionResourceInvalidLockHandle',
            t100: {
              id: 'SADT_RESOURCE',
              no: '026',
              values: ['CLASS', 'ZMCP_BLD_ANSCH01', 'ZZ'],
            },
          },
        ],
      }),
      project,
      { tool: 'UpdateClass', detail: 'terse' },
    );

    const [first] = JSON.parse(result.content[0].text).messages;
    expect(first.t100).toEqual({
      id: 'SADT_RESOURCE',
      no: '026',
      values: ['CLASS', 'ZMCP_BLD_ANSCH01', 'ZZ'],
    });
    expect(first.code).toBe('ExceptionResourceInvalidLockHandle');
    // The number is a zero-padded string, not a number: SADT_RESOURCE/26 is a
    // key no system knows.
    expect(typeof first.t100.no).toBe('string');
    expect(first.t100.no).toBe('026');
  });
});
