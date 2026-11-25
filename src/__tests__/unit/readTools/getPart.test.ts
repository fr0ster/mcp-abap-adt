/**
 * Full-set reads: one `Get<Type>` per type, `part: 'source' | 'metadata'`
 * (default `source`), one ADT request per call, the answer carrying only the
 * document asked for — the same tool in the full set and in `-ro`, and no
 * `Read<Type>` served anywhere.
 *
 * Real adt-clients code runs against a counting connection
 * (`batchHarness.ts`): held open, answered with a document, and answered
 * `404`, each part sends exactly one request.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { compactModifyEntries } from '../../../../compact-modify/src';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '../../../../compact-readonly-entries/src';
import { TOOL_DEFINITION as GET_INCLUDE } from '../../../handlers/include/readonly/handleGetInclude';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { resetSystemContextCache } from '../../../lib/systemContext';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '../../../lib/toolSet';
import { assertMatchObject, assertNoProperty } from '../../helpers/assertions';
import { type Mode, runCase, servedTools } from '../../helpers/batchHarness';
import { jsonAt, listedJson } from '../../helpers/listedJson';
import { silentLogger } from '../../helpers/lowToCompact';
import { setSystemContext } from '../../helpers/processSystemContext';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

interface SourceType {
  tool: string;
  args: Record<string, unknown>;
  /** The one source request's path fragment; absent when it is the object's own URI. */
  sourcePath?: string;
}

const SOURCE_TYPES: SourceType[] = [
  {
    tool: 'GetClass',
    args: { class_name: 'CLAS_A' },
    sourcePath: '/oo/classes/clas_a/source/main',
  },
  {
    tool: 'GetInterface',
    args: { interface_name: 'INTF_A' },
    sourcePath: '/oo/interfaces/intf_a/source/main',
  },
  {
    tool: 'GetProgram',
    args: { program_name: 'PROG_A' },
    sourcePath: '/programs/programs/prog_a/source/main',
  },
  {
    tool: 'GetTable',
    args: { table_name: 'TAB_A' },
    sourcePath: '/ddic/tables/tab_a/source/main',
  },
  {
    tool: 'GetStructure',
    args: { structure_name: 'STRU_A' },
    sourcePath: '/ddic/structures/stru_a/source/main',
  },
  {
    tool: 'GetDdl',
    args: { ddl_name: 'DDL_A' },
    sourcePath: '/ddic/ddl/sources/ddl_a/source/main',
  },
  {
    tool: 'GetServiceDefinition',
    args: { service_definition_name: 'SRVD_A' },
    sourcePath: '/ddic/srvd/sources/srvd_a/source/main',
  },
  {
    tool: 'GetServiceBinding',
    args: { service_binding_name: 'SRVB_A' },
  },
  {
    tool: 'GetBehaviorDefinition',
    args: { behavior_definition_name: 'BDEF_A' },
    sourcePath: '/bo/behaviordefinitions/bdef_a/source/main',
  },
  {
    tool: 'GetBehaviorImplementation',
    args: { behavior_implementation_name: 'BIMP_A' },
    sourcePath: '/oo/classes/bimp_a/source/main',
  },
  {
    tool: 'GetMetadataExtension',
    args: { metadata_extension_name: 'DDLX_A' },
    sourcePath: '/ddic/ddlx/sources/ddlx_a/source/main',
  },
  {
    tool: 'GetFunctionInclude',
    args: { function_group_name: 'FUGR_A', include_name: 'INCL_A' },
    sourcePath: '/functions/groups/fugr_a/includes/incl_a/source/main',
  },
];

const METADATA_ONLY: Array<[string, Record<string, unknown>]> = [
  ['GetDomain', { domain_name: 'DOM_A' }],
  ['GetTableType', { table_type_name: 'TTYP_A' }],
  ['GetDataElement', { data_element_name: 'DTEL_A' }],
  ['GetFunctionGroup', { function_group_name: 'FUGR_A' }],
  ['GetPackage', { package_name: 'PKG_A' }],
  ['GetMessageClass', { message_class_name: 'MSAG_A' }],
  ['GetMessageClassMessage', { message_class_name: 'MSAG_A', msgno: '001' }],
];

const MODES: Mode[] = ['pending', 'document', 'not-found'];

const payloadOf = (text: string | undefined): Record<string, unknown> =>
  JSON.parse(text ?? '{}') as Record<string, unknown>;

