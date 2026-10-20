/**
 * The probe's cycle: per object type the create, the write under a lock, the
 * check and activation, the deletion check and the delete, each operation
 * probed three times through the server's `withAdtHeaders` — one envelope
 * through the server's batch path, or one request at a time.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAdtHeaders, IAnalyse } from '@mcp-abap-adt/interfaces-adt';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../src/handlers/interfaces';
import { AdtHeaderPairs } from '../../src/lib/adtHeaders/AdtHeaderPairs';
import {
  type AdtOperation,
  DEFAULT_ADT_HEADERS,
} from '../../src/lib/adtHeaders/defaultPairs';
import { asRecordedCall } from '../../src/lib/adtHeaders/scope';
import { withAdtHeaders } from '../../src/lib/adtHeaders/withAdtHeaders';
import {
  InstanceBatch,
  type OpenBatch,
} from '../../src/lib/batch/InstanceBatch';
import { createRecorder, untilSent } from '../../src/lib/batch/recorder';
import { beginBatch, endBatch } from '../../src/lib/batch/tools';
import { createAdtClient } from '../../src/lib/clients';
import {
  eachInTurn,
  type Interrupt,
  Interrupted,
  type Ledger,
  withLock,
} from './ledger';
import {
  cycleMembers,
  type IObjectSpec,
  type IProbeable,
  type ISpecContext,
  LOCAL_INCLUDES,
  OBJECT_SPECS,
  UTILS_GROUP,
  UTILS_READS,
} from './objects';
import {
  endpointOf,
  type IAttempt,
  type IObjectState,
  type IOperationRow,
  type IProbeAnswer,
  type IProbeFilters,
  PROBE_KINDS,
  type ProbeKind,
  plannedKinds,
  probePair,
  readAttempt,
  readState,
  wants,
} from './record';

/** What the cycle reads of the run's arguments. */
export interface ICycleArgs extends IProbeFilters {
  sequential: boolean;
}

/** One request the member issued. */
interface IRequestSeen {
  method: string;
  url: string;
  params: unknown;
}

/** One call of the member — with one pair, for a header-taking member — and its answer. */
interface IAttemptCapture {
  sent?: IAdtHeaders;
  wire?: IAdtWireResponse;
  result?: unknown;
  failure?: string;
  requests: IRequestSeen[];
}

/** What one step call captured: each call of the member, and the pair kept after. */
interface ICapture {
  attempts: IAttemptCapture[];
  kept?: IAdtHeaders;
  /** Why the call never reached SAP (refused before recording, the envelope failed). */
  failure?: string;
}

const current = new AsyncLocalStorage<IAttemptCapture>();

/**
 * The connection a client is built on, recording each request into the
 * member call that issued it. A plain object of its own, not a `Proxy`:
 * the client assigns `makeAdtRequest` on the connection it is given.
 */
function traced(connection: IAbapConnection): IAbapConnection {
  const wrapper: Record<string | symbol, unknown> = {};
  const seen = new Set<string | symbol>();
  for (
    let level: object | null = connection;
    level && level !== Object.prototype;
    level = Object.getPrototypeOf(level)
  ) {
    for (const key of Reflect.ownKeys(level)) {
      if (seen.has(key) || key === 'constructor') continue;
      seen.add(key);
      const value = Reflect.get(connection, key);
      if (typeof value === 'function') wrapper[key] = value.bind(connection);
    }
  }
  wrapper.makeAdtRequest = (request: IAbapRequestOptions) => {
    current.getStore()?.requests.push({
      method: request.method,
      url: request.url,
      params: request.params,
    });
    return connection.makeAdtRequest(request);
  };
  return wrapper as unknown as IAbapConnection;
}

/** A member call: `headers` for a header-taking member, absent for any other. */
type IMember = (
  client: AdtClient,
  analyse: IAnalyse,
  headers: IAdtHeaders,
) => Promise<unknown>;

