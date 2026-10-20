import {
  presenceReport,
  readShared,
  SHARED_READS,
} from '../admin/shared-deps/presence';

describe('shared:check presence report', () => {
  it('is empty of a message when every object is present', () => {
    const r = presenceReport([
      { section: 'tables', name: 'ZT1', present: true },
      { section: 'views', name: 'ZV1', present: true },
    ]);
    expect(r.message).toBe('');
    expect(r.absent).toEqual([]);
    expect(r.present).toEqual(['tables: ZT1', 'views: ZV1']);
  });

  it('names every absent object, category and name, in one message', () => {
    const r = presenceReport([
      { section: 'tables', name: 'ZT1', present: false },
      { section: 'views', name: 'ZV1', present: true },
      { section: 'classes', name: 'ZC1', present: false, detail: 'boom' },
    ]);
    expect(r.absent).toEqual(['tables: ZT1', 'classes: ZC1']);
    expect(r.message).toContain('2 of 3');
    expect(r.message).toContain('tables: ZT1');
    expect(r.message).toContain('classes: ZC1 (boom)');
    expect(r.message).not.toContain('ZV1');
  });
});

describe('shared:check readShared', () => {
  const sections = Object.keys(SHARED_READS);

  it('covers the fourteen shared categories', () => {
    expect(sections).toHaveLength(14);
  });

  it('reads each name once, treats a throw and a not-ok answer as absent, skips unavailable ones', async () => {
    const calls: string[] = [];
    const client = {
      getTable: () => ({
        read: async (p: any) => {
          calls.push(p.tableName);
          if (p.tableName === 'ZTHROWS') throw new Error('gone');
          return { ok: p.tableName !== 'ZMISSING' };
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
          { name: 'ZTHROWS' },
          { name: 'ZOTHER', available_in: ['cloud'] },
        ],
      },
      (a) => !a || a.includes('onprem'),
    );
    expect(calls).toEqual(['ZPRESENT', 'ZMISSING', 'ZTHROWS']);
    expect(results.map((r) => [r.name, r.present])).toEqual([
      ['ZPRESENT', true],
      ['ZMISSING', false],
      ['ZTHROWS', false],
    ]);
    expect(results[2]?.detail).toBe('gone');
  });
});
