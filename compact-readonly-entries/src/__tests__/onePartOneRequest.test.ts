/**
 * Compact `HandlerGet`: one part, one request (spec §4.6, the owner's rule:
 * compact is one ADT request per tool call).
 *
 * - `part: 'source'` (and an absent part) reads the source alone, `part:
 *   'metadata'` the metadata document alone — one request each, held open,
 *   answered with a document and answered `404` alike; the answer carries the
 *   part read, `{ part: 'source', source }` or `{ part: 'metadata', metadata }`,
 *   the same keys for every type;
 * - DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE_TYPE and PACKAGE have no source: `source`
 *   is refused before any request, naming the parts the type has;
 * - FUNCTION_MODULE takes its group in the arguments (`GROUP|MODULE`, or
 *   `function_group_name`): its metadata is read at that group first, and
 *   its source is read there when the metadata names that group (#2: SAP
 *   ignores the group of a module's address) — two requests; its metadata
 *   part is the one metadata read;
 * - `node_structure` of a package (`DEVC/K`) is one request: a blank body
 *   answers an empty listing that states both of its readings;
 * - `urls` is the owner's exception and answers as before.
 *
 * Real adt-clients code runs over the batch proof's counting connection.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { format } from 'node:util';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetServiceBindingPreviewUrl } from '@mcp-abap-adt/lib/handlers/read';
import { corpusBody } from '../../../src/__tests__/helpers/adtCorpus';
import {
  assertMatchObject,
  assertNoProperty,
} from '../../../src/__tests__/helpers/assertions';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { handleHandlerGet } from '../handlers/handleHandlerGet';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

/** Lets every queued callback and immediate run, so a held handler sends all it can. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Run = { sent: string[]; answer?: Answer };

async function runWith(
  handler: (context: HandlerContext, args: never) => unknown,
  mode: Mode,
  args: Record<string, unknown>,
  body?: string,
): Promise<Run> {
  const counting = countingConnection(mode, body);
  const context = {
    connection: counting.connection,
    logger: silent,
  } as unknown as HandlerContext;
  const pending = Promise.resolve(
    handler(context, structuredClone(args) as never),
  ) as Promise<Answer>;
  if (mode === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...counting.sent] };
  }
  const answer = await pending.catch((thrown: unknown) => ({
    isError: true,
    content: [{ text: String(thrown) }],
  }));
  return { sent: counting.sent, answer };
}

const run = (mode: Mode, args: Record<string, unknown>, body?: string) =>
  runWith(handleHandlerGet as never, mode, args, body);

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';
const jsonOf = (answer?: Answer) =>
  JSON.parse(textOf(answer)) as Record<string, unknown>;

/** The types with a source and a metadata document. */
const BOTH: Array<[string, Record<string, unknown>]> = [
  ['TABLE', { table_name: 'TAB_A' }],
  ['STRUCTURE', { structure_name: 'STRU_A' }],
  ['DDL', { ddl_name: 'DDL_A' }],
  ['SERVICE_DEFINITION', { service_definition_name: 'SRVD_A' }],
  ['SERVICE_BINDING', { service_binding_name: 'SRVB_A' }],
  ['CLASS', { class_name: 'CLAS_A' }],
  ['PROGRAM', { program_name: 'PROG_A' }],
  ['INCLUDE', { include_name: 'INCL_A' }],
  ['INTERFACE', { interface_name: 'INTF_A' }],
  ['BEHAVIOR_DEFINITION', { behavior_definition_name: 'BDEF_A' }],
  ['BEHAVIOR_IMPLEMENTATION', { behavior_implementation_name: 'BIMP_A' }],
  ['METADATA_EXTENSION', { metadata_extension_name: 'DDLX_A' }],
];

