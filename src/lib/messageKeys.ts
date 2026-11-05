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
 * A name that is taken, each key with its evidence:
 * - `OO 002` "&1 &2 already exists" — Measured: a class validation's `400`
 *   (corpus `refusal-validation-name-taken-class`).
 * - `SWB_TOOL 016` "&1 with the name &2 already exists" — Measured: the
 *   domain and database table validations' `400` (corpus
 *   `refusal-validation-name-taken-domain`, `…-table`).
 * - `SADT_RESOURCE 001` "Resource &1 &2 does already exist." — Measured:
 *   creating a class that exists, on premise 2026-11-05 (`400`,
 *   `ExceptionResourceAlreadyExists`, V1 `CLASS`, V2 the name).
 *
 * The DDL and function group validations answer `SEVERITY` `ERROR` with a
 * sentence and no key, and creating a program that exists answers `500`
 * `ExceptionResourceCreationFailure` keyed `XI 001` (on premise,
 * 2026-11-05): neither is named here; SAP's answer is relayed as it is.
 */
export const NAME_TAKEN_KEYS: readonly T100Key[] = [
  { id: 'OO', no: '002' },
  { id: 'SWB_TOOL', no: '016' },
  { id: 'SADT_RESOURCE', no: '001' },
];

/**
 * The exception type that names a taken name where SAP gives no T100 key:
 * the structured verdict then. An Inference (the readers before 24.0.0): no
 * keyless answer of this type is measured — the class create measured
 * carries `SADT_RESOURCE 001`. With a key, the key decides.
 */
export const ALREADY_EXISTS_TYPE = 'ExceptionResourceAlreadyExists';
