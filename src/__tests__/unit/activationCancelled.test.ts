/**
 * A group activation SAP cancelled is not answered as activated (#329, S9
 * D3, measured on S/4HANA 2026-10-31: `ActivateObjects` of a `VIEW/DV`
 * answered `activated: true` over SAP's W "Activation was cancelled." and
 * `activationExecuted="false"`). The verdict is SAP's own: the results'
 * `chkl:properties activationExecuted` and the messages' severity — never a
 * message's words.
 *
 * The results documents below are shaped like the corpus' checklist answers
 * (`refusal-activation-fails--01-activation`, `activation-success-verdict`):
 * a `chkl:properties` element and `msg` children; the cancelled one carries
 * the words and type measured on S/4HANA. Each case runs the tool's own
 * handler over a recording connection — real adt-clients code, no SAP:
 * the run start (`202`, the run id in `Location`), the run's status, its
 * results.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { buildObjectUri } from '@mcp-abap-adt/adt-clients/core';
import { handleHandlerActivate } from '../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleActivateObjects as handleActivateObjectsOf } from '../../handlers/common/high/handleActivateObjects';
import { handleActivateObject as handleActivateObjectOf } from '../../handlers/common/low/handleActivateObject';
import { handleGetActivationResults } from '../../handlers/common/readonly/handleGetActivationRun';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import {
  activationExecutedOf,
  activationMessagesOf,
  runStatusOf,
} from '../../lib/strategies/activationRun';
import type { AdtReading } from '../../lib/strategies/reading';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

/** handleActivateObjects at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleActivateObjects = (
  context: Parameters<typeof handleActivateObjectsOf>[0],
  args: Parameters<typeof handleActivateObjectsOf>[1],
) => handleActivateObjectsOf(context, { detail: 'full', ...args });

/** handleActivateObject at `detail: 'full'`, the answer these cases compare (terse answers, step 3). */
const handleActivateObject = (
  context: Parameters<typeof handleActivateObjectOf>[0],
  args: Parameters<typeof handleActivateObjectOf>[1],
) => handleActivateObjectOf(context, { detail: 'full', ...args });

/** A run document kept as text: the reading a set that keeps it answers. */
function kept(raw: string): AdtReading<string> {
  return { value: raw, raw, status: 200 };
}

const CHECKLIST = 'xmlns:chkl="http://www.sap.com/abapxml/checklist"';

/** SAP cancelled the activation: W "Activation was cancelled.", activationExecuted="false". */
const CANCELLED =
  `<?xml version="1.0" encoding="utf-8"?><chkl:messages ${CHECKLIST}>` +
  '<chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/>' +
  '<msg objDescr="View ZMCPV" type="W" objName="ZMCPV"><shortText><txt>Activation was cancelled.</txt></shortText></msg>' +
  '</chkl:messages>';

/** Nothing to activate: activationExecuted="false" and no message. */
const NOTHING =
  `<?xml version="1.0" encoding="utf-8"?><chkl:messages ${CHECKLIST}>` +
  '<chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/>' +
  '</chkl:messages>';

/** Activated, with a warning beside it. */
const ACTIVATED =
  `<?xml version="1.0" encoding="utf-8"?><chkl:messages ${CHECKLIST}>` +
  '<chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/>' +
  '<msg type="W" objName="ZMCPV"><shortText><txt>A warning beside the activation.</txt></shortText></msg>' +
  '</chkl:messages>';

/** Refused: an error-severity message on one object of the run. */
const REFUSED =
  `<?xml version="1.0" encoding="utf-8"?><chkl:messages ${CHECKLIST}>` +
  '<chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/>' +
  '<msg objDescr="View ZMCPW" type="E" objName="ZMCPW"><shortText><txt>View ZMCPW refers to a field that does not exist.</txt></shortText></msg>' +
  '<msg objDescr="View ZMCPV" type="W" objName="ZMCPV"><shortText><txt>Activation was cancelled.</txt></shortText></msg>' +
  '</chkl:messages>';

