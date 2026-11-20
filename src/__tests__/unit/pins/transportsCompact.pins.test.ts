/**
 * The compact transport tools, pinned on each variant on
 * `recordingConnection` with real adt-clients code: HandlerTransportCreate
 * creates a workbench request for the responsible the system context
 * states (its target wrapped as SAP keeps a transport layer's), and
 * HandlerTransportMoveObjects and HandlerTransportSortAndCompress each send
 * their one request on a task. SAP's answers: the created request's number,
 * and the empty `200` both actions answer (measured on premise).
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe } from 'node:test';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { type McpResult, pinCases } from '../../helpers/pinCases';
import { setSystemContext } from '../../helpers/processSystemContext';

/** The answer's JSON, as the tool gave it. */
const answered = (result: McpResult): Record<string, unknown> => {
  const text = result.content.map((item) => item.text).join('');
  const start = text.indexOf('{');
  return JSON.parse(text.slice(start));
};

/** The answer names the task and the type it carries. */
const taskIs =
  (number: string | null, type: string | null) => (result: McpResult) => {
    const json = JSON.stringify(answered(result));
    assert.ok(json.includes(`"task_number":${JSON.stringify(number)}`));
    assert.ok(json.includes(`"task_type":${JSON.stringify(type)}`));
  };

/** A request is created for its owner: the responsible stated here. */
beforeEach(() => {
  setSystemContext({ responsible: 'PIN_RESPONSIBLE' });
});
afterEach(() => {
  resetSystemContextCache();
});

/** SAP's answer to a request create: the created request's number. */
const REQUEST_CREATED = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900001"/>',
};

/** The created request read back: the one task SAP created with it, Unclassified. */
const REQUEST_WITH_TASK = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="PINK900001"><tm:request tm:number="PINK900001" tm:type="K"><tm:task tm:number="PINK900002" tm:type="X"/></tm:request></tm:root>',
};

/**
 * The created request read back with no task. SAP's code rules this out on a
 * successful create (CL_CTS_ADT_RES_OBJ_RECORD, post → create_transport_request:
 * a failed task insert raises, so the POST fails); pinned as the answer the
 * tool gives all the same.
 */
const REQUEST_WITHOUT_TASK = {
  status: 200,
  data: '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="PINK900001"><tm:request tm:number="PINK900001" tm:type="K"/></tm:root>',
};

/** SAP's answer to an accepted user action: an empty `200`. */
const ACCEPTED = { status: 200, data: '' };

/** SAP refusing the type change, as an ADT exception. */
const TYPE_REFUSED = {
  status: 400,
  data: '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt.tm"/><type id="ADT_TM_COMMON_EXCEPTION"/><message lang="EN">You can only change the type of tasks in workbench requests</message></exc:exception>',
};

