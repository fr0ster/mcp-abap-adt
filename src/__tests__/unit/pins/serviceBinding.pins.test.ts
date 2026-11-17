/**
 * Service bindings, pinned on each variant on `recordingConnection` with
 * real adt-clients code: the validations of a new binding, the binding
 * types, a binding's metadata and source reads, its publication and its
 * preview URL.
 */

import assert from 'node:assert/strict';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { type McpResult, pinCases } from '../../helpers/pinCases';
import { setSystemContext } from '../../helpers/processSystemContext';

/** SAP's transport check of a new binding: admissible (`RESULT` S). */
const ADMISSIBLE = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT><OBJECTNAME>ZMCP_PIN_SRVB</OBJECTNAME><OPERATION>I</OPERATION><DEVCLASS>$TMP</DEVCLASS><CTEXT/><KORRFLAG/><AS4USER>PIN_USER</AS4USER><PDEVCLASS/><DLVUNIT>LOCAL</DLVUNIT><NAMESPACE>/*/</NAMESPACE><RESULT>S</RESULT><RECORDING/><EXISTING_REQ_ONLY/><REQUESTS/><LOCKS/><TADIRDEVC>$TMP</TADIRDEVC></DATA></asx:values></asx:abap>',
};

/** A published OData V4 UI binding, as SAP answers its read (shortened). */
const PUBLISHED_BINDING = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><srvb:serviceBinding srvb:published="true" srvb:bindingCreated="true" adtcore:name="ZMCP_PIN_SRVB" adtcore:type="SRVB/SVB" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core"><srvb:services srvb:name="ZMCP_PIN_SRVD"><srvb:content srvb:version="0001"><srvb:serviceDefinition adtcore:uri="/sap/bc/adt/ddic/srvd/sources/zmcp_pin_srvd" adtcore:type="SRVD/SRV" adtcore:name="ZMCP_PIN_SRVD"/></srvb:content></srvb:services><srvb:binding srvb:type="ODATA" srvb:version="V4" srvb:category="0"><srvb:implementation adtcore:name="ZMCP_PIN_SRVB"/></srvb:binding></srvb:serviceBinding>',
};

/** The service definition the binding exposes. */
const SERVICE_DEFINITION = {
  status: 200,
  data: "@EndUserText.label: 'pin'\ndefine service ZMCP_PIN_SRVD {\n  expose ZMCP_PIN_ROOT as Root;\n}",
};

/** The exposed view, with no association. */
const ROOT_VIEW = {
  status: 200,
  data: 'define root view entity ZMCP_PIN_ROOT as select from t000 { key mandt }',
};

/** The V4 service group, as the cloud system answers it before the job ends. */
const SERVICE_GROUP = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><odatav4:serviceGroup odatav4:published="false" odatav4:serviceUrlPrefix="" adtcore:name="ZMCP_PIN_SRVB" xmlns:odatav4="http://www.sap.com/categories/odatav4" xmlns:adtcore="http://www.sap.com/adt/core"><odatav4:services odatav4:serviceId="ZMCP_PIN_SRVD" odatav4:serviceVersion="0001" odatav4:serviceUrl="" odatav4:annotationUrl=""/></odatav4:serviceGroup>',
};

/** The published service's `$metadata`: the service answers. */
const METADATA_LIVE = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"/>',
};

/** The cloud gateway's page while SAP's publication job runs (measured, shortened). */
const METADATA_BLOCKED = {
  status: 403,
  data: '<!DOCTYPE html><html><head><title>Application Server Error</title><style>body { background: #ffffff; }</style></head><body><p>403 Forbidden</p><p>The request has been blocked by UCON.</p></body></html>',
};

/** A publication job's status message, as SAP answers it. */
const PUBLISHED_LOCALLY = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>ZMCP_PIN_SRVB published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>',
};

/** The answer's JSON payload. */
const payload = (answer: McpResult): unknown =>
  JSON.parse(
    answer.content.map((item) => ('text' in item ? item.text : '')).join(''),
  );

/** A payload's member. */
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;

/** A change is made for its responsible person: the one stated here. */
beforeEach(() => {
  setSystemContext({ responsible: 'PIN_RESPONSIBLE' });
});
afterEach(() => {
  resetSystemContextCache();
});

