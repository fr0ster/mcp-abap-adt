/**
 * `GetTransport` reads the request through adt-clients' `getRequest()
 * .readObjects()` (#235): the real client over a connection double, so the
 * request on the wire is the member's, and the answer is read from the
 * request's document as before — `include_objects` / `include_tasks` choose
 * what the answer carries.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetTransport } from '../../handlers/transport/readonly/handleGetTransport';
import { assertMatchObject } from '../helpers/assertions';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const REQUEST = `<?xml version="1.0" encoding="utf-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="TRLK900001">
  <tm:request tm:number="TRLK900001" tm:desc="A request" tm:type="K" tm:status="D" tm:owner="DEVELOPER" tm:target="QAS">
    <tm:task tm:number="TRLK900002" tm:parent="TRLK900001" tm:desc="A task" tm:owner="DEVELOPER">
      <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_ONE" tm:position="000001"/>
    </tm:task>
    <tm:all_objects>
      <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_ONE" tm:position="000001"/>
      <tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZP_TWO" tm:position="000002"/>
    </tm:all_objects>
  </tm:request>
</tm:root>`;

type Sent = { url?: string; method?: string; headers?: Record<string, string> };

function connectionAnswering(data: string) {
  const sent: Sent[] = [];
  const connection = {
    makeAdtRequest: mock.fn(async (request: Sent) => {
      sent.push(request);
      return { status: 200, statusText: 'OK', headers: {}, data };
    }),
  } as unknown as IAbapConnection;
  return { connection, sent };
}

const payloadOf = (result: any) => JSON.parse(result.content[0].text);

describe('GetTransport', () => {
  it("sends readObjects' request and answers the request with its objects and tasks", async () => {
    const { connection, sent } = connectionAnswering(REQUEST);

    const result: any = await handleGetTransport(
      { connection, logger: undefined } as any,
      { transport_number: 'TRLK900001' },
    );

    assert.equal(result.isError, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'GET');
    assert.equal(sent[0].url, '/sap/bc/adt/cts/transportrequests/TRLK900001');
    assert.equal(
      sent[0].headers?.Accept,
      'application/vnd.sap.adt.transportorganizer.v1+xml',
    );

    const payload = payloadOf(result);
    assertMatchObject(payload, {
      success: true,
      transport_number: 'TRLK900001',
      transport: {
        number: 'TRLK900001',
        owner: 'DEVELOPER',
        target_system: 'QAS',
      },
      object_count: 2,
      task_count: 1,
    });
    assert.deepStrictEqual(
      payload.objects.map((o: any) => o.name),
      ['ZCL_ONE', 'ZP_TWO'],
    );
    assertMatchObject(payload.tasks[0], {
      number: 'TRLK900002',
      objects: [{ name: 'ZCL_ONE', type: 'CLAS' }],
    });
  });

  it('leaves out the objects and the tasks when asked to, from the same one request', async () => {
    const { connection, sent } = connectionAnswering(REQUEST);

    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: 'TRLK900001',
        include_objects: false,
        include_tasks: false,
      }),
    );

    assert.deepStrictEqual(
      sent.map((r) => r.url),
      ['/sap/bc/adt/cts/transportrequests/TRLK900001'],
    );
    assert.equal(payload.objects, undefined);
    assert.equal(payload.tasks, undefined);
    assert.equal(payload.transport.number, 'TRLK900001');
  });
});