/** One call of a step: a header-taking member under its operation, or a plain one. */
interface ICall {
  /** The operation's pair to send through `withAdtHeaders`; absent for a plain member. */
  operation?: AdtOperation;
  pair?: IAdtHeaders;
  member: IMember;
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** What a plain member is handed for the pair it does not take. */
const NO_PAIR: IAdtHeaders = Object.freeze({ accept: '', contentType: '' });

const plain = (
  member: (client: AdtClient, analyse: IAnalyse) => Promise<unknown>,
): ICall => ({ member: (client, analyse) => member(client, analyse) });

const isSuccess = (status: number | undefined): boolean =>
  status !== undefined && status >= 200 && status < 300;

/** Whether a step's known answer, or the server's correction of it, succeeded. */
const succeeded = (answer: IProbeAnswer | undefined): boolean =>
  answer !== undefined &&
  (isSuccess(answer.status) || isSuccess(answer.correction?.status));

const lastWire = (capture: ICapture): IAdtWireResponse | undefined =>
  capture.attempts[capture.attempts.length - 1]?.wire;

export class Probe {
  readonly rows: IOperationRow[] = [];
  readonly names: string[] = [];

  constructor(
    private readonly connection: IAbapConnection,
    private readonly args: ICycleArgs,
    private readonly ledger: Ledger,
    private readonly context: ISpecContext,
    private readonly run: string,
    private readonly interrupt: Interrupt,
    private readonly progress: (line: string) => void = () => {},
  ) {}

  /**
   * One call: a plain member, or a header-taking one through the server's
   * `withAdtHeaders`, with a port of its own that holds `pair` — so the
   * probe's pair is what the server sends, and a correction the server
   * makes and keeps stays with this call.
   */
  private invoke(
    client: AdtClient,
    call: ICall,
    capture: ICapture,
  ): Promise<void> {
    const attempt = (
      sent: IAdtHeaders | undefined,
      run: (analyse: IAnalyse) => Promise<unknown>,
    ): Promise<unknown> => {
      const entry: IAttemptCapture = { requests: [] };
      if (sent) entry.sent = { ...sent };
      capture.attempts.push(entry);
      return current.run(entry, () =>
        run((verdict, wire) => {
          if (wire) entry.wire = wire;
          else if (
            verdict &&
            typeof verdict === 'object' &&
            'message' in verdict
          )
            entry.failure = String(verdict.message);
          return verdict;
        }).then(
          (result: unknown) => {
            entry.result = result;
            return result;
          },
          (error: unknown) => {
            entry.failure = message(error);
            throw error;
          },
        ),
      );
    };
    const operation = call.operation;
    if (operation === undefined) {
      return attempt(undefined, (analyse) =>
        call.member(client, analyse, NO_PAIR),
      ).then(
        () => undefined,
        () => undefined,
      );
    }
    const port = new AdtHeaderPairs().forSystem('header-probe');
    const pair = call.pair ?? DEFAULT_ADT_HEADERS[operation];
    port.remember(operation, pair);
    return withAdtHeaders({ adtHeaders: port }, operation, (headers) =>
      attempt(headers, (analyse) => call.member(client, analyse, headers)),
    ).then(
      () => {
        const kept = port.pairFor(operation);
        if (
          kept.accept !== pair.accept ||
          kept.contentType !== pair.contentType
        )
          capture.kept = { accept: kept.accept, contentType: kept.contentType };
      },
      () => undefined,
    );
  }

  /**
   * Runs the calls in one envelope through the server's batch path, or one
   * by one with `--sequential`. Gated calls stop after Ctrl-C: the interrupt
   * is asked before each request in sequence, and right before the envelope
   * is sent.
   */
  async calls(
    calls: ICall[],
    batched = !this.args.sequential,
    gated = true,
  ): Promise<ICapture[]> {
    const captures = calls.map((): ICapture => ({ attempts: [] }));
    if (!batched) {
      await eachInTurn(calls, gated ? this.interrupt : undefined, (call, i) =>
        this.invoke(
          createAdtClient(traced(this.connection)),
          call,
          captures[i] as ICapture,
        ),
      );
      return captures;
    }
    if (gated) this.interrupt.check();
    await this.envelope(calls, captures, gated);
    return captures;
  }

