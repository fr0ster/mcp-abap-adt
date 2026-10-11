import { analyseDebuggerFreed } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
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
/** The system's 409 to a listener or a check while another IDE holds the user (recorded on premise, sanitised). */
export const CONFLICT_409 = () =>
  refusedResponse('An exception was raised', {
    response: {
      status: 409,
      headers: { 'content-type': 'application/xml' },
      data: corpusBody('debugger-conflict--01-listen-refused'),
    },
  } as unknown as Partial<IAdtError>);
/**
 * The system's refusal of a request user: `403 notAuthorized` or `404
 * invalidUser`, in the `exc:exception` shape every ADT refusal takes. Built
 * from the shape measured on premise (2026-10-11), BASIS 816, for a request
 * user that does not exist; the user is the placeholder `SAPUSER03`.
 */
export const USER_REFUSED = (
  status: 403 | 404,
  subType: string,
  text = 'User SAPUSER03 does not exist',
) =>
  refusedResponse('An exception was raised', {
    response: {
      status,
      headers: { 'content-type': 'application/xml' },
      data: `<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt"/><type id="AdiFailed"/><message lang="EN">${text}</message><localizedMessage lang="EN">${text}</localizedMessage><properties><entry key="com.sap.adt.communicationFramework.subType">${subType}</entry></properties></exc:exception>`,
    },
  } as unknown as Partial<IAdtError>);
export const NOT_AUTHORIZED = () => USER_REFUSED(403, 'notAuthorized');
export const INVALID_USER = () => USER_REFUSED(404, 'invalidUser');
/** The default strategies' shapes: `done` answers nothing (adt-clients `nothing`). */
export const DONE = () => okResponse(undefined);

export interface WireCall {
  call: string;
  /** The fake connection's id: the index in `opened`. */
  connection: number;
  args: unknown[];
}

/** A breakpoints answer with these rows, in this order; `uri` and `error` are written the way the system names them. */
export const rowsXml = (rows: Array<Record<string, string>>) =>
  `<?xml version="1.0" encoding="utf-8"?><dbg:breakpoints xmlns:dbg="http://www.sap.com/adt/debugger" xmlns:adtcore="http://www.sap.com/adt/core">${rows
    .map(
      (r) =>
        `<breakpoint ${Object.entries(r)
          .map(
            ([k, v]) =>
              `${k === 'uri' ? 'adtcore:uri' : k === 'error' ? 'errorMessage' : k}="${v}"`,
          )
          .join(' ')}/>`,
    )
    .join('')}</dbg:breakpoints>`;

/** A conforming answer: every row sent is placed, its tag echoed, its id the fake's own. */
export const placeAll = (list: Array<Record<string, any>>) =>
  rowsXml(
    list.map((b, i) => {
      const row: Record<string, string> = { kind: b.kind, id: `ID${i + 1}` };
      for (const k of [
        'clientId',
        'uri',
        'exceptionClass',
        'statement',
        'msgId',
        'msgNo',
        'msgTy',
        'condition',
      ])
        if (b[k] !== undefined) row[k] = String(b[k]);
      return row;
    }),
  );

/** A settings answer: the six attributes in force (the shape measured on premise (2026-10-11), BASIS 816). */
export const settingsXml = (s: Record<string, boolean | undefined> = {}) => {
  const v = (k: string) => String(s[k] ?? false);
  return `<?xml version="1.0" encoding="utf-8"?><dbg:settings xmlns:dbg="http://www.sap.com/adt/debugger" systemDebugging="${v('systemDebugging')}" createExceptionObject="${v('createExceptionObject')}" backgroundRFC="${v('backgroundRFC')}" sharedObjectDebugging="${v('sharedObjectDebugging')}" showDataAging="false" updateDebugging="${v('updateDebugging')}"/>`;
};