describe('onprem', () => {
  pinCases([
    {
      tool: 'ValidateServiceBinding',
      variant: 'onprem',
      stand: 'recording',
      args: {
        service_binding_name: 'ZMCP_PIN_SRVB',
        service_definition_name: 'ZMCP_PIN_SRVD',
        package_name: '$TMP',
        description: 'pin',
      },
      answers: [ADMISSIBLE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportchecks',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.transport.service.checkData',
            'Content-Type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT><OBJECTNAME>ZMCP_PIN_SRVB</OBJECTNAME><OPERATION>I</OPERATION><DEVCLASS>$TMP</DEVCLASS><CTEXT>pin</CTEXT></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'HandlerServiceBindingValidate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        service_binding_name: 'ZMCP_PIN_SRVB',
        service_definition_name: 'ZMCP_PIN_SRVD',
        package_name: '$TMP',
        description: 'pin',
      },
      answers: [ADMISSIBLE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportchecks',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.transport.service.checkData',
            'Content-Type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT><OBJECTNAME>ZMCP_PIN_SRVB</OBJECTNAME><OPERATION>I</OPERATION><DEVCLASS>$TMP</DEVCLASS><CTEXT>pin</CTEXT></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'ListServiceBindingTypes',
      variant: 'onprem',
      stand: 'recording',
      args: { response_format: 'json' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/bindingtypes',
          headers: {
            Accept:
              'application/vnd.sap.adt.nameditems.v1+xml, application/xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerServiceBindingListTypes',
      variant: 'onprem',
      stand: 'recording',
      args: { response_format: 'json' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/bindingtypes',
          headers: {
            Accept:
              'application/vnd.sap.adt.nameditems.v1+xml, application/xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBinding',
      variant: 'onprem',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', part: 'metadata' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBinding',
      variant: 'onprem',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', part: 'source' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'UpdateServiceBinding',
      variant: 'onprem',
      stand: 'recording',
      ran: (answer) => {
        const read = payload(answer);
        assert.equal(field(read, 'result'), 'SUCCESS');
        assert.equal(field(read, 'completion'), 'done');
      },
      args: {
        service_binding_name: 'ZMCP_PIN_SRVB',
        desired_publication_state: 'published',
        service_name: 'ZMCP_PIN_SRVD',
      },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/businessservices/odatav4/publishjobs',
          headers: {
            Accept:
              'application/xml, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:type="SCGR" adtcore:name="ZMCP_PIN_SRVB"/>\n</adtcore:objectReferences>',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBindingPreviewUrl',
      variant: 'onprem',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', entity_set: 'Root' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            Accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBindingPreviewUrl',
      variant: 'onprem',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', entity_set: 'Root' },
      answers: [
        undefined,
        PUBLISHED_BINDING,
        SERVICE_DEFINITION,
        ROOT_VIEW,
        SERVICE_GROUP,
        METADATA_LIVE,
      ],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            Accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/srvd/sources/zmcp_pin_srvd/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_root/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/odatav4/ZMCP_PIN_SRVB?servicename=ZMCP_PIN_SRVD&serviceversion=0001',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.odatav4.v1+xml, application/vnd.sap.adt.businessservices.odatav4.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/opu/odata4/sap/zmcp_pin_srvb/srvd/sap/zmcp_pin_srvd/0001/$metadata',
          headers: {
            Accept: 'application/xml',
          },
          body: undefined,
        },
      ],
      ran: (answer) => {
        assert.equal(field(payload(answer), 'live'), true);
      },
    },
    {
      tool: 'GetServiceBindingPreviewUrl',
      variant: 'onprem',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', entity_set: 'Root' },
      answers: [
        undefined,
        PUBLISHED_BINDING,
        SERVICE_DEFINITION,
        ROOT_VIEW,
        SERVICE_GROUP,
        METADATA_BLOCKED,
      ],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            Accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/srvd/sources/zmcp_pin_srvd/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_root/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/odatav4/ZMCP_PIN_SRVB?servicename=ZMCP_PIN_SRVD&serviceversion=0001',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.odatav4.v1+xml, application/vnd.sap.adt.businessservices.odatav4.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/opu/odata4/sap/zmcp_pin_srvb/srvd/sap/zmcp_pin_srvd/0001/$metadata',
          headers: {
            Accept: 'application/xml',
          },
          body: undefined,
        },
      ],
      ran: (answer) => {
        const read = payload(answer);
        assert.equal(field(read, 'live'), false);
        assert.equal(field(read, 'live_status'), 403);
        assert.equal(
          field(read, 'live_text'),
          '403 Forbidden The request has been blocked by UCON.',
        );
      },
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'ValidateServiceBinding',
      variant: 'cloud',
      stand: 'recording',
      args: {
        service_binding_name: 'ZMCP_PIN_SRVB',
        service_definition_name: 'ZMCP_PIN_SRVD',
        package_name: '$TMP',
        description: 'pin',
      },
      answers: [ADMISSIBLE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportchecks',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.transport.service.checkData',
            'Content-Type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT><OBJECTNAME>ZMCP_PIN_SRVB</OBJECTNAME><OPERATION>I</OPERATION><DEVCLASS>$TMP</DEVCLASS><CTEXT>pin</CTEXT></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'HandlerServiceBindingValidate',
      variant: 'cloud',
      stand: 'recording',
      args: {
        service_binding_name: 'ZMCP_PIN_SRVB',
        service_definition_name: 'ZMCP_PIN_SRVD',
        package_name: '$TMP',
        description: 'pin',
      },
      answers: [ADMISSIBLE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportchecks',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.transport.service.checkData',
            'Content-Type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT><OBJECTNAME>ZMCP_PIN_SRVB</OBJECTNAME><OPERATION>I</OPERATION><DEVCLASS>$TMP</DEVCLASS><CTEXT>pin</CTEXT></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'ListServiceBindingTypes',
      variant: 'cloud',
      stand: 'recording',
      args: { response_format: 'json' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/bindingtypes',
          headers: {
            Accept:
              'application/vnd.sap.adt.nameditems.v1+xml, application/xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerServiceBindingListTypes',
      variant: 'cloud',
      stand: 'recording',
      args: { response_format: 'json' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/bindingtypes',
          headers: {
            Accept:
              'application/vnd.sap.adt.nameditems.v1+xml, application/xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBinding',
      variant: 'cloud',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', part: 'metadata' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBinding',
      variant: 'cloud',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', part: 'source' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'UpdateServiceBinding',
      variant: 'cloud',
      stand: 'recording',
      ran: (answer) => {
        const read = payload(answer);
        assert.equal(field(read, 'result'), 'STARTED');
        assert.equal(field(read, 'completion'), 'background');
      },
      args: {
        service_binding_name: 'ZMCP_PIN_SRVB',
        desired_publication_state: 'published',
        service_name: 'ZMCP_PIN_SRVD',
      },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/businessservices/odatav4/publishjobs',
          headers: {
            Accept:
              'application/xml, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:type="SCGR" adtcore:name="ZMCP_PIN_SRVB"/>\n</adtcore:objectReferences>',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBindingPreviewUrl',
      variant: 'cloud',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', entity_set: 'Root' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            Accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetServiceBindingPreviewUrl',
      variant: 'cloud',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', entity_set: 'Root' },
      answers: [
        undefined,
        PUBLISHED_BINDING,
        SERVICE_DEFINITION,
        ROOT_VIEW,
        SERVICE_GROUP,
        METADATA_LIVE,
      ],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            Accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/srvd/sources/zmcp_pin_srvd/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_root/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/odatav4/ZMCP_PIN_SRVB?servicename=ZMCP_PIN_SRVD&serviceversion=0001',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.odatav4.v1+xml, application/vnd.sap.adt.businessservices.odatav4.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/opu/odata4/sap/zmcp_pin_srvb/srvd/sap/zmcp_pin_srvd/0001/$metadata',
          headers: {
            Accept: 'application/xml',
          },
          body: undefined,
        },
      ],
      ran: (answer) => {
        assert.equal(field(payload(answer), 'live'), true);
      },
    },
    {
      tool: 'GetServiceBindingPreviewUrl',
      variant: 'cloud',
      stand: 'recording',
      args: { service_binding_name: 'ZMCP_PIN_SRVB', entity_set: 'Root' },
      answers: [
        undefined,
        PUBLISHED_BINDING,
        SERVICE_DEFINITION,
        ROOT_VIEW,
        SERVICE_GROUP,
        METADATA_BLOCKED,
      ],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/core/http/systeminformation?_=1767225600000',
          headers: {
            Accept:
              'application/vnd.sap.adt.core.http.systeminformation.v1+json',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/bindings/zmcp_pin_srvb?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.servicebinding.v1+xml, application/vnd.sap.adt.businessservices.servicebinding.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/srvd/sources/zmcp_pin_srvd/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_root/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/businessservices/odatav4/ZMCP_PIN_SRVB?servicename=ZMCP_PIN_SRVD&serviceversion=0001',
          headers: {
            Accept:
              'application/vnd.sap.adt.businessservices.odatav4.v1+xml, application/vnd.sap.adt.businessservices.odatav4.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/opu/odata4/sap/zmcp_pin_srvb/srvd/sap/zmcp_pin_srvd/0001/$metadata',
          headers: {
            Accept: 'application/xml',
          },
          body: undefined,
        },
      ],
      ran: (answer) => {
        const read = payload(answer);
        assert.equal(field(read, 'live'), false);
        assert.equal(field(read, 'live_status'), 403);
        assert.equal(
          field(read, 'live_text'),
          '403 Forbidden The request has been blocked by UCON.',
        );
      },
    },
  ]);
});
