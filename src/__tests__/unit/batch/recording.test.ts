/**
 * Recording in batch mode (spec §4.1, §4.3–§4.5): while a communication
 * batch is open, an eligible call's handler runs on a per-call recorder over
 * the open batch connection; the call returns nothing once its handler has
 * recorded everything it sends before an answer; every other tool is refused.
 *
 * The instance's connection is a fake that only counts: nothing here reaches
 * a system. The batch connection is adt-clients' own `AdtBatchConnection`
 * over the late-bound target; its `execute()` is never run here (Task 6).
 */
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import {
  BATCH_NO_TIMEOUT_WORDS,
  batchNotRecordableWords,
  batchNotServedWords,
} from '../../../lib/auth/serverRefusal';
import * as eligibility from '../../../lib/batch/eligibility';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import {
  LATE_BOUND_UNPOINTED_WORDS,
  LateBoundConnection,
} from '../../../lib/batch/lateBound';
import { createRecorder, untilSent } from '../../../lib/batch/recorder';
import { createAdtClient } from '../../../lib/clients';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import * as longCall from '../../../lib/longCall';
import * as packageSessions from '../../../lib/packageSessions';
import { currentRequestSignal } from '../../../lib/requestSignal';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** The instance's connection: answers at once and counts what reaches it. */
function fakeConnection() {
  const sent: IAbapRequestOptions[] = [];
  const connection = {
    connect: jest.fn(async () => undefined),
    getBaseUrl: jest.fn(async () => 'https://system.invalid'),
    getSessionId: () => null,
    setSessionType: jest.fn(),
    getSessionType: () => 'stateless' as const,
    makeAdtRequest: jest.fn(async (request: IAbapRequestOptions) => {
      sent.push(request);
      return { status: 200, statusText: 'OK', headers: {}, data: '' };
    }),
  };
  return { connection, sent };
}

type Handler = (context: HandlerContext, args: never) => Promise<unknown>;

/** A tool entry whose handler takes `(context, args)`. */
function tool(
  name: string,
  handler: Handler,
  inputSchema: Record<string, unknown> = {
    type: 'object',
    properties: { name: { type: 'string' } },
  },
  extra: Partial<HandlerEntry> = {},
): HandlerEntry {
  return {
    toolDefinition: { name, description: name, inputSchema },
    handler: handler as never,
    ...extra,
  } as HandlerEntry;
}

function groupOf(entries: HandlerEntry[]): IHandlerGroup {
  return {
    getName: () => 'recording-test',
    getHandlers: () => entries,
    registerHandlers: () => {},
  } as unknown as IHandlerGroup;
}

/** The shipped entry of `name`, its handler reading its own group's context. */
const VERSION_FROM =
  '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00001';
const VERSION_TO = '/sap/bc/adt/oo/classes/zcl_a/includes/main/versions/00002';

function shipped(name: string): IHandlerGroup {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  for (const group of [
    new ReadOnlyHandlersGroup(placeholder),
    new SearchHandlersGroup(placeholder),
  ]) {
    const entry = group
      .getHandlers()
      .find((e) => e.toolDefinition.name === name);
    if (entry === undefined) continue;
    return {
      getName: () => `shipped-${name}`,
      getHandlers: () => [entry],
      registerHandlers: () => {},
      setContext: (context: HandlerContext) => {
        (group as unknown as { context: HandlerContext }).context = context;
      },
    } as unknown as IHandlerGroup;
  }
  throw new Error(`no shipped group registers ${name}`);
}

/** One GET on the call's connection, then the handler's answer once it came. */
const oneGet =
  (url: string, before?: () => Promise<void>): Handler =>
  // Two parameters: the server hands `(context, args)` by the arity.
  async (context, _args) => {
    await before?.();
    await context.connection.makeAdtRequest({ url, method: 'GET', timeout: 0 });
    return { isError: false, content: [{ type: 'text', text: url }] };
  };

