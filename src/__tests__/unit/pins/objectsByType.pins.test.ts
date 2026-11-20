/**
 * Object tree reads, pinned on each variant on `recordingConnection` with
 * real adt-clients code: `GetObjectsByType` reads one type folder of a
 * package's node structure (a minimal class folder answers), and
 * `GetObjectNodeFromCache` answers a node of the list it cached and reads
 * the object its `OBJECT_URI` names (a minimal class document answers).
 */
import { after, before, describe } from 'node:test';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

/** A package's class folder, as SAP's node structure answers it (shortened). */
const CLASS_FOLDER = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><TREE_CONTENT><SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>CLAS/OC</OBJECT_TYPE><OBJECT_NAME>ZCL_MCP_PIN</OBJECT_NAME><TECH_NAME>ZCL_MCP_PIN</TECH_NAME><OBJECT_URI>/sap/bc/adt/oo/classes/zcl_mcp_pin</OBJECT_URI><EXPANDABLE>X</EXPANDABLE></SEU_ADT_REPOSITORY_OBJ_NODE></TREE_CONTENT><CATEGORIES/><OBJECT_TYPES/></DATA></asx:values></asx:abap>',
};

/** The class the node's `OBJECT_URI` names. */
const CLASS_METADATA = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZCL_MCP_PIN" adtcore:type="CLAS/OC"/>',
};

/** The server's requests around a cached node's read, answered by what each is. */
const answerOf = (wire: { status: number; data: string }) => ({
  status: wire.status,
  headers: { 'content-type': 'application/xml' },
  text: wire.data,
});
const NODE_READS = [
  {
    method: 'POST',
    path: '/sap/bc/adt/repository/nodestructure',
    answer: answerOf(CLASS_FOLDER),
  },
  {
    method: 'GET',
    path: '/sap/bc/adt/oo/classes/zcl_mcp_pin',
    answer: answerOf(CLASS_METADATA),
  },
];
const NODE_MATCHED = {
  onprem: [
    { method: 'GET', path: '/sap/bc/adt/core/discovery' },
    { method: 'GET', path: '/sap/bc/adt/core/http/systeminformation' },
    { method: 'GET', path: '/sap/public/bc/icf/logoff' },
    ...NODE_READS,
  ],
  cloud: [
    { method: 'GET', path: '/sap/bc/adt/core/http/sessions' },
    { method: 'GET', path: '/sap/bc/adt/core/discovery' },
    { method: 'GET', path: '/sap/bc/adt/core/http/systeminformation' },
    { method: 'GET', path: '/sap/public/bc/icf/logoff' },
    ...NODE_READS,
  ],
};

/**
 * `SAP_SYSTEM_TYPE` stated as `variant` for the enclosing describe's
 * cases (the server's dispatch reads it), and restored after them.
 */
function statedAs(variant: 'onprem' | 'cloud'): void {
  let previous: string | undefined;
  before(() => {
    previous = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = variant;
  });
  after(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });
}

describe('onprem', () => {
  statedAs('onprem');
  pinCases([
    {
      tool: 'GetObjectsByType',
      variant: 'onprem',
      stand: 'recording',
      args: {
        parent_name: 'ZMCP_PIN_PKG',
        parent_tech_name: 'ZMCP_PIN_PKG',
        parent_type: 'DEVC/K',
        node_id: '000029',
      },
      answers: [CLASS_FOLDER],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZMCP_PIN_PKG&parent_tech_name=ZMCP_PIN_PKG&withShortDescriptions=true&node_id=000029',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
            'Content-Type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000029</TV_NODEKEY></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'GetObjectNodeFromCache',
      variant: 'onprem',
      stand: 'server',
      matched: NODE_MATCHED.onprem,
      before: [
        {
          tool: 'GetObjectsByType',
          args: {
            parent_name: 'ZMCP_PIN_PKG',
            parent_tech_name: 'ZMCP_PIN_PKG',
            parent_type: 'DEVC/K',
            node_id: '000029',
          },
        },
      ],
      args: {
        object_type: 'CLAS/OC',
        object_name: 'ZCL_MCP_PIN',
        tech_name: 'ZCL_MCP_PIN',
      },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin?version=active',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': '22cfed9f-0994-4002-a7e9-50d79fa03673',
            'sap-adt-request-id': 'b23e128969974741a4ae4d752da041f3',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  statedAs('cloud');
  pinCases([
    {
      tool: 'GetObjectsByType',
      variant: 'cloud',
      stand: 'recording',
      args: {
        parent_name: 'ZMCP_PIN_PKG',
        parent_tech_name: 'ZMCP_PIN_PKG',
        parent_type: 'DEVC/K',
        node_id: '000029',
      },
      answers: [CLASS_FOLDER],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZMCP_PIN_PKG&parent_tech_name=ZMCP_PIN_PKG&withShortDescriptions=true&node_id=000029',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
            'Content-Type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000029</TV_NODEKEY></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'GetObjectNodeFromCache',
      variant: 'cloud',
      stand: 'server',
      matched: NODE_MATCHED.cloud,
      before: [
        {
          tool: 'GetObjectsByType',
          args: {
            parent_name: 'ZMCP_PIN_PKG',
            parent_tech_name: 'ZMCP_PIN_PKG',
            parent_type: 'DEVC/K',
            node_id: '000029',
          },
        },
      ],
      args: {
        object_type: 'CLAS/OC',
        object_name: 'ZCL_MCP_PIN',
        tech_name: 'ZCL_MCP_PIN',
      },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin?version=active',
          headers: {
            accept: 'application/xml, application/json, text/plain, */*',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '59cfccd3-8e74-43de-a9be-6a978fb499a9',
            'sap-adt-request-id': '0bff3374197e4f6baad9acc1d85d2d97',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
