/**
 * AuthBrokerFactory — one broker per destination, built on first use.
 *
 * Building a destination's broker decides three things, each before anything
 * is built: is what the destination states well formed (`vetMeans`), is
 * there a handler for it (`handlerFor`), and then the broker with exactly the
 * destination's stores, the options the server states for every destination
 * (`renewal`, `onWriteFailure` by store, `authDebug`) and that handler's
 * options. A failure reaches the caller as the error it is.
 *
 * Its providers are handed out counted, behind one gate: `settle` closes the
 * gate, disposes the logins it composed, waits for the calls already
 * running, then flushes every broker.
 *
 * The settings are read once per process (D3); the provider is asked of the
 * broker on every call, with the caller's signal — the factory keeps no
 * provider cache, the broker does.
 */

import {
  AuthBroker,
  type BrokerCallOptions,
  DestinationConfigError,
} from '@mcp-abap-adt/auth-broker';
import { classify } from '@mcp-abap-adt/auth-errors';
import { refreshOnly, refreshThenLogin } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type {
  IAuthorizationStrategy,
  IAuthProvider,
  IAuthProviderError,
  IRenewalStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  assertDestinationName,
  type DestinationSystemContext,
  SettingsError,
} from '@mcp-abap-adt/lib/auth';
import { getPlatformPaths } from '../config/platformPaths';
import { countedProvider, ProviderGate } from './countedProvider';
import {
  type DestinationMode,
  type DestinationStores,
  readDestinationSystemContext,
  storesFor,
} from './destinationStores';
import {
  type AuthenticationHandler,
  type AuthHandlerContext,
  handlerFor,
} from './handlers';
import type { IAuthBrokerFactory, SettleReport } from './IAuthBrokerFactory.js';
import type { IAuthBrokerFactoryConfig } from './IAuthBrokerFactoryConfig.js';
import { brokerLogger, type LoginBound, loginBound } from './serverLogin';
import {
  type RenewalMode,
  type ServerState,
  serverSentence,
} from './serverSentences';
import { type VettedAuthentication, vetMeans } from './vocabulary';

/** The destination an `--env` file is served as. */
const ENV_FILE_DESTINATION = 'default';

interface Built {
  broker: AuthBroker;
  handler: AuthenticationHandler;
  vetted: VettedAuthentication;
  stores: DestinationStores;
}

/** An own data property of a foreign value, never a getter; `undefined` otherwise. */
function ownValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A rejecting `flush()` as `"<destination>": <reason>` lines. The broker
 * rejects with an `AggregateError` of `SessionWriteFailure`s, each carrying
 * its destination and its store error classified; every entry — and anything
 * else a flush rejects with — is read with auth-errors'
 * `classify(entry, 'persisting-tokens')`, never by its message or class.
 */
function unstoredLines(destination: string, error: unknown): string[] {
  const entries = ownValue(error, 'errors');
  const lines = Array.isArray(entries)
    ? entries.map((entry: unknown) => {
        const named = ownValue(entry, 'destination');
        const where = typeof named === 'string' ? named : destination;
        return `"${where}": ${classify(entry, 'persisting-tokens').reason}`;
      })
    : [];
  return lines.length > 0
    ? lines
    : [`"${destination}": ${classify(error, 'persisting-tokens').reason}`];
}

/** The broker's diagnostics when the factory was given no logger. */
const SILENT: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const RENEWALS: Readonly<Record<RenewalMode, () => IRenewalStrategy>> = {
  'refresh-then-login': refreshThenLogin,
  'refresh-only': refreshOnly,
};

export class AuthBrokerFactory implements IAuthBrokerFactory {
  readonly defaultDestination: string | undefined;

  private readonly config: IAuthBrokerFactoryConfig;
  private readonly context: AuthHandlerContext;
  private readonly gate = new ProviderGate();
  /** The shutdown began: no interactive login starts, `aborted` is the shutdown's. */
  private shutdownBegan = false;
  private readonly renewal: RenewalMode;
  /** `--login-timeout` (D10): the bound every composed login runs under. */
  private readonly bound: LoginBound | undefined;
  /** The build of each destination, set before its first await. */
  private readonly built = new Map<string, Promise<Built>>();
  /** One counted wrapper per inner provider the brokers answered. */
  private readonly counted = new WeakMap<IAuthProvider, IAuthProvider>();
  /** Every login strategy composed, disposed at shutdown. */
  private readonly logins = new Set<IAuthorizationStrategy<string>>();
  private readonly settings = new Map<string, Promise<SapConfig>>();
  private readonly systemContexts = new Map<
    string,
    Promise<DestinationSystemContext>
  >();