describe('onprem', () => {
  pinCases([
    {
      tool: 'HandlerTransportCreate',
      variant: 'onprem',
      stand: 'recording',
      args: { description: 'Pin request', target_system: 'PIN' },
      answers: [REQUEST_CREATED, REQUEST_WITH_TASK, ACCEPTED],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="/PIN/" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/cts/transportrequests/PINK900002',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900002" tm:useraction="changetasktype"><tm:task tm:number="PINK900002" tm:type="S"/></tm:root>',
        },
      ],
      ran: taskIs('PINK900002', 'S'),
    },
    {
      tool: 'HandlerTransportCreate',
      variant: 'onprem',
      stand: 'recording',
      args: { description: 'Pin request', task_type: 'X' },
      answers: [REQUEST_CREATED, REQUEST_WITH_TASK],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="LOCAL" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
      ran: taskIs('PINK900002', 'X'),
    },
    {
      tool: 'HandlerTransportCreate',
      variant: 'onprem',
      stand: 'recording',
      args: { description: 'Pin request' },
      answers: [REQUEST_CREATED, REQUEST_WITHOUT_TASK],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="LOCAL" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
      ran: taskIs(null, null),
    },
    {
      tool: 'HandlerTransportCreate',
      variant: 'onprem',
      stand: 'recording',
      args: { description: 'Pin request', task_type: 'R' },
      answers: [REQUEST_CREATED, REQUEST_WITH_TASK, TYPE_REFUSED],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="LOCAL" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/cts/transportrequests/PINK900002',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900002" tm:useraction="changetasktype"><tm:task tm:number="PINK900002" tm:type="R"/></tm:root>',
        },
      ],
      ran: (result) => {
        taskIs('PINK900002', 'X')(result);
        assert.ok(
          JSON.stringify(answered(result)).includes(
            'You can only change the type of tasks in workbench requests',
          ),
        );
      },
    },
    {
      tool: 'HandlerTransportMoveObjects',
      variant: 'onprem',
      stand: 'recording',
      args: {
        transport_number: 'PINK900002',
        target_number: 'PINK900004',
        objects: [
          {
            object_name: 'ZIF_MCP_PIN',
            object_type: 'INTF',
            position: '000001',
          },
        ],
      },
      answers: [{ status: 200, data: '' }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests/PINK900002/moveobjects',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900004" tm:useraction="moveobjects">\n  <tm:request>\n    <tm:abap_object tm:pgmid="R3TR" tm:type="INTF" tm:name="ZIF_MCP_PIN" tm:position="000001"/>\n  </tm:request>\n</tm:root>',
        },
      ],
    },
    {
      tool: 'HandlerTransportSortAndCompress',
      variant: 'onprem',
      stand: 'recording',
      args: { transport_number: 'PINK900004' },
      answers: [{ status: 200, data: '' }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests/PINK900004/sortandcompress',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
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
      tool: 'HandlerTransportCreate',
      variant: 'cloud',
      stand: 'recording',
      args: { description: 'Pin request', target_system: 'PIN' },
      answers: [REQUEST_CREATED, REQUEST_WITH_TASK, ACCEPTED],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="/PIN/" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/cts/transportrequests/PINK900002',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900002" tm:useraction="changetasktype"><tm:task tm:number="PINK900002" tm:type="S"/></tm:root>',
        },
      ],
      ran: taskIs('PINK900002', 'S'),
    },
    {
      tool: 'HandlerTransportCreate',
      variant: 'cloud',
      stand: 'recording',
      args: { description: 'Pin request', task_type: 'X' },
      answers: [REQUEST_CREATED, REQUEST_WITH_TASK],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="LOCAL" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
      ran: taskIs('PINK900002', 'X'),
    },
    {
      tool: 'HandlerTransportCreate',
      variant: 'cloud',
      stand: 'recording',
      args: { description: 'Pin request' },
      answers: [REQUEST_CREATED, REQUEST_WITHOUT_TASK],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="LOCAL" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
      ran: taskIs(null, null),
    },
    {
      tool: 'HandlerTransportCreate',
      variant: 'cloud',
      stand: 'recording',
      args: { description: 'Pin request', task_type: 'R' },
      answers: [REQUEST_CREATED, REQUEST_WITH_TASK, TYPE_REFUSED],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="K" tm:target="LOCAL" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/cts/transportrequests/PINK900001',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/cts/transportrequests/PINK900002',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900002" tm:useraction="changetasktype"><tm:task tm:number="PINK900002" tm:type="R"/></tm:root>',
        },
      ],
      ran: (result) => {
        taskIs('PINK900002', 'X')(result);
        assert.ok(
          JSON.stringify(answered(result)).includes(
            'You can only change the type of tasks in workbench requests',
          ),
        );
      },
    },
    {
      tool: 'HandlerTransportMoveObjects',
      variant: 'cloud',
      stand: 'recording',
      args: {
        transport_number: 'PINK900002',
        target_number: 'PINK900004',
        objects: [
          {
            object_name: 'ZIF_MCP_PIN',
            object_type: 'INTF',
            position: '000001',
          },
        ],
      },
      answers: [{ status: 200, data: '' }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests/PINK900002/moveobjects',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Content-Type': 'text/plain',
          },
          body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900004" tm:useraction="moveobjects">\n  <tm:request>\n    <tm:abap_object tm:pgmid="R3TR" tm:type="INTF" tm:name="ZIF_MCP_PIN" tm:position="000001"/>\n  </tm:request>\n</tm:root>',
        },
      ],
    },
    {
      tool: 'HandlerTransportSortAndCompress',
      variant: 'cloud',
      stand: 'recording',
      args: { transport_number: 'PINK900004' },
      answers: [{ status: 200, data: '' }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/cts/transportrequests/PINK900004/sortandcompress',
          headers: {
            Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          },
          body: undefined,
        },
      ],
    },
  ]);
});
