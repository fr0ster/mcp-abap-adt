import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody, corpusSidecar } from '../../../lib/adtCorpus';
import type {
  Debugger,
  DebugSessionPorts,
  RunOutcome,
} from '../../../lib/debugger/DebugSession';
import { okResponse, refusedResponse } from '../../helpers/fakeClient';

export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Advance microtasks until `cond` holds — a poll is created only after the awaits before it. */
export async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !cond(); i++)
    await jest.advanceTimersByTimeAsync(0);
  if (!cond()) throw new Error('condition never held');
}

export const IDS = { terminalId: 'T'.repeat(32), ideId: 'I'.repeat(32) };
export const LISTEN_CATCH = () =>
  okResponse(corpusBody('debugger-run-to-line--02-listen'));
export const LISTEN_NOTHING = () => okResponse('');
export const CONFLICT = () =>
  refusedResponse('Another debugger is already listening (SY 530)');
/** The default strategies' shapes: `done` answers nothing (adt-clients `nothing`). */
export const DONE = () => okResponse(undefined);

export function fakeWorld() {
  const polls: Array<ReturnType<typeof deferred<any>> & { hold?: number }> = [];
  const opened: IAbapConnection[] = [];
  const closed: IAbapConnection[] = [];
  const calls: string[] = [];
  const modes: string[] = [];
  const run = deferred<RunOutcome>();
  const stepAnswers: any[] = [];
  const attachAnswers: Array<() => Promise<any>> = [];
  let validationAnswers: Array<() => any> = [];
  /** Members put here replace the fake's on every debugger, cached ones included. */
  const override: Record<string, any> = {};
  const make = (): Debugger =>
    new Proxy(
      {
        listen: (_i: unknown, o: any) => {
          calls.push(`listen:${o?.holdSeconds}`);
          const d = deferred<any>();
          polls.push(Object.assign(d, { hold: o?.holdSeconds }));
          return d.promise;
        },
        stopListener: async () => {
          calls.push('stopListener');
          // As the system does: the open poll answers, empty, once the listener is stopped.
          for (const p of polls) p.resolve(LISTEN_NOTHING());
          return DONE();
        },
        attach: async (_u: string, id: string, o: any) => {
          calls.push(`attach:${id}:${o?.server}`);
          return (
            attachAnswers.shift() ??
            (async () =>
              okResponse(corpusBody('debugger-run-to-line--03-attach')))
          )();
        },
        getStack: async () => {
          calls.push('getStack');
          return okResponse(corpusBody('debugger-run-to-line--04-stack'));
        },
        getVariables: async () => {
          calls.push('getVariables');
          return okResponse(
            corpusBody('debugger-run-to-line--07-variables-at-write'),
          );
        },
        getChildVariables: async () => {
          calls.push('getChildVariables');
          return okResponse(
            corpusBody('debugger-conversation--07-children-root'),
          );
        },
        step: async (m: string, o: any) => {
          calls.push(`step:${m}:${o?.analyse ? 'analysed' : 'plain'}`);
          return (
            stepAnswers.shift() ??
            okResponse(corpusBody('debugger-run-to-line--05-stepruntoline'))
          );
        },
        stepToLine: async (m: string, uri: string) => {
          calls.push(`stepToLine:${m}:${uri}`);
          return (
            stepAnswers.shift() ??
            okResponse(corpusBody('debugger-run-to-line--05-stepruntoline'))
          );
        },
        terminateDebuggee: async (o: any) => {
          calls.push(`terminate:${o?.analyse ? 'analysed' : 'plain'}`);
          return DONE();
        },
        setBreakpoints: async (_i: unknown, list: any[], o: any) => {
          if (o?.validationOnly) {
            calls.push(`validate:${list.length}`);
            return (validationAnswers.shift() ?? (() => okResponse('')))();
          }
          calls.push(`setBreakpoints:${list.length}`);
          return okResponse(
            corpusBody('debugger-conversation--01-breakpoints-set'),
          );
        },
        deleteBreakpoint: async (_i: unknown, id: string) => {
          calls.push(`deleteBreakpoint:${id}`);
          return DONE();
        },
        setStackPosition: async (p: number) => {
          calls.push(`setStackPosition:${p}`);
          return DONE();
        },
        setVariableValue: async (n: string) => {
          calls.push(`setVariableValue:${n}`);
          return okResponse(
            corpusBody('debugger-run-to-line--07-variables-at-write'),
          );
        },
        createWatchpoint: async () =>
          okResponse('<dbg:watchpoints xmlns:dbg="x"/>'),
        listWatchpoints: async () =>
          okResponse('<dbg:watchpoints xmlns:dbg="x"/>'),
        deleteWatchpoint: async () => DONE(),
        getMemorySizes: async () =>
          okResponse(corpusBody('debugger-memory--01-memory-sizes')),
        createMemorySnapshot: async () =>
          okResponse(corpusBody('debugger-memory--02-create-memory-snapshot')),
      } as Record<string, any>,
      { get: (target, key: string) => override[key] ?? target[key] },
    ) as unknown as Debugger;
  const ports: DebugSessionPorts<string> = {
    openConnection: async () => {
      const c = { id: opened.length } as unknown as IAbapConnection;
      opened.push(c);
      return c;
    },
    closeConnection: async (c) => {
      closed.push(c);
    },
    abapDebugger: (_c, mode) => {
      modes.push(String(mode));
      return make();
    },
    requestUser: async () => 'SAPUSER01',
    run: async () => run.promise,
  };
  return {
    ports,
    polls,
    opened,
    closed,
    calls,
    modes,
    run,
    stepAnswers,
    attachAnswers,
    override,
    setValidationAnswers: (a: Array<() => any>) => {
      validationAnswers = a;
    },
  };
}