  constructor(config: IAuthBrokerFactoryConfig) {
    this.config = config;
    this.defaultDestination =
      config.mcpDestination ??
      (config.envFile ? ENV_FILE_DESTINATION : undefined);
    this.renewal = config.renewal ?? 'refresh-then-login';
    this.bound =
      config.loginTimeoutMs === undefined
        ? undefined
        : loginBound(config.loginTimeoutMs, config.loginTimeoutStated);
    this.context = {
      ...(config.browser !== undefined && { browser: config.browser }),
      ...(config.browserUnavailable !== undefined && {
        browserUnavailable: config.browserUnavailable,
      }),
      ...(config.browserAuthPort !== undefined && {
        browserAuthPort: config.browserAuthPort,
      }),
      browserStrategy: config.browserStrategy,
      login: {
        logger: config.promptLogger,
        record: (strategy) => {
          this.logins.add(strategy);
        },
        shuttingDown: () => this.shutdownBegan || this.gate.closed,
        ...(this.bound !== undefined && { bound: this.bound }),
      },
    };
  }

  /**
   * The server's own sentence for a chain failure (§7.4), keyed on its
   * `kind` and this factory's state: the renewal it was started with, and
   * whether the shutdown closed its gate.
   */
  sentenceFor(error: IAuthProviderError): string | undefined {
    return serverSentence(error, this.state());
  }

  /** The server's own state a sentence is keyed on (§7.4). */
  private state(): ServerState {
    return {
      renewal: this.renewal,
      shuttingDown: this.shutdownBegan || this.gate.closed,
      ...(this.bound !== undefined && { loginBound: this.bound }),
    };
  }

  /**
   * The destination's broker. A consumer that connects must use
   * `getProvider` instead: the broker's own provider is not counted and
   * bypasses the shutdown gate that `settle` closes.
   */
  async getBroker(destination: string): Promise<AuthBroker> {
    return (await this.buildOf(destination)).broker;
  }

  /**
   * The destination's settings, read once per process like its provider:
   * a change to the files applies on restart. A failed read is dropped, so
   * fixing the file lets the next call answer.
   */
  settingsFor(destination: string): Promise<SapConfig> {
    const cached = this.settings.get(destination);
    if (cached) return cached;
    const settings = this.readSettings(destination);
    this.settings.set(destination, settings);
    settings.catch(() => {
      if (this.settings.get(destination) === settings) {
        this.settings.delete(destination);
      }
    });
    return settings;
  }

  private async readSettings(destination: string): Promise<SapConfig> {
    const { broker, handler, vetted, stores } = await this.buildOf(destination);
    const means = await broker.getConnectionConfig(destination);
    // An XSUAA destination's URL is XSUAA_MCP_URL alone, never the key's url.
    const url = (await stores.urlStore.getConnectionConfig(destination))
      ?.serviceUrl;
    if (!url) {
      throw new DestinationConfigError(
        destination,
        [stores.urlKey],
        'the destination states no system URL',
      );
    }
    const settings: SapConfig = {
      url,
      ...(means?.sapClient ? { client: means.sapClient } : {}),
      authType: vetted.authType,
      ...(this.config.connectionType
        ? { connectionType: this.config.connectionType }
        : {}),
    };
    try {
      handler.checkSettings?.(settings, this.context);
    } catch (error) {
      if (error instanceof SettingsError) {
        throw new DestinationConfigError(
          destination,
          [error.setting],
          'its authentication cannot use these settings',
        );
      }
      throw error;
    }
    return settings;
  }

  /**
   * The responsible, the login and the master system the destination's own
   * `.env` states, read once per process like its settings. The process environment is not
   * read here: it is the server's fallback, after the destination.
   */
  systemContextFor(destination: string): Promise<DestinationSystemContext> {
    const cached = this.systemContexts.get(destination);
    if (cached) return cached;
    const context = (async () =>
      readDestinationSystemContext(
        (await this.buildOf(destination)).stores.destinationFile,
      ))();
    this.systemContexts.set(destination, context);
    context.catch(() => {
      if (this.systemContexts.get(destination) === context) {
        this.systemContexts.delete(destination);
      }
    });
    return context;
  }

