/**
 * One row per delete in scope of task 21 (minus `DeleteUnitTest`, which never
 * reaches the client at all — see its own doc comment and the small test at
 * the bottom of this file): per handler, the endpoint the delete actually
 * reaches, whether the caller's own object name landed in the request, and
 * — for the four class-include deletes — the lock handle the write carried.
 *
 * **Driven through a real `AdtClient` against `recordingConnection`, not a
 * mocked member**, on the model of task 20's `highTierWriteChannelReal.test.ts`.
 * `highTierDeletes.test.ts` (this task's own strategy table) uses
 * `fakeClientOf`, which replaces `createAdtClient` itself — proving what a
 * handler *passed* to a member it also mocked, answering whatever the test
 * told it to regardless of what the handler's own arguments were. That is
 * blind by construction to a handler that deletes a hard-coded object name
 * instead of the caller's, reaches another family's factory, drops the lock
 * handle from an include write, drops a required config field, or loses the
 * injected result set on its way to the real member — the exact defect
 * `handleDeleteCdsUnitTest.ts`'s own fix exists to prevent, and the reason
 * its row sits in the deletion-service table below rather than getting a
 * pass because its strategy identity checks out elsewhere.
 *
 * **The deletion-service rows assert the whole `adtcore:uri`, not the
 * object's name alone.** A first cut of this table asserted only that the
 * name reached the request, which a wrong-factory or wrong-type delete can
 * still satisfy: a table named X deleted through the structure family's
 * endpoint carries "X" in its `adtcore:uri` (`/ddic/structures/X`) just as
 * validly as a genuine structure delete does. The type lives in the path
 * segment in front of the name, so `carriesUri` checks the full
 * `adtcore:uri="…"` attribute, type and name together — see its own
 * comment.
 *
 * This file does NOT mock `../../lib/clients` — the real `AdtClass`,
 * `AdtDomain`, `AdtLocalDefinitions`, … build and send the wire request, and
 * every assertion here reads the request `recordingConnection` captured
 * rather than the object a double was told to hand back.
 *
 * Neither this file nor `highTierDeletes.test.ts` is a substitute for the
 * other. This one proves what reaches the wire; that one proves which
 * strategy and which projection a handler chose (a channel test cannot see
 * an `analyse` function's identity, only its effect on a document this
 * table controls anyway) — keep both.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import { handleDeleteBehaviorDefinition } from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition';
import { handleDeleteBehaviorImplementation } from '../../handlers/behavior_implementation/high/handleDeleteBehaviorImplementation';
import { handleDeleteClass } from '../../handlers/class/high/handleDeleteClass';
import { handleDeleteLocalDefinitions } from '../../handlers/class/high/handleDeleteLocalDefinitions';
import { handleDeleteLocalMacros } from '../../handlers/class/high/handleDeleteLocalMacros';
import { handleDeleteLocalTestClass } from '../../handlers/class/high/handleDeleteLocalTestClass';
import { handleDeleteLocalTypes } from '../../handlers/class/high/handleDeleteLocalTypes';
import { handleDeleteDataElement } from '../../handlers/data_element/high/handleDeleteDataElement';
import { handleDeleteDdl } from '../../handlers/ddl/high/handleDeleteDdl';
import { handleDeleteMetadataExtension as handleDeleteMetadataExtensionLow } from '../../handlers/ddlx/low/handleDeleteMetadataExtension';
import { handleDeleteDomain } from '../../handlers/domain/high/handleDeleteDomain';
import { handleDeleteFunctionGroup } from '../../handlers/function_group/high/handleDeleteFunctionGroup';
import { handleDeleteFunctionInclude } from '../../handlers/function_include/high/handleDeleteFunctionInclude';
import { handleDeleteFunctionModule } from '../../handlers/function_module/high/handleDeleteFunctionModule';
import { handleDeleteInterface } from '../../handlers/interface/high/handleDeleteInterface';
import { handleDeleteMessageClass } from '../../handlers/message_class/high/handleDeleteMessageClass';
import { handleDeleteMessageClassMessage } from '../../handlers/message_class/high/handleDeleteMessageClassMessage';
import { handleDeleteMetadataExtension } from '../../handlers/metadata_extension/high/handleDeleteMetadataExtension';
import { handleDeleteProgram } from '../../handlers/program/high/handleDeleteProgram';
import { handleDeleteServiceBinding } from '../../handlers/service_binding/high/handleDeleteServiceBinding';
import { handleDeleteServiceDefinition } from '../../handlers/service_definition/high/handleDeleteServiceDefinition';
import { handleDeleteStructure } from '../../handlers/structure/high/handleDeleteStructure';
import { handleDeleteTable } from '../../handlers/table/high/handleDeleteTable';
import { handleDeleteCdsUnitTest } from '../../handlers/unit_test/high/handleDeleteCdsUnitTest';
import { handleDeleteUnitTest } from '../../handlers/unit_test/high/handleDeleteUnitTest';
import {
  LOCK_SUCCESS_XML,
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';

const ctx = (connection: IAbapConnection) => ({
  connection,
  logger: undefined,
});

/** Every recorded request whose method and URL match. */
function requestsTo(
  requests: RecordedRequest[],
  method: string,
  urlContains: string,
): RecordedRequest[] {
  return requests.filter(
    (r) =>
      r.method === method &&
      r.url.toLowerCase().includes(urlContains.toLowerCase()),
  );
}

