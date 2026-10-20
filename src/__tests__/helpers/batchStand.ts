/**
 * A server instance with batch mode, for the BatchEnd / BatchAnswers / no-retry
 * tests: a `BaseMcpServer` whose connection is built from a source (so a test
 * can end a connection's session, or make the source fail), the shipped handlers of
 * the tools a test names, and the real batch tools (`BatchHandlersGroup`,
 * and the compact `HandlerBatch`).
 * `begin()` opens the batch directly, so a test can count `execute()`.
 *
 * Each built connection is a fake (`envelopeConnection`): an envelope is
 * answered part by part by the stand's `part` rule, a request outside a batch
 * by the same rule; nothing reaches a system.
 *
 * The test file must mock `lib/connectionFactory` so `createAbapConnection`
 * is the jest mock this helper drives:
 *
 *   jest.mock('../../../lib/connectionFactory', () => ({
 *     createAbapConnection: jest.fn(),
 *     systemKindOf: jest.fn(() => 'onprem'),
 *   }));
 */
import type { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type {
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompactModifyHandlersGroup } from '../../../compact-modify/src/group';
import { CompactReadOnlyHandlersGroup } from '../../../compact-readonly-entries/src/group';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import type { ConnectionSource } from '../../embeddable/ConnectionContext';
import type { AnswerEntry } from '../../lib/batch/answers';
import { InstanceBatch } from '../../lib/batch/InstanceBatch';
import { communicationBatch } from '../../lib/batch/tools';
import { CompactBatchHandlersGroup } from '../../lib/compact/batch/group';
import { createAbapConnection } from '../../lib/connectionFactory';
import {
  BatchHandlersGroup,
  HighLevelHandlersGroup,
  ReadOnlyHandlersGroup,
  SearchHandlersGroup,
  SystemHandlersGroup,
} from '../../lib/handlers/groups';
import type {
  HandlerContext,
  IHandlerGroup,
} from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import type { HeldLocks } from '../../lib/state/heldLocks';
import {
  type EnvelopeAnswer,
  envelopeConnection,
  type InnerRequest,
  type PartAnswer,
  partByPart,
  statusError,
} from './batchEnvelope';
import type { HandlerLedger } from './handlerLedger';
import { LOCK_SUCCESS_XML } from './recordingConnection';

export { LOCK_SUCCESS_XML };

/** The lock handle `LOCK_SUCCESS_XML` carries. */
export const LOCK_HANDLE_OF_XML = 'B92E65858E83454C783181344F429D4BFD8E395D';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

export interface Answer {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

type Fake = ReturnType<typeof envelopeConnection>;

/** A credential object: what the source answers. */
export function credential(): IAuthProvider {
  return {
    kind: 'test',
    prepare: async () => ({ ok: true as const }),
    establish: async () => ({ ok: true as const }),
    authorize: async () => ({ ok: true as const }),
    rejected: async () => ({ ok: true as const }),
  } as unknown as IAuthProvider;
}

/** A request outside a batch answered by the part rule: 2xx returned, anything else thrown as a connection throws it. */
function directBy(part: (inner: InnerRequest) => PartAnswer) {
  return async (request: IAbapRequestOptions): Promise<IAdtWireResponse> => {
    const params = request.params
      ? new URLSearchParams(request.params as Record<string, string>).toString()
      : '';
    const url =
      request.url +
      (params ? `${request.url.includes('?') ? '&' : '?'}${params}` : '');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(request.headers ?? {})) {
      headers[k.toLowerCase()] = String(v);
    }
    const answer = part({
      method: request.method,
      url,
      headers,
      body: request.data === undefined ? '' : String(request.data),
    });
    const response = {
      status: answer.status,
      statusText: answer.statusText ?? '',
      headers: answer.headers ?? {},
      data: answer.body ?? '',
    };
    if (answer.status >= 200 && answer.status < 300) {
      return response as IAdtWireResponse;
    }
    throw statusError(
      answer.status,
      answer.statusText ?? '',
      answer.body ?? '',
      answer.headers ?? {},
    );
  };
}

/** The shipped entries named, each reading its own group's context. */
function shippedGroup(names: string[]): IHandlerGroup[] {
  const placeholder = {
    connection: null,
    logger: undefined,
  } as unknown as HandlerContext;
  const groups = [
    new ReadOnlyHandlersGroup(placeholder),
    new SearchHandlersGroup(placeholder),
    new SystemHandlersGroup(placeholder),
    new HighLevelHandlersGroup(placeholder),
    new CompactReadOnlyHandlersGroup(placeholder),
    new CompactModifyHandlersGroup(placeholder),
  ];
  return names.map((name) => {
    for (const group of groups) {
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
  });
}

class StandServer extends BaseMcpServer {
  constructor(
    groups: IHandlerGroup[],
    owner: InstanceBatch,
    source: ConnectionSource,
    heldLocks?: HeldLocks,
  ) {
    super({
      name: 'batch-stand',
      version: '1.0.0',
      logger: silent as never,
      systemType: 'onprem',
      batch: owner,
      ...(heldLocks !== undefined ? { heldLocks } : {}),
    });
    this.registerHandlers(new CompositeHandlersRegistry(groups));
    this.setConnectionContext({ kind: 'built', source, sessionId: 'dest-a' });
  }
}

export interface Stand {
  owner: InstanceBatch;
  /** The server instance itself (its close, its state). */
  server: BaseMcpServer;
  /** Every connection built, in order. */
  built: Fake[];
  /** The batch connection of the batch opened last. */
  batch(): AdtBatchConnection;
  /** Every `execute()` of every batch opened here. */
  executes: jest.Mock;
  /** Opens a communication batch, as BatchBegin does, counting its `execute()`. */
  begin(): void;
  /** SAP ended the session of the connection built last: the next call replaces it. */
  loseSession(): void;
  /** The source's next `resolve` fails with `error`. */
  failResolve(error: unknown): void;
  call(name: string, args?: Record<string, unknown>): Promise<Answer>;
  /** BatchEnd's answer, parsed. */
  end(): Promise<{ answer: Answer; summary: Record<string, unknown> }>;
  /** BatchAnswers' entries for `numbers`, parsed. */
  answers(numbers: number[]): Promise<AnswerEntry[]>;
  close(): Promise<void>;
}

export interface StandOptions {
  tools: string[];
  /** How SAP answers each inner request (and each request outside a batch). */
  part: (inner: InnerRequest) => PartAnswer;
  /** How each built connection answers an envelope; default part by part. */
  envelope?: EnvelopeAnswer;
  keepRawParts?: boolean;
  /** The instance's held locks, as the Streamable HTTP host gives them. */
  heldLocks?: HeldLocks;
  /** Groups served beside the shipped tools named (a test's own handlers). */
  groups?: IHandlerGroup[];
  /** Writes down when the shipped tools' handlers return or throw. */
  ledger?: HandlerLedger;
}

/**
 * `build` is the `createAbapConnection` jest mock of the test file.
 */
export async function batchStand(options: StandOptions): Promise<Stand> {
  const build = createAbapConnection as unknown as jest.Mock;
  const owner = new InstanceBatch({
    keepRawParts: options.keepRawParts ?? false,
  });
  const built: Fake[] = [];
  build.mockReset();
  build.mockImplementation(() => {
    const fake = envelopeConnection(
      options.envelope ?? partByPart(options.part),
      directBy(options.part),
    );
    built.push(fake);
    return fake.connection;
  });
  const current = credential();
  let failure: { error: unknown } | undefined;
  const source: ConnectionSource = {
    resolve: async () => {
      const failing = failure;
      failure = undefined;
      if (failing !== undefined) throw failing.error;
      return {
        settings: { url: 'https://system.invalid', authType: 'jwt' },
        credential: current,
      } as never;
    },
  };
  const server = new StandServer(
    [
      ...shippedGroup(options.tools).map((g) =>
        options.ledger === undefined ? g : options.ledger.watch(g),
      ),
      ...(options.groups ?? []),
      new BatchHandlersGroup({ connection: undefined as never }),
      new CompactBatchHandlersGroup({ connection: undefined as never }),
    ],
    owner,
    source,
    options.heldLocks,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'batch-stand', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  let last: AdtBatchConnection | undefined;
  const executes = jest.fn();
  const call = (name: string, args: Record<string, unknown> = {}) =>
    client
      .callTool({ name, arguments: args })
      .then((answer) => answer as Answer);
  return {
    owner,
    server,
    built,
    batch: () => {
      if (last === undefined) throw new Error('no batch begun');
      return last;
    },
    executes,
    begin: () => {
      // As BatchBegin opens it: the envelope watch included.
      const open = communicationBatch();
      const batch = open.connection;
      const execute = batch.execute.bind(batch);
      batch.execute = (() => {
        executes();
        return execute();
      }) as typeof batch.execute;
      last = batch;
      owner.begin('communication', open);
    },
    loseSession: () => {
      const last = built[built.length - 1];
      if (last === undefined) throw new Error('no connection built');
      Object.assign(last.connection, { isConnected: () => false });
    },
    failResolve: (error) => {
      failure = { error };
    },
    call,
    end: async () => {
      const answer = await call('BatchEnd');
      const text = answer.content?.[0]?.text ?? '{}';
      return { answer, summary: JSON.parse(text) };
    },
    answers: async (numbers) => {
      const answer = await call('BatchAnswers', { numbers });
      return JSON.parse(answer.content?.[0]?.text ?? '[]');
    },
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
}

/** The parsed JSON of an answer's first text. */
export function payloadOf(answer: { content?: Array<{ text?: string }> }) {
  return JSON.parse(answer.content?.[0]?.text ?? 'null');
}
