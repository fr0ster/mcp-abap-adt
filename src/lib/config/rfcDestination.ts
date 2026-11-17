/**
 * What an RFC or HTTP destination states, checked where it enters the type
 * system (24.0.0): the nine refusal cases, in order — the first failing step
 * answers, and a step names every faulty key — and, for a complete RFC
 * destination, its one address, typed. Keys only: no value is ever quoted.
 *
 * Plain code over what the reader of the source handed in: the server's
 * destination reader (`AuthBrokerFactory.readSettings`) and the live tests'
 * helper (`getSapConfigFromEnv`) each read their source and ask this.
 */

import type {
  ISapConfigBase,
  ISapRfcConfig,
} from '@mcp-abap-adt/interfaces-auth-sap';
import {
  DESTINATION_KEY_ENV,
  type DestinationKeyValues,
  RFC_ADDRESS_KEYS,
} from './messageServer.js';

/** The nine cases a destination's address and logon are refused in. */
export type DestinationAddressCase =
  /** 1. HTTP stating an RFC address key. */
  | 'http-with-rfc-keys'
  /** 2. HTTP without a URL. */
  | 'http-without-url'
  /** 3. RFC stating a URL. */
  | 'rfc-with-url'
  /** 4. RFC stating keys of both addresses. */
  | 'two-addresses'
  /** 5. RFC stating no address key. */
  | 'no-address'
  /** 6. RFC with an incomplete address. */
  | 'incomplete-address'
  /** 7. RFC without its client or language. */
  | 'logon-incomplete'
  /** 8. ABAP Cloud over RFC. */
  | 'cloud-over-rfc'
  /** 9. A client certificate over RFC. */
  | 'certificate-over-rfc';

/** A refusal: its case and the keys it names (env names; one item may join two). */
export interface DestinationAddressFault {
  readonly case: DestinationAddressCase;
  readonly keys: readonly string[];
}

/** The URL key of a destination: `SAP_URL`, or `XSUAA_MCP_URL` for an XSUAA key. */
export type DestinationUrlKey = 'SAP_URL' | 'XSUAA_MCP_URL';

/** What the checks read: stated values only (trimmed, a blank one absent). */
export interface DestinationStatement {
  readonly connectionType: 'http' | 'rfc';
  /** The system type in effect, when one is stated. */
  readonly systemType?: 'onprem' | 'cloud' | 'legacy' | undefined;
  readonly authType: string;
  /** The URL key the destination states its URL with, and its URL when it does. */
  readonly urlKey: DestinationUrlKey;
  readonly url?: string | undefined;
  /**
   * Over RFC: every URL key the destination's own file states (present and
   * not blank), whichever its URL key is — each refuses it, named.
   */
  readonly statedUrlKeys?: readonly DestinationUrlKey[] | undefined;
  /** The destination keys in effect. */
  readonly keys: DestinationKeyValues;
}

/** The message-server service: `msserv` (with `sysid` or not), or `sysid` alone. */
export type MessageServerService =
  | { readonly by: 'msserv'; readonly msserv: string; readonly sysid?: string }
  | { readonly by: 'sysid'; readonly sysid: string };

/** A complete RFC address, as stated. */
export type StatedRfcAddress =
  | {
      readonly kind: 'application-server';
      readonly ashost: string;
      readonly sysnr: string;
    }
  | {
      readonly kind: 'message-server';
      readonly mshost: string;
      readonly group: string;
      readonly service: MessageServerService;
    };

/** A complete RFC destination's logon and address, as stated. */
export interface StatedRfcDestination {
  readonly client: string;
  readonly language: string;
  readonly saprouter?: string;
  readonly address: StatedRfcAddress;
}

/** Every URL key a destination may state, in a fixed order. */
export const URL_KEYS: readonly DestinationUrlKey[] = [
  'SAP_URL',
  'XSUAA_MCP_URL',
];

/** The one item of case 6 that names either service key. */
export const MSSERV_OR_SYSID = 'SAP_MSSERV or SAP_SYSID';

const APPLICATION_KEYS = ['ashost', 'sysnr'] as const;
const MESSAGE_KEYS = ['mshost', 'msserv', 'sysid', 'group'] as const;

const envOf = (key: keyof typeof DESTINATION_KEY_ENV) =>
  DESTINATION_KEY_ENV[key];

