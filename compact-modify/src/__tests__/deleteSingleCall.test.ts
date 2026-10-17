/**
 * Compact `HandlerDelete` is one ADT request (spec §4.6, the owner's rule:
 * compact is one request per tool call):
 *
 * - every type a deletion request removes: that request alone — no lock (a
 *   held lock is what makes ADT refuse a deletion), no deletion check (its own
 *   tool, `HandlerDeletionCheck`);
 * - LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS and
 *   UNIT_TEST: one `PUT` of empty content under the caller's `lock_handle`
 *   (a `DELETE` on an include answers `405`, measured on premise) — no lock or
 *   unlock of its own, no activation.
 *
 * Real adt-clients code runs over a recording connection; nothing of it is
 * doubled. Each case runs held open, answered and answered `404`: the same
 * one request in all three.
 */
import { compactDeleteSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { HeldLocks } from '@mcp-abap-adt/lib/state';
import { DELETION_TYPES } from '../../../src/handlers/common/low/deletionTargets';
import { corpusBody } from '../../../src/lib/adtCorpus';
import { compactWriteRouterMap } from '../handlers/compactWriteRoutes';
import {
  handleHandlerDelete,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerDelete';

type Sent = { method: string; url: string; data?: unknown };
type Mode = 'pending' | 'answered' | 'not-found';
type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

const LOCK = 'LOCK_HANDLE_PLACEHOLDER';
const TRANSPORT = 'XXXK900001';
const DELETED = corpusBody('delete-success--01-deletion-delete');

/** A connection that records every request and answers per `mode`. */
function recording(mode: Mode) {
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
      if (mode === 'pending') return new Promise<never>(() => {});
      if (mode === 'not-found') {
        return { status: 404, statusText: 'Not Found', headers: {}, data: '' };
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: String(options.url).startsWith('/sap/bc/adt/deletion/delete')
          ? DELETED
          : '',
      };
    },
  };
  return { connection, sent };
}

const silent = { debug() {}, info() {}, warn() {}, error() {} };

const contextOver = (connection: unknown, heldLocks?: HeldLocks) =>
  ({
    connection,
    logger: silent,
    ...(heldLocks ? { heldLocks } : {}),
  }) as unknown as HandlerContext;

/** Lets every queued callback and immediate run, so a held handler sends all it can. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Run = { sent: Sent[]; answer?: Answer };

async function run(
  mode: Mode,
  args: Record<string, unknown>,
  heldLocks?: HeldLocks,
): Promise<Run> {
  const { connection, sent } = recording(mode);
  const pending = handleHandlerDelete(
    contextOver(connection, heldLocks),
    args as never,
  ) as Promise<Answer>;
  if (mode === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...sent] };
  }
  const answer = await pending.catch((thrown: unknown) => ({
    isError: true,
    content: [{ text: String(thrown) }],
  }));
  return { sent, answer };
}

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';

/** The types a deletion request removes, and the object's address in it. */
const DELETIONS: Array<[string, Record<string, unknown>, string]> = [
  ['PACKAGE', { package_name: 'ZPKG_A' }, '/sap/bc/adt/packages/zpkg_a'],
  ['DOMAIN', { domain_name: 'ZDOM_A' }, '/sap/bc/adt/ddic/domains/zdom_a'],
  [
    'DATA_ELEMENT',
    { data_element_name: 'ZDTEL_A' },
    '/sap/bc/adt/ddic/dataelements/zdtel_a',
  ],
  ['TABLE', { table_name: 'ZTAB_A' }, '/sap/bc/adt/ddic/tables/ztab_a'],
  [
    'STRUCTURE',
    { structure_name: 'ZSTRU_A' },
    '/sap/bc/adt/ddic/structures/zstru_a',
  ],
  ['DDL', { ddl_name: 'ZDDL_A' }, '/sap/bc/adt/ddic/ddl/sources/zddl_a'],
  [
    'SERVICE_DEFINITION',
    { service_definition_name: 'ZSRVD_A' },
    '/sap/bc/adt/ddic/srvd/sources/zsrvd_a',
  ],
  [
    'SERVICE_BINDING',
    { service_binding_name: 'ZSRVB_A' },
    '/sap/bc/adt/businessservices/bindings/zsrvb_a',
  ],
  ['CLASS', { class_name: 'ZCL_A' }, '/sap/bc/adt/oo/classes/zcl_a'],
  ['CDS_UNIT_TEST', { class_name: 'ZCL_T' }, '/sap/bc/adt/oo/classes/zcl_t'],
  [
    'PROGRAM',
    { program_name: 'ZPROG_A' },
    '/sap/bc/adt/programs/programs/zprog_a',
  ],
  ['INTERFACE', { interface_name: 'ZIF_A' }, '/sap/bc/adt/oo/interfaces/zif_a'],
  [
    'FUNCTION_GROUP',
    { function_group_name: 'ZFG_A' },
    '/sap/bc/adt/functions/groups/zfg_a',
  ],
  [
    'FUNCTION_MODULE',
    { function_module_name: 'Z_FM_A', function_group_name: 'ZFG_A' },
    '/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a',
  ],
  [
    'BEHAVIOR_DEFINITION',
    { behavior_definition_name: 'ZBDEF_A' },
    '/sap/bc/adt/bo/behaviordefinitions/zbdef_a',
  ],
  [
    'BEHAVIOR_IMPLEMENTATION',
    { behavior_implementation_name: 'ZBP_A' },
    '/sap/bc/adt/oo/classes/zbp_a',
  ],
  [
    'METADATA_EXTENSION',
    { metadata_extension_name: 'ZDDLX_A' },
    '/sap/bc/adt/ddic/ddlx/sources/zddlx_a',
  ],
];

