/**
 * SortAndCompressTransportTask and MoveTransportObjects — the transport
 * organizer's *Sort and compress* and *Move Objects*, through adt-clients
 * 30.0.0's `sortAndCompress` and `moveObjects`.
 *
 * These run the real client over a recording connection, not a fake client:
 * what each tool sends — method, address, document — is the claim, and a fake
 * client cannot see it.
 *
 * Measured on premise (BASIS 816, 2026-10-12): *Sort and compress* answers
 * `200` with an empty body, an empty task the same; *Move Objects* answers
 * `200` echoing the entries it was sent. Neither answer is evidence of the
 * change — a re-read of the task is — so neither tool says `success`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type {
  IAbapConnection,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleMoveTransportObjects } from '../../handlers/transport/high/handleMoveTransportObjects';
import { handleSortAndCompressTransportTask } from '../../handlers/transport/high/handleSortAndCompressTransportTask';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

type Sent = { method: string; url: string; data?: unknown };

/** A connection that records every request and answers `200` with `body`. */
function recording(body = ''): { connection: IAbapConnection; sent: Sent[] } {
  const sent: Sent[] = [];
  const connection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest(options: Sent) {
      sent.push({
        method: options.method,
        url: options.url,
        data: options.data,
      });
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: body,
      } as IAdtWireResponse;
    },
  } as unknown as IAbapConnection;
  return { connection, sent };
}

const body = (result: any) => JSON.parse(result.content[0].text);
const SOURCE = 'SIDK900101';
const TARGET = 'SIDK900102';

describe('SortAndCompressTransportTask', () => {
  it('posts to the task’s sortandcompress, with no document', async () => {
    const { connection, sent } = recording();

    const result = await handleSortAndCompressTransportTask(
      { connection, logger: undefined } as any,
      { transport_number: SOURCE },
    );

    assert.equal(result.isError, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'POST');
    assert.equal(
      sent[0].url,
      `/sap/bc/adt/cts/transportrequests/${SOURCE}/sortandcompress`,
    );
    assert.equal(sent[0].data ?? '', '');
  });

  it('claims acceptance, not a sorted list, and names the re-read', async () => {
    const { connection } = recording();

    const answered = body(
      await handleSortAndCompressTransportTask(
        { connection, logger: undefined } as any,
        { transport_number: SOURCE },
      ),
    );

    assert.equal(answered.accepted, true);
    assert.equal(answered.transport_number, SOURCE);
    assert.ok(answered.confirm_with.includes('ReadTransportObjects'));
    assert.ok(answered.confirm_with.includes(SOURCE));
    // An empty `200` says nothing about the list, so no `success`.
    assert.equal('success' in answered, false);
  });

  it('sends nothing without a task, and names the field', async () => {
    const { connection, sent } = recording();

    const result = await handleSortAndCompressTransportTask(
      { connection, logger: undefined } as any,
      {} as never,
    );

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('transport_number is required'));
    assert.equal(sent.length, 0);
  });
});

describe('MoveTransportObjects', () => {
  const twoEntries = [
    { object_name: 'ZCL_X', object_type: 'CLAS', position: '000026' },
    {
      object_name: 'ZMCP_PROG',
      object_type: 'PROG',
      position: '000031',
      pgmid: 'R3TR',
    },
  ];

  it('posts to the source task’s moveobjects, naming the target and each entry by position', async () => {
    const { connection, sent } = recording('<tm:root/>');

    const result = await handleMoveTransportObjects(
      { connection, logger: undefined } as any,
      {
        transport_number: SOURCE,
        target_number: TARGET,
        objects: twoEntries,
      },
    );

    assert.equal(result.isError, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'POST');
    assert.equal(
      sent[0].url,
      `/sap/bc/adt/cts/transportrequests/${SOURCE}/moveobjects`,
    );
    const document = String(sent[0].data);
    assert.ok(document.includes(`tm:number="${TARGET}"`));
    assert.ok(document.includes('tm:useraction="moveobjects"'));
    assert.ok(
      document.includes(
        'tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_X" tm:position="000026"',
      ),
    );
    assert.ok(
      document.includes(
        'tm:pgmid="R3TR" tm:type="PROG" tm:name="ZMCP_PROG" tm:position="000031"',
      ),
    );
    assert.ok(!document.includes(`tm:number="${SOURCE}"`));
  });

  it('claims acceptance, not a move, and names the re-read of both tasks', async () => {
    const { connection } = recording('<tm:root/>');

    const answered = body(
      await handleMoveTransportObjects(
        { connection, logger: undefined } as any,
        {
          transport_number: SOURCE,
          target_number: TARGET,
          objects: twoEntries,
        },
      ),
    );

    assert.equal(answered.accepted, true);
    assert.equal(answered.transport_number, SOURCE);
    assert.equal(answered.target_number, TARGET);
    assert.deepStrictEqual(answered.objects, [
      { object: 'R3TR CLAS ZCL_X', position: '000026' },
      { object: 'R3TR PROG ZMCP_PROG', position: '000031' },
    ]);
    assert.ok(answered.confirm_with.includes('ReadTransportObjects'));
    assert.ok(answered.confirm_with.includes(SOURCE));
    assert.ok(answered.confirm_with.includes(TARGET));
    assert.equal('success' in answered, false);
  });

  for (const [field, args] of [
    ['transport_number', { target_number: TARGET, objects: twoEntries }],
    ['target_number', { transport_number: SOURCE, objects: twoEntries }],
    ['objects', { transport_number: SOURCE, target_number: TARGET }],
  ]) {
    it(format('sends nothing without %s, and names it', field), async () => {
      const { connection, sent } = recording('<tm:root/>');

      const result = await handleMoveTransportObjects(
        { connection, logger: undefined } as any,
        args as never,
      );

      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes(`${field} is required`));
      assert.equal(sent.length, 0);
    });
  }

  it('sends nothing for an empty objects list', async () => {
    const { connection, sent } = recording('<tm:root/>');

    const result = await handleMoveTransportObjects(
      { connection, logger: undefined } as any,
      { transport_number: SOURCE, target_number: TARGET, objects: [] },
    );

    assert.equal(result.isError, true);
    assert.ok(
      result.content[0].text.includes('objects must hold at least one entry'),
    );
    assert.equal(sent.length, 0);
  });

  /**
   * An entry without a position is the one the server answers `200` for and
   * leaves where it was — measured for `removeobject`, and `moveobjects`
   * identifies an entry the same way. So the whole call is refused before
   * anything is sent, not just the entry dropped.
   */
  for (const field of ['object_name', 'object_type', 'position']) {
    it(
      format(
        'sends nothing when an entry lacks %s, and names the entry and field',
        field,
      ),
      async () => {
        const { connection, sent } = recording('<tm:root/>');
        const second: Record<string, string | undefined> = {
          ...twoEntries[1],
        };
        delete second[field];

        const result = await handleMoveTransportObjects(
          { connection, logger: undefined } as any,
          {
            transport_number: SOURCE,
            target_number: TARGET,
            objects: [twoEntries[0], second] as never,
          },
        );

        assert.equal(result.isError, true);
        assert.ok(
          result.content[0].text.includes(`objects[1].${field} is required`),
        );
        assert.equal(sent.length, 0);
      },
    );
  }
});
