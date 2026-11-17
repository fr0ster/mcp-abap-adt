import {
  safeCleanup,
  safeRequest,
  thrownCleanup,
} from '../../lib/strategies/safeFields';

const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';

describe('safeRequest', () => {
  it('keeps method and url and drops everything else', () => {
    // A type is not a filter: a wider object is a request structurally.
    const sent = {
      method: 'POST',
      url: '/sap/bc/adt/domains/ZD',
      headers: { authorization: SECRET, cookie: 'SAP_SESSIONID=abc' },
      httpsAgent: { options: { cert: 'PEM' } },
    };
    const out = safeRequest(sent);
    expect(out).toEqual({ method: 'POST', url: '/sap/bc/adt/domains/ZD' });
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('drops the lock handle from the url, keeping the rest of it as sent', () => {
    const handle = 'A1B2C3D4E5F60718293A4B5C6D7E8F90LOCK';
    const out = safeRequest({
      method: 'PUT',
      url: `/sap/bc/adt/ddic/domains/zd?lockHandle=${handle}&corrNr=SYSK900001`,
    });
    expect(out).toEqual({
      method: 'PUT',
      url: '/sap/bc/adt/ddic/domains/zd?corrNr=SYSK900001',
    });
    expect(JSON.stringify(out)).not.toContain(handle);
  });

  it('drops the query mark too when the lock handle was all the url asked', () => {
    expect(
      safeRequest({
        method: 'PUT',
        url: '/sap/bc/adt/ddic/domains/zd?lockHandle=SECRETHANDLE',
      }),
    ).toEqual({ method: 'PUT', url: '/sap/bc/adt/ddic/domains/zd' });
  });

  it('drops the lock handle whatever its place, spelling or encoding', () => {
    const out = safeRequest({
      url: '/sap/bc/adt/x?version=inactive&lockhandle=H1&a=%2F&lock%48andle=H2&lockHandle=H3',
    });
    expect(out).toEqual({ url: '/sap/bc/adt/x?version=inactive&a=%2F' });
  });

  it('answers undefined when neither field is given', () => {
    expect(safeRequest(undefined)).toBeUndefined();
    expect(safeRequest({})).toBeUndefined();
  });

  it('a thrown carrier: a request with neither field a string is dropped', () => {
    const base = { message: 'm', origin: 'refusal' };
    expect(
      thrownCleanup({
        ...base,
        request: { headers: { authorization: SECRET } },
      }),
    ).toEqual(base);
    expect(
      thrownCleanup({ ...base, request: { method: 7, url: null } }),
    ).toEqual(base);
  });
});

describe('safeCleanup', () => {
  it('narrows a refusal carrier, request included', () => {
    const request = {
      method: 'POST',
      url: '/u',
      headers: { authorization: SECRET },
    };
    const carrier = {
      message: 'Unlock refused',
      origin: 'refusal',
      request,
      extra: 'dropped',
    };
    expect(safeCleanup(carrier)).toEqual({
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

  it('answers undefined for nothing and for an empty result', () => {
    expect(safeCleanup(undefined)).toBeUndefined();
    expect(safeCleanup({})).toBeUndefined();
  });
});

describe('thrownCleanup: the cleanup a thrown value carries', () => {
  it('narrows a refusal carrier, request included', () => {
    expect(
      thrownCleanup({
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
    expect(
      thrownCleanup({
        error: 'client_threw',
        message: 'no handle',
        origin: 'refusal',
      }),
    ).toEqual({ error: 'client_threw', message: 'no handle' });
  });

  it('answers undefined for a non-object and for an empty result', () => {
    expect(thrownCleanup(null)).toBeUndefined();
    expect(thrownCleanup('boom')).toBeUndefined();
    expect(thrownCleanup({ unrelated: 1 })).toBeUndefined();
  });
});