  /**
   * The destination's provider, asked of its broker on every call with the
   * caller's `signal` (the broker answers its cached provider while the
   * destination is unchanged), handed out counted: one wrapper per inner
   * provider, so the same inner answers the same wrapper.
   */
  async getProvider(
    destination: string,
    options: BrokerCallOptions = {},
  ): Promise<IAuthProvider> {
    const broker = await this.getBroker(destination);
    const inner = await broker.getProvider(destination, {
      signal: options.signal,
    });
    const known = this.counted.get(inner);
    if (known) return known;
    const wrapper = countedProvider(inner, this.gate);
    this.counted.set(inner, wrapper);
    return wrapper;
  }

  beginShutdown(): void {
    this.shutdownBegan = true;
  }

  async settle(options: BrokerCallOptions = {}): Promise<SettleReport> {
    this.shutdownBegan = true;
    // Closed first, before any await: a 401 answered from here on gets the
    // shutdown refusal instead of a renewal that would land after the flush.
    this.gate.close();
    // Every login composed ends (`disposed`): its listener is released, and
    // a call waiting on it answers.
    await Promise.allSettled(
      [...this.logins].map((login) => login.dispose?.()),
    );
    // No deadline (D33): the shutdown's forced close is the one escape.
    await this.gate.drained(options.signal);
    const builds = await Promise.allSettled(
      [...this.built.entries()].map(async ([destination, build]) => ({
        destination,
        built: await build,
      })),
    );
    const notStored: string[] = [];
    await Promise.all(
      builds.map(async (outcome) => {
        if (outcome.status !== 'fulfilled') return;
        const { destination, built } = outcome.value;
        try {
          await built.broker.flush({ signal: options.signal });
        } catch (error) {
          notStored.push(...unstoredLines(destination, error));
        }
      }),
    );
    return { notStored };
  }

  /** The build of a destination, cached as a promise; a failed one is dropped. */
  private buildOf(destination: string): Promise<Built> {
    try {
      // Before any file is touched: the name is joined into keysDir/sessionsDir.
      assertDestinationName(destination, 'destination');
    } catch (error) {
      return Promise.reject(error);
    }
    const cached = this.built.get(destination);
    if (cached) return cached;
    const build = this.build(destination);
    this.built.set(destination, build);
    build.catch(() => {
      if (this.built.get(destination) === build) {
        this.built.delete(destination);
      }
    });
    return build;
  }

  private async build(destination: string): Promise<Built> {
    const mode = this.modeOf(destination);
    const stores = storesFor(mode, this.config.logger);
    // The failed write under 'continue' reaches stderr whatever
    // DEBUG_AUTH_LOG says (D12); the rest stays the gated diagnostics.
    const logger = brokerLogger(
      (line) => this.config.promptLogger.info(line),
      this.config.logger ?? SILENT,
    );
    const means = await stores.serviceKeyStore.getConnectionConfig(destination);
    const vetted = vetMeans(destination, means);
    const handler = handlerFor(destination, vetted);
    const renewal = RENEWALS[this.renewal];
    const broker = new AuthBroker(
      {
        serviceKeyStore: stores.serviceKeyStore,
        sessionStore: stores.sessionStore,
        // D11: every token row renews this way; basic, snc and none ignore it.
        renewal: () => renewal(),
        // D12: the user's own --env file must see a write that did not land;
        // a named destination (in memory, or sessions/ under --unsafe) goes on.
        onWriteFailure: mode.kind === 'envFile' ? 'fail' : 'continue',
        // D24: on from --auth-debug only, never from the environment.
        authDebug: this.config.authDebug === true,
        ...handler.brokerOptions(this.context),
      },
      logger,
    );
    return { broker, handler, vetted, stores };
  }

  private modeOf(destination: string): DestinationMode {
    const { envFile } = this.config;
    if (envFile && destination === ENV_FILE_DESTINATION) {
      return { kind: 'envFile', path: envFile.path, source: envFile.source };
    }
    return {
      kind: 'named',
      name: destination,
      keysDir: getPlatformPaths(this.config.authBrokerPath, 'service-keys')[0],
      sessionsDir: getPlatformPaths(this.config.authBrokerPath, 'sessions')[0],
      unsafe: this.config.unsafe,
    };
  }
}
