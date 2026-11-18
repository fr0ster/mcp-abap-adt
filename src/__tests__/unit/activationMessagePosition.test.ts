/**
 * Where an activation or check message stands (fr0ster/mcp-abap-adt#351,
 * the follow-up of 2026-11-18). A checklist `msg`'s `line` attribute is the
 * message's ordinal; its source position is in its `href`
 * (`…#start=LINE,COLUMN[;end=LINE,COLUMN]`). Every reader answers a message
 * with its type, text, object (`objDescr`), uri, position and code, and none
 * reports the ordinal as a line.
 */
import { analyseActivation, analyseCheck } from '@mcp-abap-adt/adt-strategies';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import { failurePayload } from '../../lib/answer';
import { parseCheckRunResponse } from '../../lib/checkRunParser';
import { activationMessagesOf } from '../../lib/strategies/activationRun';
import { terseActivation, terseCheck } from '../../lib/strategies/projections';
import { parseStructure } from '../../lib/strategies/reading';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { parseActivationResponse } from '../../lib/utils';
import { MEASURED_RUNS } from '../helpers/activationRunsByType';
import { corpusBody } from '../helpers/adtCorpus';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

/** The answer the 751 report measured, verbatim. */
const REPORTED =
  '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><msg objDescr="Class ZCL_AI_ACT_PROBE, Method GET_VALUE" type="E" line="1" href="/sap/bc/adt/oo/classes/zcl_ai_act_probe/source/main#start=16,15" forceSupported="true"><shortText><txt>Field "LV_UNDEFINED" is unknown.</txt></shortText><atom:link href="art.syntax:GTU" rel="http://www.sap.com/adt/categories/quickfixes" xmlns:atom="http://www.w3.org/2005/Atom"/></msg></chkl:messages>';

const REPORTED_MESSAGE = {
  type: 'E',
  text: 'Field "LV_UNDEFINED" is unknown.',
  object: 'Class ZCL_AI_ACT_PROBE, Method GET_VALUE',
  uri: '/sap/bc/adt/oo/classes/zcl_ai_act_probe/source/main',
  position: { line: 16, column: 15 },
};

/** The checklist of a refused class activation (recorded), `;end=` form. */
const FAILS = 'refusal-activation-fails--01-activation';
const FAILS_MESSAGE = {
  type: 'E',
  text: 'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
  object: 'Class ZMCP_BLD_ANSCH01, Method SAY_HELLO',
  uri: '/sap/bc/adt/oo/classes/zmcp_bld_ansch01/source/main',
  position: { line: 15, column: 24, end: { line: 15, column: 50 } },
  code: 'MESSAGE(GTH)',
};

/** A run's results of one type, as `MEASURED_RUNS` holds them. */
function resultsOf(system: 'onprem' | 'cloud', kind: string): string {
  const run = MEASURED_RUNS.find(
    (measured) => measured.system === system && measured.kind === kind,
  );
  if (run === undefined) throw new Error(`no measured run ${system} ${kind}`);
  return run.results;
}

/** What `analyseActivation` makes of a `200` carrying `data`. */
function activationFailure(data: string) {
  const verdict = analyseActivation(ADT_NO_FAILURE, {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
  });
  if (verdict === ADT_NO_FAILURE) throw new Error('not refused');
  return verdict;
}

describe('the reported 751 answer', () => {
  it('a refusal names the position, the object and the uri, and no line 1', () => {
    const payload = failurePayload(activationFailure(REPORTED));
    expect(payload.messages).toEqual([REPORTED_MESSAGE]);
  });

  it('the terse checklist answer names them too', () => {
    const terse = terseActivation(parseStructure(REPORTED));
    expect(terse?.messages).toEqual([REPORTED_MESSAGE]);
  });

  it('parseActivationResponse names them too', () => {
    expect(parseActivationResponse(REPORTED).messages).toEqual([
      REPORTED_MESSAGE,
    ]);
  });
});

describe('ActivateObjectLow answers the reported refusal with the position', () => {
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

  it('one class, its checklist as the 751 answered it', async () => {
    const connection = recordingConnection([{ data: REPORTED }]);
    declareSystemKind(connection, 'onprem');
    const answered = await handleActivateObject(
      { connection },
      { objects: [{ name: 'ZCL_AI_ACT_PROBE', type: 'CLAS/OC' }] },
    );
    expect(answered.isError).toBe(true);
    const [first] = answered.content ?? [];
    const payload = JSON.parse(first?.text ?? 'null');
    expect(payload.messages).toEqual([REPORTED_MESSAGE]);
  });
});

describe('the ;end= form and the recorded refusal', () => {
  it('a refusal', () => {
    const payload = failurePayload(activationFailure(corpusBody(FAILS)));
    expect(payload.messages).toEqual([FAILS_MESSAGE]);
  });

  it('the terse answer', () => {
    const terse = terseActivation(parseStructure(corpusBody(FAILS)));
    expect(terse?.messages).toEqual([FAILS_MESSAGE]);
  });

  it('parseActivationResponse', () => {
    expect(parseActivationResponse(corpusBody(FAILS)).messages).toEqual([
      FAILS_MESSAGE,
    ]);
  });
});