const fault = (
  which: DestinationAddressCase,
  keys: readonly string[],
): { fault: DestinationAddressFault } => ({ fault: { case: which, keys } });

/** The service of a message server, when one is stated. */
function serviceOf(
  keys: DestinationKeyValues,
): MessageServerService | undefined {
  if (keys.msserv !== undefined) {
    return keys.sysid === undefined
      ? { by: 'msserv', msserv: keys.msserv }
      : { by: 'msserv', msserv: keys.msserv, sysid: keys.sysid };
  }
  return keys.sysid === undefined
    ? undefined
    : { by: 'sysid', sysid: keys.sysid };
}

/** Steps 4 to 6: the address, or its fault. */
function addressOf(
  keys: DestinationKeyValues,
): { address: StatedRfcAddress } | { fault: DestinationAddressFault } {
  const application = APPLICATION_KEYS.filter((key) => keys[key] !== undefined);
  const message = MESSAGE_KEYS.filter((key) => keys[key] !== undefined);
  if (application.length > 0 && message.length > 0) {
    return fault('two-addresses', [...application, ...message].map(envOf));
  }
  if (application.length === 0 && message.length === 0) {
    return fault(
      'no-address',
      [...APPLICATION_KEYS, ...MESSAGE_KEYS].map(envOf),
    );
  }
  if (application.length > 0) {
    if (keys.ashost === undefined)
      return fault('incomplete-address', [envOf('ashost')]);
    if (keys.sysnr === undefined)
      return fault('incomplete-address', [envOf('sysnr')]);
    return {
      address: {
        kind: 'application-server',
        ashost: keys.ashost,
        sysnr: keys.sysnr,
      },
    };
  }
  const service = serviceOf(keys);
  const missing: string[] = [];
  if (keys.mshost === undefined) missing.push(envOf('mshost'));
  if (keys.group === undefined) missing.push(envOf('group'));
  if (service === undefined) missing.push(MSSERV_OR_SYSID);
  if (
    keys.mshost === undefined ||
    keys.group === undefined ||
    service === undefined
  ) {
    return fault('incomplete-address', missing);
  }
  return {
    address: {
      kind: 'message-server',
      mshost: keys.mshost,
      group: keys.group,
      service,
    },
  };
}

/**
 * The destination checked, step by step: an HTTP destination answers
 * its URL, a complete RFC destination its logon and address, and
 * any other the first failing step's fault.
 */
export function checkDestinationStatement(
  stated: DestinationStatement,
):
  | { readonly http: { readonly url: string } }
  | { readonly rfc: StatedRfcDestination }
  | { readonly fault: DestinationAddressFault } {
  const { keys } = stated;
  if (stated.connectionType === 'http') {
    const rfcKeys = RFC_ADDRESS_KEYS.filter((key) => keys[key] !== undefined);
    if (rfcKeys.length > 0)
      return fault('http-with-rfc-keys', rfcKeys.map(envOf));
    if (stated.url === undefined) {
      return fault('http-without-url', [stated.urlKey]);
    }
    return { http: { url: stated.url } };
  }
  const urlKeys = URL_KEYS.filter(
    (key) =>
      (stated.url !== undefined && key === stated.urlKey) ||
      (stated.statedUrlKeys ?? []).includes(key),
  );
  if (urlKeys.length > 0) return fault('rfc-with-url', urlKeys);
  const address = addressOf(keys);
  if ('fault' in address) return address;
  const lacking: string[] = [];
  if (keys.client === undefined) lacking.push(envOf('client'));
  if (keys.language === undefined) lacking.push(envOf('language'));
  if (keys.client === undefined || keys.language === undefined) {
    return fault('logon-incomplete', lacking);
  }
  if (stated.systemType === 'cloud') {
    return fault('cloud-over-rfc', ['SAP_SYSTEM_TYPE', 'SAP_CONNECTION_TYPE']);
  }
  if (stated.authType === 'certificate') {
    return fault('certificate-over-rfc', [
      'SAP_AUTH_TYPE',
      'SAP_CONNECTION_TYPE',
    ]);
  }
  return {
    rfc: {
      client: keys.client,
      language: keys.language,
      ...(keys.saprouter !== undefined && { saprouter: keys.saprouter }),
      address: address.address,
    },
  };
}

