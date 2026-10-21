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

let table: ReadonlyMap<string, ToolSearchText> | undefined;

/** Every tool's search texts, by tool name, in name order. */
export function toolSearchTexts(): ReadonlyMap<string, ToolSearchText> {
  if (table === undefined) {
    const entries = require('../../../tools/tool-search.json') as Record<
      string,
      ToolSearchText
    >;
    const byName = new Map<string, ToolSearchText>();
    for (const [name, text] of Object.entries(entries)) {
      byName.set(
        name,
        Object.freeze({
          keywords: Object.freeze([...text.keywords]),
          semantic: text.semantic,
        }),
      );
    }
    table = byName;
  }
  return table;
}

/** The search texts of the tool named `name`, or `undefined` for a tool not in the table. */
export function toolSearchText(name: string): ToolSearchText | undefined {
  return toolSearchTexts().get(name);
}
