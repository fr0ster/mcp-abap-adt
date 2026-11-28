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

import assert from 'node:assert/strict';
import { afterEach, describe, it, type Mock, mock } from 'node:test';
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import {
  BATCH_NO_BACKGROUND_WORDS,
  batchNotRecordableWords,
  batchNotServedWords,
} from '../../../lib/auth/serverRefusal';
import * as eligibility from '../../../lib/batch/eligibility';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import {
  LATE_BOUND_UNPOINTED_WORDS,
  LateBoundConnection,
} from '../../../lib/batch/lateBound';
import {
  batchTarget,
  createRecorder,
  untilSent,
} from '../../../lib/batch/recorder';
import { callTransportRequest } from '../../../lib/callTransport';
import { createAdtClient } from '../../../lib/clients';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import * as longCall from '../../../lib/longCall';
import * as packageSessions from '../../../lib/packageSessions';
import { currentRequestSignal } from '../../../lib/requestSignal';
import {
  assertMatchObject,
  assertRejects,
  assertThrows,
  rejectionOf,
} from '../../helpers/assertions';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** The instance's connection: answers at once and counts what reaches it. */
function fakeConnection() {
  const sent: IAbapRequestOptions[] = [];
  const connection = {
    connect: mock.fn(async () => undefined),
    getBaseUrl: mock.fn(async () => 'https://system.invalid'),
    getSessionId: () => null,
    setSessionType: mock.fn(),
    getSessionType: () => 'stateless' as const,
    makeAdtRequest: mock.fn(async (request: IAbapRequestOptions) => {
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
  inputSchema: z.ZodObject = z.object({ name: z.string().optional() }),
  extra: Partial<HandlerEntry> = {},
): HandlerEntry {
  return {
    toolDefinition: { name, description: name, inputSchema },
    call: handler as never,
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
function shipped(name: string): IHandlerGroup {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  for (const group of [new CompactReadOnlyHandlersGroup(placeholder)]) {
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
  execute: Mock<AdtBatchConnection['execute']>;
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
  const execute = mock.method(batch, 'execute');
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
  assert.equal(answer.isError, true);
  return JSON.parse(answer.content?.[0]?.text ?? '{}');
}

const recordedCalls = (s: Stand) =>
  s.owner.opened()?.recorded.map((r) => r.number) ?? [];

afterEach(() => {
  mock.restoreAll();
});

describe('recording in batch mode', () => {
  it('an eligible call in batch mode answers { content: [] } before execute runs', async () => {
    const s = await stand([
      groupOf([tool('HandlerServiceBindingListTypes', oneGet('/program'))]),
    ]);
    const answer = await s.call('HandlerServiceBindingListTypes', {
      name: 'Z',
    });
    assert.deepStrictEqual(answer, { content: [] });
    assert.equal(s.execute.mock.callCount(), 0);
    assert.deepStrictEqual(s.recorded, ['/program']);
    assert.deepStrictEqual(recordedCalls(s), [1]);
    await s.close();
  });

  it("the instance's connection receives no makeAdtRequest while recording", async () => {
    const s = await stand([
      groupOf([tool('HandlerServiceBindingListTypes', oneGet('/program'))]),
      shipped('HandlerGet'),
    ]);
    await s.call('HandlerServiceBindingListTypes', { name: 'Z' });
    await s.call('HandlerGet', {
      object_type: 'CLASS',
      class_name: 'ZCL_PLACEHOLDER',
    });
    assert.equal(s.instance.connection.makeAdtRequest.mock.callCount(), 0);
    assert.equal(s.recorded.length, 2);
    await s.close();
  });

  it('a handler with a pre-record delay: the envelope holds calls in call order', async () => {
    const delayed = () => new Promise<void>((r) => setTimeout(r, 30));
    const s = await stand([
      groupOf([
        tool('HandlerServiceBindingListTypes', oneGet('/first', delayed)),
        tool('HandlerProfileList', oneGet('/second')),
      ]),
    ]);
    const answers = await Promise.all([
      s.call('HandlerServiceBindingListTypes', { name: 'Z' }),
      s.call('HandlerProfileList', { name: 'Z' }),
    ]);
    assert.deepStrictEqual(answers, [{ content: [] }, { content: [] }]);
    assert.deepStrictEqual(s.recorded, ['/first', '/second']);
    assert.deepStrictEqual(recordedCalls(s), [1, 2]);
    await s.close();
  });

  it('a call sending independent parts (HandlerGet part draft) takes one number for all', async () => {
    const s = await stand([
      shipped('HandlerGet'),
      groupOf([tool('HandlerServiceBindingListTypes', oneGet('/program'))]),
    ]);
    assert.deepStrictEqual(
      await s.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
        part: 'draft',
      }),
      { content: [] },
    );
    // The three versions of the one part, sent together.
    assert.equal(s.recorded.length, 3);
    assert.equal(
      s.recorded.every((url) => url.includes('prog_a')),
      true,
    );
    assert.deepStrictEqual(recordedCalls(s), [1]);
    await s.call('HandlerServiceBindingListTypes', { name: 'Z' });
    assert.deepStrictEqual(recordedCalls(s), [1, 2]);
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
      groupOf([
        tool('HandlerServiceBindingListTypes', twoParts),
        tool('HandlerProfileList', oneGet('/b')),
      ]),
    ]);
    await Promise.all([
      s.call('HandlerServiceBindingListTypes', { name: 'Z' }),
      s.call('HandlerProfileList', { name: 'Z' }),
    ]);
    assert.deepStrictEqual(s.recorded, ['/a-1', '/a-2', '/b']);
    assert.deepStrictEqual(recordedCalls(s), [1, 2]);
    await s.close();
  });

  it('eligible() receives the SDK-parsed arguments (a schema default applied, an unknown key stripped)', async (t) => {
    const asked = t.mock.method(eligibility, 'eligible');
    let received: unknown;
    const s = await stand([
      groupOf([
        tool(
          'HandlerProfileList',
          async (context, args) => {
            received = args;
            return oneGet('/class')(context, args);
          },
          z.object({
            class_name: z.string(),
            version: z.string().default('active').optional(),
          }),
        ),
      ]),
    ]);
    await s.call('HandlerProfileList', {
      class_name: 'ZCL_PLACEHOLDER',
      unknown: 1,
    });
    assert.equal(asked.mock.callCount(), 1);
    const [name, args, kind] = asked.mock.calls[0]?.arguments ?? [];
    assert.equal(name, 'HandlerProfileList');
    assert.deepStrictEqual(args, {
      class_name: 'ZCL_PLACEHOLDER',
      version: 'active',
    });
    assert.equal(kind, 'http');
    // The same object the handler received.
    assert.equal(args, received);
    await s.close();
  });

  it('an ineligible call is refused batch_not_recordable, its handler not called, no number taken', async () => {
    const update = mock.fn(oneGet('/update'));
    const s = await stand([
      groupOf([
        tool('UpdateDomain', update as Handler),
        tool('HandlerServiceBindingListTypes', oneGet('/program')),
      ]),
    ]);
    const refused = refusalOf(await s.call('UpdateDomain', { name: 'Z' }));
    assert.deepStrictEqual(refused, {
      error: 'batch_not_recordable',
      message: batchNotRecordableWords('UpdateDomain'),
    });
    assert.equal(update.mock.callCount(), 0);
    assert.deepStrictEqual(s.recorded, []);
    await s.call('HandlerServiceBindingListTypes', { name: 'Z' });
    assert.deepStrictEqual(recordedCalls(s), [1]);
    await s.close();
  });

  it('a handler that refuses its arguments before sending answers at once and takes no number', async () => {
    const s = await stand([
      groupOf([
        tool('HandlerProfileList', async () => ({
          isError: true,
          content: [{ type: 'text', text: 'class_name is required' }],
        })),
        tool('HandlerServiceBindingListTypes', oneGet('/program')),
      ]),
    ]);
    const answer = await s.call('HandlerProfileList', { name: '' });
    assert.deepStrictEqual(answer, {
      isError: true,
      content: [{ type: 'text', text: 'class_name is required' }],
    });
    assert.deepStrictEqual(recordedCalls(s), []);
    await s.call('HandlerServiceBindingListTypes', { name: 'Z' });
    assert.deepStrictEqual(recordedCalls(s), [1]);
    await s.close();
  });

  it('while a batch is open a debugger tool, a leftover-session tool and a registry\'s own tool are refused "<tool> is not served while a batch is open"', async () => {
    const debug = mock.fn(oneGet('/debug'));
    const leftover = mock.fn(async () => ({ content: [] }));
    const s = await stand([
      groupOf([
        tool('DebugStep', debug as Handler),
        tool('ListLeftoverSessions', leftover as never, undefined, {
          connectionless: true,
        }),
      ]),
    ]);
    for (const name of ['DebugStep', 'ListLeftoverSessions']) {
      assert.deepStrictEqual(refusalOf(await s.call(name, {})), {
        error: 'batch_not_recordable',
        message: batchNotServedWords(name),
      });
    }
    assert.equal(debug.mock.callCount(), 0);
    assert.equal(leftover.mock.callCount(), 0);
    await s.close();

    // A registry that registers its own tools.
    const own = mock.fn(async () => ({
      content: [{ type: 'text', text: 'x' }],
    }));
    const registry = {
      registerAllTools(server: McpServer) {
        server.registerTool(
          'OwnTool',
          {
            description: 'own',
            inputSchema: z.object({ name: z.string().optional() }),
          },
          own as never,
        );
      },
      registerTool() {},
    } as unknown as IHandlersRegistry;
    const r = await stand([], { registry });
    assert.deepStrictEqual(refusalOf(await r.call('OwnTool', {})), {
      error: 'batch_not_recordable',
      message: batchNotServedWords('OwnTool'),
    });
    assert.equal(own.mock.callCount(), 0);
    assert.deepStrictEqual(r.recorded, []);
    await r.close();
  });

  it('a long read with independent requests is recorded: runLongCall and openFreshConnection not called', async (t) => {
    const run = t.mock.method(longCall, 'runLongCall');
    const fresh = t.mock.method(packageSessions, 'openFreshConnection');
    const s = await stand([shipped('HandlerSystem')]);
    const answer = await s.call('HandlerSystem', {
      action: 'search_object',
      object_name: 'ZPLACEHOLDER*',
    });
    assert.deepStrictEqual(answer, { content: [] });
    assert.equal(run.mock.callCount(), 0);
    assert.equal(fresh.mock.callCount(), 0);
    assert.equal(s.recorded.length, 1);
    assert.ok(s.recorded[0].includes('quickSearch'));
    assert.equal(s.instance.connection.makeAdtRequest.mock.callCount(), 0);
    assert.deepStrictEqual(recordedCalls(s), [1]);
    await s.close();
  });

  it('background: true given in batch mode is refused batch_no_background before recording', async () => {
    // A server that lists `background`: a strategy and the tool reading its runs.
    const s = await stand(
      [
        shipped('HandlerSystem'),
        new BackgroundRunHandlersGroup(noConnectionContext()),
      ],
      { backgroundRuns: true },
    );
    const refused = refusalOf(
      await s.call('HandlerSystem', {
        action: 'search_object',
        object_name: 'ZPLACEHOLDER*',
        background: true,
      }),
    );
    assert.deepStrictEqual(refused, {
      error: 'batch_no_background',
      message: BATCH_NO_BACKGROUND_WORDS,
    });
    assert.deepStrictEqual(s.recorded, []);
    assert.deepStrictEqual(recordedCalls(s), []);
    await s.close();
  });

  it("the recorded handler's request signal is the batch's: not aborted when the call ends", async () => {
    let seen: AbortSignal | undefined;
    const s = await stand([
      groupOf([
        tool('HandlerServiceBindingListTypes', async (context, args) => {
          seen = currentRequestSignal();
          return oneGet('/program')(context, args);
        }),
      ]),
    ]);
    await s.call('HandlerServiceBindingListTypes', { name: 'Z' });
    await s.server.idle();
    assert.equal(seen, s.owner.signal());
    assert.equal(seen?.aborted, false);
    await s.close();
  });

  it("the recorded handler runs with the call's own transport_request (the failure renderer's transport hint)", async (t) => {
    t.mock.method(eligibility, 'eligible', () => ({ ok: true }) as never);
    let seen: string | undefined;
    const s = await stand([
      groupOf([
        tool(
          'HandlerServiceBindingListTypes',
          async (context, args) => {
            seen = callTransportRequest();
            return oneGet('/program')(context, args);
          },
          z.object({
            name: z.string().optional(),
            transport_request: z.string().optional(),
          }),
        ),
      ]),
    ]);
    const answered = await s.call('HandlerServiceBindingListTypes', {
      name: 'Z',
      transport_request: 'SIDK900001',
    });
    assert.deepStrictEqual(answered, { content: [] });
    await s.server.idle();
    assert.equal(seen, 'SIDK900001');
    await s.close();
  });

  it('a recorded handler is not in inFlight: idle() resolves while it waits', async () => {
    let settled = false;
    const s = await stand([
      groupOf([
        tool('HandlerServiceBindingListTypes', async (context, args) => {
          const answer = await oneGet('/program')(context, args);
          settled = true;
          return answer;
        }),
      ]),
    ]);
    await s.call('HandlerServiceBindingListTypes', { name: 'Z' });
    const idle = await Promise.race([
      s.server.idle().then(() => 'idle'),
      new Promise((r) => setTimeout(() => r('held'), 1000)),
    ]);
    assert.equal(idle, 'idle');
    assert.equal(settled, false); // its part waits for HandlerBatch end
    await s.close();
  });

  it("a recording call reaches the instance's connection through the target in its turn; the target is cleared when the call returns", async () => {
    const s = await stand([
      groupOf([
        tool('HandlerServiceBindingListTypes', async (context, args) => {
          await context.connection.getBaseUrl();
          return oneGet('/program')(context, args);
        }),
      ]),
    ]);
    await s.call('HandlerServiceBindingListTypes', { name: 'Z' });
    assert.equal(s.instance.connection.getBaseUrl.mock.callCount(), 1);
    await assertRejects(s.target.getBaseUrl(), LATE_BOUND_UNPOINTED_WORDS);
    await s.close();
  });

  it('a background run in batch mode is not served: its handler not called, no number', async () => {
    const run = mock.fn(oneGet('/run'));
    const s = await stand(
      [
        groupOf([
          tool(
            'RuntimeRunClass',
            run as Handler,
            z.object({
              class_name: z.string().optional(),
              background: z.boolean().optional(),
            }),
          ),
        ]),
      ],
      { backgroundRuns: true },
    );
    assert.deepStrictEqual(
      refusalOf(
        await s.call('RuntimeRunClass', {
          class_name: 'ZCL_PLACEHOLDER',
          background: true,
        }),
      ),
      {
        error: 'batch_not_recordable',
        message: batchNotServedWords('RuntimeRunClass'),
      },
    );
    assert.equal(run.mock.callCount(), 0);
    assert.deepStrictEqual(s.recorded, []);
    assert.deepStrictEqual(recordedCalls(s), []);
    await s.close();
  });

  it('a long read admitted on its own connection before the batch opened is not served once it opens: nothing recorded, no own connection', async (t) => {
    const run = t.mock.method(longCall, 'runLongCall');
    const fresh = t.mock.method(packageSessions, 'openFreshConnection');
    // The batch opens while the call is past its entry: during its system
    // lookup, which it makes in a turn of its own (it holds none).
    const s = await stand([shipped('HandlerSystem')], {
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
    assert.deepStrictEqual(
      refusalOf(
        await s.call('HandlerSystem', {
          action: 'search_object',
          object_name: 'ZPLACEHOLDER*',
        }),
      ),
      {
        error: 'batch_not_recordable',
        message: batchNotServedWords('HandlerSystem'),
      },
    );
    assert.equal(s.owner.mode(), 'communication');
    assert.equal(run.mock.callCount(), 0);
    assert.equal(fresh.mock.callCount(), 0);
    assert.deepStrictEqual(s.recorded, []);
    assert.deepStrictEqual(recordedCalls(s), []);
    await s.close();
  });

  it('with no batch open nothing changes: the call goes to the instance connection', async () => {
    const s = await stand(
      [groupOf([tool('HandlerServiceBindingListTypes', oneGet('/program'))])],
      {
        open: false,
      },
    );
    const answer = await s.call('HandlerServiceBindingListTypes', {
      name: 'Z',
    });
    assert.deepStrictEqual(answer, {
      content: [{ type: 'text', text: '/program' }],
    });
    assert.deepStrictEqual(
      s.instance.sent.map((r) => r.url),
      ['/program'],
    );
    assert.deepStrictEqual(s.recorded, []);
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
      batchTarget(batch, owner),
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
    assert.equal(await untilSent(handler, recorder), 'recorded');
    assert.equal(recorder.requests(), 3);
    assert.deepStrictEqual(numbers, [1]);
  });

  it('nothing recorded yet is no end: a handler recording after a delay is waited for', async () => {
    const { recorder, send } = pendingRecorder();
    const handler = (async () => {
      await new Promise((r) => setTimeout(r, 20));
      send('/late');
      return never;
    })();
    assert.equal(await untilSent(handler, recorder), 'recorded');
    assert.equal(recorder.requests(), 1);
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
      batchTarget(batch, owner),
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
    assertMatchObject(await rejectionOf(answered), {
      response: { status: 406 },
    });
    assert.equal(sent.length, 1);
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
      batchTarget(batch, owner),
      (n) => numbers.push(n),
      'GetProgram',
    );
    assertThrows(
      () =>
        recorder.makeAdtRequest({ url: '/refused', method: 'GET', timeout: 0 }),
      'the batch connection refused the request',
    );
    assert.equal(recorder.number(), undefined);
    assert.equal(recorder.requests(), 0);
    assert.deepStrictEqual(numbers, []);
    refuse = false;
    void recorder.makeAdtRequest({ url: '/kept', method: 'GET', timeout: 0 });
    assert.equal(recorder.number(), 1);
    assert.deepStrictEqual(numbers, [1]);
  });

  it("params of another shape are refused by adt-clients' batch connection before recording: no number taken; the accepted shapes are recorded with their query", async () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const target = new LateBoundConnection();
    // The envelope as it reaches the system: its body holds each part's
    // request line, the query adt-clients encoded from the part's params.
    const envelopes: string[] = [];
    target.point({
      connect: async () => undefined,
      getBaseUrl: async () => 'https://system.invalid',
      getSessionId: () => null,
      setSessionType: () => undefined,
      makeAdtRequest: async (request: IAbapRequestOptions) => {
        envelopes.push(String(request.data));
        return { status: 500, statusText: 'Error', headers: {}, data: '' };
      },
    });
    const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
    owner.begin('communication', { connection: batch, target, recorded: [] });
    const numbers: number[] = [];
    const recorder = createRecorder(
      batchTarget(batch, owner),
      (n) => numbers.push(n),
      'GetProgram',
    );
    const refusedShapes: unknown[] = [42, new Date(), { name: null }, null];
    for (const params of refusedShapes) {
      assertThrows(
        () =>
          recorder.makeAdtRequest({
            url: '/refused',
            method: 'GET',
            timeout: 0,
            params,
          }),
        "a batch request's params must be a string, a URLSearchParams or a plain object of string, number or boolean values",
      );
    }
    assert.equal(recorder.number(), undefined);
    assert.equal(recorder.requests(), 0);
    assert.deepStrictEqual(numbers, []);
    const accepted: Array<[string, unknown]> = [
      ['/string', 'name=A'],
      ['/search', new URLSearchParams('name=A')],
      ['/object', { name: 'A', max: 2, all: true }],
      ['/none', undefined],
    ];
    for (const [url, params] of accepted) {
      void recorder
        .makeAdtRequest({ url, method: 'GET', timeout: 0, params })
        .catch(() => undefined);
    }
    assert.equal(recorder.number(), 1);
    assert.equal(recorder.requests(), 4);
    assert.deepStrictEqual(numbers, [1]);
    await batch.execute().catch(() => undefined);
    const body = envelopes.join('\n');
    for (const line of [
      'GET /string?name=A HTTP/1.1',
      'GET /search?name=A HTTP/1.1',
      'GET /object?name=A&max=2&all=true HTTP/1.1',
      'GET /none HTTP/1.1',
    ]) {
      assert.ok(body.includes(line), `the envelope holds ${line}`);
    }
    assert.equal(body.includes('/refused'), false);
  });

  it('a handler settling without a request is settled, with no number', async () => {
    const { recorder, numbers } = pendingRecorder();
    const handler = (async () => ({ content: [] }))();
    assert.equal(await untilSent(handler, recorder), 'settled');
    assert.equal(recorder.number(), undefined);
    assert.deepStrictEqual(numbers, []);
  });
});
