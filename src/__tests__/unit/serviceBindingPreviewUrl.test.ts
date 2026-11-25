/**
 * `GetServiceBindingPreviewUrl` assembles what no single document carries.
 *
 * The three reads are here as the systems answered them: a binding document from a
 * trial, a service definition source from the same trial, and a root view shaped like
 * the on-premise one whose preview URL is the fixture in `feapDescriptor.test.ts`. The
 * point of the tool is that the preview URL exists in none of them — it is composed —
 * so the test asserts the composition, and asserts that a missing piece produces NO
 * url rather than a plausible one.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { mockModuleExports } from '../helpers/moduleMock';

// The client and the language come from ADT's own `systeminformation`, so the
// tool is tested against what that endpoint answers — including its refusals,
// which must not fail a read that worked. adt-clients is replaced for this
// file before the handler loads (node:test mock.module,
// helpers/moduleMock.ts; its other exports stay the real ones). No case
// queues a one-off answer, so resetting its calls and implementation before
// each case is all a reset needs here.
const systemInfo = mock.fn<(...args: any[]) => any>(
  function getSystemInformation() {},
);
mockModuleExports(require.resolve('@mcp-abap-adt/adt-clients'), {
  getSystemInformation: systemInfo,
});

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { AuthProviderFailure, authError } from '@mcp-abap-adt/auth-errors';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  handleGetServiceBindingPreviewUrl,
  NO_ORIGIN_NOTE,
  TOOL_DEFINITION,
} from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
import * as clients from '../../lib/clients';
import { assertMatchObject } from '../helpers/assertions';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

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

/** Answers each read by what the config names, the way the real client would. */
const clientFor = (parts: {
  binding?: string;
  definition?: string;
  view?: string;
  /** What `getServiceGroup` answers; by default the empty list a trial sends. */
  serviceGroup?: (...args: unknown[]) => Promise<unknown>;
}) =>
  fakeClientOf({
    getServiceGroup:
      parts.serviceGroup ?? (async () => okResponse(reading(''))),
    read: async (...args: unknown[]) => {
      const config = (args[0] ?? {}) as Record<string, string>;
      if (config.bindingName !== undefined)
        return okResponse(reading(parts.binding ?? '')) as IAdtResponse<
          unknown,
          IAdtError
        >;
      if (config.serviceDefinitionName !== undefined)
        return okResponse(reading(parts.definition ?? ''));
      if (config.ddlName !== undefined)
        return okResponse(reading(parts.view ?? ''));
      return okResponse(reading(''));
    },
  });

let fakeClient: unknown;
// lib/clients' createAdtClient replaced on its own module (the handler reads
// it at call time); the module's other names stay real.
mock.method(clients, 'createAdtClient', () => fakeClient);

const context = {
  connection: {
    getBaseUrl: async () => 'https://epbyminsd0654.epam.com:44300/',
    getSessionId: () => null,
  } as never,
  logger: undefined,
};

const payloadOf = async (args: Record<string, unknown>) => {
  const answered = await handleGetServiceBindingPreviewUrl(
    context as never,
    args as never,
  );
  return JSON.parse(
    (answered as { content: { text: string }[] }).content[0].text,
  );
};

