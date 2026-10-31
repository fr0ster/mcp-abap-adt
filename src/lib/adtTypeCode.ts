import { answeredObject } from '@mcp-abap-adt/adt-strategies';
import {
  ADT_SEARCH_TYPES_CLOUD,
  ADT_SEARCH_TYPES_ONPREM,
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
  ADT_UTILITY_CODES_CLOUD,
  ADT_UTILITY_CODES_ONPREM,
  type AdtApiTable,
  type AdtListedSearchType,
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

/** The search type lists of the variants the server serves, read as name → item. */
const SEARCH_LISTS: readonly Readonly<
  Record<string, AdtListedSearchType<string>>
>[] = [ADT_SEARCH_TYPES_ONPREM, ADT_SEARCH_TYPES_CLOUD];

/**
 * Each search name of the lists with the item types it lists (`type`; a
 * group lists none): what an upper-case search name stands for where an
 * argument takes codes ({@link acceptedCodeOf}).
 */
const SEARCH_ITEM_TYPES: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const types = new Map<string, Set<string>>();
  for (const list of SEARCH_LISTS) {
    for (const [name, item] of Object.entries(list)) {
      const listed = types.get(name) ?? new Set<string>();
      if (item.type !== undefined) listed.add(item.type);
      types.set(name, listed);
    }
  }
  return types;
})();

/**
 * Every word of the tables' type vocabulary: each code of the API and
 * utility tables, each main type they state, each search name of the
 * object types lists. All are written in upper case.
 */
const TYPE_VOCABULARY: ReadonlySet<string> = new Set([
  ...MAIN_OF_CODE.keys(),
  ...MAIN_OF_CODE.values(),
  ...Object.keys(ADT_UTILITY_CODES_ONPREM),
  ...Object.keys(ADT_UTILITY_CODES_CLOUD),
  ...SEARCH_ITEM_TYPES.keys(),
]);

/**
 * Whether `text` is written in upper case — it has letters, and none is
 * lower case. The owner's rule (#329): a value in lower case is a friendly
 * name; a value in upper case is a code, a main type or a search name.
 */
function writtenUpper(text: string): boolean {
  return text === text.toUpperCase() && text !== text.toLowerCase();
}

/**
 * The friendly name of `names` that `text` names, by its case: a value in
 * upper case that is a word of the tables' vocabulary ({@link
 * TYPE_VOCABULARY}: `VIEW`, `STRU`, `FUNC`, …) is that word, never a name;
 * any other value is matched against `names` in either case (`class`,
 * `Class` and `CLASS` alike, since `CLASS` is no word of the vocabulary;
 * `View` is `view`). The one place a friendly name is read: every argument
 * that takes one reads it here.
 */
export function friendlyNameOf<N extends string>(
  text: string,
  names: readonly N[],
): N | undefined {
  const upper = text.toUpperCase();
  return writtenUpper(text) && TYPE_VOCABULARY.has(upper)
    ? undefined
    : valueNamed(upper, names);
}

/**
 * The one code of `codes` the search name `upper` stands for: the item
 * type its list states (`VIEW` → `VIEW/DV`, `STRU` → `TABL/DS`, `FUNC` →
 * `FUGR/FF`); `undefined` when the name lists none of `codes`, or two.
 */
function codeOfSearchName<C extends AdtUtilityCode>(
  upper: string,
  codes: readonly C[],
): C | undefined {
  const types = SEARCH_ITEM_TYPES.get(upper);
  if (types === undefined) return undefined;
  const [one, ...more] = codes.filter((code) => types.has(code));
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
 * standing for one, by the value's case (the owner's rule, #329):
 *
 * - a code of `codes`, either case, is that code;
 * - a value in upper case is then a main type — the one code of `codes`
 *   whose main type it is (a main type two codes share is refused) — else a
 *   search name, the one code of `codes` its list item states (`VIEW` →
 *   `VIEW/DV`, `STRU` → `TABL/DS`);
 * - a friendly name of `names` ({@link friendlyNameOf}: `view` → `DDLS/DF`)
 *   is its code (`TYPE_NAMES`) — in upper case only when it is no word of
 *   the tables (`CLASS`), so `VIEW` is never `view`;
 * - a value not in upper case is then a main type of one code (`clas`).
 *
 * `undefined` for any other text.
 */
export function acceptedCodeOf<C extends AdtUtilityCode, N extends TypeName>(
  text: string,
  codes: readonly C[],
  names: readonly N[],
): C | (typeof TYPE_NAMES)[N] | undefined {
  const upper = text.toUpperCase();
  const code = valueNamed(upper, codes);
  if (code !== undefined) return code;
  if (writtenUpper(text)) {
    const [main, ...shared] = codesOfMain(upper, codes);
    if (main !== undefined) return shared.length === 0 ? main : undefined;
    const searched = codeOfSearchName(upper, codes);
    if (searched !== undefined) return searched;
  }
  const name = friendlyNameOf(text, names);
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
