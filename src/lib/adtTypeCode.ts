import { answeredObject } from '@mcp-abap-adt/adt-strategies';
import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';
import {
  type ProjectionVariant,
  TABLE_CODES,
  TYPE_NAME_VALUES,
  TYPE_NAMES,
  type TypeName,
} from './adtProjections';

/**
 * A type code an ADT **answer** carries, as a code of the ADT type tables:
 * the text, upper-cased once, looked up against the tables
 * (`answeredObject`); `undefined` for a code no table holds.
 *
 * For what SAP sent, not for a tool argument: an argument is checked against
 * its operation's projection ({@link acceptedOf}, {@link acceptedCodeOf}).
 */
export function tableCodeOf(text: string): AdtTypeCode | undefined {
  return answeredObject(text.toUpperCase()).type;
}

/** The value of `accepted` that `upper`, already upper-cased, names. */
function valueNamed<T extends string>(
  upper: string,
  accepted: readonly T[],
): T | undefined {
  return accepted.find((value) => value.toUpperCase() === upper);
}

/**
 * The codes of `codes` whose main type `upper` (already upper-cased) names:
 * those that begin with it and a slash. A code without a slash
 * (`AUTH`) is its own main type and is named as a code.
 */
function codesOfMain<C extends AdtTypeCode>(
  upper: string,
  codes: readonly C[],
): C[] {
  const prefix = `${upper}/`;
  return codes.filter((code) => code.startsWith(prefix));
}

/** The one code of `codes` whose main type `upper` names, else `undefined`. */
function oneCodeOfMain<C extends AdtTypeCode>(
  upper: string,
  codes: readonly C[],
): C | undefined {
  const [one, ...more] = codesOfMain(upper, codes);
  return more.length === 0 ? one : undefined;
}

/**
 * The boundary of a tool argument that names a type: `text`, upper-cased
 * once, as the value of `accepted` it names — `accepted` is the argument's
 * projection on the declared variant (`adtProjections.ts`), so past this the
 * value is typed as that projection. `undefined` for any other text; the
 * tool refuses it ({@link notAccepted}) and sends nothing.
 *
 * Either case is taken: a code (`clas/oc`) and a friendly name (`CLASS`)
 * alike.
 */
export function acceptedOf<T extends string>(
  text: string,
  accepted: readonly T[],
): T | undefined {
  return valueNamed(text.toUpperCase(), accepted);
}

/**
 * The one code of `codes` whose main type `text` names, either case
 * (`MainTypeCodes` of the projection); `undefined` when no code of `codes`
 * has it, or two or more share it (`AmbiguousMainTypes`, which
 * {@link notAccepted} names).
 */
export function mainTypeCodeOf<C extends AdtTypeCode>(
  text: string,
  codes: readonly C[],
): C | undefined {
  return oneCodeOfMain(text.toUpperCase(), codes);
}

/**
 * The boundary of a type argument that takes a code or a friendly name
 * standing for one: the code of `codes` it names, else the code of the name
 * of `names` it names (`TYPE_NAMES`), else the one code of `codes` whose
 * main type it names; either case, upper-cased once. `undefined` for any
 * other text, a main type two codes share included.
 */
export function acceptedCodeOf<C extends AdtTypeCode, N extends TypeName>(
  text: string,
  codes: readonly C[],
  names: readonly N[],
): C | (typeof TYPE_NAMES)[N] | undefined {
  const upper = text.toUpperCase();
  const code = valueNamed(upper, codes);
  if (code !== undefined) return code;
  const name = valueNamed(upper, names);
  if (name !== undefined) return TYPE_NAMES[name];
  return oneCodeOfMain(upper, codes);
}

/**
 * The fixed words a main type two or more codes of `codes` share is refused
 * in, naming those codes; `undefined` for any other text.
 */
export function sharedMainType(
  argument: string,
  text: string,
  codes: readonly AdtTypeCode[],
): string | undefined {
  const shared = codesOfMain(text.toUpperCase(), codes);
  return shared.length < 2
    ? undefined
    : `${argument} "${text}" is the main type of ${shared.join(', ')}: name one of these codes; nothing was sent`;
}

/**
 * The fixed words a type argument outside its projection is refused in:
 * the codes of `codes` a shared main type stands for
 * ({@link sharedMainType}), else what the argument takes on the declared
 * variant.
 */
export function notAccepted(
  argument: string,
  text: string,
  accepted: readonly string[],
  codes: readonly AdtTypeCode[],
): string {
  return (
    sharedMainType(argument, text, codes) ??
    `${argument} "${text}" is not one of: ${accepted.join(', ')}; nothing was sent`
  );
}

/**
 * The boundary of a type argument of a tool whose request names a type but
 * asks no operation of the tables of it (a node structure, an object
 * structure, a search filter): a code of `variant`'s table (`TABLE_CODES`),
 * a name standing for one (`TYPE_NAMES`) or a main type one code of the
 * table has, either case.
 */
export function tableTypeOf(text: string, variant: ProjectionVariant) {
  return acceptedCodeOf(text, TABLE_CODES[variant], TYPE_NAME_VALUES[variant]);
}

/** The refusal of a type argument {@link tableTypeOf} does not take. */
export function notATableType(
  argument: string,
  text: string,
  variant: ProjectionVariant,
): string {
  return notAccepted(
    argument,
    text,
    [...TABLE_CODES[variant], ...TYPE_NAME_VALUES[variant]],
    TABLE_CODES[variant],
  );
}
