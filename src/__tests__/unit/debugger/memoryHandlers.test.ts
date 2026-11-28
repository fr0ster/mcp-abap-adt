import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  handleMemorySnapshotDelta,
  TOOL_DEFINITION as SnapshotDeltaTool,
} from '../../../handlers/debugger/debug/handleMemorySnapshotDelta';
import {
  handleMemorySnapshotGet,
  TOOL_DEFINITION as SnapshotGetTool,
} from '../../../handlers/debugger/debug/handleMemorySnapshotGet';
import { handleMemorySnapshotList } from '../../../handlers/debugger/debug/handleMemorySnapshotList';
import { corpusBody } from '../../helpers/adtCorpus';
import { assertMatchObject } from '../../helpers/assertions';
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
    assertMatchObject(list[0], {
      id: '0CC47A1E68C11FE1B1827ADCF9D455CB',
      user: 'SAPUSER01',
    });
    assert.equal(typeof list[0].programName, 'string');
    assert.equal(list[0].fileName, undefined);
    assert.equal(conn.requests[0].method, 'GET');
    assert.ok(conn.requests[0].url.includes('/runtime/memory/snapshots'));
    assert.ok(!sent(conn).includes('user='));
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
    assert.ok(JSON.parse(r.content[0].text)[0].fileName);
  });
  it('sends the user upper-cased', async () => {
    const conn = ok();
    await handleMemorySnapshotList(ctx(conn), { user: 'sapuser01' });
    assert.ok(sent(conn).includes('user=SAPUSER01'));
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
    assertMatchObject(JSON.parse(r.content[0].text), { snapshots: [] });
    assert.match(r.content[0].text, /authorization/);
  });
});

describe('MemorySnapshotGet', () => {
  for (const [view, url] of [
    ['header', 'snapshots/S1'],
    ['overview', 'snapshots/S1/overview'],
  ] as const) {
    it(format('%s is one GET of the snapshot', view), async () => {
      const conn = ok();
      const r: any = await handleMemorySnapshotGet(ctx(conn), {
        snapshot_id: 'S1',
        view,
        max_objects: 10,
      });
      assert.equal(r.isError, false);
      assert.equal(conn.requests.length, 1);
      assert.equal(conn.requests[0].method, 'GET');
      assert.ok(conn.requests[0].url.includes(url));
    });
  }
  it('defaults to the overview', async () => {
    const conn = ok();
    await handleMemorySnapshotGet(ctx(conn), {
      snapshot_id: 'S1',
      max_objects: 10,
    });
    assert.ok(conn.requests[0].url.includes('S1/overview'));
  });
  // No count of the server's (#391, the owner): max_objects is required,
  // and SAP requires a count of these views.
  it('the schema refuses a call without max_objects', () => {
    assert.equal(
      SnapshotGetTool.inputSchema.safeParse({ snapshot_id: 'S1' }).success,
      false,
    );
    assert.equal(
      SnapshotDeltaTool.inputSchema.safeParse({ from_id: 'A1', to_id: 'B2' })
        .success,
      false,
    );
  });
  it('ranking sends the limit as given', async () => {
    const b = ok();
    await handleMemorySnapshotGet(ctx(b), {
      snapshot_id: 'S1',
      view: 'ranking',
      max_objects: 7,
    });
    assert.ok(sent(b).includes('maxNumberOfObjects=7'));
  });
  it('children and references send the key and the limit', async () => {
    const c = ok();
    await handleMemorySnapshotGet(ctx(c), {
      snapshot_id: 'S1',
      view: 'children',
      key: 'K1',
      max_objects: 5,
    });
    assert.ok(sent(c).includes('K1'));
    assert.ok(sent(c).includes('maxNumberOfObjects=5'));
    const r = ok();
    await handleMemorySnapshotGet(ctx(r), {
      snapshot_id: 'S1',
      view: 'references',
      key: 'K2',
      max_objects: 6,
    });
    assert.ok(sent(r).includes('K2'));
    assert.ok(sent(r).includes('maxNumberOfReferences=6'));
  });
  for (const view of ['children', 'references'] as const) {
    it(
      format('%s without a key is an error that sends nothing', view),
      async () => {
        const conn = recordingConnection([]);
        const r: any = await handleMemorySnapshotGet(ctx(conn), {
          snapshot_id: 'S1',
          view,
          max_objects: 10,
        });
        assert.equal(r.isError, true);
        assert.equal(conn.requests.length, 0);
      },
    );
  }
  it('raw is the document as sent', async () => {
    const r: any = await handleMemorySnapshotGet(ctx(ok()), {
      snapshot_id: 'S1',
      detail: 'raw',
      max_objects: 10,
    });
    assert.equal(r.content[0].text, DOC);
  });
});

describe('MemorySnapshotDelta', () => {
  it('overview names both snapshots', async () => {
    const conn = ok();
    const r: any = await handleMemorySnapshotDelta(ctx(conn), {
      from_id: 'A1',
      to_id: 'B2',
      max_objects: 10,
    });
    assert.equal(r.isError, false);
    assert.equal(conn.requests[0].method, 'GET');
    assert.ok(sent(conn).includes('A1'));
    assert.ok(sent(conn).includes('B2'));
  });
  it('ranking, children and references send their limits and keys', async () => {
    const a = ok();
    await handleMemorySnapshotDelta(ctx(a), {
      from_id: 'A1',
      to_id: 'B2',
      view: 'ranking',
      max_objects: 9,
    });
    assert.ok(sent(a).includes('maxNumberOfObjects=9'));
    const b = ok();
    await handleMemorySnapshotDelta(ctx(b), {
      from_id: 'A1',
      to_id: 'B2',
      view: 'children',
      key: 'K1',
      max_objects: 10,
    });
    assert.ok(sent(b).includes('K1'));
    assert.ok(sent(b).includes('maxNumberOfObjects=10'));
    const c = ok();
    await handleMemorySnapshotDelta(ctx(c), {
      from_id: 'A1',
      to_id: 'B2',
      view: 'references',
      key: 'K2',
      max_objects: 10,
    });
    assert.ok(sent(c).includes('maxNumberOfReferences=10'));
  });
  it('a missing key sends nothing', async () => {
    const conn = recordingConnection([]);
    const r: any = await handleMemorySnapshotDelta(ctx(conn), {
      from_id: 'A1',
      to_id: 'B2',
      view: 'children',
      max_objects: 10,
    });
    assert.equal(r.isError, true);
    assert.equal(conn.requests.length, 0);
  });
});
