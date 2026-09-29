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
import { getSystemInformation } from '@mcp-abap-adt/adt-clients';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { handleGetServiceBindingPreviewUrl } from '../../handlers/system/readonly/handleGetServiceBindingPreviewUrl';
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

// The client and the language come from ADT's own `systeminformation`, so the
// tool is tested against what that endpoint answers — including its refusals,
// which must not fail a read that worked.
jest.mock('@mcp-abap-adt/adt-clients', () => ({
  ...jest.requireActual('@mcp-abap-adt/adt-clients'),
  getSystemInformation: jest.fn(),
}));
const systemInfo = getSystemInformation as jest.Mock;

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
}) =>
  fakeClientOf({
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
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

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
    systemInfo.mockReset();
    systemInfo.mockResolvedValue(null);
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

    expect(payload.protocol).toBe('odatav2');
    expect(payload.service).toBe('ZSB_STUDENT_V2');
    expect(payload.service_definition).toBe('ZUI_STUDENT');
    expect(payload.entity_sets).toEqual(['student_data', 'student_address']);
    expect(payload.associations).toEqual(['to_ADDRESS']);
    expect(payload.preview_descriptor).toBe(
      'ZSB_STUDENT_V2##student_data##to_ADDRESS##student_address##ZSB_STUDENT_V2_VAN##0001',
    );
    // The very URL Eclipse produced for this binding, host and client.
    expect(payload.preview_url).toBe(
      'https://epbyminsd0654.epam.com:44300/sap/bc/adt/businessservices/odatav2/feap/' +
        'ngVsghiXYbhsjF77%C2%87%C2%88%C2%89xy%C2%82%C2%88sxu%C2%88u77%C2%88%C2%83sUXXfYgg77' +
        '%C2%87%C2%88%C2%89xy%C2%82%C2%88suxx%C2%86y%C2%87%C2%8777ngVsghiXYbhsjFsjUb77DDDE' +
        '/flp.html?sap-ui-xx-viewCache=false&sap-ui-language=EN&sap-client=100',
    );
    expect(payload.service_url).toBe(
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata/sap/ZSB_STUDENT_V2/',
    );
    expect(payload.metadata_url).toBe(`${payload.service_url}$metadata`);
    expect(payload.missing).toBeUndefined();
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

    expect(payload.missing).toBeUndefined();
    expect(payload.associations).toEqual([]);
    expect(payload.preview_descriptor).toBe(
      'ZSB_STUDENT_V2##student_data####student_address##ZSB_STUDENT_V2_VAN##0001',
    );
    expect(payload.preview_url).toContain('/businessservices/odatav2/feap/');
    expect(payload.service_url).toContain('/sap/opu/odata/sap/ZSB_STUDENT_V2/');
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

    expect(payload.preview_url).toBeUndefined();
    expect(payload.missing).toEqual(['entity_set']);
    expect(payload.service_url).toContain('/sap/opu/odata/sap/ZSB_STUDENT_V2/');
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

    expect(payload.published).toBe(false);
    expect(payload.note).toMatch(/not published/);
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

    expect(payload.preview_descriptor).toBe(
      'ZSB_STUDENT_V2##student_address##to_STUDENT##student_data##ZSB_STUDENT_V2_VAN##0001',
    );
    expect(payload.preview_url).toContain('sap-ui-language=DE');
    // A named navigation means the view is not read at all.
    expect(payload.associations).toEqual([]);
  });

  it('answers no preview for a V4 binding, and says the composition is unmeasured', async () => {
    // The V2 descriptor came from a URL Eclipse produced. The V4 one was
    // extrapolated by swapping the protocol in the path, and measured against a
    // published V4 UI service the endpoint answered 404 for every composition
    // tried. So: no URL, and the reason said out loud.
    fakeClient = clientFor({
      binding: BINDING.replace('srvb:version="V2"', 'srvb:version="V4"'),
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    expect(payload.protocol).toBe('odatav4');
    expect(payload.preview_url).toBeUndefined();
    expect(payload.preview_descriptor).toBeUndefined();
    expect(payload.note).toMatch(/not established/);
    // The URLs that ARE measured still come back.
    expect(payload.service_url).toContain('/sap/opu/odata4/sap/');
    expect(payload.metadata_url).toContain('$metadata');
  });

  it('builds the V4 root when the binding is V4', async () => {
    fakeClient = clientFor({
      binding: BINDING.replace('srvb:version="V2"', 'srvb:version="V4"'),
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    expect(payload.protocol).toBe('odatav4');
    expect(payload.service_url).toBe(
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata4/sap/zsb_student_v2' +
        '/srvd/sap/zui_student/0001/',
    );
    // No preview for V4 — see the test above; the service URL is the point here.
    expect(payload.preview_url).toBeUndefined();
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

    expect(payload.binding_category).toBe('web_api');
    expect(payload.preview_url).toBeUndefined();
    expect(payload.preview_descriptor).toBeUndefined();
    expect(payload.missing).toBeUndefined();
    expect(payload.note).toMatch(/Web API binding, which has no Fiori preview/);
    // What such a binding IS addressed by:
    expect(payload.service_url).toBe(
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata/sap/ZSB_STUDENT_V2/',
    );
    expect(payload.metadata_url).toBe(`${payload.service_url}$metadata`);
  });

  it('reads the UI variant as the one a preview belongs to', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    expect(payload.binding_category).toBe('ui');
    expect(payload.preview_url).toContain('/feap/');
  });

  it('takes the client and the language from the system when none were given', async () => {
    // What a caller cannot know and does not have to: the same record this
    // server already reads to resolve a request's system.
    systemInfo.mockResolvedValue({ client: '100', language: 'EN' });
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    expect(payload.client).toBe('100');
    expect(payload.language).toBe('EN');
    expect(payload.preview_url).toContain('sap-client=100');
    expect(payload.note).toBeUndefined();
  });

  it('leaves the parameter out when the caller passes an empty client', async () => {
    systemInfo.mockResolvedValue({ client: '100', language: 'EN' });
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({
      service_binding_name: 'ZSB_STUDENT_V2',
      client: '',
    });

    expect(payload.preview_url).not.toContain('sap-client');
    // And an explicit empty string is not overridden by the system's answer.
    expect(payload.client).toBe('');
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

    expect(systemInfo).not.toHaveBeenCalled();
  });

  it('still answers the URL when the system record cannot be read, and says so', async () => {
    // `getSystemInformation` answers null where the endpoint is absent and
    // THROWS on anything else. Neither is this tool's failure.
    systemInfo.mockRejectedValue(new Error('403 Forbidden'));
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    expect(payload.success).toBe(true);
    expect(payload.preview_url).toContain('/feap/');
    expect(payload.preview_url).not.toContain('sap-client');
    expect(payload.note).toContain('403 Forbidden');
  });

  it('prefers the URL the system names over the one a rule composes', async () => {
    // The Service Binding editor reads this resource for its own "Service URL"
    // field, so when it answers, its answer wins: it knows about prefixes and
    // rewrites a naming rule cannot. Measured on a trial it comes back empty, and
    // then the composed URL stays — which every other test here exercises.
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const answered = await handleGetServiceBindingPreviewUrl(
      {
        connection: {
          getBaseUrl: async () => 'https://epbyminsd0654.epam.com:44300/',
          getSessionId: () => null,
          makeAdtRequest: async () => ({
            data: `<?xml version="1.0" encoding="utf-8"?>
<odatav2:serviceList xmlns:odatav2="http://www.sap.com/categories/odatav2">
  <odatav2:services odatav2:serviceId="ZSB_STUDENT_V2" odatav2:serviceVersion="0001"
    odatav2:serviceUrl="/sap/opu/odata/sap/ELSEWHERE/" odatav2:annotationUrl="/sap/opu/odata/annotations/X/"
    odatav2:published="true"/>
</odatav2:serviceList>`,
            status: 200,
          }),
        } as never,
        logger: undefined,
      } as never,
      { service_binding_name: 'ZSB_STUDENT_V2' } as never,
    );
    const payload = JSON.parse(
      (answered as { content: { text: string }[] }).content[0].text,
    );

    expect(payload.service_url_source).toBe('system');
    expect(payload.service_url).toBe(
      'https://epbyminsd0654.epam.com:44300/sap/opu/odata/sap/ELSEWHERE/',
    );
    expect(payload.metadata_url).toBe(`${payload.service_url}$metadata`);
    expect(payload.annotation_url).toBe('/sap/opu/odata/annotations/X/');
  });

  it('says the URL was composed when the system names none', async () => {
    fakeClient = clientFor({
      binding: BINDING,
      definition: DEFINITION,
      view: ROOT_VIEW,
    });

    const payload = await payloadOf({ service_binding_name: 'ZSB_STUDENT_V2' });

    expect(payload.service_url_source).toBe('composed');
    expect(payload.service_url).toContain('/sap/opu/odata/sap/ZSB_STUDENT_V2/');
  });
});
