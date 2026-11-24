/**
 * `HandlerSystem`, pinned on each variant: one row per action, each the
 * call of its full tool's entry, so its requests are that tool's.
 *
 * - `search_source` over an exact package name without its subpackages, on
 *   the ADT stand-in (a listed long tool reads on a session of its own): the
 *   package's node structure as its own request (one read, never an
 *   envelope), answered with the
 *   corpus's empty package;
 * - the other actions on `recordingConnection` with real adt-clients code,
 *   SAP's answers the corpus documents (in their envelope where the read is
 *   enveloped): `search_object` the quick search, `where_used` the usage
 *   references of a domain, `package_tree` the package's metadata and root
 *   node structure in one envelope, `transports` one GET of the listing
 *   by user, `atc_findings` the worklist,
 *   `atc_results` the result list, `atc_result` one result.
 *
 * `background` is not among the rows: the entry drops it (the server
 * decides it at the dispatch, `src/__tests__/unit/handlerSystem/longTool.test.ts`),
 * so a row with it sends what the row without it sends.
 */

import { describe } from 'node:test';
import { corpusBody } from '../../helpers/adtCorpus';
import { envelopeResponse } from '../../helpers/batchEnvelope';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

/** The node structure of an empty package, in a batch envelope. */
/**
 * The node structure of an empty package, as its own request: one package's
 * walk is one read per level, never an envelope.
 */
const EMPTY_PACKAGE_ALONE = {
  status: 200,
  data: corpusBody('read-empty-package-contents--01-nodestructure'),
};

/** A corpus document as SAP answered it. */
const document = (name: string) => ({
  status: 200,
  headers: { 'Content-Type': 'application/xml' },
  data: corpusBody(name),
});

/** The package's metadata and its root node structure, in one envelope. */
const PACKAGE_ROOT = envelopeResponse([
  {
    status: 200,
    body: corpusBody('read-metadata-package--01-packages-zmcpshrpkg'),
  },
  {
    status: 200,
    body: corpusBody('read-empty-package-contents--01-nodestructure'),
  },
]);

/** The listing by user, as SAP answered it. */
const LISTING = [
  {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.sap.adt.transportorganizertree.v1+xml; charset=utf-8',
    },
    data: corpusBody('read-transport-list-structure--01-cts-transportrequests'),
  },
];

const WORKLIST = document(
  'atc-findings-worklist--01-worklists-2aaa2806861e1fd1ad9bd28dca5c37ed',
);
const RESULTS = document('atc-results-list-central--01-results');
const RESULT = document(
  'atc-result-by-display-id--01-results-e6ac99b2161f1fe1b5a1e9b68e5cd628',
);
const USAGES = document(
  'read-where-used-list-structure--01-informationsystem-usagereferences',
);
const QUICK_SEARCH = document(
  'read-package-quick-search-mask--01-quick-search',
);

