/**
 * One row per write in scope of task 20 (17 creates, 10 updates — minus
 * `CreateUnitTest`/`UpdateUnitTest`, deferred to whichever task takes
 * adt-clients 19's removed/renamed members), plus task 23's own writes,
 * added when task 23 found this table had been left untouched despite
 * being named by the brief as its home: `CreateServiceBinding`,
 * `UpdateServiceBinding`, `CreateUnitTest`, `RunUnitTest`. Per handler, the
 * endpoint the write actually reaches and the field the caller's marker
 * lands in.
 *
 * **Driven through a real `AdtClient` against `recordingConnection`, not a
 * mocked member.** `highTierWriteChannel.test.ts` (the previous task's
 * table) uses `fakeClientOfWithFactory`, which replaces `createAdtClient`
 * itself — asserting what a handler passed to a member it also mocked. That
 * is blind to exactly the class of defect fix round 2 found in
 * `CreateCdsUnitTest`/`UpdateCdsUnitTest`: a member whose *own* inner
 * delegate drops the caller's injected result set, so every success came
 * back mis-shaped and answered as a local failure — invisible to a test
 * that never lets the real delegate run. This table lets the real
 * `AdtClient`, `AdtClass`, `AdtInterface`, `AdtMessageClass`, … build and
 * send the wire request, and inspects the request `recordingConnection`
 * captured: its URL (which endpoint — the family a mocked member's
 * "factory" name would otherwise prove) and its body (the channel the
 * marker travelled through).
 *
 * **Why this table matters for task 23 specifically.** `staticSequences.
 * test.ts` (task 23's own new file) uses `fakeClientOf`, which — like
 * `fakeClientOfWithFactory` above — replaces `createAdtClient` and ignores
 * which factory (`getServiceBinding()`, `getUnitTest()`, …) was actually
 * asked for. A handler pointed at the wrong family's factory, one that
 * dropped its injected `resultsFor(serviceDocuments)`/`ourUnitTest` result
 * set, one that emptied `run()`'s options, or one that dropped the caller's
 * `transport_request` all compile, all pass a refusal-surfacing test, and
 * none of them are visible without the real client actually building the
 * request. These four rows are what catches that class of defect for this
 * task's own writes.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt';
import { handleCreateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleCreateBehaviorImplementation';
import { handleUpdateBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleUpdateBehaviorImplementation';
import { handleCreateClass } from '../../handlers/class/high/handleCreateClass';
import { handleUpdateLocalDefinitions } from '../../handlers/class/high/handleUpdateLocalDefinitions';
import { handleUpdateLocalMacros } from '../../handlers/class/high/handleUpdateLocalMacros';
import { handleUpdateLocalTestClass } from '../../handlers/class/high/handleUpdateLocalTestClass';
import { handleUpdateLocalTypes } from '../../handlers/class/high/handleUpdateLocalTypes';
import { handleCreateDdl } from '../../handlers/ddl/high/handleCreateDdl';
import { handleCreateFunctionGroup } from '../../handlers/function/high/handleCreateFunctionGroup';
import { handleCreateFunctionModule } from '../../handlers/function/high/handleCreateFunctionModule';
import { handleCreateFunctionInclude } from '../../handlers/function_include/high/handleCreateFunctionInclude';
import { handleUpdateFunctionInclude } from '../../handlers/function_include/high/handleUpdateFunctionInclude';
import { handleCreateInterface } from '../../handlers/interface/high/handleCreateInterface';
import { handleCreateMessageClass } from '../../handlers/message_class/high/handleCreateMessageClass';
import { handleCreateMessageClassMessage } from '../../handlers/message_class/high/handleCreateMessageClassMessage';
import { handleUpdateMessageClass } from '../../handlers/message_class/high/handleUpdateMessageClass';
import { handleUpdateMessageClassMessage } from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import { handleCreatePackage } from '../../handlers/package/high/handleCreatePackage';
import { handleCreateProgram } from '../../handlers/program/high/handleCreateProgram';
import { handleCreateServiceBinding } from '../../handlers/service_binding/high/handleCreateServiceBinding';
import { handleUpdateServiceBinding } from '../../handlers/service_binding/high/handleUpdateServiceBinding';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleCreateStructure } from '../../handlers/structure/high/handleCreateStructure';
import { handleCreateTable } from '../../handlers/table/high/handleCreateTable';
import { handleCreateTransport } from '../../handlers/transport/high/handleCreateTransport';
import { handleCreateCdsUnitTest } from '../../handlers/unit_test/high/handleCreateCdsUnitTest';
import { handleCreateUnitTest } from '../../handlers/unit_test/high/handleCreateUnitTest';
import { handleRunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest';
import { handleUpdateCdsUnitTest } from '../../handlers/unit_test/high/handleUpdateCdsUnitTest';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';

const ctx = (connection: IAbapConnection) => ({
  connection,
  logger: undefined,
});

/** Every recorded request whose body (`data`, coerced to a string) contains
 * `marker`. */
