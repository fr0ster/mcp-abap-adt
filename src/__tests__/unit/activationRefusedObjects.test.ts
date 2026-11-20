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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { buildObjectUri } from '@mcp-abap-adt/adt-clients/core';
import { handleActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import {
  activationExecutedOf,
  activationMessagesOf,
  namedRunObject,
  type RunReference,
  runObjectOf,
} from '../../lib/strategies/activationRun';
import type { AdtReading } from '../../lib/strategies/reading';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { MEASURED_RUNS } from '../helpers/activationRunsByType';
import { corpusBody } from '../helpers/adtCorpus';
import { setSystemContext } from '../helpers/processSystemContext';
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
  { name: GOOD, type: 'CLAS/OC', uri: GOOD_URI },
  { name: BROKEN, type: 'CLAS/OC', uri: BROKEN_URI },
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

/**
 * Where each error message stands, as its `objDescr`, `href` and `code`
 * state it: the source position is the href's `#start=`, never the `line`
 * attribute (the message's ordinal, fr0ster/mcp-abap-adt#351).
 */
const SOURCE = `${BROKEN_URI}/source/main`;
const STANDS = [
  {
    object: `Class ${BROKEN}, Method M`,
    source_uri: SOURCE,
    position: { line: 7, column: 4, end: { line: 7, column: 8 } },
    code: 'MESSAGE(G13)',
  },
  {
    object: `Class ${BROKEN}, Method M`,
    source_uri: SOURCE,
    position: { line: 8, column: 4, end: { line: 8, column: 6 } },
    code: 'MESSAGE(GTU)',
  },
  {
    object: `Class ${BROKEN}, Method M`,
    source_uri: SOURCE,
    position: { line: 9, column: 8, end: { line: 9, column: 10 } },
    code: 'MESSAGE(GTU)',
  },
] as const;

/** The error messages as read, with no run object to name. */
const READ_ALONE = [
  { type: 'E', text: DAAT, ...STANDS[0] },
  { type: 'E', text: LV, ...STANDS[1] },
  { type: 'E', text: LV, ...STANDS[2] },
];

/** The error messages as read: each about the broken class. */
const READ_BROKEN = READ_ALONE.map((message) => ({
  ...message,
  objectName: BROKEN,
  uri: BROKEN_URI,
}));

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
  for (const [_case, href, name] of [
    ['the uri itself', BROKEN_URI, BROKEN],
    ['a part under it', `${BROKEN_URI}/source/main`, BROKEN],
    ['a position in it', `${BROKEN_URI}#start=1,1`, BROKEN],
    ['a query on it', `${BROKEN_URI}?version=inactive`, BROKEN],
    ['a part with a position', `${BROKEN_URI}/source/main#start=7,4`, BROKEN],
  ] as const) {
    it(format('%s', _case), () => {
      assert.equal(runObjectOf(href, REFERENCES)?.name, name);
    });
  }

  for (const [_case, href] of [
    ['an empty href', ''],
    ['no href', undefined],
    ['a uri that only begins with a run uri', `${BROKEN_URI}2/source/main`],
    ['a uri of no run object', '/sap/bc/adt/oo/classes/zobj_other'],
  ] as const) {
    it(format('%s points into none', _case), () => {
      assert.equal(runObjectOf(href, REFERENCES), undefined);
    });
  }

  it('a namespaced uri matches its href whatever the case of its escapes and letters', () => {
    // buildObjectUri('/NS/ZBROKEN', 'CLAS/OC') sends the slashes as %2F; an
    // href may spell the escape %2f, and the letters in either case.
    const sent = {
      name: '/NS/ZBROKEN',
      type: 'CLAS/OC',
      uri: buildObjectUri('/NS/ZBROKEN', 'CLAS/OC'),
    };
    assert.equal(sent.uri, '/sap/bc/adt/oo/classes/%2Fns%2Fzbroken');
    for (const href of [
      '/sap/bc/adt/oo/classes/%2fns%2fzbroken/source/main#start=7,4',
      '/sap/bc/adt/oo/classes/%2FNS%2FZBROKEN/source/main#start=7,4',
      '/sap/bc/adt/oo/classes/%2Fns%2Fzbroken',
    ]) {
      assert.equal(runObjectOf(href, [sent])?.name, '/NS/ZBROKEN');
    }
    assert.equal(
      runObjectOf('/sap/bc/adt/oo/classes/%2fns%2fzbroken2', [sent]),
      undefined,
    );
  });

  it('a reference with an empty uri is no object of any href', () => {
    assert.equal(
      runObjectOf(`${BROKEN_URI}/source/main`, [
        { name: 'ZEMPTY', type: 'CLAS/OC', uri: '' },
      ]),
      undefined,
    );
  });

  it('the longest uri wins: a part addressed under its owner goes to the part', () => {
    const owner = {
      name: 'ZGROUP',
      type: 'FUGR/F',
      uri: '/sap/bc/adt/functions/groups/zgroup',
    };
    const part = {
      name: 'ZMODULE',
      type: 'FUGR/FF',
      uri: '/sap/bc/adt/functions/groups/zgroup/fmodules/zmodule',
    };
    assert.equal(
      runObjectOf(`${part.uri}/source/main#start=2,1`, [owner, part])?.name,
      'ZMODULE',
    );
    assert.equal(
      runObjectOf(`${part.uri}/source/main#start=2,1`, [part, owner])?.name,
      'ZMODULE',
    );
    assert.equal(
      runObjectOf(`${owner.uri}/source/main`, [part, owner])?.name,
      'ZGROUP',
    );
  });
});

