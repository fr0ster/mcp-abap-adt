import { handleMemorySnapshotDelta } from '../../../handlers/debugger/debug/handleMemorySnapshotDelta';
import { handleMemorySnapshotGet } from '../../../handlers/debugger/debug/handleMemorySnapshotGet';
import { handleMemorySnapshotList } from '../../../handlers/debugger/debug/handleMemorySnapshotList';
import { corpusBody } from '../../../lib/adtCorpus';
import { recordingConnection } from '../../helpers/recordingConnection';

const ctx = (conn: any) => ({ connection: conn, logger: undefined }) as any;
const DOC = '<mi:doc xmlns:mi="x"><mi:a>1</mi:a></mi:doc>';
const ok = () => recordingConnection([{ status: 200, data: DOC }]);
const sent = (conn: any) => JSON.stringify(conn.requests[0]);

describe('MemorySnapshotList', () => {
  it('lists the recorded snapshots, dropping only the file name', async () => {
    const conn = recordingConnection([
      {
        status: 200,
        data: corpusBody('memory-snapshot-list--01-list-of-the-user'),
      },
    ]);
    const r: any = await handleMemorySnapshotList(ctx(conn), {});
    const list = JSON.parse(r.content[0].text);
    expect(list[0]).toMatchObject({
      id: '0CC47A1E68C11FE1B1827ADCF9D455CB',
      user: 'SAPUSER01',
      programName: expect.any(String),
    });
    expect(list[0].fileName).toBeUndefined();
    expect(conn.requests[0].method).toBe('GET');
    expect(conn.requests[0].url).toContain('/runtime/memory/snapshots');
    expect(sent(conn)).not.toContain('user=');
  });
  it('full keeps the file name', async () => {
    const r: any = await handleMemorySnapshotList(
      ctx(
        recordingConnection([
          {
            status: 200,
            data: corpusBody('memory-snapshot-list--01-list-of-the-user'),
          },
        ]),
      ),
      { detail: 'full' },
    );
    expect(JSON.parse(r.content[0].text)[0].fileName).toBeTruthy();
  });
  it('sends the user upper-cased', async () => {
    const conn = ok();
    await handleMemorySnapshotList(ctx(conn), { user: 'sapuser01' });
    expect(sent(conn)).toContain('user=SAPUSER01');
  });
  it('an empty list says the authorization may be missing', async () => {
    const r: any = await handleMemorySnapshotList(
      ctx(
        recordingConnection([
          {
            status: 200,
            data: corpusBody(
              'memory-snapshot-list--02-list-of-a-user-with-none',
            ),
          },
        ]),
      ),
      {},
    );
    expect(JSON.parse(r.content[0].text)).toMatchObject({ snapshots: [] });
    expect(r.content[0].text).toMatch(/authorization/);
  });
});

describe('MemorySnapshotGet', () => {
  it.each([
    ['header', 'snapshots/S1'],
    ['overview', 'snapshots/S1/overview'],
  ] as const)('%s is one GET of the snapshot', async (view, url) => {
    const conn = ok();
    const r: any = await handleMemorySnapshotGet(ctx(conn), {
      snapshot_id: 'S1',
      view,
    });
    expect(r.isError).toBe(false);
    expect(conn.requests).toHaveLength(1);
    expect(conn.requests[0].method).toBe('GET');
    expect(conn.requests[0].url).toContain(url);
  });
  it('defaults to the overview', async () => {
    const conn = ok();
    await handleMemorySnapshotGet(ctx(conn), { snapshot_id: 'S1' });
    expect(conn.requests[0].url).toContain('S1/overview');
  });
  it('ranking sends the required limit, 50 by default and as given', async () => {
    const a = ok();
    await handleMemorySnapshotGet(ctx(a), {
      snapshot_id: 'S1',
      view: 'ranking',
    });
    expect(sent(a)).toContain('maxNumberOfObjects=50');
    const b = ok();
    await handleMemorySnapshotGet(ctx(b), {
      snapshot_id: 'S1',
      view: 'ranking',
      max_objects: 7,
    });
    expect(sent(b)).toContain('maxNumberOfObjects=7');
  });
  it('children and references send the key and the limit', async () => {
    const c = ok();
    await handleMemorySnapshotGet(ctx(c), {
      snapshot_id: 'S1',
      view: 'children',
      key: 'K1',
      max_objects: 5,
    });
    expect(sent(c)).toContain('K1');
    expect(sent(c)).toContain('maxNumberOfObjects=5');
    const r = ok();
    await handleMemorySnapshotGet(ctx(r), {
      snapshot_id: 'S1',
      view: 'references',
      key: 'K2',
      max_objects: 6,
    });
    expect(sent(r)).toContain('K2');
    expect(sent(r)).toContain('maxNumberOfReferences=6');
  });
  it.each(['children', 'references'] as const)(
    '%s without a key is an error that sends nothing',
    async (view) => {
      const conn = recordingConnection([]);
      const r: any = await handleMemorySnapshotGet(ctx(conn), {
        snapshot_id: 'S1',
        view,
      });
      expect(r.isError).toBe(true);
      expect(conn.requests).toHaveLength(0);
    },
  );
  it.each([0, -3])(
    'max_objects %p is an error that sends nothing',
    async (max_objects) => {
      const conn = recordingConnection([]);
      const r: any = await handleMemorySnapshotGet(ctx(conn), {
        snapshot_id: 'S1',
        view: 'ranking',
        max_objects,
      });
      expect(r.isError).toBe(true);
      expect(conn.requests).toHaveLength(0);
    },
  );
  it('raw is the document as sent', async () => {
    const r: any = await handleMemorySnapshotGet(ctx(ok()), {
      snapshot_id: 'S1',
      detail: 'raw',
    });
    expect(r.content[0].text).toBe(DOC);
  });
});

describe('MemorySnapshotDelta', () => {
  it('overview names both snapshots', async () => {
    const conn = ok();
    const r: any = await handleMemorySnapshotDelta(ctx(conn), {
      from_id: 'A1',
      to_id: 'B2',
    });
    expect(r.isError).toBe(false);
    expect(conn.requests[0].method).toBe('GET');
    expect(sent(conn)).toContain('A1');
    expect(sent(conn)).toContain('B2');
  });
  it('ranking, children and references send their limits and keys', async () => {
    const a = ok();
    await handleMemorySnapshotDelta(ctx(a), {
      from_id: 'A1',
      to_id: 'B2',
      view: 'ranking',
      max_objects: 9,
    });
    expect(sent(a)).toContain('maxNumberOfObjects=9');
    const b = ok();
    await handleMemorySnapshotDelta(ctx(b), {
      from_id: 'A1',
      to_id: 'B2',
      view: 'children',
      key: 'K1',
    });
    expect(sent(b)).toContain('K1');
    expect(sent(b)).toContain('maxNumberOfObjects=50');
    const c = ok();
    await handleMemorySnapshotDelta(ctx(c), {
      from_id: 'A1',
      to_id: 'B2',
      view: 'references',
      key: 'K2',
    });
    expect(sent(c)).toContain('maxNumberOfReferences=50');
  });
  it('a missing key or a limit below 1 sends nothing', async () => {
    for (const extra of [
      { view: 'children' },
      { view: 'ranking', max_objects: 0 },
    ] as const) {
      const conn = recordingConnection([]);
      const r: any = await handleMemorySnapshotDelta(ctx(conn), {
        from_id: 'A1',
        to_id: 'B2',
        ...extra,
      });
      expect(r.isError).toBe(true);
      expect(conn.requests).toHaveLength(0);
    }
  });
});
