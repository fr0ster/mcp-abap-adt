/**
 * The generated per-type version tools (`objectVersionTools.ts`), pinned on
 * each variant, on `recordingConnection` with real adt-clients code: for
 * each versioned type, `Get<Type>Versions` reads the object's version feed,
 * `Get<Type>VersionSource` one version's source by its content URI, and
 * `Get<Type>VersionDiff` the two versions it compares, one read each (a
 * function module's list reads the module first); the table type has its version list alone. SAP's answers are a version feed
 * of two entries and two sources.
 */
import { corpusBody } from '../../helpers/adtCorpus';
import { pinCases } from '../../helpers/pinCases';

/** A version feed of two entries, as SAP answers `…/versions`. */
const FEED = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:title>Version List</atom:title><atom:entry><atom:author><atom:name>PIN_USER</atom:name></atom:author><atom:content type="text/plain" src="/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260102000000/00002/content"/><atom:id>00002</atom:id><atom:updated>2026-01-02T00:00:00Z</atom:updated></atom:entry><atom:entry><atom:author><atom:name>PIN_USER</atom:name></atom:author><atom:content type="text/plain" src="/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content"/><atom:id>00001</atom:id><atom:updated>2026-01-01T00:00:00Z</atom:updated></atom:entry></atom:feed>',
};

/**
 * A function module's metadata: its version list reads the module first
 * (the document the corpus captured).
 */
const FUNCTION_MODULE = {
  status: 200,
  data: corpusBody('read-metadata-function-module--01-fmodules-zmcpshrfm'),
};

/** The two versions' sources. */
const SOURCE_OLD = { status: 200, data: "WRITE 'old'." };
const SOURCE_NEW = { status: 200, data: "WRITE 'new'." };

describe('onprem', () => {
  pinCases([
    {
      tool: 'GetClassVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { class_name: 'ZCL_MCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/includes/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetClassVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetClassVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetProgramVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { program_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetProgramVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetProgramVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetInterfaceVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { interface_name: 'ZIF_MCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetInterfaceVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetInterfaceVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetFunctionModuleVersions',
      variant: 'onprem',
      stand: 'recording',
      args: {
        function_module_name: 'Z_MCP_SHR_FM',
        function_group_name: 'ZMCP_SHR_FGRP',
      },
      answers: [FUNCTION_MODULE, FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm?version=workingArea',
          headers: {
            Accept:
              'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetFunctionModuleVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetFunctionModuleVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetStructureVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { structure_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetStructureVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetStructureVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetDdlVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { ddl_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetDdlVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetDdlVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorDefinitionVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { behavior_definition_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorDefinitionVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorDefinitionVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetMetadataExtensionVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { metadata_extension_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetMetadataExtensionVersionSource',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetMetadataExtensionVersionDiff',
      variant: 'onprem',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableTypeVersions',
      variant: 'onprem',
      stand: 'recording',
      args: { table_type_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tabletypes/zmcp_pin_ver/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
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
      tool: 'GetClassVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { class_name: 'ZCL_MCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/includes/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetClassVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetClassVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/classes/zcl_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetProgramVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { program_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetProgramVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetProgramVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/programs/programs/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetInterfaceVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { interface_name: 'ZIF_MCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetInterfaceVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetInterfaceVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/oo/interfaces/zif_mcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetFunctionModuleVersions',
      variant: 'cloud',
      stand: 'recording',
      args: {
        function_module_name: 'Z_MCP_SHR_FM',
        function_group_name: 'ZMCP_SHR_FGRP',
      },
      answers: [FUNCTION_MODULE, FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm?version=workingArea',
          headers: {
            Accept:
              'application/vnd.sap.adt.functions.fmodules+xml, application/vnd.sap.adt.functions.fmodules.v2+xml, application/vnd.sap.adt.functions.fmodules.v3+xml',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetFunctionModuleVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetFunctionModuleVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tables/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetStructureVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { structure_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetStructureVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetStructureVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/structures/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetDdlVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { ddl_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetDdlVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetDdlVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddl/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorDefinitionVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { behavior_definition_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorDefinitionVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetBehaviorDefinitionVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/bo/behaviordefinitions/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetMetadataExtensionVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { metadata_extension_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetMetadataExtensionVersionSource',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri:
          '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
      },
      answers: [SOURCE_OLD],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetMetadataExtensionVersionDiff',
      variant: 'cloud',
      stand: 'recording',
      args: {
        content_uri_from:
          '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
        content_uri_to:
          '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
      },
      answers: [SOURCE_OLD, SOURCE_NEW],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260101000000/00001/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/ddlx/sources/zmcp_pin_ver/source/main/versions/20260102000000/00002/content',
          headers: {
            Accept: 'text/plain',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTableTypeVersions',
      variant: 'cloud',
      stand: 'recording',
      args: { table_type_name: 'ZMCP_PIN_VER' },
      answers: [FEED],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/tabletypes/zmcp_pin_ver/versions',
          headers: {
            Accept: 'application/atom+xml;type=feed',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
