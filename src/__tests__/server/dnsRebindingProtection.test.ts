import {
  checkDnsRebinding,
  withDnsRebindingProtection,
} from '../../server/dnsRebindingProtection';

describe('checkDnsRebinding', () => {
  it('returns null when protection is disabled', () => {
    expect(
      checkDnsRebinding(
        { host: 'evil.com' },
        { enable: false, allowedHosts: ['localhost:3000'] },
      ),
    ).toBeNull();
  });

  it('enabled + allowedHosts: rejects missing/other host, accepts exact host:port', () => {
    const opts = { enable: true, allowedHosts: ['localhost:3000'] };
    expect(checkDnsRebinding({ host: 'localhost:3000' }, opts)).toBeNull();
    expect(checkDnsRebinding({ host: 'localhost' }, opts)?.status).toBe(403);
    expect(checkDnsRebinding({}, opts)?.status).toBe(403);
  });

  it('enabled + allowedOrigins: matching passes, absent passes, other rejects', () => {
    const opts = { enable: true, allowedOrigins: ['https://app.example.com'] };
    expect(
      checkDnsRebinding({ origin: 'https://app.example.com' }, opts),
    ).toBeNull();
    expect(checkDnsRebinding({}, opts)).toBeNull();
    expect(
      checkDnsRebinding({ origin: 'https://evil.com' }, opts)?.status,
    ).toBe(403);
  });

  it('enabled with empty lists is a no-op', () => {
    expect(
      checkDnsRebinding({ host: 'x', origin: 'y' }, { enable: true }),
    ).toBeNull();
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
    expect(res.statusCode).toBe(403);
    expect(called).toBe(false);
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
    expect(called).toBe(true);
    expect(res.statusCode).toBe(0);
  });
});