export function fakeWorld() {
  const log: WireCall[] = [];
  const polls: Array<ReturnType<typeof deferred<any>> & { hold?: number }> = [];
  const opened: IAbapConnection[] = [];
  const closed: IAbapConnection[] = [];
  /** Connections dropped without a request: their ABAP session was freed by the system. */
  const dropped: IAbapConnection[] = [];
  const calls: string[] = [];
  const modes: string[] = [];
  const run = deferred<RunOutcome>();
  const stepAnswers: any[] = [];
  const attachAnswers: Array<() => Promise<any>> = [];
  /** What the next checkListener answers, in order; free (`done`) when none is left. */
  const checkAnswers: Array<() => any> = [];
  let validationAnswers: Array<() => any> = [];
  /** Every list setBreakpoints was sent, in order. */
  const sent: any[][] = [];
  /** What the next setBreakpoints answers, in order; every row placed (`placeAll`) when none is left. */
  const breakpointAnswers: Array<(sent: any[]) => any> = [];
  /** What the next setDebuggerSettings answers, in order; the settings sent echoed (`settingsXml`) when none is left. */
  const settingsAnswers: Array<() => any> = [];
  /** Members put here replace the fake's on every debugger, cached ones included. */
  const override: Record<string, any> = {};
  const make = (connection: IAbapConnection): Debugger => {
    const members: Record<string, any> = {
      listen: (_i: unknown, o: any) => {
        calls.push(`listen:${o?.holdSeconds}`);
        const d = deferred<any>();
        polls.push(Object.assign(d, { hold: o?.holdSeconds }));
        return d.promise;
      },
      checkListener: async () => {
        calls.push('checkListener');
        return (checkAnswers.shift() ?? DONE)();
      },
      stopListener: async () => {
        calls.push('stopListener');
        // As the system does: the open poll answers, empty, once the listener is stopped.
        for (const p of polls) p.resolve(LISTEN_NOTHING());
        return DONE();
      },
      attach: async (_identity: unknown, id: string, o: any) => {
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
      detachDebugger: async () => {
        calls.push('detachDebugger');
        return DONE();
      },
      terminateDebugger: async (o: any) => {
        calls.push(
          `terminateDebugger:${o?.analyse === analyseDebuggerFreed ? 'freed' : 'other'}`,
        );
        return DONE();
      },
      setBreakpoints: async (_i: unknown, list: any[], o: any) => {
        if (o?.validationOnly) {
          calls.push(`validate:${list.length}`);
          return (validationAnswers.shift() ?? (() => okResponse('')))();
        }
        calls.push(`setBreakpoints:${list.length}`);
        sent.push(list);
        return (
          breakpointAnswers.shift() ?? ((l: any[]) => okResponse(placeAll(l)))
        )(list);
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
      setDebuggerSettings: async (s: Record<string, boolean>) => {
        calls.push(`settings:${JSON.stringify(s)}`);
        return (
          settingsAnswers.shift() ?? (() => okResponse(settingsXml(s)))
        )();
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
    };
    return new Proxy(members, {
      get: (target, key: string) => {
        const member = override[key] ?? target[key];
        if (typeof member !== 'function') return member;
        return (...args: unknown[]) => {
          log.push({
            call: key,
            connection: (connection as unknown as { id: number }).id,
            args,
          });
          return member(...args);
        };
      },
    }) as unknown as Debugger;
  };
  const ports: DebugSessionPorts<string> = {
    openConnection: async () => {
      const c = { id: opened.length } as unknown as IAbapConnection;
      opened.push(c);
      return c;
    },
    closeConnection: async (c) => {
      closed.push(c);
    },
    dropConnection: (c) => {
      dropped.push(c);
    },
    abapDebugger: (c, mode) => {
      modes.push(String(mode));
      return make(c);
    },
    requestUser: async () => 'SAPUSER01',
    run: async () => run.promise,
  };
  return {
    ports,
    polls,
    opened,
    closed,
    dropped,
    calls,
    log,
    modes,
    run,
    stepAnswers,
    attachAnswers,
    checkAnswers,
    sent,
    breakpointAnswers,
    settingsAnswers,
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
