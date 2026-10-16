import { rfcParamsFrom, type SapConfig } from '@mcp-abap-adt/connection';

/**
 * RFC through a message server and a logon group (connection 18): the
 * `SapConfig` field each environment variable sets. The server carries them
 * as configured and decides nothing — no default (`group`'s `PUBLIC` is
 * connection's), no check (connection refuses `mshost` with neither
 * `msserv` nor `sysid`, naming both).
 */
export const MESSAGE_SERVER_ENV = {
  mshost: 'SAP_MSHOST',
  msserv: 'SAP_MSSERV',
  sysid: 'SAP_SYSID',
  group: 'SAP_GROUP',
  saprouter: 'SAP_SAPROUTER',
} as const;

export type MessageServerField = keyof typeof MESSAGE_SERVER_ENV;

/** The five fields, in a fixed order. */
export const MESSAGE_SERVER_FIELDS = Object.keys(
  MESSAGE_SERVER_ENV,
) as readonly MessageServerField[];

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
 * connection's own refusals of an RFC address it cannot dial — a message
 * server with neither `msserv` nor `sysid`, an address with neither `url` nor
 * `mshost` — read once from connection itself (`rfcParamsFrom`). Each is a
 * fixed sentence that quotes no value of the config.
 */
const RFC_ADDRESS_REFUSALS: readonly string[] = (() => {
  const words: string[] = [];
  for (const probe of [{ mshost: 'probe' }, {}] as SapConfig[]) {
    try {
      rfcParamsFrom(probe);
    } catch (error) {
      if (error instanceof Error && error.message) words.push(error.message);
    }
  }
  return words;
})();

/**
 * The words of `error` when it is one of connection's refusals of an RFC
 * address, as connection gave them; `undefined` for anything else, whose
 * message is never read out.
 */
export function rfcAddressRefusalOf(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  let message: unknown;
  try {
    message = error.message;
  } catch {
    return undefined;
  }
  return typeof message === 'string' && RFC_ADDRESS_REFUSALS.includes(message)
    ? message
    : undefined;
}
