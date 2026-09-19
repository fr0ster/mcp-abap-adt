import { safeCleanup, safeRequest } from '../../lib/strategies/safeFields';

const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';

describe('safeRequest', () => {
  it('keeps method and url and drops everything else', () => {
    const out = safeRequest({
      method: 'POST',
      url: '/sap/bc/adt/domains/ZD',
      headers: { authorization: SECRET, cookie: 'SAP_SESSIONID=abc' },
      httpsAgent: { options: { cert: 'PEM' } },
    });
    expect(out).toEqual({ method: 'POST', url: '/sap/bc/adt/domains/ZD' });
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('answers undefined when neither field is a string', () => {
    expect(safeRequest(undefined)).toBeUndefined();
    expect(safeRequest({ headers: { authorization: SECRET } })).toBeUndefined();
    expect(safeRequest({ method: 7, url: null })).toBeUndefined();
  });
});

describe('safeCleanup', () => {
  it('narrows a refusal carrier, request included', () => {
    expect(
      safeCleanup({
        message: 'Unlock refused',
        origin: 'refusal',
        request: {
          method: 'POST',
          url: '/u',
          headers: { authorization: SECRET },
        },
        extra: 'dropped',
      }),
    ).toEqual({
      message: 'Unlock refused',
      origin: 'refusal',
      request: { method: 'POST', url: '/u' },
    });
  });

  it('drops the origin from a throw-shaped carrier', () => {
    // Having no origin is that shape's whole point: `connection` and `refusal`
    // are claims about the server, and neither is true of a local defect.
    expect(
      safeCleanup({
        error: 'client_threw',
        message: 'no handle',
        origin: 'refusal',
      }),
    ).toEqual({ error: 'client_threw', message: 'no handle' });
  });

  it('answers undefined for a non-object and for an empty result', () => {
    expect(safeCleanup(null)).toBeUndefined();
    expect(safeCleanup('boom')).toBeUndefined();
    expect(safeCleanup({ unrelated: 1 })).toBeUndefined();
  });
});
