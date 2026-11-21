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
 * bundler carries it inside. An entry's format, and how its words follow
 * the members a variant offers: `./searchEntry.ts`.
 */

import { jsonOf } from '../json';
import {
  entryOf,
  malformed,
  membersOf,
  rendered,
  type SearchEntry,
  type ToolSearchText,
} from './searchEntry';
import '../instance.js';

export type { ToolSearchText } from './searchEntry';

/** The `_meta` key under which `tools/list` carries a tool's search texts. */
export const TOOL_SEARCH_META_KEY = 'mcp-abap-adt/search';

let entries: ReadonlyMap<string, SearchEntry> | undefined;
let table: ReadonlyMap<string, ToolSearchText> | undefined;

/** Every entry of the table, by tool name, in name order. */
function searchEntries(): ReadonlyMap<string, SearchEntry> {
  if (entries === undefined) {
    // The table, checked once as JSON: typed from here on.
    const file = jsonOf(require('../../../tools/tool-search.json'));
    if (file === undefined || typeof file !== 'object' || file === null) {
      throw malformed('the table');
    }
    entries = new Map(
      membersOf(file).map(([name, value]) => [name, entryOf(name, value)]),
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
