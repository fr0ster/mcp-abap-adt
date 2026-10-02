import { handleGetEnhancementImpl } from '../../handlers/enhancement/readonly/handleGetEnhancementImpl';
import { handleGetEnhancementSpot } from '../../handlers/enhancement/readonly/handleGetEnhancementSpot';

/**
 * The enhancement readers against the answers a system gives — what they read
 * today must keep working, and what ADT does not expose must say so.
 *
 * Measured on premise (BASIS 816) and on an ABAP Cloud trial, 2026-10-02:
 * - a BAdI enhancement spot (`ENHS/XSB`) reads at `enhsxsb/{spot}` on both;
 * - a source code plugin (`ENHO/XHH`) reads at `enhoxhh/{name}/source/main`;
 * - a plain enhancement spot (`ENHS/XS`) and a class enhancement (`ENHO/XH`)
 *   answer `500 I::000` / `500`, and Eclipse ADT opens both in SAP GUI — not
 *   available through ADT.
 */

type Call = { url: string; method?: string };

/** Answers by URL; anything unlisted is a 404. */
function connectionAnswering(
  answers: Array<[RegExp, { status: number; data: string }]>,
) {
  const calls: Call[] = [];
  return {
    calls,
    async makeAdtRequest(req: Call) {
      calls.push(req);
      for (const [pattern, answer] of answers) {
        if (!pattern.test(req.url)) continue;
        if (answer.status >= 400) {
          const error: any = new Error(
            `Request failed with status code ${answer.status}`,
          );
          error.response = { status: answer.status, data: answer.data };
          throw error;
        }
        return { status: answer.status, data: answer.data, headers: {} };
      }
      const error: any = new Error('Request failed with status code 404');
      error.response = { status: 404, data: '' };
      throw error;
    },
  };
}

const ctx = (connection: unknown) => ({ connection, logger: undefined }) as any;
const json = (r: any) => r.content?.[0]?.json;
const text = (r: any) => String(r.content?.[0]?.text ?? '');

/** The shape `enhsxsb/{spot}` answers — a standard BAdI spot, cut down. */
const BADI_SPOT_XML =
  '<?xml version="1.0" encoding="UTF-8"?><enhs:objectData xmlns:enhs="http://www.sap.com/adt/enhancements/enhs" ' +
  'adtcore:name="SADT_REST_RFC_APPLICATION" adtcore:type="ENHS/XSB" adtcore:description="REST application class registration" ' +
  'adtcore:version="active" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/sadt_rest" adtcore:type="DEVC/K" adtcore:name="SADT_REST"/>' +
  '<enhs:contentSpecific><enhs:badiTechnology><enhs:badiDefinitions>' +
  '<enhs:badiDefinition enhs:name="BADI_ADT_REST_RFC_APPLICATION" enhs:shorttext="REST application class registration">' +
  '<enhs:interface adtcore:uri="/sap/bc/adt/oo/interfaces/if_adt_rest_rfc_application" adtcore:type="INTF/OI" adtcore:name="IF_ADT_REST_RFC_APPLICATION"/>' +
  '</enhs:badiDefinition></enhs:badiDefinitions></enhs:badiTechnology></enhs:contentSpecific></enhs:objectData>';

/** `500 I::000`, what both systems answer for a spot ADT does not serve. */
const I000 =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="BAdI Enhancement Spot"/><message lang="EN">I::000</message></exc:exception>';

/** quickSearch's answer naming one object and its subtype. */
const searchHit = (name: string, type: string) =>
  `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">` +
  `<adtcore:objectReference adtcore:uri="/sap/bc/adt/enhancements/x/${name.toLowerCase()}" adtcore:type="${type}" ` +
  `adtcore:name="${name}" adtcore:packageName="TEST_PKG"/></adtcore:objectReferences>`;

