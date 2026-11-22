/**
 * `GetTransport` reads a transport request or a task through adt-clients'
 * `getRequest().readObjects()` (#235): the real client over a connection
 * double, so the request on the wire is the member's. The document says
 * which was read (`tm:root/@tm:object_type`, `T` a task): `kind`. Terse
 * answers what the model acts on — a request's header and its tasks as rows,
 * no objects; a task's header, its parent's and its objects as rows of type,
 * name and position — full the whole parse, raw the document.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  handleGetTransport,
  NOT_THE_TRANSPORT_ASKED,
} from '../../handlers/transport/readonly/handleGetTransport';
import { assertMatchObject } from '../helpers/assertions';
import {
  EMPTY_TASK,
  PARENT,
  REQUEST as RECORDED_REQUEST,
  TASK,
  TASK_WITH_OBJECTS,
} from '../helpers/transportTaskDocuments';

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
  it("sends readObjects' one request for the number given", async () => {
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
  });

  it("terse, request: kind 'request', the header and the tasks as rows, no objects", async () => {
    const { connection } = connectionAnswering(RECORDED_REQUEST);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: PARENT,
      }),
    );
    assert.deepStrictEqual(payload, {
      success: true,
      transport_number: PARENT,
      kind: 'request',
      transport: {
        number: PARENT,
        description: 'A request',
        type: 'K',
        status: 'D',
        owner: 'SAPUSER01',
        target_system: '/SIDTOQAS/',
      },
      tasks: [
        {
          number: TASK,
          owner: 'SAPUSER01',
          status: 'D',
          description: 'A request',
          object_count: 1,
        },
      ],
      task_count: 1,
    });
  });

  it("terse, request: kind 'request' for a document that states no object type", async () => {
    const { connection } = connectionAnswering(REQUEST);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: 'TRLK900001',
      }),
    );
    assert.equal(payload.kind, 'request');
    assertMatchObject(payload.transport, {
      number: 'TRLK900001',
      owner: 'DEVELOPER',
      target_system: 'QAS',
    });
    assert.equal(payload.objects, undefined);
    assert.equal(payload.tasks[0].number, 'TRLK900002');
  });

  it('terse, request: include_tasks false leaves the task rows out, still counting them', async () => {
    const { connection } = connectionAnswering(RECORDED_REQUEST);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: PARENT,
        include_tasks: false,
      }),
    );
    assert.equal(payload.tasks, undefined);
    assert.equal(payload.task_count, 1);
  });

  it("terse, task: kind 'task', its header from tm:task, never the parent's", async () => {
    const { connection } = connectionAnswering(TASK_WITH_OBJECTS);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: TASK,
      }),
    );
    assert.deepStrictEqual(payload, {
      success: true,
      transport_number: TASK,
      kind: 'task',
      task: {
        number: TASK,
        parent: PARENT,
        description: 'Integration tests',
        type: 'Development/Correction',
        status: 'D',
        owner: 'SAPUSER01',
      },
      parent_request: {
        number: PARENT,
        type: 'K',
        status: 'D',
        target_system: '/SIDTOQAS/',
      },
      objects: [
        { pgmid: 'R3TR', type: 'CLAS', name: 'ZCL_ONE', position: '000001' },
        {
          pgmid: 'LIMU',
          type: 'METH',
          name: 'ZCL_ONE                       RUN',
          position: '000002',
        },
      ],
      object_count: 2,
    });
  });

  it('terse, task: include_objects false leaves the object rows out, still counting them', async () => {
    const { connection } = connectionAnswering(TASK_WITH_OBJECTS);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: TASK,
        include_objects: false,
      }),
    );
    assert.equal(payload.kind, 'task');
    assert.equal(payload.objects, undefined);
    assert.equal(payload.object_count, 2);
  });

  it('terse, task: the recorded empty task answers no objects', async () => {
    const { connection } = connectionAnswering(EMPTY_TASK);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: TASK,
      }),
    );
    assert.equal(payload.kind, 'task');
    assert.equal(payload.task.number, TASK);
    assert.equal(payload.task.parent, PARENT);
    assert.equal(payload.task.type, 'Development/Correction');
    assert.deepStrictEqual(payload.objects, []);
    assert.equal(payload.object_count, 0);
    assert.deepStrictEqual(payload.parent_request, {
      number: PARENT,
      type: 'K',
      status: 'D',
      target_system: '',
    });
  });

  for (const [label, document, number, kind] of [
    ['request', RECORDED_REQUEST, PARENT, 'R'],
    ['task', TASK_WITH_OBJECTS, TASK, 'T'],
  ] as const) {
    it(`full, ${label}: the whole parse`, async () => {
      const { connection } = connectionAnswering(document);
      const payload = payloadOf(
        await handleGetTransport({ connection, logger: undefined } as any, {
          transport_number: number,
          detail: 'full',
        }),
      );
      assert.equal(payload['tm:root']['@']['tm:object_type'], kind);
    });

    it(`raw, ${label}: the document as ADT sent it`, async () => {
      const { connection } = connectionAnswering(document);
      const result: any = await handleGetTransport(
        { connection, logger: undefined } as any,
        { transport_number: number, detail: 'raw' },
      );
      assert.equal(result.isError, false);
      assert.equal(result.content[0].text, document);
    });
  }

  it('reads a task whose document lacks the task marker, by the number tm:task carries', async () => {
    const unmarked = TASK_WITH_OBJECTS.replace('tm:object_type="T" ', '');
    assert.notEqual(unmarked, TASK_WITH_OBJECTS);
    const { connection } = connectionAnswering(unmarked);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: TASK,
      }),
    );
    assert.equal(payload.kind, 'task');
    assert.equal(payload.task.number, TASK);
    assert.equal(payload.parent_request.number, PARENT);
  });

  it('matches the number given trimmed and in any case', async () => {
    const { connection } = connectionAnswering(TASK_WITH_OBJECTS);
    const payload = payloadOf(
      await handleGetTransport({ connection, logger: undefined } as any, {
        transport_number: ` ${TASK.toLowerCase()} `,
      }),
    );
    assert.equal(payload.kind, 'task');
  });

  for (const [label, document, number] of [
    ['a blank 200', '', TASK],
    [
      'an unrelated document',
      '<?xml version="1.0" encoding="utf-8"?><other:root xmlns:other="urn:other"><other:item number="X"/></other:root>',
      TASK,
    ],
    [
      "a task document for another task's number",
      TASK_WITH_OBJECTS,
      'SIDK900099',
    ],
    [
      "a request document for another request's number",
      RECORDED_REQUEST,
      'SIDK900098',
    ],
    [
      'a task document, marker removed, read by its parent number',
      TASK_WITH_OBJECTS.replace('tm:object_type="T" ', ''),
      PARENT,
    ],
  ] as const) {
    for (const detail of ['terse', 'full', 'raw'] as const) {
      it(`refuses ${label} in fixed words, never as success (detail ${detail})`, async () => {
        const { connection } = connectionAnswering(document);
        const result: any = await handleGetTransport(
          { connection, logger: undefined } as any,
          { transport_number: number, detail },
        );
        assert.equal(result.isError, true);
        assert.equal(result.content[0].text, NOT_THE_TRANSPORT_ASKED);
      });
    }
  }

  it('the refusal of a wrong document is fixed words', () => {
    assert.equal(
      NOT_THE_TRANSPORT_ASKED,
      'The answer is not the transport request or task asked for: its document names another number, or none.',
    );
  });

  it('refuses a whitespace-only number before any request', async () => {
    const { connection, sent } = connectionAnswering(REQUEST);
    const result: any = await handleGetTransport(
      { connection, logger: undefined } as any,
      { transport_number: '   ' },
    );
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'Transport number is required');
    assert.deepStrictEqual(sent, []);
  });

  for (const [label, document] of [
    [
      'a numberless tm:request',
      '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:request/></tm:root>',
    ],
    [
      'a root marked as a task with no tm:task',
      '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:object_type="T"><tm:request tm:number="SIDK900011"/></tm:root>',
    ],
  ] as const) {
    for (const detail of ['terse', 'full', 'raw'] as const) {
      it(`refuses ${label}, whatever number was asked (detail ${detail})`, async () => {
        const { connection } = connectionAnswering(document);
        const result: any = await handleGetTransport(
          { connection, logger: undefined } as any,
          { transport_number: TASK, detail },
        );
        assert.equal(result.isError, true);
        assert.equal(result.content[0].text, NOT_THE_TRANSPORT_ASKED);
      });
    }
  }

  it('reads no blank-padded number as any transport, numberless elements included', async () => {
    for (const document of [
      '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:request/></tm:root>',
      '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:object_type="T"><tm:request/></tm:root>',
    ]) {
      const { connection } = connectionAnswering(document);
      const result: any = await handleGetTransport(
        { connection, logger: undefined } as any,
        { transport_number: ` ${TASK} ` },
      );
      assert.equal(result.content[0].text, NOT_THE_TRANSPORT_ASKED);
    }
  });
});