// AMDP debugger answers as recorded on premise (2026-10-11, sanitised): the
// start, the events of one sync, a break, the end of a debuggee and a stop.
// Only the ids a test addresses are put in: a sync's request id, a debuggee.
const RECORDED_DEBUGGEE = /amdpdbg:debuggeeId="([^"]+)"/.exec(
  corpusBody('amdp-debugger--05-events-on-break'),
)![1];
const withDebuggee = (xml: string, debuggeeId: string) =>
  xml.split(RECORDED_DEBUGGEE).join(debuggeeId);

export const AMDP_START = {
  headers: corpusSidecar('amdp-debugger--01-start').response.headers,
  data: corpusBody('amdp-debugger--01-start'),
};
/** The session id the recorded start names in its Location. */
export const AMDP_MAIN_ID = String(AMDP_START.headers.location)
  .split('/')
  .pop()!;
/** The recorded SYNC_BREAKPOINTS event, under the request id a sync was answered with. */
export const AMDP_SYNCED = (requestId: string) => {
  const xml = corpusBody('amdp-debugger--03-events-sync-breakpoints');
  const recorded = /amdpdbg:requestId="([^"]+)"/.exec(xml)![1];
  return xml.split(recorded).join(requestId);
};
/** The recorded ON_BREAK (line 27 of the probe class), for the debuggee named. */
export const amdpBreak = (debuggeeId = 'D1') =>
  withDebuggee(corpusBody('amdp-debugger--05-events-on-break'), debuggeeId);
/** The recorded ON_EXECUTION_END, for the debuggee named. */
export const amdpEnd = (debuggeeId = 'D1') =>
  withDebuggee(
    corpusBody('amdp-debugger--06-events-on-execution-end'),
    debuggeeId,
  );
export const AMDP_BREAK = amdpBreak();
export const AMDP_BREAK_LINE = 27;
export const AMDP_END = amdpEnd();
/** What the open event read answers once the session is stopped. */
export const AMDP_STOPPED = corpusBody('amdp-debugger--09-events-stop');