describe('Get<Type>: one request per call, only the part asked for (a function module: its group checked first)', () => {
  const context = {
    connection: undefined,
    logger: silentLogger,
  } as unknown as HandlerContext;
  const tools = servedTools(context);

  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  const run = (tool: string, args: Record<string, unknown>, mode: Mode) =>
    runCase(tools, context, { tool, args }, mode);

  for (const [_name, t] of SOURCE_TYPES.map((t) => [t.tool, t] as const)) {
    describe(format('%s', _name), () => {
      it('declares part source | metadata, default source', () => {
        const entry = tools.get(t.tool);
        if (entry === undefined) throw new Error(`no served tool ${t.tool}`);
        const schema = listedJson(entry.toolDefinition.inputSchema);
        assertMatchObject(jsonAt(schema, 'part'), {
          enum: ['source', 'metadata'],
          default: 'source',
        });
      });

      for (const mode of MODES) {
        it(
          format(
            'part source (%s): exactly one request, the source only',
            mode,
          ),
          async () => {
            const ran = await run(t.tool, { ...t.args, part: 'source' }, mode);
            assert.equal(ran.sent.length, 1);
            if (t.sourcePath !== undefined) {
              assert.ok(ran.sent[0]?.toLowerCase().includes(t.sourcePath));
            }
            if (mode === 'document') {
              assert.equal(ran.answer?.isError, false);
              const payload = payloadOf(ran.answer?.content?.[0]?.text);
              assert.ok('source' in Object(payload));
              assert.equal(payload.part, 'source');
              assertNoProperty(payload, 'metadata');
            }
            if (mode === 'not-found') assert.equal(ran.answer?.isError, true);
          },
        );
      }

      for (const mode of MODES) {
        it(
          format(
            'part metadata (%s): exactly one request, the metadata only',
            mode,
          ),
          async () => {
            const ran = await run(
              t.tool,
              { ...t.args, part: 'metadata' },
              mode,
            );
            assert.equal(ran.sent.length, 1);
            assert.ok(!ran.sent[0]?.toLowerCase().includes('/source/'));
            if (mode === 'document') {
              assert.equal(ran.answer?.isError, false);
              const payload = payloadOf(ran.answer?.content?.[0]?.text);
              assert.ok('metadata' in Object(payload));
              assertNoProperty(payload, 'source');
            }
            if (mode === 'not-found') assert.equal(ran.answer?.isError, true);
          },
        );
      }

      it('no part reads the source, in one request', async () => {
        const ran = await run(t.tool, { ...t.args }, 'document');
        assert.equal(ran.sent.length, 1);
        if (t.sourcePath !== undefined) {
          assert.ok(ran.sent[0]?.toLowerCase().includes(t.sourcePath));
        }
        const payload = payloadOf(ran.answer?.content?.[0]?.text);
        assert.ok('source' in Object(payload));
        assert.equal(payload.part, 'source');
        assertNoProperty(payload, 'metadata');
      });
    });
  }

  /**
   * A function module is the one type whose source read is two requests: its
   * metadata at the group given, then the source when the metadata names
   * that group (#2: SAP ignores the group of a module's address). Its
   * metadata part is the one metadata read. The corpus module, at its group.
   */
  describe('GetFunctionModule', () => {
    const module = {
      function_module_name: 'Z_MCP_SHR_FM',
      function_group_name: 'ZMCP_SHR_FGRP',
    };
    const metadata =
      'get /sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm?version=active';
    const source =
      'get /sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main?version=active';
    const lower = (sent: readonly string[]) => sent.map((s) => s.toLowerCase());

    it('declares part source | metadata, default source', () => {
      const entry = tools.get('GetFunctionModule');
      if (entry === undefined)
        throw new Error('no served tool GetFunctionModule');
      const schema = listedJson(entry.toolDefinition.inputSchema);
      assertMatchObject(jsonAt(schema, 'part'), {
        enum: ['source', 'metadata'],
        default: 'source',
      });
    });

    for (const part of [{ part: 'source' }, {}]) {
      it(
        format(
          'part source (%o): the metadata read, then the source when the group holds the module',
          part,
        ),
        async () => {
          const held = await run(
            'GetFunctionModule',
            { ...module, ...part },
            'pending',
          );
          {
            const actual = lower(held.sent);
            assert.equal(actual.length, 1);
            assert.ok(
              typeof actual[0] === 'string' && actual[0].includes(metadata),
            );
          }

          const answered = await run(
            'GetFunctionModule',
            { ...module, ...part },
            'document',
          );
          {
            const actual = lower(answered.sent);
            assert.equal(actual.length, 2);
            assert.ok(
              typeof actual[0] === 'string' && actual[0].includes(metadata),
            );
            assert.ok(
              typeof actual[1] === 'string' && actual[1].includes(source),
            );
          }
          assert.equal(answered.answer?.isError, false);
          const payload = payloadOf(answered.answer?.content?.[0]?.text);
          assert.ok('source' in Object(payload));
          assert.equal(payload.part, 'source');
          assertNoProperty(payload, 'metadata');

          const refused = await run(
            'GetFunctionModule',
            { ...module, ...part },
            'not-found',
          );
          {
            const actual = lower(refused.sent);
            assert.equal(actual.length, 1);
            assert.ok(
              typeof actual[0] === 'string' && actual[0].includes(metadata),
            );
          }
          assert.equal(refused.answer?.isError, true);
        },
      );
    }

    for (const mode of MODES) {
      it(
        format(
          'part metadata (%s): exactly one request, the metadata only',
          mode,
        ),
        async () => {
          const ran = await run(
            'GetFunctionModule',
            { ...module, part: 'metadata' },
            mode,
          );
          {
            const actual = lower(ran.sent);
            assert.equal(actual.length, 1);
            assert.ok(
              typeof actual[0] === 'string' && actual[0].includes(metadata),
            );
          }
          if (mode === 'document') {
            assert.equal(ran.answer?.isError, false);
            const payload = payloadOf(ran.answer?.content?.[0]?.text);
            assert.ok('metadata' in Object(payload));
            assertNoProperty(payload, 'source');
          }
          if (mode === 'not-found') assert.equal(ran.answer?.isError, true);
        },
      );
    }
  });

  for (const [tool, args] of METADATA_ONLY) {
    it(
      format(
        '%s (metadata-only type): one request, no part in the schema',
        tool,
      ),
      async () => {
        const entry = tools.get(tool);
        if (entry === undefined) throw new Error(`no served tool ${tool}`);
        const schema = listedJson(entry.toolDefinition.inputSchema);
        assert.notEqual(schema.properties, undefined);
        assertNoProperty(schema.properties, 'part');
        for (const mode of MODES) {
          const ran = await run(tool, args, mode);
          assert.equal(ran.sent.length, 1);
        }
      },
    );
  }

  // One answer shape per part, whatever the type: `part` and `metadata`.
  // (A message's read needs a class document holding it: its own test.)
  for (const [tool, args] of METADATA_ONLY.filter(
    ([tool]) => tool !== 'GetMessageClassMessage',
  )) {
    it(format('%s answers { part: "metadata", metadata }', tool), async () => {
      // GetPackage's terse is TSV (its sub-packages as rows): its JSON is
      // medium's.
      const ran = await run(
        tool,
        tool === 'GetPackage' ? { ...args, detail: 'medium' } : args,
        'document',
      );
      assert.equal(ran.answer?.isError, false);
      const payload = payloadOf(ran.answer?.content?.[0]?.text);
      assert.equal(payload.part, 'metadata');
      assert.ok('metadata' in Object(payload));
      assertNoProperty(payload, 'source');
    });
  }
});