  /**
   * The server's batch path, as a recorded call takes it: `BatchBegin`'s
   * batch, a recorder per call taking the batch's next number, each call run
   * as a recorded call (`asRecordedCall`: made once, never corrected), and
   * `BatchEnd`'s execute on the instance's connection.
   */
  private async envelope(
    calls: ICall[],
    captures: ICapture[],
    gated: boolean,
  ): Promise<void> {
    const owner = new InstanceBatch({ keepRawParts: false });
    await beginBatch({ batch: owner } as unknown as HandlerContext);
    const open = owner.opened() as OpenBatch;
    const handlers: Promise<void>[] = [];
    open.target?.point(this.connection);
    try {
      for (const [i, call] of calls.entries()) {
        const capture = captures[i] as ICapture;
        let started!: (box: { handler: Promise<void> }) => void;
        const handlerStarted = new Promise<{ handler: Promise<void> }>(
          (resolve) => {
            started = resolve;
          },
        );
        const recorder = createRecorder(
          open.connection,
          owner,
          (number) => {
            open.recorded.push({
              number,
              answer: handlerStarted.then(({ handler }) =>
                handler.then(
                  () => ({ number, content: [] }),
                  () => ({ number, content: [] }),
                ),
              ),
            });
          },
          'HeaderProbe',
        );
        const handler = asRecordedCall(() =>
          this.invoke(createAdtClient(traced(recorder)), call, capture),
        );
        started({ handler });
        handlers.push(handler);
        await untilSent(handler, recorder);
        const other = recorder.otherKind();
        if (other !== undefined) capture.failure = other.message;
      }
    } finally {
      open.target?.point(undefined);
    }
    if (gated && this.interrupt.requested) {
      // Ctrl-C while the parts were being recorded: the envelope never leaves.
      owner.drop();
      await Promise.all(handlers);
      throw new Interrupted();
    }
    try {
      const answer = await endBatch({
        batch: owner,
        connection: this.connection,
      } as unknown as HandlerContext);
      const text = answer.content[0];
      if (text && 'text' in text && text.text.includes('"came"'))
        for (const capture of captures)
          if (!lastWire(capture))
            capture.failure ??= `the envelope failed: ${text.text}`;
    } catch (error) {
      for (const capture of captures)
        if (!lastWire(capture))
          capture.failure ??= `the envelope failed: ${message(error)}`;
    }
    await Promise.all(handlers);
  }

  wanted(type: string, member: string): boolean {
    return wants(this.args, type, member);
  }

  name(spec: { code: string; functionModule?: boolean }, role: string): string {
    const name = `${spec.functionModule ? 'Z_HS' : 'ZHS'}${this.run}${spec.code}${role}`;
    this.names.push(name);
    return name;
  }

  skip(objectType: string, member: string, reason: string): void {
    if (
      this.rows.some((r) => r.objectType === objectType && r.member === member)
    )
      return;
    this.rows.push({ objectType, member, skipped: reason, probes: [] });
  }

  /** `skipped:` rows for the wanted operations of `types` that have a default pair. */
  skipAll(types: readonly string[], members: readonly string[], why: string) {
    for (const type of types)
      for (const member of members)
        if (
          `${type}.${member}` in DEFAULT_ADT_HEADERS &&
          this.wanted(type, member)
        )
          this.skip(type, member, why);
  }

  private attemptOf(capture: IAttemptCapture, fallback: IAdtHeaders): IAttempt {
    const input: Parameters<typeof readAttempt>[0] = {
      sent: capture.sent ?? fallback,
      requests: capture.requests.map((request) =>
        endpointOf(request.method, request.url, request.params, this.names),
      ),
    };
    if (capture.wire) input.wire = capture.wire;
    if (capture.failure) input.failure = capture.failure;
    return readAttempt(input);
  }

