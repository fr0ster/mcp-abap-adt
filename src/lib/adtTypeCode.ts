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
  const upper = text.toUpperCase();
  return accepted.find((value) => value.toUpperCase() === upper);
}

/**
 * The boundary of a type argument that takes a code or a friendly name
 * standing for one: the code of `codes` it names, else the code of the name
 * of `names` it names (`TYPE_NAMES`), either case; `undefined` for any other
 * text.
 */
export function acceptedCodeOf<C extends AdtTypeCode, N extends TypeName>(
  text: string,
  codes: readonly C[],
  names: readonly N[],
): C | (typeof TYPE_NAMES)[N] | undefined {
  const code = acceptedOf(text, codes);
  if (code !== undefined) return code;
  const name = acceptedOf(text, names);
  return name === undefined ? undefined : TYPE_NAMES[name];
}

/**
 * The fixed words a type argument outside its projection is refused in,
 * naming what the argument takes on the declared variant.
 */
export function notAccepted(
  argument: string,
  text: string,
  accepted: readonly string[],
): string {
  return `${argument} "${text}" is not one of: ${accepted.join(', ')}; nothing was sent`;
}

/**
 * The boundary of a type argument of a tool whose request names a type but
 * asks no operation of the tables of it (a node structure, an object
 * structure, a search filter): a code of `variant`'s table (`TABLE_CODES`)
 * or a name standing for one (`TYPE_NAMES`), either case.
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
  return notAccepted(argument, text, [
    ...TABLE_CODES[variant],
    ...TYPE_NAME_VALUES[variant],
  ]);
}
