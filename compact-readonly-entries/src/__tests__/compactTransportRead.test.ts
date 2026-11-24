/**
 * `HandlerGet` with `object_type: TRANSPORT` is the full set's
 * `ReadTransportObjects`: the objects a transport request or task holds, each
 * with the `position` that `HandlerTransportMoveObjects` takes (and the full
 * set's `MoveTransportObjects` / `RemoveTransportObject`).
 *
 * Both run the real client over a recording connection and are compared whole.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { memberTokens } from '@mcp-abap-adt/lib/compact-shared';
import { defineTool } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetObjectStructure,
  handleGetTransport,
  handleReadTransportObjects,
} from '@mcp-abap-adt/lib/handlers/read';
import {
  assertMatchObject,
  assertRejects,
} from '../../../src/__tests__/helpers/assertions';
import { listedJson } from '../../../src/__tests__/helpers/listedJson';
import {
  PARENT,
  REQUEST,
  TASK,
  TASK_WITH_OBJECTS,
} from '../../../src/__tests__/helpers/transportTaskDocuments';
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
    assert.notEqual(compactReadRouterMap.TRANSPORT.get, undefined);
    assert.notEqual(CompactGet.inputSchema.shape.transport_number, undefined);
    assert.ok(
      memberTokens('HandlerGet', 'onprem').includes(
        'TRANSPORT(transport_number*)',
      ),
    );
    assert.deepStrictEqual(listedJson(FullRead.inputSchema).required, [
      'transport_number',
    ]);
  });

  it('is still the one HandlerGet tool', () => {
    const names = compactReadOnlyEntries().map((e) => e.toolDefinition.name);
    assert.equal(names.filter((n) => n === 'HandlerGet').length, 1);
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

    assert.equal(compact.sent.length, 1);
    assert.deepStrictEqual(compact.sent, full.sent);
    assert.deepStrictEqual(compactAnswer, fullAnswer);
    assert.equal(compactAnswer.isError, false);
    // Terse (the default): the entries as TSV, each with its position.
    const lines = (compactAnswer.content[0]?.text ?? '').split('\n');
    assert.ok(lines.includes('# count 2'));
    assert.ok(lines.includes('CLAS\tZCL_A\t000001'));
    assert.ok(lines.includes('TABL\tZTAB\t000002'));
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

    assert.equal(compact.sent.length, 1);
    assert.deepStrictEqual(compactAnswer, fullAnswer);
    // Terse (the default): each task's entries under its task line, once.
    const text = compactAnswer.content[0]?.text ?? '';
    assert.ok(text.includes('# count 3'));
    assert.ok(
      text.includes(
        '# task SIDK900102\n# pgmid R3TR\nCLAS\tZCL_A\t000001\nTABL\tZTAB\t000002\n# task SIDK900103',
      ),
    );
    assert.ok(text.includes('PROG\tZPROG\t000001'));
  });

  it('refuses a missing transport_number by the full read’s schema, sending nothing', async () => {
    const compact = recording();
    await assertRejects(
      handleHandlerGet(compact.context, { object_type: 'TRANSPORT' }),
      'Invalid arguments for tool ReadTransportObjects: transport_number is required at transport_number',
    );
    assert.deepStrictEqual(compact.sent, []);
  });

  it('offers source and metadata: a urls read is refused naming them', async () => {
    const compact = recording();
    const refused = (await handleHandlerGet(compact.context, {
      object_type: 'TRANSPORT',
      part: 'urls',
      transport_number: NUMBER,
    })) as { isError: boolean };
    assert.equal(refused.isError, true);
    assert.match(JSON.stringify(refused), /offers: source, metadata/);
    assert.deepStrictEqual(compact.sent, []);
  });
});

describe('HandlerGet with object_type TRANSPORT and part metadata', () => {
  for (const [label, document, number, kind] of [
    ['request', REQUEST, PARENT, 'request'],
    ['task', TASK_WITH_OBJECTS, TASK, 'task'],
  ] as const) {
    it(`answers what the full set's GetTransport answers for a ${label}`, async () => {
      const compact = recording(document);
      const full = recording(document);

      const compactAnswer = await handleHandlerGet(compact.context, {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: number,
      });
      const fullAnswer = await handleGetTransport(full.context, {
        transport_number: number,
      });

      assert.equal(compact.sent.length, 1);
      assert.deepStrictEqual(compact.sent, full.sent);
      assert.deepStrictEqual(compactAnswer, fullAnswer);
      const body = JSON.parse(
        (compactAnswer as { content: { text: string }[] }).content[0]?.text ??
          '{}',
      );
      assert.equal(body.kind, kind);
    });
  }
});

/** HandlerGet through its entry, as a client calls it. */
const compactGetEntry = defineTool(CompactGet, handleHandlerGet).call;

describe('HandlerGet TRANSPORT answers what the full reads answer at every detail', () => {
  for (const detail of ['terse', 'medium', 'full', 'raw'] as const) {
    it(`the entries (ReadTransportObjects) at detail ${detail}`, async () => {
      const compact = recording(WITH_AGGREGATE);
      const full = recording(WITH_AGGREGATE);
      // Through its entry: the compact schema is what lets `detail` through.
      const compactAnswer = await compactGetEntry(compact.context, {
        object_type: 'TRANSPORT',
        transport_number: NUMBER,
        detail,
      });
      const fullAnswer = await handleReadTransportObjects(full.context, {
        transport_number: NUMBER,
        detail,
      });
      assert.deepStrictEqual(compactAnswer, fullAnswer);
    });

    it(`the document (GetTransport) at detail ${detail}`, async () => {
      const compact = recording(TASK_WITH_OBJECTS);
      const full = recording(TASK_WITH_OBJECTS);
      // Through its entry: the compact schema is what lets `detail` through.
      const compactAnswer = await compactGetEntry(compact.context, {
        object_type: 'TRANSPORT',
        part: 'metadata',
        transport_number: TASK,
        detail,
      });
      const fullAnswer = await handleGetTransport(full.context, {
        transport_number: TASK,
        detail,
      });
      assert.deepStrictEqual(compactAnswer, fullAnswer);
    });
  }
});

describe('HandlerGet part object_structure answers what GetObjectStructure answers at every detail', () => {
  const STRUCTURE = `<?xml version="1.0" encoding="UTF-8"?><projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer"><projectexplorer:node projectexplorer:nodeid="000002" projectexplorer:parentid="000001" projectexplorer:objecttype="CLAS/OM" projectexplorer:objectname="RUN" projectexplorer:description="A method"/></projectexplorer:objectstructure>`;
  for (const detail of ['terse', 'medium', 'full', 'raw'] as const) {
    it(`detail ${detail}`, async () => {
      const compact = recording(STRUCTURE);
      const full = recording(STRUCTURE);
      const compactAnswer = await compactGetEntry(compact.context, {
        object_type: 'CLASS',
        part: 'object_structure',
        object_adt_type: 'CLAS/OC',
        object_name: 'ZCL_A',
        detail,
      });
      const fullAnswer = await handleGetObjectStructure(full.context, {
        objecttype: 'CLAS/OC',
        objectname: 'ZCL_A',
        detail,
      });
      assert.deepStrictEqual(compactAnswer, fullAnswer);
    });
  }
});