  private answerOf(
    capture: ICapture,
    probe: ProbeKind,
    sent: IAdtHeaders,
    mode: string,
  ): IProbeAnswer {
    const [first, second] = capture.attempts;
    const base = first
      ? this.attemptOf(first, sent)
      : readAttempt({
          sent,
          requests: [],
          failure: capture.failure ?? 'not sent',
        });
    const answer: IProbeAnswer = { ...base, probe, mode };
    if (second) answer.correction = this.attemptOf(second, sent);
    if (capture.kept) answer.kept = capture.kept;
    if (capture.failure && !answer.failure) answer.failure = capture.failure;
    return answer;
  }

  /**
   * The three probes of one operation, each optionally followed by a read of
   * the object's state; the row is recorded when the member is wanted.
   * Without a wanted member the step still runs once with the default pair
   * when the cycle needs it (a create), and nothing is reported.
   */
  async operation(input: {
    objectType: string;
    member: string;
    kinds?: readonly ProbeKind[];
    call: (kind: ProbeKind) => IMember;
    state?: (kind: ProbeKind) => IMember;
    readState?: (capture: ICapture, kind: ProbeKind) => IObjectState;
    sequential?: string;
  }): Promise<IProbeAnswer | undefined> {
    const operation = `${input.objectType}.${input.member}`;
    if (!(operation in DEFAULT_ADT_HEADERS)) return undefined;
    const op = operation as AdtOperation;
    const known = DEFAULT_ADT_HEADERS[op];
    const wanted = this.wanted(input.objectType, input.member);
    const kinds = plannedKinds(
      this.args,
      input.objectType,
      input.member,
      input.kinds ?? PROBE_KINDS,
    );
    if (!kinds.length) return undefined;
    const calls: ICall[] = [];
    for (const kind of kinds) {
      calls.push({
        operation: op,
        pair: probePair(kind, known),
        member: input.call(kind),
      });
      if (input.state) calls.push({ member: input.state(kind) });
    }
    const mode = this.args.sequential
      ? 'sequential: --sequential'
      : input.sequential
        ? `sequential: ${input.sequential}`
        : 'batched';
    this.progress(`  ${operation} (${mode})`);
    const captures = await this.calls(calls, mode === 'batched');
    const step = input.state ? 2 : 1;
    const probes = kinds.map((kind, i) => {
      const answer = this.answerOf(
        captures[i * step] as ICapture,
        kind,
        probePair(kind, known),
        mode,
      );
      if (input.state) {
        const stateCapture = captures[i * step + 1] as ICapture;
        answer.stateAfter = input.readState
          ? input.readState(stateCapture, kind)
          : readState(lastWire(stateCapture));
      }
      return answer;
    });
    if (wanted)
      this.rows.push({
        objectType: input.objectType,
        member: input.member,
        known: { accept: known.accept, contentType: known.contentType },
        probes,
      });
    return probes.find((probe) => probe.probe === 'known');
  }

  /** One call on the plain connection, for a step that is not a probe. */
  async direct1(call: ICall, gated = true): Promise<ICapture> {
    const [capture] = await this.calls([call], false, gated);
    return capture as ICapture;
  }

  /** The default-pair call of `operation`, through the server's `withAdtHeaders`. */
  private serverCall(
    operation: string,
    member: (
      client: AdtClient,
      headers: IAdtHeaders,
      analyse: IAnalyse,
    ) => Promise<unknown>,
  ): ICall {
    return {
      operation: operation as AdtOperation,
      member: (client, analyse, headers) => member(client, headers, analyse),
    };
  }

