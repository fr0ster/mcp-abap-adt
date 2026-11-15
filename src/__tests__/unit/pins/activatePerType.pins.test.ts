/**
 * The per-type Activate tools, pinned on each variant on
 * `recordingConnection` with real adt-clients code: each sends its one
 * activation of the object it names (a function module's after its read); SAP's answer is the activation the
 * corpus captured succeeding. The program is on premise only.
 */
import { corpusBody } from '../../helpers/adtCorpus';
import { pinCases } from '../../helpers/pinCases';

/** SAP's answer to an activation that succeeded. */
const ACTIVATED = [
  {
    status: 200,
    data: corpusBody('activation-success-verdict--01-activation'),
  },
];

/** A function module's activation reads the module first: the corpus's document. */
const FUNCTION_MODULE = {
  status: 200,
  data: corpusBody('read-metadata-function-module--01-fmodules-zmcpshrfm'),
};

describe('onprem', () => {
  pinCases([
    {
      tool: 'ActivateDomain',
      variant: 'onprem',
      stand: 'recording',
      args: { domain_name: 'ZMCP_PIN_DOM' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/domains/zmcp_pin_dom" adtcore:name="ZMCP_PIN_DOM"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateTableType',
      variant: 'onprem',
      stand: 'recording',
      args: { table_type_name: 'ZMCP_PIN_TT' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/tabletypes/zmcp_pin_tt" adtcore:name="ZMCP_PIN_TT"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateTable',
      variant: 'onprem',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_TAB' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/tables/zmcp_pin_tab" adtcore:name="ZMCP_PIN_TAB"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateStructure',
      variant: 'onprem',
      stand: 'recording',
      args: { structure_name: 'ZMCP_PIN_STR' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/structures/zmcp_pin_str" adtcore:name="ZMCP_PIN_STR"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateDdl',
      variant: 'onprem',
      stand: 'recording',
      args: { ddl_name: 'ZI_MCP_PIN_DDL' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zi_mcp_pin_ddl" adtcore:name="ZI_MCP_PIN_DDL"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateInterface',
      variant: 'onprem',
      stand: 'recording',
      args: { interface_name: 'ZIF_MCP_PIN' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/interfaces/zif_mcp_pin" adtcore:name="ZIF_MCP_PIN"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateFunctionGroup',
      variant: 'onprem',
      stand: 'recording',
      args: { function_group_name: 'ZMCP_PIN_FG' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zmcp_pin_fg" adtcore:name="ZMCP_PIN_FG"/>\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zmcp_pin_fg/source/main" adtcore:type="FUGR/I" adtcore:name="SAPLZMCP_PIN_FG"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateFunctionModule',
      variant: 'onprem',
      stand: 'recording',
      args: {
        function_module_name: 'Z_MCP_SHR_FM',
        function_group_name: 'ZMCP_SHR_FGRP',
      },
      answers: [FUNCTION_MODULE, ...ACTIVATED],
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
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm" adtcore:name="Z_MCP_SHR_FM"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateServiceDefinition',
      variant: 'onprem',
      stand: 'recording',
      args: { name: 'ZMCP_PIN_SRVD' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/srvd/sources/zmcp_pin_srvd" adtcore:name="ZMCP_PIN_SRVD"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateMetadataExtension',
      variant: 'onprem',
      stand: 'recording',
      args: { name: 'ZC_MCP_PIN_DDLX' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddlx/sources/zc_mcp_pin_ddlx" adtcore:name="ZC_MCP_PIN_DDLX"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateBehaviorDefinition',
      variant: 'onprem',
      stand: 'recording',
      args: { name: 'ZI_MCP_PIN_ROOT' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/zi_mcp_pin_root" adtcore:name="ZI_MCP_PIN_ROOT"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateProgram',
      variant: 'onprem',
      stand: 'recording',
      args: { program_name: 'ZMCP_PIN_PROG' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/zmcp_pin_prog" adtcore:name="ZMCP_PIN_PROG"/>\n</adtcore:objectReferences>',
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'ActivateDomain',
      variant: 'cloud',
      stand: 'recording',
      args: { domain_name: 'ZMCP_PIN_DOM' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/domains/zmcp_pin_dom" adtcore:name="ZMCP_PIN_DOM"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateTableType',
      variant: 'cloud',
      stand: 'recording',
      args: { table_type_name: 'ZMCP_PIN_TT' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/tabletypes/zmcp_pin_tt" adtcore:name="ZMCP_PIN_TT"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateTable',
      variant: 'cloud',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_TAB' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/tables/zmcp_pin_tab" adtcore:name="ZMCP_PIN_TAB"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateStructure',
      variant: 'cloud',
      stand: 'recording',
      args: { structure_name: 'ZMCP_PIN_STR' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/structures/zmcp_pin_str" adtcore:name="ZMCP_PIN_STR"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateDdl',
      variant: 'cloud',
      stand: 'recording',
      args: { ddl_name: 'ZI_MCP_PIN_DDL' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zi_mcp_pin_ddl" adtcore:name="ZI_MCP_PIN_DDL"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateInterface',
      variant: 'cloud',
      stand: 'recording',
      args: { interface_name: 'ZIF_MCP_PIN' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/interfaces/zif_mcp_pin" adtcore:name="ZIF_MCP_PIN"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateFunctionGroup',
      variant: 'cloud',
      stand: 'recording',
      args: { function_group_name: 'ZMCP_PIN_FG' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zmcp_pin_fg" adtcore:name="ZMCP_PIN_FG"/>\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zmcp_pin_fg/source/main" adtcore:type="FUGR/I" adtcore:name="SAPLZMCP_PIN_FG"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateFunctionModule',
      variant: 'cloud',
      stand: 'recording',
      args: {
        function_module_name: 'Z_MCP_SHR_FM',
        function_group_name: 'ZMCP_SHR_FGRP',
      },
      answers: [FUNCTION_MODULE, ...ACTIVATED],
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
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/functions/groups/zmcp_shr_fgrp/fmodules/z_mcp_shr_fm" adtcore:name="Z_MCP_SHR_FM"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateServiceDefinition',
      variant: 'cloud',
      stand: 'recording',
      args: { name: 'ZMCP_PIN_SRVD' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/srvd/sources/zmcp_pin_srvd" adtcore:name="ZMCP_PIN_SRVD"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateMetadataExtension',
      variant: 'cloud',
      stand: 'recording',
      args: { name: 'ZC_MCP_PIN_DDLX' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddlx/sources/zc_mcp_pin_ddlx" adtcore:name="ZC_MCP_PIN_DDLX"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'ActivateBehaviorDefinition',
      variant: 'cloud',
      stand: 'recording',
      args: { name: 'ZI_MCP_PIN_ROOT' },
      answers: ACTIVATED,
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/vnd.sap.adt.activation+xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/zi_mcp_pin_root" adtcore:name="ZI_MCP_PIN_ROOT"/>\n</adtcore:objectReferences>',
        },
      ],
    },
  ]);
});
