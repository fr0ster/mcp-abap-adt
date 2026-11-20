import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  type BreakpointArg,
  breakpointsFromArgs,
} from '../../../lib/debugger/schemas';
import { assertThrows } from '../../helpers/assertions';

const LINE: BreakpointArg = {
  object_type: 'CLAS',
  object_name: 'class_a',
  line: 7,
};

describe('breakpointsFromArgs', () => {
  it('a line breakpoint keeps its condition', () => {
    assert.deepStrictEqual(
      breakpointsFromArgs([{ ...LINE, condition: 'lv_a = 1' }]),
      [
        {
          kind: 'line',
          uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=7',
          condition: 'lv_a = 1',
        },
      ],
    );
  });

  for (const [kind, b] of [
    ['exception', { exception_class: 'cx_a', condition: 'lv_a = 1' }],
    ['statement', { statement: 'message', condition: 'lv_a = 1' }],
    [
      'message',
      { message: { id: 'a', number: '001', type: 'e' }, condition: 'lv_a = 1' },
    ],
  ]) {
    it(
      format(
        'a condition on a %s breakpoint is refused, naming the breakpoint',
        kind,
      ),
      () => {
        assertThrows(
          () => breakpointsFromArgs([LINE, b as BreakpointArg]),
          `breakpoints[1] (${kind}): a condition applies to a line breakpoint only`,
        );
      },
    );
  }

  it('the other kinds without a condition carry none', () => {
    assert.deepStrictEqual(breakpointsFromArgs([{ exception_class: 'cx_a' }]), [
      { kind: 'exception', exceptionClass: 'CX_A' },
    ]);
  });
});
