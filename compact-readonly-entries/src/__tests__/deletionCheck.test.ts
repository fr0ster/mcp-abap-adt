/**
 * Compact `HandlerDeletionCheck`: the deletion check alone, one request
 * (`POST /sap/bc/adt/deletion/check`, adt-clients' `checkDeletion`), read by
 * `analyseDeletion` — SAP's verdict as it came. It asks about exactly the
 * object `HandlerDelete` removes, for every type a deletion request removes.
 * Served by compact and compact-ro: it changes nothing.
 *
 * Real adt-clients code runs over a recording connection.
 */
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { DELETION_TYPES } from '../../../src/handlers/common/low/deletionTargets';
import { corpusBody } from '../../../src/lib/adtCorpus';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
} from '../../../src/lib/toolSet';
import { compactReadOnlyEntries } from '../group';
import {
  handleHandlerDeletionCheck,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerDeletionCheck';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

type Sent = { method: string; url: string; data?: unknown };
type Answer = { isError?: boolean; content?: Array<{ text?: string }> };
type Reply = { status: number; data: string } | 'pending';

const ALLOWS = corpusBody('deletion-check-allows--01-deletion-check');
const REFUSES = corpusBody('refusal-deletion-check-refuses--01-deletion-check');
const ABSENT =
  '<?xml version="1.0" encoding="utf-8"?><del:checkResponse xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<del:object adtcore:name="ZCL_GONE" adtcore:uri="/sap/bc/adt/oo/classes/zcl_gone" del:isDeletable="true">' +
  '<del:message del:type="W"><del:text>ZCL_GONE does not exist</del:text></del:message>' +
  '</del:object></del:checkResponse>';

function recording(reply: Reply) {
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
        url: String(options.url),
        data: options.data,
      });
      if (reply === 'pending') return new Promise<never>(() => {});
      if (reply.status >= 400) {
        const error = new Error(
          `Request failed with status code ${reply.status}`,
        ) as Error & { response?: unknown };
        error.response = {
          status: reply.status,
          statusText: 'Not Found',
          data: reply.data,
          headers: {},
        };
        throw error;
      }
      return {
        status: reply.status,
        statusText: 'OK',
        headers: {},
        data: reply.data,
      };
    },
  };
  return { connection, sent };
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function check(
  reply: Reply,
  args: Record<string, unknown>,
): Promise<{ sent: Sent[]; answer?: Answer }> {
  const { connection, sent } = recording(reply);
  const pending = handleHandlerDeletionCheck(
    { connection, logger: silent } as unknown as HandlerContext,
    args as never,
  ) as Promise<Answer>;
  if (reply === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...sent] };
  }
  return { sent, answer: await pending };
}

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';

/** Per type, the name the check takes and the object address it asks about. */
const TYPES: Array<[string, string, string]> = [
  ['PACKAGE', 'ZPKG_A', '/sap/bc/adt/packages/zpkg_a'],
  ['DOMAIN', 'ZDOM_A', '/sap/bc/adt/ddic/domains/zdom_a'],
  ['DATA_ELEMENT', 'ZDTEL_A', '/sap/bc/adt/ddic/dataelements/zdtel_a'],
  ['TABLE', 'ZTAB_A', '/sap/bc/adt/ddic/tables/ztab_a'],
  ['STRUCTURE', 'ZSTRU_A', '/sap/bc/adt/ddic/structures/zstru_a'],
  ['DDL', 'ZDDL_A', '/sap/bc/adt/ddic/ddl/sources/zddl_a'],
  ['SERVICE_DEFINITION', 'ZSRVD_A', '/sap/bc/adt/ddic/srvd/sources/zsrvd_a'],
  [
    'SERVICE_BINDING',
    'ZSRVB_A',
    '/sap/bc/adt/businessservices/bindings/zsrvb_a',
  ],
  ['CLASS', 'ZCL_A', '/sap/bc/adt/oo/classes/zcl_a'],
  ['CDS_UNIT_TEST', 'ZCL_T', '/sap/bc/adt/oo/classes/zcl_t'],
  ['PROGRAM', 'ZPROG_A', '/sap/bc/adt/programs/programs/zprog_a'],
  ['INTERFACE', 'ZIF_A', '/sap/bc/adt/oo/interfaces/zif_a'],
  ['FUNCTION_GROUP', 'ZFG_A', '/sap/bc/adt/functions/groups/zfg_a'],
  [
    'FUNCTION_MODULE',
    'ZFG_A|Z_FM_A',
    '/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a',
  ],
  [
    'BEHAVIOR_DEFINITION',
    'ZBDEF_A',
    '/sap/bc/adt/bo/behaviordefinitions/zbdef_a',
  ],
  ['BEHAVIOR_IMPLEMENTATION', 'ZBP_A', '/sap/bc/adt/oo/classes/zbp_a'],
  ['METADATA_EXTENSION', 'ZDDLX_A', '/sap/bc/adt/ddic/ddlx/sources/zddlx_a'],
];