describe('an href with no fragment, and an empty href', () => {
  it('DOMA: the uri alone, no position', () => {
    const terse = terseActivation(parseStructure(resultsOf('onprem', 'DOMA')));
    expect(terse?.messages).toEqual([
      { type: 'W', text: 'Activation was cancelled.' },
      { type: 'W', text: 'No next/previous object found', code: 'ED(064)' },
      {
        type: 'E',
        text: 'Fixed value/limit ABC for data type NUMC must be a whole positive number',
        object: 'DOMA ZOBJ_DOMA_BROKEN',
        uri: '/sap/bc/adt/ddic/domains/zobj_doma_broken',
        code: 'DO(195)',
      },
      {
        type: 'E',
        text: 'DOMA ZOBJ_DOMA_BROKEN was not activated',
        object: 'DOMA ZOBJ_DOMA_BROKEN was not activated',
        uri: '/sap/bc/adt/ddic/domains/zobj_doma_broken',
        code: 'D0(408)',
      },
    ]);
  });

  it('DTEL: the uri alone, no position', () => {
    const terse = terseActivation(parseStructure(resultsOf('cloud', 'DTEL')));
    expect(terse?.messages).toEqual([
      {
        type: 'E',
        text: 'No active domain ZOBJ_DTEL_NODOM available',
        object: 'DTEL ZOBJ_DTEL_BROKEN',
        uri: '/sap/bc/adt/ddic/dataelements/zobj_dtel_broken',
        code: 'DO(315)',
      },
    ]);
  });

  it('no message carries a line', () => {
    for (const run of MEASURED_RUNS) {
      const terse = terseActivation(parseStructure(run.results));
      for (const message of terse?.messages ?? []) {
        expect(message).not.toHaveProperty('line');
      }
    }
  });
});

describe('an activation run names each message where it stands', () => {
  it('the source uri and position from the href, the object from objDescr', () => {
    const results = resultsOf('onprem', 'TABL/DS');
    const messages = activationMessagesOf(
      { value: results, raw: results, status: 200 },
      [],
    );
    const errors = messages.filter((m) => m.type === 'E');
    expect(errors[0]).toEqual({
      type: 'E',
      text: 'Nametab for table ZOBJ_TABL_BROKEN cannot be generated',
      object: 'Structure ZOBJ_TABL_BROKEN',
      source_uri: '/sap/bc/adt/ddic/structures/zobj_tabl_broken/source/main',
      position: { line: 3, column: 17, end: { line: 3, column: 29 } },
      code: 'DT(005)',
    });
    expect(messages[0]).toEqual({
      type: 'W',
      text: 'Activation was cancelled.',
    });
  });
});

describe('check runs: chkrun:uri carries the position', () => {
  const SYNTAX = 'refusal-syntax-check--01-checkrun';
  const SYNTAX_MESSAGE = {
    type: 'E',
    text: 'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
    uri: '/sap/bc/adt/oo/classes/zmcp_bld_ansch01/source/main',
    position: { line: 15, column: 24, end: { line: 15, column: 50 } },
    code: 'MESSAGE(GTH)',
  };

  it('terseCheck', () => {
    const terse = terseCheck(parseStructure(corpusBody(SYNTAX)));
    expect(terse?.messages).toEqual([SYNTAX_MESSAGE]);
  });

  it('a refused check', () => {
    const verdict = analyseCheck(ADT_NO_FAILURE, {
      data: corpusBody(SYNTAX),
      status: 200,
      statusText: 'OK',
      headers: {},
    });
    if (verdict === ADT_NO_FAILURE) throw new Error('not refused');
    expect(failurePayload(verdict).messages).toEqual([SYNTAX_MESSAGE]);
  });

  it('parseCheckRunResponse', () => {
    const parsed = parseCheckRunResponse({ data: corpusBody(SYNTAX) });
    expect(parsed.errors).toEqual([SYNTAX_MESSAGE]);
  });
});

describe('a refusal answers each message from its own fields, never by its words', () => {
  /** A refusal over the reported document, its messages as given. */
  function refusalWith(
    messages: ReadonlyArray<{
      type: string;
      text: string;
      object?: string;
      uri?: string;
      position?: { line: number; column: number };
      code?: string;
    }>,
  ) {
    return {
      origin: 'refusal' as const,
      message: 'refused',
      messages,
      response: { data: REPORTED, status: 200, statusText: 'OK', headers: {} },
    };
  }

  it('a message that states no location gets none from a document sentence with the same words', () => {
    const payload = failurePayload(
      refusalWith([{ type: 'E', text: 'Field "LV_UNDEFINED" is unknown.' }]),
    );
    expect(payload.messages).toEqual([
      { type: 'E', text: 'Field "LV_UNDEFINED" is unknown.' },
    ]);
  });

  it('every message is answered, with its own location, whatever its words', () => {
    const payload = failurePayload(
      refusalWith([
        {
          type: 'E',
          text: 'same words',
          object: 'Class A',
          uri: '/a',
          position: { line: 1, column: 2 },
        },
        {
          type: 'E',
          text: 'same words',
          object: 'Class B',
          uri: '/b',
          position: { line: 3, column: 4 },
        },
        { type: 'W', text: 'words no document says', code: 'X(1)' },
      ]),
    );
    expect(payload.messages).toEqual([
      {
        type: 'E',
        text: 'same words',
        object: 'Class A',
        uri: '/a',
        position: { line: 1, column: 2 },
      },
      {
        type: 'E',
        text: 'same words',
        object: 'Class B',
        uri: '/b',
        position: { line: 3, column: 4 },
      },
      { type: 'W', text: 'words no document says', code: 'X(1)' },
    ]);
  });

  it("the library's deprecated line is not answered", () => {
    const verdict = activationFailure(REPORTED);
    expect(verdict.messages?.[0]).toHaveProperty('line', '16');
    for (const message of failurePayload(verdict).messages ?? []) {
      expect(message).not.toHaveProperty('line');
    }
  });
});