  /** A ledger entry that deletes `name` with the server's delete pair, if it is there. */
  remember(spec: IObjectSpec, name: string, context: ISpecContext): void {
    const config = spec.config(name, context);
    this.ledger.add({
      label: `${spec.type} ${name}`,
      remove: async () => {
        const read = () =>
          this.direct1(
            plain(
              (client, analyse) =>
                spec.handle(client).readMetadata?.(config, { analyse }) ??
                Promise.resolve(),
            ),
            false,
          );
        const before = readState(lastWire(await read()));
        if (before.exists === false)
          return {
            removed: true,
            detail: 'not there: never created, or deleted by the probe',
          };
        const deleted = await this.direct1(
          this.serverCall(
            `${spec.type}.delete`,
            (client, headers, analyse) =>
              spec.handle(client).delete?.(config, { headers, analyse }) ??
              Promise.resolve(),
          ),
          false,
        );
        const after = readState(lastWire(await read()));
        if (after.exists === false)
          return {
            removed: true,
            detail: `deleted (${lastWire(deleted)?.status ?? 'no status'})`,
          };
        const answer = this.answerOf(
          deleted,
          'known',
          DEFAULT_ADT_HEADERS[`${spec.type}.delete` as AdtOperation],
          'sequential: cleanup',
        );
        return {
          removed: false,
          detail: `delete answered ${answer.status ?? answer.failure}${answer.sapMessage ? `: ${answer.sapMessage}` : ''}; the object still reads ${after.status ?? 'unknown'}`,
        };
      },
    });
  }

  /** Creates, writes and activates a dependency with the default pairs; reports nothing. */
  async dependency(
    spec: IObjectSpec,
    name: string,
    source?: string,
  ): Promise<boolean> {
    const context: ISpecContext = { ...this.context };
    const config = spec.config(name, context);
    this.remember(spec, name, context);
    const created = await this.direct1(
      this.serverCall(
        `${spec.type}.create`,
        (client, headers, analyse) =>
          spec.handle(client).create?.(config, { headers, analyse }) ??
          Promise.resolve(),
      ),
    );
    if (!isSuccess(lastWire(created)?.status)) return false;
    if (source) {
      const locked = await this.direct1(
        plain(
          (client, analyse) =>
            spec.handle(client).lock?.(config, { analyse }) ??
            Promise.resolve(),
        ),
      );
      const handle = lockHandle(locked);
      if (!handle) return false;
      await withLock(
        handle,
        // Released after an interrupt too: unlocking is cleanup.
        (held) =>
          this.direct1(
            plain(
              (client, analyse) =>
                spec.handle(client).unlock?.(config, held, { analyse }) ??
                Promise.resolve(),
            ),
            false,
          ),
        (held) =>
          this.direct1(
            this.serverCall(
              `${spec.type}.update`,
              (client, headers, analyse) =>
                spec.handle(client).update?.(config, {
                  headers,
                  source,
                  lockHandle: held,
                  analyse,
                }) ?? Promise.resolve(),
            ),
          ),
      );
    }
    const activated = await this.direct1(
      this.serverCall(
        `${spec.type}.activate`,
        (client, headers, analyse) =>
          spec.handle(client).activate?.(config, { headers, analyse }) ??
          Promise.resolve(),
      ),
    );
    return isSuccess(lastWire(activated)?.status);
  }

