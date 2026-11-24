/**
 * A tool's purpose: one sentence of what the tool does, the description's
 * main part and its only free text. Made only by {@link purpose}; the purpose
 * test (`src/__tests__/unit/descriptions/purpose.test.ts`) holds every
 * registered purpose to its rules (one sentence, its length, no word of the
 * answer's form or of how the tool works).
 *
 * Each object a purpose names carries its SAP object type beside it, the
 * type ADT gives it (owner): `an ABAP class (CLAS)`, `a CDS view (DDLS)`.
 * {@link withTypeCodes} writes them, from {@link TYPE_CODES} alone.
 */

/** Only this module mints a purpose. */
const minted: unique symbol = Symbol('purpose');

/** A tool's purpose sentence; only {@link purpose} makes one. */
export interface Purpose {
  readonly [minted]: true;
  readonly text: string;
  /**
   * The object types the sentence names, as generated from a compact tool's
   * schema enum: not free text, so the length rule counts them as one word.
   */
  readonly types?: string | undefined;
}

import type { AdtMainType } from '@mcp-abap-adt/interfaces-adt';

/**
 * Each object noun a purpose may name, with the main type of its ADT object
 * type, as the owner's examples name them (`CLAS`, `TABL`): a function
 * module and a function group are both `FUGR`, an include and a program
 * `PROG`, a structure and a table `TABL`. A behavior implementation is the
 * class ADT serves it as (`CLAS/OC`): no table of ADT types holds a `BIMP`.
 * Matched longest first; a report is a program, a behavior implementation
 * class a behavior implementation (`SAME_OBJECT`).
 */
const TYPE_CODES: ReadonlyArray<readonly [string, AdtMainType]> = [
  ['behavior implementation class', 'CLAS'],
  ['enhancement implementation', 'ENHO'],
  ['behavior implementation', 'CLAS'],
  ['behavior definition', 'BDEF'],
  ['metadata extension', 'DDLX'],
  ['service definition', 'SRVD'],
  ['enhancement spot', 'ENHS'],
  ['service binding', 'SRVB'],
  ['function module', 'FUGR'],
  ['function group', 'FUGR'],
  ['message class', 'MSAG'],
  ['data element', 'DTEL'],
  ['table type', 'TTYP'],
  ['interface', 'INTF'],
  ['structure', 'TABL'],
  ['CDS view', 'DDLS'],
  ['program', 'PROG'],
  ['package', 'DEVC'],
  ['include', 'PROG'],
  ['report', 'PROG'],
  ['domain', 'DOMA'],
  ['class', 'CLAS'],
  ['table', 'TABL'],
];

/** Words before a noun that make it another thing: a test class, a value table. */
const NOT_THE_OBJECT: readonly string[] = [
  'test ',
  'local ',
  'value ',
  'trace ',
  'super ',
  'top ',
  'ddl ',
  'that ',
  'which ',
  'object ',
  'node ',
  'internal ',
  'exception ',
  "object's ",
  'delivery ',
  'data ',
  'amdp ',
  'through their ',
];

function isWordCharacter(character: string): boolean {
  const lower = character.toLowerCase();
  return (
    (lower >= 'a' && lower <= 'z') ||
    (character >= '0' && character <= '9') ||
    character === '_' ||
    character === '-'
  );
}

/** The end of `phrase` at `at` as a noun, its plural taken in; -1 when it is no noun there. */
function nounEnd(text: string, phrase: string, at: number): number {
  if (at > 0 && isWordCharacter(text.charAt(at - 1))) return -1;
  let end = at + phrase.length;
  if (text.startsWith('es', end) && phrase.endsWith('s')) end += 2;
  else if (text.startsWith('s', end)) end += 1;
  const after = text.charAt(end);
  if (after !== '' && isWordCharacter(after)) return -1;
  // A possessive or a code already written leaves the noun as it is.
  if (after === "'" || text.startsWith(' (', end)) return -1;
  const before = text.slice(0, at).toLowerCase();
  const another = NOT_THE_OBJECT.some(
    (word) =>
      before.endsWith(word) &&
      !isWordCharacter(before.charAt(before.length - word.length - 1)),
  );
  if (another) return -1;
  return end;
}

/** Nouns that name one object: the first naming alone carries the code. */
const SAME_OBJECT: Readonly<Record<string, string>> = {
  report: 'program',
  'behavior implementation class': 'behavior implementation',
};

/**
 * The code of `phrase` ending at `end`: an include of a function group (its
 * clause names one: `an include of an ABAP function group`) is the group's
 * include, `FUGR/I`, of main type FUGR; any other `code`.
 */
function codeIn(
  text: string,
  phrase: string,
  end: number,
  code: AdtMainType,
): AdtMainType {
  if (phrase !== 'include') return code;
  const rest = text.slice(end);
  const clause = rest.slice(
    0,
    Math.min(
      ...[',', '.', ':'].map((stop) => {
        const at = rest.indexOf(stop);
        return at < 0 ? rest.length : at;
      }),
    ),
  );
  return clause.includes('function group') ? 'FUGR' : code;
}

/**
 * `text` with each object's type code after its first naming as a noun: the
 * longest noun first, a shorter noun never inside a longer one, each object
 * once.
 */
export function withTypeCodes(text: string): string {
  const taken: Array<readonly [number, number, string]> = [];
  const coded = new Set<string>();
  for (const [phrase, code] of TYPE_CODES) {
    const object = SAME_OBJECT[phrase] ?? phrase;
    if (coded.has(object)) continue;
    for (let at = text.indexOf(phrase); at >= 0; ) {
      const end = nounEnd(text, phrase, at);
      const inside = taken.some(
        ([start, stop]) => at < stop && at + phrase.length > start,
      );
      if (end >= 0 && !inside) {
        taken.push([at, end, codeIn(text, phrase, end, code)]);
        coded.add(object);
        break;
      }
      at = text.indexOf(phrase, at + 1);
    }
  }
  let out = text;
  for (const [, end, code] of [...taken].sort((a, b) => b[1] - a[1])) {
    out = `${out.slice(0, end)} (${code})${out.slice(end)}`;
  }
  return out;
}

/** The type codes `withTypeCodes` wrote into `text`: outside the length rule. */
export function typeCodesIn(text: string): string {
  return TYPE_CODES.map(([, code]) => ` (${code})`)
    .filter((code, i, all) => all.indexOf(code) === i)
    .map((code) => code.repeat(text.split(code).length - 1))
    .join('');
}

/** The purpose sentence of a tool: what it does, in domain words, each object with its type code. */
export function purpose(text: string): Purpose {
  return { [minted]: true, text: withTypeCodes(text) };
}

/** `word` with its article: `a class`, `an include`; `the …` as it is. */
export function withArticle(word: string): string {
  if (word.startsWith('the ')) return word;
  return `${'aeiou'.includes(word.charAt(0).toLowerCase()) ? 'an' : 'a'} ${word}`;
}

/**
 * A compact tool's purpose built from its action and object pairs, one per
 * object type, action or part its schema takes (owner): `Locks or unlocks a
 * class (CLAS), locks or unlocks a program (PROG), … for editing.` — each
 * pair's object with its type code, the pairs joined,
 * the first capitalised, then `after`. The pairs are generated from the
 * schema, so the length rule counts them as one word.
 */
export function pairsPurpose(pairs: readonly string[], after = '.'): Purpose {
  const joined = pairs.map(withTypeCodes).join(', ');
  const text = `${joined.charAt(0).toUpperCase()}${joined.slice(1)}${after}`;
  return { [minted]: true, text, types: joined };
}
