/**
 * The repository search's type filter (#329, spec 3.6): the names of the
 * release's object types list (`ADT_SEARCH_TYPES_ONPREM`,
 * `ADT_SEARCH_TYPES_CLOUD`), not the type codes. A name selects what the
 * list says of it — a main type (`DEVC`), an alias of one subtype (`STRU`:
 * `TABL/DS` only) or a group (`ABAP_TEST_COCKPIT`); a code is no filter
 * value (one that is no list item's `type` widens or empties the search
 * silently, measured).
 *
 * **How a code stands for a name.** The search reads a code equal to an
 * item's `type` as that item, and any other code as the text before its `/`
 * (measured on S/4HANA 2025 and ABAP cloud, 2026-10-29). So a code given to
 * the filter is read, from the tables, as the name the search would read it
 * as: the item whose `type` it is (`TABL/DS` → `STRU`, `FUGR/FF` → `FUNC`,
 * `DEVC/K` → `DEVC`) — where two items list it (`PROG/P`: `PROG` and
 * `REPO`), the one that is its main type —, else the main type its entry in
 * the type tables states (`main`; `ENHO/XHH` → `ENHO`) when that is a name of
 * the list. Any other text is refused, and nothing is sent.
 */
import {
  ADT_SEARCH_TYPES_CLOUD,
  ADT_SEARCH_TYPES_ONPREM,
  type AdtListedSearchType,
  type AdtSearchTypeOf,
} from '@mcp-abap-adt/interfaces-adt';
import type { ProjectionVariant } from './adtProjections';
import { mainOfCode } from './adtTypeCode';

/** A search type table of a release with a list: its names and what each selects. */
type ListedSearchTypes<N extends string> = {
  readonly [K in N]: AdtListedSearchType<string>;
};

/**
 * The reader of `table`'s filter values: a text, already upper-cased, as the
 * name of `table` it is or stands for ({@link searchNameOf}).
 */
function searchNamesOf<N extends string>(table: ListedSearchTypes<N>) {
  const names = Object.keys(table).filter((key): key is N =>
    Object.hasOwn(table, key),
  );
  const byType = new Map<string, N[]>();
  for (const name of names) {
    const { type } = table[name];
    if (type !== undefined)
      byType.set(type, [...(byType.get(type) ?? []), name]);
  }
  return (upper: string): N | undefined => {
    const name = names.find((listed) => listed === upper);
    if (name !== undefined) return name;
    const main = mainOfCode(upper);
    const [only, ...more] = byType.get(upper) ?? [];
    if (only !== undefined) {
      return more.length === 0
        ? only
        : [only, ...more].find((listed) => listed === main);
    }
    return names.find((listed) => listed === main);
  };
}

/** Each variant's reader of the search filter ({@link searchNameOf}). */
const SEARCH_NAMES = {
  onprem: searchNamesOf(ADT_SEARCH_TYPES_ONPREM),
  cloud: searchNamesOf(ADT_SEARCH_TYPES_CLOUD),
} as const satisfies Readonly<Record<ProjectionVariant, unknown>>;

/**
 * The search name of the variant's object types list `text` names, either
 * case, upper-cased once: the name itself, or the name a code stands for
 * (see the module comment); `undefined` for any other text.
 */
export function searchNameOf(
  variant: 'onprem',
  text: string,
): AdtSearchTypeOf<'onprem'> | undefined;
export function searchNameOf(
  variant: 'cloud',
  text: string,
): AdtSearchTypeOf<'cloud'> | undefined;
export function searchNameOf(variant: ProjectionVariant, text: string) {
  return SEARCH_NAMES[variant](text.toUpperCase());
}

/** What a search type argument takes, for its description. */
export const SEARCH_TYPE_DESCRIPTION =
  "Optional: restrict the search to one type, either case: a name of the system's object types list — a main type (e.g. CLAS, DEVC, TABL), an alias of one subtype (e.g. STRU for structures, DTAB for database tables, FUNC for function modules) or a group — or an ADT type code, which stands for the name that selects it (e.g. TABL/DS for STRU, FUGR/FF for FUNC, ENHO/XHH for ENHO).";

/** The refusal of a search type argument {@link searchNameOf} does not read. */
export function notASearchType(argument: string, text: string): string {
  return `${argument} "${text}" is neither a name of this system's object types list nor an ADT type code standing for one: it takes the search names (e.g. CLAS, DEVC, STRU); nothing was sent`;
}