  /** The whole cycle of one object type. */
  async objectType(spec: IObjectSpec): Promise<void> {
    this.progress(`${spec.type}`);
    const context: ISpecContext = { ...this.context };
    const dependents =
      spec.type === 'class'
        ? [spec.type, ...LOCAL_INCLUDES.map((local) => local.type)]
        : spec.type === 'messageClass'
          ? [spec.type, 'messageClassMessage']
          : [spec.type];
    const allMembers = [
      ...cycleMembers(spec),
      'update',
      'updateMetadata',
      'check',
      'activate',
    ];
    if (spec.needs) {
      const parentSpec = OBJECT_SPECS.find(
        (s) => s.type === (spec.needs === 'ddl' ? 'ddl' : 'functionGroup'),
      ) as IObjectSpec;
      const parent = this.name(
        { code: `${spec.code[0]}${parentSpec.code[0]}` },
        'P',
      );
      const made = await this.dependency(
        parentSpec,
        parent,
        spec.needs === 'ddl' ? parentSpec.source?.(parent, context) : undefined,
      );
      if (!made) {
        this.skipAll(
          dependents,
          allMembers,
          `skipped: its ${spec.needs} could not be created and activated`,
        );
        return;
      }
      context.parent = parent;
    }

    const names: Record<ProbeKind, string> = {
      known: this.name(spec, 'K'),
      badAccept: this.name(spec, 'A'),
      badContentType: this.name(spec, 'C'),
    };
    const configOf = (kind: ProbeKind) => spec.config(names[kind], context);
    const handle = (client: AdtClient) => spec.handle(client);
    const stateOf =
      (name: string): IMember =>
      (client, analyse) =>
        handle(client).readMetadata?.(spec.config(name, context), {
          analyse,
        }) ?? Promise.resolve();
    for (const kind of PROBE_KINDS) this.remember(spec, names[kind], context);

    // 1. Create: each probe on a name of its own, read right after.
    const created = await this.operation({
      objectType: spec.type,
      member: 'create',
      call: (kind) => (client, analyse, headers) =>
        handle(client).create?.(configOf(kind), { headers, analyse }) ??
        Promise.resolve(),
      state: (kind) => stateOf(names[kind]),
    });
    if (!succeeded(created)) {
      this.skipAll(
        dependents,
        allMembers,
        `skipped: the known create answered ${created?.status ?? created?.failure ?? 'nothing'}`,
      );
      return;
    }
    const config = configOf('known');

    // 2. Read, lock, write with the three probes, unlock.
    const writeMember = spec.write === 'source' ? 'update' : 'updateMetadata';
    const writesLocals =
      spec.type === 'class' &&
      LOCAL_INCLUDES.some(
        (local) =>
          this.wanted(local.type, 'update') ||
          this.wanted(local.type, 'delete'),
      );
    if (this.wanted(spec.type, writeMember) || writesLocals) {
      let body = spec.source?.(names.known, context);
      if (body === undefined) {
        const read = await this.direct1(
          plain((client, analyse) =>
            spec.write === 'source'
              ? (handle(client).read?.(config, 'inactive', { analyse }) ??
                Promise.resolve())
              : (handle(client).readMetadata?.(config, { analyse }) ??
                Promise.resolve()),
          ),
        );
        const data = lastWire(read)?.data;
        body = typeof data === 'string' ? data : undefined;
      }
      const locked = await this.direct1(
        plain(
          (client, analyse) =>
            handle(client).lock?.(config, { analyse }) ?? Promise.resolve(),
        ),
      );
      const lock = lockHandle(locked);
      if (!lock) {
        const why = `skipped: the lock answered ${lastWire(locked)?.status ?? locked.attempts[0]?.failure ?? 'nothing'}`;
        this.skipAll([spec.type], [writeMember], why);
        if (spec.type === 'class')
          this.skipAll(
            LOCAL_INCLUDES.map((local) => local.type),
            ['update', 'delete'],
            why,
          );
      } else {
        const source = body;
        await withLock(
          lock,
          // Released after an interrupt too: unlocking is cleanup.
          (held) =>
            this.direct1(
              plain(
                (client, analyse) =>
                  handle(client).unlock?.(config, held, { analyse }) ??
                  Promise.resolve(),
              ),
              false,
            ),
          async (held) => {
            if (source === undefined) {
              if (this.wanted(spec.type, writeMember))
                this.skip(
                  spec.type,
                  writeMember,
                  'skipped: the object could not be read to write it back',
                );
            } else
              await this.operation({
                objectType: spec.type,
                member: writeMember,
                call: () => (client, analyse, headers) =>
                  handle(client)[writeMember]?.(config, {
                    headers,
                    source,
                    lockHandle: held,
                    analyse,
                  }) ?? Promise.resolve(),
                state: () => stateOf(names.known),
              });
            if (spec.type === 'class') await this.locals(names.known, held);
          },
        );
      }
    }
    if (spec.type === 'messageClass') await this.messages(names.known);

    // 3. Check and activate.
    await this.operation({
      objectType: spec.type,
      member: 'check',
      call: () => (client, analyse, headers) =>
        handle(client).check?.(config, undefined, { headers, analyse }) ??
        Promise.resolve(),
    });
    if (spec.type === 'class')
      for (const local of LOCAL_INCLUDES)
        await this.operation({
          objectType: local.type,
          member: 'check',
          call: () => (client, analyse, headers) =>
            local
              .handle(client)
              .check?.(
                { className: names.known, source: local.source(names.known) },
                undefined,
                { headers, analyse },
              ) ?? Promise.resolve(),
        });
    await this.operation({
      objectType: spec.type,
      member: 'activate',
      call: () => (client, analyse, headers) =>
        handle(client).activate?.(config, { headers, analyse }) ??
        Promise.resolve(),
      state: () => stateOf(names.known),
    });
    if (spec.type === 'class')
      for (const local of LOCAL_INCLUDES)
        await this.operation({
          objectType: local.type,
          member: 'activate',
          call: () => (client, analyse, headers) =>
            local
              .handle(client)
              .activate?.({ className: names.known }, { headers, analyse }) ??
            Promise.resolve(),
          state: () => stateOf(names.known),
        });

    // 4. Deletion check, then delete: each probe on the name its create made.
    await this.operation({
      objectType: spec.type,
      member: 'checkDeletion',
      call: () => (client, analyse, headers) =>
        handle(client).checkDeletion?.(config, { headers, analyse }) ??
        Promise.resolve(),
    });
    await this.operation({
      objectType: spec.type,
      member: 'delete',
      call: (kind) => (client, analyse, headers) =>
        handle(client).delete?.(configOf(kind), { headers, analyse }) ??
        Promise.resolve(),
      state: (kind) => stateOf(names[kind]),
    });
  }

