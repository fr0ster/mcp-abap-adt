import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkDnsRebinding,
  withDnsRebindingProtection,
} from '../../../lib/httpTransport/dnsRebindingProtection';
import { assertMatchObject } from '../../helpers/assertions';

describe('checkDnsRebinding', () => {
  it('returns null when protection is disabled', () => {
    assert.equal(
      checkDnsRebinding(
        { host: 'evil.com' },
        { enable: false, allowedHosts: ['localhost:3000'] },
      ),
      null,
    );
  });

  it('enabled + allowedHosts: rejects missing/other host, accepts exact host:port', () => {
    const opts = { enable: true, allowedHosts: ['localhost:3000'] };
    assert.equal(checkDnsRebinding({ host: 'localhost:3000' }, opts), null);
    assert.equal(checkDnsRebinding({ host: 'localhost' }, opts)?.status, 403);
    assert.equal(checkDnsRebinding({}, opts)?.status, 403);
  });

  it('enabled + allowedOrigins: matching passes, absent passes, other rejects', () => {
    const opts = { enable: true, allowedOrigins: ['https://app.example.com'] };
    assert.equal(
      checkDnsRebinding({ origin: 'https://app.example.com' }, opts),
      null,
    );
    assert.equal(checkDnsRebinding({}, opts), null);
    assert.equal(
      checkDnsRebinding({ origin: 'https://evil.com' }, opts)?.status,
      403,
    );
  });

  it('enabled with empty lists fails closed (D26 F1: refused at construction)', () => {
    assertMatchObject(
      checkDnsRebinding({ host: 'x', origin: 'y' }, { enable: true }),
      { status: 403 },
    );
  });
});

describe('withDnsRebindingProtection', () => {
  const makeRes = () => {
    const res: any = { statusCode: 0, body: undefined };
    res.status = (c: number) => {
      res.statusCode = c;
      return res;
    };
    res.json = (b: unknown) => {
      res.body = b;
      return res;
    };
    return res;
  };

  it('rejects with 403 before calling the handler', () => {
    let called = false;
    const wrapped = withDnsRebindingProtection(
      () => {
        called = true;
      },
      { enable: true, allowedHosts: ['localhost:3000'] },
    );
    const res = makeRes();
    wrapped({ headers: { host: 'evil.com' } } as any, res, () => {});
    assert.equal(res.statusCode, 403);
    assert.equal(called, false);
  });

  it('delegates to the handler when validation passes', () => {
    let called = false;
    const wrapped = withDnsRebindingProtection(
      () => {
        called = true;
      },
      { enable: true, allowedHosts: ['localhost:3000'] },
    );
    const res = makeRes();
    wrapped({ headers: { host: 'localhost:3000' } } as any, res, () => {});
    assert.equal(called, true);
    assert.equal(res.statusCode, 0);
  });
});