describe('onprem', () => {
  pinCases([
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'adtStandIn',
      args: {
        action: 'search_source',
        packages: ['ZPIN_PKG'],
        include_subpackages: false,
        query: 'FUNCTION',
      },
      answers: [undefined, EMPTY_PACKAGE_ALONE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZPIN_PKG&parent_tech_name=ZPIN_PKG&withShortDescriptions=false',
          headers: {
            accept:
              'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
            'content-type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'ec1e23e9-9820-4055-ac8b-209478db6143',
            'sap-adt-request-id': '51854c50758c497dafaf181ae0d3a4ca',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '181',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000000</TV_NODEKEY></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'search_object',
        object_name: 'ZCL_MCP_SHARED_CLS',
        object_type: 'CLAS',
      },
      answers: [QUICK_SEARCH],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=ZCL_MCP_SHARED_CLS&maxResults=100&objectType=CLAS',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'where_used',
        object_name: 'ZMCP_SHR_DOMAIN',
        object_type: 'DOMA/DD',
      },
      answers: [USAGES],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/repository/informationsystem/usageReferences?uri=%2Fsap%2Fbc%2Fadt%2Fddic%2Fdomains%2Fzmcp_shr_domain',
          headers: {
            Accept:
              'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
            'Content-Type':
              'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageReferenceRequest>',
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'recording',
      args: { action: 'package_tree', package_name: 'ZMCP_SHR_PKG' },
      answers: [PACKAGE_ROOT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            'Content-Type':
              'multipart/mixed; boundary=batch_8c17a172-0cce-420f-a470-94906158b44e',
            Accept: 'multipart/mixed',
          },
          body: '--batch_8c17a172-0cce-420f-a470-94906158b44e\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/packages/zmcp_shr_pkg?version=active HTTP/1.1\r\nAccept: application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml\r\n\r\n\r\n--batch_8c17a172-0cce-420f-a470-94906158b44e\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nPOST /sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZMCP_SHR_PKG&parent_tech_name=ZMCP_SHR_PKG&withShortDescriptions=false HTTP/1.1\r\nAccept: application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml\r\nContent-Type: application/vnd.sap.as+xml; charset=UTF-8; dataname=null\r\nContent-Length: 181\r\n\r\n<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000000</TV_NODEKEY></DATA></asx:values></asx:abap>\r\n\r\n--batch_8c17a172-0cce-420f-a470-94906158b44e--\r\n',
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'recording',
      args: { action: 'transports', user: 'PIN_USER', modifiable_only: true },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_USER&requestStatus=D&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'atc_findings',
        worklist_id: '2AAA2806861E1FD1AD9BD28DCA5C37ED',
      },
      answers: [WORKLIST],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/atc/worklists/2AAA2806861E1FD1AD9BD28DCA5C37ED?includeExemptedFindings=false',
          headers: {
            Accept:
              'application/atc.worklist.v1+xml, application/vnd.sap.atc.worklist.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'recording',
      args: { action: 'atc_results', created_by: '*' },
      answers: [RESULTS],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/atc/results?createdBy=*',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'atc_result',
        display_id: 'E6AC99B2161F1FE1B5A1E9B68E5CD628',
      },
      answers: [RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/atc/results/E6AC99B2161F1FE1B5A1E9B68E5CD628',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'adtStandIn',
      args: {
        action: 'search_source',
        packages: ['ZPIN_PKG'],
        include_subpackages: false,
        query: 'FUNCTION',
      },
      answers: [undefined, undefined, EMPTY_PACKAGE_ALONE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZPIN_PKG&parent_tech_name=ZPIN_PKG&withShortDescriptions=false',
          headers: {
            accept:
              'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml',
            'content-type':
              'application/vnd.sap.as+xml; charset=UTF-8; dataname=null',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '0276fab1-dae1-48e1-ada6-849e4ee3b065',
            'sap-adt-request-id': 'ae2357e303cd4685a7f7ce0041ee85dc',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '181',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000000</TV_NODEKEY></DATA></asx:values></asx:abap>',
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'search_object',
        object_name: 'ZCL_MCP_SHARED_CLS',
        object_type: 'CLAS',
      },
      answers: [QUICK_SEARCH],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=ZCL_MCP_SHARED_CLS&maxResults=100&objectType=CLAS',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'where_used',
        object_name: 'ZMCP_SHR_DOMAIN',
        object_type: 'DOMA/DD',
      },
      answers: [USAGES],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/repository/informationsystem/usageReferences?uri=%2Fsap%2Fbc%2Fadt%2Fddic%2Fdomains%2Fzmcp_shr_domain',
          headers: {
            Accept:
              'application/vnd.sap.adt.repository.usagereferences.result.v1+xml',
            'Content-Type':
              'application/vnd.sap.adt.repository.usagereferences.request.v1+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:affectedObjects/></usagereferences:usageReferenceRequest>',
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'recording',
      args: { action: 'package_tree', package_name: 'ZMCP_SHR_PKG' },
      answers: [PACKAGE_ROOT],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            'Content-Type':
              'multipart/mixed; boundary=batch_e43fda6d-c456-4de8-ae80-89ef9c2fd97a',
            Accept: 'multipart/mixed',
          },
          body: '--batch_e43fda6d-c456-4de8-ae80-89ef9c2fd97a\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/packages/zmcp_shr_pkg?version=active HTTP/1.1\r\nAccept: application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml\r\n\r\n\r\n--batch_e43fda6d-c456-4de8-ae80-89ef9c2fd97a\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nPOST /sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZMCP_SHR_PKG&parent_tech_name=ZMCP_SHR_PKG&withShortDescriptions=false HTTP/1.1\r\nAccept: application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml\r\nContent-Type: application/vnd.sap.as+xml; charset=UTF-8; dataname=null\r\nContent-Length: 181\r\n\r\n<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000000</TV_NODEKEY></DATA></asx:values></asx:abap>\r\n\r\n--batch_e43fda6d-c456-4de8-ae80-89ef9c2fd97a--\r\n',
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'recording',
      args: { action: 'transports', user: 'PIN_USER', modifiable_only: true },
      answers: LISTING,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests?user=PIN_USER&requestStatus=D&requestType=KWT',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizertree.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'atc_findings',
        worklist_id: '2AAA2806861E1FD1AD9BD28DCA5C37ED',
      },
      answers: [WORKLIST],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/atc/worklists/2AAA2806861E1FD1AD9BD28DCA5C37ED?includeExemptedFindings=false',
          headers: {
            Accept:
              'application/atc.worklist.v1+xml, application/vnd.sap.atc.worklist.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'recording',
      args: { action: 'atc_results', created_by: '*' },
      answers: [RESULTS],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/atc/results?createdBy=*',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSystem',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'atc_result',
        display_id: 'E6AC99B2161F1FE1B5A1E9B68E5CD628',
      },
      answers: [RESULT],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/atc/results/E6AC99B2161F1FE1B5A1E9B68E5CD628',
          headers: { Accept: 'application/xml' },
          body: undefined,
        },
      ],
    },
  ]);
});
