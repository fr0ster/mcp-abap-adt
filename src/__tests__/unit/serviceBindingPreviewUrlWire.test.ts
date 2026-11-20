/**
 * `GetServiceBindingPreviewUrl`'s service-URL lookup on the wire (#235): the
 * real client over a connection double, so what is asserted is the request
 * adt-clients' `getServiceBinding().getServiceGroup()` sends — the
 * protocol's service group with `servicename` and `serviceversion`, and the
 * protocol's `Accept` — and how its answers are read: the URL the system names
 * wins, a `401` ends the call with the lookup's error and step, any other
 * refusal leaves the composed URL. `serviceBindingPreviewUrl.test.ts` covers
 * the composition with a client double.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleGetServiceBindingPreviewUrl } from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
import { assertMatchObject } from '../helpers/assertions';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const BINDING = `<?xml version="1.0" encoding="utf-8"?>
<srvb:serviceBinding srvb:published="true" srvb:bindingCreated="true"
  adtcore:name="ZSB_STUDENT_V2" adtcore:type="SRVB/SVB"
  xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings"
  xmlns:adtcore="http://www.sap.com/adt/core">
  <srvb:services srvb:name="ZSB_STUDENT_V2">
    <srvb:content srvb:version="0001">
      <srvb:serviceDefinition adtcore:type="SRVD/SRV" adtcore:name="ZUI_STUDENT"/>
    </srvb:content>
  </srvb:services>
  <srvb:bindingTypeData>
    <srvb:binding srvb:type="ODATA" srvb:version="V2" srvb:category="0"/>
  </srvb:bindingTypeData>
</srvb:serviceBinding>`;

const DEFINITION = `define service ZUI_STUDENT {
  expose ZC_Student        as student_data;
  expose ZC_StudentAddress as student_address;
}`;

const ROOT_VIEW = `define root view entity ZC_Student
  composition [0..*] of ZC_StudentAddress as to_ADDRESS
  { key id; to_ADDRESS; }`;

const SERVICE_LIST = `<?xml version="1.0" encoding="utf-8"?>
<odatav2:serviceList xmlns:odatav2="http://www.sap.com/categories/odatav2">
  <odatav2:services odatav2:serviceId="ZSB_STUDENT_V2" odatav2:serviceVersion="0001"
    odatav2:serviceUrl="/sap/opu/odata/sap/ELSEWHERE/" odatav2:annotationUrl="/sap/opu/odata/annotations/X/"
    odatav2:published="true"/>
</odatav2:serviceList>`;

const SERVICE_GROUP =
  '/sap/bc/adt/businessservices/odatav2/ZSB_STUDENT_V2?servicename=ZSB_STUDENT_V2&serviceversion=0001';

type Sent = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  params?: unknown;
};

const failedWith = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, statusText: 'Refused', headers: {}, data: '' },
  });

/**
 * Answers each read by its path, as a system would: the binding, the service
 * definition and the root view; `systeminformation` absent (`404`); the
 * service group as `serviceGroup` says.
 */
function systemAnswering(serviceGroup: () => Promise<string>) {
  const sent: Sent[] = [];
  const connection = {
    getBaseUrl: async () => 'https://system.example.test:44300/',
    getSessionId: () => null,
    makeAdtRequest: mock.fn(async (request: Sent) => {
      sent.push(request);
      const ok = (data: string) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        data,
      });
      const { url } = request;
      if (url.includes('/core/http/systeminformation')) throw failedWith(404);
      if (url.includes('/businessservices/bindings/')) return ok(BINDING);
      if (url.includes('/ddic/srvd/sources/')) return ok(DEFINITION);
      if (url.includes('/ddic/ddl/sources/')) return ok(ROOT_VIEW);
      if (url.includes('/businessservices/odatav2/'))
        return ok(await serviceGroup());
      throw failedWith(404);
    }),
  } as unknown as IAbapConnection;
  return { connection, sent };
}

const run = async (connection: IAbapConnection) =>
  (await handleGetServiceBindingPreviewUrl(
    { connection, logger: undefined } as never,
    { service_binding_name: 'zsb_student_v2' } as never,
  )) as { isError?: boolean; content: { text: string }[] };

const lookupOf = (sent: Sent[]) =>
  sent.filter((r) => r.url.includes('/businessservices/odatav2/'));

describe('GetServiceBindingPreviewUrl: the service-URL lookup on the wire', () => {
  it('sends the service group with its query and the protocol Accept, and takes the URL the system names', async () => {
    const { connection, sent } = systemAnswering(async () => SERVICE_LIST);

    const answered = await run(connection);

    const lookups = lookupOf(sent);
    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].method, 'GET');
    assert.equal(lookups[0].url, SERVICE_GROUP);
    assert.equal(lookups[0].params, undefined);
    assert.equal(
      lookups[0].headers?.Accept,
      'application/vnd.sap.adt.businessservices.odatav2.v1+xml, application/vnd.sap.adt.businessservices.odatav2.v2+xml',
    );

    assert.equal(answered.isError, false);
    const payload = JSON.parse(answered.content[0].text);
    assert.equal(payload.service_url_source, 'system');
    assert.equal(
      payload.service_url,
      'https://system.example.test:44300/sap/opu/odata/sap/ELSEWHERE/',
    );
  });

  it('an empty service list leaves the composed URL', async () => {
    const { connection } = systemAnswering(async () => '');
    const payload = JSON.parse((await run(connection)).content[0].text);
    assert.equal(payload.service_url_source, 'composed');
  });

  it("a 401 SAP answered ends the call with the lookup's error and step", async () => {
    const { connection } = systemAnswering(async () => {
      throw failedWith(401);
    });

    const answered = await run(connection);

    assert.equal(answered.isError, true);
    assertMatchObject(JSON.parse(answered.content[0].text), {
      status: 401,
      step: 'read service URL',
      request: { method: 'GET', url: SERVICE_GROUP },
    });
  });

  it('any other refusal leaves the composed URL', async () => {
    const { connection } = systemAnswering(async () => {
      throw failedWith(403);
    });

    const answered = await run(connection);

    assert.equal(answered.isError, false);
    assert.equal(
      JSON.parse(answered.content[0].text).service_url_source,
      'composed',
    );
  });
});
