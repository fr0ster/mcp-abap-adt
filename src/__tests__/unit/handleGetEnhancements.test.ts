import { handleGetEnhancements } from '../../handlers/enhancement/readonly/handleGetEnhancements';

/**
 * GetEnhancements addresses the object it was told about.
 *
 * Measured on E19, 2026-09-25: for SAPLSLVC_FULLSCREEN with object_type
 * 'program' it ignored the type and probed class → program → include; a
 * function group's main program is none of those addressable things (all
 * three URIs answer 404), so the tool failed with "Failed to determine object
 * type … 404". The group's enhancements live at
 * /functions/groups/<fg>/source/main/enhancements/elements, which answers
 * 200. The probes also passed their Accept header as the request BODY.
 */

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
  });

  it('goes straight to a class when told it is one', async () => {
    const connection = connectionAnswering((u) =>
      u.startsWith('/sap/bc/adt/oo/classes/ZCL_X/source/main/enhancements'),
    );

    const result: any = await run(connection, {
      object_name: 'ZCL_X',
      object_type: 'class',
    });

    expect(result.isError).toBe(false);
    expect(connection.calls.map((c) => c.url)).toEqual([
      '/sap/bc/adt/oo/classes/ZCL_X/source/main/enhancements/elements',
    ]);
  });

  it('when it must probe, sends Accept as a header, never as the body', async () => {
    const connection = connectionAnswering(
      (u) =>
        u === '/sap/bc/adt/programs/programs/ZPROG' ||
        u.startsWith(
          '/sap/bc/adt/programs/programs/ZPROG/source/main/enhancements',
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
    expect(
      connection.calls.find(
        (c) => c.url === '/sap/bc/adt/programs/programs/ZPROG',
      )?.headers?.Accept,
    ).toBe('application/vnd.sap.adt.programs.v3+xml');
  });
});

/**
 * Each source is named by the enhancement implementation it sits in.
 *
 * The document nests `enh:source` inside `enh:sourceCodePlugin` inside
 * `enh:enhancementImplementations adtcore:name="…"` (E19, SAPMV45A,
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
