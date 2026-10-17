import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';

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

const run = (connection: unknown, args: Record<string, unknown>) =>
  handleGetEnhancements({ connection, logger: undefined } as any, args);

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

    expect(result.isError).toBe(false);
    expect(connection.calls.map((c) => c.url)).toEqual([
      '/sap/bc/adt/functions/groups/zfg/source/main/enhancements/elements',
    ]);
    expect(connection.calls[0]?.headers?.Accept).toBe(ELEMENTS_ACCEPT);
  });

  it('goes straight to a class when told it is one', async () => {
    const connection = connectionAnswering((u) =>
      u.startsWith('/sap/bc/adt/oo/classes/zcl_x/source/main/enhancements'),
    );

    const result: any = await run(connection, {
      object_name: 'ZCL_X',
      object_type: 'class',
    });

    expect(result.isError).toBe(false);
    expect(connection.calls.map((c) => c.url)).toEqual([
      '/sap/bc/adt/oo/classes/zcl_x/source/main/enhancements/elements',
    ]);
    expect(connection.calls[0]?.headers?.Accept).toBe(ELEMENTS_ACCEPT);
  });

  it("when it must probe, reads each kind's metadata through adt-clients, Accept as a header", async () => {
    const connection = connectionAnswering(
      (u) =>
        u === '/sap/bc/adt/programs/programs/zprog' ||
        u.startsWith(
          '/sap/bc/adt/programs/programs/zprog/source/main/enhancements',
        ),
    );

    const result: any = await run(connection, {
      object_name: 'ZPROG',
      object_type: 'unknown-kind',
    });

    expect(result.isError).toBe(false);
    for (const call of connection.calls) {
      expect(call.data).toBeUndefined();
    }
    expect(connection.calls.map((c) => c.url)).toEqual([
      '/sap/bc/adt/oo/classes/zprog',
      '/sap/bc/adt/programs/programs/zprog',
      '/sap/bc/adt/programs/programs/zprog/source/main/enhancements/elements',
    ]);
    expect(
      connection.calls.find(
        (c) => c.url === '/sap/bc/adt/programs/programs/zprog',
      )?.headers?.Accept,
    ).toContain('application/vnd.sap.adt.programs.programs');
    expect(JSON.parse(result.content[0].text).unreadable).toBeUndefined();
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
          req.url === '/sap/bc/adt/programs/programs/zprog' ||
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

    expect(result.isError).toBe(false);
    const [refused, ...rest] = JSON.parse(result.content[0].text).unreadable;
    expect(rest).toEqual([]);
    expect(refused.step).toBe('read class metadata');
    expect(refused.status).toBe(403);
    expect(refused.raw_body).toBe(DOCUMENT);
    expect(refused.message).toBe('Request failed with status code 403');
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
      req.url === '/sap/bc/adt/programs/includes/lsvimtop'
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
    expect(result.isError).toBe(false);
    expect(connection.calls.map((c) => c.url)).toEqual([
      '/sap/bc/adt/programs/includes/lsvimtop',
      `/sap/bc/adt/programs/includes/lsvimtop/source/main/enhancements/elements?context=${encodeURIComponent('/sap/bc/adt/programs/programs/saplsvim')}`,
    ]);
    expect(connection.calls[1]?.headers?.Accept).toBe(ELEMENTS_ACCEPT);
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
    expect(result.isError).toBe(true);
    // The method's error as adt-clients and the strategy made it: the
    // transport's sentence, SAP's document read into `messages`, the document
    // itself as `raw_body` — the handler adds only the step.
    expect(payloadOf(result)).toMatchObject({
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
    expect(result.isError).toBe(true);
    expect(payloadOf(result)).toMatchObject({
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
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('socket hang up');
    expect(result.content[0].text).not.toContain('"status"');
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
    const { parseEnhancementsFromXml } = jest.requireActual(
      '../../handlers/enhancement/readonly/handleGetEnhancements',
    );
    const xml =
      '<enh:enhancements xmlns:enh="http://www.sap.com/adt/abapsource/enhancements">' +
      impl('Z_FIRST', 'ENHANCEMENT 1 z_first.\nENDENHANCEMENT.') +
      impl(
        'FSH_DET_PROCESS',
        'ENHANCEMENT 1 fsh_det_process.\nENDENHANCEMENT.',
      ) +
      '</enh:enhancements>';

    const parsed = parseEnhancementsFromXml(xml);

    expect(parsed.map((e: { name: string }) => e.name)).toEqual([
      'Z_FIRST',
      'FSH_DET_PROCESS',
    ]);
    expect(parsed.map((e: { type: string }) => e.type)).toEqual([
      'ENHO/XHH',
      'ENHO/XHH',
    ]);
  });
});
