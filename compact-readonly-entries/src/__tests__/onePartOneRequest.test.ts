/**
 * Compact `HandlerGet`: one part, one request (spec §4.6, the owner's rule:
 * compact is one ADT request per tool call).
 *
 * - `part: 'source'` (and an absent part) reads the source alone, `part:
 *   'metadata'` the metadata document alone — one request each, held open,
 *   answered with a document and answered `404` alike; the answer carries the
 *   part read, `{ part: 'source', source }` or `{ part: 'metadata', metadata }`,
 *   the same keys for every type;
 * - DOMAIN, DATA_ELEMENT, FUNCTION_GROUP and PACKAGE have no source: `source`
 *   is refused before any request, naming the parts the type has;
 * - FUNCTION_MODULE takes its group in the arguments (`GROUP|MODULE`, or
 *   `function_group_name`): its source is one request at that group;
 * - `node_structure` of a package (`DEVC/K`) is one request: a blank body
 *   answers an empty listing that states both of its readings;
 * - `urls` is the owner's exception and answers as before.
 *
 * Real adt-clients code runs over the batch proof's counting connection.
 */
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetServiceBindingPreviewUrl } from '@mcp-abap-adt/lib/handlers/read';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { corpusBody } from '../../../src/lib/adtCorpus';
import { handleHandlerGet } from '../handlers/handleHandlerGet';

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
  ['INTERFACE', { interface_name: 'INTF_A' }],
  ['FUNCTION_MODULE', { function_module_name: 'FUGR_A|FM_A' }],
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
  ['DOMAIN', { domain_name: 'DOM_A' }, 'metadata'],
  ['DATA_ELEMENT', { data_element_name: 'DTEL_A' }, 'metadata'],
  ['FUNCTION_GROUP', { function_group_name: 'FUGR_A' }, 'metadata'],
  ['PACKAGE', { package_name: 'PKG_A' }, 'metadata, contents'],
];

const MODES: Mode[] = ['pending', 'document', 'not-found'];

