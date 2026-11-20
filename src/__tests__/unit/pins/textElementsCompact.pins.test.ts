/**
 * HandlerActivate's text elements members, pinned on each variant on
 * `recordingConnection`: a group activation of the one reference, the run
 * answered finished with an activated checklist.
 */

import { describe } from 'node:test';
import { pinCases } from '../../helpers/pinCases';

const RUN = '/sap/bc/adt/activation/runs/RUN0001';
const ACTIVATED =
  '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/></chkl:messages>';

/** The run's start, its status and its results. */
const runAnswers = () => [
  { status: 202, headers: { location: RUN } },
  {
    status: 200,
    data: '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
  },
  { status: 200, data: ACTIVATED },
];

describe('onprem', () => {
  pinCases([
    {
      tool: 'HandlerActivate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TP',
      },
      answers: runAnswers(),
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/textelements/programs/zmcp_pin_tp" adtcore:type="PROG/PX" adtcore:name="ZMCP_PIN_TP"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'HandlerActivate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TG',
      },
      answers: runAnswers(),
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg" adtcore:type="PROG/PX" adtcore:name="ZMCP_PIN_TG"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'HandlerActivate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: 'ZCL_MCP_PIN_TC',
      },
      answers: runAnswers(),
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc" adtcore:type="CLAS/OCX" adtcore:name="ZCL_MCP_PIN_TC"/>\n</adtcore:objectReferences>',
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'HandlerActivate',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TP',
      },
      answers: runAnswers(),
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/textelements/programs/zmcp_pin_tp" adtcore:type="PROG/PX" adtcore:name="ZMCP_PIN_TP"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'HandlerActivate',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TG',
      },
      answers: runAnswers(),
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg" adtcore:type="PROG/PX" adtcore:name="ZMCP_PIN_TG"/>\n</adtcore:objectReferences>',
        },
      ],
    },
    {
      tool: 'HandlerActivate',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: 'ZCL_MCP_PIN_TC',
      },
      answers: runAnswers(),
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/activation/runs?method=activate&preauditRequested=true',
          headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/xml',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n  <adtcore:objectReference adtcore:uri="/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc" adtcore:type="CLAS/OCX" adtcore:name="ZCL_MCP_PIN_TC"/>\n</adtcore:objectReferences>',
        },
      ],
    },
  ]);
});
