import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { corpusBody } from '../../../lib/adtCorpus';
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
          okResponse('<dbg:memorySizes xmlns:dbg="x"/>'),
        createMemorySnapshot: async () =>
          okResponse('<dbg:action xmlns:dbg="x"/>'),
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
    abapDebugger: () => make(),
    requestUser: async () => 'SAPUSER01',
    run: async () => run.promise,
  };
  return {
    ports,
    polls,
    opened,
    closed,
    calls,
    run,
    stepAnswers,
    attachAnswers,
    override,
    setValidationAnswers: (a: Array<() => any>) => {
      validationAnswers = a;
    },
  };
}

// AMDP debugger answers, in the shapes the adt-clients AMDP integration test
// reads them; Task 14 replaces these with recorded answers.
export const AMDP_START = {
  headers: {
    location: '/sap/bc/adt/amdp/debugger/main/0123456789ABCDEF0123456789ABCDEF',
  },
  data: '<amdpdbg:startResponse xmlns:amdpdbg="x"><amdpdbg:property amdpdbg:key="HANA_SESSION_ID" amdpdbg:value="123"/></amdpdbg:startResponse>',
};
export const AMDP_SYNCED = (requestId: string) =>
  `<amdpdbg:events xmlns:amdpdbg="x"><amdpdbg:mainResponse amdpdbg:kind="SYNC_BREAKPOINTS" amdpdbg:requestId="${requestId}"><amdpdbg:breakpoint amdpdbg:state="PENDING"/></amdpdbg:mainResponse></amdpdbg:events>`;
export const AMDP_BREAK =
  '<amdpdbg:events xmlns:amdpdbg="x" xmlns:adtcore="y"><amdpdbg:mainResponse amdpdbg:kind="ON_BREAK" amdpdbg:requestId="R1" amdpdbg:debuggeeId="D1"><amdpdbg:abapPosition adtcore:uri="/sap/bc/adt/oo/classes/zcl_a/source/main#start=14"/><amdpdbg:variable amdpdbg:name="LV_I">1</amdpdbg:variable><amdpdbg:variable amdpdbg:name="LV_N" amdpdbg:isNullValue="true"/></amdpdbg:mainResponse></amdpdbg:events>';
export const AMDP_END =
  '<amdpdbg:events xmlns:amdpdbg="x"><amdpdbg:mainResponse amdpdbg:kind="ON_EXECUTION_END" amdpdbg:requestId="R2" amdpdbg:debuggeeId="D1"/></amdpdbg:events>';
