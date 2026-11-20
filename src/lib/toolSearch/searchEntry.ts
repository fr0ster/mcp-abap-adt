/**
 * One entry of `tools/tool-search.json`, parsed once from its JSON
 * ({@link entryOf}), and its search texts for the members a variant offers
 * ({@link rendered}).
 *
 * **Words that name a member.** A tool whose `object_type` (or
 * `target_type`) picks the member groups, under `members`, the keywords that
 * name each member, and its `semantic` may list the objects it works on as
 * items, each naming its member: `{ before, items: [{ member?, text }], join,
 * after }`, read `before` + the items (`A, B or C`, `join` `and` or `or`) +
 * `after`. Given the members a variant offers, a keyword grouped under
 * another member and an item naming one are left out; without, every
 * word stays.
 */

import { isJsonObject, type JsonValue, jsonAt } from '../json';

/** The search texts of one tool. */
export interface ToolSearchText {
  /** For lexical search (BM25): the terms, synonyms and object kinds users ask with. */
  readonly keywords: readonly string[];
  /** For vector search: what a user wants when this tool is the answer. */
  readonly semantic: string;
}

/** One item of a semantic list: its words, and the member they name. */
interface SemanticItem {
  readonly member: string | undefined;
  readonly text: string;
}

/** A semantic sentence that lists the objects a tool works on. */
interface SemanticList {
  readonly before: string;
  readonly items: readonly SemanticItem[];
  readonly join: 'and' | 'or';
  readonly after: string;
}

/** One entry of the table, as the file states it. */
export interface SearchEntry {
  readonly keywords: readonly string[];
  readonly semantic: string | SemanticList;
  /** Per member, the keywords that name it. */
  readonly members: ReadonlyMap<string, readonly string[]>;
}

/** The refusal of the table's text at `where`: the file is malformed. */
export function malformed(where: string): Error {
  return new Error(`tools/tool-search.json: ${where} is malformed`);
}

/** `value` as a list of strings, or the refusal. */
function strings(
  value: JsonValue | undefined,
  where: string,
): readonly string[] {
  if (!Array.isArray(value)) throw malformed(where);
  return value.map((item) => {
    if (typeof item !== 'string') throw malformed(where);
    return item;
  });
}

/** `value[key]` as a string, or the refusal. */
function stringAt(value: JsonValue, key: string, where: string): string {
  const read = jsonAt(value, key);
  if (typeof read !== 'string') throw malformed(`${where}.${key}`);
  return read;
}

/** The members of an object, in their order; none for a list. */
export function membersOf(value: JsonValue | undefined): [string, JsonValue][] {
  return value !== undefined && isJsonObject(value)
    ? Object.entries(value)
    : [];
}

/** A semantic list as the file states it, or the refusal. */
function semanticList(value: JsonValue, where: string): SemanticList {
  const join = stringAt(value, 'join', where);
  if (join !== 'and' && join !== 'or') throw malformed(`${where}.join`);
  const items = jsonAt(value, 'items');
  if (!Array.isArray(items)) throw malformed(`${where}.items`);
  return {
    before: stringAt(value, 'before', where),
    items: items.map((item, index) => {
      const at = `${where}.items[${index}]`;
      if (typeof item !== 'object' || item === null) throw malformed(at);
      const member = jsonAt(item, 'member');
      if (member !== undefined && typeof member !== 'string') {
        throw malformed(`${at}.member`);
      }
      return { member, text: stringAt(item, 'text', at) };
    }),
    join,
    after: stringAt(value, 'after', where),
  };
}

/** The semantic text as the file states it, or the refusal. */
function semanticOf(
  value: JsonValue | undefined,
  where: string,
): string | SemanticList {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) throw malformed(where);
  return semanticList(value, where);
}

/** One entry as the file states it, or the refusal. */
export function entryOf(name: string, value: JsonValue): SearchEntry {
  if (typeof value !== 'object' || value === null) throw malformed(name);
  const groups = jsonAt(value, 'members');
  if (groups !== undefined && (typeof groups !== 'object' || groups === null)) {
    throw malformed(`${name}.members`);
  }
  return {
    keywords: strings(jsonAt(value, 'keywords'), `${name}.keywords`),
    semantic: semanticOf(jsonAt(value, 'semantic'), `${name}.semantic`),
    members: new Map(
      membersOf(groups).map(([member, words]) => [
        member,
        strings(words, `${name}.members.${member}`),
      ]),
    ),
  };
}

/** `A, B and C` / `A, B or C`. */
function joined(texts: readonly string[], join: 'and' | 'or'): string {
  if (texts.length <= 1) return texts.join('');
  return `${texts.slice(0, -1).join(', ')} ${join} ${texts[texts.length - 1]}`;
}

/**
 * The texts of `entry` for a variant offering `offered` (every member when
 * absent): a keyword grouped under a member not offered, and a semantic item
 * naming one, left out.
 */
export function rendered(
  entry: SearchEntry,
  offered: readonly string[] | undefined,
): ToolSearchText {
  const keeps = (member: string | undefined) =>
    member === undefined || offered === undefined || offered.includes(member);
  const dropped = new Set(
    [...entry.members]
      .filter(([member]) => !keeps(member))
      .flatMap(([, words]) => words),
  );
  const { semantic } = entry;
  return Object.freeze({
    keywords: Object.freeze(
      entry.keywords.filter((keyword) => !dropped.has(keyword)),
    ),
    semantic:
      typeof semantic === 'string'
        ? semantic
        : `${semantic.before}${joined(
            semantic.items
              .filter((item) => keeps(item.member))
              .map((item) => item.text),
            semantic.join,
          )}${semantic.after}`,
  });
}
