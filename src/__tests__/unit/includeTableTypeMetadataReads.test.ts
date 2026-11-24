/**
 * The include's and the table type's metadata reads are shared helpers
 * (`lib/strategies/metadataReads.ts`): each sends one GET to the object's URL
 * and answers the document as SAP sent it. The real client over a connection
 * double.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  IAbapConnection,
  IAbapRequestOptions,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { createAdtClient } from '../../lib/clients';
import {
  readIncludeMetadata,
  readTableTypeMetadata,
} from '../../lib/strategies/metadataReads';
import { corpusBody } from '../helpers/adtCorpus';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

type Sent = { method: string; url: string };

function systemAnswering(document: string) {
  const sent: Sent[] = [];
  const connection = {
    connect: async () => {},
    getBaseUrl: async () => 'http://sap.test',
    getSessionId: () => null,
    setSessionType: () => {},
    makeAdtRequest: async (request: IAbapRequestOptions) => {
      sent.push({ method: request.method, url: request.url });
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: document,
      };
    },
  };
  return {
    client: createAdtClient(connection as unknown as IAbapConnection),
    sent,
  };
}

/** The document an answer carries, as SAP sent it. */
function rawOf(
  response: Awaited<
    ReturnType<typeof readIncludeMetadata | typeof readTableTypeMetadata>
  >,
): string | undefined {
  return response.ok ? response.getResult().value.raw : undefined;
}

describe('the shared include and table-type metadata reads', () => {
  it('readIncludeMetadata sends one GET to the include, at the version given, and answers its document as sent', async () => {
    const document =
      '<?xml version="1.0"?><include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes"/>';
    const { client, sent } = systemAnswering(document);

    const response = await readIncludeMetadata(
      client,
      { includeName: 'ZINCL_X' },
      'active',
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.method, 'GET');
    assert.equal(
      sent[0]?.url,
      '/sap/bc/adt/programs/includes/zincl_x?version=active',
    );
    assert.equal(rawOf(response), document);
  });

  it('readTableTypeMetadata sends one GET to the table type, at the version given, and answers its document as sent', async () => {
    const document = corpusBody(
      'read-metadata-table-type--01-tabletypes-string_table',
    );
    const { client, sent } = systemAnswering(document);

    const response = await readTableTypeMetadata(
      client,
      { tableTypeName: 'ZTTYP_X' },
      'active',
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.method, 'GET');
    assert.equal(
      sent[0]?.url,
      '/sap/bc/adt/ddic/tabletypes/zttyp_x?version=active',
    );
    assert.equal(rawOf(response), document);
  });
});