  /** The class includes, written under the class's lock. */
  async locals(className: string, lock: string): Promise<void> {
    const classSpec = OBJECT_SPECS.find(
      (s) => s.type === 'class',
    ) as IObjectSpec;
    const stateOf: IMember = (client, analyse) =>
      classSpec
        .handle(client)
        .readMetadata?.(classSpec.config(className, { ...this.context }), {
          analyse,
        }) ?? Promise.resolve();
    for (const local of LOCAL_INCLUDES) {
      const config = {
        className,
        transportRequest: this.context.transportRequest,
      };
      for (const member of ['update', 'delete'])
        await this.operation({
          objectType: local.type,
          member,
          kinds:
            member === 'delete'
              ? ['badAccept', 'badContentType', 'known']
              : PROBE_KINDS,
          call: () => (client, analyse, headers) =>
            local.handle(client)[member]?.(config, {
              headers,
              source: local.source(className),
              lockHandle: lock,
              analyse,
            }) ?? Promise.resolve(),
          state: () => stateOf,
        });
    }
  }

  /** A message class's messages: each write is the member's own chain. */
  async messages(className: string): Promise<void> {
    const handle = (client: AdtClient): IProbeable =>
      client.getMessageClassMessage() as unknown as IProbeable;
    const msgno: Record<ProbeKind, string> = {
      known: '001',
      badAccept: '002',
      badContentType: '003',
    };
    const config = (number: string) => ({
      className,
      msgno: number,
      msgtext: `Header probe ${number}`,
      transportRequest: this.context.transportRequest,
    });
    const state =
      (number: string): IMember =>
      (client, analyse) =>
        handle(client).read?.(config(number), undefined, { analyse }) ??
        Promise.resolve();
    const present =
      (number: string) =>
      (capture: ICapture): IObjectState => {
        const wire = lastWire(capture);
        const base = readState(wire);
        if (base.exists !== true) return base;
        const body = String(wire?.data ?? '');
        return { ...base, exists: body.includes(`msgno="${number}"`) };
      };
    const chain =
      'a chain: read, two locks, the write, two unlocks, each next request depending on the answer before';
    await this.operation({
      objectType: 'messageClassMessage',
      member: 'create',
      sequential: chain,
      call: (kind) => (client, analyse, headers) =>
        handle(client).create?.(config(msgno[kind]), { headers, analyse }) ??
        Promise.resolve(),
      state: (kind) => state(msgno[kind]),
      readState: (capture, kind) => present(msgno[kind])(capture),
    });
    await this.operation({
      objectType: 'messageClassMessage',
      member: 'update',
      sequential: chain,
      call: () => (client, analyse, headers) =>
        handle(client).update?.(
          { ...config('001'), msgtext: 'Header probe updated' },
          { headers, analyse },
        ) ?? Promise.resolve(),
      state: () => state('001'),
      readState: present('001'),
    });
    await this.operation({
      objectType: 'messageClassMessage',
      member: 'delete',
      sequential: chain,
      call: (kind) => (client, analyse, headers) =>
        handle(client).delete?.(config(msgno[kind]), { headers, analyse }) ??
        Promise.resolve(),
      state: (kind) => state(msgno[kind]),
      readState: (capture, kind) => present(msgno[kind])(capture),
    });
  }

