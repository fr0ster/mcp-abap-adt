/**
 * `enhancementTypeOf` reads an enhancement's subtype off the repository search,
 * through adt-clients' `getUtils().search` (#235): the real client over a
 * connection double, so the request on the wire is what is asserted — the
 * same quickSearch the handler used to build itself — and the answer is read
 * off the search document as before.
 */
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { enhancementTypeOf } from '../../handlers/enhancement/readonly/enhancementAvailability';

const HITS = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/enhancements/enhoxhh/zother" adtcore:type="ENHO/XHH" adtcore:name="ZOTHER"/>
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/enhancements/enhoxhb/zenh_impl" adtcore:type="ENHO/XHB" adtcore:name="ZENH_IMPL"/>
</adtcore:objectReferences>`;

type Sent = { url?: string; method?: string; headers?: Record<string, string> };

function connectionAnswering(answer: () => Promise<unknown>) {
  const sent: Sent[] = [];
  const connection = {
    makeAdtRequest: jest.fn(async (request: Sent) => {
      sent.push(request);
      return answer();
    }),
  } as unknown as IAbapConnection;
  return { connection, sent };
}

const ok = (data: string) => async () => ({
  status: 200,
  statusText: 'OK',
  headers: {},
  data,
});

describe('enhancementTypeOf', () => {
  it('sends the quickSearch through the client and reads the named hit', async () => {
    const { connection, sent } = connectionAnswering(ok(HITS));

    await expect(
      enhancementTypeOf(connection, 'zenh_impl', 'ENHO/XHH'),
    ).resolves.toBe('ENHO/XHB');

    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('GET');
    expect(sent[0].url).toBe(
      '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=zenh_impl&maxResults=20&objectType=ENHO%2FXHH',
    );
    expect(sent[0].headers?.Accept).toBe('application/xml');
  });

  it('answers undefined when no hit carries the name', async () => {
    const { connection } = connectionAnswering(ok(HITS));
    await expect(
      enhancementTypeOf(connection, 'ZNOT_THERE', 'ENHO/XHH'),
    ).resolves.toBeUndefined();
  });

  it('answers undefined when SAP refuses the search', async () => {
    const { connection } = connectionAnswering(async () => {
      throw Object.assign(new Error('Request failed with status code 500'), {
        isAxiosError: true,
        response: { status: 500, statusText: 'Error', headers: {}, data: '' },
      });
    });
    await expect(
      enhancementTypeOf(connection, 'ZENH_IMPL', 'ENHS/XSB'),
    ).resolves.toBeUndefined();
  });

  it("rethrows the connection's credential refusal as it came", async () => {
    // As the connection raises it: SAP was never asked.
    const refused = new AuthRefusedError(
      authError.connection({ problem: 'refused-after-renewal', at: 'request' }),
      'request',
    );
    const { connection } = connectionAnswering(async () => {
      throw refused;
    });
    await expect(
      enhancementTypeOf(connection, 'ZENH_IMPL', 'ENHO/XHH'),
    ).rejects.toBe(refused);
  });
});