describe('the sets serve Get<Type>, and no Read<Type>', () => {
  const context = noConnectionContext();
  const entriesOf = (set: ToolSet): Map<string, HandlerEntry> =>
    new Map(
      set
        .groups(context, 'stdio', { dataTools: false })
        .flatMap((g: IHandlerGroup) => g.getHandlers())
        .map((e) => [e.toolDefinition.name, e]),
    );
  const full = entriesOf(fullToolSet);
  const readOnly = entriesOf(fullReadOnlyToolSet);
  const GET_TOOLS = [
    ...SOURCE_TYPES.map((t) => t.tool),
    ...METADATA_ONLY.map(([tool]) => tool),
  ];

  for (const tool of GET_TOOLS) {
    it(
      format('the -ro set serves %s, the same tool as the full set', tool),
      () => {
        const ro = readOnly.get(tool);
        assert.notEqual(ro, undefined);
        assert.equal(ro?.toolDefinition, full.get(tool)?.toolDefinition);
      },
    );
  }

  it('no Read<Type> tool is served in any set', () => {
    const sets: ToolSet[] = [
      fullToolSet,
      fullReadOnlyToolSet,
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        data: compactDataEntries,
        modify: compactModifyEntries,
      }),
      compactReadOnlyToolSetOf({
        readOnly: compactReadOnlyEntries,
        data: compactDataEntries,
      }),
    ];
    // The transport request reads (objects, action log) are not object
    // reads and have no Get<Type>.
    const objectReads = sets
      .flatMap((set) => [...entriesOf(set).keys()])
      .filter((name) => /^Read/.test(name) && !/^ReadTransport/.test(name));
    assert.deepStrictEqual(objectReads, []);
  });
});