/** Whether `needle` appears, case-insensitively, in a request's URL or body. */
function carries(request: RecordedRequest, needle: string): boolean {
  const haystack = `${request.url} ${String(request.data ?? '')}`.toLowerCase();
  return haystack.includes(needle.toLowerCase());
}

/** The `LOCK_HANDLE` value `recordingConnection` answers every `_action=LOCK`
 * request with — pulled from the fixture itself rather than duplicated as a
 * second literal that could drift from it. */
const LOCK_HANDLE = (() => {
  const m = LOCK_SUCCESS_XML.match(/<LOCK_HANDLE>([^<]+)</);
  if (!m) throw new Error('LOCK_SUCCESS_XML changed shape — update the match');
  return m[1];
})();

/** A real captured deletion-service success body, renamed per case so each
 * row's seeded answer is self-consistent. No assertion below reads this
 * response — every one reads the *request* the handler sent; it exists only
 * so `terseDeletion`'s projection has a `del:object` to find (an empty body,
 * `recordingConnection`'s own smart default, has none, and every real
 * success would otherwise come back as a local `projection_failed` — the
 * exact defect this task's fix round found in `DeleteMetadataExtension`). */
function deletionSuccessXml(objectName: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?><del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object del:isDeleted="true" adtcore:name="${objectName}" xmlns:adtcore="http://www.sap.com/adt/core">` +
    '<del:message del:priority="0" del:type="S"><del:text/></del:message></del:object></del:deletionResult>'
  );
}

/** Whether the exact `adtcore:uri="{uri}"` attribute appears in the given
 * request's body, case-insensitively. Deliberately the *whole* URI, not a
 * substring: the object's type is the path prefix in front of its name
 * (`/oo/classes/` vs `/ddic/tables/` vs `/ddic/structures/`, …), and a
 * substring match on the name alone cannot tell a table named X apart from
 * a structure named X, or a class deleted through the wrong family's
 * factory — the reviewer confirmed both of those pass a name-only check
 * silently. `carries` (the loose, name-or-fragment check) stays in use
 * below only where a single technical name is genuinely the whole
 * question — the four include writes' class name in a PUT URL, and
 * `DeleteMetadataExtension`'s name in its own plain-DELETE URL, neither of
 * which has a second family whose path shape could collide with it. */
function carriesUri(request: RecordedRequest, uri: string): boolean {
  return carries(request, `adtcore:uri="${uri}"`);
}

interface DeletionCase {
  name: string;
  /** The exact `adtcore:uri` value the deletion-service body must carry —
   * the object's type (the path segment) and its name both, built from the
   * same technical names `run` passes to the handler. See `carriesUri`'s
   * own comment for why a name-only check is not enough. Unique across
   * rows, so a handler that ignored its own arguments in favour of some
   * other row's name (or a constant) is caught rather than accidentally
   * matched. */
  expectedUri: string;
  run: (connection: IAbapConnection) => Promise<unknown>;
}

const deletionServiceCases: DeletionCase[] = [
  {
    name: 'DeleteBehaviorDefinition',
    // AdtBehaviorDefinition's delete.js lowercases the encoded name.
    expectedUri: '/sap/bc/adt/bo/behaviordefinitions/zbdef_del_x',
    run: (c) =>
      handleDeleteBehaviorDefinition(ctx(c) as any, {
        behavior_definition_name: 'ZBDEF_DEL_X',
      }),
  },
  {
    name: 'DeleteBehaviorImplementation',
    // Routes through getClass()'s own deletion; see class/delete.js.
    expectedUri: '/sap/bc/adt/oo/classes/ZBIMP_DEL_X',
    run: (c) =>
      handleDeleteBehaviorImplementation(ctx(c) as any, {
        behavior_implementation_name: 'ZBIMP_DEL_X',
      }),
  },
  {
    name: 'DeleteClass',
    expectedUri: '/sap/bc/adt/oo/classes/ZCL_DEL_X',
    run: (c) => handleDeleteClass(ctx(c) as any, { class_name: 'ZCL_DEL_X' }),
  },
  {
    name: 'DeleteDataElement',
    expectedUri: '/sap/bc/adt/ddic/dataelements/ZDE_DEL_X',
    run: (c) =>
      handleDeleteDataElement(ctx(c) as any, {
        data_element_name: 'ZDE_DEL_X',
      }),
  },
  {
    name: 'DeleteDdl',
    expectedUri: '/sap/bc/adt/ddic/ddl/sources/ZVW_DEL_X',
    run: (c) => handleDeleteDdl(ctx(c) as any, { ddl_name: 'ZVW_DEL_X' }),
  },
  {
    name: 'DeleteDomain',
    expectedUri: '/sap/bc/adt/ddic/domains/ZDOM_DEL_X',
    run: (c) =>
      handleDeleteDomain(ctx(c) as any, { domain_name: 'ZDOM_DEL_X' }),
  },
  {
    name: 'DeleteFunctionGroup',
    expectedUri: '/sap/bc/adt/functions/groups/ZFG_DEL_X',
    run: (c) =>
      handleDeleteFunctionGroup(ctx(c) as any, {
        function_group_name: 'ZFG_DEL_X',
      }),
  },
  {
    // functionInclude/delete.js lowercases the group segment only.
    name: 'DeleteFunctionInclude',
    expectedUri: '/sap/bc/adt/functions/groups/zfg_del_x/includes/ZINC_DEL_X',
    run: (c) =>
      handleDeleteFunctionInclude(ctx(c) as any, {
        function_group_name: 'ZFG_DEL_X',
        include_name: 'ZINC_DEL_X',
      }),
  },
  {
    // functionModule/delete.js keeps both segments as given (no lowercase).
    name: 'DeleteFunctionModule',
    expectedUri: '/sap/bc/adt/functions/groups/ZFG_DEL_X/fmodules/ZFM_DEL_X',
    run: (c) =>
      handleDeleteFunctionModule(ctx(c) as any, {
        function_module_name: 'ZFM_DEL_X',
        function_group_name: 'ZFG_DEL_X',
      }),
  },
  {
    name: 'DeleteInterface',
    expectedUri: '/sap/bc/adt/oo/interfaces/ZIF_DEL_X',
    run: (c) =>
      handleDeleteInterface(ctx(c) as any, { interface_name: 'ZIF_DEL_X' }),
  },
  {
    // messageClass/delete.js lowercases the encoded name.
    name: 'DeleteMessageClass',
    expectedUri: '/sap/bc/adt/messageclass/zmsgc_del_x',
    run: (c) =>
      handleDeleteMessageClass(ctx(c) as any, {
        message_class_name: 'ZMSGC_DEL_X',
      }),
  },
  {
    name: 'DeleteProgram',
    expectedUri: '/sap/bc/adt/programs/programs/ZPROG_DEL_X',
    run: (c) =>
      handleDeleteProgram(ctx(c) as any, { program_name: 'ZPROG_DEL_X' }),
  },
  {
    // AdtServiceBinding.encodeName lowercases.
    name: 'DeleteServiceBinding',
    expectedUri: '/sap/bc/adt/businessservices/bindings/zsb_del_x',
    run: (c) =>
      handleDeleteServiceBinding(ctx(c) as any, {
        service_binding_name: 'ZSB_DEL_X',
      }),
  },
  {
    name: 'DeleteServiceDefinition',
    expectedUri: '/sap/bc/adt/ddic/srvd/sources/ZSRV_DEL_X',
    run: (c) =>
      handleDeleteServiceDefinition(ctx(c) as any, {
        service_definition_name: 'ZSRV_DEL_X',
      }),
  },
  {
    name: 'DeleteStructure',
    expectedUri: '/sap/bc/adt/ddic/structures/ZST_DEL_X',
    run: (c) =>
      handleDeleteStructure(ctx(c) as any, { structure_name: 'ZST_DEL_X' }),
  },
  {
    name: 'DeleteTable',
    expectedUri: '/sap/bc/adt/ddic/tables/ZTAB_DEL_X',
    run: (c) => handleDeleteTable(ctx(c) as any, { table_name: 'ZTAB_DEL_X' }),
  },
  {
    // Routes through `getClass()` directly (see the handler's own doc
    // comment) — the same wire request as `DeleteClass`, so it belongs in
    // this table rather than its own.
    name: 'DeleteCdsUnitTest',
    expectedUri: '/sap/bc/adt/oo/classes/ZCL_CDS_DEL_X',
    run: (c) =>
      handleDeleteCdsUnitTest(ctx(c) as any, { class_name: 'ZCL_CDS_DEL_X' }),
  },
];

describe.each(deletionServiceCases)('$name', ({ expectedUri, run }) => {
  it(`reaches /sap/bc/adt/deletion/delete, POSTs a request naming adtcore:uri="${expectedUri}", and takes no lock`, async () => {
    const conn = recordingConnection([
      { data: deletionSuccessXml(expectedUri.split('/').pop() as string) },
    ]);

    const result: any = await run(conn);

    expect(result?.isError).toBe(false);

    const hits = requestsTo(
      conn.requests,
      'POST',
      '/sap/bc/adt/deletion/delete',
    );
    expect(hits.length).toBeGreaterThan(0);
    // The exact object — type and name both, not a name-only substring
    // match a wrong-family or wrong-type delete could still satisfy.
    expect(hits.some((r) => carriesUri(r, expectedUri))).toBe(true);
    // A held lock is what makes ADT refuse a deletion; these must never
    // take one.
    expect(conn.requests.some((r) => r.url.includes('_action=LOCK'))).toBe(
      false,
    );
  });
});

interface IncludeDeleteCase {
  name: string;
  urlContains: string;
  run: (className: string, connection: IAbapConnection) => Promise<unknown>;
}

const includeDeleteCases: IncludeDeleteCase[] = [
  {
    name: 'DeleteLocalDefinitions',
    urlContains: '/includes/definitions',
    run: (className, c) =>
      handleDeleteLocalDefinitions(ctx(c) as any, { class_name: className }),
  },
  {
    name: 'DeleteLocalMacros',
    urlContains: '/includes/macros',
    run: (className, c) =>
      handleDeleteLocalMacros(ctx(c) as any, { class_name: className }),
  },
  {
    // Local types write through the `implementations` include — see
    // `handleDeleteLocalTypes.ts` and `highTierWriteChannelReal.test.ts`'s
    // `UpdateLocalTypes` row for the same finding.
    name: 'DeleteLocalTypes',
    urlContains: '/includes/implementations',
    run: (className, c) =>
      handleDeleteLocalTypes(ctx(c) as any, { class_name: className }),
  },
  {
    name: 'DeleteLocalTestClass',
    urlContains: '/includes/testclasses',
    run: (className, c) =>
      handleDeleteLocalTestClass(ctx(c) as any, { class_name: className }),
  },
];

describe.each(includeDeleteCases)('$name', ({ urlContains, run }) => {
  it(`PUTs ${urlContains} for the caller's class, carrying the lock handle it took`, async () => {
    const className = 'ZCL_INC_DEL_X';
    const conn = recordingConnection();

    const result: any = await run(className, conn);

    expect(result?.isError).toBe(false);

    // The lock this handler took, and released — not a caller-supplied
    // handle, since there is no such parameter on this tool.
    expect(conn.requests.some((r) => r.url.includes('_action=LOCK'))).toBe(
      true,
    );

    const hits = requestsTo(conn.requests, 'PUT', urlContains);
    expect(hits.length).toBeGreaterThan(0);
    // The caller's own class name reached the URL...
    expect(hits.some((r) => carries(r, className))).toBe(true);
    // ...and so did the lock handle the lock call answered with — proof
    // this write is not the unlocked 400 `AdtLocalDefinitions.d.ts` warns
    // about (the shape fix round 1 of task 20 restored).
    expect(hits.some((r) => carries(r, `lockhandle=${LOCK_HANDLE}`))).toBe(
      true,
    );
  });
});