/** The words of a fault, for destination `destination`: keys only. */
export function destinationAddressWords(
  destination: string,
  found: DestinationAddressFault,
): string {
  const d = `Destination "${destination}"`;
  const keys = found.keys.join(', ');
  switch (found.case) {
    case 'http-with-rfc-keys':
      return `${d} is HTTP and states RFC address keys, which HTTP does not take: ${keys}`;
    case 'http-without-url':
      return `${d} cannot be used: ${keys}`;
    case 'rfc-with-url':
      return `${d} is RFC and states ${keys}, which an RFC destination does not take`;
    case 'two-addresses':
      return `${d} states two RFC addresses — an application server and a message server: ${keys}`;
    case 'no-address':
      return `${d} is RFC and states no address: set SAP_ASHOST and SAP_SYSNR, or SAP_MSHOST with SAP_MSSERV or SAP_SYSID and SAP_GROUP`;
    case 'incomplete-address':
      return `${d} is RFC and its address lacks: ${keys}`;
    case 'logon-incomplete':
      return `${d} is RFC and lacks: ${keys}`;
    case 'cloud-over-rfc':
      return `${d} is ABAP Cloud over RFC, which ABAP Cloud does not offer: ${keys}`;
    case 'certificate-over-rfc':
      return `${d} logs on with a client certificate over RFC, which the RFC wire does not take: ${keys}`;
  }
}

/** Each key a refusal names, with its CLI and YAML forms. */
function formsOf(key: string): string {
  if (key === MSSERV_OR_SYSID) {
    return 'SAP_MSSERV (--msserv, msserv in YAML) or SAP_SYSID (--sysid, sysid in YAML)';
  }
  for (const [field, env] of Object.entries(DESTINATION_KEY_ENV)) {
    if (env === key) return `${env} (--${field}, ${field} in YAML)`;
  }
  if (key === 'SAP_SYSTEM_TYPE') {
    return 'SAP_SYSTEM_TYPE (--system-type, system-type in YAML)';
  }
  if (key === 'SAP_CONNECTION_TYPE') {
    return 'SAP_CONNECTION_TYPE (--connection-type, connection-type in YAML)';
  }
  return `${key} (the destination's .env)`;
}

/**
 * The fixed hint of a fault: each key it names with its CLI and YAML forms;
 * `undefined` for `http-without-url`, whose hint is the URL key's own.
 */
export function destinationAddressHint(
  found: DestinationAddressFault,
): string | undefined {
  const forms = found.keys.map(formsOf).join('; ');
  switch (found.case) {
    case 'http-without-url':
      return undefined;
    case 'http-with-rfc-keys':
      return `Remove them from the destination, or state SAP_CONNECTION_TYPE=rfc: ${forms}`;
    case 'rfc-with-url':
      return `Remove it from the destination's .env (each one named): an RFC destination states its address — SAP_ASHOST and SAP_SYSNR, or SAP_MSHOST with SAP_MSSERV or SAP_SYSID and SAP_GROUP`;
    case 'two-addresses':
      return `Keep the keys of one address: ${forms}`;
    case 'no-address':
    case 'incomplete-address':
    case 'logon-incomplete':
      return `Set: ${forms}`;
    case 'cloud-over-rfc':
      return `ABAP Cloud is served over HTTP: ${forms}`;
    case 'certificate-over-rfc':
      return `The client certificate logs on over HTTP: ${forms}`;
  }
}

/**
 * The RFC config of a checked destination: `base` (its authentication)
 * with its logon and its one address, each as stated, built per address — a
 * key that does not belong is omitted, never `undefined`.
 */
export function rfcConfigOf(
  base: ISapConfigBase,
  stated: StatedRfcDestination,
): ISapRfcConfig {
  const logon = {
    ...base,
    connectionType: 'rfc' as const,
    client: stated.client,
    language: stated.language,
    ...(stated.saprouter !== undefined && { saprouter: stated.saprouter }),
  };
  const { address } = stated;
  if (address.kind === 'application-server') {
    return { ...logon, ashost: address.ashost, sysnr: address.sysnr };
  }
  const { service } = address;
  if (service.by === 'msserv') {
    return {
      ...logon,
      mshost: address.mshost,
      group: address.group,
      msserv: service.msserv,
      ...(service.sysid !== undefined && { sysid: service.sysid }),
    };
  }
  return {
    ...logon,
    mshost: address.mshost,
    group: address.group,
    sysid: service.sysid,
  };
}