  /** The utilities: reads on the package and T000, the group lifecycle on a program of its own. */
  async utils(): Promise<void> {
    this.progress('utils');
    const utils = (client: AdtClient): IProbeable =>
      client.getUtils() as unknown as IProbeable;
    const program = OBJECT_SPECS.find(
      (s) => s.type === 'program',
    ) as IObjectSpec;
    const name = this.name({ code: 'UT' }, 'P');
    const context: ISpecContext = { ...this.context };
    const made = await this.dependency(program, name);
    const args: Record<(typeof UTILS_READS)[number], unknown[]> = {
      getWhereUsed: [{ object_name: name, object_type: 'program' }],
      getWhereUsedScope: [{ object_name: name, object_type: 'program' }],
      getVirtualFoldersContents: [
        {
          objectSearchPattern: '*',
          preselection: [
            { facet: 'package', values: [this.context.packageName] },
          ],
          facetOrder: ['package', 'group', 'type'],
        },
      ],
      fetchNodeStructure: ['DEVC/K', this.context.packageName],
      getSqlQuery: [{ sql_query: 'SELECT mandt FROM t000', row_number: 1 }],
      getTableContents: [{ table_name: 'T000', max_rows: 1 }],
    };
    for (const member of UTILS_READS)
      await this.operation({
        objectType: 'utils',
        member,
        call: () => (client, analyse, headers) =>
          utils(client)[member]?.(...args[member], { headers, analyse }) ??
          Promise.resolve(),
      });
    if (!made) {
      this.skipAll(
        ['utils'],
        UTILS_GROUP,
        'skipped: its program could not be created and activated',
      );
      return;
    }
    const objects = [{ type: 'PROG/P', name }];
    const stateOf: IMember = (client, analyse) =>
      program
        .handle(client)
        .readMetadata?.(program.config(name, context), { analyse }) ??
      Promise.resolve();
    await this.operation({
      objectType: 'utils',
      member: 'activateObjectsGroup',
      call: () => (client, analyse, headers) =>
        utils(client).activateObjectsGroup?.(objects, undefined, {
          headers,
          analyse,
        }) ?? Promise.resolve(),
      state: () => stateOf,
    });
    await this.operation({
      objectType: 'utils',
      member: 'checkDeletionGroup',
      call: () => (client, analyse, headers) =>
        utils(client).checkDeletionGroup?.(objects, { headers, analyse }) ??
        Promise.resolve(),
    });
    await this.operation({
      objectType: 'utils',
      member: 'deleteObjectsGroup',
      kinds: ['badAccept', 'badContentType', 'known'],
      call: () => (client, analyse, headers) =>
        utils(client).deleteObjectsGroup?.(
          objects,
          this.context.transportRequest,
          { headers, analyse },
        ) ?? Promise.resolve(),
      state: () => stateOf,
    });
  }
}

/** The lock handle the member read from its LOCK's answer. */
function lockHandle(capture: ICapture): string | undefined {
  const result = capture.attempts[0]?.result as
    | { ok: boolean; getResult?: () => { value: unknown } }
    | undefined;
  if (!result?.ok || !result.getResult) return undefined;
  const value = result.getResult().value;
  return typeof value === 'string' && value ? value : undefined;
}