describe("a message's object named by objName is the run's object of that name", () => {
  for (const [_case, name, type, expected] of [
    ['the name as sent', BROKEN, undefined, BROKEN],
    ['the name in lower case', 'zobj_broken', undefined, BROKEN],
    ['the name with the type of the sent object', BROKEN, 'clas/oc', BROKEN],
  ] as const) {
    it(format('%s', _case), () => {
      assert.equal(namedRunObject(name, type, REFERENCES)?.name, expected);
    });
  }

  for (const [_case, name, type] of [
    ['no name', undefined, undefined],
    ['an empty name', '', undefined],
    ['a name no object of the run has', 'ZOBJ_OTHER', undefined],
    ['the name with another type', BROKEN, 'INTF/OI'],
  ] as const) {
    it(format('%s names none', _case), () => {
      assert.equal(namedRunObject(name, type, REFERENCES), undefined);
    });
  }
});

describe('a name sent as two types names neither, unless the message states its type', () => {
  const DOMAIN = {
    name: 'ZSHARED',
    type: 'DOMA/DD',
    uri: '/sap/bc/adt/ddic/domains/zshared',
  };
  const ELEMENT = {
    name: 'ZSHARED',
    type: 'DTEL/DE',
    uri: '/sap/bc/adt/ddic/dataelements/zshared',
  };
  const NAMED =
    `${HEAD}<msg type="E" objName="ZSHARED"><shortText><txt>A refusal</txt></shortText></msg>` +
    '</chkl:messages>';

  for (const [_order, sent] of [
    ['domain first', [DOMAIN, ELEMENT]],
    ['data element first', [ELEMENT, DOMAIN]],
  ] as const) {
    it(format('%s: the message keeps its own name and no uri', _order), () => {
      assert.equal(namedRunObject('ZSHARED', undefined, sent), undefined);
      assert.deepStrictEqual(activationMessagesOf(kept(NAMED), sent), [
        { type: 'E', text: 'A refusal', objectName: 'ZSHARED' },
      ]);
    });
  }

  for (const [_order, sent] of [
    ['domain first', [DOMAIN, ELEMENT]],
    ['data element first', [ELEMENT, DOMAIN]],
  ] as const) {
    it(format('%s: the type the message states picks the one', _order), () => {
      assert.equal(
        namedRunObject('ZSHARED', 'DTEL/DE', sent)?.uri,
        ELEMENT.uri,
      );
      assert.equal(namedRunObject('zshared', 'doma/dd', sent)?.uri, DOMAIN.uri);
    });
  }

  it('a name sent once is its object, with no type stated', () => {
    assert.equal(
      namedRunObject('ZSHARED', undefined, [DOMAIN])?.uri,
      DOMAIN.uri,
    );
    assert.deepStrictEqual(activationMessagesOf(kept(NAMED), [DOMAIN]), [
      { type: 'E', text: 'A refusal', objectName: 'ZSHARED', uri: DOMAIN.uri },
    ]);
  });
});