/** The class includes removed by an empty write, and the include each writes. */
const INCLUDES: Array<[string, string]> = [
  ['LOCAL_TEST_CLASS', 'testclasses'],
  ['LOCAL_TYPES', 'implementations'],
  ['LOCAL_DEFINITIONS', 'definitions'],
  ['LOCAL_MACROS', 'macros'],
  ['UNIT_TEST', 'testclasses'],
];

const ALL_TYPES = [...DELETIONS.map(([t]) => t), ...INCLUDES.map(([t]) => t)];

describe('HandlerDelete is one request', () => {
  it('covers every type of the delete route', () => {
    const withDelete = Object.entries(compactWriteRouterMap)
      .filter(([, routes]) => routes.delete !== undefined)
      .map(([type]) => type)
      .sort();
    expect(withDelete).toEqual([...ALL_TYPES].sort());
  });

  it('deletes by the deletion request exactly the types the deletion check asks about', () => {
    expect(DELETIONS.map(([t]) => t).sort()).toEqual(
      [...DELETION_TYPES].sort(),
    );
  });

  it.each(DELETIONS)(
    '%s: exactly one request, the deletion — no lock, no check — the same held, answered or 404',
    async (objectType, fields, uri) => {
      const args = {
        object_type: objectType,
        ...fields,
        transport_request: TRANSPORT,
      };
      const held = await run('pending', args);
      const answered = await run('answered', args);
      const notFound = await run('not-found', args);

      expect(held.sent).toHaveLength(1);
      const [deletion] = held.sent;
      if (objectType === 'METADATA_EXTENSION') {
        // Its deletion is a DELETE on its own URL.
        expect(deletion.method).toBe('DELETE');
        expect(deletion.url.toLowerCase()).toContain(uri);
        expect(deletion.url).toContain(`corrNr=${TRANSPORT}`);
      } else {
        expect(deletion.method).toBe('POST');
        expect(deletion.url).toBe('/sap/bc/adt/deletion/delete');
        expect(String(deletion.data).toLowerCase()).toContain(uri);
        expect(String(deletion.data)).toContain(TRANSPORT);
      }
      expect(deletion.url).not.toContain('_action=');
      expect(deletion.url).not.toContain('/deletion/check');

      expect(answered.sent).toEqual(held.sent);
      expect(notFound.sent).toEqual(held.sent);
      expect(answered.answer?.isError).not.toBe(true);
      expect(notFound.answer?.isError).toBe(true);
    },
  );

  it('answers the deletion result as SAP gave it', async () => {
    const answered = await run('answered', {
      object_type: 'CLASS',
      class_name: 'ZCL_A',
    });
    expect(JSON.parse(textOf(answered.answer))).toMatchObject({
      deleted: true,
    });
  });

  it.each(INCLUDES)(
    '%s: exactly one PUT, empty body, under the given lock_handle — no lock, unlock or activation — the same held, answered or 404',
    async (objectType, include) => {
      const args = {
        object_type: objectType,
        class_name: 'ZCL_A',
        lock_handle: LOCK,
        transport_request: TRANSPORT,
      };
      const held = await run('pending', args);
      const answered = await run('answered', args);
      const notFound = await run('not-found', args);

      expect(held.sent).toHaveLength(1);
      const [write] = held.sent;
      expect(write.method).toBe('PUT');
      expect(write.url).toContain(`/sap/bc/adt/oo/classes/zcl_a/includes/${include}`);
      expect(write.url).toContain(`lockHandle=${LOCK}`);
      expect(write.url).toContain(`corrNr=${TRANSPORT}`);
      expect(write.data).toBe('');

      expect(answered.sent).toEqual(held.sent);
      expect(notFound.sent).toEqual(held.sent);
      expect(answered.answer?.isError).not.toBe(true);
      expect(notFound.answer?.isError).toBe(true);
    },
  );

  it.each(INCLUDES)(
    '%s: without lock_handle refused before any request',
    async (objectType) => {
      for (const lock_handle of [undefined, '', '  ']) {
        const answered = await run('answered', {
          object_type: objectType,
          class_name: 'ZCL_A',
          lock_handle,
        });
        expect(answered.sent).toEqual([]);
        expect(answered.answer?.isError).toBe(true);
        expect(textOf(answered.answer)).toContain('lock_handle is required');
      }
    },
  );

  it.each(INCLUDES)(
    '%s: under a lock_handle the instance does not hold (Streamable HTTP), refused before any request',
    async (objectType) => {
      const answered = await run(
        'answered',
        { object_type: objectType, class_name: 'ZCL_A', lock_handle: LOCK },
        new HeldLocks(),
      );
      expect(answered.sent).toEqual([]);
      expect(textOf(answered.answer)).toContain('lock_handle is not held');
    },
  );

  it.each(INCLUDES)(
    '%s: without class_name refused before any request',
    async (objectType) => {
      for (const class_name of [undefined, '', '  ']) {
        const answered = await run('answered', {
          object_type: objectType,
          class_name,
          lock_handle: LOCK,
        });
        expect(answered.sent).toEqual([]);
        expect(answered.answer?.isError).toBe(true);
        expect(textOf(answered.answer)).toContain('class_name is required');
      }
    },
  );

  it('FUNCTION_MODULE: without function_group_name refused before any request', async () => {
    for (const function_group_name of [undefined, '', '  ']) {
      const answered = await run('answered', {
        object_type: 'FUNCTION_MODULE',
        function_module_name: 'Z_FM_A',
        function_group_name,
      });
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).toBe(true);
      expect(textOf(answered.answer)).toContain(
        'function_group_name is required',
      );
    }
  });

  it.each(DELETIONS)(
    '%s: without its name refused before any request',
    async (objectType, fields) => {
      const [field] = Object.keys(fields);
      const answered = await run('answered', {
        object_type: objectType,
        ...fields,
        [field]: undefined,
      });
      expect(answered.sent).toEqual([]);
      expect(textOf(answered.answer)).toContain(`${field} is required`);
    },
  );

  it.each(['TRANSPORT', 'RUNTIME_DUMP', 'NO_SUCH_TYPE'])(
    '%s: a type with no delete answers in the delete route’s words',
    async (objectType) => {
      const answered = await run('answered', { object_type: objectType });
      expect(answered.sent).toEqual([]);
      expect(textOf(answered.answer)).toContain(
        `Unsupported delete for object_type: ${objectType}`,
      );
    },
  );
});

