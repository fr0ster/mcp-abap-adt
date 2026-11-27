/**
 * `enhancementTypeOf` reads an enhancement's subtype off the repository search,
 * through adt-clients' `getUtils().search` (#235): the real client over a
 * connection double, so the request on the wire is what is asserted — the
 * same quickSearch the handler used to build itself — and the answer is read
 * off the search document as before.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { enhancementTypeOf } from '../../handlers/enhancement/readonly/enhancementAvailability';
import { rejectionOf } from '../helpers/assertions';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const HITS = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/enhancements/enhoxhh/zother" adtcore:type="ENHO/XHH" adtcore:name="ZOTHER"/>
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/enhancements/enhoxhb/zenh_impl" adtcore:type="ENHO/XHB" adtcore:name="ZENH_IMPL"/>
</adtcore:objectReferences>`;

type Sent = { url?: string; method?: string; headers?: Record<string, string> };

function connectionAnswering(answer: () => Promise<unknown>) {
  const sent: Sent[] = [];
  const connection = {
    makeAdtRequest: mock.fn(async (request: Sent) => {
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

    assert.equal(
      await enhancementTypeOf(connection, 'zenh_impl', 'ENHO/XHH'),
      'ENHO/XHB',
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'GET');
    // No bound of the server's (#391): the search is handed no maxResults.
    // adt-clients before 48.0.1 adds its own 100; 48.0.1 adds none.
    assert.equal(
      (sent[0]?.url ?? '').replace('&maxResults=100', ''),
      '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=zenh_impl&objectType=ENHO',
    );
    assert.equal(sent[0].headers?.Accept, 'application/xml');
  });

  it('answers undefined when no hit carries the name', async () => {
    const { connection } = connectionAnswering(ok(HITS));
    assert.equal(
      await enhancementTypeOf(connection, 'ZNOT_THERE', 'ENHO/XHH'),
      undefined,
    );
  });

  // The search answer is read with adt-strategies' `readSearchHits`, through
  // the XML parser: attributes in any quoting and order.
  it('reads a hit whose attributes are quoted with apostrophes, its name last', async () => {
    const { connection } = connectionAnswering(
      ok(
        "<adtcore:objectReferences xmlns:adtcore='http://www.sap.com/adt/core'><adtcore:objectReference adtcore:type='ENHS/XSB' adtcore:uri='/sap/bc/adt/enhancements/enhsxsb/zspot' adtcore:name='ZSPOT'/></adtcore:objectReferences>",
      ),
    );
    assert.equal(
      await enhancementTypeOf(connection, 'zspot', 'ENHS/XSB'),
      'ENHS/XSB',
    );
  });

  it('answers undefined when SAP refuses the search', async () => {
    const { connection } = connectionAnswering(async () => {
      throw Object.assign(new Error('Request failed with status code 500'), {
        isAxiosError: true,
        response: { status: 500, statusText: 'Error', headers: {}, data: '' },
      });
    });
    assert.equal(
      await enhancementTypeOf(connection, 'ZENH_IMPL', 'ENHS/XSB'),
      undefined,
    );
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
    assert.equal(
      await rejectionOf(enhancementTypeOf(connection, 'ZENH_IMPL', 'ENHO/XHH')),
      refused,
    );
  });
});
