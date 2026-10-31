/**
 * The service-binding validation's verdict is the CTS transport check's own
 * `RESULT` (#329, D4). `ValidateServiceBinding`, compact `HandlerValidate`
 * (`SERVICE_BINDING`) and compact `HandlerServiceBindingValidate` all post
 * `/sap/bc/adt/cts/transportchecks`; SAP answers a `checkData` document whose
 * verdict is `DATA/RESULT` and whose messages are `DATA/MESSAGES/CTS_MESSAGE`.
 *
 * The answers below are shaped after recordings of that endpoint, names
 * replaced by placeholders: `S` with `<MESSAGES/>` as ABAP Cloud answered a
 * free binding name (2026-10-31), and `E` with one `CTS_MESSAGE` (`SEVERITY`,
 * `TEXT`, message `TO 140`) as an on-premise system answered an object that
 * cannot go to the package. `W` and an absent `RESULT` have no recording:
 * they are answered as SAP sent them, as `result`, with no verdict.
 *
 * Real adt-clients over a recording connection; no SAP.
 */

import {
  TOOL_DEFINITION as HandlerServiceBindingValidate_Tool,
  handleHandlerServiceBindingValidate,
} from '../../../compact-readonly-entries/src/handlers/handleHandlerServiceBindingValidate';
import { handleHandlerValidate } from '../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import { handleValidateServiceBinding } from '../../handlers/service_binding/high/handleValidateServiceBinding';
import { declareSystemKind } from '../../lib/systemKind';
import {
  type RecordingConnection,
  recordingConnection,
} from '../helpers/recordingConnection';

function checkData(result: string | undefined, messages: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA>' +
    '<PGMID>R3TR</PGMID><OBJECT>SRVB</OBJECT><OBJECTNAME>ZSRVB_A</OBJECTNAME><OPERATION>I</OPERATION>' +
    '<DEVCLASS>ZPKG_A</DEVCLASS><CTEXT/><KORRFLAG/><AS4USER>SAPUSER01</AS4USER><PDEVCLASS/>' +
    '<DLVUNIT>LOCAL</DLVUNIT><NAMESPACE>/*/</NAMESPACE>' +
    (result === undefined ? '' : `<RESULT>${result}</RESULT>`) +
    `<RECORDING/><EXISTING_REQ_ONLY/>${messages}<REQUESTS/><LOCKS/><TADIRDEVC>ZPKG_A</TADIRDEVC>` +
    '</DATA></asx:values></asx:abap>'
  );
}

function ctsMessage(severity: string, text: string): string {
  return (
    `<CTS_MESSAGE><SEVERITY>${severity}</SEVERITY><SPRSL>E</SPRSL><ARBGB>TO</ARBGB><MSGNR>140</MSGNR>` +
    '<VARIABLES><CTS_VARIABLE><VARIABLE>SRVB</VARIABLE></CTS_VARIABLE></VARIABLES>' +
    `<TEXT>${text}</TEXT></CTS_MESSAGE>`
  );
}

const REFUSED_TEXT = 'Object SRVB ZSRVB_A cannot be assigned to package ZPKG_A';

interface Case {
  readonly name: string;
  readonly body: string;
  readonly answer: Record<string, unknown>;
}

