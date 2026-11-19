import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
    assert.deepStrictEqual(out, {
      method: 'POST',
      url: '/sap/bc/adt/domains/ZD',
    });
    assert.ok(!JSON.stringify(out).includes(SECRET));
  });

  it('drops the lock handle from the url, keeping the rest of it as sent', () => {
    const handle = 'A1B2C3D4E5F60718293A4B5C6D7E8F90LOCK';
    const out = safeRequest({
      method: 'PUT',
      url: `/sap/bc/adt/ddic/domains/zd?lockHandle=${handle}&corrNr=SYSK900001`,
    });
    assert.deepStrictEqual(out, {
      method: 'PUT',
      url: '/sap/bc/adt/ddic/domains/zd?corrNr=SYSK900001',
    });
    assert.ok(!JSON.stringify(out).includes(handle));
  });

  it('drops the query mark too when the lock handle was all the url asked', () => {
    assert.deepStrictEqual(
      safeRequest({
        method: 'PUT',
        url: '/sap/bc/adt/ddic/domains/zd?lockHandle=SECRETHANDLE',
      }),
      { method: 'PUT', url: '/sap/bc/adt/ddic/domains/zd' },
    );
  });

  it('drops the lock handle whatever its place, spelling or encoding', () => {
    const out = safeRequest({
      url: '/sap/bc/adt/x?version=inactive&lockhandle=H1&a=%2F&lock%48andle=H2&lockHandle=H3',
    });
    assert.deepStrictEqual(out, {
      url: '/sap/bc/adt/x?version=inactive&a=%2F',
    });
  });

  it('answers undefined when neither field is given', () => {
    assert.equal(safeRequest(undefined), undefined);
    assert.equal(safeRequest({}), undefined);
  });

  it('a thrown carrier: a request with neither field a string is dropped', () => {
    const base = { message: 'm', origin: 'refusal' };
    assert.deepStrictEqual(
      thrownCleanup({
        ...base,
        request: { headers: { authorization: SECRET } },
      }),
      base,
    );
    assert.deepStrictEqual(
      thrownCleanup({ ...base, request: { method: 7, url: null } }),
      base,
    );
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
    assert.deepStrictEqual(safeCleanup(carrier), {
      message: 'Unlock refused',
      origin: 'refusal',
      request: { method: 'POST', url: '/u' },
    });
  });

  it('drops the origin from a throw-shaped carrier', () => {
    // Having no origin is that shape's whole point: `connection` and `refusal`
    // are claims about the server, and neither is true of a local defect.
    assert.deepStrictEqual(
      safeCleanup({
        error: 'client_threw',
        message: 'no handle',
        origin: 'refusal',
      }),
      { error: 'client_threw', message: 'no handle' },
    );
  });

  it('answers undefined for nothing and for an empty result', () => {
    assert.equal(safeCleanup(undefined), undefined);
    assert.equal(safeCleanup({}), undefined);
  });
});

describe('thrownCleanup: the cleanup a thrown value carries', () => {
  it('narrows a refusal carrier, request included', () => {
    assert.deepStrictEqual(
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
      {
        message: 'Unlock refused',
        origin: 'refusal',
        request: { method: 'POST', url: '/u' },
      },
    );
  });

  it('drops the origin from a throw-shaped carrier', () => {
    assert.deepStrictEqual(
      thrownCleanup({
        error: 'client_threw',
        message: 'no handle',
        origin: 'refusal',
      }),
      { error: 'client_threw', message: 'no handle' },
    );
  });

  it('answers undefined for a non-object and for an empty result', () => {
    assert.equal(thrownCleanup(null), undefined);
    assert.equal(thrownCleanup('boom'), undefined);
    assert.equal(thrownCleanup({ unrelated: 1 }), undefined);
  });
});
