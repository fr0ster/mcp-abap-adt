import {
  classifyRead,
  connectionFailureWords,
  presenceReport,
  readShared,
  SHARED_READS,
} from '../admin/shared-deps/presence';

const failure = (error: Record<string, unknown>) => ({
  ok: false,
  getError: () => error,
});

// Hand-built exactly as adt-clients' recogniseFailure builds them (its
// `answering` is not reachable through the package exports): a status the
// transport refused is origin 'connection' carrying the AxiosError's response;
// an exception document is origin 'refusal'.
const transportRefused = (status?: number) =>
  failure({
    origin: 'connection',
    message: 'Request failed with SECRET-TEXT',
    response: status === undefined ? undefined : { status },
  });

describe('shared:check classifyRead', () => {
  it('ok is present', () => {
    expect(classifyRead({ ok: true }).state).toBe('present');
  });

  it('a 404 is absent whatever its origin', () => {
    expect(classifyRead(transportRefused(404)).state).toBe('absent');
    expect(
      classifyRead(
        failure({ origin: 'refusal', response: { status: 404 }, message: 'x' }),
      ).state,
    ).toBe('absent');
  });

  it.each([401, 403, 500, 503])(
    'a refusal on %s is unreadable, with the status',
    (status) => {
      const r = classifyRead(
        failure({ origin: 'refusal', response: { status }, message: 'x' }),
      );
      expect(r.state).toBe('unreadable');
      expect(r.detail).toContain(`HTTP ${status}`);
    },
  );

  it.each([401, 500])(
    'a transport-refused %s is unreadable with its status, not "no answer"',
    (status) => {
      const r = classifyRead(transportRefused(status));
      expect(r.state).toBe('unreadable');
      expect(r.detail).toBe(`HTTP ${status}`);
    },
  );

  it('no response at all is unreadable, "no answer"', () => {
    const r = classifyRead(transportRefused());
    expect(r.state).toBe('unreadable');
    expect(r.detail).toBe('no answer');
  });

  it('an answer with no error to read is unreadable, not absent', () => {
    expect(classifyRead({ ok: false }).state).toBe('unreadable');
    expect(classifyRead(undefined).state).toBe('unreadable');
  });

  it('keeps a code of a constant shape, never the message', () => {
    const r = classifyRead(
      failure({
        origin: 'refusal',
        response: { status: 500 },
        code: 'LOCK_FAILED',
        message: 'Bearer SECRET-TEXT',
      }),
    );
    expect(r.detail).toBe('HTTP 500, LOCK_FAILED');
    const odd = classifyRead(
      failure({ origin: 'refusal', code: 'has spaces SECRET-TEXT' }),
    );
    expect(odd.detail).not.toContain('SECRET');
  });
});

describe('shared:check presence report', () => {
  it('has no message when every object is present', () => {
    const r = presenceReport([
      { section: 'tables', name: 'ZT1', state: 'present' },
      { section: 'views', name: 'ZV1', state: 'present' },
    ]);
    expect(r.message).toBe('');
    expect(r.present).toEqual(['tables: ZT1', 'views: ZV1']);
  });

  it('lists absent and unreadable apart, each as category: name', () => {
    const r = presenceReport([
      { section: 'tables', name: 'ZT1', state: 'absent' },
      { section: 'views', name: 'ZV1', state: 'present' },
      {
        section: 'classes',
        name: 'ZC1',
        state: 'unreadable',
        detail: 'HTTP 401',
      },
    ]);
    expect(r.absent).toEqual(['tables: ZT1']);
    expect(r.unreadable).toEqual(['classes: ZC1']);
    const [absentPart, unreadablePart] = r.message.split('could not be read');
    expect(absentPart).toContain('tables: ZT1');
    expect(absentPart).not.toContain('ZC1');
    expect(unreadablePart).toContain('classes: ZC1 (HTTP 401)');
    expect(unreadablePart).not.toContain('ZT1');
    expect(r.message).not.toContain('ZV1');
  });

  it('an all-unreadable run (a dead token) lists nothing as absent', () => {
    const r = presenceReport([
      {
        section: 'tables',
        name: 'ZT1',
        state: 'unreadable',
        detail: 'HTTP 401',
      },
    ]);
    expect(r.absent).toEqual([]);
    expect(r.message).not.toContain('absent on the system');
    expect(r.message).toContain('tables: ZT1');
  });
});

describe('shared:check readShared', () => {
  it('covers the fourteen shared categories', () => {
    expect(Object.keys(SHARED_READS)).toHaveLength(14);
  });

  it('reads each name once: 404 absent, 401 and a throw unreadable, no message text, unavailable skipped, no write', async () => {
    const calls: string[] = [];
    const client = {
      getTable: () => ({
        read: async (p: any) => {
          calls.push(p.tableName);
          if (p.tableName === 'ZTHROWS') {
            throw Object.assign(new Error('SECRET-TEXT'), {
              code: 'ECONNRESET',
            });
          }
          if (p.tableName === 'ZMISSING') return transportRefused(404);
          if (p.tableName === 'ZEXPIRED') {
            return transportRefused(401);
          }
          return { ok: true };
        },
        create: () => {
          throw new Error('a write was attempted');
        },
      }),
    } as any;
    const results = await readShared(
      client,
      {
        tables: [
          { name: 'ZPRESENT' },
          { name: 'ZMISSING' },
          { name: 'ZEXPIRED' },
          { name: 'ZTHROWS' },
          { name: 'ZOTHER', available_in: ['cloud'] },
        ],
      },
      (a) => !a || a.includes('onprem'),
    );
    expect(calls).toEqual(['ZPRESENT', 'ZMISSING', 'ZEXPIRED', 'ZTHROWS']);
    expect(results.map((r) => [r.name, r.state])).toEqual([
      ['ZPRESENT', 'present'],
      ['ZMISSING', 'absent'],
      ['ZEXPIRED', 'unreadable'],
      ['ZTHROWS', 'unreadable'],
    ]);
    const report = presenceReport(results);
    expect(report.message).toContain('HTTP 401');
    expect(report.message).toContain('ECONNRESET');
    expect(report.message).not.toContain('SECRET');
    expect(report.absent).toEqual(['tables: ZMISSING']);
  });
});

describe('connectionFailureWords', () => {
  it('keeps only the status and a constant-shaped code of a failed connection, never its message', () => {
    const words = connectionFailureWords(
      Object.assign(new Error('Bearer SECRET at http://host/sap?pw=SECRET'), {
        code: 'ERR_BAD_REQUEST',
        response: { status: 401, data: 'SECRET body' },
      }),
    );
    expect(words).toBe(
      'No connection to the system, nothing was read (HTTP 401, ERR_BAD_REQUEST)',
    );
    expect(words).not.toContain('SECRET');
  });

  it('a failure with no status or usable code reads as a failed connection', () => {
    expect(
      connectionFailureWords(
        Object.assign(new Error('SECRET'), { code: 'has spaces SECRET' }),
      ),
    ).toBe('No connection to the system, nothing was read (connection failed)');
    expect(connectionFailureWords('SECRET')).toBe(
      'No connection to the system, nothing was read (connection failed)',
    );
  });

  it('no client and no failure is said so', () => {
    expect(connectionFailureWords(undefined)).toBe(
      'No connection to the system, nothing was read (no client)',
    );
  });
});
