import { rfcParamsFrom, type SapConfig } from '@mcp-abap-adt/connection';

/**
 * The destination keys of an RFC address, and the client and the logon
 * language: one list for every source — the CLI (`--<key>`), the process
 * environment (`SAP_<KEY>`), the destination's own means (its `.env`, then a
 * service key's fallback) and YAML (`<key>`). Read as stated: no default, no
 * derivation.
 */
/** The seven keys of an RFC address, in a fixed order. */
export const RFC_ADDRESS_KEYS = [
  'ashost',
  'sysnr',
  'mshost',
  'msserv',
  'sysid',
  'group',
  'saprouter',
] as const;

export type RfcAddressKey = (typeof RFC_ADDRESS_KEYS)[number];

/** Every destination key of this list: the address, then the client and the language. */
export const DESTINATION_KEYS = [
  ...RFC_ADDRESS_KEYS,
  'client',
  'language',
] as const;

export type DestinationKey = (typeof DESTINATION_KEYS)[number];

/** Each key's environment (and `.env`) name. */
export const DESTINATION_KEY_ENV = {
  ashost: 'SAP_ASHOST',
  sysnr: 'SAP_SYSNR',
  mshost: 'SAP_MSHOST',
  msserv: 'SAP_MSSERV',
  sysid: 'SAP_SYSID',
  group: 'SAP_GROUP',
  saprouter: 'SAP_SAPROUTER',
  client: 'SAP_CLIENT',
  language: 'SAP_LANGUAGE',
} as const satisfies Record<DestinationKey, string>;

/** A value of each key, each only when stated. */
export type DestinationKeyValues = Partial<Record<DestinationKey, string>>;

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