const CASES: readonly Case[] = [
  {
    name: 'RESULT S with no messages is admissible',
    body: checkData('S', '<MESSAGES/>'),
    answer: { admissible: true },
  },
  {
    name: 'RESULT S carries the messages SAP sent beside it',
    body: checkData(
      'S',
      `<MESSAGES>${ctsMessage('W', 'A warning of the check')}</MESSAGES>`,
    ),
    answer: {
      admissible: true,
      messages: [{ type: 'W', text: 'A warning of the check' }],
    },
  },
  {
    name: 'RESULT E is not admissible, with its CTS_MESSAGE',
    body: checkData(
      'E',
      `<MESSAGES>${ctsMessage('E', REFUSED_TEXT)}</MESSAGES>`,
    ),
    answer: {
      admissible: false,
      messages: [{ type: 'E', text: REFUSED_TEXT }],
    },
  },
  {
    name: 'RESULT E with two messages answers both, in order',
    body: checkData(
      'E',
      `<MESSAGES>${ctsMessage('E', REFUSED_TEXT)}${ctsMessage('W', 'Second')}</MESSAGES>`,
    ),
    answer: {
      admissible: false,
      messages: [
        { type: 'E', text: REFUSED_TEXT },
        { type: 'W', text: 'Second' },
      ],
    },
  },
  {
    name: 'an unrecorded RESULT is answered as sent, with no verdict',
    body: checkData(
      'W',
      `<MESSAGES>${ctsMessage('W', 'A warning of the check')}</MESSAGES>`,
    ),
    answer: {
      result: 'W',
      messages: [{ type: 'W', text: 'A warning of the check' }],
    },
  },
  {
    name: 'an absent RESULT is answered as an empty result, with no verdict',
    body: checkData(undefined, '<MESSAGES/>'),
    answer: { result: '' },
  },
];

interface Tool {
  readonly name: string;
  readonly call: (connection: RecordingConnection) => Promise<unknown>;
}

const TOOLS: readonly Tool[] = [
  {
    name: 'ValidateServiceBinding',
    call: (connection) =>
      handleValidateServiceBinding(
        { connection },
        {
          service_binding_name: 'zsrvb_a',
          service_definition_name: 'ZSRVD_A',
          package_name: 'zpkg_a',
        },
      ),
  },
  {
    name: 'HandlerValidate SERVICE_BINDING',
    call: (connection) =>
      handleHandlerValidate(
        { connection },
        {
          object_type: 'SERVICE_BINDING',
          object_name: 'zsrvb_a',
          service_definition_name: 'ZSRVD_A',
          package_name: 'zpkg_a',
        },
      ),
  },
  {
    name: 'HandlerServiceBindingValidate',
    call: (connection) =>
      handleHandlerServiceBindingValidate(
        { connection },
        {
          service_binding_name: 'zsrvb_a',
          service_definition_name: 'ZSRVD_A',
          package_name: 'zpkg_a',
        },
      ),
  },
];

interface Answered {
  readonly isError?: boolean;
  readonly content: ReadonlyArray<{ readonly text: string }>;
}

function isAnswered(value: unknown): value is Answered {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    Array.isArray(value.content)
  );
}

describe.each(['onprem', 'cloud'] as const)('on %s', (variant) => {
  describe.each(TOOLS)('$name', (tool) => {
    it.each(CASES)('$name', async ({ body, answer }) => {
      const connection = recordingConnection([{ data: body }]);
      declareSystemKind(connection, variant);
      const answered = await tool.call(connection);
      expect(connection.requests).toHaveLength(1);
      expect(connection.requests[0]?.method).toBe('POST');
      expect(connection.requests[0]?.url).toBe(
        '/sap/bc/adt/cts/transportchecks',
      );
      if (!isAnswered(answered)) throw new Error('no MCP answer');
      expect(answered.isError).toBe(false);
      expect(JSON.parse(answered.content[0]?.text ?? '')).toEqual(answer);
    });
  });
});

describe("HandlerServiceBindingValidate states package_name, the binding's package, as required", () => {
  it('lists package_name among the required arguments in the description', () => {
    expect(HandlerServiceBindingValidate_Tool.description).toContain(
      "Required: service_binding_name*, service_definition_name*, package_name* (the binding's package).",
    );
  });

  it('refuses a call without package_name before anything is sent', async () => {
    const connection = recordingConnection([]);
    const result = await handleHandlerServiceBindingValidate(
      { connection },
      fromClient(
        '{"service_binding_name":"zsrvb_a","service_definition_name":"zsrvd_a"}',
      ),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('package_name is required');
    expect(connection.requests).toEqual([]);
  });
});

/** Arguments as a client sends them: parsed JSON, outside the type system. */
function fromClient(json: string) {
  return JSON.parse(json);
}