interface Stand {
  owner: InstanceBatch;
  batch: AdtBatchConnection;
  target: LateBoundConnection;
  /** Every request recorded into the batch connection, in order. */
  recorded: string[];
  execute: jest.SpyInstance;
  instance: ReturnType<typeof fakeConnection>;
  server: EmbeddableMcpServer;
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  close(): Promise<void>;
}

interface Answer {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

async function stand(
  groups: IHandlerGroup[],
  options: {
    registry?: IHandlersRegistry;
    open?: boolean;
    /** The system lookup; it may act on the stand (`onLookup`). */
    onLookup?: (s: Stand) => void;
    backgroundRuns?: boolean;
  } = {},
): Promise<Stand> {
  const instance = fakeConnection();
  const owner = new InstanceBatch({ keepRawParts: false });
  const target = new LateBoundConnection();
  const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
  const recorded: string[] = [];
  const record = batch.makeAdtRequest.bind(batch);
  batch.makeAdtRequest = ((request: IAbapRequestOptions) => {
    recorded.push(request.url);
    return record(request);
  }) as typeof batch.makeAdtRequest;
  const execute = jest.spyOn(batch, 'execute');
  if (options.open !== false) {
    owner.begin('communication', { connection: batch, target, recorded: [] });
  }
  const server = new EmbeddableMcpServer({
    connection: instance.connection as never,
    handlersRegistry: options.registry ?? new CompositeHandlersRegistry(groups),
    systemType: 'onprem',
    logger: silent as never,
    batch: owner,
    ...(options.onLookup !== undefined
      ? {
          systemContextResolver: async () => {
            options.onLookup?.(self);
            return null;
          },
        }
      : {}),
    // Never reached: a background run is refused before its strategy.
    ...(options.backgroundRuns === true ? { backgroundRuns: {} as never } : {}),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'recording', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const self: Stand = {
    owner,
    batch,
    target,
    recorded,
    execute,
    instance,
    server,
    call: (name, args = {}) =>
      client
        .callTool({ name, arguments: args })
        .then((answer) => answer as Answer),
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
  return self;
}

/** The `{ error, message }` of a server refusal's answer. */
function refusalOf(answer: Answer): { error?: string; message?: string } {
  expect(answer.isError).toBe(true);
  return JSON.parse(answer.content?.[0]?.text ?? '{}');
}

const recordedCalls = (s: Stand) =>
  s.owner.opened()?.recorded.map((r) => r.number) ?? [];

afterEach(() => {
  jest.restoreAllMocks();
});

describe('recording in batch mode', () => {
  it('an eligible call in batch mode answers { content: [] } before execute runs', async () => {
    const s = await stand([groupOf([tool('GetProgram', oneGet('/program'))])]);
    const answer = await s.call('GetProgram', { name: 'Z' });
    expect(answer).toEqual({ content: [] });
    expect(s.execute).not.toHaveBeenCalled();
    expect(s.recorded).toEqual(['/program']);
    expect(recordedCalls(s)).toEqual([1]);
    await s.close();
  });

  it("the instance's connection receives no makeAdtRequest while recording", async () => {
    const s = await stand([
      groupOf([tool('GetProgram', oneGet('/program'))]),
      shipped('GetClass'),
    ]);
    await s.call('GetProgram', { name: 'Z' });
    await s.call('GetClass', { class_name: 'ZCL_PLACEHOLDER' });
    expect(s.instance.connection.makeAdtRequest).not.toHaveBeenCalled();
    expect(s.recorded).toHaveLength(2);
    await s.close();
  });

  it('a handler with a pre-record delay: the envelope holds calls in call order', async () => {
    const delayed = () => new Promise<void>((r) => setTimeout(r, 30));
    const s = await stand([
      groupOf([
        tool('GetProgram', oneGet('/first', delayed)),
        tool('GetClass', oneGet('/second')),
      ]),
    ]);
    const answers = await Promise.all([
      s.call('GetProgram', { name: 'Z' }),
      s.call('GetClass', { name: 'Z' }),
    ]);
    expect(answers).toEqual([{ content: [] }, { content: [] }]);
    expect(s.recorded).toEqual(['/first', '/second']);
    expect(recordedCalls(s)).toEqual([1, 2]);
    await s.close();
  });

  it('a call sending two independent parts (GetObjectVersionDiff) takes one number for both', async () => {
    const s = await stand([
      shipped('GetObjectVersionDiff'),
      groupOf([tool('GetProgram', oneGet('/program'))]),
    ]);
    expect(
      await s.call('GetObjectVersionDiff', {
        object_type: 'class',
        content_uri_from: VERSION_FROM,
        content_uri_to: VERSION_TO,
      }),
    ).toEqual({ content: [] });
    expect(s.recorded).toEqual([VERSION_FROM, VERSION_TO]);
    expect(recordedCalls(s)).toEqual([1]);
    await s.call('GetProgram', { name: 'Z' });
    expect(recordedCalls(s)).toEqual([1, 2]);
    await s.close();
  });

  it("the call returns only after its second part is recorded: the next call's parts follow both, never between them", async () => {
    // The second part waits on microtasks only — no answer, no timer — as a
    // handler sending two independent requests does.
    const twoParts: Handler = async (context, _args) => {
      const first = context.connection.makeAdtRequest({
        url: '/a-1',
        method: 'GET',
        timeout: 0,
      });
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
      const second = context.connection.makeAdtRequest({
        url: '/a-2',
        method: 'GET',
        timeout: 0,
      });
      await Promise.all([first, second]);
      return { content: [{ type: 'text', text: 'both' }] };
    };
    const s = await stand([
      groupOf([tool('GetProgram', twoParts), tool('GetClass', oneGet('/b'))]),
    ]);
    await Promise.all([
      s.call('GetProgram', { name: 'Z' }),
      s.call('GetClass', { name: 'Z' }),
    ]);
    expect(s.recorded).toEqual(['/a-1', '/a-2', '/b']);
    expect(recordedCalls(s)).toEqual([1, 2]);
    await s.close();
  });

  it('eligible() receives the SDK-parsed arguments (a schema default applied, an unknown key stripped)', async () => {
    const asked = jest.spyOn(eligibility, 'eligible');
    let received: unknown;
    const s = await stand([
      groupOf([
        tool(
          'GetClass',
          async (context, args) => {
            received = args;
            return oneGet('/class')(context, args);
          },
          {
            type: 'object',
            properties: {
              class_name: { type: 'string' },
              version: { type: 'string', default: 'active' },
            },
            required: ['class_name'],
          },
        ),
      ]),
    ]);
    await s.call('GetClass', { class_name: 'ZCL_PLACEHOLDER', unknown: 1 });
    expect(asked).toHaveBeenCalledTimes(1);
    const [name, args, kind] = asked.mock.calls[0] ?? [];
    expect(name).toBe('GetClass');
    expect(args).toEqual({ class_name: 'ZCL_PLACEHOLDER', version: 'active' });
    expect(kind).toBe('http');
    // The same object the handler received.
    expect(args).toBe(received);
    await s.close();
  });

  it('an ineligible call is refused batch_not_recordable, its handler not called, no number taken', async () => {
    const update = jest.fn(oneGet('/update'));
    const s = await stand([
      groupOf([
        tool('UpdateDomain', update as Handler),
        tool('GetProgram', oneGet('/program')),
      ]),
    ]);
    const refused = refusalOf(await s.call('UpdateDomain', { name: 'Z' }));
    expect(refused).toEqual({
      error: 'batch_not_recordable',
      message: batchNotRecordableWords('UpdateDomain'),
    });
    expect(update).not.toHaveBeenCalled();
    expect(s.recorded).toEqual([]);
    await s.call('GetProgram', { name: 'Z' });
    expect(recordedCalls(s)).toEqual([1]);
    await s.close();
  });

  it('a handler that refuses its arguments before sending answers at once and takes no number', async () => {
    const s = await stand([
      groupOf([
        tool('GetClass', async () => ({
          isError: true,
          content: [{ type: 'text', text: 'class_name is required' }],
        })),
        tool('GetProgram', oneGet('/program')),
      ]),
    ]);
    const answer = await s.call('GetClass', { name: '' });
    expect(answer).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'class_name is required' }],
    });
    expect(recordedCalls(s)).toEqual([]);
    await s.call('GetProgram', { name: 'Z' });
    expect(recordedCalls(s)).toEqual([1]);
    await s.close();
  });

  it('while a batch is open a debugger tool, a leftover-session tool and a registry\'s own tool are refused "<tool> is not served while a batch is open"', async () => {
    const debug = jest.fn(oneGet('/debug'));
    const leftover = jest.fn(async () => ({ content: [] }));
    const s = await stand([
      groupOf([
        tool('DebugStep', debug as Handler),
        tool('ListLeftoverSessions', leftover as never, undefined, {
          connectionless: true,
        }),
      ]),
    ]);
    for (const name of ['DebugStep', 'ListLeftoverSessions']) {
      expect(refusalOf(await s.call(name, {}))).toEqual({
        error: 'batch_not_recordable',
        message: batchNotServedWords(name),
      });
    }
    expect(debug).not.toHaveBeenCalled();
    expect(leftover).not.toHaveBeenCalled();
    await s.close();

    // A registry that registers its own tools.
    const own = jest.fn(async () => ({
      content: [{ type: 'text', text: 'x' }],
    }));
    const registry = {
      registerAllTools(server: McpServer) {
        server.registerTool(
          'OwnTool',
          { description: 'own', inputSchema: { name: z.string().optional() } },
          own as never,
        );
      },
      registerTool() {},
    } as unknown as IHandlersRegistry;
    const r = await stand([], { registry });
    expect(refusalOf(await r.call('OwnTool', {}))).toEqual({
      error: 'batch_not_recordable',
      message: batchNotServedWords('OwnTool'),
    });
    expect(own).not.toHaveBeenCalled();
    expect(r.recorded).toEqual([]);
    await r.close();
  });

  it('a long read with independent requests is recorded: runLongCall and openFreshConnection not called', async () => {
    const run = jest.spyOn(longCall, 'runLongCall');
    const fresh = jest.spyOn(packageSessions, 'openFreshConnection');
    const s = await stand([shipped('SearchObject')]);
    const answer = await s.call('SearchObject', {
      object_name: 'ZPLACEHOLDER*',
    });
    expect(answer).toEqual({ content: [] });
    expect(run).not.toHaveBeenCalled();
    expect(fresh).not.toHaveBeenCalled();
    expect(s.recorded).toHaveLength(1);
    expect(s.recorded[0]).toContain('quickSearch');
    expect(s.instance.connection.makeAdtRequest).not.toHaveBeenCalled();
    expect(recordedCalls(s)).toEqual([1]);
    await s.close();
  });

  it('timeout given in batch mode is refused batch_no_timeout before recording', async () => {
    const s = await stand([shipped('SearchObject')]);
    const refused = refusalOf(
      await s.call('SearchObject', {
        object_name: 'ZPLACEHOLDER*',
        timeout: 30,
      }),
    );
    expect(refused).toEqual({
      error: 'batch_no_timeout',
      message: BATCH_NO_TIMEOUT_WORDS,
    });
    expect(s.recorded).toEqual([]);
    expect(recordedCalls(s)).toEqual([]);
    await s.close();
  });

  it("the recorded handler's request signal is the batch's: not aborted when the call ends", async () => {
    let seen: AbortSignal | undefined;
    const s = await stand([
      groupOf([
        tool('GetProgram', async (context, args) => {
          seen = currentRequestSignal();
          return oneGet('/program')(context, args);
        }),
      ]),
    ]);
    await s.call('GetProgram', { name: 'Z' });
    await s.server.idle();
    expect(seen).toBe(s.owner.signal());
    expect(seen?.aborted).toBe(false);
    await s.close();
  });

  it('a recorded handler is not in inFlight: idle() resolves while it waits', async () => {
    let settled = false;
    const s = await stand([
      groupOf([
        tool('GetProgram', async (context, args) => {
          const answer = await oneGet('/program')(context, args);
          settled = true;
          return answer;
        }),
      ]),
    ]);
    await s.call('GetProgram', { name: 'Z' });
    const idle = await Promise.race([
      s.server.idle().then(() => 'idle'),
      new Promise((r) => setTimeout(() => r('held'), 1000)),
    ]);
    expect(idle).toBe('idle');
    expect(settled).toBe(false); // its part waits for BatchEnd
    await s.close();
  });

  it("a recording call reaches the instance's connection through the target in its turn; the target is cleared when the call returns", async () => {
    const s = await stand([
      groupOf([
        tool('GetProgram', async (context, args) => {
          await context.connection.getBaseUrl();
          return oneGet('/program')(context, args);
        }),
      ]),
    ]);
    await s.call('GetProgram', { name: 'Z' });
    expect(s.instance.connection.getBaseUrl).toHaveBeenCalledTimes(1);
    await expect(s.target.getBaseUrl()).rejects.toThrow(
      LATE_BOUND_UNPOINTED_WORDS,
    );
    await s.close();
  });

  it('a background run in batch mode is not served: its handler not called, no number', async () => {
    const run = jest.fn(oneGet('/run'));
    const s = await stand(
      [
        groupOf([
          tool('RuntimeRunClass', run as Handler, {
            type: 'object',
            properties: {
              class_name: { type: 'string' },
              background: { type: 'boolean' },
            },
          }),
        ]),
      ],
      { backgroundRuns: true },
    );
    expect(
      refusalOf(
        await s.call('RuntimeRunClass', {
          class_name: 'ZCL_PLACEHOLDER',
          background: true,
        }),
      ),
    ).toEqual({
      error: 'batch_not_recordable',
      message: batchNotServedWords('RuntimeRunClass'),
    });
    expect(run).not.toHaveBeenCalled();
    expect(s.recorded).toEqual([]);
    expect(recordedCalls(s)).toEqual([]);
    await s.close();
  });

  it('a long read admitted on its own connection before the batch opened is not served once it opens: nothing recorded, no own connection', async () => {
    const run = jest.spyOn(longCall, 'runLongCall');
    const fresh = jest.spyOn(packageSessions, 'openFreshConnection');
    // The batch opens while the call is past its entry: during its system
    // lookup, which it makes in a turn of its own (it holds none).
    const s = await stand([shipped('SearchObject')], {
      open: false,
      onLookup: (stand) => {
        if (stand.owner.mode() === 'off') {
          stand.owner.begin('communication', {
            connection: stand.batch,
            target: stand.target,
            recorded: [],
          });
        }
      },
    });
    expect(
      refusalOf(await s.call('SearchObject', { object_name: 'ZPLACEHOLDER*' })),
    ).toEqual({
      error: 'batch_not_recordable',
      message: batchNotServedWords('SearchObject'),
    });
    expect(s.owner.mode()).toBe('communication');
    expect(run).not.toHaveBeenCalled();
    expect(fresh).not.toHaveBeenCalled();
    expect(s.recorded).toEqual([]);
    expect(recordedCalls(s)).toEqual([]);
    await s.close();
  });

  it('with no batch open nothing changes: the call goes to the instance connection', async () => {
    const s = await stand([groupOf([tool('GetProgram', oneGet('/program'))])], {
      open: false,
    });
    const answer = await s.call('GetProgram', { name: 'Z' });
    expect(answer).toEqual({ content: [{ type: 'text', text: '/program' }] });
    expect(s.instance.sent.map((r) => r.url)).toEqual(['/program']);
    expect(s.recorded).toEqual([]);
    await s.close();
  });
});

