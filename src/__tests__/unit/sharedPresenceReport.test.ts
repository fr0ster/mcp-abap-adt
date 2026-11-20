import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
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
    assert.equal(classifyRead({ ok: true }).state, 'present');
  });

  it('a 404 is absent whatever its origin', () => {
    assert.equal(classifyRead(transportRefused(404)).state, 'absent');
    assert.equal(
      classifyRead(
        failure({ origin: 'refusal', response: { status: 404 }, message: 'x' }),
      ).state,
      'absent',
    );
  });

  for (const status of [401, 403, 500, 503]) {
    it(format('a refusal on %s is unreadable, with the status', status), () => {
      const r = classifyRead(
        failure({ origin: 'refusal', response: { status }, message: 'x' }),
      );
      assert.equal(r.state, 'unreadable');
      assert.ok(r.detail?.includes(`HTTP ${status}`));
    });
  }

  for (const status of [401, 500]) {
    it(
      format(
        'a transport-refused %s is unreadable with its status, not "no answer"',
        status,
      ),
      () => {
        const r = classifyRead(transportRefused(status));
        assert.equal(r.state, 'unreadable');
        assert.equal(r.detail, `HTTP ${status}`);
      },
    );
  }

  it('no response at all is unreadable, "no answer"', () => {
    const r = classifyRead(transportRefused());
    assert.equal(r.state, 'unreadable');
    assert.equal(r.detail, 'no answer');
  });

  it('an answer with no error to read is unreadable, not absent', () => {
    assert.equal(classifyRead({ ok: false }).state, 'unreadable');
    assert.equal(classifyRead(undefined).state, 'unreadable');
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
    assert.equal(r.detail, 'HTTP 500, LOCK_FAILED');
    const odd = classifyRead(
      failure({ origin: 'refusal', code: 'has spaces SECRET-TEXT' }),
    );
    assert.equal(odd.detail?.includes('SECRET'), false);
  });
});

describe('shared:check presence report', () => {
  it('has no message when every object is present', () => {
    const r = presenceReport([
      { section: 'tables', name: 'ZT1', state: 'present' },
      { section: 'views', name: 'ZV1', state: 'present' },
    ]);
    assert.equal(r.message, '');
    assert.deepStrictEqual(r.present, ['tables: ZT1', 'views: ZV1']);
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
    assert.deepStrictEqual(r.absent, ['tables: ZT1']);
    assert.deepStrictEqual(r.unreadable, ['classes: ZC1']);
    const [absentPart, unreadablePart] = r.message.split('could not be read');
    assert.ok(absentPart.includes('tables: ZT1'));
    assert.ok(!absentPart.includes('ZC1'));
    assert.ok(unreadablePart.includes('classes: ZC1 (HTTP 401)'));
    assert.ok(!unreadablePart.includes('ZT1'));
    assert.ok(!r.message.includes('ZV1'));
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
    assert.deepStrictEqual(r.absent, []);
    assert.ok(!r.message.includes('absent on the system'));
    assert.ok(r.message.includes('tables: ZT1'));
  });
});

describe('shared:check readShared', () => {
  it('covers the fourteen shared categories', () => {
    assert.equal(Object.keys(SHARED_READS).length, 14);
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
    assert.deepStrictEqual(calls, [
      'ZPRESENT',
      'ZMISSING',
      'ZEXPIRED',
      'ZTHROWS',
    ]);
    assert.deepStrictEqual(
      results.map((r) => [r.name, r.state]),
      [
        ['ZPRESENT', 'present'],
        ['ZMISSING', 'absent'],
        ['ZEXPIRED', 'unreadable'],
        ['ZTHROWS', 'unreadable'],
      ],
    );
    const report = presenceReport(results);
    assert.ok(report.message.includes('HTTP 401'));
    assert.ok(report.message.includes('ECONNRESET'));
    assert.ok(!report.message.includes('SECRET'));
    assert.deepStrictEqual(report.absent, ['tables: ZMISSING']);
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
    assert.equal(
      words,
      'No connection to the system, nothing was read (HTTP 401, ERR_BAD_REQUEST)',
    );
    assert.ok(!words.includes('SECRET'));
  });

  it('a failure with no status or usable code reads as a failed connection', () => {
    assert.equal(
      connectionFailureWords(
        Object.assign(new Error('SECRET'), { code: 'has spaces SECRET' }),
      ),
      'No connection to the system, nothing was read (connection failed)',
    );
    assert.equal(
      connectionFailureWords('SECRET'),
      'No connection to the system, nothing was read (connection failed)',
    );
  });

  it('no client and no failure is said so', () => {
    assert.equal(
      connectionFailureWords(undefined),
      'No connection to the system, nothing was read (no client)',
    );
  });
});