const RUN_ID = 'RUN0001';

/**
 * The answers of a finished run: its start, its status, its results — and,
 * read only after results that say no activation ran and give no message,
 * the inactive list (S/4HANA 2025's, empty: nothing left inactive).
 */
function finishedRun(results: string) {
  return recordingConnection([
    {
      status: 202,
      headers: { location: `/sap/bc/adt/activation/runs/${RUN_ID}` },
    },
    {
      data: `<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>`,
    },
    { data: results },
    {
      data: corpusBody(
        'activation-reactivate-active-s4-2025--04-inactiveobjects',
      ),
    },
  ]);
}

/** The results alone, as `HandlerGet part=activation_results` reads them. */
function resultsOnly(results: string) {
  return recordingConnection([{ data: results }]);
}

type Answered = {
  isError?: boolean;
  content?: readonly { text?: string }[];
};

/** The JSON payload a tool answered. */
function payloadOf(answered: Answered): Record<string, unknown> {
  const [first] = answered.content ?? [];
  const parsed: unknown = JSON.parse(first?.text ?? 'null');
  if (parsed === null || typeof parsed !== 'object')
    throw new Error('no payload');
  return Object.fromEntries(Object.entries(parsed));
}

type Activate = (context: HandlerContext) => Promise<Answered>;

const OBJECTS = [
  { name: 'ZMCPV', type: 'VIEW/DV' },
  { name: 'ZMCPW', type: 'VIEW/DV' },
];

/**
 * The full forms: a group activation, waited for and answered with its
 * verdict — and the names it sends, whose messages carry the object's uri.
 */
const FULL_FORMS: readonly (readonly [string, Activate, readonly string[]])[] =
  [
    [
      'ActivateObjects',
      (context) => handleActivateObjects(context, { objects: OBJECTS }),
      ['ZMCPV', 'ZMCPW'],
    ],
    [
      'ActivateObjectLow',
      (context) => handleActivateObject(context, { objects: OBJECTS }),
      ['ZMCPV', 'ZMCPW'],
    ],
    [
      'ActivateObjectLow, one object of a group-only code',
      (context) =>
        handleActivateObject(context, {
          objects: [{ name: 'ZMCPV', type: 'VIEW/DV' }],
        }),
      ['ZMCPV'],
    ],
  ];

/**
 * A message about the view `name`, as answered: its `objDescr` as `object`,
 * and the sent object's uri beside its name where the form sent it
 * (`activationMessagesOf` resolves the message's `objName` to it), the name
 * alone where it did not.
 */
function aboutView(
  message: { type: string; text: string },
  name: string,
  sent: readonly string[],
) {
  const described = { ...message, object: `View ${name}` };
  return sent.includes(name)
    ? { ...described, uri: buildObjectUri(name, 'VIEW/DV'), objectName: name }
    : { ...described, objectName: name };
}

