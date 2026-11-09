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
 * The settings are read once per process; the provider is asked of the
 * broker on every call, with the caller's signal — the factory keeps no
 * provider cache, the broker does.
 */

import * as fs from 'node:fs';
import {
  AuthBroker,
  type BrokerCallOptions,
  DestinationConfigError,
} from '@mcp-abap-adt/auth-broker';
import { classify } from '@mcp-abap-adt/auth-errors';
import { refreshOnly, refreshThenLogin } from '@mcp-abap-adt/auth-providers';
import type { SapConfig, SapHttpConfig } from '@mcp-abap-adt/connection';
import type {
  IAuthorizationStrategy,
  IAuthProvider,
  IAuthProviderError,
  IRenewalStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import type { IConnectionConfig } from '@mcp-abap-adt/interfaces-auth-broker';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  assertDestinationName,
  type DestinationSystemContext,
  SettingsError,
} from '@mcp-abap-adt/lib/auth';
import {
  checkDestinationStatement,
  DESTINATION_KEYS,
  type DestinationKey,
  type DestinationKeyValues,
  rfcConfigOf,
  URL_KEYS,
} from '@mcp-abap-adt/lib/config';
import * as dotenv from 'dotenv';
import { getPlatformPaths } from '../config/platformPaths';
import { countedProvider, ProviderGate } from './countedProvider';
import { DestinationAddressRefusal } from './destinationFailure';
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
import type {
  IAuthBrokerFactoryConfig,
  StartDestinationKeys,
} from './IAuthBrokerFactoryConfig.js';
import { brokerLogger, type LoginBound, loginBound } from './serverLogin';
import {
  type RenewalMode,
  type ServerState,
  serverSentence,
} from './serverSentences';
import { type VettedAuthentication, vetMeans } from './vocabulary';

/** The destination an `--env` file is served as. */
const ENV_FILE_DESTINATION = 'default';

/** A destination's stores and its vetted authentication, read before any handler is chosen. */
interface Stated {
  stores: DestinationStores;
  vetted: VettedAuthentication;
}

