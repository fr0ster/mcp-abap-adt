/**
 * The stores of one destination: where its means (`serviceKeyStore`) and its
 * secret (`sessionStore`) live. See the migration design, "Where a
 * destination lives".
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AbapServiceKeyStore,
  AbapSessionStore,
  EnvDestinationStore,
  EnvFileSessionStore,
  SafeAbapSessionStore,
  SafeXsuaaSessionStore,
  XSUAA_DESTINATION_VARS,
  XsuaaServiceKeyStore,
  XsuaaSessionStore,
} from '@mcp-abap-adt/auth-stores';
import type {
  IServiceKeyStore,
  ISessionStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { assertDestinationName } from './destinationName';

export type DestinationMode =
  | {
      kind: 'envFile';
      path: string;
      /** The parameter as the user gave it, for the refusal. */
      source: string;
    }
  | {
      kind: 'named';
      name: string;
      keysDir: string;
      sessionsDir: string;
      unsafe: boolean;
    };

export interface DestinationStores {
  serviceKeyStore: IServiceKeyStore;
  sessionStore: ISessionStore;
  /**
   * Where the connector's URL is read. An XSUAA destination's URL comes only
   * from `XSUAA_MCP_URL` in `sessions/<name>.env`, never from the key: the
   * key's root `url` is the UAA, which XsuaaServiceKeyStore may answer as
   * `serviceUrl`. Every other mode reads it from `serviceKeyStore`.
   */
  urlStore: IServiceKeyStore;
  /** The key the user sets the URL with, for the refusal. */
  urlKey: 'SAP_URL' | 'XSUAA_MCP_URL';
}

/**
 * The shape of `keysDir/<name>.json`: `url` + `clientid` + `clientsecret` at
 * the root is an XSUAA key; anything else, or no readable key, is ABAP.
 */
export function keyShapeOf(keysDir: string, name: string): 'abap' | 'xsuaa' {
  assertDestinationName(name, 'destination');
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(keysDir, `${name}.json`), 'utf8'),
    );
    if (
      raw &&
      typeof raw === 'object' &&
      !(raw.uaa && typeof raw.uaa === 'object') &&
      raw.url &&
      raw.clientid &&
      raw.clientsecret
    ) {
      return 'xsuaa';
    }
  } catch {
    // no key, or not readable: read as ABAP
  }
  return 'abap';
}

export function storesFor(
  mode: DestinationMode,
  logger?: ILogger,
): DestinationStores {
  if (mode.kind === 'envFile') {
    if (!fs.existsSync(mode.path)) {
      throw new Error(`${mode.source}: the file does not exist: ${mode.path}`);
    }
    const serviceKeyStore = EnvDestinationStore.forFile(mode.path, {
      log: logger,
    });
    return {
      serviceKeyStore,
      sessionStore: new EnvFileSessionStore(mode.path, logger),
      urlStore: serviceKeyStore,
      urlKey: 'SAP_URL',
    };
  }

  assertDestinationName(mode.name, 'destination');
  if (keyShapeOf(mode.keysDir, mode.name) === 'xsuaa') {
    return {
      serviceKeyStore: new EnvDestinationStore(mode.sessionsDir, {
        variables: XSUAA_DESTINATION_VARS,
        fallback: new XsuaaServiceKeyStore(mode.keysDir, {
          grantType: 'authorization_code',
          log: logger,
        }),
        log: logger,
      }),
      sessionStore: mode.unsafe
        ? new XsuaaSessionStore(mode.sessionsDir, logger)
        : new SafeXsuaaSessionStore(logger),
      urlStore: new EnvDestinationStore(mode.sessionsDir, {
        variables: XSUAA_DESTINATION_VARS,
        log: logger,
      }),
      urlKey: 'XSUAA_MCP_URL',
    };
  }
  const serviceKeyStore = new EnvDestinationStore(mode.sessionsDir, {
    fallback: new AbapServiceKeyStore(mode.keysDir, {
      grantType: 'authorization_code',
      log: logger,
    }),
    log: logger,
  });
  return {
    serviceKeyStore,
    sessionStore: mode.unsafe
      ? new AbapSessionStore(mode.sessionsDir, logger)
      : new SafeAbapSessionStore(logger),
    urlStore: serviceKeyStore,
    urlKey: 'SAP_URL',
  };
}
