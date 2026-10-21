/**
 * The session trace's reading (integration helper `sessionTrace.ts`): by
 * security session — a request's session is its cookie's, else its answer's
 * — its contexts, its requests by path, its logoff and SAP's answer; and the
 * problems: more than one context on one connection, a context on a
 * stateless one, a session never logged off.
 */
import { readSessionTrace } from '../../integration/helpers/sessionTrace';

const req = (
  id: number,
  what: string,
  stateful: 0 | 1,
  sec: string,
  ctx: string,
  t: number,
) =>
  [
    'session-trace',
    'req',
    String(id),
    what,
    `stateful=${stateful}`,
    `sec=${sec}`,
    `ctx=${ctx}`,
    `t=${t}`,
  ].join('\t');
const res = (id: number, status: number, sec: string, ctx: string, t: number) =>
  [
    'session-trace',
    'res',
    String(id),
    String(status),
    `sec=${sec}`,
    `ctx=${ctx}`,
    `t=${t}`,
  ].join('\t');

describe('readSessionTrace', () => {
  it('a clean session: one context, logged off, the answer and its time', () => {
    const trace = readSessionTrace([
      req(1, 'GET /sap/bc/adt/core/discovery', 0, '-', '-', 100),
      res(1, 200, 'aaa', '-', 110),
      req(2, 'POST /sap/bc/adt/debugger/listeners', 1, 'aaa', '-', 120),
      res(2, 200, '-', 'ctx-1', 130),
      req(3, 'POST /sap/bc/adt/debugger/listeners', 1, 'aaa', 'ctx-1', 140),
      res(3, 200, '-', '-', 150),
      req(4, 'GET /sap/public/bc/icf/logoff', 0, 'aaa', '-', 200),
      res(4, 200, '-', '-', 260),
    ]);
    expect(trace.problems).toEqual([]);
    expect(trace.sessions).toEqual([
      {
        sec: 'aaa',
        stateful: true,
        contexts: ['ctx-1'],
        paths: {
          'GET /sap/bc/adt/core/discovery': 1,
          'POST /sap/bc/adt/debugger/listeners': 2,
        },
        logged_off: true,
        logoff: { status: '200', ms: 60 },
      },
    ]);
  });

  it('two contexts on one connection and no logoff are problems; a logoff not answered says so', () => {
    const trace = readSessionTrace([
      req(1, 'POST /x', 1, 'bbb', '-', 1),
      res(1, 200, '-', 'ctx-1', 2),
      req(2, 'POST /x', 1, 'bbb', '-', 3),
      res(2, 200, '-', 'ctx-2', 4),
      req(3, 'GET /y', 0, 'ccc', '-', 5),
      req(4, 'GET /sap/public/bc/icf/logoff', 0, 'ccc', '-', 6),
    ]);
    expect(trace.problems).toEqual([
      'security session #1: 2 ABAP contexts on one connection',
      'security session #1: never logged off',
      'security session #2: its logoff was answered no answer, not 200',
    ]);
    expect(trace.sessions[1]?.logoff).toEqual({ status: 'no answer' });
  });

  it('a logoff answered other than 200 is a problem: SAP did not say the session ended', () => {
    const trace = readSessionTrace([
      req(1, 'GET /x', 0, 'ddd', '-', 1),
      req(2, 'GET /sap/public/bc/icf/logoff', 0, 'ddd', '-', 2),
      res(2, 500, '-', '-', 3),
    ]);
    expect(trace.problems).toEqual([
      'security session #1: its logoff was answered 500, not 200',
    ]);
    expect(trace.sessions[0]?.logoff).toEqual({ status: '500', ms: 1 });
  });
});
