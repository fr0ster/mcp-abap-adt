/**
 * SAP's messages judged by key: the T100 key (message class and number) a
 * reader extracted from the answer, never the message's words, which change
 * with the logon language and the release.
 */
import type { AdtMessage } from '@mcp-abap-adt/adt-strategies';

/** A T100 key: the message class (`id`) and the message number (`no`). */
export interface T100Key {
  readonly id: string;
  readonly no: string;
}

/** Whether `message` carries one of `keys`. */
export function hasT100Key(
  message: AdtMessage,
  keys: readonly T100Key[],
): boolean {
  const key = message.t100;
  if (key === undefined) return false;
  return keys.some((one) => one.id === key.id && one.no === key.no);
}

/**
 * A name that is taken, as a validation refuses it (corpus,
 * `refusal-validation-name-taken-*`): `OO 002` for a class,
 * `SWB_TOOL 016` for a domain and a database table. The DDL and function
 * group validations answer `SEVERITY` `ERROR` with a sentence and no key:
 * that refusal is relayed, not named.
 */
export const NAME_TAKEN_KEYS: readonly T100Key[] = [
  { id: 'OO', no: '002' },
  { id: 'SWB_TOOL', no: '016' },
];
