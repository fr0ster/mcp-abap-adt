/**
 * The requests adt-clients 43.0.0 changed, pinned by literal (plan D2,
 * step 6), on `recordingConnection` with real adt-clients code:
 *
 * - `HandlerValidate` without a description sends no `description` (#22),
 *   and a function module's validation, which SAP answers `400` without
 *   one (measured), is refused before anything is sent;
 * - `CheckTable` with `ddl_code` checks that source (#9);
 * - `CreateTransport` `customizing` is a Customizing Request (`W`),
 *   `workbench` a Workbench Request (`K`);
 * - `RuntimeGetProfilerTraceData` `statements` sends the drill-down
 *   threshold as given (`0.1`, not `0`).
 *
 * Run through `runPinCase` inside its own `it`: these keys have no ledger
 * row yet — their family tasks (C3–C16) add the row with its live case.
 */

import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { corpusBody } from '../../helpers/adtCorpus';
import { type PinCase, pinKey, runPinCase } from '../../helpers/pinCases';

/** A request is created for its owner: the responsible stated here. */
beforeEach(() => {
  setSystemContext({ responsible: 'PIN_RESPONSIBLE' });
});
afterEach(() => {
  resetSystemContextCache();
});

/** SAP's answer to a validation of a free name: a real corpus document. */
const NAME_FREE = [
  {
    status: 200,
    data: corpusBody('validation-name-free-class--01-validation-objectname'),
  },
];

/** SAP's answer to a check that found nothing: a real corpus document. */
const CHECKED = [
  { status: 200, data: corpusBody('check-success-verdict--01-checkrun') },
];

/** SAP's answer to a request create: the created request's number. */
const REQUEST_CREATED = [
  {
    status: 200,
    data: '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="PINK900001"/>',
  },
];

const CASES: readonly PinCase[] = [
  {
    tool: 'HandlerValidate',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'DOMAIN',
      object_name: 'ZPIN_DOMA',
      package_name: 'ZPIN_PKG',
    },
    answers: NAME_FREE,
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/ddic/domains/validation?objtype=doma&objname=ZPIN_DOMA&packagename=ZPIN_PKG',
        headers: { Accept: 'application/vnd.sap.as+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerValidate',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'DATA_ELEMENT',
      object_name: 'ZPIN_DTEL',
      package_name: 'ZPIN_PKG',
    },
    answers: NAME_FREE,
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/ddic/dataelements/validation?objtype=dtel&objname=ZPIN_DTEL&packagename=ZPIN_PKG',
        headers: { Accept: 'application/vnd.sap.as+xml' },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerValidate',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_MODULE',
      object_name: 'ZPIN_FUGR|ZPIN_FM',
      description: 'Pin module',
    },
    answers: NAME_FREE,
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/functions/validation?objtype=FUGR%2FFF&objname=ZPIN_FM&fugrname=ZPIN_FUGR&description=Pin+module',
        headers: {
          Accept:
            'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage',
        },
        body: undefined,
      },
    ],
  },
  {
    tool: 'HandlerValidate',
    variant: 'onprem',
    stand: 'recording',
    args: {
      object_type: 'FUNCTION_MODULE',
      object_name: 'ZPIN_FUGR|ZPIN_FM',
    },
    answers: NAME_FREE,
    refusal: 'answer',
    expected: 'none',
    ran: (answer) => {
      expect(answer.content[0]?.text).toContain('description');
    },
  },
  {
    tool: 'CheckTable',
    variant: 'onprem',
    stand: 'recording',
    args: {
      table_name: 'ZPIN_TABL',
      ddl_code: 'define table zpin_tabl { key client : abap.clnt not null; }',
    },
    answers: CHECKED,
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/checkruns?reporters=abapCheckRun',
        headers: {
          Accept: 'application/vnd.sap.adt.checkmessages+xml',
          'Content-Type': 'application/vnd.sap.adt.checkobjects+xml',
        },
        body: '<?xml version="1.0" encoding="UTF-8"?>\n<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">\n  <chkrun:checkObject adtcore:uri="/sap/bc/adt/ddic/tables/zpin_tabl" chkrun:version="active">\n    <chkrun:artifacts>\n      <chkrun:artifact chkrun:contentType="text/plain; charset=utf-8" chkrun:uri="/sap/bc/adt/ddic/tables/zpin_tabl/source/main">\n        <chkrun:content>ZGVmaW5lIHRhYmxlIHpwaW5fdGFibCB7IGtleSBjbGllbnQgOiBhYmFwLmNsbnQgbm90IG51bGw7IH0=</chkrun:content>\n      </chkrun:artifact>\n    </chkrun:artifacts>\n  </chkrun:checkObject>\n</chkrun:checkObjectList>',
      },
    ],
  },
  {
    tool: 'CreateTransport',
    variant: 'onprem',
    stand: 'recording',
    args: { description: 'Pin request', transport_type: 'customizing' },
    answers: REQUEST_CREATED,
    expected: [
      {
        method: 'POST',
        url: '/sap/bc/adt/cts/transportrequests',
        headers: {
          Accept: 'application/vnd.sap.adt.transportorganizer.v1+xml',
          'Content-Type': 'text/plain',
        },
        body: '<?xml version="1.0" encoding="ASCII"?>\n<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">\n  <tm:request tm:desc="Pin request" tm:type="W" tm:target="LOCAL" tm:cts_project="">\n    <tm:task tm:owner="PIN_RESPONSIBLE"/>\n  </tm:request>\n</tm:root>',
      },
    ],
  },
  {
    tool: 'CreateTransport',
    variant: 'onprem',
    stand: 'recording',
    args: { description: 'Pin request', transport_type: 'workbench' },
    answers: REQUEST_CREATED,
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
    ],
  },
  {
    tool: 'RuntimeGetProfilerTraceData',
    variant: 'onprem',
    stand: 'recording',
    args: {
      trace_id_or_uri: 'PINTRACE',
      view: 'statements',
      auto_drill_down_threshold: 0.1,
    },
    expected: [
      {
        method: 'GET',
        url: '/sap/bc/adt/runtime/traces/abaptraces/PINTRACE/statements?autoDrillDownThreshold=0.1',
        headers: {
          Accept:
            'application/vnd.sap.adt.runtime.traces.abaptraces.aggcalltree+xml, application/xml',
        },
        body: undefined,
      },
    ],
  },
];

describe('the requests adt-clients 43 changed', () => {
  for (const c of CASES) {
    it(`${pinKey(c)} (${c.variant}) ${JSON.stringify(c.args)}`, async () => {
      await runPinCase(c);
    });
  }
});
