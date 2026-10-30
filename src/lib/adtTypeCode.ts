import { answeredObject } from '@mcp-abap-adt/adt-strategies';
import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';
import { TYPE_NAMES as TYPE_NAME_CODES } from './adtProjections';

/**
 * A type-code argument as a code of the ADT type tables: the text, upper-cased
 * once, looked up against the tables (`answeredObject`); `undefined` for any
 * other text — a friendly name, a bare main type, a code no table holds.
 *
 * A tool argument comes from outside the type system, so this is where it is
 * checked; past it the code is typed by the tables.
 */
export function tableCodeOf(text: string): AdtTypeCode | undefined {
  return answeredObject(text.toUpperCase()).type;
}

/** The fixed words a type argument that is no code of the tables is refused in. */
export function notATableCode(argument: string, text: string): string {
  return `${argument} "${text}" is not an ADT type code (such as CLAS/OC or DEVC/K); nothing was sent`;
}

/**
 * The names the tools have always taken for a type, each with its code
 * (`TYPE_NAMES`, `adtProjections.ts`, where each operation's names are
 * projected from them), read by any name.
 */
const TYPE_NAMES: Readonly<Record<string, AdtTypeCode>> = TYPE_NAME_CODES;

/**
 * A type argument as a code of the tables: one of the names the tools have
 * always taken ({@link TYPE_NAMES}, either case), else {@link tableCodeOf}.
 */
export function typeCodeOf(text: string): AdtTypeCode | undefined {
  return Object.hasOwn(TYPE_NAMES, text.toLowerCase())
    ? TYPE_NAMES[text.toLowerCase()]
    : tableCodeOf(text);
}