interface Built extends Stated {
  broker: AuthBroker;
  handler: AuthenticationHandler;
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

/** The means field each destination key is read from. */
const MEANS_FIELD = {
  ashost: 'ashost',
  sysnr: 'sysnr',
  mshost: 'mshost',
  msserv: 'msserv',
  sysid: 'sysid',
  group: 'group',
  saprouter: 'saprouter',
  client: 'sapClient',
  language: 'language',
} as const satisfies Record<DestinationKey, keyof IConnectionConfig>;

/**
 * `key` as the destination's own `.env` states it; absent when the file
 * states none or cannot be read. Read only to refuse a URL over RFC.
 */
function ownFileValue(file: string, key: string): string | undefined {
  try {
    return dotenv.parse(fs.readFileSync(file, 'utf8'))[key];
  } catch {
    return undefined;
  }
}

/** An HTTP destination's settings, as a literal of its shape. */
function httpSettingsOf(
  authType: SapHttpConfig['authType'],
  url: string,
  client: string | undefined,
): SapHttpConfig {
  return {
    url,
    ...(client !== undefined ? { client } : {}),
    authType,
    connectionType: 'http',
  };
}

/** `value` trimmed; a blank one is unset. */
function stated(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The destination keys in effect: for each, the start's CLI or process
 * environment, then the destination's means (its `.env`, then a service
 * key's fallback, as its store merged them), then YAML — trimmed, a blank
 * value unset. A key stated nowhere has no key.
 */
export function effectiveDestinationKeys(
  start: StartDestinationKeys | undefined,
  means: IConnectionConfig | null | undefined,
): DestinationKeyValues {
  const out: DestinationKeyValues = {};
  for (const key of DESTINATION_KEYS) {
    const value =
      stated(start?.overMeans[key]) ??
      stated(means?.[MEANS_FIELD[key]]) ??
      stated(start?.underMeans[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

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
  /** `--login-timeout`: the bound every composed login runs under. */
  private readonly bound: LoginBound | undefined;
  /** The build of each destination, set before its first await. */
  private readonly built = new Map<string, Promise<Built>>();
  /** What each destination states, read once, set before its first await. */
  private readonly stated = new Map<string, Promise<Stated>>();
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
   * The server's own sentence for a chain failure, keyed on its
   * `kind` and this factory's state: the renewal it was started with, and
   * whether the shutdown closed its gate.
   */
  sentenceFor(error: IAuthProviderError): string | undefined {
    return serverSentence(error, this.state());
  }

  /** The server's own state a sentence is keyed on. */
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

  /** The destination keys in effect for `destination` (`effectiveDestinationKeys`). */
  async destinationKeysFor(destination: string): Promise<DestinationKeyValues> {
    // The means are read on every call, as the broker answers them: a fixed
    // file answers the next read.
    const { stores } = await this.statedOf(destination);
    const means = await stores.serviceKeyStore.getConnectionConfig(destination);
    return effectiveDestinationKeys(this.config.destinationKeys, means);
  }

  /**
   * The destination's settings, checked where they enter the type system
   * (24.0.0): the connection type is stated (the launcher refuses its
   * absence first); the URL is read as the wire takes it — over HTTP from the
   * URL store, over RFC only to refuse one the destination's own file states,
   * the store asked nothing; the address, the client and the language as in
   * effect (`destinationKeysFor`). The nine refusals of
   * `checkDestinationStatement` come before any connection opens, as a
   * `DestinationAddressRefusal`; a complete destination is built per wire,
   * as a literal of its shape.
   */
  private async readSettings(destination: string): Promise<SapConfig> {
    const { connectionType } = this.config;
    if (connectionType === undefined) {
      throw new DestinationConfigError(
        destination,
        ['SAP_CONNECTION_TYPE'],
        'the destination states no connection type',
      );
    }
    // What the destination states is checked before a handler is chosen:
    // an address refusal answers even for an authentication not served.
    const { vetted, stores } = await this.statedOf(destination);
    const keys = await this.destinationKeysFor(destination);
    const url =
      connectionType === 'http'
        ? // An XSUAA destination's URL is XSUAA_MCP_URL alone, never the key's url.
          stated(
            (await stores.urlStore.getConnectionConfig(destination))
              ?.serviceUrl,
          )
        : undefined;
    // Over RFC every URL key of the destination's own file refuses it, its
    // URL key or not; the stores are asked nothing.
    const statedUrlKeys =
      connectionType === 'rfc'
        ? URL_KEYS.filter(
            (key) =>
              stated(ownFileValue(stores.destinationFile, key)) !== undefined,
          )
        : [];
    const checked = checkDestinationStatement({
      connectionType,
      systemType: this.config.systemType,
      authType: vetted.authType,
      urlKey: stores.urlKey,
      url,
      statedUrlKeys,
      keys,
    });
    if ('fault' in checked) {
      // HTTP without a URL: today's refusal, naming the URL key.
      if (checked.fault.case === 'http-without-url') {
        throw new DestinationConfigError(
          destination,
          [stores.urlKey],
          'the destination states no system URL',
        );
      }
      throw new DestinationAddressRefusal(destination, checked.fault);
    }
    const { handler } = await this.buildOf(destination);
    const settings: SapConfig =
      'rfc' in checked
        ? rfcConfigOf({ authType: vetted.authType }, checked.rfc)
        : httpSettingsOf(vetted.authType, checked.http.url, keys.client);
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
   * `.env` states, and the master language of its created objects — its
   * `SAP_LANGUAGE` in effect (`effectiveDestinationKeys`) — read once per
   * process like its settings. The process environment is read here only as
   * the start parameters rank it.
   */
  systemContextFor(destination: string): Promise<DestinationSystemContext> {
    const cached = this.systemContexts.get(destination);
    if (cached) return cached;
    const context = (async (): Promise<DestinationSystemContext> => {
      const { stores } = await this.buildOf(destination);
      const { language } = await this.destinationKeysFor(destination);
      return {
        ...readDestinationSystemContext(stores.destinationFile),
        ...(language !== undefined ? { masterLanguage: language } : {}),
      };
    })();
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

  /**
   * Every login composed ends (`disposed`): its listener is released, and a
   * call waiting on it answers. A shutdown before the transport opened calls
   * it beside its logoffs: the start's own login ends with it.
   */
  async endLogins(): Promise<void> {
    await Promise.allSettled(
      [...this.logins].map((login) => login.dispose?.()),
    );
  }

  async settle(options: BrokerCallOptions = {}): Promise<SettleReport> {
    this.shutdownBegan = true;
    // Closed first, before any await: a 401 answered from here on gets the
    // shutdown refusal instead of a renewal that would land after the flush.
    this.gate.close();
    await this.endLogins();
    // No deadline: the shutdown's forced close is the one escape.
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

  /** What a destination states, cached as a promise; a failed read is dropped. */
  private statedOf(destination: string): Promise<Stated> {
    try {
      // Before any file is touched: the name is joined into keysDir/sessionsDir.
      assertDestinationName(destination, 'destination');
    } catch (error) {
      return Promise.reject(error);
    }
    const cached = this.stated.get(destination);
    if (cached) return cached;
    const read = (async (): Promise<Stated> => {
      const stores = storesFor(this.modeOf(destination), this.config.logger);
      const means =
        await stores.serviceKeyStore.getConnectionConfig(destination);
      return { stores, vetted: vetMeans(destination, means) };
    })();
    this.stated.set(destination, read);
    read.catch(() => {
      if (this.stated.get(destination) === read) {
        this.stated.delete(destination);
      }
    });
    return read;
  }

  private async build(destination: string): Promise<Built> {
    const mode = this.modeOf(destination);
    const { stores, vetted } = await this.statedOf(destination);
    // The failed write under 'continue' reaches stderr whatever
    // DEBUG_AUTH_LOG says; the rest stays the gated diagnostics.
    const logger = brokerLogger(
      (line) => this.config.promptLogger.info(line),
      this.config.logger ?? SILENT,
    );
    const handler = handlerFor(destination, vetted);
    const renewal = RENEWALS[this.renewal];
    const broker = new AuthBroker(
      {
        serviceKeyStore: stores.serviceKeyStore,
        sessionStore: stores.sessionStore,
        // Every token row renews this way; basic, snc and none ignore it.
        renewal: () => renewal(),
        // The user's own --env file must see a write that did not land;
        // a named destination (in memory, or sessions/ under --unsafe) goes on.
        onWriteFailure: mode.kind === 'envFile' ? 'fail' : 'continue',
        // On from --auth-debug only, never from the environment.
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
