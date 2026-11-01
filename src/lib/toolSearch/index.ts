/**
 * The search texts of every served tool, beside its `description`: what a
 * consumer's tool search indexes. `keywords` are for lexical search (BM25):
 * the terms, synonyms and object kinds users ask with. `semantic` is for
 * vector search: one or two natural sentences of what a user wants when the
 * tool is the answer. `description` stays what `tools/list` serves for the
 * model's choice.
 *
 * The table is `tools/tool-search.json` at the package root (shipped, see
 * `package.json` `files`), three levels above this module both in `src` and
 * in `dist`, loaded by a `require` of that place written as a literal so a
 * bundler carries it inside.
 *
 * **Words that name a member.** A tool whose `object_type` (or
 * `target_type`) picks the member groups, under `members`, the keywords that
 * name each member, and its `semantic` may list the objects it works on as
 * items, each naming its member: `{ before, items: [{ member?, text }], join,
 * after }`, read `before` + the items (`A, B or C`, `join` `and` or `or`) +
 * `after`. Given the members a variant offers, a keyword grouped under
 * another member and an item naming one are left out
 * ({@link toolSearchText}); without, every word stays.
 */

import '../instance.js';

/** The search texts of one tool. */
export interface ToolSearchText {
  /** For lexical search (BM25): the terms, synonyms and object kinds users ask with. */
  readonly keywords: readonly string[];
  /** For vector search: what a user wants when this tool is the answer. */
  readonly semantic: string;
}

/** The `_meta` key under which `tools/list` carries a tool's search texts. */
export const TOOL_SEARCH_META_KEY = 'mcp-abap-adt/search';

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
interface SearchEntry {
  readonly keywords: readonly string[];
  readonly semantic: string | SemanticList;
  /** Per member, the keywords that name it. */
  readonly members: ReadonlyMap<string, readonly string[]>;
}

/** The refusal of the table's text at `where`: the file is malformed. */
function malformed(where: string): Error {
  return new Error(`tools/tool-search.json: ${where} is malformed`);
}

/** `value` as a list of strings, or the refusal. */
function strings(value: unknown, where: string): readonly string[] {
  if (!Array.isArray(value)) throw malformed(where);
  return value.map((item) => {
    if (typeof item !== 'string') throw malformed(where);
    return item;
  });
}

/** `value[key]` as a string, or the refusal. */
function stringAt(value: object, key: string, where: string): string {
  const read: unknown = Reflect.get(value, key);
  if (typeof read !== 'string') throw malformed(`${where}.${key}`);
  return read;
}

/** A semantic list as the file states it, or the refusal. */
function semanticList(value: object, where: string): SemanticList {
  const join = stringAt(value, 'join', where);
  if (join !== 'and' && join !== 'or') throw malformed(`${where}.join`);
  const items: unknown = Reflect.get(value, 'items');
  if (!Array.isArray(items)) throw malformed(`${where}.items`);
  return {
    before: stringAt(value, 'before', where),
    items: items.map((item: unknown, index) => {
      const at = `${where}.items[${index}]`;
      if (typeof item !== 'object' || item === null) throw malformed(at);
      const member: unknown = Reflect.get(item, 'member');
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
function semanticOf(value: unknown, where: string): string | SemanticList {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) throw malformed(where);
  return semanticList(value, where);
}

/** One entry as the file states it, or the refusal. */
function entryOf(name: string, value: unknown): SearchEntry {
  if (typeof value !== 'object' || value === null) throw malformed(name);
  const groups: unknown = Reflect.get(value, 'members');
  if (groups !== undefined && (typeof groups !== 'object' || groups === null)) {
    throw malformed(`${name}.members`);
  }
  return {
    keywords: strings(Reflect.get(value, 'keywords'), `${name}.keywords`),
    semantic: semanticOf(Reflect.get(value, 'semantic'), `${name}.semantic`),
    members: new Map(
      Object.entries(groups ?? {}).map(([member, words]) => [
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
function rendered(
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

let entries: ReadonlyMap<string, SearchEntry> | undefined;
let table: ReadonlyMap<string, ToolSearchText> | undefined;

/** Every entry of the table, by tool name, in name order. */
function searchEntries(): ReadonlyMap<string, SearchEntry> {
  if (entries === undefined) {
    const file: unknown = require('../../../tools/tool-search.json');
    if (typeof file !== 'object' || file === null) {
      throw malformed('the table');
    }
    entries = new Map(
      Object.entries(file).map(([name, value]) => [name, entryOf(name, value)]),
    );
  }
  return entries;
}

/** Every tool's search texts, by tool name, in name order. */
export function toolSearchTexts(): ReadonlyMap<string, ToolSearchText> {
  if (table === undefined) {
    const byName = new Map<string, ToolSearchText>();
    for (const [name, entry] of searchEntries()) {
      byName.set(name, rendered(entry, undefined));
    }
    table = byName;
  }
  return table;
}

/**
 * The search texts of the tool named `name`, or `undefined` for a tool not
 * in the table. With `offered`, the members the tool offers on its variant:
 * the words that name another member are left out.
 */
export function toolSearchText(
  name: string,
  offered?: readonly string[],
): ToolSearchText | undefined {
  if (offered === undefined) return toolSearchTexts().get(name);
  const entry = searchEntries().get(name);
  return entry === undefined ? undefined : rendered(entry, offered);
}
