import { rfcParamsFrom, type SapConfig } from '@mcp-abap-adt/connection';

/**
 * RFC through a message server and a logon group (connection 18): the
 * `SapConfig` field each environment variable sets. The server carries them
 * as configured and decides nothing — no default (`group`'s `PUBLIC` is
 * connection's), no check (connection refuses `mshost` with neither
 * `msserv` nor `sysid`, naming both).
 */
/** The five fields, in a fixed order. */
export const MESSAGE_SERVER_FIELDS = [
  'mshost',
  'msserv',
  'sysid',
  'group',
  'saprouter',
] as const;

export type MessageServerField = (typeof MESSAGE_SERVER_FIELDS)[number];

export const MESSAGE_SERVER_ENV = {
  mshost: 'SAP_MSHOST',
  msserv: 'SAP_MSSERV',
  sysid: 'SAP_SYSID',
  group: 'SAP_GROUP',
  saprouter: 'SAP_SAPROUTER',
} as const satisfies Record<MessageServerField, string>;

/**
 * Sets each field `env` states on `config`, trimmed as `SAP_CLIENT` is; a
 * field `env` does not state (or states blank) gets no key.
 */
export function applyMessageServerFields(
  config: SapConfig,
  env: NodeJS.ProcessEnv,
): void {
  for (const field of MESSAGE_SERVER_FIELDS) {
    const value = env[MESSAGE_SERVER_ENV[field]]?.trim();
    if (value) config[field] = value;
  }
}

/**
 * connection's own refusal of an RFC address it cannot dial — a message
 * server with neither `msserv` nor `sysid`, an address with neither `url` nor
 * `mshost` — carrying connection's own words: a fixed sentence that quotes no
 * value of the config.
 */
export class RfcAddressRefusal extends Error {}

/**
 * connection's refusal of `config`'s RFC address, asked of connection
 * itself (`rfcParamsFrom`): its plain `Error`, as an `RfcAddressRefusal`;
 * `undefined` when connection can dial it (or refuses with an error of
 * another class, never read out).
 */
export function rfcAddressRefusalFor(
  config: SapConfig,
): RfcAddressRefusal | undefined {
  try {
    rfcParamsFrom(config);
  } catch (error) {
    if (
      error instanceof Error &&
      Object.getPrototypeOf(error) === Error.prototype
    ) {
      return new RfcAddressRefusal(error.message);
    }
  }
  return undefined;
}

/**
 * The words of `error` when it is connection's refusal of an RFC address
 * (`RfcAddressRefusal`), as connection gave them; `undefined` for anything
 * else, whose message is never read out.
 */
export function rfcAddressRefusalOf(error: unknown): string | undefined {
  return error instanceof RfcAddressRefusal ? error.message : undefined;
}
