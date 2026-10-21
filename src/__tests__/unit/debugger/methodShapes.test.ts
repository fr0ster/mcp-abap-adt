/**
 * What AbapDebugger's members answer through their default strategies, on the
 * recorded endpoint answers: the fakes in fakes.ts return exactly this.
 */
import { AbapDebugger } from '@mcp-abap-adt/adt-clients';
import {
  analyseDebuggeeEnd,
  analyseDebuggerFreed,
} from '@mcp-abap-adt/adt-strategies';
import type {
  IAbapConnection,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody, corpusSidecar } from '../../../lib/adtCorpus';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';
import { readDebuggeeEnd } from '../../../lib/debugger/readings';

/** Replays one recorded exchange; a status of 400 or more is thrown the way the transport throws it. */
function replaying(name: string, body?: string): IAbapConnection {
  const sidecar = corpusSidecar(name);
  const wire = {
    status: sidecar.response.status,
    statusText: '',
    headers: sidecar.response.headers ?? {},
    data: body ?? (sidecar.response.bodyFile ? corpusBody(name) : ''),
  } as IAdtWireResponse;
  return {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest() {
      if (wire.status >= 400)
        throw Object.assign(
          new Error(`Request failed with status code ${wire.status}`),
          { response: wire },
        );
      return wire;
    },
  } as unknown as IAbapConnection;
}

const IDENTITY = {
  debuggingMode: 'user',
  requestUser: 'SAPUSER01',
  terminalId: 'T'.repeat(32),
  ideId: 'I'.repeat(32),
} as const;
const bodyOf = (a: any) =>
  a.ok ? a.getResult().value : `FAILED: ${a.getError().message}`;

const DOCUMENT_MEMBERS: Array<
  [string, string, (d: AbapDebugger) => Promise<unknown>]
> = [
  [
    'listen',
    'debugger-run-to-line--02-listen',
    (d) => d.listen(IDENTITY, { holdSeconds: 60 }),
  ],
  [
    'attach',
    'debugger-run-to-line--03-attach',
    (d) => d.attach(IDENTITY, 'X', {}),
  ],
  ['getStack', 'debugger-run-to-line--04-stack', (d) => d.getStack()],
  [
    'getVariables',
    'debugger-run-to-line--07-variables-at-write',
    (d) =>
      d.getVariables(['LV_COUNTER'], {
        headers: DEFAULT_ADT_HEADERS['debugger.getVariables'],
      }),
  ],
  [
    'getChildVariables',
    'debugger-conversation--07-children-root',
    (d) =>
      d.getChildVariables(['@ROOT'], {
        headers: DEFAULT_ADT_HEADERS['debugger.getChildVariables'],
      }),
  ],
  [
    'stepToLine',
    'debugger-run-to-line--05-stepruntoline',
    (d) => d.stepToLine('stepRunToLine', '/x#start=1'),
  ],
  [
    'setBreakpoints',
    'debugger-conversation--01-breakpoints-set',
    (d) =>
      d.setBreakpoints(IDENTITY, [], {
        headers: DEFAULT_ADT_HEADERS['debugger.setBreakpoints'],
      }),
  ],
];

describe('what AbapDebugger members answer through their default strategies', () => {
  it.each(DOCUMENT_MEMBERS)(
    '%s answers the recorded document as it came',
    async (_member, name, call) => {
      expect(bodyOf(await call(new AbapDebugger(replaying(name))))).toBe(
        corpusBody(name),
      );
    },
  );

  it('a listen the server held to its end answers an empty string', async () => {
    const answer = await new AbapDebugger(
      replaying('debugger-conversation--03-listen-timeout-no-trigger'),
    ).listen(IDENTITY, { holdSeconds: 60 });
    expect(bodyOf(answer)).toBe('');
  });

  it('terminateDebuggee: its 500 is a success under analyseDebuggeeEnd, and answers nothing (the `done` strategy)', async () => {
    const answer = await new AbapDebugger(
      replaying('debugger-terminate--01-terminate-debuggee'),
    ).terminateDebuggee({ analyse: analyseDebuggeeEnd });
    expect(answer.ok).toBe(true);
    expect(bodyOf(answer)).toBeUndefined();
  });

  it('a step whose debuggee ended: the 500 is a success under analyseDebuggeeEnd, and the document is kept, so the end can be read', async () => {
    // No recorded step ended with this subtype; the recorded terminate answer is the same document with the other subtype.
    const ended = corpusBody(
      'debugger-terminate--01-terminate-debuggee',
    ).replace('terminateDebuggee', 'debuggeeEnded');
    const answer = await new AbapDebugger(
      replaying('debugger-terminate--01-terminate-debuggee', ended),
    ).step('stepContinue', { analyse: analyseDebuggeeEnd });
    expect(answer.ok).toBe(true);
    expect(readDebuggeeEnd(bodyOf(answer) as string)).toBe('debuggeeEnded');
  });
});

/** One wire answer; a status of 400 or more is thrown the way the transport throws it. */
function answering(
  status: number,
  headers: Record<string, string>,
  data: unknown,
): IAbapConnection {
  const wire = { status, statusText: '', headers, data } as IAdtWireResponse;
  return {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest() {
      if (status >= 400)
        throw Object.assign(
          new Error(`Request failed with status code ${status}`),
          { response: wire },
        );
      return wire;
    },
  } as unknown as IAbapConnection;
}

describe('terminateDebugger under analyseDebuggerFreed (errata: the debugger freeing its session is answered as an ICF 500)', () => {
  const free = (
    status: number,
    headers: Record<string, string>,
    data: unknown,
  ) =>
    new AbapDebugger(answering(status, headers, data)).terminateDebugger({
      analyse: analyseDebuggerFreed,
    });

  it.each([
    [
      'a plain 500 served as text/plain',
      { 'content-type': 'text/plain' },
      'Internal Server Error',
    ],
    ['a plain 500 with an empty body', {}, ''],
  ])('%s is no failure', async (_, headers, data) => {
    expect((await free(500, headers, data)).ok).toBe(true);
  });

  it.each([
    [
      'a 500 carrying an ADT exception document',
      500,
      { 'content-type': 'application/xml' },
      corpusBody('debugger-terminate--01-terminate-debuggee'),
    ],
    [
      'a 500 served as HTML',
      500,
      { 'content-type': 'text/html' },
      '<html><body>Internal Server Error</body></html>',
    ],
    [
      'a 400',
      400,
      { 'content-type': 'text/plain' },
      'Session no longer exists',
    ],
  ])('%s stays a failure', async (_, status, headers, data) => {
    expect((await free(status, headers, data)).ok).toBe(false);
  });
});