describe('activation answers follow SAP’s verdict', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });

  afterEach(() => {
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  async function full(
    activate: Activate,
    results: string,
    isError: boolean = false,
  ) {
    const connection = finishedRun(results);
    declareSystemKind(connection, 'onprem');
    const answered = await activate({ connection });
    assert.equal(answered.isError, isError);
    const urls = connection.requests.map((request) => request.url);
    assert.equal(
      urls.some((url) => url.includes('/activation/runs')),
      true,
    );
    assert.ok(urls.includes(`/sap/bc/adt/activation/results/${RUN_ID}`));
    // The inactive list follows only results that say no activation ran
    // and give no message.
    assert.ok(
      urls
        .at(-1)
        ?.includes(
          results === NOTHING
            ? '/sap/bc/adt/activation/inactiveobjects'
            : `/activation/results/${RUN_ID}`,
        ),
    );
    return payloadOf(answered);
  }

  for (const [_form, activate, sent] of FULL_FORMS) {
    it(
      format(
        '%s: a run SAP cancelled is not activated, and its messages are returned',
        _form,
      ),
      async () => {
        const payload = await full(activate, CANCELLED);
        assert.equal(payload.run_status, 'finished');
        assert.equal(payload.activated, false);
        assert.deepStrictEqual(payload.messages, [
          aboutView(
            { type: 'W', text: 'Activation was cancelled.' },
            'ZMCPV',
            sent,
          ),
        ]);
        assert.equal(payload.nothing_to_activate, undefined);
        assert.ok(
          typeof payload.message === 'string' &&
            payload.message.includes('activationExecuted="false"'),
        );
        assert.ok(
          typeof payload.message === 'string' &&
            payload.message.includes('Activation was cancelled.'),
        );
      },
    );
  }

  for (const [_form, activate, sent] of FULL_FORMS) {
    it(
      format(
        '%s: a run with an error-severity message is an error, naming the refusal, its messages returned',
        _form,
      ),
      async () => {
        const payload = await full(activate, REFUSED, true);
        assert.equal(payload.origin, 'refusal');
        assert.ok(
          typeof payload.message === 'string' &&
            payload.message.includes(
              `Activation run ${RUN_ID} finished and refused 1 of `,
            ),
        );
        assert.ok(
          typeof payload.message === 'string' &&
            payload.message.includes(
              'ZMCPW: View ZMCPW refers to a field that does not exist.',
            ),
        );
        assert.deepStrictEqual(payload.messages, [
          aboutView(
            {
              type: 'E',
              text: 'View ZMCPW refers to a field that does not exist.',
            },
            'ZMCPW',
            sent,
          ),
          aboutView(
            { type: 'W', text: 'Activation was cancelled.' },
            'ZMCPV',
            sent,
          ),
        ]);
        assert.equal(payload.activated, undefined);
      },
    );
  }

  for (const [_form, activate] of FULL_FORMS) {
    it(
      format('%s: nothing to activate is not activated, and says so', _form),
      async () => {
        const payload = await full(activate, NOTHING);
        assert.equal(payload.activated, false);
        assert.equal(payload.nothing_to_activate, true);
        assert.deepStrictEqual(payload.messages, []);
      },
    );
  }

  for (const [_form, activate] of FULL_FORMS) {
    it(
      format(
        '%s: activationExecuted="true" with a warning is activated',
        _form,
      ),
      async () => {
        const payload = await full(activate, ACTIVATED);
        assert.equal(payload.activated, true);
        assert.equal(payload.nothing_to_activate, undefined);
      },
    );
  }

  it('HandlerActivate (compact, group form) starts the run and answers its id alone', async () => {
    const connection = finishedRun(CANCELLED);
    declareSystemKind(connection, 'onprem');
    const payload = payloadOf(
      await handleHandlerActivate({ connection }, { objects: OBJECTS }),
    );
    assert.deepStrictEqual(payload, { run_id: RUN_ID });
    assert.equal(connection.requests.length, 1);
  });

  for (const [_case, results, activated, nothing, messages] of [
    ['a run SAP cancelled', CANCELLED, false, undefined, 1],
    ['nothing to activate', NOTHING, false, true, 0],
    ['an activation with a warning', ACTIVATED, true, undefined, 1],
    [
      'results stating no verdict',
      `<chkl:messages ${CHECKLIST}/>`,
      null,
      undefined,
      0,
    ],
  ] as const) {
    it(
      format(
        'HandlerGet part=activation_results (compact, run form), %s: activated is %s',
        _case,
        results,
      ),
      async () => {
        const connection = resultsOnly(results);
        declareSystemKind(connection, 'onprem');
        const payload = payloadOf(
          await handleGetActivationResults({ connection }, { run_id: RUN_ID }),
        );
        assert.equal(payload.activated, activated);
        assert.equal(payload.nothing_to_activate, nothing);
        assert.ok(Array.isArray(payload.messages));
        assert.equal(payload.messages.length, messages);
        assert.equal(payload.document, results);
      },
    );
  }

  for (const [document, executed] of [
    [CANCELLED, false],
    [NOTHING, false],
    [ACTIVATED, true],
    [`<chkl:messages ${CHECKLIST}/>`, undefined],
    ['', undefined],
  ] as const) {
    it(
      format(
        'a results document kept as text states its verdict: %s → %s',
        document,
        executed,
      ),
      () => {
        assert.equal(activationExecutedOf(kept(document)), executed);
        assert.equal(
          activationExecutedOf({
            value: undefined,
            raw: document,
            status: 200,
          }),
          executed,
        );
      },
    );
  }

  for (const [stated, executed] of [
    ['false', false],
    ['true', true],
  ] as const) {
    it(
      format(
        'a parsed results document states its verdict: activationExecuted="%s"',
        stated,
      ),
      () => {
        const parsed = {
          'chkl:messages': {
            'chkl:properties': { '@': { activationExecuted: stated } },
          },
        };
        assert.equal(
          activationExecutedOf({ value: parsed, raw: '', status: 200 }),
          executed,
        );
      },
    );
  }
});

