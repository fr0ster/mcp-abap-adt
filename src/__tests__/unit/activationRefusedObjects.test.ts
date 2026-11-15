/**
 * A group activation refused for one object of its set names that object,
 * and counts objects, not messages.
 *
 * The results documents below are the ones measured on premise and on the
 * cloud (2026-11-15) for a run of two classes, one with a misspelt keyword
 * (`DAAT` for `DATA`), the object names replaced: SAP names the object of
 * each message only by its `href` — a uri inside the object (`…/source/main`
 * with a position) — and an `objDescr` of words, never `objName`. Three error
 * messages are about the one broken class; on premise a W "Activation was
 * cancelled." with an empty `href` comes first; both state
 * `activationExecuted="false"`. Each handler case runs over a recording
 * connection — real adt-clients code, no SAP.
 */
import { buildObjectUri } from '@mcp-abap-adt/adt-clients/core';
import { handleActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import {
  activationExecutedOf,
  activationMessagesOf,
  type RunReference,
  runObjectOf,
} from '../../lib/strategies/activationRun';
import type { AdtReading } from '../../lib/strategies/reading';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { MEASURED_RUNS } from '../helpers/activationRunsByType';
import { corpusBody } from '../helpers/adtCorpus';
import { recordingConnection } from '../helpers/recordingConnection';

/** A results document kept as text. */
function kept(raw: string): AdtReading<string> {
  return { value: raw, raw, status: 200 };
}

const GOOD = 'ZOBJ_GOOD';
const BROKEN = 'ZOBJ_BROKEN';
const GOOD_URI = '/sap/bc/adt/oo/classes/zobj_good';
const BROKEN_URI = '/sap/bc/adt/oo/classes/zobj_broken';

/** The run's objects, as the run was started with them. */
const REFERENCES: readonly RunReference[] = [
  { name: GOOD, uri: GOOD_URI },
  { name: BROKEN, uri: BROKEN_URI },
];

const HINTS =
  '<correctionHint number="-1" kind="E" line="0" column="0" word=""/>' +
  '<correctionHint number="1" kind="" line="0" column="0" word=""/>' +
  '<correctionHint number="1" kind="D" line="2" column="4" word="DAAT"/>' +
  '<correctionHint number="1" kind="I" line="2" column="4" word="DATA"/>';
const QUICKFIX =
  '<atom:link href="art.syntax:GTU" rel="http://www.sap.com/adt/categories/quickfixes" xmlns:atom="http://www.w3.org/2005/Atom"/>';

/** The three error messages, as both systems answered them. */
const BROKEN_MESSAGES =
  `<msg objDescr="Class ${BROKEN}, Method M" type="E" line="1" href="${BROKEN_URI}/source/main#start=7,4;end=7,8" code="MESSAGE(G13)" forceSupported="true">` +
  `<shortText><txt>The statement "DAAT" is not expected. A correct similar statement is "DATA".</txt></shortText>${HINTS}</msg>` +
  `<msg objDescr="Class ${BROKEN}, Method M" type="E" line="2" href="${BROKEN_URI}/source/main#start=8,4;end=8,6" code="MESSAGE(GTU)" forceSupported="true">` +
  `<shortText><txt>Field "LV" is unknown.</txt></shortText>${HINTS}${QUICKFIX}</msg>` +
  `<msg objDescr="Class ${BROKEN}, Method M" type="E" line="3" href="${BROKEN_URI}/source/main#start=9,8;end=9,10" code="MESSAGE(GTU)" forceSupported="true">` +
  `<shortText><txt>Field "LV" is unknown.</txt></shortText>${HINTS}${QUICKFIX}</msg>`;

const HEAD =
  '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">' +
  '<chkl:properties checkExecuted="true" activationExecuted="false" generationExecuted="false"/>';

/** The cloud's results: the three error messages alone. */
const CLOUD = `${HEAD}${BROKEN_MESSAGES}</chkl:messages>`;

/** On premise: the cancellation warning, with an empty href, first. */
const ONPREM =
  `${HEAD}<msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg>` +
  `${BROKEN_MESSAGES}</chkl:messages>`;

const DAAT =
  'The statement "DAAT" is not expected. A correct similar statement is "DATA".';
const LV = 'Field "LV" is unknown.';

/** The error messages as read: each about the broken class. */
const READ_BROKEN = [
  { type: 'E', text: DAAT, objectName: BROKEN, uri: BROKEN_URI },
  { type: 'E', text: LV, objectName: BROKEN, uri: BROKEN_URI },
  { type: 'E', text: LV, objectName: BROKEN, uri: BROKEN_URI },
];

const RUN_ID = 'RUN0002';

/** A finished run: its start, its status, its results. */
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

/** The JSON payload a tool answered. */
function payloadOf(answered: {
  content?: readonly { text?: string }[];
}): Record<string, unknown> {
  const [first] = answered.content ?? [];
  const parsed: unknown = JSON.parse(first?.text ?? 'null');
  if (parsed === null || typeof parsed !== 'object')
    throw new Error('no payload');
  return Object.fromEntries(Object.entries(parsed));
}

describe("a message's object is the run's object its href points into", () => {
  it.each([
    ['the uri itself', BROKEN_URI, BROKEN],
    ['a part under it', `${BROKEN_URI}/source/main`, BROKEN],
    ['a position in it', `${BROKEN_URI}#start=1,1`, BROKEN],
    ['a part with a position', `${BROKEN_URI}/source/main#start=7,4`, BROKEN],
  ] as const)('%s', (_case, href, name) => {
    expect(runObjectOf(href, REFERENCES)?.name).toBe(name);
  });

  it.each([
    ['an empty href', ''],
    ['no href', undefined],
    ['a uri that only begins with a run uri', `${BROKEN_URI}2/source/main`],
    ['a uri of no run object', '/sap/bc/adt/oo/classes/zobj_other'],
  ] as const)('%s points into none', (_case, href) => {
    expect(runObjectOf(href, REFERENCES)).toBeUndefined();
  });

  it('a namespaced uri matches its href whatever the case of its escapes and letters', () => {
    // buildObjectUri('/NS/ZBROKEN', 'CLAS/OC') sends the slashes as %2F; an
    // href may spell the escape %2f, and the letters in either case.
    const sent = {
      name: '/NS/ZBROKEN',
      uri: buildObjectUri('/NS/ZBROKEN', 'CLAS/OC'),
    };
    expect(sent.uri).toBe('/sap/bc/adt/oo/classes/%2Fns%2Fzbroken');
    for (const href of [
      '/sap/bc/adt/oo/classes/%2fns%2fzbroken/source/main#start=7,4',
      '/sap/bc/adt/oo/classes/%2FNS%2FZBROKEN/source/main#start=7,4',
      '/sap/bc/adt/oo/classes/%2Fns%2Fzbroken',
    ]) {
      expect(runObjectOf(href, [sent])?.name).toBe('/NS/ZBROKEN');
    }
    expect(
      runObjectOf('/sap/bc/adt/oo/classes/%2fns%2fzbroken2', [sent]),
    ).toBeUndefined();
  });

  it('a reference with an empty uri is no object of any href', () => {
    expect(
      runObjectOf(`${BROKEN_URI}/source/main`, [{ name: 'ZEMPTY', uri: '' }]),
    ).toBeUndefined();
  });

  it('the longest uri wins: a part addressed under its owner goes to the part', () => {
    const owner = {
      name: 'ZGROUP',
      uri: '/sap/bc/adt/functions/groups/zgroup',
    };
    const part = {
      name: 'ZMODULE',
      uri: '/sap/bc/adt/functions/groups/zgroup/fmodules/zmodule',
    };
    expect(
      runObjectOf(`${part.uri}/source/main#start=2,1`, [owner, part])?.name,
    ).toBe('ZMODULE');
    expect(
      runObjectOf(`${part.uri}/source/main#start=2,1`, [part, owner])?.name,
    ).toBe('ZMODULE');
    expect(runObjectOf(`${owner.uri}/source/main`, [part, owner])?.name).toBe(
      'ZGROUP',
    );
  });
});

describe('the measured results of a run with one broken class', () => {
  it('cloud: each error message names the broken class and its uri', () => {
    expect(activationMessagesOf(kept(CLOUD), REFERENCES)).toEqual(READ_BROKEN);
    expect(activationExecutedOf(kept(CLOUD))).toBe(false);
  });

  it('on premise: the cancellation warning with an empty href is about no object', () => {
    expect(activationMessagesOf(kept(ONPREM), REFERENCES)).toEqual([
      { type: 'W', text: 'Activation was cancelled.' },
      ...READ_BROKEN,
    ]);
  });

  it('read with no references (a run read by its id), no message names an object', () => {
    expect(activationMessagesOf(kept(CLOUD), [])).toEqual(
      READ_BROKEN.map(({ type, text }) => ({ type, text })),
    );
  });
});

describe('ActivateObjects answers the measured refusal', () => {
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

  async function refused(results: string) {
    const connection = finishedRun(results);
    declareSystemKind(connection, 'onprem');
    const context: HandlerContext = { connection };
    const answered = await handleActivateObjects(context, {
      objects: [
        { name: GOOD, type: 'CLAS/OC' },
        { name: BROKEN, type: 'CLAS/OC' },
      ],
    });
    expect(answered.isError).toBe(true);
    return payloadOf(answered);
  }

  it.each([
    ['cloud', CLOUD, READ_BROKEN],
    [
      'on premise',
      ONPREM,
      [{ type: 'W', text: 'Activation was cancelled.' }, ...READ_BROKEN],
    ],
  ] as const)(
    '%s: a refusal counting one refused object of two, naming it, and saying none was activated',
    async (_system, results, messages) => {
      const payload = await refused(results);
      expect(payload.origin).toBe('refusal');
      expect(payload.message).toContain(
        `Activation run ${RUN_ID} finished and refused 1 of 2 object(s)`,
      );
      expect(payload.message).toContain(
        'its results say activationExecuted="false": none of the 2 object(s) was activated',
      );
      expect(payload.message).toContain(`${BROKEN}: ${DAAT}`);
      expect(payload.messages).toEqual(messages);
    },
  );
});

/**
 * Every type measured (`MEASURED_RUNS`): each error message names the broken
 * object of its run by its href, and the refusal counts one object of two,
 * saying none was activated only where the results state
 * activationExecuted="false".
 */
describe('the measured runs of every type', () => {
  const runs = MEASURED_RUNS.map((run) => [run.system, run.kind, run] as const);

  it.each(runs)(
    '%s %s: each error message names the broken object, no other message names the good one',
    (_system, _kind, run) => {
      const [good, broken] = run.references;
      const messages = activationMessagesOf(kept(run.results), run.references);
      const errors = messages.filter((m) => m.type === 'E');
      expect(errors.length).toBeGreaterThan(0);
      for (const error of errors) {
        expect(error.objectName).toBe(run.broken);
        expect(error.uri).toBe(broken?.uri);
      }
      expect(messages.some((m) => m.objectName === good?.name)).toBe(false);
      expect(activationExecutedOf(kept(run.results))).toBe(run.executed);
    },
  );

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

  // A function module's reference is checked against its group first (one
  // metadata read per module), which this run's answers do not hold: its
  // naming is the case above.
  it.each(runs.filter(([, kind]) => kind !== 'FUGR/FF'))(
    '%s %s: ActivateObjects refuses one object of two',
    async (_system, kind, run) => {
      const connection = finishedRun(run.results);
      declareSystemKind(connection, 'onprem');
      const answered = await handleActivateObjects(
        { connection },
        {
          objects: run.references.map((reference) => ({
            name: reference.name,
            type: kind,
          })),
        },
      );
      expect(answered.isError).toBe(true);
      const payload = payloadOf(answered);
      expect(payload.origin).toBe('refusal');
      expect(payload.message).toContain(
        `Activation run ${RUN_ID} finished and refused 1 of 2 object(s)`,
      );
      expect(
        String(payload.message).includes(
          'none of the 2 object(s) was activated',
        ),
      ).toBe(!run.executed);
      expect(payload.message).toContain(`${run.broken}: `);
    },
  );
});
