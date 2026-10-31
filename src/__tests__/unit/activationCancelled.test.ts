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
import { handleHandlerActivate } from '../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import { handleGetActivationResults } from '../../handlers/common/readonly/handleGetActivationRun';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import { activationExecutedOf } from '../../lib/strategies/activationRun';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

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

const RUN_ID = 'RUN0001';

/** The three answers of a finished run: its start, its status, its results. */
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
  ]);
}

/** The results alone, as `HandlerGet part=activation_results` reads them. */
function resultsOnly(results: string) {
  return recordingConnection([{ data: results }]);
}

type Answered = { content?: readonly { text?: string }[] };

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

/** The full forms: a group activation, waited for and answered with its verdict. */
const FULL_FORMS: readonly (readonly [string, Activate])[] = [
  [
    'ActivateObjects',
    (context) => handleActivateObjects(context, { objects: OBJECTS }),
  ],
  [
    'ActivateObjectLow',
    (context) => handleActivateObject(context, { objects: OBJECTS }),
  ],
  [
    'ActivateObjectLow, one object of a group-only code',
    (context) =>
      handleActivateObject(context, {
        objects: [{ name: 'ZMCPV', type: 'VIEW/DV' }],
      }),
  ],
];

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

  async function full(activate: Activate, results: string) {
    const connection = finishedRun(results);
    declareSystemKind(connection, 'onprem');
    const answered = await activate({ connection });
    const urls = connection.requests.map((request) => request.url);
    expect(urls.some((url) => url.includes('/activation/runs'))).toBe(true);
    expect(urls.at(-1)).toContain(`/activation/results/${RUN_ID}`);
    return payloadOf(answered);
  }

  it.each(FULL_FORMS)(
    '%s: a run SAP cancelled is not activated, and its messages are returned',
    async (_form, activate) => {
      const payload = await full(activate, CANCELLED);
      expect(payload.run_status).toBe('finished');
      expect(payload.activated).toBe(false);
      expect(payload.messages).toEqual([
        { type: 'W', text: 'Activation was cancelled.', objectName: 'ZMCPV' },
      ]);
      expect(payload.nothing_to_activate).toBeUndefined();
      expect(payload.message).toContain('activationExecuted="false"');
      expect(payload.message).toContain('Activation was cancelled.');
    },
  );

  it.each(FULL_FORMS)(
    '%s: nothing to activate is not activated, and says so',
    async (_form, activate) => {
      const payload = await full(activate, NOTHING);
      expect(payload.activated).toBe(false);
      expect(payload.nothing_to_activate).toBe(true);
      expect(payload.messages).toEqual([]);
    },
  );

  it.each(FULL_FORMS)(
    '%s: activationExecuted="true" with a warning is activated',
    async (_form, activate) => {
      const payload = await full(activate, ACTIVATED);
      expect(payload.activated).toBe(true);
      expect(payload.nothing_to_activate).toBeUndefined();
    },
  );

  it('HandlerActivate (compact, group form) starts the run and answers its id alone', async () => {
    const connection = finishedRun(CANCELLED);
    declareSystemKind(connection, 'onprem');
    const payload = payloadOf(
      await handleHandlerActivate({ connection }, { objects: OBJECTS }),
    );
    expect(payload).toEqual({ run_id: RUN_ID });
    expect(connection.requests).toHaveLength(1);
  });

  it.each([
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
  ] as const)(
    'HandlerGet part=activation_results (compact, run form), %s: activated is %s',
    async (_case, results, activated, nothing, messages) => {
      const connection = resultsOnly(results);
      declareSystemKind(connection, 'onprem');
      const payload = payloadOf(
        await handleGetActivationResults({ connection }, { run_id: RUN_ID }),
      );
      expect(payload.activated).toBe(activated);
      expect(payload.nothing_to_activate).toBe(nothing);
      expect(payload.messages).toHaveLength(messages);
      expect(payload.document).toBe(results);
    },
  );

  it.each([
    [CANCELLED, false],
    [NOTHING, false],
    [ACTIVATED, true],
    [`<chkl:messages ${CHECKLIST}/>`, undefined],
    ['', undefined],
  ] as const)(
    'a results document kept as text states its verdict: %s → %s',
    (document, executed) => {
      expect(activationExecutedOf(document)).toBe(executed);
      expect(activationExecutedOf({ raw: document })).toBe(executed);
    },
  );

  it.each([
    ['false', false],
    ['true', true],
  ] as const)(
    'a parsed results document states its verdict: activationExecuted="%s"',
    (stated, executed) => {
      const parsed = {
        'chkl:messages': {
          'chkl:properties': { '@': { activationExecuted: stated } },
        },
      };
      expect(activationExecutedOf({ value: parsed, raw: '' })).toBe(executed);
    },
  );
});