function landedIn(
  requests: RecordedRequest[],
  marker: string,
): RecordedRequest[] {
  return requests.filter((r) => String(r.data ?? '').includes(marker));
}

interface ChannelCase {
  name: string;
  method: 'POST' | 'PUT';
  urlContains: string;
  run: (marker: string, connection: IAbapConnection) => Promise<unknown>;
  /** Canned answers a case needs beyond the connection's own smart default
   * (a real lock handle for `_action=LOCK`, 200/empty otherwise) — a create
   * whose own answer is parsed for named fields, not just status. */
  seedAnswers?: Array<Record<string, unknown> | undefined>;
  /** Extra assertions past "the marker landed somewhere in the right URL
   * with the right method" — for a field the shipped member sends
   * somewhere `landedIn`'s body-only search cannot see, like a query
   * parameter. */
  extraChecks?: (marker: string, requests: RecordedRequest[]) => void;
}

const TEST_DOUBLES_OK =
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
  '<asx:values><DATA><SEVERITY>OK</SEVERITY></DATA></asx:values></asx:abap>';

const TRANSPORT_CREATED_XML =
  '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">' +
  '<tm:request tm:number="E19K900123" tm:desc="x" tm:type="K" tm:target="LOCAL" tm:cts_project="">' +
  '<tm:task tm:owner="SAPUSER01"/></tm:request></tm:root>';

