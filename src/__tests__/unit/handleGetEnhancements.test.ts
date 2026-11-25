import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterMinimalNested,
  handleGetEnhancements as handleGetEnhancementsOf,
  parseEnhancementsFromXml,
} from '../../handlers/enhancement/readonly/handleGetEnhancements';
import { createBatchAvailability } from '../../lib/batch/availability';
import { assertMatchObject } from '../helpers/assertions';

/** handleGetEnhancements at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleGetEnhancements = (
  context: Parameters<typeof handleGetEnhancementsOf>[0],
  args: Parameters<typeof handleGetEnhancementsOf>[1],
) => handleGetEnhancementsOf(context, { detail: 'full', ...args });

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/**
 * GetEnhancements addresses the object it was told about.
 *
 * Measured on premise, 2026-09-25: for SAPLSLVC_FULLSCREEN with object_type
 * 'program' it ignored the type and probed class → program → include; a
 * function group's main program is none of those addressable things (all
 * three URIs answer 404), so the tool failed with "Failed to determine object
 * type … 404". The group's enhancements live at
 * /functions/groups/<fg>/source/main/enhancements/elements, which answers
 * 200. The probes also passed their Accept header as the request BODY.
 *
 * The elements request is adt-clients' (`readEnhancementElements` on the
 * host): its URL and its Accept are the library's, asserted here on the wire.
 */

const ELEMENTS_ACCEPT = 'application/vnd.sap.adt.enhancements.v3+xml';

type Call = { url: string; headers?: Record<string, string>; data?: unknown };

function connectionAnswering(ok: (url: string) => boolean) {
  const calls: Call[] = [];
  const connection = {
    calls,
    async makeAdtRequest(req: Call) {
      calls.push(req);
      if (ok(req.url)) {
        return {
          status: 200,
          data: '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>',
        };
      }
      const error: any = new Error('Request failed with status code 404');
      error.response = { status: 404 };
      throw error;
    },
  };
  return connection;
}

/**
 * The sequential version, one request after another: a destination known to
 * have no communication batch. (The batched version reads in envelopes:
 * `unit/batch/includeTrees.test.ts`.)
 */
const notServed = createBatchAvailability();
notServed.noteOuterStatus(404);

const run = (connection: unknown, args: Record<string, unknown>) =>
  handleGetEnhancements(
    { connection, logger: undefined, batchAvailability: notServed } as any,
    args,
  );