const schemaProperties = compactDeleteSchema.properties as Record<
  string,
  unknown
>;

describe('the HandlerDelete schema and description', () => {
  it.each(['activate_on_delete', 'force_new_connection', 'activate'])(
    '%s is not in the schema',
    (name) => {
      expect(Object.keys(schemaProperties)).not.toContain(name);
    },
  );

  it('object_type names exactly the types with a delete route', () => {
    const withDelete = Object.entries(compactWriteRouterMap)
      .filter(([, routes]) => routes.delete !== undefined)
      .map(([type]) => type)
      .sort();
    expect(
      [
        ...(compactDeleteSchema.properties.object_type.enum as readonly string[]),
      ].sort(),
    ).toEqual(withDelete);
  });

  it('lock_handle and transport_request are in the schema', () => {
    expect(Object.keys(schemaProperties)).toEqual(
      expect.arrayContaining(['lock_handle', 'transport_request']),
    );
  });

  it('names no other tool', () => {
    expect(TOOL_DEFINITION.description).not.toMatch(/Handler[A-Z]/);
  });

  it('advertises every type it deletes, with only schema arguments; lock_handle for the includes alone', () => {
    const description: string = TOOL_DEFINITION.description;
    const start = description.indexOf('object_type required:');
    expect(start).toBeGreaterThanOrEqual(0);
    const tail = description.slice(start);
    const segment = tail.slice(0, tail.indexOf('. '));
    const advertised = [...segment.matchAll(/([A-Z_]+)\(([^)]*)\)/g)].map(
      ([, type, args]) => [
        type,
        args
          .split(',')
          .map((arg) => arg.trim().replace(/\*$/, ''))
          .filter((arg) => arg.length > 0),
      ],
    ) as Array<[string, string[]]>;
    expect(advertised.map(([type]) => type).sort()).toEqual(
      [...ALL_TYPES].sort(),
    );
    const includeTypes = INCLUDES.map(([t]) => t);
    for (const [type, args] of advertised) {
      expect({
        type,
        foreign: args.filter((arg) => !(arg in schemaProperties)),
        lock: args.includes('lock_handle'),
      }).toEqual({ type, foreign: [], lock: includeTypes.includes(type) });
    }
  });
});