const cases: ChannelCase[] = [
  {
    name: 'CreateBehaviorImplementation',
    method: 'POST',
    urlContains: '/sap/bc/adt/oo/classes',
    run: (marker, connection) =>
      handleCreateBehaviorImplementation(ctx(connection) as any, {
        class_name: 'ZBP_X',
        behavior_definition: 'ZI_X',
        package_name: 'ZP',
        description: marker,
      }),
  },
  {
    name: 'UpdateBehaviorImplementation',
    method: 'PUT',
    urlContains: '/includes/implementations',
    run: (marker, connection) =>
      handleUpdateBehaviorImplementation(ctx(connection) as any, {
        class_name: 'ZBP_X',
        behavior_definition: 'ZI_X',
        implementation_code: marker,
      }),
  },
  {
    name: 'CreateClass',
    method: 'POST',
    urlContains: '/sap/bc/adt/oo/classes',
    run: (marker, connection) =>
      handleCreateClass(ctx(connection) as any, {
        class_name: 'ZCL_X',
        package_name: 'ZP',
        description: marker,
      }),
  },
  {
    name: 'UpdateLocalTestClass',
    method: 'PUT',
    urlContains: '/includes/testclasses',
    run: (marker, connection) =>
      handleUpdateLocalTestClass(ctx(connection) as any, {
        class_name: 'ZCL_X',
        test_class_code: marker,
      }),
  },
  {
    // ADT's own naming: the "Local Types" editor tab is the class's
    // `implementations` include, not a `localtypes` one — the same resource
    // `UpdateBehaviorImplementation` writes. Confirmed against
    // `core/class/includes.js`'s own doc comment ("Update class local types
    // include (implementations)") and its call:
    // `updateClassInclude(..., 'implementations', ...)`.
    name: 'UpdateLocalTypes',
    method: 'PUT',
    urlContains: '/includes/implementations',
    run: (marker, connection) =>
      handleUpdateLocalTypes(ctx(connection) as any, {
        class_name: 'ZCL_X',
        local_types_code: marker,
      }),
  },
  {
    name: 'UpdateLocalDefinitions',
    method: 'PUT',
    urlContains: '/includes/definitions',
    run: (marker, connection) =>
      handleUpdateLocalDefinitions(ctx(connection) as any, {
        class_name: 'ZCL_X',
        definitions_code: marker,
      }),
  },
  {
    name: 'UpdateLocalMacros',
    method: 'PUT',
    urlContains: '/includes/macros',
    run: (marker, connection) =>
      handleUpdateLocalMacros(ctx(connection) as any, {
        class_name: 'ZCL_X',
        macros_code: marker,
      }),
  },
  {
    name: 'CreateDdl',
    method: 'POST',
    urlContains: '/sap/bc/adt/ddic/ddl/sources',
    run: (marker, connection) =>
      handleCreateDdl(ctx(connection) as any, {
        ddl_name: 'ZR_X',
        package_name: 'ZP',
        description: marker,
      }),
  },
  {
    name: 'CreateFunctionGroup',
    method: 'POST',
    urlContains: '/sap/bc/adt/functions/groups',
    run: (marker, connection) =>
      handleCreateFunctionGroup(ctx(connection) as any, {
        function_group_name: 'ZFG_X',
        package_name: 'ZP',
        description: marker,
        activate: false,
      }),
  },
  {
    name: 'CreateFunctionModule',
    method: 'POST',
    urlContains: '/fmodules',
    run: (marker, connection) =>
      handleCreateFunctionModule(ctx(connection) as any, {
        function_group_name: 'ZFG_X',
        function_module_name: 'Z_FM_X',
        description: marker,
      }),
  },
  {
    name: 'CreateFunctionInclude',
    method: 'POST',
    urlContains: '/functions/groups/zfg_x/includes',
    run: (marker, connection) =>
      handleCreateFunctionInclude(ctx(connection) as any, {
        function_group_name: 'ZFG_X',
        include_name: 'ZINC',
        description: marker,
      }),
  },
  {
    name: 'UpdateFunctionInclude',
    method: 'PUT',
    urlContains: '/functions/groups/zfg_x/includes/zinc',
    run: (marker, connection) =>
      handleUpdateFunctionInclude(ctx(connection) as any, {
        function_group_name: 'ZFG_X',
        include_name: 'ZINC',
        source_code: marker,
      }),
  },
  {
    name: 'CreateInterface',
    method: 'POST',
    urlContains: '/sap/bc/adt/oo/interfaces',
    run: (marker, connection) =>
      handleCreateInterface(ctx(connection) as any, {
        interface_name: 'ZIF_X',
        package_name: 'ZP',
        description: marker,
      }),
  },
  {
    name: 'CreateMessageClass',
    method: 'POST',
    urlContains: '/sap/bc/adt/messageclass',
    run: (marker, connection) =>
      handleCreateMessageClass(ctx(connection) as any, {
        message_class_name: 'ZMC',
        package_name: 'ZP',
        description: marker,
      }),
  },
  {
    name: 'CreateMessageClassMessage',
    method: 'PUT',
    urlContains: '/sap/bc/adt/messageclass/zmc',
    run: (marker, connection) =>
      handleCreateMessageClassMessage(ctx(connection) as any, {
        message_class_name: 'ZMC',
        msgno: '001',
        msgtext: marker,
      }),
  },
  {
    name: 'UpdateMessageClass',
    method: 'PUT',
    urlContains: '/sap/bc/adt/messageclass/zmc',
    run: (marker, connection) =>
      handleUpdateMessageClass(ctx(connection) as any, {
        message_class_name: 'ZMC',
        description: marker,
      }),
  },
  {
    name: 'UpdateMessageClassMessage',
    method: 'PUT',
    urlContains: '/sap/bc/adt/messageclass/zmc',
    run: (marker, connection) =>
      handleUpdateMessageClassMessage(ctx(connection) as any, {
        message_class_name: 'ZMC',
        msgno: '001',
        msgtext: marker,
      }),
  },
  {
    name: 'CreatePackage',
    method: 'POST',
    urlContains: '/sap/bc/adt/packages',
    run: (marker, connection) =>
      handleCreatePackage(ctx(connection) as any, {
        package_name: 'ZP_X',
        super_package: 'ZP',
        description: marker,
      }),
  },
  {
    name: 'CreateProgram',
    method: 'POST',
    urlContains: '/sap/bc/adt/programs/programs',
    run: (marker, connection) =>
      handleCreateProgram(ctx(connection) as any, {
        program_name: 'Z_PROG_X',
        package_name: 'ZP',
        description: marker,
      }),
  },
  {
    name: 'CreateServiceDefinition',
    method: 'PUT',
    urlContains: '/sap/bc/adt/ddic/srvd/sources/zsd_x/source/main',
    run: (marker, connection) =>
      handleCreateServiceDefinition(ctx(connection) as any, {
        service_definition_name: 'ZSD_X',
        package_name: 'ZP',
        source_code: marker,
        activate: false,
      }),
  },
  {
    name: 'CreateStructure',
    method: 'POST',
    urlContains: '/sap/bc/adt/ddic/structures',
    run: (marker, connection) =>
      handleCreateStructure(ctx(connection) as any, {
        structure_name: 'ZS_X',
        package_name: 'ZP',
        description: marker,
        fields: [{ name: 'CLIENT' }],
        activate: false,
      }),
  },
  {
    // `description` never reaches `createTable`'s body (the shipped
    // function always derives it from `table_name`, confirmed against
    // `AdtTable.js`) — the marker travels through `package_name` instead,
    // the field that channel genuinely carries.
    name: 'CreateTable',
    method: 'POST',
    urlContains: '/sap/bc/adt/ddic/tables',
    run: (marker, connection) =>
      handleCreateTable(ctx(connection) as any, {
        table_name: 'ZT_X',
        package_name: marker,
      }),
  },
  {
    // `parseCreatedTransport` throws on a document with no `tm:root` — a
    // real create answer is required, not the connection's 200/empty
    // default.
    name: 'CreateTransport',
    method: 'POST',
    urlContains: '/sap/bc/adt/cts/transportrequests',
    seedAnswers: [{ data: TRANSPORT_CREATED_XML }],
    run: (marker, connection) =>
      handleCreateTransport(ctx(connection) as any, { description: marker }),
  },
  {
    // `checkCdsTestDoubles` runs first; its default (200/empty) reading has
    // no `SEVERITY`, which `testDoublesVerdict` treats as a refusal, so a
    // real `OK` verdict is seeded ahead of the class create under test.
    name: 'CreateCdsUnitTest',
    method: 'POST',
    urlContains: '/sap/bc/adt/oo/classes',
    seedAnswers: [{ data: TEST_DOUBLES_OK }],
    run: (marker, connection) =>
      handleCreateCdsUnitTest(ctx(connection) as any, {
        class_name: 'ZCL_X',
        package_name: 'ZP',
        cds_view_name: 'ZI_VIEW',
        description: marker,
      }),
  },
  {
    name: 'UpdateCdsUnitTest',
    method: 'PUT',
    urlContains: '/includes/testclasses',
    run: (marker, connection) =>
      handleUpdateCdsUnitTest(ctx(connection) as any, {
        class_name: 'ZCL_X',
        test_class_source: marker,
      }),
  },
  // --- Task 23's own writes, deferred to this table by name, added here. ---
  {
    // `activate: false` keeps this to the ONE request `create()` itself
    // issues — `staticSequences.test.ts`'s SHAPE 4b already proves the
    // activate/generate order with mocked members; this row proves the
    // create alone reaches the real endpoint the shipped `createRequest`
    // sends it to, through the real `getServiceBinding()` factory (not a
    // different family's), with the caller's `description` landing in the
    // body `create()`'s own XML builder puts it in.
    //
    // `transportRequest` travels a different channel entirely —
    // `createRequest`'s own body reads `params.transportRequest ?
    // { corrNr: params.transportRequest } : undefined`, a query parameter,
    // never the body `landedIn` searches. The same marker is passed as
    // `transport_request` too, and `extraChecks` proves it reached
    // `corrNr` — a dropped transport now fails this row exactly the way a
    // dropped one already fails the task 20 rows above.
    name: 'CreateServiceBinding',
    method: 'POST',
    urlContains: '/sap/bc/adt/businessservices/bindings',
    run: (marker, connection) =>
      handleCreateServiceBinding(ctx(connection) as any, {
        service_binding_name: 'ZSB_X',
        service_definition_name: 'ZSD_X',
        package_name: 'ZP',
        description: marker,
        transport_request: marker,
        activate: false,
      }),
    extraChecks: (marker, requests) => {
      const bindingRequests = requests.filter((r) =>
        r.url.toLowerCase().includes('/sap/bc/adt/businessservices/bindings'),
      );
      expect(
        bindingRequests.some(
          (r) =>
            (r.params as { corrNr?: string } | undefined)?.corrNr === marker,
        ),
      ).toBe(true);
    },
  },
  {
    // `publishByServiceType`'s body carries no free-text field at all — only
    // the binding name, uppercased, in `adtcore:objectReference@name` — so
    // the marker IS the binding name here, the one field this channel
    // genuinely carries. `recordingConnection`'s default (a real lock handle
    // for `_action=LOCK`, 200/empty otherwise) covers the lock this handler
    // now takes and the unlock that releases it; no `seedAnswers` needed.
    name: 'UpdateServiceBinding',
    method: 'POST',
    urlContains: '/businessservices/odatav4/publishjobs',
    run: (marker, connection) =>
      handleUpdateServiceBinding(ctx(connection) as any, {
        service_binding_name: marker,
        desired_publication_state: 'published',
        binding_variant: 'ODATA_V4_UI',
        service_name: 'ZSRV',
      }),
  },
  {
    // `startClassUnitTestRun`'s XML carries the caller's `title` verbatim.
    // `runId` needs a run id in the answer to judge this a success at all
    // (`startedRun`'s own verdict — no id, no success, regardless of HTTP
    // status), so a `Location` header naming a run is seeded.
    name: 'CreateUnitTest',
    method: 'POST',
    urlContains: '/sap/bc/adt/abapunit/runs',
    seedAnswers: [{ headers: { location: '/sap/bc/adt/abapunit/runs/1' } }],
    run: (marker, connection) =>
      handleCreateUnitTest(ctx(connection) as any, {
        tests: [{ container_class: 'ZCL_X', test_class: 'LTCL_X' }],
        title: marker,
      }),
  },
  {
    name: 'RunUnitTest',
    method: 'POST',
    urlContains: '/sap/bc/adt/abapunit/runs',
    seedAnswers: [{ headers: { location: '/sap/bc/adt/abapunit/runs/1' } }],
    run: (marker, connection) =>
      handleRunUnitTest(ctx(connection) as any, {
        tests: [{ container_class: 'ZCL_X', test_class: 'LTCL_X' }],
        title: marker,
      }),
  },
];

describe('every write in task 20 and task 23 lands where its shipped member sends it (real client)', () => {
  it.each(cases)(
    '$name reaches $urlContains and carries the marker',
    async (c) => {
      // Bounded well under the 60-character SAP ADT description limit
      // (`limitDescription`, confirmed in `core/class/create.js` and its
      // structure/table siblings) — a truncated marker would silently pass by
      // matching a prefix of itself.
      const marker =
        `MARKER_${c.name.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}`.slice(
          0,
          40,
        );
      const conn = recordingConnection(c.seedAnswers as any);

      const result: any = await c.run(marker, conn);

      expect(result?.isError).toBe(false);

      const hit = landedIn(conn.requests, marker);
      expect(hit.length).toBeGreaterThan(0);
      expect(hit.some((r) => r.method === c.method)).toBe(true);
      expect(
        hit.some((r) =>
          r.url.toLowerCase().includes(c.urlContains.toLowerCase()),
        ),
      ).toBe(true);

      c.extraChecks?.(marker, conn.requests);
    },
  );
});