describe('GetServiceBindingPreviewUrl', () => {
  beforeEach(() => {
    systemInfo.mock.resetCalls();
    // adt-clients 37: a `404` is `ok` and `{ present: false }`.
    systemInfo.mock.mockImplementation(async () =>
      okResponse({ present: false }),
    );
  });

  it('composes the preview URL from the binding, the definition and the view', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({
      service_binding_name: 'zsb_student_v2',
      client: '100',
    });

    assert.equal(payload.protocol, 'odatav2');
    assert.equal(payload.service, 'ZSB_STUDENT_V2');
    assert.equal(payload.service_definition, 'ZUI_STUDENT');
    assert.deepStrictEqual(payload.entity_sets, [
      'student_data',
      'student_address',
    ]);
    assert.deepStrictEqual(payload.associations, ['to_ADDRESS']);
    assert.equal(
      payload.preview_descriptor,
      'ZSB_STUDENT_V2##student_data##to_ADDRESS##student_address##ZSB_STUDENT_V2_VAN##0001',
    );
    // The very URL Eclipse produced for this binding, host and client.
    assert.equal(
      payload.preview_url,
      'https://epbyminsd0654.epam.com:44300/sap/bc/adt/businessservices/odatav2/feap/' +
        'ngVsghiXYbhsjF77%C2%87%C2%88%C2%89xy%C2%82%C2%88sxu%C2%88u77%C2%88%C2%83sUXXfYgg77' +
        '%C2%87%C2%88%C2%89xy%C2%82%C2%88suxx%C2%86y%C2%87%C2%8777ngVsghiXYbhsjFsjUb77DDDE' +
        '/flp.html?sap-ui-xx-viewCache=false&sap-ui-language=EN&sap-client=100',
    );
    assert.equal(
      payload.service_url,
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata/sap/ZSB_STUDENT_V2/',
    );
    assert.equal(payload.metadata_url, `${payload.service_url}$metadata`);
    assert.equal(payload.missing, undefined);
  });

  it('still answers a URL when no association is found, because the segment is not read', async () => {
    // A view with no association. The FEAP endpoint derives the navigation from
    // the service's metadata and ignores the descriptor's segment — measured
    // against its own `manifest.json` — so withholding the URL here withheld one
    // that works. The segment goes out empty.
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: 'define view entity ZC_Student { key id; }',
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.missing, undefined);
    assert.deepStrictEqual(payload.associations, []);
    assert.equal(
      payload.preview_descriptor,
      'ZSB_STUDENT_V2##student_data####student_address##ZSB_STUDENT_V2_VAN##0001',
    );
    assert.ok(payload.preview_url.includes('/businessservices/odatav2/feap/'));
    assert.ok(
      payload.service_url.includes('/sap/opu/odata/sap/ZSB_STUDENT_V2/'),
    );
  });

  it('answers no preview URL when the entity set cannot be found', async () => {
    // The one segment the server DOES read. A definition that exposes nothing
    // leaves nothing to open, and a guessed entity set answers a broken app:
    // measured, a bogus one yields `ListReport|<bogus>` with no page under it.
    fakeClient = clientFor({
      binding: BINDING,
      definition: 'define service ZUI_STUDENT { }',
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.preview_url, undefined);
    assert.deepStrictEqual(payload.missing, ['entity_set']);
    assert.ok(
      payload.service_url.includes('/sap/opu/odata/sap/ZSB_STUDENT_V2/'),
    );
  });

  it('says when the binding is not published, because then nothing answers', async () => {
    fakeClient = clientFor({
      binding: BINDING.replace(
        'srvb:published="true"',
        'srvb:published="false"',
      ),
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.published, false);
    assert.match(payload.note, /not published/);
  });

  it('takes the caller over the defaults', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({
      service_binding_name: 'ZSB_STUDENT_V2',
      entity_set: 'student_address',
      navigation: 'to_STUDENT',
      target_entity_set: 'student_data',
      language: 'DE',
    });

    assert.equal(
      payload.preview_descriptor,
      'ZSB_STUDENT_V2##student_address##to_STUDENT##student_data##ZSB_STUDENT_V2_VAN##0001',
    );
    assert.ok(payload.preview_url.includes('sap-ui-language=DE'));
    // A named navigation means the view is not read at all.
    assert.deepStrictEqual(payload.associations, []);
  });

  it('builds the V4 root when the binding is V4', async () => {
    fakeClient = clientFor({
      binding: BINDING.replace('srvb:version="V2"', 'srvb:version="V4"'),
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.protocol, 'odatav4');
    // Binding first, then the SERVICE — `ZSB_STUDENT_V2` in both positions here,
    // not the service definition `ZUI_STUDENT`. This fixture is the discriminating
    // case: the two names differ, and a URL Eclipse produced for a binding whose
    // names also differ carries the service. Where they coincide, as on a
    // SAP-delivered binding, the wrong reading answers 200 and hides itself.
    assert.equal(
      payload.service_url,
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata4/sap/zsb_student_v2' +
        '/srvd/sap/zsb_student_v2/0001/',
    );
    // V4 answers a preview too, from a different descriptor: the service's URL
    // path first, the binding last. Decoded from two URLs Eclipse produced; the
    // byte-exact fixtures live in feapDescriptor.test.ts.
    assert.equal(
      payload.preview_descriptor,
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata4/sap/zsb_student_v2/srvd/sap/zsb_student_v2/0001/'.replace(
        'https://epbyminsd0654.epam.com:44300',
        '',
      ) +
        '##student_data##to_ADDRESS##student_address##ZSB_STUDENT_V2##0001##ZSB_STUDENT_V2',
    );
    assert.ok(payload.preview_url.includes('/businessservices/odatav4/feap/'));
  });

  it('answers no preview for a Web API binding, because it has none', async () => {
    // `srvb:category="1"` is the Web API variant. There is no Fiori preview page
    // for it at all, so the entity set and the navigation are not missing —
    // they are not part of the answer, and the service URLs are.
    fakeClient = clientFor({
      binding: BINDING.replace('srvb:category="0"', 'srvb:category="1"'),
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.binding_category, 'web_api');
    assert.equal(payload.preview_url, undefined);
    assert.equal(payload.preview_descriptor, undefined);
    assert.equal(payload.missing, undefined);
    assert.match(payload.note, /Web API binding, which has no Fiori preview/);
    // What such a binding IS addressed by:
    assert.equal(
      payload.service_url,
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata/sap/ZSB_STUDENT_V2/',
    );
    assert.equal(payload.metadata_url, `${payload.service_url}$metadata`);
  });

  it('reads the UI variant as the one a preview belongs to', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.binding_category, 'ui');
    assert.ok(payload.preview_url.includes('/feap/'));
  });

  it('takes the client and the language from the system when none were given', async () => {
    // What a caller cannot know and does not have to: the same record this
    // server already reads to resolve a request's system.
    systemInfo.mock.mockImplementation(async () =>
      okResponse({ present: true, info: { client: '100', language: 'EN' } }),
    );
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.client, '100');
    assert.equal(payload.language, 'EN');
    assert.ok(payload.preview_url.includes('sap-client=100'));
    assert.equal(payload.note, undefined);
  });

  it('leaves the parameter out when the caller passes an empty client', async () => {
    systemInfo.mock.mockImplementation(async () =>
      okResponse({ present: true, info: { client: '100', language: 'EN' } }),
    );
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({
      service_binding_name: 'ZSB_STUDENT_V2',
      client: '',
    });

    assert.ok(!payload.preview_url.includes('sap-client'));
    // And an explicit empty string is not overridden by the system's answer.
    assert.equal(payload.client, '');
  });

  it('does not ask the system when the caller gave both', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    await payloadOf({
      service_binding_name: 'ZSB_STUDENT_V2',
      client: '200',
      language: 'DE',
    });

    assert.equal(systemInfo.mock.callCount(), 0);
  });

  /** A failed lookup as adt-clients 37 answers it: `ok: false`, the response and the request. */
  const lookupFailed = (status: number, data: string) => ({
    ok: false,
    getResult: () => {
      throw new Error('asked for the result of a failure');
    },
    getError: () => ({
      message: `Request failed with status code ${status}`,
      origin: 'connection',
      response: { status, data },
      request: {
        method: 'GET',
        url: '/sap/bc/adt/core/http/systeminformation',
      },
    }),
  });

  it('still answers the URL when the system record cannot be read, and says so', async () => {
    // Any status but a `404` is `ok: false` (adt-clients 37). It is not this
    // tool's failure: beside the URL, the lookup's failure is the error as
    // SAP answered it, with its step — not its message folded into a sentence.
    systemInfo.mock.mockImplementation(async () =>
      lookupFailed(403, 'Forbidden body'),
    );
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.success, true);
    assert.ok(payload.preview_url.includes('/feap/'));
    assert.ok(!payload.preview_url.includes('sap-client'));
    assert.deepStrictEqual(payload.system_information_failure, {
      message: 'Request failed with status code 403',
      origin: 'connection',
      status: 403,
      request: {
        method: 'GET',
        url: '/sap/bc/adt/core/http/systeminformation',
      },
      raw_body: 'Forbidden body',
      step: 'read system information',
    });
    assert.ok(payload.note.includes('could not be read'));
    assert.ok(!payload.note.includes('status code 403'));
  });

  it('a 404 is the endpoint absent: the URL without a client, and no failure beside it', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.success, true);
    assert.ok(!payload.preview_url.includes('sap-client'));
    assert.equal(payload.system_information_failure, undefined);
  });

  it('a 405 is a failed lookup, reported beside the URL (only a 404 is absent)', async () => {
    systemInfo.mock.mockImplementation(async () => lookupFailed(405, ''));
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.success, true);
    assertMatchObject(payload.system_information_failure, {
      status: 405,
      step: 'read system information',
    });
  });

  it('a 401 answered as a failed lookup ends the call with it; the binding is not read', async () => {
    systemInfo.mock.mockImplementation(async () => lookupFailed(401, ''));
    const reads: unknown[] = [];
    fakeClient = fakeClientOf({
      read: async (...args: unknown[]) => {
        reads.push(args);
        return okResponse(reading(BINDING));
      },
    });

    const answered: any = await handleGetServiceBindingPreviewUrl(
      context as never,
      { service_binding_name: 'ZSB_STUDENT_V2' } as never,
    );

    assert.equal(answered.isError, true);
    assertMatchObject(JSON.parse(answered.content[0].text), {
      status: 401,
      step: 'read system information',
    });
    assert.deepStrictEqual(reads, []);
  });

  it('a 401 thrown by the lookup ends the call with it; the binding is not read', async () => {
    systemInfo.mock.mockImplementation(async () => {
      throw Object.assign(new Error('Request failed with status code 401'), {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          data: '',
        },
      });
    });
    const reads: unknown[] = [];
    fakeClient = fakeClientOf({
      read: async (...args: unknown[]) => {
        reads.push(args);
        return okResponse(reading(BINDING));
      },
    });

    const answered: any = await handleGetServiceBindingPreviewUrl(
      context as never,
      { service_binding_name: 'ZSB_STUDENT_V2' } as never,
    );

    assert.equal(answered.isError, true);
    assertMatchObject(JSON.parse(answered.content[0].text), {
      status: 401,
      step: 'read system information',
    });
    assert.deepStrictEqual(reads, []);
  });

  it('prefers the URL the system names over the one a rule composes', async () => {
    // The Service Binding editor reads this resource for its own "Service URL"
    // field, so when it answers, its answer wins: it knows about prefixes and
    // rewrites a naming rule cannot. Measured on a trial it comes back empty, and
    // then the composed URL stays — which every other test here exercises.
    const asked: unknown[][] = [];
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
      serviceGroup: async (...args: unknown[]) => {
        asked.push(args);
        return okResponse(
          reading(`<?xml version="1.0" encoding="utf-8"?>
<odatav2:serviceList xmlns:odatav2="http://www.sap.com/categories/odatav2">
  <odatav2:services odatav2:serviceId="ZSB_STUDENT_V2" odatav2:serviceVersion="0001"
    odatav2:serviceUrl="/sap/opu/odata/sap/ELSEWHERE/" odatav2:annotationUrl="/sap/opu/odata/annotations/X/"
    odatav2:published="true"/>
</odatav2:serviceList>`),
        );
      },
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    // adt-clients' getServiceGroup, not a URL built here (#235).
    assert.deepStrictEqual(asked, [
      [
        {
          objectname: 'ZSB_STUDENT_V2',
          serviceType: 'odatav2',
          servicename: 'ZSB_STUDENT_V2',
          serviceversion: '0001',
        },
        { analyse: analyseException },
      ],
    ]);
    assert.equal(payload.service_url_source, 'system');
    assert.equal(
      payload.service_url,
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata/sap/ELSEWHERE/',
    );
    assert.equal(payload.metadata_url, `${payload.service_url}$metadata`);
    assert.equal(payload.annotation_url, '/sap/opu/odata/annotations/X/');
  });

  describe('the service URL lookup: a credential failure ends the call as it came', () => {
    const run = (serviceGroup: () => Promise<unknown>) => {
      fakeClient = clientFor({
        binding: BINDING,
        definition: DEFINITION,
        view: ROOT_VIEW,
        serviceGroup,
      });
      return handleGetServiceBindingPreviewUrl(
        {
          connection: {
            getBaseUrl: async () => 'https://example.invalid/',
            getSessionId: () => null,
          } as never,
          logger: undefined,
        } as never,
        { service_binding_name: 'ZSB_STUDENT_V2' } as never,
      ) as Promise<any>;
    };
    const sent = {
      method: 'GET',
      url: '/sap/bc/adt/businessservices/odatav2/ZSB_STUDENT_V2?servicename=ZSB_STUDENT_V2&serviceversion=0001',
    };

    it("a 401 SAP answered: the lookup's error as it is, with its step, not the composed URL", async () => {
      const answered = await run(async () =>
        refusedResponse('Request failed with status code 401', {
          response: { status: 401, data: '' },
          request: sent,
        } as never),
      );
      assert.equal(answered.isError, true);
      assertMatchObject(JSON.parse(answered.content[0].text), {
        status: 401,
        step: 'read service URL',
        request: sent,
      });
    });

    it('a thrown credential refusal: the chain answer', async () => {
      const answered = await run(async () => {
        throw new AuthProviderFailure(
          authError['credential-refused']({ credential: 'token' }),
        );
      });
      assert.equal(answered.isError, true);
      assert.equal(
        JSON.parse(answered.content[0].text).error,
        'authentication_failed',
      );
    });

    it('any other refusal stays best effort: the composed URL answers', async () => {
      const answered = await run(async () =>
        refusedResponse('Request failed with status code 403', {
          response: { status: 403, data: '' },
        } as never),
      );
      assert.equal(answered.isError, false);
      assert.equal(
        JSON.parse(answered.content[0].text).service_url_source,
        'composed',
      );
    });
  });

  it('says the URL was composed when the system names none', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    assert.equal(payload.service_url_source, 'composed');
    assert.ok(
      payload.service_url.includes('/sap/opu/odata/sap/ZSB_STUDENT_V2/'),
    );
  });

  describe('over RFC: the connection answers no URL', () => {
    const overRfc = async (args: Record<string, unknown>) => {
      const answered = await handleGetServiceBindingPreviewUrl(
        {
          connection: {
            getBaseUrl: async () => undefined,
            getSessionId: () => null,
          },
          logger: undefined,
        } as never,
        args as never,
      );
      return JSON.parse(
        (answered as { content: { text: string }[] }).content[0].text,
      );
    };
    const serviceGroupAnswering = (serviceUrl: string) => async () =>
      okResponse(
        reading(`<?xml version="1.0" encoding="utf-8"?>
<odatav2:serviceList xmlns:odatav2="http://www.sap.com/categories/odatav2">
  <odatav2:services odatav2:serviceId="ZSB_STUDENT_V2" odatav2:serviceVersion="0001"
    odatav2:serviceUrl="${serviceUrl}" odatav2:published="true"/>
</odatav2:serviceList>`),
      );

    it('answers the paths and query, with origin unknown and the note', async () => {
      fakeClient = clientFor({
        binding: BINDING,
        definition: DEFINITION,
        view: ROOT_VIEW,
      });
      const payload = await overRfc({
        service_binding_name: 'ZSB_STUDENT_V2',
        client: '100',
      });
      assert.equal(payload.service_url, '/sap/opu/odata/sap/ZSB_STUDENT_V2/');
      assert.equal(
        payload.metadata_url,
        '/sap/opu/odata/sap/ZSB_STUDENT_V2/$metadata',
      );
      assert.equal(
        payload.preview_url.startsWith(
          '/sap/bc/adt/businessservices/odatav2/feap/',
        ),
        true,
      );
      assert.ok(payload.preview_url.includes('flp.html?'));
      assert.ok(payload.preview_url.includes('sap-client=100'));
      assert.equal(payload.origin, 'unknown');
      assert.ok(payload.note.includes(NO_ORIGIN_NOTE));
    });

    it('reads the V4 service path from the path itself', async () => {
      fakeClient = clientFor({
        binding: BINDING.replace('srvb:version="V2"', 'srvb:version="V4"'),
        definition: DEFINITION,
        view: ROOT_VIEW,
      });
      const payload = await overRfc({ service_binding_name: 'ZSB_STUDENT_V2' });
      assert.equal(
        payload.service_url,
        '/sap/opu/odata4/sap/zsb_student_v2/srvd/sap/zsb_student_v2/0001/',
      );
      assert.equal(
        payload.preview_descriptor,
        '/sap/opu/odata4/sap/zsb_student_v2/srvd/sap/zsb_student_v2/0001/' +
          '##student_data##to_ADDRESS##student_address##ZSB_STUDENT_V2##0001##ZSB_STUDENT_V2',
      );
      assert.equal(
        payload.preview_url.startsWith(
          '/sap/bc/adt/businessservices/odatav4/feap/',
        ),
        true,
      );
    });

    it('keeps a service URL the system answered absolute', async () => {
      fakeClient = clientFor({
        binding: BINDING,
        definition: DEFINITION,
        view: ROOT_VIEW,
        serviceGroup: serviceGroupAnswering(
          'https://system.example.test/sap/opu/odata/sap/ELSEWHERE/',
        ),
      });
      const payload = await overRfc({ service_binding_name: 'ZSB_STUDENT_V2' });
      assert.equal(
        payload.service_url,
        'https://system.example.test/sap/opu/odata/sap/ELSEWHERE/',
      );
      assert.equal(payload.service_url_source, 'system');
    });

    it('answers a service URL the system answered as a path as that path', async () => {
      fakeClient = clientFor({
        binding: BINDING,
        definition: DEFINITION,
        view: ROOT_VIEW,
        serviceGroup: serviceGroupAnswering('/sap/opu/odata/sap/ELSEWHERE/'),
      });
      const payload = await overRfc({ service_binding_name: 'ZSB_STUDENT_V2' });
      assert.equal(payload.service_url, '/sap/opu/odata/sap/ELSEWHERE/');
    });

    it('over HTTP the answer carries no origin field and no RFC note', async () => {
      fakeClient = clientFor({
        binding: BINDING,
        definition: DEFINITION,
        view: ROOT_VIEW,
      });
      const payload = await payloadOf({
        service_binding_name: 'ZSB_STUDENT_V2',
      });
      assert.equal(payload.origin, undefined);
      assert.ok(!(payload.note ?? '').includes(NO_ORIGIN_NOTE));
    });
  });
});