/**
 * `GetInclude`: its source as text, as it answered before it had a part,
 * and its metadata document in `GetProgram`'s shape — one request each.
 */
describe('GetInclude: the source as text, the metadata as GetProgram answers it', () => {
  const context: HandlerContext = {
    ...noConnectionContext(),
    logger: silentLogger,
  };
  const tools = servedTools(context);
  const SOURCE = "REPORT zincl.\r\n  WRITE 'x'.\n";

  const run = (
    args: Record<string, unknown>,
    mode: Mode,
    body: string | undefined = SOURCE,
  ) => runCase(tools, context, { tool: 'GetInclude', args, body }, mode);

  it('declares include_name required, part and version', () => {
    // The served definition is the handler's own, read by its declared type.
    assert.equal(tools.get('GetInclude')?.toolDefinition, GET_INCLUDE);
    const schema = listedJson(GET_INCLUDE.inputSchema);
    assert.equal(schema.type, 'object');
    assert.deepStrictEqual(schema.required, ['include_name']);
    assertMatchObject(jsonAt(schema, 'part'), {
      enum: ['source', 'metadata'],
      default: 'source',
    });
    assert.deepStrictEqual(jsonAt(schema, 'version').enum, [
      'active',
      'inactive',
      'workingArea',
    ]);
    assertNoProperty(jsonAt(schema, 'version'), 'default');
  });

  for (const [_label, part] of [
    ['absent', {}],
    ['source', { part: 'source' }],
  ] satisfies [string, Record<string, unknown>][]) {
    it(
      format(
        'part %s: one request for the active source, answered as the text SAP sent',
        _label,
      ),
      async () => {
        for (const mode of MODES) {
          const ran = await run({ include_name: 'INCL_A', ...part }, mode);
          assert.deepStrictEqual(ran.sent, [
            'GET /sap/bc/adt/programs/includes/incl_a/source/main?version=active',
          ]);
          if (mode === 'document') {
            assert.deepStrictEqual(ran.answer, {
              isError: false,
              content: [{ type: 'text', text: SOURCE }],
            });
          }
          if (mode === 'not-found') assert.equal(ran.answer?.isError, true);
        }
      },
    );
  }

  for (const version of ['inactive', 'active', 'workingArea']) {
    it(
      format(
        'version %s: the one source request asks for that version',
        version,
      ),
      async () => {
        const ran = await run({ include_name: 'INCL_A', version }, 'document');
        assert.deepStrictEqual(ran.sent, [
          `GET /sap/bc/adt/programs/includes/incl_a/source/main?version=${version}`,
        ]);
        assert.equal(ran.answer?.content?.[0]?.text, SOURCE);
      },
    );
  }

  for (const mode of MODES) {
    it(
      format(
        'part metadata (%s): one request for the active metadata document, the GetProgram shape',
        mode,
      ),
      async () => {
        const DOCUMENT = '<include:abapInclude adtcore:name="INCL_A"/>';
        const ran = await run(
          { include_name: 'incl_a', part: 'metadata' },
          mode,
          DOCUMENT,
        );
        assert.deepStrictEqual(ran.sent, [
          'GET /sap/bc/adt/programs/includes/incl_a?version=active',
        ]);
        if (mode === 'document') {
          assert.equal(ran.answer?.isError, false);
          assert.deepStrictEqual(payloadOf(ran.answer?.content?.[0]?.text), {
            success: true,
            include_name: 'INCL_A',
            part: 'metadata',
            metadata: DOCUMENT,
          });
        }
        if (mode === 'not-found') assert.equal(ran.answer?.isError, true);
      },
    );
  }

  it('another part is refused by the schema before any request, naming the two', async () => {
    const ran = await run({ include_name: 'INCL_A', part: 'urls' }, 'document');
    assert.deepStrictEqual(ran.sent, []);
    assert.equal(ran.answer, undefined);
    assert.ok(
      String(ran.threw).includes(
        'Invalid arguments for tool GetInclude: Invalid option: expected one of "source"|"metadata" at part',
      ),
    );
  });
});
