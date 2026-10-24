/**
 * `GetTransport` reads the request through adt-clients' `getRequest()
 * .readObjects()` (#235): the real client over a connection double, so the
 * request on the wire is the member's, and the answer is read from the
 * request's document as before — `include_objects` / `include_tasks` choose
 * what the answer carries.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetTransport } from '../../handlers/transport/readonly/handleGetTransport';

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
    makeAdtRequest: jest.fn(async (request: Sent) => {
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

    expect(result.isError).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('GET');
    expect(sent[0].url).toBe('/sap/bc/adt/cts/transportrequests/TRLK900001');
    expect(sent[0].headers?.Accept).toBe(
      'application/vnd.sap.adt.transportorganizer.v1+xml',
    );

    const payload = payloadOf(result);
    expect(payload).toMatchObject({
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
    expect(payload.objects.map((o: any) => o.name)).toEqual([
      'ZCL_ONE',
      'ZP_TWO',
    ]);
    expect(payload.tasks[0]).toMatchObject({
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

    expect(sent.map((r) => r.url)).toEqual([
      '/sap/bc/adt/cts/transportrequests/TRLK900001',
    ]);
    expect(payload.objects).toBeUndefined();
    expect(payload.tasks).toBeUndefined();
    expect(payload.transport.number).toBe('TRLK900001');
  });
});