/** The types with a source alone (a class's includes). */
const SOURCE_ONLY: Array<[string, Record<string, unknown>]> = [
  ['LOCAL_TEST_CLASS', { class_name: 'CLAS_A' }],
  ['LOCAL_TYPES', { class_name: 'CLAS_A' }],
  ['LOCAL_DEFINITIONS', { class_name: 'CLAS_A' }],
  ['LOCAL_MACROS', { class_name: 'CLAS_A' }],
];

/** The types without a source, and the parts each has. */
const SOURCELESS: Array<[string, Record<string, unknown>, string]> = [
  ['DOMAIN', { domain_name: 'DOM_A' }, 'metadata, draft'],
  ['DATA_ELEMENT', { data_element_name: 'DTEL_A' }, 'metadata, draft'],
  ['FUNCTION_GROUP', { function_group_name: 'FUGR_A' }, 'metadata, draft'],
  ['TABLE_TYPE', { table_type_name: 'TTYP_A' }, 'metadata, draft'],
  ['PACKAGE', { package_name: 'PKG_A' }, 'metadata, contents'],
];

const MODES: Mode[] = ['pending', 'document', 'not-found'];

describe('compact HandlerGet: one part, one request', () => {
  for (const [object_type, names] of [...BOTH, ...SOURCE_ONLY]) {
    describe(format('%s', object_type), () => {
      for (const [_label, part] of [
        ['source', { part: 'source' }],
        ['absent', {}],
      ] satisfies [string, Record<string, unknown>][]) {
        it(
          format(
            'part %s: exactly one request, held, answered and 404 alike',
            _label,
          ),
          async () => {
            const args = { object_type, ...names, ...part };
            const [held, documented, refused] = await Promise.all(
              MODES.map((mode) => run(mode, args)),
            );
            assert.equal(held.sent.length, 1);
            assert.deepStrictEqual(documented.sent, held.sent);
            assert.deepStrictEqual(refused.sent, held.sent);
          },
        );
      }

      it('source answers the source only', async () => {
        const { answer } = await run('document', {
          object_type,
          ...names,
          part: 'source',
        });
        assert.notEqual(answer?.isError, true);
        const body = jsonOf(answer);
        assert.equal(body.part, 'source');
        assert.ok('source' in Object(body));
        assertNoProperty(body, 'metadata');
      });
    });
  }

  for (const [object_type, names] of [
    ...BOTH,
    ...SOURCELESS.map(([t, n]) => [t, n] as [string, Record<string, unknown>]),
  ]) {
    describe(format('%s', object_type), () => {
      it('part metadata: exactly one request, held, answered and 404 alike', async () => {
        const args = { object_type, ...names, part: 'metadata' };
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => run(mode, args)),
        );
        assert.equal(held.sent.length, 1);
        assert.deepStrictEqual(documented.sent, held.sent);
        assert.deepStrictEqual(refused.sent, held.sent);
      });

      it('metadata answers the metadata only', async () => {
        // A package's terse is TSV (its sub-packages as rows): its JSON is
        // medium's.
        const { answer } = await run('document', {
          object_type,
          ...names,
          part: 'metadata',
          ...(object_type === 'PACKAGE' ? { detail: 'medium' } : {}),
        });
        assert.notEqual(answer?.isError, true);
        const body = jsonOf(answer);
        assert.equal(body.part, 'metadata');
        assert.ok('metadata' in Object(body));
        assertNoProperty(body, 'source');
      });
    });
  }

  // A service binding has one document: its source and its metadata are the
  // same read (adt-clients' `readMetadata` fetches the resource `read` does).
  for (const [object_type, names] of BOTH.filter(
    ([t]) => t !== 'SERVICE_BINDING',
  )) {
    it(
      format('%s: source and metadata are two different requests', object_type),
      async () => {
        const source = await run('pending', { object_type, ...names });
        const metadata = await run('pending', {
          object_type,
          ...names,
          part: 'metadata',
        });
        assert.notDeepStrictEqual(source.sent[0], metadata.sent[0]);
      },
    );
  }

  for (const [object_type, names, parts] of SOURCELESS) {
    describe(format('%s has no source', object_type), () => {
      for (const [_label, part] of [
        ['source', { part: 'source' }],
        ['absent', {}],
      ] satisfies [string, Record<string, unknown>][]) {
        it(
          format(
            'part %s is refused before any request, naming its parts',
            _label,
          ),
          async () => {
            const { sent, answer } = await run('document', {
              object_type,
              ...names,
              ...part,
            });
            assert.deepStrictEqual(sent, []);
            assert.equal(answer?.isError, true);
            assert.ok(
              textOf(answer).includes(
                `part=source is not available for object_type=${object_type}. It offers: ${parts}.`,
              ),
            );
          },
        );
      }
    });
  }

  describe('FUNCTION_MODULE: the group in the arguments', () => {
    // The corpus module, at the group its metadata states.
    const MODULE_METADATA =
      'GET /sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm?version=active';
    const MODULE_SOURCE =
      'GET /sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main?version=active';

    for (const [_label, names] of [
      ['GROUP|MODULE', { function_module_name: 'ZMCP_SHR_FGRP|Z_MCP_SHR_FM' }],
      [
        'function_group_name',
        {
          function_module_name: 'Z_MCP_SHR_FM',
          function_group_name: 'ZMCP_SHR_FGRP',
        },
      ],
      [
        'both, agreeing',
        {
          function_module_name: 'zmcp_shr_fgrp|z_mcp_shr_fm',
          function_group_name: 'ZMCP_SHR_FGRP',
        },
      ],
    ] satisfies [string, Record<string, unknown>][]) {
      it(
        format(
          'source by %s: the metadata read at that group, then the source there when the group holds the module',
          _label,
        ),
        async () => {
          const args = { object_type: 'FUNCTION_MODULE', ...names };
          const [held, documented, refused] = await Promise.all(
            MODES.map((mode) => run(mode, args)),
          );
          assert.deepStrictEqual(held.sent, [MODULE_METADATA]);
          assert.deepStrictEqual(documented.sent, [
            MODULE_METADATA,
            MODULE_SOURCE,
          ]);
          assert.deepStrictEqual(refused.sent, [MODULE_METADATA]);
          assert.equal(refused.answer?.isError, true);
        },
      );
    }

    it('part metadata: exactly one request, the metadata, held, answered and 404 alike', async () => {
      const args = {
        object_type: 'FUNCTION_MODULE',
        function_module_name: 'ZMCP_SHR_FGRP|Z_MCP_SHR_FM',
        part: 'metadata',
      };
      const [held, documented, refused] = await Promise.all(
        MODES.map((mode) => run(mode, args)),
      );
      assert.deepStrictEqual(held.sent, [MODULE_METADATA]);
      assert.deepStrictEqual(documented.sent, held.sent);
      assert.deepStrictEqual(refused.sent, held.sent);
      assert.notEqual(documented.answer?.isError, true);
      const body = jsonOf(documented.answer);
      assert.equal(body.part, 'metadata');
      assert.ok('metadata' in Object(body));
      assertNoProperty(body, 'source');
    });

    it("a caller's own isError argument is sent on as an argument, the read answered", async () => {
      const { sent, answer } = await run('document', {
        object_type: 'FUNCTION_MODULE',
        function_module_name: 'ZMCP_SHR_FGRP|Z_MCP_SHR_FM',
        isError: true,
      });
      assert.deepStrictEqual(sent, [MODULE_METADATA, MODULE_SOURCE]);
      assert.notEqual(answer?.isError, true);
      assertMatchObject(jsonOf(answer), { part: 'source' });
    });

    it('answers the module and its group', async () => {
      const { answer } = await run('document', {
        object_type: 'FUNCTION_MODULE',
        function_module_name: 'ZMCP_SHR_FGRP|Z_MCP_SHR_FM',
      });
      assert.notEqual(answer?.isError, true);
      assertMatchObject(jsonOf(answer), {
        function_module_name: 'Z_MCP_SHR_FM',
        function_group_name: 'ZMCP_SHR_FGRP',
        part: 'source',
      });
    });

    for (const [_label, names, words] of [
      [
        'no group',
        { function_module_name: 'FM_A' },
        'FUNCTION_MODULE is named GROUP|MODULE, or with function_group_name',
      ],
      [
        'two groups',
        { function_module_name: 'FUGR_A|FM_A', function_group_name: 'FUGR_B' },
        'names group FUGR_A, function_group_name names FUGR_B',
      ],
      [
        'an empty half',
        { function_module_name: '|FM_A' },
        'FUNCTION_MODULE is named GROUP|MODULE, or with function_group_name',
      ],
      [
        'more than one |',
        { function_module_name: 'FUGR_A|FM_A|EXTRA' },
        'FUNCTION_MODULE is named GROUP|MODULE, or with function_group_name',
      ],
    ] satisfies [string, Record<string, unknown>, string][]) {
      it(format('%s: refused before any request', _label), async () => {
        const { sent, answer } = await run('document', {
          object_type: 'FUNCTION_MODULE',
          ...names,
        });
        assert.deepStrictEqual(sent, []);
        assert.equal(answer?.isError, true);
        assert.ok(textOf(answer).includes(words));
      });
    }
  });

  describe('INCLUDE: the source and the metadata document, one request each', () => {
    const SOURCE = "REPORT zincl.\n  WRITE 'x'.\n";

    for (const [_label, part, request] of [
      [
        'absent',
        {},
        'GET /sap/bc/adt/programs/includes/incl_a/source/main?version=active',
      ],
      [
        'source',
        { part: 'source' },
        'GET /sap/bc/adt/programs/includes/incl_a/source/main?version=active',
      ],
      [
        'source, inactive',
        { part: 'source', version: 'inactive' },
        'GET /sap/bc/adt/programs/includes/incl_a/source/main?version=inactive',
      ],
      [
        'source, workingArea',
        { part: 'source', version: 'workingArea' },
        'GET /sap/bc/adt/programs/includes/incl_a/source/main?version=workingArea',
      ],
      [
        'metadata',
        { part: 'metadata' },
        'GET /sap/bc/adt/programs/includes/incl_a?version=active',
      ],
      [
        'metadata, workingArea',
        { part: 'metadata', version: 'workingArea' },
        'GET /sap/bc/adt/programs/includes/incl_a?version=workingArea',
      ],
    ] satisfies [string, Record<string, unknown>, string][]) {
      it(format('part %s: exactly that request', _label), async () => {
        for (const mode of MODES) {
          const { sent } = await run(mode, {
            object_type: 'INCLUDE',
            include_name: 'INCL_A',
            ...part,
          });
          assert.deepStrictEqual(sent, [request]);
        }
      });
    }

    it('source answers { part: "source", source } beside the name', async () => {
      const { answer } = await run(
        'document',
        { object_type: 'INCLUDE', include_name: 'incl_a' },
        SOURCE,
      );
      assert.notEqual(answer?.isError, true);
      assert.deepStrictEqual(jsonOf(answer), {
        success: true,
        include_name: 'INCL_A',
        part: 'source',
        source: SOURCE,
      });
    });

    it('source with a version answers it beside the source', async () => {
      const { answer } = await run(
        'document',
        {
          object_type: 'INCLUDE',
          include_name: 'INCL_A',
          version: 'inactive',
        },
        SOURCE,
      );
      assert.deepStrictEqual(jsonOf(answer), {
        success: true,
        include_name: 'INCL_A',
        version: 'inactive',
        part: 'source',
        source: SOURCE,
      });
    });

    it('metadata answers { part: "metadata", metadata } beside the name', async () => {
      const DOCUMENT = '<include:abapInclude adtcore:name="INCL_A"/>';
      const { answer } = await run(
        'document',
        { object_type: 'INCLUDE', include_name: 'INCL_A', part: 'metadata' },
        DOCUMENT,
      );
      assert.deepStrictEqual(jsonOf(answer), {
        success: true,
        include_name: 'INCL_A',
        part: 'metadata',
        metadata: DOCUMENT,
      });
    });

    for (const part of ['source', 'metadata']) {
      it(
        format(
          'part %s with another version: refused by GetInclude’s schema before any request, naming the three',
          part,
        ),
        async () => {
          const { sent, answer } = await run('document', {
            object_type: 'INCLUDE',
            include_name: 'INCL_A',
            part,
            version: 'latest',
          });
          assert.deepStrictEqual(sent, []);
          assert.equal(answer?.isError, true);
          assert.ok(
            textOf(answer).includes(
              'Invalid arguments for tool GetInclude: Invalid option: expected one of "active"|"inactive"|"workingArea" at version',
            ),
          );
        },
      );
    }

    describe('on ABAP cloud', () => {
      before(() => {
        process.env.SAP_SYSTEM_TYPE = 'cloud';
      });
      after(() => {
        process.env.SAP_SYSTEM_TYPE = 'onprem';
      });

      for (const [part, request] of [
        [
          'source',
          'GET /sap/bc/adt/programs/includes/incl_a/source/main?version=active',
        ],
        ['metadata', 'GET /sap/bc/adt/programs/includes/incl_a?version=active'],
      ]) {
        it(format('part %s: exactly that request', part), async () => {
          for (const mode of MODES) {
            const { sent, answer } = await run(mode, {
              object_type: 'INCLUDE',
              include_name: 'INCL_A',
              part,
            });
            assert.deepStrictEqual(sent, [request]);
            if (mode === 'document') {
              assert.notEqual(answer?.isError, true);
              assert.equal(jsonOf(answer).part, part);
            }
          }
        });
      }
    });
  });

  describe('node_structure of a package (DEVC/K)', () => {
    const args = {
      part: 'node_structure',
      object_adt_type: 'DEVC/K',
      object_name: 'PKG_A',
    };

    it('a blank body: one request, held, answered and 404 alike', async () => {
      const [held, documented, refused] = await Promise.all(
        MODES.map((mode) => run(mode, args, '')),
      );
      assert.equal(held.sent.length, 1);
      assert.match(
        held.sent[0],
        /^POST \/sap\/bc\/adt\/repository\/nodestructure/,
      );
      assert.deepStrictEqual(documented.sent, held.sent);
      assert.deepStrictEqual(refused.sent, held.sent);
    });

    it('a blank body answers an empty listing with both readings stated', async () => {
      const { answer } = await run('document', args, '');
      assert.notEqual(answer?.isError, true);
      assert.deepStrictEqual(jsonOf(answer), {
        objects: [],
        childNodes: [],
        blank:
          'SAP answered a blank body: the package holds no objects, or no package of this name exists.',
      });
    });

    it('a listing: one request, its objects', async () => {
      const listing = corpusBody(
        'read-package-contents-structure--01-nodestructure',
      );
      const { sent, answer } = await run('document', args, listing);
      assert.equal(sent.length, 1);
      const body = jsonOf(answer);
      assertNoProperty(body, 'blank');
      assert.ok(
        (body.objects as unknown[]).length +
          (body.childNodes as unknown[]).length >
          0,
      );
    });
  });

  describe('urls (the owner’s exception)', () => {
    const args = {
      object_type: 'SERVICE_BINDING',
      part: 'urls',
      service_binding_name: 'SRVB_A',
    };

    for (const mode of MODES.filter((m) => m !== 'pending')) {
      it(
        format('answers as GetServiceBindingPreviewUrl does (%s)', mode),
        async () => {
          const compact = await run(mode, args);
          const full = await runWith(
            handleGetServiceBindingPreviewUrl as never,
            mode,
            args,
          );
          assert.deepStrictEqual(compact.sent, full.sent);
          assert.deepStrictEqual(textOf(compact.answer), textOf(full.answer));
        },
      );
    }
  });
});