describe('the measured results of a run with one broken class', () => {
  it('cloud: each error message names the broken class and its uri', () => {
    assert.deepStrictEqual(
      activationMessagesOf(kept(CLOUD), REFERENCES),
      READ_BROKEN,
    );
    assert.equal(activationExecutedOf(kept(CLOUD)), false);
  });

  it('on premise: the cancellation warning with an empty href is about no object', () => {
    assert.deepStrictEqual(activationMessagesOf(kept(ONPREM), REFERENCES), [
      { type: 'W', text: 'Activation was cancelled.' },
      ...READ_BROKEN,
    ]);
  });

  it('read with no references (a run read by its id), no message names an object', () => {
    assert.deepStrictEqual(activationMessagesOf(kept(CLOUD), []), READ_ALONE);
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
    assert.equal(answered.isError, true);
    return payloadOf(answered);
  }

  it('one object named by href in one message and by objName in another is counted once', async () => {
    const mixed =
      `${HEAD}` +
      `<msg type="E" href="${BROKEN_URI}/source/main#start=7,4"><shortText><txt>${DAAT}</txt></shortText></msg>` +
      `<msg type="E" objName="${BROKEN}"><shortText><txt>${LV}</txt></shortText></msg>` +
      '</chkl:messages>';
    const payload = await refused(mixed);
    assert.ok(
      typeof payload.message === 'string' &&
        payload.message.includes(
          `Activation run ${RUN_ID} finished and refused 1 of 2 object(s)`,
        ),
    );
    assert.deepStrictEqual(payload.messages, [
      {
        type: 'E',
        text: DAAT,
        objectName: BROKEN,
        uri: BROKEN_URI,
        source_uri: SOURCE,
        position: { line: 7, column: 4 },
        line: '7',
      },
      { type: 'E', text: LV, objectName: BROKEN, uri: BROKEN_URI },
    ]);
  });

  for (const [_system, results, messages] of [
    ['cloud', CLOUD, READ_BROKEN],
    [
      'on premise',
      ONPREM,
      [{ type: 'W', text: 'Activation was cancelled.' }, ...READ_BROKEN],
    ],
  ] as const) {
    it(
      format(
        '%s: a refusal counting one refused object of two, naming it, and saying none was activated',
        _system,
      ),
      async () => {
        const payload = await refused(results);
        assert.equal(payload.origin, 'refusal');
        assert.ok(
          typeof payload.message === 'string' &&
            payload.message.includes(
              `Activation run ${RUN_ID} finished and refused 1 of 2 object(s)`,
            ),
        );
        assert.ok(
          typeof payload.message === 'string' &&
            payload.message.includes(
              'its results say activationExecuted="false": none of the 2 object(s) was activated',
            ),
        );
        assert.ok(payload.message.includes(`${BROKEN}: ${DAAT}`));
        // A refusal answers each message's deprecated `line`: its position's.
        assert.deepStrictEqual(
          payload.messages,
          messages.map((message) =>
            'position' in message
              ? { ...message, line: String(message.position.line) }
              : message,
          ),
        );
      },
    );
  }
});

/**
 * Every type measured (`MEASURED_RUNS`): each error message names the broken
 * object of its run by its href, and the refusal counts one object of two,
 * saying none was activated only where the results state
 * activationExecuted="false".
 */
/** A measured run's objects as the run was started with them: both of its type. */
function referencesOf(run: (typeof MEASURED_RUNS)[number]): RunReference[] {
  return run.references.map((reference) => ({ ...reference, type: run.kind }));
}

describe('the measured runs of every type', () => {
  const runs = MEASURED_RUNS.map((run) => [run.system, run.kind, run] as const);

  for (const [_system, _kind, run] of runs) {
    it(
      format(
        '%s %s: each error message names the broken object, no other message names the good one',
        _system,
        _kind,
      ),
      () => {
        const [good, broken] = run.references;
        const messages = activationMessagesOf(
          kept(run.results),
          referencesOf(run),
        );
        const errors = messages.filter((m) => m.type === 'E');
        assert.ok(errors.length > 0);
        for (const error of errors) {
          assert.equal(error.objectName, run.broken);
          assert.equal(error.uri, broken?.uri);
        }
        assert.equal(
          messages.some((m) => m.objectName === good?.name),
          false,
        );
        assert.equal(activationExecutedOf(kept(run.results)), run.executed);
      },
    );
  }

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
  for (const [_system, kind, run] of runs.filter(
    ([, kind]) => kind !== 'FUGR/FF',
  )) {
    it(
      format('%s %s: ActivateObjects refuses one object of two', _system, kind),
      async () => {
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
        assert.equal(answered.isError, true);
        const payload = payloadOf(answered);
        assert.equal(payload.origin, 'refusal');
        assert.ok(
          typeof payload.message === 'string' &&
            payload.message.includes(
              `Activation run ${RUN_ID} finished and refused 1 of 2 object(s)`,
            ),
        );
        assert.equal(
          String(payload.message).includes(
            'none of the 2 object(s) was activated',
          ),
          !run.executed,
        );
        assert.ok(payload.message.includes(`${run.broken}: `));
      },
    );
  }
});