describe('GetEnhancements', () => {
  it("reads SAPL<fg> as its function group's enhancements, without probing", async () => {
    const connection = connectionAnswering((u) =>
      u.startsWith(
        '/sap/bc/adt/functions/groups/zfg/source/main/enhancements/elements',
      ),
    );

    const result: any = await run(connection, {
      object_name: 'SAPLZFG',
      object_type: 'program',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(
      connection.calls.map((c) => c.url),
      ['/sap/bc/adt/functions/groups/zfg/source/main/enhancements/elements'],
    );
    assert.equal(connection.calls[0]?.headers?.Accept, ELEMENTS_ACCEPT);
  });

  it('goes straight to a class when told it is one', async () => {
    const connection = connectionAnswering((u) =>
      u.startsWith('/sap/bc/adt/oo/classes/zcl_x/source/main/enhancements'),
    );

    const result: any = await run(connection, {
      object_name: 'ZCL_X',
      object_type: 'class',
    });

    assert.equal(result.isError, false);
    assert.deepStrictEqual(
      connection.calls.map((c) => c.url),
      ['/sap/bc/adt/oo/classes/zcl_x/source/main/enhancements/elements'],
    );
    assert.equal(connection.calls[0]?.headers?.Accept, ELEMENTS_ACCEPT);
  });

  it("when it must probe, reads each kind's active metadata through adt-clients, Accept as a header", async () => {
    const connection = connectionAnswering(
      (u) =>
        u === '/sap/bc/adt/programs/programs/zprog?version=active' ||
        u.startsWith(
          '/sap/bc/adt/programs/programs/zprog/source/main/enhancements',
        ),
    );

    const result: any = await run(connection, {
      object_name: 'ZPROG',
      object_type: 'unknown-kind',
    });

    assert.equal(result.isError, false);
    for (const call of connection.calls) {
      assert.equal(call.data, undefined);
    }
    assert.deepStrictEqual(
      connection.calls.map((c) => c.url),
      [
        '/sap/bc/adt/oo/classes/zprog?version=active',
        '/sap/bc/adt/programs/programs/zprog?version=active',
        '/sap/bc/adt/programs/programs/zprog/source/main/enhancements/elements',
      ],
    );
    assert.ok(
      connection.calls
        .find(
          (c) => c.url === '/sap/bc/adt/programs/programs/zprog?version=active',
        )
        ?.headers?.Accept.includes('application/vnd.sap.adt.programs.programs'),
    );
    assert.equal(JSON.parse(result.content[0].text).unreadable, undefined);
  });

  it('a refused probe is the method error as it is, with its step, beside the enhancements', async () => {
    const DOCUMENT =
      '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><type id="ExceptionResourceNoAccess"/><message>No access</message></exc:exception>';
    const calls: Call[] = [];
    const connection = {
      calls,
      async makeAdtRequest(req: Call) {
        calls.push(req);
        if (
          req.url === '/sap/bc/adt/programs/programs/zprog?version=active' ||
          req.url.startsWith(
            '/sap/bc/adt/programs/programs/zprog/source/main/enhancements',
          )
        ) {
          return {
            status: 200,
            data: '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>',
          };
        }
        const error: any = new Error('Request failed with status code 403');
        error.response = {
          status: 403,
          data: DOCUMENT,
          headers: { 'content-type': 'application/xml' },
        };
        throw error;
      },
    };

    const result: any = await run(connection, {
      object_name: 'ZPROG',
      object_type: 'unknown-kind',
    });

    assert.equal(result.isError, false);
    const [refused, ...rest] = JSON.parse(result.content[0].text).unreadable;
    assert.deepStrictEqual(rest, []);
    assert.equal(refused.step, 'read class metadata');
    assert.equal(refused.status, 403);
    assert.equal(refused.raw_body, DOCUMENT);
    assert.equal(refused.message, 'Request failed with status code 403');
  });
});

describe('GetEnhancements: the elements read on the wire, through adt-clients', () => {
  const DOCUMENT =
    '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message>No authorization</message></exc:exception>';
  const answering = (
    answer: (req: Call) => Promise<{ status: number; data: string }>,
  ) => {
    const calls: Call[] = [];
    return {
      calls,
      async makeAdtRequest(req: Call) {
        calls.push(req);
        return answer(req);
      },
    };
  };
  const payloadOf = (result: any) => JSON.parse(result.content[0].text);

  it("an include's read names its main program, from the include's contextRef", async () => {
    const connection = answering(async (req) =>
      req.url === '/sap/bc/adt/programs/includes/lsvimtop?version=active'
        ? {
            status: 200,
            data: '<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes"><include:contextRef adtcore:uri="/sap/bc/adt/functions/groups/svim" adtcore:type="FUGR/F" adtcore:name="SVIM"/></include:abapInclude>',
          }
        : {
            status: 200,
            data: '<enh:enhancements xmlns:enh="http://www.sap.com/adt/enhancements"/>',
          },
    );
    const result: any = await run(connection, {
      object_name: 'LSVIMTOP',
      object_type: 'include',
    });
    assert.equal(result.isError, false);
    assert.deepStrictEqual(
      connection.calls.map((c) => c.url),
      [
        '/sap/bc/adt/programs/includes/lsvimtop?version=active',
        `/sap/bc/adt/programs/includes/lsvimtop/source/main/enhancements/elements?context=${encodeURIComponent('/sap/bc/adt/programs/programs/saplsvim')}`,
      ],
    );
    assert.equal(connection.calls[1]?.headers?.Accept, ELEMENTS_ACCEPT);
  });

  it('a 403 SAP answered is the method error as it is, with step read enhancements', async () => {
    const connection = answering(async () => {
      const error: any = new Error('Request failed with status code 403');
      error.response = { status: 403, data: DOCUMENT };
      throw error;
    });
    const result: any = await run(connection, {
      object_name: 'ZCL_X',
      object_type: 'class',
    });
    assert.equal(result.isError, true);
    // The method's error as adt-clients and the strategy made it: the
    // transport's sentence, SAP's document read into `messages`, the document
    // itself as `raw_body` — the handler adds only the step.
    assertMatchObject(payloadOf(result), {
      message: 'Request failed with status code 403',
      messages: [{ type: 'E', text: 'No authorization' }],
      step: 'read enhancements',
      status: 403,
      raw_body: DOCUMENT,
    });
  });

  it('a 200 whose document is an exception is a refusal too', async () => {
    const connection = answering(async () => ({ status: 200, data: DOCUMENT }));
    const result: any = await run(connection, {
      object_name: 'ZCL_X',
      object_type: 'class',
    });
    assert.equal(result.isError, true);
    assertMatchObject(payloadOf(result), {
      origin: 'refusal',
      step: 'read enhancements',
      message: 'No authorization',
    });
  });

  it('a failure with no answer behind it keeps its words and carries no SAP status', async () => {
    const connection = answering(async () => {
      throw new Error('socket hang up');
    });
    const result: any = await run(connection, {
      object_name: 'ZCL_X',
      object_type: 'class',
    });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('socket hang up'));
    assert.ok(!result.content[0].text.includes('"status"'));
  });
});

/**
 * Each source is named by the enhancement implementation it sits in.
 *
 * The document nests `enh:source` inside `enh:sourceCodePlugin` inside
 * `enh:enhancementImplementations adtcore:name="…"` (on premise, SAPMV45A,
 * 2026-09-25). The parser looked for a name in everything before the source
 * and took the FIRST match in the document, so all five of SAPMV45A's
 * implementations came out named Z_TEST_SAPMV45A_ENHANCEMENT.
 */
describe('parseEnhancementsFromXml', () => {
  const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');
  const impl = (name: string, source: string) =>
    `<enh:enhancementImplementations adtcore:name="${name}" adtcore:type="ENHO/XHH" adtcore:version="active">` +
    `<enh:elements><enh:sourceCodePlugin enh:uri="/x" enh:id="1 " enh:full_name="PR:PEX:P_01EI" enh:mode="static">` +
    `<enh:source>${b64(source)}</enh:source>` +
    `<enh:option><enh:sourceCodePluginOption><enh:position adtcore:uri="/p#start=1,0"/></enh:sourceCodePluginOption></enh:option>` +
    `</enh:sourceCodePlugin></enh:elements>` +
    `<enh:enhancedObject adtcore:uri="/p" adtcore:type="PROG/P" adtcore:name="SAPMV45A"/>` +
    `</enh:enhancementImplementations>`;

  it('names each source by its own implementation', () => {
    const xml =
      '<enh:enhancements xmlns:enh="http://www.sap.com/adt/abapsource/enhancements">' +
      impl('Z_FIRST', 'ENHANCEMENT 1 z_first.\nENDENHANCEMENT.') +
      impl(
        'FSH_DET_PROCESS',
        'ENHANCEMENT 1 fsh_det_process.\nENDENHANCEMENT.',
      ) +
      '</enh:enhancements>';

    const parsed = parseEnhancementsFromXml(xml);

    assert.deepStrictEqual(
      parsed.map((e: { name: string }) => e.name),
      ['Z_FIRST', 'FSH_DET_PROCESS'],
    );
    assert.deepStrictEqual(
      parsed.map((e: { type: string }) => e.type),
      ['ENHO/XHH', 'ENHO/XHH'],
    );
  });

  const parse = parseEnhancementsFromXml;
  const FIRST = 'ENHANCEMENT 1 z_first.\nENDENHANCEMENT.';
  const root = (body: string) =>
    '<enh:enhancements xmlns:enh="http://www.sap.com/adt/abapsource/enhancements" xmlns:adtcore="http://www.sap.com/adt/core">' +
    body +
    '</enh:enhancements>';

  it('reads each source: its implementation, its type, its decoded source', () => {
    assert.deepStrictEqual(parse(root(impl('Z_FIRST', FIRST))), [
      { name: 'Z_FIRST', type: 'ENHO/XHH', sourceCode: FIRST },
    ]);
  });

  it('names a source outside any implementation by the element it sits in', () => {
    assert.deepStrictEqual(
      parse(
        root(
          `<enh:sourceCodePlugin adtcore:name="Z_PLUGIN" adtcore:type="ENHO/XHH"><enh:source>${b64(FIRST)}</enh:source></enh:sourceCodePlugin>`,
        ),
      ),
      [{ name: 'Z_PLUGIN', type: 'ENHO/XHH', sourceCode: FIRST }],
    );
  });

  // Read through the XML parser: an implementation named in apostrophes is
  // still the owner, and a source in CDATA is still a source.
  it('names a source by an implementation whose attributes are quoted with apostrophes', () => {
    const quoted = impl('Z_FIRST', FIRST)
      .replace('adtcore:name="Z_FIRST"', "adtcore:name='Z_FIRST'")
      .replace('adtcore:type="ENHO/XHH"', "adtcore:type='ENHO/XHH'");
    assert.deepStrictEqual(parse(root(quoted)), [
      { name: 'Z_FIRST', type: 'ENHO/XHH', sourceCode: FIRST },
    ]);
  });

  it('reads a source written in CDATA', () => {
    const cdata = impl('Z_FIRST', FIRST).replace(
      `<enh:source>${b64(FIRST)}</enh:source>`,
      `<enh:source><![CDATA[${b64(FIRST)}]]></enh:source>`,
    );
    assert.deepStrictEqual(parse(root(cdata)), [
      { name: 'Z_FIRST', type: 'ENHO/XHH', sourceCode: FIRST },
    ]);
  });

  it('reads no source of a document without one', () => {
    assert.deepStrictEqual(parse(root('')), []);
    assert.deepStrictEqual(parse(''), []);
  });
});

describe('GetEnhancements terse, by default', () => {
  const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');
  const document =
    '<enh:enhancements xmlns:enh="http://www.sap.com/adt/abapsource/enhancements" xmlns:adtcore="http://www.sap.com/adt/core">' +
    '<enh:enhancementImplementations adtcore:name="Z_FIRST" adtcore:type="ENHO/XHH" adtcore:version="active">' +
    `<enh:elements><enh:sourceCodePlugin enh:uri="/x"><enh:source>${b64('ENHANCEMENT 1 z_first.\nSECRET_SOURCE_LINE.\nENDENHANCEMENT.')}</enh:source></enh:sourceCodePlugin></enh:elements>` +
    '</enh:enhancementImplementations></enh:enhancements>';

  it('answers the object, its count and a name/type row per enhancement, no source', async () => {
    const connection = {
      async makeAdtRequest(req: { url: string }) {
        if (
          req.url.startsWith(
            '/sap/bc/adt/functions/groups/zfg/source/main/enhancements/elements',
          )
        ) {
          return { status: 200, data: document };
        }
        const error: any = new Error('Request failed with status code 404');
        error.response = { status: 404 };
        throw error;
      },
    };
    const result: any = await handleGetEnhancementsOf(
      { connection, logger: undefined, batchAvailability: notServed } as any,
      { object_name: 'SAPLZFG', object_type: 'program' },
    );

    const text: string = result.content[0].text;
    assert.equal(result.isError, false, text);
    assert.deepStrictEqual(text.split('\n').slice(-2), [
      'name\ttype\tdescription',
      'Z_FIRST\tENHO/XHH\t',
    ]);
    assert.equal(text.split('\n')[0]?.startsWith('# object '), true);
    assert.equal(text.includes('# count 1'), true);
    assert.equal(text.includes('SECRET_SOURCE_LINE'), false);
  });
});

describe('GetEnhancements answers every source whole at medium, full and raw', () => {
  const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');
  const LONG = `ENHANCEMENT 1 z_long.\n${'* a line of the source\n'.repeat(60)}ENDENHANCEMENT.`;
  const document =
    '<enh:enhancements xmlns:enh="http://www.sap.com/adt/abapsource/enhancements" xmlns:adtcore="http://www.sap.com/adt/core">' +
    '<enh:enhancementImplementations adtcore:name="Z_LONG" adtcore:type="ENHO/XHH" adtcore:version="active">' +
    `<enh:elements><enh:sourceCodePlugin enh:uri="/x"><enh:source>${b64(LONG)}</enh:source></enh:sourceCodePlugin></enh:elements>` +
    '</enh:enhancementImplementations></enh:enhancements>';
  const connection = {
    async makeAdtRequest(req: { url: string }) {
      if (
        req.url.startsWith(
          '/sap/bc/adt/functions/groups/zfg/source/main/enhancements/elements',
        )
      ) {
        return { status: 200, data: document };
      }
      const error: any = new Error('Request failed with status code 404');
      error.response = { status: 404 };
      throw error;
    },
  };
  for (const detail of ['medium', 'full', 'raw'] as const) {
    for (const detailed of [false, true]) {
      it(`detail ${detail}, detailed ${detailed}`, async () => {
        const result: any = await handleGetEnhancementsOf(
          {
            connection,
            logger: undefined,
            batchAvailability: notServed,
          } as any,
          { object_name: 'SAPLZFG', object_type: 'program', detail, detailed },
        );
        const body = JSON.parse(result.content[0].text);
        // raw is what ADT sent: the documents read, the source whole inside.
        if (detail === 'raw') {
          // Every response, the include probes SAP refused (404) too.
          assert.ok(
            body.some(
              (r: { status: number; body: string }) =>
                r.status === 200 && r.body === document,
            ),
          );
          return;
        }
        assert.equal(body.enhancements[0].sourceCode, LONG);
      });
    }
  }
});

// Codex round 10, P1-4: medium with include_nested writes every object read
// — one without enhancements too, with its zero count, as one with refused
// probes, its probes beside it; the count of objects with enhancements
// counts only those.
describe('GetEnhancements medium, nested', () => {
  it('writes every object read, its probes and its count', () => {
    const refusedProbe = {
      message: 'no authorization',
      step: 'read enhancements',
      status: 403,
    };
    const minimal = filterMinimalNested({
      main_object: { name: 'ZPROG', type: 'program' },
      include_nested: true,
      total_objects_analyzed: 3,
      total_enhancements_found: 1,
      objects: [
        {
          object_name: 'ZPROG',
          object_type: 'program',
          enhancements: [{ name: 'Z_E', type: 'ENHO/XHH' }],
        },
        { object_name: 'ZINC_EMPTY', object_type: 'include', enhancements: [] },
        {
          object_name: 'ZINC_REFUSED',
          object_type: 'include',
          enhancements: [],
          unreadable: [refusedProbe],
        },
      ],
    }).answer;
    const objects = minimal.objects as Array<{ object_name: string }>;
    assert.deepStrictEqual(
      objects.map((o) => o.object_name),
      ['ZPROG', 'ZINC_EMPTY', 'ZINC_REFUSED'],
    );
    assert.deepStrictEqual(objects[1], {
      object_name: 'ZINC_EMPTY',
      object_type: 'include',
      total_enhancements: 0,
      enhancements: [],
    });
    assert.deepStrictEqual(objects[2], {
      object_name: 'ZINC_REFUSED',
      object_type: 'include',
      total_enhancements: 0,
      enhancements: [],
      unreadable: [refusedProbe],
    });
    assert.equal(minimal.total_objects_with_enhancements, 1);
  });
});