describe('HandlerDeletionCheck is the one deletion check', () => {
  it('covers every type a deletion request removes, and only those', () => {
    expect(TYPES.map(([t]) => t).sort()).toEqual([...DELETION_TYPES].sort());
    expect(
      [
        ...(TOOL_DEFINITION.inputSchema.properties.object_type
          .enum as readonly string[]),
      ].sort(),
    ).toEqual([...DELETION_TYPES].sort());
  });

  it.each(TYPES)(
    '%s: exactly one request, the deletion check of the object, the same held, answered or 404',
    async (object_type, object_name, uri) => {
      const args = { object_type, object_name };
      const held = await check('pending', args);
      const answered = await check({ status: 200, data: ALLOWS }, args);
      const notFound = await check({ status: 404, data: '' }, args);

      expect(held.sent).toHaveLength(1);
      expect(held.sent[0].method).toBe('POST');
      expect(held.sent[0].url).toBe('/sap/bc/adt/deletion/check');
      expect(String(held.sent[0].data).toLowerCase()).toContain(
        `adtcore:uri="${uri}"`,
      );
      expect(answered.sent).toEqual(held.sent);
      expect(notFound.sent).toEqual(held.sent);
      expect(answered.answer?.isError).not.toBe(true);
      expect(notFound.answer?.isError).toBe(true);
    },
  );

  it('answers deletable as SAP permitted it', async () => {
    const answered = await check(
      { status: 200, data: ALLOWS },
      { object_type: 'CLASS', object_name: 'ZMCP_BLD_ANSCH01' },
    );
    expect(answered.answer?.isError).not.toBe(true);
    expect(JSON.parse(textOf(answered.answer))).toEqual({
      deletable: true,
      object: 'ZMCP_BLD_ANSCH01',
    });
  });

  it('answers a refusal with SAP’s words', async () => {
    const answered = await check(
      { status: 200, data: REFUSES },
      { object_type: 'CLASS', object_name: 'ZMCP_BLD_ANSCH01' },
    );
    expect(answered.sent).toHaveLength(1);
    expect(answered.answer?.isError).toBe(true);
    expect(textOf(answered.answer)).toContain(
      'You are already editing ZMCP_BLD_ANSCH01',
    );
  });

  it('a permitted check saying the object does not exist is SAP’s answer, as it came', async () => {
    const answered = await check(
      { status: 200, data: ABSENT },
      { object_type: 'CLASS', object_name: 'ZCL_GONE' },
    );
    expect(answered.answer?.isError).not.toBe(true);
    expect(JSON.parse(textOf(answered.answer))).toEqual({
      deletable: true,
      object: 'ZCL_GONE',
      message: { type: 'W', text: 'ZCL_GONE does not exist' },
    });
  });

  it.each([
    [{ object_type: 'CLASS' }, 'object_name is required'],
    [{ object_type: 'FUNCTION_MODULE', object_name: 'Z_FM_A' }, 'GROUP|MODULE'],
    [
      { object_type: 'LOCAL_TYPES', object_name: 'ZCL_A' },
      'Unsupported deletion check for object_type: LOCAL_TYPES',
    ],
  ])('%j: refused before any request', async (args, words) => {
    const answered = await check({ status: 200, data: ALLOWS }, args);
    expect(answered.sent).toEqual([]);
    expect(answered.answer?.isError).toBe(true);
    expect(textOf(answered.answer)).toContain(words);
  });

  it('names no other tool', () => {
    expect(TOOL_DEFINITION.description).not.toMatch(/Handler[A-Z]/);
  });
});

describe('HandlerDeletionCheck is served by compact and compact-ro', () => {
  const context = {
    connection: null,
    logger: silent,
  } as unknown as HandlerContext;
  const namesOf = (
    groups: Array<{
      getHandlers(): Array<{ toolDefinition: { name: string } }>;
    }>,
  ) => groups.flatMap((g) => g.getHandlers().map((e) => e.toolDefinition.name));

  it('the read-only half carries it', () => {
    const read = compactReadOnlyEntries(() => context).map(
      (e) => e.toolDefinition.name,
    );
    expect(read).toContain('HandlerDeletionCheck');
  });

  it.each([
    [
      'compact',
      // The modifying half is not this package's to import; the read-only
      // half is what serves the check in both sets.
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        modify: () => [],
      }),
    ],
    ['compact-ro', compactReadOnlyToolSetOf(compactReadOnlyEntries)],
  ])('%s serves it', (_kind, set) => {
    expect(namesOf(set.groups(context, 'stdio') as never)).toContain(
      'HandlerDeletionCheck',
    );
  });
});
