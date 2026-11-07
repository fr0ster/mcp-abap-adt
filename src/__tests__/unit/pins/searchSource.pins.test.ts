/**
 * `SearchSource` and the function-module source read, pinned (plan D23b,
 * Step 7): the two keys the live search cases call, on each variant.
 *
 * - `SearchSource` over an exact package name, without its subpackages, on
 *   the ADT stand-in (a listed long tool reads on a session of its own): one
 *   batch envelope asking the package's node structure, answered with the
 *   corpus's empty package — the package is walked and nothing is read.
 * - `GetFunctionModule` `part: 'source'`: the module's metadata (its group
 *   confirmed), then its source; SAP's answers are the corpus documents.
 */

import { corpusBody } from '../../../lib/adtCorpus';
import { envelopeResponse } from '../../helpers/batchEnvelope';
import { pinCases, pinPort } from '../../helpers/pinCases';

const PORT = pinPort(__filename);

/** The node structure of an empty package, in a batch envelope. */
const EMPTY_PACKAGE = envelopeResponse([
  {
    status: 200,
    body: corpusBody('read-empty-package-contents--01-nodestructure'),
  },
]);

const MODULE_METADATA = {
  status: 200,
  data: corpusBody('read-metadata-function-module--01-fmodules-zmcpshrfm'),
};

const MODULE_SOURCE = {
  status: 200,
  data: corpusBody('read-function-module-source-text--01-read-source'),
};

pinCases(
  [
    {
      tool: 'SearchSource',
      variant: 'onprem',
      stand: 'adtStandIn',
      args: {
        packages: ['ZPIN_PKG'],
        include_subpackages: false,
        query: 'FUNCTION',
      },
      answers: [undefined, EMPTY_PACKAGE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_1abd11a8-9081-49c1-a255-f0637ef392fb',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'dda8065b-7e38-4df9-a8ff-d5d0b59ee5d8',
            'sap-adt-request-id': '225d3b10910b4898a44d601f7aea0693',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '750',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: '127.0.0.1:47103',
            connection: 'keep-alive',
          },
          body: '--batch_1abd11a8-9081-49c1-a255-f0637ef392fb\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nPOST /sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZPIN_PKG&parent_tech_name=ZPIN_PKG&withShortDescriptions=false HTTP/1.1\r\nAccept: application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml\r\nContent-Type: application/vnd.sap.as+xml; charset=UTF-8; dataname=null\r\nContent-Length: 181\r\n\r\n<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000000</TV_NODEKEY></DATA></asx:values></asx:abap>\r\n\r\n--batch_1abd11a8-9081-49c1-a255-f0637ef392fb--\r\n',
        },
      ],
    },
    {
      tool: 'GetFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args: {
        function_module_name: 'Z_MCP_SHR_FM',
        function_group_name: 'ZMCP_SHR_FGRP',
        part: 'source',
      },
      answers: [MODULE_METADATA, MODULE_SOURCE],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'SearchSource',
      variant: 'cloud',
      stand: 'adtStandIn',
      args: {
        packages: ['ZPIN_PKG'],
        include_subpackages: false,
        query: 'FUNCTION',
      },
      answers: [undefined, undefined, EMPTY_PACKAGE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_f8f17e15-b43f-49fb-aa57-158c2ca65490',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': '056bb80a-29fa-4db9-aa64-2fab6402ea9a',
            'sap-adt-request-id': '8bca63391fec4527a8861ba57eaa6b71',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '750',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: '127.0.0.1:47103',
            connection: 'keep-alive',
          },
          body: '--batch_f8f17e15-b43f-49fb-aa57-158c2ca65490\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nPOST /sap/bc/adt/repository/nodestructure?parent_type=DEVC%2FK&parent_name=ZPIN_PKG&parent_tech_name=ZPIN_PKG&withShortDescriptions=false HTTP/1.1\r\nAccept: application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml\r\nContent-Type: application/vnd.sap.as+xml; charset=UTF-8; dataname=null\r\nContent-Length: 181\r\n\r\n<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><TV_NODEKEY>000000</TV_NODEKEY></DATA></asx:values></asx:abap>\r\n\r\n--batch_f8f17e15-b43f-49fb-aa57-158c2ca65490--\r\n',
        },
      ],
    },
    {
      tool: 'GetFunctionModule',
      variant: 'cloud',
      stand: 'recording',
      args: {
        function_module_name: 'Z_MCP_SHR_FM',
        function_group_name: 'ZMCP_SHR_FGRP',
        part: 'source',
      },
      answers: [MODULE_METADATA, MODULE_SOURCE],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
  ],
  { port: PORT },
);
