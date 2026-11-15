/**
 * Service bindings, pinned on each variant on `recordingConnection` with
 * real adt-clients code: the validations of a new binding, the binding
 * types, a binding's metadata and source reads, its publication and its
 * preview URL.
 */
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { pinCases } from '../../helpers/pinCases';

/** SAP's transport check of a new binding: admissible (`RESULT` S). */
const ADMISSIBLE = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT><OBJECTNAME>ZMCP_PIN_SRVB</OBJECTNAME><OPERATION>I</OPERATION><DEVCLASS>$TMP</DEVCLASS><CTEXT/><KORRFLAG/><AS4USER>PIN_USER</AS4USER><PDEVCLASS/><DLVUNIT>LOCAL</DLVUNIT><NAMESPACE>/*/</NAMESPACE><RESULT>S</RESULT><RECORDING/><EXISTING_REQ_ONLY/><REQUESTS/><LOCKS/><TADIRDEVC>$TMP</TADIRDEVC></DATA></asx:values></asx:abap>',
};

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
  ]);
});