describe('GetEnhancementSpot', () => {
  it('reads a BAdI enhancement spot, in one request', async () => {
    const connection = connectionAnswering([
      [/\/enhancements\/enhsxsb\//, { status: 200, data: BADI_SPOT_XML }],
    ]);
    const r: any = await handleGetEnhancementSpot(ctx(connection), {
      enhancement_spot: 'SADT_REST_RFC_APPLICATION',
    });
    expect(r.isError).toBe(false);
    expect(json(r).metadata.name).toBe('SADT_REST_RFC_APPLICATION');
    expect(json(r).metadata.type).toBe('ENHS/XSB');
    expect(connection.calls).toHaveLength(1);
  });

  it('says a plain enhancement spot is not available through ADT', async () => {
    const connection = connectionAnswering([
      [/\/enhancements\/enhsxsb\//, { status: 500, data: I000 }],
      [
        /informationsystem\/search/,
        { status: 200, data: searchHit('ZSPOT_PLAIN', 'ENHS/XS') },
      ],
    ]);
    const r: any = await handleGetEnhancementSpot(ctx(connection), {
      enhancement_spot: 'ZSPOT_PLAIN',
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not available through ADT/);
    expect(text(r)).toMatch(/SAP GUI/);
    expect(text(r)).toMatch(/ENHS\/XS/);
  });

  it('passes any other failure through as it was', async () => {
    const connection = connectionAnswering([
      [/\/enhancements\/enhsxsb\//, { status: 500, data: I000 }],
      [
        /informationsystem\/search/,
        { status: 200, data: searchHit('ZSPOT_B', 'ENHS/XSB') },
      ],
    ]);
    const r: any = await handleGetEnhancementSpot(ctx(connection), {
      enhancement_spot: 'ZSPOT_B',
    });
    expect(r.isError).toBe(true);
    expect(text(r)).not.toMatch(/not available through ADT/);
  });
});

describe('GetEnhancementImpl', () => {
  it('reads a source code plugin from enhoxhh, in one request', async () => {
    const source =
      "ENHANCEMENT 1  .\r\nDATA: lv_test TYPE c LENGTH 10 VALUE '0123456789'.\r\nENDENHANCEMENT.";
    const connection = connectionAnswering([
      [
        /\/enhancements\/enhoxhh\/[^/]+\/source\/main/,
        { status: 200, data: source },
      ],
    ]);
    const r: any = await handleGetEnhancementImpl(ctx(connection), {
      enhancement_spot: 'enhoxhh',
      enhancement_name: 'ZPLUGIN',
    });
    expect(r.isError).toBe(false);
    expect(json(r).source_code).toBe(source);
    expect(connection.calls).toHaveLength(1);
  });

  it.each([
    ['enhoxh', 'class enhancement'],
    ['ENHOXHB', 'BAdI implementation'],
  ])(
    'refuses %s before any request — it has no source through ADT',
    async (collection, label) => {
      const connection = connectionAnswering([]);
      const r: any = await handleGetEnhancementImpl(ctx(connection), {
        enhancement_spot: collection,
        enhancement_name: 'ZANY',
      });
      expect(r.isError).toBe(true);
      expect(text(r)).toMatch(new RegExp(label));
      expect(connection.calls).toHaveLength(0);
    },
  );

  it('says a class enhancement is not available through ADT when the name says so', async () => {
    const connection = connectionAnswering([
      [
        /informationsystem\/search/,
        { status: 200, data: searchHit('ZCLASS_ENH', 'ENHO/XH') },
      ],
    ]);
    const r: any = await handleGetEnhancementImpl(ctx(connection), {
      enhancement_spot: 'ZSOME_SPOT',
      enhancement_name: 'ZCLASS_ENH',
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not available through ADT/);
    expect(text(r)).toMatch(/ENHO\/XH/);
  });

  it('points a source code plugin asked under a spot name at enhoxhh', async () => {
    const connection = connectionAnswering([
      [
        /informationsystem\/search/,
        { status: 200, data: searchHit('ZPLUGIN', 'ENHO/XHH') },
      ],
    ]);
    const r: any = await handleGetEnhancementImpl(ctx(connection), {
      enhancement_spot: 'ZSOME_SPOT',
      enhancement_name: 'ZPLUGIN',
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/enhoxhh/);
  });

  it('keeps the failure of a source code plugin already asked under enhoxhh', async () => {
    const connection = connectionAnswering([
      [/\/enhancements\/enhoxhh\//, { status: 403, data: '' }],
      [
        /informationsystem\/search/,
        { status: 200, data: searchHit('ZPLUGIN', 'ENHO/XHH') },
      ],
    ]);
    const r: any = await handleGetEnhancementImpl(ctx(connection), {
      enhancement_spot: 'enhoxhh',
      enhancement_name: 'ZPLUGIN',
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/403/);
    expect(text(r)).not.toMatch(/read it with enhancement_spot/);
  });
});
