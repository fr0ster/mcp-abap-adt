import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import {
  definitionKey,
  mergeDefinitions,
  pairRows,
  type RequestedBreakpoint,
  wireOf,
} from '../../../lib/debugger/arming';
import { readBreakpoints } from '../../../lib/debugger/readings';
import { corpusBody } from '../../helpers/adtCorpus';
import { rowsXml } from './fakes';

type LineBreakpoint = Extract<IDebuggerBreakpoint, { kind: 'line' }>;
const line = (n: number, condition?: string): LineBreakpoint => ({
  kind: 'line',
  uri: `/sap/bc/adt/oo/classes/class_a/source/main#start=${n}`,
  ...(condition ? { condition } : {}),
});
const EXC: IDebuggerBreakpoint = { kind: 'exception', exceptionClass: 'CX_A' };
const STMT: IDebuggerBreakpoint = { kind: 'statement', statement: 'MESSAGE' };
const tagged = (
  clientId: string,
  definition: IDebuggerBreakpoint,
): RequestedBreakpoint => ({ clientId, definition });
const counter = () => {
  let n = 0;
  return () => `bp${++n}`;
};
const rows = (r: Array<Record<string, string>>) => readBreakpoints(rowsXml(r));
const NOT_HERE = 'Cannot create a breakpoint at this position';
const none = new Set<string>();

describe('the arming contract', () => {
  it('deduplicates by kind, target and condition; a kept definition keeps its tag, a new one takes the next', () => {
    const next = counter();
    const kept = mergeDefinitions([], [line(10)], next);
    assert.deepStrictEqual(kept, [tagged('bp1', line(10))]);
    assert.deepStrictEqual(
      mergeDefinitions(kept, [line(10), line(10, 'lv_a = 1'), EXC, EXC], next),
      [
        tagged('bp1', line(10)),
        tagged('bp2', line(10, 'lv_a = 1')),
        tagged('bp3', EXC),
      ],
    );
    assert.notEqual(
      definitionKey(line(10)),
      definitionKey(line(10, 'lv_a = 1')),
    );
  });

  // Review Focus 6.
  it('the wire form carries the session tag, never a clientId the definition brought', () => {
    const own = { ...EXC, clientId: 'own' } as IDebuggerBreakpoint;
    assert.deepStrictEqual(wireOf(tagged('bp7', own)), {
      ...EXC,
      clientId: 'bp7',
    });
    assert.equal(definitionKey(own), definitionKey(EXC));
  });

  it('rows out of the request order, several of one kind: each pairs by its tag, whatever its URI says', () => {
    const sent = [
      tagged('bp1', line(32, 'lv_a = 1')),
      tagged('bp2', line(1)),
      tagged('bp3', line(40)),
    ];
    const p = pairRows(
      sent,
      none,
      rows([
        { kind: 'line', clientId: 'bp2', error: NOT_HERE },
        {
          kind: 'line',
          id: 'L9',
          clientId: 'bp1',
          uri: '/sap/bc/adt/oo/classes/class_a/includes/implementations#start=9',
          condition: 'lv_a = 1',
        },
        { kind: 'line', id: 'L40', clientId: 'bp3', uri: line(40).uri },
      ]),
    );
    assert.deepStrictEqual(p.requested, [sent[0], sent[2]]);
    assert.deepStrictEqual(
      p.paired,
      new Map([
        ['L9', 'bp1'],
        ['L40', 'bp3'],
      ]),
    );
    assert.deepStrictEqual(
      p.placed.map((r) => r.id),
      ['L9', 'L40'],
    );
    assert.deepStrictEqual(p.refused, [
      { requested: line(1), error: NOT_HERE },
    ]);
    assert.deepStrictEqual(p.lost, []);
    assert.deepStrictEqual(p.unexpected, []);
  });

  it('an earlier breakpoint that comes back refused is lost, not refused', () => {
    const p = pairRows(
      [tagged('bp1', EXC), tagged('bp2', STMT)],
      new Set(['bp1']),
      rows([
        { kind: 'statement', id: 'S1', clientId: 'bp2', statement: 'MESSAGE' },
        {
          kind: 'exception',
          clientId: 'bp1',
          error: 'Exception class does not exist',
        },
      ]),
    );
    assert.deepStrictEqual(p.lost, [
      { requested: EXC, error: 'Exception class does not exist' },
    ]);
    assert.deepStrictEqual(p.refused, []);
    assert.deepStrictEqual(p.requested, [tagged('bp2', STMT)]);
  });

  it('a definition no row answers is not placed: refused without a reason, or lost', () => {
    const p = pairRows(
      [tagged('bp1', EXC), tagged('bp2', STMT)],
      new Set(['bp1']),
      rows([]),
    );
    assert.deepStrictEqual(p.lost, [{ requested: EXC }]);
    assert.deepStrictEqual(p.refused, [{ requested: STMT }]);
    assert.deepStrictEqual(p.requested, []);
  });

  it('a row without a tag, with a tag not sent, or a second row for one tag is unexpected; a placed one stays placed and pairs with nothing', () => {
    const sent = [tagged('bp1', EXC)];
    const p = pairRows(
      sent,
      none,
      rows([
        {
          kind: 'exception',
          id: 'E1',
          clientId: 'bp1',
          exceptionClass: 'CX_A',
        },
        {
          kind: 'exception',
          id: 'E2',
          clientId: 'bp1',
          exceptionClass: 'CX_A',
        },
        { kind: 'statement', id: 'S1', statement: 'MESSAGE' },
        { kind: 'line', clientId: 'bp9', error: NOT_HERE },
      ]),
    );
    assert.deepStrictEqual(p.requested, sent);
    assert.deepStrictEqual(p.paired, new Map([['E1', 'bp1']]));
    assert.deepStrictEqual(
      p.placed.map((r) => r.id),
      ['E1', 'E2', 'S1'],
    );
    assert.deepStrictEqual(p.unexpected, [
      { kind: 'exception', id: 'E2', clientId: 'bp1' },
      { kind: 'statement', id: 'S1' },
      { kind: 'line', clientId: 'bp9', error: NOT_HERE },
    ]);
    assert.deepStrictEqual(p.refused, []);
    assert.deepStrictEqual(p.lost, []);
  });

  it('the recorded answer, captured without tags: both rows unexpected, both definitions refused without a reason', () => {
    const p = pairRows(
      [tagged('bp1', line(32, 'lv_a = 1')), tagged('bp2', line(1))],
      none,
      readBreakpoints(corpusBody('debugger-conversation--01-breakpoints-set')),
    );
    // expect.any(String) for the second id: its type, then the rest.
    assert.equal(p.unexpected.length, 2);
    assert.deepStrictEqual(p.unexpected[0], { kind: 'line', error: NOT_HERE });
    const second = p.unexpected[1];
    assert.equal(typeof second?.id, 'string');
    assert.deepStrictEqual(
      { ...second, id: undefined },
      {
        kind: 'line',
        id: undefined,
      },
    );
    assert.equal(p.placed.length, 1);
    assert.equal(p.paired.size, 0);
    assert.deepStrictEqual(p.refused, [
      { requested: line(32, 'lv_a = 1') },
      { requested: line(1) },
    ]);
    assert.deepStrictEqual(p.requested, []);
  });
});
