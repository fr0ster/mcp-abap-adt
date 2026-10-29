import {
  AdtClientCloud,
  AdtClientOnPrem,
  AdtExecutor,
} from '@mcp-abap-adt/adt-clients';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAdtClientOptions } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import type { IServerAdtClient } from './adtClientContract';
import { ServerRefusal } from './auth/serverRefusal';
import { registerConnectionResetHook } from './connectionEvents';
import { systemKindOf } from './connectionFactory';
import { getCreateSystemContext } from './systemContext';
import { guardedSystemContext } from './systemContextGuard';
import type { AbapSystemKind } from './systemKind';
import { getManagedConnection } from './utils';

/**
 * The release variant of the ADT client a connection gets: the system kind
 * the process declares for it (`systemKindOf` — the kind the connection was
 * built for, else the server's `systemType`, else `SAP_SYSTEM_TYPE`).
 * `legacy` is an on-premise system (`statedSystemKind`): its tools are
 * filtered by `available_in`, its client is the on-premise one, as before.
 */
export type ServerVariant = AbapSystemKind;

/** The declared variant's client, with its variant beside it. */
export type ServerAdtClient =
  | { readonly variant: 'onprem'; readonly client: IServerAdtClient<'onprem'> }
  | { readonly variant: 'cloud'; readonly client: IServerAdtClient<'cloud'> };

let adtClient: IServerAdtClient | undefined;
let adtClientConnection: AbapConnection | undefined;

/**
 * The system context every client of this server carries: it refuses an
 * empty responsible where adt-clients is about to send one
 * (`guardedSystemContext`), so a change is never sent without one. An empty
 * master system is left out.
 */
function guardedOptions(options: IAdtClientOptions | undefined) {
  return guardedSystemContext({
    masterSystem: options?.masterSystem,
    responsible: options?.responsible,
    masterLanguage: options?.masterLanguage,
  });
}

/** The on-premise client this server builds (`ADT_TYPES_ONPREM`). */
class GuardedAdtClientOnPrem extends AdtClientOnPrem {
  constructor(
    connection: IAbapConnection,
    logger: ILogger | undefined,
    options: IAdtClientOptions | undefined,
  ) {
    super(connection, logger, options);
    this.systemContext = guardedOptions(options);
  }
}

/** The ABAP cloud client this server builds (`ADT_TYPES_CLOUD`). */
class GuardedAdtClientCloud extends AdtClientCloud {
  constructor(
    connection: IAbapConnection,
    logger: ILogger | undefined,
    options: IAdtClientOptions | undefined,
  ) {
    super(connection, logger, options);
    this.systemContext = guardedOptions(options);
  }
}

/**
 * The variant declared for `connection`. None declared is refused
 * (`system_type_required`) before anything is sent: the variant is never
 * guessed, never defaulted.
 */
export function variantOf(connection: object): ServerVariant {
  const kind = systemKindOf(connection);
  if (kind === undefined) throw new ServerRefusal('system_type_required');
  return kind;
}

/**
 * The client of the variant declared for `connection`, tagged with it:
 * `AdtClientOnPrem` for `onprem` (and `legacy`), `AdtClientCloud` for
 * `cloud`. Narrow on `variant` to reach what only one table serves.
 */
export function adtClientOf(
  connection: IAbapConnection,
  logger?: ILogger,
): ServerAdtClient {
  // Inside a request scope (HTTP/SSE, or an embedding host's own), the scope
  // decides masterLanguage, and responsible/masterSystem when it carries them —
  // never a value a previous request left in the process cache. stdio has no
  // scope → the process context. See getCreateSystemContext.
  const ctx = getCreateSystemContext();
  const options =
    ctx.masterSystem || ctx.responsible || ctx.masterLanguage
      ? {
          masterSystem: ctx.masterSystem,
          responsible: ctx.responsible,
          masterLanguage: ctx.masterLanguage,
        }
      : undefined;
  return variantOf(connection) === 'onprem'
    ? {
        variant: 'onprem',
        client: new GuardedAdtClientOnPrem(connection, logger, options),
      }
    : {
        variant: 'cloud',
        client: new GuardedAdtClientCloud(connection, logger, options),
      };
}

/**
 * The declared variant's client, read as what both modern tables serve:
 * every call a tool of either variant may make.
 */
export function createAdtClient(
  connection: IAbapConnection,
  logger?: ILogger,
): IServerAdtClient {
  return adtClientOf(connection, logger).client;
}

/**
 * The on-premise client, for a member only `ADT_TYPES_ONPREM` lists (a
 * program's or an include's create, change, activation, lock, deletion).
 * A connection declared `cloud` is refused (`variant_not_served`) before
 * anything is sent; its tools are not registered there, so only a caller
 * outside the tool set meets it.
 */
export function createOnPremAdtClient(
  connection: IAbapConnection,
  logger?: ILogger,
): IServerAdtClient<'onprem'> {
  const served = adtClientOf(connection, logger);
  if (served.variant !== 'onprem') {
    throw new ServerRefusal('variant_not_served');
  }
  return served.client;
}

/**
 * The on-premise executor, for a program's run (`run`, `profile` of
 * `PROG/P`: `ADT_TYPES_ONPREM` only). A connection declared `cloud` is
 * refused (`variant_not_served`) before anything is sent.
 */
export function createOnPremExecutor(
  connection: IAbapConnection,
  logger?: ILogger,
): AdtExecutor<'onprem'> {
  if (variantOf(connection) !== 'onprem') {
    throw new ServerRefusal('variant_not_served');
  }
  return new AdtExecutor<'onprem'>(connection, logger);
}

export function getAdtClient(): IServerAdtClient {
  const connection = getManagedConnection();

  if (!adtClient || adtClientConnection !== connection) {
    adtClient = createAdtClient(connection);
    adtClientConnection = connection;
  }

  return adtClient;
}

export function resetClientCache() {
  adtClient = undefined;
  adtClientConnection = undefined;
}

registerConnectionResetHook(resetClientCache);
