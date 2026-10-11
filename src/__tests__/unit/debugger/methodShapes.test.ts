/**
 * What AbapDebugger's members answer through their default strategies, on the
 * recorded endpoint answers: the fakes in fakes.ts return exactly this.
 */
import { AbapDebugger } from '@mcp-abap-adt/adt-clients';
import { analyseDebuggeeEnd } from '@mcp-abap-adt/adt-strategies';
import type {
  IAbapConnection,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody, corpusSidecar } from '../../../lib/adtCorpus';
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
  requestUser: 'SAPUSER01',
  terminalId: 'T'.repeat(32),
  ideId: 'I'.repeat(32),
};
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
    (d) => d.attach('SAPUSER01', 'X', {}),
  ],
  ['getStack', 'debugger-run-to-line--04-stack', (d) => d.getStack()],
  [
    'getVariables',
    'debugger-run-to-line--07-variables-at-write',
    (d) => d.getVariables(['LV_COUNTER']),
  ],
  [
    'getChildVariables',
    'debugger-conversation--07-children-root',
    (d) => d.getChildVariables(['@ROOT']),
  ],
  [
    'stepToLine',
    'debugger-run-to-line--05-stepruntoline',
    (d) => d.stepToLine('stepRunToLine', '/x#start=1'),
  ],
  [
    'setBreakpoints',
    'debugger-conversation--01-breakpoints-set',
    (d) => d.setBreakpoints(IDENTITY, []),
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
