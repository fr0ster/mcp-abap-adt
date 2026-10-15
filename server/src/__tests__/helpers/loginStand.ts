/**
 * The stand the cancellation suites run on: core's stdio server with a real
 * `AuthBrokerFactory` serving an `--env-path` destination, a token endpoint
 * stand-in on 127.0.0.1, a fake `IBrowser` that plays the user (or does not),
 * auth-providers' real loopback login strategy on port `0`, and the ADT
 * stand-in the connection talks to. The MCP client talks to the server over
 * an in-memory transport and cancels a call with its own signal.
 *
 * Nothing here launches a browser or a program: the browser is the test's.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { readFailure } from '@mcp-abap-adt/auth-errors';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
  IAuthProvider,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
  PROBE_PATH,
  probeGroup,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { shutdownTools } from '../../../../src/__tests__/helpers/shutdownTools';
import { stateSystemKind } from '../../../../src/__tests__/helpers/systemKind';
import {
  activeTools,
  resetProcessLatchForTests,
} from '../../../../src/lib/activeTools';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import type { IAuthBrokerFactoryConfig } from '../../auth/IAuthBrokerFactoryConfig';
import { StdioServer } from '../../StdioServer';
import { installShutdown } from '../../shutdown';
import { silentLogger } from './factoryFixture';

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Polls `done()` on short real waits; fails after `limitMs`. */
export async function until(
  done: () => boolean,
  limitMs = 10_000,
): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/** A few turns of the event loop. */
export async function turns(n = 10): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Binds `port` on 127.0.0.1 and closes it: resolves only when the port is free. */
export function bindsFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
  });
}

const jwt = (sub: string) =>
  [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(
      JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url'),
    'sig',
  ].join('.');

/**
 * A token endpoint: answers `authorization_code` with an access and a refresh
 * token — held while `holdCodes` is on, until `releaseCodes()` — and
 * `refresh_token` the same, or `400 invalid_grant` while `refuseRefresh` is on.
 */
export interface TokenEndpoint {
  url: string;
  grants: string[];
  /** Resolves when the next `authorization_code` request has arrived. */
  codeArrived(): Promise<void>;
  holdCodes(on: boolean): void;
  releaseCodes(): void;
  refuseRefresh(on: boolean): void;
  /** Answers every `authorization_code` request `400 invalid_grant` with this `error_description`. */
  refuseCodes(description: string | undefined): void;
  /** Every token the endpoint issued, access and refresh. */
  issued: string[];
  close(): Promise<void>;
}

export async function tokenEndpoint(): Promise<TokenEndpoint> {
  const grants: string[] = [];
  let holding = false;
  let gate = deferred();
  let arrived = deferred();
  let refusing = false;
  let refusedCodeWith: string | undefined;
  let issued = 0;
  const issuedTokens: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', async () => {
      const grant = new URLSearchParams(body).get('grant_type') ?? '';
      grants.push(grant);
      if (grant === 'authorization_code') {
        arrived.resolve();
        arrived = deferred();
        if (holding) await gate.promise;
        if (refusedCodeWith !== undefined) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: refusedCodeWith,
            }),
          );
          return;
        }
      }
      if (grant === 'refresh_token' && refusing) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      issued += 1;
      const access = jwt(`placeholder-access-${issued}`);
      const refresh = `placeholder-refresh-${issued}`;
      issuedTokens.push(access, refresh);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: access,
          refresh_token: refresh,
          expires_in: 3600,
          token_type: 'bearer',
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    grants,
    codeArrived: () => arrived.promise,
    holdCodes: (on) => {
      holding = on;
    },
    releaseCodes: () => {
      gate.resolve();
      gate = deferred();
    },
    refuseRefresh: (on) => {
      refusing = on;
    },
    refuseCodes: (description) => {
      refusedCodeWith = description;
    },
    issued: issuedTokens,
    close: () =>
      new Promise<void>((resolve) => {
        gate.resolve();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/**
 * The user's browser: each `open(url)` is recorded with the callback port it
 * names; while `answering`, it plays the user and calls the callback back
 * with a code and the URL's `state`.
 */
export interface FakeBrowser {
  browser: IBrowser;
  /** The callback ports of the logins opened so far, in order. */
  ports: number[];
  /** The authorization URLs opened so far, in order. */
  urls: string[];
  /** What the callback listener answered the browser, in order. */
  answers: string[];
  answering(on: boolean): void;
  /** Resolves when the `n`-th open (1-based) has happened. */
  opened(n: number): Promise<void>;
}

export function fakeBrowser(): FakeBrowser {
  const ports: number[] = [];
  const urls: string[] = [];
  const answers: string[] = [];
  let answer = true;
  const waiters: Array<{ n: number; resolve(): void }> = [];
  const browser: IBrowser = {
    open: async (url) => {
      const parsed = new URL(url);
      const redirect = parsed.searchParams.get('redirect_uri') ?? '';
      const state = parsed.searchParams.get('state') ?? '';
      urls.push(url);
      ports.push(Number(new URL(redirect).port));
      for (const waiter of waiters.filter((w) => w.n <= ports.length)) {
        waiter.resolve();
      }
      if (answer) {
        void fetch(
          `${redirect}?code=the-code&state=${encodeURIComponent(state)}`,
        )
          .then(async (response) => {
            answers.push(await response.text());
          })
          .catch(() => undefined);
      }
    },
  };
  return {
    browser,
    ports,
    urls,
    answers,
    answering: (on) => {
      answer = on;
    },
    opened: (n) =>
      n <= ports.length
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiters.push({ n, resolve })),
  };
}

/**
 * How each login the strategy ran settled, in order: `ok`, `aborted` (the
 * chain's `interactive-login` `aborted`), or `failed` (anything else).
 */
export type LoginSettlements = Array<'ok' | 'aborted' | 'failed'>;

export interface StandOptions {
  /** `basic` (the default) or a browser login (`jwt` / `authorization_code`). */
  auth?: 'basic' | 'jwt';
  /** The factory's `loginTimeoutMs`. */
  loginTimeoutMs?: number;
  /** The factory's `loginTimeoutStated`. */
  loginTimeoutStated?: string;
  /**
   * Holds a `prepare()` that answers a refusal before the connect sees it,
   * until the returned promise settles: the abort window — after a login was
   * ended, before the connect waiting for it fails.
   */
  holdRefusedPrepare?: () => Promise<void>;
  /** The factory's `renewal`. */
  renewal?: 'refresh-then-login' | 'refresh-only';
  /** An env file to serve instead of a new one (a later factory over the same file). */
  envFile?: string;
  /**
   * Installs core's shutdown on a fake process (`processLike`), with this
   * `--shutdown-timeout` in milliseconds, if any.
   */
  shutdown?: { timeoutMs?: number };
  /** The client secret of a `jwt` destination (default `client-secret`). */
  clientSecret?: string;
  /** The factory's `authDebug`. */
  authDebug?: boolean;
  /** The factory's `logger` (silent by default). */
  logger?: ILogger;
  /** Where the factory's prompt logger writes (`info`: stderr in the program). */
  promptLines?: string[];
}

export interface Stand {
  adt: AdtStandIn;
  tokens: TokenEndpoint;
  browser: FakeBrowser;
  factory: AuthBrokerFactory;
  client: Client;
  logins: LoginSettlements;
  /** How many times `getProvider` has answered. */
  providersAnswered(): number;
  /** The lines written to stderr since the stand started. */
  stderr: string[];
  /** Calls `ProbeAdt { id }`; `cancel()` aborts the client's request. */
  call(id: string): {
    cancel(): void;
    done: Promise<{ text: string; isError: boolean } | 'cancelled'>;
  };
  /** Whether the probe `id` reached the ADT stand-in. */
  reached(id: string): boolean;
  /** The calls registered and still running, across the process. */
  active(): number;
  /** Any tool call: its answer's text and whether it is an error. */
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; isError: boolean } | 'cancelled'>;
  /** The env file served. */
  envFile: string;
  /** With `shutdown`: the fake process, the exits and the shutdown's lines. */
  processLike: EventEmitter & { stdin: EventEmitter };
  exits: number[];
  shutdownLines: string[];
  exited: Promise<number>;
  close(): Promise<void>;
}

