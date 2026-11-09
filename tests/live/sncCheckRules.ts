/**
 * The rules of the SNC live check (`tests/live/sncCheck.mjs`, RFC plan step
 * 21): its arguments, and what an SNC destination's `.env` must state. Plain
 * string code, no pattern. A temporary hand-run check — deleted with the
 * script at step 22.
 *
 * The address and the logon (client, language, one address, no URL) are the
 * production checker's (`checkDestinationStatement`); the SNC keys are this
 * file's: `SAP_CONNECTION_TYPE=rfc`, `SAP_AUTH_TYPE=snc`,
 * `SAP_SNC_PARTNERNAME`, `SAP_SYSTEM_TYPE` (`onprem` or `legacy`), and no
 * `SAP_USERNAME` or `SAP_PASSWORD`. No value is ever named — keys only.
 */

import {
  checkDestinationStatement,
  destinationAddressHint,
  destinationAddressWords,
} from '../../src/lib/config/rfcDestination';
import {
  DESTINATION_KEY_ENV,
  DESTINATION_KEYS,
  type DestinationKeyValues,
} from '../../src/lib/config/messageServer';

/** The check's three inputs. */
export interface SncCheckArguments {
  readonly env: string;
  readonly realm: string;
  readonly realmUrl: string;
}

/** The arguments the command takes, each with its value. */
const OPTIONS = ['--env', '--realm', '--realm-url'] as const;
type Option = (typeof OPTIONS)[number];

/** The command line the owner types, for the refusals. */
export const USAGE =
  'npm run test:live-snc -- --env <path to .env> --realm <expected realm> --realm-url <http(s) URL of the same system>';

/** A refusal of the command line, in fixed words naming the option. */
export class SncCheckUsageError extends Error {}

function isOption(word: string): word is Option {
  return OPTIONS.some((option) => option === word);
}

/**
 * `--env <path> --realm <realm> --realm-url <url>`, each also as
 * `--x=value`; each exactly once and non-blank; `--realm-url` an absolute
 * http(s) URL. Anything else is refused naming the option.
 */
export function parseSncCheckArguments(
  argv: readonly string[],
): SncCheckArguments {
  const values = new Map<Option, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index] ?? '';
    const equals = word.indexOf('=');
    const name = equals === -1 ? word : word.slice(0, equals);
    if (!isOption(name)) {
      throw new SncCheckUsageError(
        `unknown argument at position ${index + 1}; usage: ${USAGE}`,
      );
    }
    let value: string | undefined;
    if (equals !== -1) {
      value = word.slice(equals + 1);
    } else {
      value = argv[index + 1];
      index += 1;
    }
    if (value === undefined || value.trim() === '') {
      throw new SncCheckUsageError(`${name} needs a value; usage: ${USAGE}`);
    }
    if (values.has(name)) {
      throw new SncCheckUsageError(`${name} is given twice; usage: ${USAGE}`);
    }
    values.set(name, value.trim());
  }
  for (const option of OPTIONS) {
    if (!values.has(option)) {
      throw new SncCheckUsageError(`${option} is required; usage: ${USAGE}`);
    }
  }
  const env = values.get('--env') ?? '';
  const realm = values.get('--realm') ?? '';
  const realmUrl = values.get('--realm-url') ?? '';
  let protocol: string | undefined;
  try {
    protocol = new URL(realmUrl).protocol;
  } catch {
    protocol = undefined;
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new SncCheckUsageError(
      `--realm-url must be an absolute http(s) URL of the system; usage: ${USAGE}`,
    );
  }
  return { env, realm, realmUrl };
}

/** One fault of the `.env`: the key, and what to do about it. */
export interface SncEnvFault {
  readonly key: string;
  readonly fix: string;
}

/** `key` as the `.env` states it, trimmed; a blank one is absent. */
function stated(
  env: Readonly<Record<string, string>>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/** The `.env`'s keys that state a value, by name, sorted: what may be printed. */
export function statedKeyNames(
  env: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(env)
    .filter((key) => stated(env, key) !== undefined)
    .sort();
}

/**
 * Every fault of an SNC destination's `.env`, keys only: the SNC keys of
 * this check first, then the address and the logon as the production
 * checker reads them (its first failing step, every key of it).
 */
export function checkSncEnv(
  env: Readonly<Record<string, string>>,
): SncEnvFault[] {
  const faults: SncEnvFault[] = [];
  if (stated(env, 'SAP_CONNECTION_TYPE')?.toLowerCase() !== 'rfc') {
    faults.push({
      key: 'SAP_CONNECTION_TYPE',
      fix: 'set SAP_CONNECTION_TYPE=rfc: SNC logs on over RFC',
    });
  }
  if (stated(env, 'SAP_AUTH_TYPE')?.toLowerCase() !== 'snc') {
    faults.push({ key: 'SAP_AUTH_TYPE', fix: 'set SAP_AUTH_TYPE=snc' });
  }
  if (stated(env, 'SAP_SNC_PARTNERNAME') === undefined) {
    faults.push({
      key: 'SAP_SNC_PARTNERNAME',
      fix: "set it to the system's SNC name (SAP Logon: the system entry, Network tab)",
    });
  }
  const systemType = stated(env, 'SAP_SYSTEM_TYPE')?.toLowerCase();
  if (systemType !== 'onprem' && systemType !== 'legacy') {
    faults.push({
      key: 'SAP_SYSTEM_TYPE',
      fix: 'set SAP_SYSTEM_TYPE=onprem (RFC is served on premise)',
    });
  }
  for (const key of ['SAP_USERNAME', 'SAP_PASSWORD']) {
    if (stated(env, key) !== undefined) {
      faults.push({
        key,
        fix: 'remove it: an SNC destination has no user and no password',
      });
    }
  }
  const keys: DestinationKeyValues = {};
  for (const key of DESTINATION_KEYS) {
    const value = stated(env, DESTINATION_KEY_ENV[key]);
    if (value !== undefined) keys[key] = value;
  }
  const checked = checkDestinationStatement({
    connectionType: 'rfc',
    authType: 'snc',
    urlKey: 'SAP_URL',
    url: stated(env, 'SAP_URL'),
    statedUrlKeys: stated(env, 'XSUAA_MCP_URL') === undefined ? [] : ['XSUAA_MCP_URL'],
    keys,
  });
  if ('fault' in checked) {
    const words = destinationAddressWords('this .env', checked.fault);
    const hint = destinationAddressHint(checked.fault);
    for (const key of checked.fault.keys) {
      faults.push({ key, fix: hint === undefined ? words : `${words}. ${hint}` });
    }
  }
  return faults;
}
