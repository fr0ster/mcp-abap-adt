/**
 * Repository reads, pinned on each variant on `recordingConnection` with
 * real adt-clients code: a transaction, an object's structure, a package
 * and a behavior implementation's metadata and source. SAP's answers are
 * the documents the corpus captured, or a minimal one where it has none.
 */
import { corpusBody } from '../../helpers/adtCorpus';
import { pinCases } from '../../helpers/pinCases';

/** A transaction's properties, as SAP answers them (its facets shortened). */
const TRANSACTION = [
  {
    status: 200,
    data: '<?xml version="1.0" encoding="utf-8"?><opr:objectProperties xmlns:opr="http://www.sap.com/adt/objectproperties"><opr:object text="Object Navigator" name="SE80" package="SEU" type="TRAN/T" expandable="true"/><opr:property facet="PACKAGE" name="SEU" displayName="Package" text="Development Environment"/><opr:property facet="TYPE" name="TRAN/T" displayName="Type"/></opr:objectProperties>',
  },
];

/** A class's object structure: the class and its text elements. */
const STRUCTURE = [
  {
    status: 200,
    data: '<?xml version="1.0" encoding="utf-8"?><projectexplorer:objectstructure xmlns:projectexplorer="http://www.sap.com/adt/projectexplorer"><projectexplorer:node nodeid="000001" objecttype="CLAS/OC" objectname="ZCL_MCP_SHARED_CLS" isfolder="false"/><projectexplorer:node nodeid="000002" parentid="000001" objecttype="CLAS/OCX" objectname="ZCL_MCP_SHARED_CLS" isfolder="false"/></projectexplorer:objectstructure>',
  },
];

/** A package's metadata, as the corpus captured it. */
const PACKAGE = [
  {
    status: 200,
    data: corpusBody('read-metadata-package--01-packages-zmcpshrpkg'),
  },
];

/** A behavior implementation (a class) metadata, as the corpus captured it. */
const IMPLEMENTATION = [
  {
    status: 200,
    data: corpusBody('read-metadata-class--01-classes-zbpmcpshriroot'),
  },
];

/** A behavior implementation's source. */
const SOURCE = [
  {
    status: 200,
    data: 'CLASS zbp_mcp_shr_i_root DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zmcp_shr_i_root.\nENDCLASS.\nCLASS zbp_mcp_shr_i_root IMPLEMENTATION.\nENDCLASS.',
  },
];

describe('onprem', () => {
  pinCases([
    {
      tool: 'GetTransaction',
      variant: 'onprem',
      stand: 'recording',
      args: { transaction_name: 'SE80' },
      answers: TRANSACTION,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=%2Fsap%2Fbc%2Fadt%2Fvit%2Fwb%2Fobject_type%2Ftrant%2Fobject_name%2FSE80',
          headers: {
            Accept:
              'application/vnd.sap.adt.repository.objproperties.result.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetObjectStructure',
      variant: 'onprem',
      stand: 'recording',
      args: { objecttype: 'CLAS/OC', objectname: 'ZCL_MCP_SHARED_CLS' },
      answers: STRUCTURE,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/objectstructure?objecttype=CLAS%2FOC&objectname=ZCL_MCP_SHARED_CLS',
          headers: {
            Accept:
              'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetPackage',
      variant: 'onprem',
      stand: 'recording',
      args: { package_name: 'ZMCP_SHR_PKG' },
      answers: PACKAGE,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/packages/zmcp_shr_pkg?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorImplementation',
      variant: 'onprem',
      stand: 'recording',
      args: {
        behavior_implementation_name: 'ZBP_MCP_SHR_I_ROOT',
        part: 'metadata',
      },
      answers: IMPLEMENTATION,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zbp_mcp_shr_i_root?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.oo.classes.v4+xml, application/vnd.sap.adt.oo.classes.v3+xml, application/vnd.sap.adt.oo.classes.v2+xml, application/vnd.sap.adt.oo.classes.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorImplementation',
      variant: 'onprem',
      stand: 'recording',
      args: {
        behavior_implementation_name: 'ZBP_MCP_SHR_I_ROOT',
        part: 'source',
      },
      answers: SOURCE,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zbp_mcp_shr_i_root/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSearch',
      variant: 'onprem',
      stand: 'recording',
      args: { query: 'ZCL_MCP_SHARED_CLS', object_type: 'CLAS' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=ZCL_MCP_SHARED_CLS&maxResults=100&objectType=CLAS',
          headers: {
            Accept: 'application/xml',
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
      tool: 'GetTransaction',
      variant: 'cloud',
      stand: 'recording',
      args: { transaction_name: 'SE80' },
      answers: TRANSACTION,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/informationsystem/objectproperties/values?uri=%2Fsap%2Fbc%2Fadt%2Fvit%2Fwb%2Fobject_type%2Ftrant%2Fobject_name%2FSE80',
          headers: {
            Accept:
              'application/vnd.sap.adt.repository.objproperties.result.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetObjectStructure',
      variant: 'cloud',
      stand: 'recording',
      args: { objecttype: 'CLAS/OC', objectname: 'ZCL_MCP_SHARED_CLS' },
      answers: STRUCTURE,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/objectstructure?objecttype=CLAS%2FOC&objectname=ZCL_MCP_SHARED_CLS',
          headers: {
            Accept:
              'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetPackage',
      variant: 'cloud',
      stand: 'recording',
      args: { package_name: 'ZMCP_SHR_PKG' },
      answers: PACKAGE,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/packages/zmcp_shr_pkg?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorImplementation',
      variant: 'cloud',
      stand: 'recording',
      args: {
        behavior_implementation_name: 'ZBP_MCP_SHR_I_ROOT',
        part: 'metadata',
      },
      answers: IMPLEMENTATION,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zbp_mcp_shr_i_root?version=active',
          headers: {
            Accept:
              'application/vnd.sap.adt.oo.classes.v4+xml, application/vnd.sap.adt.oo.classes.v3+xml, application/vnd.sap.adt.oo.classes.v2+xml, application/vnd.sap.adt.oo.classes.v1+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorImplementation',
      variant: 'cloud',
      stand: 'recording',
      args: {
        behavior_implementation_name: 'ZBP_MCP_SHR_I_ROOT',
        part: 'source',
      },
      answers: SOURCE,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zbp_mcp_shr_i_root/source/main?version=active',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerSearch',
      variant: 'cloud',
      stand: 'recording',
      args: { query: 'ZCL_MCP_SHARED_CLS', object_type: 'CLAS' },
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=ZCL_MCP_SHARED_CLS&maxResults=100&objectType=CLAS',
          headers: {
            Accept: 'application/xml',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