describe.each([
  [
    'DeleteMetadataExtension',
    handleDeleteMetadataExtension,
    { metadata_extension_name: 'ZI_DDLX_DEL_X' },
  ],
  [
    'DeleteMetadataExtensionLow',
    handleDeleteMetadataExtensionLow,
    { name: 'ZI_DDLX_DEL_LOW_X' },
  ],
] as const)('%s: a plain DELETE on its own URL, not the deletion service', (_toolName, handler, args) => {
  it("DELETEs /ddic/ddlx/sources/{name} for the caller's name, and takes no lock", async () => {
    const conn = recordingConnection();
    const objectName =
      'name' in args ? args.name : args.metadata_extension_name;

    const result: any = await (handler as any)(ctx(conn) as any, args);

    expect(result?.isError).toBe(false);

    const hits = requestsTo(conn.requests, 'DELETE', '/ddic/ddlx/sources');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((r) => carries(r, objectName))).toBe(true);
    expect(conn.requests.some((r) => r.url.includes('_action=LOCK'))).toBe(
      false,
    );
  });
});

describe('DeleteMessageClassMessage: a PUT of the parent class, the message moved to deletedmessages', () => {
  it("PUTs the class for the caller's class name, moving the caller's msgno into <mc:deletedmessages>", async () => {
    const className = 'ZMSGC_MSG_DEL_X';
    const msgno = '099';
    // Seeded so the class the handler reads back (before the PUT) already
    // carries this message — `AdtMessageClassMessage.writeClass` only moves
    // a message into `<mc:deletedmessages>` if it was present in what it
    // read; an empty class (the connection's own smart default) would put
    // nothing into the PUT body for either shape, silently proving nothing.
    const existingClassXml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<mc:messageClass xmlns:mc="http://www.sap.com/adt/MessageClass" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${className}">` +
      `<mc:messages mc:msgno="${msgno}" mc:msgtext="existing"/></mc:messageClass>`;
    const conn = recordingConnection([{ data: existingClassXml }]);

    const result: any = await handleDeleteMessageClassMessage(
      ctx(conn) as any,
      { message_class_name: className, msgno },
    );

    expect(result?.isError).toBe(false);

    const hits = requestsTo(conn.requests, 'PUT', '/sap/bc/adt/messageclass/');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((r) => carries(r, className))).toBe(true);
    expect(
      hits.some(
        (r) =>
          carries(r, 'mc:deletedmessages') && carries(r, `mc:msgno="${msgno}"`),
      ),
    ).toBe(true);
  });
});

describe('DeleteUnitTest', () => {
  it('never reaches the client: ADT exposes no resource for a test run', async () => {
    // No mock, no recordingConnection — a real connection that throws on
    // touch would still pass, since the handler must never call it.
    const throwingConnection = new Proxy(
      {},
      {
        get() {
          throw new Error('DeleteUnitTest must not touch the connection');
        },
      },
    ) as IAbapConnection;
    const result: any = await handleDeleteUnitTest(
      ctx(throwingConnection) as any,
      { run_id: 'RUN1' },
    );
    expect(result.isError).toBe(true);
  });
});