describe('the recorder, and untilSent: everything sent before an answer, by event-loop turns', () => {
  /** A recorder over a batch connection that keeps every request pending. */
  function pendingRecorder() {
    const owner = new InstanceBatch({ keepRawParts: false });
    const target = new LateBoundConnection();
    const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
    owner.begin('communication', { connection: batch, target, recorded: [] });
    const numbers: number[] = [];
    const recorder = createRecorder(
      batch,
      owner,
      (n) => numbers.push(n),
      'GetProgram',
    );
    const send = (url: string) => {
      void recorder.makeAdtRequest({ url, method: 'GET', timeout: 0 });
    };
    return { recorder, numbers, send };
  }
  const never = new Promise<never>(() => {});

  it('a request recorded while the turn runs starts another turn: every one is waited for', async () => {
    const { recorder, numbers, send } = pendingRecorder();
    const handler = (async () => {
      // Queued before the first request, so it runs inside the turn that
      // request starts — and queues one more for the turn after.
      setImmediate(() => {
        send('/2');
        setImmediate(() => send('/3'));
      });
      send('/1');
      return never;
    })();
    expect(await untilSent(handler, recorder)).toBe('recorded');
    expect(recorder.requests()).toBe(3);
    expect(numbers).toEqual([1]);
  });

  it('nothing recorded yet is no end: a handler recording after a delay is waited for', async () => {
    const { recorder, send } = pendingRecorder();
    const handler = (async () => {
      await new Promise((r) => setTimeout(r, 20));
      send('/late');
      return never;
    })();
    expect(await untilSent(handler, recorder)).toBe('recorded');
    expect(recorder.requests()).toBe(1);
  });

  it('a part answered 406 through an AdtClient over the recorder is not corrected and sent again', async () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const target = new LateBoundConnection();
    const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
    owner.begin('communication', { connection: batch, target, recorded: [] });
    // A batch connection whose every part comes back 406 at once, naming a
    // supported Accept: what negotiation would correct and resend.
    const sent: IAbapRequestOptions[] = [];
    batch.makeAdtRequest = (async (request: IAbapRequestOptions) => {
      sent.push(request);
      throw Object.assign(new Error('Request failed with status code 406'), {
        response: {
          status: 406,
          statusText: 'Not Acceptable',
          headers: { accept: 'application/vnd.sap.adt.placeholder+xml' },
          data: '',
        },
      });
    }) as typeof batch.makeAdtRequest;
    const recorder = createRecorder(
      batch,
      owner,
      () => undefined,
      'GetProgram',
    );
    createAdtClient(recorder);
    const answered = recorder.makeAdtRequest({
      url: '/sap/bc/adt/placeholder',
      method: 'GET',
      timeout: 0,
      headers: { Accept: 'application/xml' },
    });
    // The handler meets its part when its number is read.
    recorder.release();
    await expect(answered).rejects.toMatchObject({
      response: { status: 406 },
    });
    expect(sent).toHaveLength(1);
  });

  it('a batch connection that throws while recording takes no number: the next recorded request takes 1', () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const target = new LateBoundConnection();
    const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
    owner.begin('communication', { connection: batch, target, recorded: [] });
    const numbers: number[] = [];
    const record = batch.makeAdtRequest.bind(batch);
    let refuse = true;
    batch.makeAdtRequest = ((request: IAbapRequestOptions) => {
      if (refuse) throw new Error('the batch connection refused the request');
      return record(request);
    }) as typeof batch.makeAdtRequest;
    const recorder = createRecorder(
      batch,
      owner,
      (n) => numbers.push(n),
      'GetProgram',
    );
    expect(() =>
      recorder.makeAdtRequest({ url: '/refused', method: 'GET', timeout: 0 }),
    ).toThrow('the batch connection refused the request');
    expect(recorder.number()).toBeUndefined();
    expect(recorder.requests()).toBe(0);
    expect(numbers).toEqual([]);
    refuse = false;
    void recorder.makeAdtRequest({ url: '/kept', method: 'GET', timeout: 0 });
    expect(recorder.number()).toBe(1);
    expect(numbers).toEqual([1]);
  });

  it('a handler settling without a request is settled, with no number', async () => {
    const { recorder, numbers } = pendingRecorder();
    const handler = (async () => ({ content: [] }))();
    expect(await untilSent(handler, recorder)).toBe('settled');
    expect(recorder.number()).toBeUndefined();
    expect(numbers).toEqual([]);
  });
});
