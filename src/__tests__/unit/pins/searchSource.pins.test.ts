/**
 * `SearchSource` and the function-module source read, pinned (plan D23b,
 * Step 7): the two keys the live search cases call, on each variant.
 *
 * - `SearchSource` over an exact package name, without its subpackages, on
 *   the ADT stand-in (a listed long tool reads on a session of its own): the
 *   package's node structure as its own request (one read, never an
 *   envelope), answered with the
 *   corpus's empty package — the package is walked and nothing is read.
 * - `GetFunctionModule` `part: 'source'`: the module's metadata (its group
 *   confirmed), then its source; SAP's answers are the corpus documents.
 */

import { corpusBody } from '../../helpers/adtCorpus';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

/**
 * The node structure of an empty package, as its own request: one
 * package's walk is one read per level, sent as a single request.
 */
const EMPTY_PACKAGE_ALONE = {
  status: 200,
  data: corpusBody('read-empty-package-contents--01-nodestructure'),
};

const MODULE_METADATA = {
  status: 200,
  data: corpusBody('read-metadata-function-module--01-fmodules-zmcpshrfm'),
};

const MODULE_SOURCE = {
  status: 200,
  data: corpusBody('read-function-module-source-text--01-read-source'),
};

pinCases([
  {
    tool: 'SearchSource',
    variant: 'onprem',
    stand: 'adtStandIn',
    args: {
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
          'sap-adt-connection-id': 'dda8065b-7e38-4df9-a8ff-d5d0b59ee5d8',
          'sap-adt-request-id': '1abd11a8908149c1a255f0637ef392fb',
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
          'sap-adt-connection-id': '056bb80a-29fa-4db9-aa64-2fab6402ea9a',
          'sap-adt-request-id': 'f8f17e15b43f49fbaa57158c2ca65490',
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
]);