describe('compact HandlerGet: one part, one request', () => {
  describe.each([...BOTH, ...SOURCE_ONLY])('%s', (object_type, names) => {
    it.each([
      ['source', { part: 'source' }],
      ['absent', {}],
    ])(
      'part %s: exactly one request, held, answered and 404 alike',
      async (_label, part) => {
        const args = { object_type, ...names, ...part };
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => run(mode, args)),
        );
        expect(held.sent).toHaveLength(1);
        expect(documented.sent).toEqual(held.sent);
        expect(refused.sent).toEqual(held.sent);
      },
    );

    it('source answers the source only', async () => {
      const { answer } = await run('document', {
        object_type,
        ...names,
        part: 'source',
      });
      expect(answer?.isError).not.toBe(true);
      const body = jsonOf(answer);
      expect(body.part).toBe('source');
      expect(body).toHaveProperty('source');
      expect(body).not.toHaveProperty('metadata');
    });
  });

  describe.each([
    ...BOTH,
    ...SOURCELESS.map(([t, n]) => [t, n] as [string, Record<string, unknown>]),
  ])('%s', (object_type, names) => {
    it('part metadata: exactly one request, held, answered and 404 alike', async () => {
      const args = { object_type, ...names, part: 'metadata' };
      const [held, documented, refused] = await Promise.all(
        MODES.map((mode) => run(mode, args)),
      );
      expect(held.sent).toHaveLength(1);
      expect(documented.sent).toEqual(held.sent);
      expect(refused.sent).toEqual(held.sent);
    });

    it('metadata answers the metadata only', async () => {
      const { answer } = await run('document', {
        object_type,
        ...names,
        part: 'metadata',
      });
      expect(answer?.isError).not.toBe(true);
      const body = jsonOf(answer);
      expect(body.part).toBe('metadata');
      expect(body).toHaveProperty('metadata');
      expect(body).not.toHaveProperty('source');
    });
  });

  // A service binding has one document: its source and its metadata are the
  // same read (adt-clients' `readMetadata` fetches the resource `read` does).
  it.each(BOTH.filter(([t]) => t !== 'SERVICE_BINDING'))(
    '%s: source and metadata are two different requests',
    async (object_type, names) => {
      const source = await run('pending', { object_type, ...names });
      const metadata = await run('pending', {
        object_type,
        ...names,
        part: 'metadata',
      });
      expect(source.sent[0]).not.toEqual(metadata.sent[0]);
    },
  );

  describe.each(SOURCELESS)('%s has no source', (object_type, names, parts) => {
    it.each([
      ['source', { part: 'source' }],
      ['absent', {}],
    ])(
      'part %s is refused before any request, naming its parts',
      async (_label, part) => {
        const { sent, answer } = await run('document', {
          object_type,
          ...names,
          ...part,
        });
        expect(sent).toEqual([]);
        expect(answer?.isError).toBe(true);
        expect(textOf(answer)).toContain(
          `part=source is not available for object_type=${object_type}. It offers: ${parts}.`,
        );
      },
    );
  });

  describe('FUNCTION_MODULE: the group in the arguments', () => {
    const MODULE_SOURCE =
      'GET /sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main?version=active';

    it.each([
      ['GROUP|MODULE', { function_module_name: 'FUGR_A|FM_A' }],
      [
        'function_group_name',
        { function_module_name: 'FM_A', function_group_name: 'FUGR_A' },
      ],
      [
        'both, agreeing',
        { function_module_name: 'fugr_a|fm_a', function_group_name: 'FUGR_A' },
      ],
    ])(
      'source by %s: one request at that group, no metadata read',
      async (_label, names) => {
        for (const mode of MODES) {
          const { sent } = await run(mode, {
            object_type: 'FUNCTION_MODULE',
            ...names,
          });
          expect(sent).toEqual([MODULE_SOURCE]);
        }
      },
    );

    it("a caller's own isError argument is sent on as an argument, the read answered", async () => {
      const { sent, answer } = await run('document', {
        object_type: 'FUNCTION_MODULE',
        function_module_name: 'FUGR_A|FM_A',
        isError: true,
      });
      expect(sent).toEqual([MODULE_SOURCE]);
      expect(answer?.isError).not.toBe(true);
      expect(jsonOf(answer)).toMatchObject({ part: 'source' });
    });

    it('answers the module and its group', async () => {
      const { answer } = await run('document', {
        object_type: 'FUNCTION_MODULE',
        function_module_name: 'FUGR_A|FM_A',
      });
      expect(jsonOf(answer)).toMatchObject({
        function_module_name: 'FM_A',
        function_group_name: 'FUGR_A',
        part: 'source',
      });
    });

    it.each([
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
    ])('%s: refused before any request', async (_label, names, words) => {
      const { sent, answer } = await run('document', {
        object_type: 'FUNCTION_MODULE',
        ...names,
      });
      expect(sent).toEqual([]);
      expect(answer?.isError).toBe(true);
      expect(textOf(answer)).toContain(words);
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
      expect(held.sent).toHaveLength(1);
      expect(held.sent[0]).toMatch(
        /^POST \/sap\/bc\/adt\/repository\/nodestructure/,
      );
      expect(documented.sent).toEqual(held.sent);
      expect(refused.sent).toEqual(held.sent);
    });

    it('a blank body answers an empty listing with both readings stated', async () => {
      const { answer } = await run('document', args, '');
      expect(answer?.isError).not.toBe(true);
      expect(jsonOf(answer)).toEqual({
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
      expect(sent).toHaveLength(1);
      const body = jsonOf(answer);
      expect(body).not.toHaveProperty('blank');
      expect(
        (body.objects as unknown[]).length +
          (body.childNodes as unknown[]).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('urls (the owner’s exception)', () => {
    const args = {
      object_type: 'SERVICE_BINDING',
      part: 'urls',
      service_binding_name: 'SRVB_A',
    };

    it.each(MODES.filter((m) => m !== 'pending'))(
      'answers as GetServiceBindingPreviewUrl does (%s)',
      async (mode) => {
        const compact = await run(mode, args);
        const full = await runWith(
          handleGetServiceBindingPreviewUrl as never,
          mode,
          args,
        );
        expect(compact.sent).toEqual(full.sent);
        expect(textOf(compact.answer)).toEqual(textOf(full.answer));
      },
    );
  });
});
