import {
  type BreakpointArg,
  breakpointsFromArgs,
} from '../../../lib/debugger/schemas';

const LINE: BreakpointArg = {
  object_type: 'CLAS',
  object_name: 'class_a',
  line: 7,
};

describe('breakpointsFromArgs', () => {
  it('a line breakpoint keeps its condition', () => {
    expect(breakpointsFromArgs([{ ...LINE, condition: 'lv_a = 1' }])).toEqual([
      {
        kind: 'line',
        uri: '/sap/bc/adt/oo/classes/class_a/source/main#start=7',
        condition: 'lv_a = 1',
      },
    ]);
  });

  it.each([
    ['exception', { exception_class: 'cx_a', condition: 'lv_a = 1' }],
    ['statement', { statement: 'message', condition: 'lv_a = 1' }],
    [
      'message',
      { message: { id: 'a', number: '001', type: 'e' }, condition: 'lv_a = 1' },
    ],
  ])(
    'a condition on a %s breakpoint is refused, naming the breakpoint',
    (kind, b) => {
      expect(() => breakpointsFromArgs([LINE, b as BreakpointArg])).toThrow(
        `breakpoints[1] (${kind}): a condition applies to a line breakpoint only`,
      );
    },
  );

  it('the other kinds without a condition carry none', () => {
    expect(breakpointsFromArgs([{ exception_class: 'cx_a' }])).toEqual([
      { kind: 'exception', exceptionClass: 'CX_A' },
    ]);
  });
});