/**
 * The run's documents kept as text are read through the XML parser, as the
 * structured reading reads them: the corpus answers read as they read today,
 * and what the text search missed — an apostrophe-quoted attribute, an entity,
 * CDATA — reads as XML says.
 */
describe('a run document kept as text, read through the XML parser', () => {
  const FAILED = corpusBody('refusal-activation-fails--01-activation');

  it('the recorded refusal: its message, type and words — tests/fixtures/adt/refusal-activation-fails--01-activation.body.xml', () => {
    assert.deepStrictEqual(activationMessagesOf(kept(FAILED), []), [
      {
        type: 'E',
        text: 'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
        object: 'Class ZMCP_BLD_ANSCH01, Method SAY_HELLO',
        source_uri: '/sap/bc/adt/oo/classes/zmcp_bld_ansch01/source/main',
        position: { line: 15, column: 24, end: { line: 15, column: 50 } },
        code: 'MESSAGE(GTH)',
      },
    ]);
    assert.equal(activationExecutedOf(kept(FAILED)), false);
  });

  it('the recorded success: no messages, activation executed — tests/fixtures/adt/activation-success-verdict--01-activation.body.xml', () => {
    const success = corpusBody('activation-success-verdict--01-activation');
    assert.deepStrictEqual(activationMessagesOf(kept(success), []), []);
    assert.equal(activationExecutedOf(kept(success)), true);
  });

  it('a run status as the run answers it', () => {
    assert.equal(
      runStatusOf(
        kept(
          '<?xml version="1.0" encoding="utf-8"?><runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status="finished"/>',
        ),
      ),
      'finished',
    );
  });

  it('a run status quoted with apostrophes', () => {
    assert.equal(
      runStatusOf(
        kept(
          '<runs:run xmlns:runs="http://www.sap.com/adt/activation/runs" runs:status=\'finished\'/>',
        ),
      ),
      'finished',
    );
  });

  it("a message's words with an entity and its object quoted with apostrophes", () => {
    const document =
      `<chkl:messages ${CHECKLIST}><msg type='E' objName='ZMCP_X'>` +
      '<shortText><txt>A &lt; B</txt></shortText></msg></chkl:messages>';
    assert.deepStrictEqual(activationMessagesOf(kept(document), []), [
      { type: 'E', text: 'A < B', objectName: 'ZMCP_X' },
    ]);
  });

  it('activationExecuted quoted with apostrophes', () => {
    assert.equal(
      activationExecutedOf(
        kept(
          `<chkl:messages ${CHECKLIST}><chkl:properties activationExecuted='false'/></chkl:messages>`,
        ),
      ),
      false,
    );
  });
});
