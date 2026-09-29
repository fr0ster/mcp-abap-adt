/**
 * The binding's fields, read from documents the systems actually answered.
 *
 * The two payloads below are cuts of what a trial system returned for a V4 and a V2
 * binding, and the service definition is one it returned verbatim. They are here
 * because every one of these fields sits somewhere a reader would not guess: the
 * service is not the definition, the version in the URL is the CONTENT's version,
 * and the protocol lives on a different element again.
 */
import {
  associationsOf,
  exposedEntitiesOf,
  serviceBindingFactsOf,
} from '../../lib/strategies/serviceBindingFacts';

/** A V4 binding, as a trial answered it. */
const V4_BINDING = `<?xml version="1.0" encoding="utf-8"?>
<srvb:serviceBinding srvb:contract="C1" srvb:releaseSupported="true" srvb:published="true"
  srvb:bindingCreated="true" srvb:allowedAction="UNPUBLISH" adtcore:name="ZTRAVEL"
  adtcore:type="SRVB/SVB" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings"
  xmlns:adtcore="http://www.sap.com/adt/core">
  <srvb:services srvb:name="ZUI_TRAVEL">
    <srvb:content srvb:version="0001" srvb:minorVersion="0" srvb:patchVersion="0"
      srvb:releaseState="NOT_RELEASED">
      <srvb:serviceDefinition adtcore:uri="/sap/bc/adt/ddic/srvd/sources/zui_travel"
        adtcore:type="SRVD/SRV" adtcore:name="ZUI_TRAVEL"/>
    </srvb:content>
  </srvb:services>
  <srvb:bindingTypeData>
    <srvb:binding srvb:type="ODATA" srvb:version="V4" srvb:category="0">
      <srvb:implementation adtcore:name="ZTRAVEL"/>
    </srvb:binding>
  </srvb:bindingTypeData>
</srvb:serviceBinding>`;

/** A V2 binding from the same system — note the service is not the definition. */
const V2_BINDING = V4_BINDING.replace('srvb:version="V4"', 'srvb:version="V2"')
  .replace('adtcore:name="ZUI_TRAVEL"/>', 'adtcore:name="ZTRAVEL_SD"/>')
  .replace('adtcore:name="ZTRAVEL"\n', 'adtcore:name="ZUI_TRAVEL"\n');

const SERVICE_DEFINITION = `@EndUserText.label: 'Service Definition for Travel'
define service ZUI_Travel {
  expose ZC_Travel_LJ    as Travel;
  expose ZI_Booking_LJ   as Booking;
  expose /DMO/I_Customer as Customer;
}`;

describe('what a service binding document says', () => {
  it('reads the service, the definition, the version and the protocol', () => {
    expect(serviceBindingFactsOf(V4_BINDING)).toEqual({
      service: 'ZUI_TRAVEL',
      serviceDefinition: 'ZUI_TRAVEL',
      version: '0001',
      category: 'ui',
      protocol: 'odatav4',
      bindingType: 'ODATA',
      published: true,
    });
  });

  it('does not mistake the definition for the service', () => {
    const facts = serviceBindingFactsOf(V2_BINDING);
    expect(facts.protocol).toBe('odatav2');
    expect(facts.serviceDefinition).toBe('ZTRAVEL_SD');
    expect(facts.service).toBe('ZUI_TRAVEL');
  });

  it('calls an unpublished binding unpublished', () => {
    expect(
      serviceBindingFactsOf(
        V4_BINDING.replace('srvb:published="true"', 'srvb:published="false"'),
      ).published,
    ).toBe(false);
  });
});

describe('what a service definition exposes', () => {
  it('takes the alias as the entity set, not the entity', () => {
    expect(exposedEntitiesOf(SERVICE_DEFINITION)).toEqual([
      { entity: 'ZC_Travel_LJ', entitySet: 'Travel' },
      { entity: 'ZI_Booking_LJ', entitySet: 'Booking' },
      { entity: '/DMO/I_Customer', entitySet: 'Customer' },
    ]);
  });

  it('falls back to the entity name when there is no alias', () => {
    expect(
      exposedEntitiesOf('define service X { expose ZI_Student; }'),
    ).toEqual([{ entity: 'ZI_Student', entitySet: 'ZI_Student' }]);
  });
});

describe('associations of an exposed view', () => {
  it('reads the names the navigation segment needs', () => {
    const view = `define root view entity ZI_Student
  composition [0..*] of ZI_StudentAddress as _Address
  association [0..1] to ZI_Class as to_CLASS
  { key id; _Address; to_CLASS; }`;
    expect(associationsOf(view)).toEqual(['_Address', 'to_CLASS']);
  });
});