export async function stand(options: StandOptions = {}): Promise<Stand> {
  // The system kind is required: a jwt stand is a cloud stand-in, a basic
  // one on-premise — as the cases were written for.
  stateSystemKind(options.auth === 'jwt' ? 'cloud' : 'onprem');
  process.env.NO_PROXY = '127.0.0.1,localhost';
  process.env.no_proxy = '127.0.0.1,localhost';
  const adt = await adtStandIn();
  const tokens = await tokenEndpoint();
  const browser = fakeBrowser();
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'cancel-stand-')),
  );
  const envFile = options.envFile ?? path.join(root, 'conn.env');
  if (options.envFile === undefined)
    fs.writeFileSync(
      envFile,
      [
        `SAP_URL=${adt.url}`,
        'SAP_CLIENT=100',
        ...(options.auth === 'jwt'
          ? [
              'SAP_AUTH_TYPE=jwt',
              'SAP_GRANT_TYPE=authorization_code',
              `SAP_UAA_URL=${tokens.url}`,
              'SAP_UAA_CLIENT_ID=client-id',
              `SAP_UAA_CLIENT_SECRET=${options.clientSecret ?? 'client-secret'}`,
            ]
          : [
              'SAP_AUTH_TYPE=basic',
              'SAP_USERNAME=CANCEL_USER',
              'SAP_PASSWORD=cancel-password',
            ]),
        '',
      ].join('\n'),
    );

  const logins: LoginSettlements = [];
  const strategyOf = (
    strategy: IAuthorizationStrategy<string>,
  ): IAuthorizationStrategy<string> => ({
    authorize: async (request: AuthorizationRequest) => {
      try {
        const outcome = await strategy.authorize(request);
        logins.push('ok');
        return outcome;
      } catch (error) {
        const read = readFailure(error, 'token-request');
        logins.push(
          read.kind === 'interactive-login' &&
            (read.facts as { outcome?: unknown }).outcome === 'aborted'
            ? 'aborted'
            : 'failed',
        );
        throw error;
      }
    },
    dispose: () => strategy.dispose?.() ?? Promise.resolve(),
  });

  const config: IAuthBrokerFactoryConfig = {
    envFile: { path: envFile, source: '--env-path' },
    unsafe: false,
    connectionType: 'http',
    browser: browser.browser,
    browserAuthPort: 0,
    browserStrategy: (o) => strategyOf(browserCallbackStrategy(o)),
    promptLogger:
      options.promptLines === undefined
        ? silentLogger
        : {
            ...silentLogger,
            info: (line: string) => {
              options.promptLines?.push(line);
            },
          },
    logger: options.logger ?? silentLogger,
    ...(options.authDebug === true && { authDebug: true }),
    ...(options.renewal !== undefined && { renewal: options.renewal }),
    ...(options.loginTimeoutStated !== undefined && {
      loginTimeoutStated: options.loginTimeoutStated,
    }),
    ...(options.loginTimeoutMs !== undefined && {
      loginTimeoutMs: options.loginTimeoutMs,
    }),
  };
  const factory = new AuthBrokerFactory(config);

  let answered = 0;
  // One wrapper per provider the factory answers, so the server still sees
  // the same credential object while the factory does.
  const held = new WeakMap<IAuthProvider, IAuthProvider>();
  const holding = (provider: IAuthProvider): IAuthProvider => {
    const hold = options.holdRefusedPrepare;
    if (hold === undefined) return provider;
    const known = held.get(provider);
    if (known) return known;
    const wrapper: IAuthProvider = {
      kind: provider.kind,
      prepare: async () => {
        const outcome = await provider.prepare();
        if (!outcome.ok) await hold();
        return outcome;
      },
      establish: (logon) => provider.establish(logon),
      authorize: (request) => provider.authorize(request),
      rejected: (rejection) => provider.rejected(rejection),
    };
    held.set(provider, wrapper);
    return wrapper;
  };
  const server = new StdioServer(
    new CompositeHandlersRegistry([probeGroup(shutdownTools())]),
    {
      settingsFor: (d) => factory.settingsFor(d),
      systemContextFor: (d) => factory.systemContextFor(d),
      getProvider: async (d, o) => {
        const provider = holding(await factory.getProvider(d, o));
        answered += 1;
        return provider;
      },
    },
    {
      sentenceFor: (e) => factory.sentenceFor(e),
    },
  );

  const stderr: string[] = [];
  const spy = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    });

  resetProcessLatchForTests();
  const processLike = Object.assign(new EventEmitter(), {
    stdin: new EventEmitter(),
  });
  const exits: number[] = [];
  const shutdownLines: string[] = [];
  let exitedWith!: (code: number) => void;
  const exited = new Promise<number>((r) => {
    exitedWith = r;
  });
  if (options.shutdown !== undefined) {
    installShutdown({
      factory,
      instance: server,
      onStdinEnd: true,
      exit: (code) => {
        exits.push(code);
        exitedWith(code);
      },
      stderr: (line) => shutdownLines.push(line),
      processLike,
      shutdownTimeoutMs: options.shutdown.timeoutMs,
    });
  }

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'cancel-stand', version: '1.0.0' });
  await Promise.all([
    server.start('default', serverSide),
    client.connect(clientSide),
  ]);

  return {
    adt,
    tokens,
    browser,
    factory,
    client,
    logins,
    providersAnswered: () => answered,
    stderr,
    call: (id) => {
      const controller = new AbortController();
      const done = client
        .callTool({ name: 'ProbeAdt', arguments: { id } }, undefined, {
          signal: controller.signal,
          // The client's own request timeout is not what is tested.
          timeout: 600_000,
        })
        .then(
          (result) => {
            const { content, isError } = result as {
              content: { text: string }[];
              isError?: boolean;
            };
            return { text: content[0]?.text ?? '', isError: !!isError };
          },
          () => 'cancelled' as const,
        );
      return { cancel: () => controller.abort(), done };
    },
    reached: (id) => adt.requests.some((r) => r.url === `${PROBE_PATH}${id}`),
    active: () => activeTools().length,
    callTool: (name, args) =>
      client
        .callTool({ name, arguments: args }, undefined, { timeout: 600_000 })
        .then(
          (result) => {
            const { content, isError } = result as {
              content: { text: string }[];
              isError?: boolean;
            };
            return { text: content[0]?.text ?? '', isError: !!isError };
          },
          () => 'cancelled' as const,
        ),
    envFile,
    processLike,
    exits,
    shutdownLines,
    exited,
    close: async () => {
      await client.close().catch(() => undefined);
      await factory
        .settle({ signal: AbortSignal.abort() })
        .catch(() => undefined);
      spy.mockRestore();
      await adt.close();
      await tokens.close();
      // A given env file lives elsewhere: only this stand's own directory goes.
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
