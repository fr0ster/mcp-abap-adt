import { answeredObject } from '@mcp-abap-adt/adt-strategies';
import {
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
  type AdtApiTable,
  type AdtTypeCode,
  type AdtUtilityCode,
  type IAdtCodedReference,
} from '@mcp-abap-adt/interfaces-adt';
import {
  ACTIVATION_CODES,
  ACTIVATION_NAMES,
  codesWithNames,
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

/** The tables of the variants the server serves, read as the entry shape they satisfy. */
const API_TABLES: readonly AdtApiTable<string>[] = [
  ADT_TYPES_ONPREM,
  ADT_TYPES_CLOUD,
];

/**
 * The main type each code entry of the tables states (`main`, interfaces-adt
 * 24): nothing is cut from a code's text. A code no table holds (a
 * group-only code, `VIEW/DV`) has none.
 */
const MAIN_OF_CODE: ReadonlyMap<string, string> = new Map(
  API_TABLES.flatMap((table) =>
    Object.values(table).flatMap((entry) =>
      entry === undefined
        ? []
        : Object.entries(entry.codes).map(([code, facts]): [string, string] => [
            code,
            facts.main,
          ]),
    ),
  ),
);

/** The main type the tables state for `code` (`main`), else `undefined`. */
export function mainOfCode(code: string): string | undefined {
  return MAIN_OF_CODE.get(code);
}

/**
 * The codes of the tables whose entry names a parent API (`parent`: the
 * function group of `FUGR/FF` and `FUGR/I`): a reference to one names its
 * parent (`IAdtCodedReference`).
 */
const PARENTED_CODES: ReadonlySet<string> = new Set(
  API_TABLES.flatMap((table) =>
    Object.values(table).flatMap((entry) =>
      entry === undefined
        ? []
        : Object.entries(entry.codes)
            .filter(([, facts]) => facts.parent !== null)
            .map(([code]) => code),
    ),
  ),
);

/**
 * The codes of `codes` whose reference names its parent
 * ({@link PARENTED_CODES}): those a tool taking them lets its caller name
 * the parent for.
 */
export function parentedCodesOf<C extends AdtUtilityCode>(
  codes: readonly C[],
): C[] {
  return codes.filter((code) => PARENTED_CODES.has(code));
}

/**
 * What a `parentName` argument beside an activation's object type says on
 * `variant`: the codes of a group activation that need it
 * ({@link parentedCodesOf}), each with the names standing for it — each a
 * part of a function group (the tables' `parent`).
 */
export function activationParentDescription(
  variant: ProjectionVariant,
): string {
  return `The function group the object belongs to; its address is built from it. Required for ${codesWithNames(parentedCodesOf(ACTIVATION_CODES[variant]), ACTIVATION_NAMES[variant])}.`;
}

/** One object of a group request, as a tool's argument names it. */
export interface GroupObject<C extends AdtUtilityCode> {
  name: string;
  type: C;
  uri?: string;
  parentName?: string;
}

/**
 * Whether `object` is a reference a group request takes
 * (`IAdtCodedReference`): it names its parent, or its code has none
 * ({@link PARENTED_CODES}). `parentName` is the caller's argument, checked
 * here because the compiler cannot see it.
 */
export function namesItsParent<C extends AdtUtilityCode>(
  object: GroupObject<C>,
): object is GroupObject<C> & IAdtCodedReference<C> {
  return object.parentName !== undefined || !PARENTED_CODES.has(object.type);
}

/**
 * The codes of `codes` whose main type `upper` (already upper-cased) names:
 * those whose entry states it as `main` ({@link MAIN_OF_CODE}). A code
 * whose main type is itself (`AUTH`) is named as a code.
 */
function codesOfMain<C extends AdtUtilityCode>(
  upper: string,
  codes: readonly C[],
): C[] {
  return codes.filter(
    (code) => code !== upper && MAIN_OF_CODE.get(code) === upper,
  );
}

/** The one code of `codes` whose main type `upper` names, else `undefined`. */
function oneCodeOfMain<C extends AdtUtilityCode>(
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
export function mainTypeCodeOf<C extends AdtUtilityCode>(
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
export function acceptedCodeOf<C extends AdtUtilityCode, N extends TypeName>(
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
  codes: readonly AdtUtilityCode[],
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
  codes: readonly AdtUtilityCode[],
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
