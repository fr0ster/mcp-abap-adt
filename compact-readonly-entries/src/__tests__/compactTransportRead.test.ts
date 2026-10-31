/**
 * `HandlerGet` with `object_type: TRANSPORT` is the full set's
 * `ReadTransportObjects`: the objects a transport request or task holds, each
 * with the `position` that `HandlerTransportMoveObjects` takes (and the full
 * set's `MoveTransportObjects` / `RemoveTransportObject`).
 *
 * Both run the real client over a recording connection and are compared whole.
 */
import { handleReadTransportObjects } from '@mcp-abap-adt/lib/handlers/read';
import { TOOL_DEFINITION as FullRead } from '../../../src/handlers/transport/readonly/handleReadTransportObjects';
import { compactReadOnlyEntries } from '../group';
import { compactReadRouterMap } from '../handlers/compactReadRoutes';
import {
  TOOL_DEFINITION as CompactGet,
  handleHandlerGet,
} from '../handlers/handleHandlerGet';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

type Sent = { method: string; url: string };

const NUMBER = 'SIDK900101';
const WITH_AGGREGATE = `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="${NUMBER}">
  <tm:request tm:number="${NUMBER}">
    <tm:all_objects>
      <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_A" tm:position="000001"/>
      <tm:abap_object tm:pgmid="R3TR" tm:type="TABL" tm:name="ZTAB" tm:position="000002"/>
      <tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZPROG" tm:position="000003"/>
    </tm:all_objects>
    <tm:task tm:number="SIDK900102">
      <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_A" tm:position="000001"/>
      <tm:abap_object tm:pgmid="R3TR" tm:type="TABL" tm:name="ZTAB" tm:position="000002"/>
    </tm:task>
    <tm:task tm:number="SIDK900103">
      <tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="ZPROG" tm:position="000001"/>
    </tm:task>
  </tm:request>
</tm:root>`;
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="${NUMBER}">
  <tm:request tm:number="${NUMBER}">
    <tm:task tm:number="SIDK900102">
      <tm:abap_object tm:pgmid="R3TR" tm:type="CLAS" tm:name="ZCL_A" tm:position="000001"/>
      <tm:abap_object tm:pgmid="R3TR" tm:type="TABL" tm:name="ZTAB" tm:position="000002"/>
    </tm:task>
  </tm:request>
</tm:root>`;

function recording(document: string = DOCUMENT) {
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
      sent.push({ method: options.method, url: options.url });
      return { status: 200, statusText: 'OK', headers: {}, data: document };
    },
  };
  return { context: { connection, logger: undefined } as never, sent };
}

describe('HandlerGet with object_type TRANSPORT', () => {
  it('routes to the full set’s ReadTransportObjects, and the matrix says get', () => {
    expect(compactReadRouterMap.TRANSPORT.get).toBe(handleReadTransportObjects);
    expect(CompactGet.inputSchema.properties.transport_number).toBeDefined();
    expect(CompactGet.description).toContain('TRANSPORT(transport_number*)');
    expect(FullRead.inputSchema.required).toEqual(['transport_number']);
  });

  it('is still the one HandlerGet tool', () => {
    const names = compactReadOnlyEntries(() => ({}) as never).map(
      (e) => e.toolDefinition.name,
    );
    expect(names.filter((n) => n === 'HandlerGet')).toHaveLength(1);
  });

  it('answers what the full read answers, each object with its position', async () => {
    const compact = recording();
    const full = recording();

    const compactAnswer = (await handleHandlerGet(compact.context, {
      object_type: 'TRANSPORT',
      transport_number: NUMBER,
    })) as { isError: boolean; content: { text: string }[] };
    const fullAnswer = await handleReadTransportObjects(full.context, {
      transport_number: NUMBER,
    });

    expect(compact.sent).toHaveLength(1);
    expect(compact.sent).toEqual(full.sent);
    expect(compactAnswer).toEqual(fullAnswer);
    expect(compactAnswer.isError).toBe(false);
    const body = JSON.parse(compactAnswer.content[0]?.text ?? '{}');
    expect(body.count).toBe(2);
    expect(body.objects).toEqual([
      expect.objectContaining({
        type: 'CLAS',
        name: 'ZCL_A',
        position: '000001',
      }),
      expect.objectContaining({
        type: 'TABL',
        name: 'ZTAB',
        position: '000002',
      }),
    ]);
  });

  it('a request answers each task entry once, with its task, as the full read does', async () => {
    const compact = recording(WITH_AGGREGATE);
    const full = recording(WITH_AGGREGATE);

    const compactAnswer = (await handleHandlerGet(compact.context, {
      object_type: 'TRANSPORT',
      transport_number: NUMBER,
    })) as { isError: boolean; content: { text: string }[] };
    const fullAnswer = await handleReadTransportObjects(full.context, {
      transport_number: NUMBER,
    });

    expect(compact.sent).toHaveLength(1);
    expect(compactAnswer).toEqual(fullAnswer);
    const body = JSON.parse(compactAnswer.content[0]?.text ?? '{}');
    expect(body.count).toBe(3);
    expect(
      body.objects.map(
        (o: { task?: string; name: string; position: string }) =>
          `${o.task}|${o.name}|${o.position}`,
      ),
    ).toEqual([
      'SIDK900102|ZCL_A|000001',
      'SIDK900102|ZTAB|000002',
      'SIDK900103|ZPROG|000001',
    ]);
  });

  it('refuses a missing transport_number in the full read’s words, sending nothing', async () => {
    const compact = recording();
    const refused = (await handleHandlerGet(compact.context, {
      object_type: 'TRANSPORT',
    })) as { isError: boolean };
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).toContain('transport_number is required');
    expect(compact.sent).toEqual([]);
  });

  it('offers no other part: a metadata or urls read is refused naming source', async () => {
    const compact = recording();
    const refused = (await handleHandlerGet(compact.context, {
      object_type: 'TRANSPORT',
      part: 'metadata',
      transport_number: NUMBER,
    })) as { isError: boolean };
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).toMatch(/offers: source/);
    expect(compact.sent).toEqual([]);
  });
});
