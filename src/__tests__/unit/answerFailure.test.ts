import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { corpusBody } from '../../lib/adtCorpus';
import { answer, return_answer } from '../../lib/answer';

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

  it('includes raw_body for a string body, at every detail', () => {
    // Changed deliberately. This used to assert that `terse` omitted the body,
    // which made `detail` the only way to reach the document SAP refused with
    // — and a tool that declares no `detail` could then never reach it at all.
    // `detail` shapes the result projection; a failure is not a projection.
    const error = {
      message: 'boom',
      origin: 'refusal' as const,
      response: { data: '<exc:exception/>' } as never,
    };

    for (const detail of ['terse', 'full', 'raw'] as const) {
      const result = return_answer(failure(error), project, {
        tool: 'GetClass',
        detail,
      });
      expect(JSON.parse(result.content[0].text).raw_body).toBe(
        '<exc:exception/>',
      );
    }

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

describe('the failure payload carries everything it has', () => {
  const document = corpusBody('refusal-object-not-found--01-read-source');

  it.each(['terse', 'full', 'raw'] as const)(
    'carries raw_body at detail=%s',
    (detail) => {
      // `detail` is a parameter of the RESULT projection, and a failure is not
      // a projection: on this path the consumer wants everything.
      const result = return_answer(
        failure({
          message: 'Not found',
          origin: 'refusal',
          response: { data: document },
        } as never),
        project,
        { tool: 'ReadClass', detail },
      );
      expect(JSON.parse(result.content[0].text).raw_body).toBe(document);
    },
  );

  it.each([
    ['a connection failure', {}],
    ['an empty answer', { response: { data: '' } }],
    ['a parsed body', { response: { data: { a: 1 } } }],
  ])('leaves raw_body absent for %s', (_name, extra) => {
    // The empty string is not a document: emitting `raw_body: ""` would read as
    // "SAP sent an empty body" when nothing was sent at all.
    const result = return_answer(
      failure({ message: 'Nope', origin: 'refusal', ...extra } as never),
      project,
      { tool: 'ReadClass', detail: 'raw' },
    );
    expect('raw_body' in JSON.parse(result.content[0].text)).toBe(false);
  });

  it('carries cleanup, narrowed, on a refusal', () => {
    const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';
    const result = return_answer(
      failure({
        message: 'Update refused',
        origin: 'refusal',
        cleanup: {
          message: 'Unlock refused',
          origin: 'refusal',
          request: {
            method: 'POST',
            url: '/u',
            headers: { authorization: SECRET },
          },
        },
      } as never),
      project,
      { tool: 'UpdateDomain', detail: 'terse' },
    );
    expect(result.content[0].text).not.toContain(SECRET);
    expect(JSON.parse(result.content[0].text).cleanup).toEqual({
      message: 'Unlock refused',
      origin: 'refusal',
      request: { method: 'POST', url: '/u' },
    });
  });

  it('carries operation on a refusal that succeeded under a failed release', () => {
    const result = return_answer(
      failure({
        message: 'Unlock refused',
        origin: 'refusal',
        operation: 'succeeded',
      } as never),
      project,
      { tool: 'UpdateDomain', detail: 'terse' },
    );
    expect(JSON.parse(result.content[0].text).operation).toBe('succeeded');
  });

  it('carries cleanup and operation on the client_threw payload', async () => {
    // The only report a caller gets when the write landed and the unlock threw.
    const thrown = Object.assign(new Error('unlock called with no handle'), {
      operation: 'succeeded',
      cleanup: {
        error: 'client_threw',
        message: 'unlock called with no handle',
      },
    });
    const result = await answer(
      { tool: 'UpdateDomain', detail: 'terse' },
      async () => {
        throw thrown;
      },
      project,
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe('client_threw');
    expect(payload.operation).toBe('succeeded');
    expect(payload.cleanup).toEqual({
      error: 'client_threw',
      message: 'unlock called with no handle',
    });
    // A local defect borrows no AdtFailureOrigin.
    expect(payload.origin).toBeUndefined();
  });
});
